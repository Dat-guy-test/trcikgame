/**
 * Host runner: drives a match for a UI or a server. Pure and JSON-serialisable; real time comes in through
 * `hostTick`, human input through `hostAct` / `hostReady` / `hostContinue`, and bots through `hostRunBots`.
 *
 * It owns what the engine deliberately leaves out: the card-viewing phase, the per-player time reserve (with the grace
 * period, default action, random move and forfeit), the match time limit, bots, and the per-participant view a client
 * renders. See docs/rules.md section 10.
 */
import { resolveBankSeconds } from './config';
import { GRACE_SECONDS, bankExpiryOutcome, clockKind } from './clock';
import { randomAction } from './bot';
import type { CardId } from './cards';
import {
  addElapsed, createMatch, matchApply, nextRound, placings, playedRounds, seatOf,
  type MatchState, type Placing,
} from './match';
import type { MatchConfig } from './config';
import type { ContractId } from './contracts';
import { IllegalAction, expectedActor, timeoutAction, type Action } from './round';
import type { Rng } from './rng';
import type { SeatKind } from './state';
import { viewFor, type RoundView } from './view';
import { isLegalFromView, legalActionsFromView } from './viewActions';

export type Controller = 'human' | 'bot';
/** A bot decides from a per-player view only. `@tarok/ai` strategies fit this shape. */
export type BotFn = (view: RoundView, rng: Rng) => Action;

export type HostStage =
  /** Hands are shown, bidding has not started. Every human who is not ready spends their own time. */
  | 'viewing'
  | 'playing'
  /** A round was settled; waiting for `hostContinue`. */
  | 'betweenRounds'
  | 'finished';

export interface HostClocks {
  /** Time spent on the current decision with an empty reserve. */
  graceMs: number;
  /** Time reserve per participant, reset every round (`null` = clocks off). */
  banksMs: (number | null)[];
}

export interface HostState {
  match: MatchState;
  /** One per participant. Dummies never act themselves, their controller does. */
  controllers: Controller[];
  stage: HostStage;
  /** Card viewing: who is ready (bots always are). */
  ready: boolean[];
  clocks: HostClocks;
}

const illegal = (m: string): never => {
  throw new IllegalAction(m);
};

const isHuman = (h: HostState, participant: number): boolean =>
  h.controllers[participant] === 'human' && h.match.participantKinds[participant] === 'player';

const humansAtTable = (h: HostState): number[] => h.match.table.filter((p) => isHuman(h, p));

/** Participant who must act now (for a dummy's card: its controller), or null. */
export function actorParticipant(h: HostState): number | null {
  if (h.stage !== 'playing') return null;
  const seat = expectedActor(h.match.round);
  return seat === null ? null : h.match.table[seat]!;
}

function beginRound(h: HostState): HostState {
  const m = h.match;
  const bankSec = resolveBankSeconds(m.config);
  // Card viewing only exists together with the time reserve (it is paid from it).
  const viewing = bankSec !== null && humansAtTable(h).length > 0;
  return {
    ...h,
    stage: viewing ? 'viewing' : 'playing',
    ready: h.controllers.map((_, p) => !isHuman(h, p)),
    clocks: {
      graceMs: 0,
      banksMs: m.participantKinds.map(() => (bankSec === null ? null : bankSec * 1000)),
    },
  };
}

/**
 * `deck` (optional) is a full deck order for the first deal, so online rooms can shuffle from a cryptographic source.
 * Without it the deal comes from the seed (local play and tests).
 */
export function createHost(
  config: MatchConfig, seed: number, controllers: Controller[], firstStartingPlayer?: number, deck?: CardId[],
): HostState {
  const match = createMatch(config, seed, firstStartingPlayer, deck);
  if (controllers.length !== match.participantKinds.length) {
    throw new Error(`need ${match.participantKinds.length} controllers (one per participant), got ${controllers.length}`);
  }
  return beginRound({ match, controllers: [...controllers], stage: 'playing', ready: [], clocks: { graceMs: 0, banksMs: [] } });
}

function startPlaying(h: HostState): HostState {
  return { ...h, stage: 'playing', clocks: { ...h.clocks, graceMs: 0 } };
}

