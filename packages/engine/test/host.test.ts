import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMERS, IllegalAction, checkInvariants, createHost, createRng, defaultBid, hostAct, hostContinue, hostReady,
  hostNextDeadlineMs, hostRunBots, hostRunToEnd, hostSetController, hostTick, hostView, playedRounds, randomViewBot,
  type Action, type Controller, type HostState, type MatchConfig,
} from '../src';

const cfg = (over: Partial<MatchConfig> = {}, timers: Partial<MatchConfig['timers']> = {}): MatchConfig => ({
  regularPlayers: 4, dummies: 0, winCondition: { kind: 'rounds', rounds: 2 }, failSafeMinutes: null,
  infiniteContra: false, timers: { ...DEFAULT_TIMERS, ...timers }, ...over,
});
const humans = (n: number): Controller[] => Array.from({ length: n }, () => 'human' as const);
const bots = (n: number): Controller[] => Array.from({ length: n }, () => 'bot' as const);
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const rng = () => createRng(1);
const botFor = () => randomViewBot;

const bid = (contract: Parameters<typeof defaultBid>[0]): Action => ({ type: 'bid', bid: defaultBid(contract) });
const pass: Action = { type: 'pass' };
const noContra: Action = { type: 'noContra' };
const noDeclare: Action = { type: 'declare', bonuses: [], valat: false };
const readyAll = (h: HostState) => h.controllers.reduce((s, _, p) => (s.stage === 'viewing' && s.controllers[p] === 'human' && s.match.participantKinds[p] === 'player' && s.match.table.includes(p) ? hostReady(s, p) : s), h);
const acts = (h: HostState, steps: [number, Action][]) => steps.reduce((s, [p, a]) => hostAct(s, p, a), h);

describe('autopilot', () => {
  it('bots play whole matches for 2, 3, 4 and 6 players', () => {
    for (const [regularPlayers, dummies] of [[2, 2], [3, 1], [4, 0], [6, 0]] as const) {
      const h = hostRunToEnd(createHost(cfg({ regularPlayers, dummies }), 5, bots(regularPlayers > 4 ? regularPlayers : 4)), botFor, rng());
      expect(h.stage).toBe('finished');
      expect(playedRounds(h.match)).toBe(2);
      expect(sum(h.match.standings)).toBe(0);
    }
  });
});

describe('card viewing', () => {
  it('waits for the humans: ready button or the 3-minute timer', () => {
    let h = createHost(cfg(), 1, ['human', 'bot', 'bot', 'bot']);
    expect(h.stage).toBe('viewing');
    expect(hostRunBots(h, botFor, rng()).stage).toBe('viewing');
    expect(() => hostAct(h, 0, pass)).toThrow(IllegalAction);
    expect(hostView(h, 0).timers.viewMsLeft).toBe(180_000);
    h = hostTick(h, 179_999, rng());
    expect(h.stage).toBe('viewing');
    expect(hostTick(h, 1, rng()).stage).toBe('playing');
    expect(hostReady(h, 0).stage).toBe('playing');
  });

  it('is skipped without humans or with the timer off', () => {
    expect(createHost(cfg(), 1, bots(4)).stage).toBe('playing');
    expect(createHost(cfg({}, { viewSeconds: null }), 1, humans(4)).stage).toBe('playing');
  });

  it('a human handing over to a bot does not stall the table', () => {
    let h = createHost(cfg(), 1, ['human', 'human', 'bot', 'bot']);
    h = hostReady(h, 0);
    expect(h.stage).toBe('viewing');
    expect(hostSetController(h, 1, 'bot').stage).toBe('playing');
  });
});

