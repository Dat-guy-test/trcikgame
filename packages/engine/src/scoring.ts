/** Pile counting and settlement. See docs/rules.md (scoring). */
import { type CardId, points } from './cards';

/** Counted points needed for the declarer side to win a positive contract. */
export const WIN_THRESHOLD = 36;
/** Counted points always add up to this across two complementary piles. */
export const COUNTED_TOTAL = 70;

/**
 * "Triples minus 2, leftover cards minus 1" in closed form:
 * sum - 2*floor(n/3) - (1 if n mod 3 != 0).
 */
export function pileCount(cards: readonly CardId[]): number {
  let sum = 0;
  for (const c of cards) sum += points(c);
  const n = cards.length;
  return sum - 2 * Math.floor(n / 3) - (n % 3 !== 0 ? 1 : 0);
}

export type BonusKind =
  | 'trull'
  | 'vierKonige'
  | 'mondfang'
  | 'skusfang'
  | 'konigUltimo'
  | 'pagatUltimo'
  | 'uhu'
  | 'kakadu'
  | 'marabu';

export const BONUS_VALUES: Readonly<Record<BonusKind, { silent: number; announced: number }>> = {
  trull: { silent: 1, announced: 2 },
  vierKonige: { silent: 1, announced: 2 },
  mondfang: { silent: 1, announced: 2 },
  skusfang: { silent: 2, announced: 4 },
  konigUltimo: { silent: 1, announced: 2 },
  pagatUltimo: { silent: 1, announced: 2 },
  uhu: { silent: 2, announced: 4 },
  kakadu: { silent: 3, announced: 6 },
  marabu: { silent: 4, announced: 8 },
};

export type Side = 'declarer' | 'defender';

export interface BonusOutcome {
  kind: BonusKind;
  /** Which side earned or lost it. Only the declarer side can announce. */
  side: Side;
  outcome: 'earned' | 'lost';
  announced: boolean;
  /** Contra multiplier on this declared bonus (1 if none or silent). */
  contra: number;
}

export interface ValatState {
  /** The side that won all 12 tricks, if any. */
  achievedBy: Side | null;
  /** Declared by the declarer before play. */
  announced: boolean;
  /** Contra multiplier on a declared Valat (1 if none). */
  contra: number;
}

export interface SettlementInput {
  value: number;
  loss: number;
  /** Whether the declarer side reached the contract's goal on cards / tricks. */
  contractWon: boolean;
  contractContra: number;
  bonuses: readonly BonusOutcome[];
  valat: ValatState;
}

/**
 * Declarer-side result P (may be negative):
 *   Q = s * base * m_contract + sum( d_b * v_b * m_b )      (non-Valat bonuses)
 *   P = Q * K, K = valat multiplier (4 silent / 8 declared, times its contra), else 1.
 * A declared Valat that was not achieved still applies its multiplier, but the
 * declarer loses the contract.
 */
export function declarerResult(input: SettlementInput): number {
  const { valat } = input;
  const declaredValatFailed = valat.announced && valat.achievedBy !== 'declarer';
  const won = declaredValatFailed ? false : input.contractWon;

  let q = (won ? input.value : -input.loss) * input.contractContra;
  for (const b of input.bonuses) {
    const v = b.announced ? BONUS_VALUES[b.kind].announced : BONUS_VALUES[b.kind].silent;
    const favoursDeclarer = (b.side === 'declarer') === (b.outcome === 'earned');
    q += (favoursDeclarer ? 1 : -1) * v * (b.announced ? b.contra : 1);
  }

  let k = 1;
  if (declaredValatFailed) k = 8 * valat.contra;
  else if (valat.achievedBy !== null) {
    k = valat.announced && valat.achievedBy === 'declarer' ? 8 * valat.contra : 4;
  }
  return q * k;
}

export interface Delta {
  seat: number;
  delta: number;
}

/**
 * Turns the declarer-side result P into per-seat standings changes.
 * 2v2: every declarer-side seat gets +P, every defender -P.
 * 1v3: the declarer gets P from each opponent. Always sums to zero.
 */
export function standingsDelta(
  declarerSide: readonly number[],
  defenderSide: readonly number[],
  p: number,
): Delta[] {
  const soloDeclarer = declarerSide.length === 1;
  return [
    ...declarerSide.map((seat) => ({ seat, delta: soloDeclarer ? p * defenderSide.length : p })),
    ...defenderSide.map((seat) => ({ seat, delta: -p })),
  ];
}
