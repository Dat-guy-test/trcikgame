/**
 * Per-player projection of the round. This is the only thing that may be sent to a client:
 * hidden hands, the unrevealed Talon and other players' discards never appear in it.
 */
import { suitCard, type CardId, type Suit } from './cards';
import type { Bid } from './bidding';
import type { ContractId } from './contracts';
import { expectedActor } from './round';
import type { BonusKind } from './scoring';
import type { CompletedTrick, Phase, RoundResult, RoundState, SeatKind } from './state';
import type { Play } from './tricks';

export interface RoundView {
  seat: number;
  phase: Phase;
  seatKinds: SeatKind[];
  startingPlayer: number;
  /** The contra chain continues past Mordkontra (x16). */
  infiniteContra: boolean;
  /** `null` = hidden hand. Own hand, dummy hands (after bidding) and all hands in Ouvert (after trick 1) are visible. */
  hands: (CardId[] | null)[];
  handSizes: number[];
  talon: { revealed: boolean; piles: CardId[][] | null };
  /** Public: the Talon cards the declarer took (null until they have taken; empty when no card was taken). The rest went to the defenders. */
  talonTaken: CardId[] | null;
  currentBid: Bid | null;
  bidder: number | null;
  awaitingConfirm: boolean;
  toAct: number[];
  contract: ContractId | null;
  take: number;
  declarer: number | null;
  declaredBonuses: BonusKind[];
  declaredValat: boolean;
  contraLevels: Record<string, number>;
  calledKing: Suit | null;
  /** Revealed partner (after the called king was played). */
  partner: number | null;
  /** The viewer holds the called king and is the declarer's secret partner. */
  isPartner: boolean;
  /** Only the declarer sees the discards; everyone sees how many there are. */
  discards: CardId[] | null;
  discardCount: number;
  leader: number;
  trick: Play[];
  tricks: CompletedTrick[];
  expectedActor: number | null;
  result: RoundResult | null;
}

/** Dummy hands are hidden until play starts. `seat` -1 gives the public view of a spectator (no hands, no secret partner). */
export function viewFor(s: RoundState, seat: number): RoundView {
  // Dummy hands become public when play starts, i.e. once the declarer is done with the Talon (take and discard, or no Talon).
  const playStarted = s.phase === 'play' || s.phase === 'done';
  const visible = (i: number): boolean =>
    i === seat || (playStarted && s.config.seatKinds[i] === 'dummy') || s.ouvertRevealed;
  const talonTaken =
    s.talonSeen !== null && s.talon.flat().length === 0 ? s.talonSeen.flat().filter((c) => !s.defenderExtra.includes(c)) : null;

  const king = s.calledKing ? suitCard(s.calledKing, 7) : null;
  const isPartner =
    king !== null && seat !== s.declarer && s.phase !== 'bidding' && (s.partner === seat || (s.hands[seat]?.includes(king) ?? false));

  return {
    seat,
    phase: s.phase,
    seatKinds: [...s.config.seatKinds],
    startingPlayer: s.config.startingPlayer,
    infiniteContra: s.config.infiniteContra,
    hands: s.hands.map((h, i) => (visible(i) ? [...h] : null)),
    handSizes: s.hands.map((h) => h.length),
    talon: { revealed: s.talonRevealed, piles: s.talonSeen ? s.talonSeen.map((p) => [...p]) : null },
    talonTaken,
    currentBid: s.currentBid,
    bidder: s.bidder,
    awaitingConfirm: s.awaitingConfirm,
    toAct: [...s.toAct],
    contract: s.contract,
    take: s.take,
    declarer: s.declarer,
    declaredBonuses: [...s.declaredBonuses],
    declaredValat: s.declaredValat,
    contraLevels: { ...(s.contra?.levels ?? {}) },
    calledKing: s.calledKing,
    partner: s.partner,
    isPartner,
    discards: seat === s.declarer ? [...s.declarerExtra] : null,
    discardCount: s.declarerExtra.length,
    leader: s.leader,
    trick: s.trick.map((p) => ({ ...p })),
    tricks: s.tricks.map((t) => ({ ...t, plays: t.plays.map((p) => ({ ...p })) })),
    expectedActor: expectedActor(s),
    result: s.result,
  };
}
