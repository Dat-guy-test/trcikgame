/**
 * Match layer: a sequence of rounds with cumulative standings, starting-player rotation and win conditions.
 * With more than 4 regular players only four sit at the table; after every round one spectator swaps in.
 * Pure and JSON-serialisable like the round. The host drives real time through `addElapsed`.
 * See docs/rules.md section 10.1.
 */
import type { MatchConfig } from './config';
import { IllegalAction, apply, newRound, type Action } from './round';
import { nextStartingPlayer, type RoundResult, type RoundState, type SeatKind } from './state';
import type { CardId } from './cards';
import type { MatchConfig } from './config';

export interface Placing {
  /** Participant index (equal to the seat with 4 or fewer players). */
  seat: number;
  score: number;
  /** 1 = first. Equal scores share a place (competition ranking). */
  place: number;
}

export type MatchEvent =
  | { type: 'roundStarted'; index: number; startingPlayer: number; seed: number; table: number[] }
  | { type: 'action'; actor: number; action: Action }
  | { type: 'roundFinished'; index: number; deltas: number[] }
  | { type: 'timeExpired'; reason: 'timeLimit' | 'failSafe' }
  | { type: 'matchFinished'; winners: number[] };

export interface RoundRecord {
  index: number;
  /** Participant sitting at each seat in this round. */
  table: number[];
  startingPlayer: number;
  seed: number;
  result: RoundResult;
}

export interface MatchState {
  config: MatchConfig;
  /** The four seats of the round. */
  seatKinds: SeatKind[];
  /**
   * Participants (scoreboard entries): the regular players, plus the dummy in a 3-player match.
   * With 4 or fewer players, participant i is seat i.
   */
  participantKinds: SeatKind[];
  /** Participant at each of the four seats in the current round. */
  table: number[];
  /** Spectators in waiting order (more than 4 players only). The first one swaps in after the round. */
  queue: number[];
  seed: number;
  firstStartingPlayer: number;
  /** The current round; once it is `done` it has already been settled into `standings`. */
  round: RoundState;
  roundIndex: number;
  /** Cumulative score per participant. Dummies are tracked too but never placed. */
  standings: number[];
  history: RoundRecord[];
  elapsedMs: number;
  /** Time ran out: the current round is finished, then the match ends. */
  endAfterRound: boolean;
  finished: boolean;
  /** Participants in first place once finished (regular players only). */
  winners: number[];
  log: MatchEvent[];
}

/** The four seats of a round. With more than 4 regular players all four seats are regular. */
export function seatKindsFor(cfg: Pick<MatchConfig, 'regularPlayers' | 'dummies'>): SeatKind[] {
  const { regularPlayers, dummies } = cfg;
  if (regularPlayers > 4) {
    if (dummies !== 0) throw new Error('dummies are only used with 3 regular players');
    return ['player', 'player', 'player', 'player'];
  }
  if (regularPlayers + dummies !== 4) throw new Error('a match needs exactly 4 seats (regular players + dummies)');
  if (regularPlayers === 4) return ['player', 'player', 'player', 'player'];
  if (regularPlayers === 3) return ['player', 'dummy', 'player', 'player'];
  if (regularPlayers === 2) return ['player', 'dummy', 'player', 'dummy'];
  throw new Error('a match needs at least 2 regular players');
}

/** Scoreboard entries: the four seats, or one entry per player when more than 4 take part. */
export function participantKindsFor(cfg: Pick<MatchConfig, 'regularPlayers' | 'dummies'>): SeatKind[] {
  const seats = seatKindsFor(cfg);
  return cfg.regularPlayers > 4 ? Array.from({ length: cfg.regularPlayers }, () => 'player' as const) : seats;
}

export const deriveRoundSeed = (seed: number, index: number): number => (seed * 7919 + index) >>> 0;