/** Applies an action to the round and resets the grace clock; settles the round when it ended. */
function applyAction(h: HostState, seat: number, action: Action): HostState {
  const match = matchApply(h.match, seat, action);
  const stage: HostStage = match.round.phase === 'done' ? (match.finished ? 'finished' : 'betweenRounds') : h.stage;
  return { ...h, match, stage, clocks: { ...h.clocks, graceMs: 0 } };
}

// ---------------------------------------------------------------------------------------------
// Input

/** A human (or any participant) plays an action. Throws `IllegalAction` when it is not their turn or the action is illegal. */
export function hostAct(h: HostState, participant: number, action: Action): HostState {
  if (h.stage !== 'playing') return illegal(`cannot act during stage "${h.stage}"`);
  if (action.type === 'forfeit') return illegal('forfeit is issued by the host');
  const seat = seatOf(h.match, participant);
  if (seat === null) return illegal('spectators cannot act');
  if (expectedActor(h.match.round) !== seat) return illegal('it is not your turn');
  return applyAction(h, seat, action);
}

/** Card viewing: a human is ready. Bidding starts when every human at the table is ready. */
export function hostReady(h: HostState, participant: number): HostState {
  if (h.stage !== 'viewing') return illegal('not in the card-viewing phase');
  if (!humansAtTable(h).includes(participant)) return illegal('this participant is not a human at the table');
  const ready = [...h.ready];
  ready[participant] = true;
  const next = { ...h, ready };
  return humansAtTable(next).every((p) => ready[p]) ? startPlaying(next) : next;
}

/** Starts the next round after a round was settled. `deck` is an optional full deck order for the new deal. */
export function hostContinue(h: HostState, deck?: CardId[]): HostState {
  if (h.stage !== 'betweenRounds') return illegal('no round has just ended');
  return beginRound({ ...h, match: nextRound(h.match, deck) });
}