describe('licitation clock', () => {
  it('20 seconds per decision, then the default action (pass)', () => {
    let h = readyAll(createHost(cfg(), 2, humans(4)));
    expect(h.stage).toBe('playing');
    h = hostTick(h, 19_999, rng());
    expect(h.match.round.toAct).toHaveLength(4);
    expect(hostView(h, 0).timers.decisionMsLeft).toBe(1);
    h = hostTick(h, 1, rng());
    expect(h.match.round.toAct).toHaveLength(3);
    h = hostTick(h, 3 * 20_000, rng());
    expect(h.match.round.contract).toBe('trischaken'); // everybody timed out with a pass
  });

  it('an action resets the decision clock', () => {
    let h = readyAll(createHost(cfg(), 2, humans(4)));
    h = hostTick(h, 15_000, rng());
    h = hostAct(h, 0, pass);
    expect(hostView(h, 1).timers.decisionMsLeft).toBe(20_000);
  });

  it('bots are never timed', () => {
    const h = hostTick(createHost(cfg(), 2, bots(4)), 3_600_000, rng());
    expect(h.match.round.toAct).toHaveLength(4);
    expect(h.match.elapsedMs).toBe(3_600_000);
  });
});

describe('next deadline', () => {
  it('tells a server when to wake up next', () => {
    let h = createHost(cfg(), 2, humans(4));
    expect(hostNextDeadlineMs(h)).toBe(180_000);
    h = readyAll(h);
    expect(hostNextDeadlineMs(h)).toBe(20_000);
    h = hostTick(h, 5_000, rng());
    expect(hostNextDeadlineMs(h)).toBe(15_000);
    expect(hostNextDeadlineMs(createHost(cfg(), 2, bots(4)))).toBeNull();
    expect(hostNextDeadlineMs(createHost(cfg({ winCondition: { kind: 'timeLimit', minutes: 2 } }), 2, bots(4)))).toBe(120_000);
  });
});

describe('bank clock', () => {
  const toBank = (contract: 'dreier' | 'rufer', bankSeconds = 60) => {
    let h = readyAll(createHost(cfg({}, { bankSeconds }), 3, humans(4)));
    h = acts(h, [[0, bid(contract)], [1, pass], [2, pass], [3, pass], [0, { type: 'confirm' }], [0, noDeclare]]);
    if (h.match.round.phase === 'contra') h = acts(h, [[1, noContra], [2, noContra], [3, noContra]]);
    return h;
  };

  it('a 1v3 declarer with an empty bank forfeits', () => {
    let h = toBank('dreier');
    expect(h.match.round.phase).toBe('take');
    h = hostTick(h, 59_999, rng());
    expect(h.match.round.phase).toBe('take');
    h = hostTick(h, 1, rng());
    expect(h.stage).toBe('betweenRounds');
    expect(h.match.round.result?.kind).toBe('forfeit');
    expect(h.match.round.result?.deltas).toEqual([-12, 4, 4, 4]);
    expect(h.match.standings).toEqual([-12, 4, 4, 4]);
  });

  it('otherwise 10 seconds of grace, then a random legal move', () => {
    let h = toBank('rufer');
    expect(h.match.round.phase).toBe('kingCall');
    h = hostTick(h, 60_000, rng());
    expect(h.match.round.phase).toBe('kingCall');
    expect(hostView(h, 0).timers.graceMsLeft).toBe(10_000);
    h = hostTick(h, 9_999, rng());
    expect(h.match.round.phase).toBe('kingCall');
    h = hostTick(h, 1, rng());
    expect(h.match.round.phase).not.toBe('kingCall');
  });

  it('only the waiting player pays', () => {
    let h = toBank('dreier', 600);
    h = hostTick(h, 30_000, rng());
    expect(h.clocks.banksMs).toEqual([570_000, 600_000, 600_000, 600_000]);
  });
});

describe('match time limit', () => {
  it('finishes the current round, then the match ends', () => {
    let h = createHost(cfg({ winCondition: { kind: 'timeLimit', minutes: 1 } }), 4, bots(4));
    expect(hostView(h, 0).timers.matchMsLeft).toBe(60_000);
    h = hostTick(h, 61_000, rng());
    expect(h.stage).toBe('playing');
    expect(hostView(h, 0).endAfterRound).toBe(true);
    h = hostRunToEnd(h, botFor, rng());
    expect(h.match.history).toHaveLength(1);
    expect(h.stage).toBe('finished');
  });

  it('time running out between rounds ends the match at once', () => {
    let h = hostRunBots(createHost(cfg({ winCondition: { kind: 'rounds', rounds: 9 }, failSafeMinutes: 5 }), 4, bots(4)), botFor, rng());
    expect(h.stage).toBe('betweenRounds');
    h = hostTick(h, 5 * 60_000, rng());
    expect(h.stage).toBe('finished');
  });
});

