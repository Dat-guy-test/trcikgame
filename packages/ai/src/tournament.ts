/** Bot-vs-bot tournaments: compare strategies over many deals, optionally in duplicate (rotated seats). */
import {
  apply, createRng, expectedActor, newRound, nextStartingPlayer, viewFor, type RoundState, type SeatKind,
} from '@tarok/engine';
import { resolveAction, type Strategy } from './strategy';

export interface TournamentOptions {
  /** One strategy per regular seat (3 or 4, matching `seatKinds`). */
  strategies: Strategy[];
  deals: number;
  seed: number;
  seatKinds?: SeatKind[];
  /** Replay every deal once per rotation so each strategy sits in each seat (removes seat bias). Default true. */
  duplicate?: boolean;
  infiniteContra?: boolean;
}

export interface StrategyStats {
  name: string;
  /** Total standings points over all rounds. */
  points: number;
  rounds: number;
  declared: number;
  declaredWon: number;
  /** Times the strategy proposed an illegal action (should stay 0). */
  fallbacks: number;
}

export interface TournamentReport {
  rounds: number;
  stats: StrategyStats[];
  contracts: Record<string, number>;
  /** Rounds per contract in which the declarer side won. */
  contractWins: Record<string, number>;
}

function playRound(
  seatStrategies: readonly (Strategy | undefined)[], seatKinds: SeatKind[], startingPlayer: number, seed: number,
  infiniteContra: boolean, rngSeed: number, onFallback: (seat: number) => void,
): RoundState {
  const rng = createRng(rngSeed);
  let s = newRound({ seatKinds, startingPlayer, seed, infiniteContra });
  for (let guard = 0; s.phase !== 'done'; guard++) {
    if (guard > 1000) throw new Error('round did not terminate');
    const actor = expectedActor(s)!;
    const { action, fellBack } = resolveAction(seatStrategies[actor]!, viewFor(s, actor), rng);
    if (fellBack) onFallback(actor);
    s = apply(s, actor, action);
  }
  return s;
}

export function runTournament(opts: TournamentOptions): TournamentReport {
  const seatKinds = opts.seatKinds ?? ['player', 'player', 'player', 'player'];
  const regulars = [0, 1, 2, 3].filter((x) => seatKinds[x] === 'player');
  const n = regulars.length;
  if (opts.strategies.length !== n) throw new Error(`need ${n} strategies, got ${opts.strategies.length}`);
  const rotations = opts.duplicate === false ? 1 : n;

  const stats: StrategyStats[] = opts.strategies.map((s) => ({
    name: s.name, points: 0, rounds: 0, declared: 0, declaredWon: 0, fallbacks: 0,
  }));
  const report: TournamentReport = { rounds: 0, stats, contracts: {}, contractWins: {} };
  let start = regulars[0]!;

  for (let d = 0; d < opts.deals; d++) {
    const dealSeed = (opts.seed * 7919 + d) >>> 0;
    for (let r = 0; r < rotations; r++) {
      const strategyOfSeat = new Map<number, number>(regulars.map((seat, k) => [seat, (k + r) % n]));
      const seatStrategies = [0, 1, 2, 3].map((seat) => {
        const k = strategyOfSeat.get(seat);
        return k === undefined ? undefined : opts.strategies[k];
      });
      const s = playRound(
        seatStrategies, seatKinds, start, dealSeed, opts.infiniteContra ?? false, dealSeed ^ (r + 1),
        (seat) => { stats[strategyOfSeat.get(seat)!]!.fallbacks++; },
      );
      const res = s.result!;
      report.rounds++;
      report.contracts[res.contract] = (report.contracts[res.contract] ?? 0) + 1;
      if (res.contractWon === true) report.contractWins[res.contract] = (report.contractWins[res.contract] ?? 0) + 1;
      for (const seat of regulars) {
        const st = stats[strategyOfSeat.get(seat)!]!;
        st.points += res.deltas[seat]!;
        st.rounds++;
        if (res.declarer === seat) {
          st.declared++;
          if (res.contractWon === true) st.declaredWon++;
        }
      }
    }
    start = nextStartingPlayer(seatKinds, start);
  }
  return report;
}