/** Hands a participant to a bot (disconnect, AFK) or back to a human. */
export function hostSetController(h: HostState, participant: number, controller: Controller): HostState {
  const controllers = [...h.controllers];
  controllers[participant] = controller;
  let next: HostState = { ...h, controllers };
  if (next.stage === 'viewing') {
    const ready = [...next.ready];
    ready[participant] = controller === 'bot';
    next = { ...next, ready };
    if (humansAtTable(next).every((p) => ready[p])) next = startPlaying(next);
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Time

const elapse = (h: HostState, ms: number): HostState => {
  const match = addElapsed(h.match, ms);
  return { ...h, match, stage: match.finished ? 'finished' : h.stage };
};

const withClocks = (h: HostState, c: Partial<HostClocks>): HostState => ({ ...h, clocks: { ...h.clocks, ...c } });

/** Consumes up to `ms` of real time; returns how much was used (0 is allowed when the state changed). */
function advanceOnce(h: HostState, ms: number, rng: Rng): { host: HostState; used: number } {
  if (h.stage === 'finished') return { host: h, used: ms };
  if (h.stage === 'betweenRounds') return { host: elapse(h, ms), used: ms };

  if (h.stage === 'viewing') {
    // Every human who has not pressed Ready spends their own time. Someone whose time runs out is ready automatically.
    const waiting = humansAtTable(h).filter((p) => !h.ready[p]);
    if (waiting.length === 0) return { host: startPlaying(h), used: 0 };
    const left = Math.min(...waiting.map((p) => h.clocks.banksMs[p] ?? 0));
    const use = Math.min(ms, left);
    const banksMs = [...h.clocks.banksMs];
    const ready = [...h.ready];
    for (const p of waiting) {
      banksMs[p] = (banksMs[p] ?? 0) - use;
      if (banksMs[p]! <= 0) ready[p] = true;
    }
    let next: HostState = { ...withClocks(elapse(h, use), { banksMs }), ready };
    if (humansAtTable(next).every((p) => ready[p])) next = startPlaying(next);
    return { host: next, used: use };
  }

  const round = h.match.round;
  const seat = expectedActor(round);
  if (seat === null) return { host: elapse(h, ms), used: ms };
  const p = h.match.table[seat]!;
  if (!isHuman(h, p)) return { host: elapse(h, ms), used: ms }; // bots are not timed

  const bank = h.clocks.banksMs[p];
  if (bank === null || bank === undefined) return { host: elapse(h, ms), used: ms };
  const kind = clockKind(round);

  if (bank > 0) {
    const use = Math.min(ms, bank);
    const banksMs = [...h.clocks.banksMs];
    banksMs[p] = bank - use;
    let next = withClocks(elapse(h, use), { banksMs });
    if (bank - use === 0 && kind === 'bank' && bankExpiryOutcome(next.match.round, seat) === 'forfeit') {
      next = applyAction(next, seat, { type: 'forfeit' });
    }
    return { host: next, used: use };
  }

  // Empty reserve: 10 seconds per turn, then the default action (licitation), forfeit (1v3 declarer) or a random legal move.
  const graceLimit = GRACE_SECONDS * 1000;
  const use = Math.min(ms, Math.max(0, graceLimit - h.clocks.graceMs));
  let next = withClocks(elapse(h, use), { graceMs: h.clocks.graceMs + use });
  if (h.clocks.graceMs + use >= graceLimit) {
    if (kind === 'licitation') {
      const t = timeoutAction(next.match.round)!;
      next = applyAction(next, t.actor, t.action);
    } else if (bankExpiryOutcome(next.match.round, seat) === 'forfeit') {
      next = applyAction(next, seat, { type: 'forfeit' });
    } else {
      const a = randomAction(next.match.round, rng);
      next = applyAction(next, a.actor, a.action);
    }
  }
  return { host: next, used: use };
}

/**
 * Real time passes. Charges the waiting humans' time and applies what the rules say when it runs out.
 * Also counts towards the match time limit. A long tick (a suspended tab) is processed event by event.
 */
export function hostTick(h: HostState, ms: number, rng: Rng): HostState {
  let cur = h;
  let left = ms;
  for (let guard = 0; left > 0 && guard < 10_000; guard++) {
    const { host, used } = advanceOnce(cur, left, rng);
    cur = host;
    left -= used;
  }
  return cur;
}

/**
 * Milliseconds until the next moment `hostTick` would change something (a reserve runs out, the grace period ends,
 * the match time limit is reached), or null when nothing is waiting. A server can set one alarm from this.
 */
export function hostNextDeadlineMs(h: HostState): number | null {
  if (h.stage === 'finished') return null;
  const m = h.match;
  const out: number[] = [];
  if (!m.endAfterRound) {
    if (m.config.winCondition.kind === 'timeLimit') out.push(m.config.winCondition.minutes * 60_000 - m.elapsedMs);
    if (m.config.failSafeMinutes !== null) out.push(m.config.failSafeMinutes * 60_000 - m.elapsedMs);
  }
  if (h.stage === 'viewing') {
    const waiting = humansAtTable(h).filter((p) => !h.ready[p]);
    if (waiting.length > 0) out.push(Math.min(...waiting.map((p) => h.clocks.banksMs[p] ?? 0)));
  }
  const acting = actorParticipant(h);
  if (acting !== null && isHuman(h, acting)) {
    const bank = h.clocks.banksMs[acting];
    if (bank !== null && bank !== undefined) out.push(bank > 0 ? bank : GRACE_SECONDS * 1000 - h.clocks.graceMs);
  }
  return out.length === 0 ? null : Math.max(0, Math.min(...out));
}

// ---------------------------------------------------------------------------------------------
// Bots

/**
 * Lets bots move until a human has to act, the stage changes, or `maxMoves` is reached
 * (use `maxMoves = 1` to animate one bot move at a time). An illegal proposal falls back to the first legal action.
 */
export function hostRunBots(h: HostState, bots: (participant: number) => BotFn, rng: Rng, maxMoves = 10_000): HostState {
  let cur = h;
  for (let i = 0; i < maxMoves && cur.stage === 'playing'; i++) {
    const seat = expectedActor(cur.match.round);
    if (seat === null) break;
    const p = cur.match.table[seat]!;
    if (isHuman(cur, p)) break;
    const view = viewFor(cur.match.round, seat);
    let action = bots(p)(view, rng);
    if (!isLegalFromView(view, action)) action = legalActionsFromView(view)[0]!.action;
    cur = applyAction(cur, seat, action);
  }
  return cur;
}

/** Plays a whole match on autopilot (tests, simulations). Throws if a human would have to act. */
export function hostRunToEnd(h: HostState, bots: (participant: number) => BotFn, rng: Rng): HostState {
  let cur = h;
  for (let guard = 0; cur.stage !== 'finished' && guard < 100_000; guard++) {
    if (cur.stage === 'viewing') cur = startPlaying(cur);
    else if (cur.stage === 'betweenRounds') cur = hostContinue(cur);
    else {
      cur = hostRunBots(cur, bots, rng);
      if (cur.stage === 'playing') throw new Error('a human must act; hostRunToEnd needs bots for every participant');
    }
  }
  return cur;
}

/** Uniformly random legal move, passive in bidding. For tests and as a minimal bot. */
export const randomViewBot: BotFn = (v, rng) => {
  const acts = legalActionsFromView(v).map((a) => a.action);
  const passive = acts.filter((a) => a.type === 'pass' || a.type === 'confirm' || a.type === 'noContra');
  const pool = v.phase === 'bidding' && passive.length > 0 && rng() < 0.6 ? passive : acts;
  return pool[Math.floor(rng() * pool.length)]!;
};

// ---------------------------------------------------------------------------------------------
// What a client renders

export interface RoundSummary {
  index: number;
  /** Participant at each seat. */
  table: number[];
  startingPlayer: number;
  contract: ContractId;
  kind: 'played' | 'gaveUp' | 'forfeit' | 'trischaken' | 'reshuffle';
  declarer: number | null;
  /** Standings change per seat. */
  deltas: number[];
}

export interface HostView {
  participant: number;
  /** `null` while spectating. */
  seat: number | null;
  stage: HostStage;
  /** The round as this participant may see it (seat -1 = spectator: no hands). */
  round: RoundView;
  /** Actions this participant may take right now (one canonical discard; empty when it is not their turn). */
  legalActions: Action[];
  controllers: Controller[];
  ready: boolean[];
  table: number[];
  queue: number[];
  participantKinds: SeatKind[];
  standings: number[];
  placings: Placing[];
  rounds: RoundSummary[];
  roundsPlayed: number;
  endAfterRound: boolean;
  finished: boolean;
  winners: number[];
  timers: {
    /** Time reserve per participant (snapshot; a client may count down the `draining` ones locally). */
    banksMs: (number | null)[];
    /** Time left on the current turn once the reserve is empty. */
    graceMsLeft: number | null;
    /** Participant whose turn it is and who is a human (playing stage), or null. */
    actingParticipant: number | null;
    /** Participants whose reserve is running right now: the unready humans while viewing, the acting human while playing. */
    draining: number[];
    /** Time until the match time limit / fail-safe (the current round is then finished), or null. */
    matchMsLeft: number | null;
  };
}

export function hostView(h: HostState, participant: number): HostView {
  const m = h.match;
  const seat = seatOf(m, participant);
  const round = viewFor(m.round, seat ?? -1);
  const acting = actorParticipant(h);
  const actingHuman = acting !== null && isHuman(h, acting);
  const bank = acting !== null ? h.clocks.banksMs[acting] ?? null : null;

  const limits: number[] = [];
  if (m.config.winCondition.kind === 'timeLimit') limits.push(m.config.winCondition.minutes * 60_000);
  if (m.config.failSafeMinutes !== null) limits.push(m.config.failSafeMinutes * 60_000);

  const draining =
    h.stage === 'viewing' ? humansAtTable(h).filter((p) => !h.ready[p])
    : actingHuman && bank !== null && bank > 0 ? [acting as number]
    : [];

  return {
    participant, seat,
    stage: h.stage,
    round,
    legalActions: h.stage === 'playing' ? legalActionsFromView(round).map((a) => a.action) : [],
    controllers: h.controllers,
    ready: h.ready,
    table: m.table,
    queue: m.queue,
    participantKinds: m.participantKinds,
    standings: m.standings,
    placings: placings(m.standings, m.participantKinds),
    rounds: m.history.map((r) => ({
      index: r.index, table: r.table, startingPlayer: r.startingPlayer, contract: r.result.contract,
      kind: r.result.kind, declarer: r.result.declarer, deltas: r.result.deltas,
    })),
    roundsPlayed: playedRounds(m),
    endAfterRound: m.endAfterRound,
    finished: m.finished,
    winners: m.winners,
    timers: {
      banksMs: h.clocks.banksMs,
      graceMsLeft: actingHuman && bank === 0 ? Math.max(0, GRACE_SECONDS * 1000 - h.clocks.graceMs) : null,
      actingParticipant: actingHuman ? acting : null,
      draining,
      matchMsLeft: limits.length > 0 && !m.finished ? Math.max(0, Math.min(...limits) - m.elapsedMs) : null,
    },
  };
}
