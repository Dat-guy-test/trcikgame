import { describe, expect, it } from 'vitest';
import {
  seatOf, DEFAULT_TIMERS, IllegalAction, addElapsed, createMatch, createRng, matchApply, nextRound, placings,
  randomAction, replayMatch, seatKindsFor, type MatchConfig, type MatchState, type Rng, type SeatKind,
} from '../src';

const cfg = (over: Partial<MatchConfig> = {}): MatchConfig => ({
  regularPlayers: 4, dummies: 0, winCondition: { kind: 'rounds', rounds: 3 },
  failSafeMinutes: null, infiniteContra: false, timers: DEFAULT_TIMERS, ...over,
});

function playRound(m: MatchState, rng: Rng): MatchState {
  while (m.round.phase !== 'done') {
    const { actor, action } = randomAction(m.round, rng);
    m = matchApply(m, actor, action);
  }
  return m;
}

function playMatch(m: MatchState, rng: Rng, maxRounds = 500): MatchState {
  for (let i = 0; i < maxRounds; i++) {
    m = playRound(m, rng);
    if (m.finished) return m;
    m = nextRound(m);
  }
  throw new Error('match did not finish');
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe('match setup', () => {
  it('derives seats from regular players and dummies', () => {
    expect(seatKindsFor({ regularPlayers: 4, dummies: 0 })).toEqual(['player', 'player', 'player', 'player']);
    expect(seatKindsFor({ regularPlayers: 3, dummies: 1 })).toEqual(['player', 'dummy', 'player', 'player']);
    expect(seatKindsFor({ regularPlayers: 2, dummies: 2 })).toEqual(['player', 'dummy', 'player', 'dummy']);
    expect(() => seatKindsFor({ regularPlayers: 1, dummies: 3 })).toThrow();
    expect(seatKindsFor({ regularPlayers: 6, dummies: 0 })).toEqual(['player', 'player', 'player', 'player']);
    expect(() => seatKindsFor({ regularPlayers: 5, dummies: 1 })).toThrow();
  });

  it('rejects invalid win conditions', () => {
    expect(() => createMatch(cfg({ winCondition: { kind: 'rounds', rounds: 0 } }), 1)).toThrow();
    expect(() => createMatch(cfg({ winCondition: { kind: 'targetScore', target: -5 } }), 1)).toThrow();
    expect(() => createMatch(cfg({ failSafeMinutes: 0 }), 1)).toThrow();
  });
});

describe('rounds and rotation', () => {
  it('rotates the starting player and keeps standings zero-sum', () => {
    const rng = createRng(11);
    let m = createMatch(cfg({ winCondition: { kind: 'rounds', rounds: 5 } }), 7);
    const starters: number[] = [];
    for (let i = 0; i < 5; i++) {
      starters.push(m.round.config.startingPlayer);
      m = playRound(m, rng);
      expect(sum(m.standings)).toBe(0);
      if (!m.finished) m = nextRound(m);
    }
    expect(starters).toEqual([0, 1, 2, 3, 0]);
    expect(m.finished).toBe(true);
  });

  it('skips the dummy seat in the rotation and tracks its score', () => {
    const rng = createRng(12);
    let m = createMatch(cfg({ regularPlayers: 3, dummies: 1, winCondition: { kind: 'rounds', rounds: 4 } }), 3);
    const starters: number[] = [];
    for (let i = 0; i < 4; i++) {
      starters.push(m.round.config.startingPlayer);
      m = playRound(m, rng);
      expect(sum(m.standings)).toBe(0);
      if (!m.finished) m = nextRound(m);
    }
    expect(starters).toEqual([0, 2, 3, 0]);
    expect(m.winners.every((w) => m.participantKinds[w] === 'player')).toBe(true);
  });

  it('cannot start the next round early, nor act after the match ended', () => {
    const rng = createRng(13);
    let m = createMatch(cfg({ winCondition: { kind: 'rounds', rounds: 1 } }), 5);
    expect(() => nextRound(m)).toThrow(IllegalAction);
    m = playRound(m, rng);
    expect(m.finished).toBe(true);
    expect(m.history).toHaveLength(1);
    expect(() => nextRound(m)).toThrow(IllegalAction);
    expect(() => matchApply(m, 0, { type: 'pass' })).toThrow(IllegalAction);
  });
});

describe('2-player matches', () => {
  it('rotates between the two players; reshuffles do not count as rounds and keep the starting player', () => {
    const rng = createRng(51);
    let m = createMatch(cfg({ regularPlayers: 2, dummies: 2, winCondition: { kind: 'rounds', rounds: 12 } }), 51);
    let reshuffles = 0;
    for (let i = 0; i < 100 && !m.finished; i++) {
      const starter = m.round.config.startingPlayer;
      m = playRound(m, rng);
      expect(sum(m.standings)).toBe(0);
      if (m.finished) break;
      const reshuffled = m.round.result!.kind === 'reshuffle';
      if (reshuffled) reshuffles++;
      m = nextRound(m);
      expect(m.round.config.startingPlayer).toBe(reshuffled ? starter : starter === 0 ? 2 : 0);
    }
    expect(m.finished).toBe(true);
    expect(m.history.filter((r) => r.result.kind !== 'reshuffle')).toHaveLength(12);
    expect(m.history.length).toBe(12 + reshuffles);
    expect(m.winners.every((w) => m.participantKinds[w] === 'player')).toBe(true);
  });
});

describe('more than 4 players (spectators rotate in)', () => {
  it('5 players: one spectator swaps in each round, everybody sits out equally often', () => {
    const rng = createRng(41);
    let m = createMatch(cfg({ regularPlayers: 5, winCondition: { kind: 'rounds', rounds: 10 } }), 41);
    expect(m.standings).toHaveLength(5);
    expect(m.table).toEqual([0, 1, 2, 3]);
    expect(m.queue).toEqual([4]);
    const sittingOut = [0, 0, 0, 0, 0];
    for (let i = 0; i < 10; i++) {
      const spectators = m.queue.slice();
      for (const s of spectators) sittingOut[s]!++;
      const before = [...m.standings];
      m = playRound(m, rng);
      for (const s of spectators) expect(m.standings[s]).toBe(before[s]); // spectators score nothing
      expect(sum(m.standings)).toBe(0);
      if (!m.finished) m = nextRound(m);
    }
    expect(sittingOut).toEqual([2, 2, 2, 2, 2]);
    expect(m.history[0]!.table).toEqual([0, 1, 2, 3]);
    expect(m.history[1]!.table).toEqual([4, 1, 2, 3]);
  });

  it('7 players: table and queue always partition the participants; target score works', () => {
    const rng = createRng(42);
    let m = createMatch(cfg({ regularPlayers: 7, winCondition: { kind: 'targetScore', target: 12 } }), 42);
    for (let i = 0; i < 300 && !m.finished; i++) {
      expect([...m.table, ...m.queue].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
      m = playRound(m, rng);
      if (!m.finished) m = nextRound(m);
    }
    expect(m.finished).toBe(true);
    expect(m.winners).toHaveLength(1);
    expect(m.standings[m.winners[0]!]).toBeGreaterThanOrEqual(12);
    expect(seatOf(m, m.table[2]!)).toBe(2);
    expect(seatOf(m, m.queue[0]!)).toBeNull();
  });

  it('replaying the log reproduces a 6-player match', () => {
    let m = createMatch(cfg({ regularPlayers: 6, winCondition: { kind: 'rounds', rounds: 6 } }), 43);
    m = playMatch(m, createRng(43));
    const r = replayMatch(m.config, m.seed, m.log, m.firstStartingPlayer);
    expect(r.standings).toEqual(m.standings);
    expect(r.log).toEqual(m.log);
  });
});

describe('win conditions', () => {
  it('rounds: ends after exactly N rounds', () => {
    const m = playMatch(createMatch(cfg({ winCondition: { kind: 'rounds', rounds: 4 } }), 21), createRng(21));
    expect(m.history).toHaveLength(4);
    expect(m.winners.length).toBeGreaterThan(0);
  });

  it('targetScore: ends once a player reaches the target and leads alone', () => {
    const m = playMatch(createMatch(cfg({ winCondition: { kind: 'targetScore', target: 10 } }), 22), createRng(22));
    const p = placings(m.standings, m.seatKinds);
    expect(p[0]!.score).toBeGreaterThanOrEqual(10);
    expect(m.winners).toEqual([p[0]!.seat]);
    expect(p[1]!.score).toBeLessThan(p[0]!.score);
  });

  it('timeLimit: the current round is finished, then the match ends', () => {
    const rng = createRng(23);
    let m = createMatch(cfg({ winCondition: { kind: 'timeLimit', minutes: 1 } }), 23);
    m = addElapsed(m, 30_000);
    expect(m.endAfterRound).toBe(false);
    m = addElapsed(m, 31_000);
    expect(m.endAfterRound).toBe(true);
    expect(m.finished).toBe(false);
    m = playRound(m, rng);
    expect(m.finished).toBe(true);
    expect(m.history).toHaveLength(1);
  });

  it('time running out between rounds ends the match immediately', () => {
    const rng = createRng(24);
    let m = createMatch(cfg({ winCondition: { kind: 'rounds', rounds: 10 }, failSafeMinutes: 5 }), 24);
    m = playRound(m, rng);
    expect(m.finished).toBe(false);
    m = addElapsed(m, 5 * 60_000);
    expect(m.finished).toBe(true);
    expect(m.log.some((e) => e.type === 'timeExpired' && e.reason === 'failSafe')).toBe(true);
  });

  it('the fail-safe also applies to score-based matches', () => {
    const rng = createRng(25);
    let m = createMatch(cfg({ winCondition: { kind: 'targetScore', target: 100000 }, failSafeMinutes: 1 }), 25);
    m = addElapsed(m, 61_000);
    expect(m.finished).toBe(false);
    m = playRound(m, rng);
    expect(m.finished).toBe(true);
  });
});

describe('placings', () => {
  it('skips dummies and lets equal scores share a place', () => {
    const kinds: SeatKind[] = ['player', 'dummy', 'player', 'player'];
    const p = placings([10, 50, 3, 10 - 0], kinds);
    expect(p.map((x) => x.seat)).toEqual([0, 3, 2]);
    expect(p.map((x) => x.place)).toEqual([1, 1, 3]);
  });
});

describe('event log', () => {
  it('replaying the log reproduces the match', () => {
    const rng = createRng(31);
    let m = createMatch(cfg({ winCondition: { kind: 'rounds', rounds: 3 } }), 31);
    m = playMatch(m, rng);
    const r = replayMatch(m.config, m.seed, m.log, m.firstStartingPlayer);
    expect(r.standings).toEqual(m.standings);
    expect(r.winners).toEqual(m.winners);
    expect(r.log).toEqual(m.log);
  });

  it('replays an expiry that happened mid-round', () => {
    const rng = createRng(32);
    let m = createMatch(cfg({ winCondition: { kind: 'timeLimit', minutes: 1 } }), 32);
    m = addElapsed(m, 61_000);
    m = playRound(m, rng);
    const r = replayMatch(m.config, m.seed, m.log, m.firstStartingPlayer);
    expect(r.finished).toBe(true);
    expect(r.standings).toEqual(m.standings);
  });
});
