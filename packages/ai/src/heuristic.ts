/**
 * Heuristic bot. Decides from a RoundView only. Conservative: bids by hand rating, never declares
 * bonuses, never calls contra unless very strong. Untuned: use `pnpm tournament` to compare changes.
 */
import {
  CONTRACTS, MOND, PAGAT, SUITS, SZKIS, bidValue, discardRulesView, isKing, isTarock, isValidDiscardView,
  legalActionsFromView, points, strength, suitCard, suitIndex, takeOptions, tarockNumber, trickWinnerIndex,
  type Action, type Bid, type CardId, type RoundView, type Suit,
} from '@tarok/engine';
import { describeHand, THRESHOLDS, willingContracts, type HandFeatures } from './hand';
import type { Strategy } from './strategy';

export interface HeuristicOptions {
  name: string;
  /** Farben: lead sure winners first (declarer / defenders). */
  farbenMastersDeclarer: boolean;
  farbenMastersDefenders: boolean;
  /** Farben Talon pick: bonus per card that belongs to the hand's longest plain suit. */
  farbenTakeSuitBonus: number;
  /** Farben declarer: when dumping, give away cards outside the longest suit first. */
  farbenDumpKeepSuit: boolean;
}

export const DEFAULT_OPTIONS: HeuristicOptions = {
  name: 'heuristic',
  farbenMastersDeclarer: true,
  farbenMastersDefenders: true,
  farbenTakeSuitBonus: 1,
  farbenDumpKeepSuit: false,
};

/** How good a card is to own (used for Talon picks and discards). */
function cardWeight(c: CardId, farben = false): number {
  if (isTarock(c)) {
    // In Farben the tarocks are just another suit: only the top ones are worth anything.
    if (farben) return 0.3 + tarockNumber(c) * 0.06 + (c === SZKIS || c === MOND ? 1 : 0);
    return 1 + tarockNumber(c) * 0.15 + (c === MOND || c === SZKIS ? 3 : 0) + (c === PAGAT ? 0.5 : 0);
  }
  switch (strength(c)) {
    case 7: return 4;
    case 6: return 2.5;
    case 5: return 1.5;
    case 4: return 1;
    default: return 0.3;
  }
}

/** Comparable "highness" across suits and tarocks. */
const rank = (c: CardId): number => (isTarock(c) ? 100 + tarockNumber(c) : strength(c));
/** What it costs to give this card away. */
const cost = (c: CardId): number => points(c) * 1000 + rank(c);

const minBy = (cs: readonly CardId[], key: (c: CardId) => number): CardId =>
  cs.reduce((best, c) => (key(c) < key(best) ? c : best));
const maxBy = (cs: readonly CardId[], key: (c: CardId) => number): CardId =>
  cs.reduce((best, c) => (key(c) > key(best) ? c : best));

/** Every card that is known to have left the game (played, or discarded by this viewer). */
function knownCards(v: RoundView): Set<CardId> {
  const known = new Set<CardId>();
  for (const t of v.tricks) for (const p of t.plays) known.add(p.card);
  for (const p of v.trick) known.add(p.card);
  for (const c of v.discards ?? []) known.add(c);
  return known;
}

/** In Farben a card is a sure winner of its suit when every higher card is played or in the viewer's hand. */
function isMaster(c: CardId, known: ReadonlySet<CardId>, hand: readonly CardId[]): boolean {
  const end = isTarock(c) ? 53 : c | 7;
  for (let h = c + 1; h <= end; h++) if (!known.has(h) && !hand.includes(h)) return false;
  return true;
}

function chooseBid(v: RoundView, f: HandFeatures, legal: readonly Action[]): Action {
  if (v.awaitingConfirm) return { type: 'confirm' };
  const willing = willingContracts(f, v.seat === v.startingPlayer);
  const current = v.currentBid ? bidValue(v.currentBid) : -1;
  let best: Bid | null = null;
  for (const a of legal) {
    if (a.type !== 'bid') continue;
    const b = a.bid;
    if (!willing.has(b.contract) || b.take !== CONTRACTS[b.contract].take) continue;
    if (bidValue(b) <= current) continue; // no holds
    if (best === null || bidValue(b) > bidValue(best)) best = b;
  }
  return best ? { type: 'bid', bid: best } : { type: 'pass' };
}

function chooseContra(v: RoundView, f: HandFeatures, legal: readonly Action[]): Action {
  const raise = legal.find((a) => a.type === 'contra' && a.target === 'contract');
  const limit = v.seat === v.declarer ? THRESHOLDS.rekontra : THRESHOLDS.contra;
  return raise && f.rating >= limit ? raise : { type: 'noContra' };
}

