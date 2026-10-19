/**
 * Forced-contract benchmark: seat 0 declares a chosen contract on every deal whose declarer hand passes `filter`,
 * the other seats defend. Used to tune play for contracts that rarely come up in normal tournaments.
 */
import { apply, createRng, defaultBid, expectedActor, newRound, viewFor, type CardId, type ContractId } from '@tarok/engine';
import { resolveAction, type Strategy } from './strategy';

export interface ForcedOptions {
  contract: ContractId;
  declarer: Strategy;
  defenders: Strategy;
  /** Number of accepted deals to play. */
  deals: number;
  seed: number;
  /** Only deals whose declarer hand (12 cards) passes are played. */
  filter?: (hand: readonly CardId[]) => boolean;
  /** Give up after this many dealt hands (default 200 x deals). */
  maxAttempts?: number;
}

export interface ForcedSample {
  hand: CardId[];
  won: boolean;
  /** Declarer's standings change. */
  delta: number;
  /** Counted declarer points (positive contracts). */
  counted: number | null;
}

function playForced(seed: number, contract: ContractId, declarer: Strategy, defenders: Strategy): ForcedSample | null {
  let s = newRound({ seatKinds: ['player', 'player', 'player', 'player'], startingPlayer: 0, seed, infiniteContra: false });
  const hand = [...s.hands[0]!];
  const rng = createRng(seed ^ 0x5bd1e995);
  s = apply(s, 0, { type: 'bid', bid: defaultBid(contract) });
  for (const seat of [1, 2, 3]) s = apply(s, seat, { type: 'pass' });
  s = apply(s, 0, { type: 'confirm' });
  if (s.phase === 'declare') s = apply(s, 0, { type: 'declare', bonuses: [], valat: false });
  while (s.phase === 'contra') s = apply(s, expectedActor(s)!, { type: 'noContra' });
  for (let guard = 0; s.phase !== 'done'; guard++) {
    if (guard > 1000) throw new Error('round did not terminate');
    const actor = expectedActor(s)!;
    s = apply(s, actor, resolveAction(actor === 0 ? declarer : defenders, viewFor(s, actor), rng).action);
  }
  const r = s.result!;
  return { hand, won: r.contractWon === true, delta: r.deltas[0]!, counted: r.counted?.declarer ?? null };
}

export interface ForcedVariant {
  name: string;
  declarer: Strategy;
  defenders: Strategy;
}

/** Plays every accepted deal once per variant (same cards, same random stream), for paired comparisons. */
export function runForcedComparison(
  opts: Omit<ForcedOptions, 'declarer' | 'defenders'>, variants: readonly ForcedVariant[],
): Record<string, ForcedSample[]> {
  const out: Record<string, ForcedSample[]> = Object.fromEntries(variants.map((v) => [v.name, []]));
  const attempts = opts.maxAttempts ?? opts.deals * 200;
  let accepted = 0;
  for (let a = 0; a < attempts && accepted < opts.deals; a++) {
    const seed = (opts.seed * 7919 + a) >>> 0;
    if (opts.filter) {
      const hand = newRound({ seatKinds: ['player', 'player', 'player', 'player'], startingPlayer: 0, seed, infiniteContra: false }).hands[0]!;
      if (!opts.filter(hand)) continue;
    }
    accepted++;
    for (const v of variants) out[v.name]!.push(playForced(seed, opts.contract, v.declarer, v.defenders)!);
  }
  return out;
}

export function runForcedContract(opts: ForcedOptions): ForcedSample[] {
  const variant = { name: 'x', declarer: opts.declarer, defenders: opts.defenders };
  return runForcedComparison(opts, [variant])['x']!;
}