function validateWinCondition(cfg: MatchConfig): void {
  const wc = cfg.winCondition;
  const bad = (m: string): never => {
    throw new Error(m);
  };
  if (wc.kind === 'rounds' && !(Number.isInteger(wc.rounds) && wc.rounds >= 1)) bad('rounds must be an integer >= 1');
  if (wc.kind === 'targetScore' && !(wc.target > 0)) bad('target score must be positive');
  if (wc.kind === 'timeLimit' && !(wc.minutes > 0)) bad('time limit must be positive');
  if (cfg.failSafeMinutes !== null && !(cfg.failSafeMinutes > 0)) bad('fail-safe minutes must be positive');
}

/** Regular players ranked by score (dummies are skipped). */
/** Rounds that count towards a rounds limit: reshuffled deals (2-player variant) do not. */
export function playedRounds(m: Pick<MatchState, 'history'>): number {
  return m.history.filter((r) => r.result.kind !== 'reshuffle').length;
}

export function placings(standings: readonly number[], kinds: readonly SeatKind[]): Placing[] {
  const regs = standings.map((_, seat) => seat)
    .filter((seat) => kinds[seat] === 'player')
    .map((seat) => ({ seat, score: standings[seat]! }))
    .sort((a, b) => b.score - a.score || a.seat - b.seat);
  let place = 0;
  return regs.map((r, i) => {
    if (i === 0 || r.score !== regs[i - 1]!.score) place = i + 1;
    return { ...r, place };
  });
}

export function createMatch(config: MatchConfig, seed: number, firstStartingPlayer?: number, deck?: CardId[]): MatchState {
  const seatKinds = seatKindsFor(config);
  const participantKinds = participantKindsFor(config);
  validateWinCondition(config);
  const startingPlayer = firstStartingPlayer ?? seatKinds.indexOf('player');
  const roundSeed = deriveRoundSeed(seed, 0);
  const cfg = JSON.parse(JSON.stringify(config)) as MatchConfig;
  const round = newRound({ seatKinds, startingPlayer, seed: roundSeed, infiniteContra: cfg.infiniteContra, deck });
  const table = [0, 1, 2, 3];
  const queue = participantKinds.map((_, i) => i).slice(4);
  return {
    config: cfg,
    seatKinds,
    participantKinds,
    table,
    queue,
    seed,
    firstStartingPlayer: startingPlayer,
    round,
    roundIndex: 0,
    standings: participantKinds.map(() => 0),
    history: [],
    elapsedMs: 0,
    endAfterRound: false,
    finished: false,
    winners: [],
    log: [{ type: 'roundStarted', index: 0, startingPlayer, seed: roundSeed, table: [...table] }],
  };
}

function finish(m: MatchState): MatchState {
  const winners = placings(m.standings, m.participantKinds).filter((p) => p.place === 1).map((p) => p.seat);
  return { ...m, finished: true, winners, log: [...m.log, { type: 'matchFinished', winners }] };
}

/** Called after a round was settled (or when time ran out between rounds). */
function shouldFinish(m: MatchState): boolean {
  if (m.endAfterRound) return true;
  const wc = m.config.winCondition;
  if (wc.kind === 'rounds') return playedRounds(m) >= wc.rounds;
  if (wc.kind === 'targetScore') {
    // Someone reached the target and leads alone; a tie at the top keeps the match going.
    const p = placings(m.standings, m.participantKinds);
    const top = p[0]!;
    const second = p[1];
    return top.score >= wc.target && (second === undefined || second.score < top.score);
  }
  return false;
}

function settle(m: MatchState): MatchState {
  const result = m.round.result!;
  const standings = [...m.standings];
  m.table.forEach((participant, seat) => {
    standings[participant]! += result.deltas[seat]!;
  });
  const record: RoundRecord = {
    index: m.roundIndex,
    table: [...m.table],
    startingPlayer: m.round.config.startingPlayer,
    seed: m.round.config.seed,
    result,
  };
  const next: MatchState = {
    ...m,
    standings,
    history: [...m.history, record],
    log: [...m.log, { type: 'roundFinished', index: m.roundIndex, deltas: result.deltas }],
  };
  return shouldFinish(next) ? finish(next) : next;
}

