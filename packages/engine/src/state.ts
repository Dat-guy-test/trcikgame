/** Round state types. Everything here is JSON-serialisable (no Maps, classes or Infinity). */
import type { CardId, Suit } from './cards';
import type { Bid } from './bidding';
import type { ContractId } from './contracts';
import type { BonusKind, BonusOutcome, ValatState } from './scoring';
import type { Play } from './tricks';

export type SeatKind = 'player' | 'dummy';

export interface RoundConfig {
  /** Exactly 4 seats in clockwise order. Dummies are extra hands controlled by a regular player. */
  seatKinds: SeatKind[];
  /** Must be a regular (non-dummy) seat. */
  startingPlayer: number;
  seed: number;
  /** Continue the contra chain past Mordkontra (x16). */
  infiniteContra: boolean;
}

export type Phase =
  | 'bidding'
  | 'declare'
  | 'contra'
  | 'kingCall'
  | 'kingInTalon'
  | 'take'
  | 'discard'
  | 'play'
  | 'done';

/** Phases that draw on the player's bank timer (from and including the king call). */
export const BANK_PHASES: readonly Phase[] = ['kingCall', 'kingInTalon', 'take', 'discard', 'play'];

export type ContraTarget = 'contract' | BonusKind | 'valat';

export interface ContraState {
  /** Number of raises per item: 1 = Kontra (x2), 2 = Rekontra (x4), 3 = Subcontra (x8), 4 = Mordkontra (x16). */
  levels: Record<string, number>;
  /** Whose raise is next: opponents (odd levels) or the declarer (even levels). */
  side: 'opp' | 'decl';
  /** Seats that still have to answer in this turn. */
  toAct: number[];
}

export interface CompletedTrick {
  leader: number;
  plays: Play[];
  winner: number;
  winningCard: CardId;
}

export interface RoundResult {
  kind: 'played' | 'gaveUp' | 'forfeit' | 'trischaken' | 'reshuffle';
  contract: ContractId;
  declarer: number | null;
  declarerSide: number[];
  defenderSide: number[];
  contractWon: boolean | null;
  /** Counted card points of both sides (positive contracts played to the end). */
  counted: { declarer: number; defender: number } | null;
  bonuses: BonusOutcome[];
  valat: ValatState | null;
  /** Declarer-side result P before it is turned into standings. */
  declarerResult: number | null;
  /** Standings change per seat (sums to zero). */
  deltas: number[];
  trischaken: { counts: number[]; tricksWon: number[] } | null;
}

export interface RoundState {
  config: RoundConfig;
  phase: Phase;
  hands: CardId[][];
  /** The two Talon piles. Emptied once the cards have been taken or handed to the defenders. */
  talon: CardId[][];
  talonRevealed: boolean;
  /** Public copy of the Talon as revealed. */
  talonSeen: CardId[][] | null;

  currentBid: Bid | null;
  bidder: number | null;
  /** Seats that still have to answer in the current bidding circle. */
  toAct: number[];
  awaitingConfirm: boolean;

  contract: ContractId | null;
  take: number;
  declarer: number | null;
  declaredBonuses: BonusKind[];
  declaredValat: boolean;
  contra: ContraState | null;

  calledKing: Suit | null;
  /** Declarer plays alone in a called-king contract. */
  alone: boolean;
  /** Seat of the called king's holder, revealed when the king is played. */
  partner: number | null;

  /** Cards the declarer discarded (count for the declarer side). */
  declarerExtra: CardId[];
  /** Talon cards that went to the defenders. */
  defenderExtra: CardId[];

  leader: number;
  trick: Play[];
  tricks: CompletedTrick[];
  ouvertRevealed: boolean;
  /** Trischaken: the regular player currently controlling the dummy. */
  trischakenController: number;

  result: RoundResult | null;
}

export function isRegular(cfg: RoundConfig, seat: number): boolean {
  return cfg.seatKinds[seat] === 'player';
}

/** Regular seats in clockwise order, starting at `from` (inclusive). */
export function regularSeatsFrom(cfg: RoundConfig, from: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 4; i++) {
    const seat = (from + i) % 4;
    if (isRegular(cfg, seat)) out.push(seat);
  }
  return out;
}

/** Next regular seat clockwise after `current`: the starting-player rotation skips dummies. */
export function nextStartingPlayer(seatKinds: readonly SeatKind[], current: number): number {
  for (let i = 1; i <= 4; i++) {
    const seat = (current + i) % 4;
    if (seatKinds[seat] === 'player') return seat;
  }
  throw new Error('no regular players');
}

export function contraMultiplier(contra: ContraState | null, key: string): number {
  return 2 ** (contra?.levels[key] ?? 0);
}