function chooseKing(hand: readonly CardId[]): Action {
  const missing = SUITS.filter((s) => !hand.includes(suitCard(s, 7)));
  const pool: readonly Suit[] = missing.length > 0 ? missing : SUITS;
  const len = (s: Suit) => hand.filter((c) => !isTarock(c) && suitIndex(c) === SUITS.indexOf(s)).length;
  const best = pool.reduce((b, s) => (len(s) > len(b) ? s : b));
  return { type: 'callKing', suit: best };
}

function chooseTake(v: RoundView, o: HeuristicOptions): Action {
  const options = takeOptions(v);
  const king = v.calledKing ? suitCard(v.calledKing, 7) : null;
  const farben = v.contract !== null && CONTRACTS[v.contract].farben;
  const hand = v.hands[v.seat] ?? [];
  const lens = [0, 1, 2, 3].map((i) => hand.filter((c) => !isTarock(c) && suitIndex(c) === i).length);
  const longest = lens.indexOf(Math.max(...lens));
  const score = (cs: readonly CardId[]) =>
    cs.reduce((s, c) => s + cardWeight(c, farben) + (farben && !isTarock(c) && suitIndex(c) === longest ? o.farbenTakeSuitBonus : 0), 0) +
    (king !== null && cs.includes(king) ? 6 : 0);
  let best = options[0]!;
  for (const cs of options) if (score(cs) > score(best)) best = cs;
  return { type: 'take', cards: best };
}

function chooseDiscard(v: RoundView, legal: readonly Action[]): Action {
  const hand = v.hands[v.seat] ?? [];
  const { eligible, requiredTarocks } = discardRulesView(v);
  const farben = v.contract !== null && CONTRACTS[v.contract].farben;
  const lenOf = (c: CardId) => hand.filter((x) => !isTarock(x) && suitIndex(x) === suitIndex(c)).length;
  const tarocks = eligible.filter(isTarock).sort((a, b) => a - b);
  // Short suits first (to create voids), then the least valuable cards.
  const plain = eligible.filter((c) => !isTarock(c)).sort((a, b) => lenOf(a) - lenOf(b) || cardWeight(a, farben) - cardWeight(b, farben) || a - b);
  const ordered = farben ? [...tarocks.slice(0, requiredTarocks), ...plain] : [...plain, ...tarocks];
  const cards = ordered.slice(0, v.take);
  return isValidDiscardView(v, cards) ? { type: 'discard', cards } : legal[0]!;
}

// ---------------------------------------------------------------------------------------------
// Card play