describe('input checks and views', () => {
  it('rejects out-of-turn actions, forfeit, spectators and early continue', () => {
    const h = readyAll(createHost(cfg(), 6, humans(4)));
    expect(() => hostAct(h, 2, pass)).toThrow(IllegalAction);
    expect(() => hostAct(h, 0, { type: 'forfeit' })).toThrow(IllegalAction);
    expect(() => hostContinue(h)).toThrow(IllegalAction);
    const five = readyAll(createHost(cfg({ regularPlayers: 5 }), 6, humans(5)));
    expect(() => hostAct(five, 4, pass)).toThrow(IllegalAction);
  });

  it('a spectator sees no hands; players see only their own', () => {
    const h = readyAll(createHost(cfg({ regularPlayers: 5 }), 7, humans(5)));
    const spec = hostView(h, 4);
    expect(spec.seat).toBeNull();
    expect(spec.round.hands.every((x) => x === null)).toBe(true);
    expect(spec.legalActions).toEqual([]);
    expect(spec.standings).toHaveLength(5);
    const p0 = hostView(h, 0);
    expect(p0.round.hands[0]).not.toBeNull();
    expect(p0.round.hands[1]).toBeNull();
    expect(p0.legalActions.length).toBeGreaterThan(0);
    expect(hostView(h, 1).legalActions).toEqual([]);
  });

  it('the state is plain JSON and keeps working after a round trip', () => {
    const h = readyAll(createHost(cfg(), 8, ['human', 'bot', 'bot', 'bot']));
    const copy = JSON.parse(JSON.stringify(h)) as HostState;
    expect(copy).toEqual(h);
    expect(hostRunToEnd(hostSetController(copy, 0, 'bot'), botFor, rng()).stage).toBe('finished');
  });
});

describe('soak: random time and input never break the match', () => {
  it('humans act randomly, time jumps around, every invariant holds', () => {
    for (let g = 0; g < 40; g++) {
      const r = createRng(100 + g);
      const players = [2, 3, 4, 5][g % 4]!;
      const dummies = players === 2 ? 2 : players === 3 ? 1 : 0;
      const controllers: Controller[] = Array.from({ length: players === 5 ? 5 : 4 }, (_, i) => (r() < 0.6 ? 'human' : 'bot') as Controller);
      let h = createHost(
        cfg({ regularPlayers: players, dummies, winCondition: { kind: 'rounds', rounds: 3 } }, { bankSeconds: 40 }), 200 + g, controllers,
      );
      for (let i = 0; h.stage !== 'finished'; i++) {
        if (i > 20_000) throw new Error('match did not finish');
        if (h.stage === 'viewing') h = r() < 0.5 ? hostTick(h, Math.floor(r() * 90_000), r) : readyAll(h);
        else if (h.stage === 'betweenRounds') h = r() < 0.3 ? hostTick(h, 1000, r) : hostContinue(h);
        else {
          h = hostRunBots(h, botFor, r);
          if (h.stage !== 'playing') continue;
          const seatActor = h.match.table.findIndex((_, s) => hostView(h, h.match.table[s]!).legalActions.length > 0);
          if (r() < 0.4) h = hostTick(h, Math.floor(r() * 60_000), r);
          else if (seatActor >= 0) {
            const who = h.match.table[seatActor]!;
            const legal = hostView(h, who).legalActions;
            h = hostAct(h, who, legal[Math.floor(r() * legal.length)]!);
          }
        }
        checkInvariants(h.match.round);
        expect(sum(h.match.standings)).toBe(0);
      }
    }
  }, 120_000);
});
