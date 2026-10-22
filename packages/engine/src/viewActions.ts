/**
 * Legal actions derived from a RoundView alone, so bots and UIs never need the full state.
 * Mirrors `legalActions` / `isValidTake` / `isValidDiscard` in round.ts (a property test keeps them equal).
 */
import { SUITS, isTarock, points, type CardId } from './cards';
import { bidOptionsOf, leftBehind, outbids, outbidsOwnBid, type Bid } from './bidding';
import { CONTRACTS, allowedBonuses, isNegative, valatAllowed } from './contracts';
import type { Action, LegalAction } from './round';
import type { BonusKind } from './scoring';
import type { ContraTarget } from './state';
import { legalPlays } from './tricks';
import type { RoundView } from './view';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

const ALL_BIDS: readonly Bid[] = Object.values(CONTRACTS)
  .filter((d) => d.biddable)
  .flatMap((d) => {
    const takes = d.take === 0 ? [0] : Array.from({ length: d.take }, (_, i) => i + 1);
    const bonusSets: BonusKind[][] = d.needsBonusDeclaration ? allowedBonuses(d).map((b) => [b]) : [[]];
    return takes.flatMap((take) => bonusSets.map((bonuses) => ({ contract: d.id, take, bonuses })));
  });

export function isValidTakeView(v: RoundView, cards: readonly CardId[]): boolean {
  const piles = v.talon.piles;
  if (!piles || piles.length !== 2 || v.contract === null) return false;
  if (new Set(cards).size !== cards.length || cards.length !== v.take) return false;
  const p0 = piles[0]!;
  const p1 = piles[1]!;
  if (!cards.every((c) => p0.includes(c) || p1.includes(c))) return false;
  const { fromA, fromB } = leftBehind(v.contract, v.take);
  const left0 = p0.length - cards.filter((c) => p0.includes(c)).length;
  const left1 = p1.length - cards.filter((c) => p1.includes(c)).length;
  return (left0 === fromA && left1 === fromB) || (left1 === fromA && left0 === fromB);
}

/** Every legal Talon take (take phase, viewed by the declarer). */
export function takeOptions(v: RoundView): CardId[][] {
  const cards = (v.talon.piles ?? []).flat();
  const out: CardId[][] = [];
  for (let mask = 1; mask < 1 << cards.length; mask++) {
    const subset = cards.filter((_, i) => (mask >> i) & 1);
    if (subset.length === v.take && isValidTakeView(v, subset)) out.push(subset);
  }
  return out;
}

export function discardRulesView(v: RoundView): { eligible: CardId[]; requiredTarocks: number } {
  const hand = v.hands[v.declarer ?? -1] ?? [];
  const eligible = hand.filter((c) => points(c) < 5);
  const farben = v.contract !== null && CONTRACTS[v.contract].farben;
  const requiredTarocks = farben ? Math.min(v.take, eligible.filter(isTarock).length) : 0;
  return { eligible, requiredTarocks };
}

export function isValidDiscardView(v: RoundView, cards: readonly CardId[]): boolean {
  if (new Set(cards).size !== cards.length || cards.length !== v.take) return false;
  const { eligible, requiredTarocks } = discardRulesView(v);
  if (!cards.every((c) => eligible.includes(c))) return false;
  const farben = v.contract !== null && CONTRACTS[v.contract].farben;
  return !farben || cards.filter(isTarock).length === requiredTarocks;
}

/** Items the given side may raise next: opponents raise even levels, the declarer odd levels. */
export function raiseableFromView(v: RoundView, side: 'opp' | 'decl'): string[] {
  const max = v.infiniteContra ? Number.POSITIVE_INFINITY : 4;
  return Object.keys(v.contraLevels).filter((k) => {
    const lv = v.contraLevels[k]!;
    return lv < max && (side === 'opp' ? lv % 2 === 0 : lv % 2 === 1);
  });
}

/**
 * Legal actions for the viewer. Empty unless the viewer is the seat that must act (for a dummy's card,
 * that is its controller). Same exceptions as `legalActions`: one canonical discard, limited declarations.
 */
export function legalActionsFromView(v: RoundView): LegalAction[] {
  const actor = v.expectedActor;
  if (actor === null || actor !== v.seat) return [];
  const out: LegalAction[] = [];
  const add = (action: Action) => out.push({ actor, action });
  const def = v.contract ? CONTRACTS[v.contract] : null;

  switch (v.phase) {
    case 'bidding': {
      const isSP = actor === v.startingPlayer;
      const opts = bidOptionsOf(v);
      if (v.awaitingConfirm) {
        add({ type: 'confirm' });
        for (const bid of ALL_BIDS) if (outbidsOwnBid(v.currentBid!, bid, isSP, opts)) add({ type: 'bid', bid: clone(bid) });
      } else {
        add({ type: 'pass' });
        for (const bid of ALL_BIDS) if (outbids(v.currentBid, bid, isSP, opts)) add({ type: 'bid', bid: clone(bid) });
      }
      break;
    }
    case 'declare': {
      add({ type: 'declare', bonuses: [], valat: false });
      for (const b of allowedBonuses(def!)) {
        if (!v.declaredBonuses.includes(b)) add({ type: 'declare', bonuses: [b], valat: false });
      }
      if (valatAllowed(def!)) add({ type: 'declare', bonuses: [], valat: true });
      break;
    }
    case 'contra': {
      add({ type: 'noContra' });
      const side = actor === v.declarer ? 'decl' : 'opp';
      for (const target of raiseableFromView(v, side)) add({ type: 'contra', target: target as ContraTarget });
      break;
    }
    case 'kingCall':
      for (const suit of SUITS) add({ type: 'callKing', suit });
      break;
    case 'kingInTalon':
      for (const choice of ['giveUp', 'playAlone', 'switchToDreier'] as const) add({ type: 'kingInTalon', choice });
      break;
    case 'take':
      for (const cards of takeOptions(v)) add({ type: 'take', cards });
      break;
    case 'discard': {
      const { eligible, requiredTarocks } = discardRulesView(v);
      const sorted = [...eligible].sort((a, b) => points(a) - points(b) || a - b);
      const tarocks = sorted.filter(isTarock).slice(0, requiredTarocks);
      const rest = sorted.filter((c) => !tarocks.includes(c) && !(def!.farben && isTarock(c)));
      const pool = def!.farben ? [...tarocks, ...rest] : sorted;
      add({ type: 'discard', cards: pool.slice(0, v.take) });
      break;
    }
    case 'play': {
      const seat = (v.leader + v.trick.length) % 4;
      const hand = v.hands[seat];
      if (!hand) break;
      for (const card of legalPlays(hand, v.trick, { farben: def!.farben, negative: isNegative(def!) })) {
        add({ type: 'play', card });
      }
      break;
    }
    case 'done':
      break;
  }
  return out;
}

const canon = (x: unknown): string =>
  JSON.stringify(x, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : val);

/** Is `action` legal for the viewer? Accepts any valid take / discard subset, like `apply`. */
export function isLegalFromView(v: RoundView, action: Action): boolean {
  if (v.expectedActor === null || v.expectedActor !== v.seat) return false;
  if (action.type === 'take') return v.phase === 'take' && isValidTakeView(v, action.cards);
  if (action.type === 'discard') return v.phase === 'discard' && isValidDiscardView(v, action.cards);
  const key = canon(action);
  return legalActionsFromView(v).some((a) => canon(a.action) === key);
}