/** Applies a round action. When the round ends it is settled and the win condition is checked. */
export function matchApply(m: MatchState, actor: number, action: Action): MatchState {
  if (m.finished) throw new IllegalAction('the match is over');
  const round = apply(m.round, actor, action);
  const next: MatchState = { ...m, round, log: [...m.log, { type: 'action', actor, action }] };
  return round.phase === 'done' ? settle(next) : next;
}

/** Starts the next round (starting player rotates, skipping dummies). Only between rounds. */
export function nextRound(m: MatchState, deck?: CardId[]): MatchState {
  if (m.finished) throw new IllegalAction('the match is over');
  if (m.round.phase !== 'done') throw new IllegalAction('the current round is still running');
  const index = m.roundIndex + 1;
  // A reshuffled deal is dealt again with the same starting player.
  const reshuffled = m.round.result?.kind === 'reshuffle';
  const startingPlayer = reshuffled ? m.round.config.startingPlayer : nextStartingPlayer(m.seatKinds, m.round.config.startingPlayer);
  const seed = deriveRoundSeed(m.seed, index);
  const round = newRound({ seatKinds: m.seatKinds, startingPlayer, seed, infiniteContra: m.config.infiniteContra, deck });
  // More than 4 players: the player in seat (finished round % 4) goes to the back of the queue, the first spectator takes the seat.
  const table = [...m.table];
  const queue = [...m.queue];
  if (queue.length > 0 && !reshuffled) {
    const seat = m.roundIndex % 4;
    const leaving = table[seat]!;
    table[seat] = queue.shift()!;
    queue.push(leaving);
  }
  return {
    ...m, round, roundIndex: index, table, queue,
    log: [...m.log, { type: 'roundStarted', index, startingPlayer, seed, table: [...table] }],
  };
}

function timeExpiry(m: MatchState): 'timeLimit' | 'failSafe' | null {
  const wc = m.config.winCondition;
  if (wc.kind === 'timeLimit' && m.elapsedMs >= wc.minutes * 60_000) return 'timeLimit';
  if (m.config.failSafeMinutes !== null && m.elapsedMs >= m.config.failSafeMinutes * 60_000) return 'failSafe';
  return null;
}

function expire(m: MatchState, reason: 'timeLimit' | 'failSafe'): MatchState {
  if (m.finished || m.endAfterRound) return m;
  const next: MatchState = { ...m, endAfterRound: true, log: [...m.log, { type: 'timeExpired', reason }] };
  return next.round.phase === 'done' ? finish(next) : next;
}

/**
 * The host reports elapsed wall-clock time. When a time limit (or the fail-safe) is reached the current
 * round is finished and then the match ends; if the table is between rounds it ends immediately.
 */
export function addElapsed(m: MatchState, ms: number): MatchState {
  if (m.finished || !(ms > 0)) return m;
  const next: MatchState = { ...m, elapsedMs: m.elapsedMs + ms };
  const reason = timeExpiry(next);
  return reason ? expire(next, reason) : next;
}

/** Rebuilds a match from its event log (elapsed time is not restored). */
export function replayMatch(config: MatchConfig, seed: number, log: readonly MatchEvent[], firstStartingPlayer?: number): MatchState {
  let m = createMatch(config, seed, firstStartingPlayer);
  for (const e of log) {
    if (e.type === 'action') m = matchApply(m, e.actor, e.action);
    else if (e.type === 'roundStarted' && e.index > 0) m = nextRound(m);
    else if (e.type === 'timeExpired') m = expire(m, e.reason);
  }
  return m;
}

/** Seat of a participant in the current round, or null when they are spectating. */
export function seatOf(m: MatchState, participant: number): number | null {
  const seat = m.table.indexOf(participant);
  return seat < 0 ? null : seat;
}