function choosePlay(v: RoundView, legalCards: readonly CardId[], o: HeuristicOptions): CardId {
  if (legalCards.length === 1) return legalCards[0]!;
  const def = CONTRACTS[v.contract!];
  const ps = (v.leader + v.trick.length) % 4;
  const farben = def.farben;
  const leading = v.trick.length === 0;
  const wins = (c: CardId) => trickWinnerIndex([...v.trick, { player: ps, card: c }], farben) === v.trick.length;

  if (def.negativeTricks !== null || v.contract === 'trischaken') {
    return chooseNegativePlay(v, legalCards, ps, wins);
  }

  // Positive contracts. Which side is a seat on, as far as this viewer knows?
  const king = v.calledKing ? suitCard(v.calledKing, 7) : null;
  const declSide = (seat: number): boolean => {
    if (seat === v.declarer) return true;
    if (def.teams === 'oneVsThree') return false;
    if (v.partner !== null) return seat === v.partner;
    if (v.isPartner && seat === v.seat) return true;
    return king !== null && (v.hands[seat]?.includes(king) ?? false) && v.seat === v.declarer;
  };
  const mine = declSide(ps);

  if (leading) {
    const tarocks = legalCards.filter(isTarock);
    const kings = legalCards.filter(isKing);
    const special = (c: CardId) => c === MOND || c === SZKIS || c === PAGAT;
    if (farben && (mine ? o.farbenMastersDeclarer : o.farbenMastersDefenders)) {
      // Cash sure winners first, from the longest suit.
      const hand = v.hands[ps] ?? [];
      const known = knownCards(v);
      const masters = legalCards.filter((c) => isMaster(c, known, hand));
      const lenIn = (c: CardId) => hand.filter((x) => suitIndex(x) === suitIndex(c)).length;
      if (masters.length > 0) return maxBy(masters, (c) => lenIn(c) * 100 + rank(c));
    }
    if (farben && mine) {
      // Run the longest plain suit from the top (its king first), cash other kings later.
      const len = (c: CardId) => legalCards.filter((x) => suitIndex(x) === suitIndex(c)).length;
      const plainCards = legalCards.filter((c) => !isTarock(c));
      if (plainCards.length > 0) return maxBy(plainCards, (c) => len(c) * 100 + rank(c));
    }
    if (!farben && mine && tarocks.length >= 6) {
      const draw = tarocks.filter((c) => !special(c));
      return draw.length > 0 ? maxBy(draw, rank) : minBy(tarocks, rank);
    }
    if (kings.length > 0) return kings[0]!;
    const plain = legalCards.filter((c) => !isTarock(c));
    return minBy(plain.length > 0 ? plain : legalCards, cost);
  }

  let dumpKey = cost;
  if (farben && mine && o.farbenDumpKeepSuit) {
    const hand = v.hands[ps] ?? [];
    const lens = [0, 1, 2, 3].map((i) => hand.filter((c) => !isTarock(c) && suitIndex(c) === i).length);
    const longest = lens.indexOf(Math.max(...lens));
    dumpKey = (c) => cost(c) + (!isTarock(c) && suitIndex(c) === longest ? 500 : 0);
  }

  const winIdx = trickWinnerIndex(v.trick, farben);
  const winSeat = v.trick[winIdx]!.player;
  const friendWinning = winSeat === ps || declSide(winSeat) === mine;
  const last = v.trick.length === 3;

  if (friendWinning) {
    return last ? maxBy(legalCards, (c) => points(c) * 1000 - rank(c)) : minBy(legalCards, dumpKey);
  }
  const winners = legalCards.filter(wins);
  if (winners.length > 0) {
    const w = minBy(winners, rank);
    const tablePoints = v.trick.reduce((s, p) => s + points(p.card), 0);
    const expensive = isTarock(w) && tarockNumber(w) >= 17;
    if (!(expensive && !last && tablePoints <= 3)) return w;
  }
  return minBy(legalCards, dumpKey);
}

function chooseNegativePlay(
  v: RoundView, legalCards: readonly CardId[], ps: number, wins: (c: CardId) => boolean,
): CardId {
  const leading = v.trick.length === 0;
  const losers = legalCards.filter((c) => !wins(c));

  if (v.contract === 'trischaken') {
    if (leading) return minBy(legalCards, rank);
    // Feed points to whoever wins; if winning is forced, take as few points as possible.
    return losers.length > 0 ? maxBy(losers, cost) : minBy(legalCards, cost);
  }

  const def = CONTRACTS[v.contract!];
  if (ps === v.declarer) {
    const won = v.tricks.filter((t) => t.winner === v.declarer).length;
    const needed = def.negativeTricks! - won;
    const remaining = 12 - v.tricks.length;
    if (needed > 0 && remaining <= needed) {
      const winners = legalCards.filter(wins);
      if (leading) return maxBy(legalCards, rank);
      if (winners.length > 0) return maxBy(winners, rank);
    }
    if (leading) return minBy(legalCards, rank);
    return losers.length > 0 ? maxBy(losers, rank) : minBy(legalCards, rank);
  }
  // Opponents of a negative contract: play low so the declarer is forced to beat us.
  return minBy(legalCards, rank);
}

export function createHeuristicBot(options: Partial<HeuristicOptions> = {}): Strategy {
  const o: HeuristicOptions = { ...DEFAULT_OPTIONS, ...options };
  return {
  name: o.name,
  choose(v, _rng): Action {
    const legal = legalActionsFromView(v).map((a) => a.action);
    if (legal.length === 0) throw new Error('not this seat\'s turn');
    const hand = v.hands[v.seat] ?? [];
    const f = describeHand(hand);
    switch (v.phase) {
      case 'bidding': return chooseBid(v, f, legal);
      case 'declare': return { type: 'declare', bonuses: [], valat: false };
      case 'contra': return chooseContra(v, f, legal);
      case 'kingCall': return chooseKing(hand);
      case 'kingInTalon':
        return { type: 'kingInTalon', choice: f.rating >= THRESHOLDS.switchToDreier ? 'switchToDreier' : 'playAlone' };
      case 'take': return chooseTake(v, o);
      case 'discard': return chooseDiscard(v, legal);
      case 'play': {
        const cards = legal.flatMap((a) => (a.type === 'play' ? [a.card] : []));
        return { type: 'play', card: choosePlay(v, cards, o) };
      }
      default: return legal[0]!;
    }
  },
};
}

export const heuristicBot: Strategy = createHeuristicBot();
