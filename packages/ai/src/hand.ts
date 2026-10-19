/** Hand evaluation used by the heuristic bot's bidding. */
import { MOND, PAGAT, SZKIS, isKing, isTarock, strength, suitIndex, tarockNumber, type CardId, type ContractId } from '@tarok/engine';

export interface HandFeatures {
  tarocks: number;
  /** Tarocks numbered 16 or higher. */
  highTarocks: number;
  hasPagat: boolean;
  hasMond: boolean;
  hasSzkis: boolean;
  kings: number;
  queens: number;
  /** Riders, queens and kings. */
  courtCards: number;
  suitLengths: number[];
  voids: number;
  /** Length of the longest non-tarock suit. */
  longestSuit: number;
  /** Farben strength, fitted to forced-contract win rates: 2 per king + extra suit length beyond 4 - 0.75 per tarock beyond 2. */
  farbenScore: number;
  /** Overall playing strength (an average 12-card hand scores roughly 7 to 8). */
  rating: number;
}

export function describeHand(hand: readonly CardId[]): HandFeatures {
  const tarocks = hand.filter(isTarock);
  const suits = hand.filter((c) => !isTarock(c));
  const suitLengths = [0, 1, 2, 3].map((i) => suits.filter((c) => suitIndex(c) === i).length);
  const highTarocks = tarocks.filter((c) => tarockNumber(c) >= 16).length;
  const kings = suits.filter(isKing).length;
  const queens = suits.filter((c) => strength(c) === 6).length;
  const hasMond = tarocks.includes(MOND);
  const hasSzkis = tarocks.includes(SZKIS);
  const voids = suitLengths.filter((l) => l === 0).length;
  const rating =
    tarocks.length + (hasMond ? 2 : 0) + (hasSzkis ? 2 : 0) + 0.5 * highTarocks + 1.5 * kings + 0.5 * queens + 0.75 * voids;
  return {
    tarocks: tarocks.length, highTarocks, hasPagat: tarocks.includes(PAGAT), hasMond, hasSzkis, kings, queens,
    courtCards: suits.filter((c) => strength(c) >= 5).length, suitLengths, voids, rating,
    longestSuit: Math.max(...suitLengths),
    farbenScore: 2 * kings + (Math.max(...suitLengths) - 4) - 0.75 * Math.max(0, tarocks.length - 2),
  };
}

/** Rating thresholds. Conservative by design; tune with `pnpm tournament`. */
export const THRESHOLDS = { rufer: 9, solo: 11.5, dreier: 14, solodreier: 19, farbendreierScore: 5.5, farbensoloScore: 10, contra: 15, rekontra: 19, switchToDreier: 12.5 };

/** Contracts the bot is willing to declare with this hand. */
export function willingContracts(f: HandFeatures, isStartingPlayer: boolean): Set<ContractId> {
  const out = new Set<ContractId>();
  if (isStartingPlayer && f.rating >= THRESHOLDS.rufer) out.add('rufer');
  if (f.rating >= THRESHOLDS.solo) out.add('solo');
  if (f.rating >= THRESHOLDS.dreier) out.add('dreier');
  if (f.rating >= THRESHOLDS.solodreier) out.add('solodreier');
  // Farben (tarocks do not trump): kings and a long plain suit win tricks; many tarocks hurt (1-point tarocks must be discarded).
  if (f.farbenScore >= THRESHOLDS.farbendreierScore) out.add('farbendreier');
  if (f.farbenScore >= THRESHOLDS.farbensoloScore) out.add('farbensolo');
  if (f.tarocks === 0 && f.courtCards <= 1) out.add('bettel');
  if (f.tarocks === 1 && f.highTarocks === 0 && f.courtCards <= 1) out.add('piccolo');
  return out;
}
