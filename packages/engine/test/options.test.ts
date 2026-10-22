import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMERS, IllegalAction, apply, createMatch, createRng, defaultBid, matchApply, matchSetOptions,
  matchSetParticipantKind, newRound, nextRound, outbids, randomAction, validateBid,
  type Bid, type MatchConfig, type MatchState, type Rng, type SeatKind,
} from '../src';

const P4: SeatKind[] = ['player', 'player', 'player', 'player'];
const bid = (contract: Bid['contract'], take?: number): Bid => ({ ...defaultBid(contract), ...(take === undefined ? {} : { take }) });
const cfg = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  regularPlayers: 4, dummies: 0, winCondition: { kind: 'rounds', rounds: 5 }, failSafeMinutes: null,
  infiniteContra: false, timers: DEFAULT_TIMERS, ...over,
});

function playRound(m: MatchState, rng: Rng): MatchState {
  while (m.round.phase !== 'done') {
    const { actor, action } = randomAction(m.round, rng);
    m = matchApply(m, actor, action);
  }
  return m;
}

describe('Slovenian method option', () => {
  const off = { slovenian: false };

  it('bid validation and ordering', () => {
    expect(outbids(bid('dreier', 3), bid('dreier', 2), false)).toBe(true);
    expect(outbids(bid('dreier', 3), bid('dreier', 2), false, off)).toBe(false);
    expect(validateBid(bid('dreier', 2), false, off)).toBe('invalid_take');
    expect(validateBid(bid('dreier', 3), false, off)).toBeNull();
  });

  it('the round rejects a Slovenian bid when it is disabled', () => {
    const on = newRound({ seatKinds: P4, startingPlayer: 0, seed: 1, infiniteContra: false });
    const disabled = newRound({ seatKinds: P4, startingPlayer: 0, seed: 1, infiniteContra: false, slovenian: false });
    const after = (s: ReturnType<typeof newRound>) => apply(s, 0, { type: 'bid', bid: bid('dreier') });
    expect(apply(after(on), 1, { type: 'bid', bid: bid('dreier', 2) }).currentBid?.take).toBe(2);
    expect(() => apply(after(disabled), 1, { type: 'bid', bid: bid('dreier', 2) })).toThrow(IllegalAction);
  });
});

describe('bonuses option', () => {
  it('Besser Rufer cannot be bid and the declare phase is skipped', () => {
    const s0 = newRound({ seatKinds: P4, startingPlayer: 0, seed: 1, infiniteContra: false, bonuses: false });
    expect(() => apply(s0, 0, { type: 'bid', bid: { contract: 'besser_rufer', take: 3, bonuses: ['trull'] } })).toThrow(IllegalAction);
    let s = apply(s0, 0, { type: 'bid', bid: bid('dreier') });
    for (const seat of [1, 2, 3]) s = apply(s, seat, { type: 'pass' });
    s = apply(s, 0, { type: 'confirm' });
    expect(s.phase).toBe('contra');
  });

  it('nothing is scored: no bonuses and no Valat in any result', () => {
    const rng = createRng(7);
    let m = createMatch(cfg({ bonuses: false, winCondition: { kind: 'none' } }), 7);
    for (let i = 0; i < 40; i++) {
      m = playRound(m, rng);
      m = nextRound(m);
    }
    for (const r of m.history) {
      expect(r.result.bonuses).toEqual([]);
      expect(r.result.valat?.achievedBy ?? null).toBeNull();
    }
  });
});

describe('no win condition', () => {
  it('the match never finishes by itself', () => {
    const rng = createRng(3);
    let m = createMatch(cfg({ winCondition: { kind: 'none' } }), 3);
    for (let i = 0; i < 12; i++) {
      m = playRound(m, rng);
      expect(m.finished).toBe(false);
      m = nextRound(m);
    }
    expect(m.history).toHaveLength(12);
  });
});

describe('changing options between rounds', () => {
  it('applies from the next round and is refused mid-round', () => {
    const rng = createRng(2);
    let m = createMatch(cfg(), 2);
    expect(() => matchSetOptions(m, { slovenian: false })).toThrow(IllegalAction);
    m = playRound(m, rng);
    m = matchSetOptions(m, { slovenian: false, bonuses: false, winCondition: { kind: 'none' } });
    m = nextRound(m);
    expect(m.round.config.slovenian).toBe(false);
    expect(m.round.config.bonuses).toBe(false);
    expect(m.config.winCondition).toEqual({ kind: 'none' });
  });
});

describe('seats becoming dummies and players again', () => {
  it('a seat turns into a dummy for the next round and back before the first decision', () => {
    const rng = createRng(3);
    let m = playRound(createMatch(cfg(), 3), rng);
    m = matchSetParticipantKind(m, 3, 'dummy');
    expect(m.participantKinds[3]).toBe('dummy');
    m = nextRound(m);
    expect(m.round.config.seatKinds[3]).toBe('dummy');
    expect(m.round.toAct).toHaveLength(3);

    m = matchSetParticipantKind(m, 3, 'player'); // nobody has bid yet
    expect(m.round.config.seatKinds[3]).toBe('player');
    expect(m.round.toAct).toHaveLength(4);

    m = matchApply(m, m.round.toAct[0]!, { type: 'pass' });
    expect(() => matchSetParticipantKind(m, 3, 'dummy')).toThrow(IllegalAction);
  });

  it('at least two regular players must remain', () => {
    let m = createMatch(cfg(), 4);
    m = matchSetParticipantKind(m, 3, 'dummy');
    m = matchSetParticipantKind(m, 2, 'dummy');
    expect(() => matchSetParticipantKind(m, 1, 'dummy')).toThrow(IllegalAction);
  });
});
