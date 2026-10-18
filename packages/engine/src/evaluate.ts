/** Round results: bonus detection, settlement, give-up, forfeit and Trischaken. */
import { MOND, PAGAT, SZKIS, isKing, suitCard, tarock, type CardId } from './cards';
import { CONTRACTS, allowedBonuses, valatAllowed } from './contracts';
import {
  BONUS_VALUES, declarerResult, pileCount, standingsDelta, WIN_THRESHOLD,
  type BonusKind, type BonusOutcome, type Side, type ValatState,
} from './scoring';
import { contraMultiplier, type RoundResult, type RoundState } from './state';

export function sidesOf(s: RoundState): { declarerSide: number[]; defenderSide: number[] } {
  const def = CONTRACTS[s.contract!];
  const declarer = s.declarer!;
  const declarerSide =
    def.teams === 'twoVsTwo' && !s.alone && s.partner !== null ? [declarer, s.partner] : [declarer];
  return { declarerSide, defenderSide: [0, 1, 2, 3].filter((x) => !declarerSide.includes(x)) };
}

const wonCards = (s: RoundState, seats: readonly number[]): CardId[] =>
  s.tricks.filter((t) => seats.includes(t.winner)).flatMap((t) => t.plays.map((p) => p.card));

function zeroDeltas(): number[] {
  return [0, 0, 0, 0];
}

function toSeatDeltas(list: { seat: number; delta: number }[]): number[] {
  const out = zeroDeltas();
  for (const d of list) out[d.seat]! += d.delta;
  return out;
}

type Outcome = 'earned' | 'lost';
type Events = Partial<Record<BonusKind, Partial<Record<Side, Outcome>>>>;

function bonusEvents(s: RoundState, declarerSide: readonly number[], piles: Record<Side, CardId[]>): Events {
  const def = CONTRACTS[s.contract!];
  const ev: Events = {};
  const sideOf = (seat: number): Side => (declarerSide.includes(seat) ? 'declarer' : 'defender');
  const set = (k: BonusKind, side: Side, o: Outcome) => {
    (ev[k] ??= {})[side] = o;
  };

  // Ultimo-type bonuses: the card played in its trick either wins it (earned) or not (lost).
  const ultimo = (kind: BonusKind, trickIndex: number, card: CardId) => {
    const t = s.tricks[trickIndex];
    const p = t?.plays.find((x) => x.card === card);
    if (!t || !p) return;
    set(kind, sideOf(p.player), t.winningCard === card ? 'earned' : 'lost');
  };
  ultimo('pagatUltimo', 11, PAGAT);
  ultimo('uhu', 10, tarock(2));
  ultimo('kakadu', 9, tarock(3));
  ultimo('marabu', 8, tarock(4));
  if (def.calledKing && s.calledKing) ultimo('konigUltimo', 11, suitCard(s.calledKing, 7));

  // Mondfang / Sküsfang.
  for (const t of s.tricks) {
    const sz = t.plays.find((p) => p.card === SZKIS);
    if (!sz) continue;
    const szSide = sideOf(sz.player);
    if (t.winningCard === SZKIS) {
      const m = t.plays.find((p) => p.card === MOND);
      if (m && sideOf(m.player) !== szSide) set('mondfang', szSide, 'earned');
    } else if (sideOf(t.winner) !== szSide) {
      set('skusfang', sideOf(t.winner), 'earned');
    }
  }

  // Pile-based bonuses.
  for (const side of ['declarer', 'defender'] as const) {
    const pile = piles[side];
    if (pile.includes(PAGAT) && pile.includes(MOND) && pile.includes(SZKIS)) set('trull', side, 'earned');
    if (pile.filter(isKing).length === 4) set('vierKonige', side, 'earned');
  }
  return ev;
}

function bonusOutcomes(s: RoundState, ev: Events): BonusOutcome[] {
  const allowed = new Set(allowedBonuses(CONTRACTS[s.contract!]));
  const out: BonusOutcome[] = [];
  for (const kind of Object.keys(BONUS_VALUES) as BonusKind[]) {
    if (!allowed.has(kind)) continue;
    const declared = s.declaredBonuses.includes(kind);
    const d = ev[kind]?.declarer;
    if (declared) {
      out.push({ kind, side: 'declarer', outcome: d === 'earned' ? 'earned' : 'lost', announced: true, contra: contraMultiplier(s.contra, kind) });
    } else if (d) {
      out.push({ kind, side: 'declarer', outcome: d, announced: false, contra: 1 });
    }
    const f = ev[kind]?.defender;
    if (f) out.push({ kind, side: 'defender', outcome: f, announced: false, contra: 1 });
  }
  return out;
}

/** Round played to the end (or ended early by a lost negative contract). */
export function finishPlayed(s: RoundState): RoundResult {
  const def = CONTRACTS[s.contract!];
  const { declarerSide, defenderSide } = sidesOf(s);

  if (def.negativeTricks !== null) {
    const won = s.tricks.filter((t) => t.winner === s.declarer).length;
    const contractWon = won === def.negativeTricks && s.tricks.length === 12;
    const p = declarerResult({
      value: def.value, loss: def.loss, contractWon,
      contractContra: contraMultiplier(s.contra, 'contract'),
      bonuses: [], valat: { achievedBy: null, announced: false, contra: 1 },
    });
    return {
      kind: 'played', contract: def.id, declarer: s.declarer, declarerSide, defenderSide, contractWon,
      counted: null, bonuses: [], valat: null, declarerResult: p,
      deltas: toSeatDeltas(standingsDelta(declarerSide, defenderSide, p)), trischaken: null,
    };
  }

  const piles: Record<Side, CardId[]> = {
    declarer: [...wonCards(s, declarerSide), ...s.declarerExtra],
    defender: [...wonCards(s, defenderSide), ...s.defenderExtra],
  };
  const counted = { declarer: pileCount(piles.declarer), defender: pileCount(piles.defender) };
  const contractWon = counted.declarer >= WIN_THRESHOLD;

  const bonuses = bonusOutcomes(s, bonusEvents(s, declarerSide, piles));

  const winners = s.tricks.map((t) => t.winner);
  let achievedBy: Side | null = null;
  if (valatAllowed(def) && winners.length === 12) {
    if (winners.every((w) => declarerSide.includes(w))) achievedBy = 'declarer';
    else if (winners.every((w) => defenderSide.includes(w))) achievedBy = 'defender';
  }
  const valat: ValatState = { achievedBy, announced: s.declaredValat, contra: s.declaredValat ? contraMultiplier(s.contra, 'valat') : 1 };

  const p = declarerResult({
    value: def.value, loss: def.loss, contractWon,
    contractContra: contraMultiplier(s.contra, 'contract'), bonuses, valat,
  });
  return {
    kind: 'played', contract: def.id, declarer: s.declarer, declarerSide, defenderSide, contractWon,
    counted, bonuses, valat, declarerResult: p,
    deltas: toSeatDeltas(standingsDelta(declarerSide, defenderSide, p)), trischaken: null,
  };
}

/** Declarer gives up because the called king is in the Talon. */
export function finishGaveUp(s: RoundState): RoundResult {
  const def = CONTRACTS[s.contract!];
  const declarer = s.declarer!;
  const others = [0, 1, 2, 3].filter((x) => x !== declarer);
  const per = def.giveUpPerOpponent;
  const deltas = zeroDeltas();
  deltas[declarer] = -per * others.length;
  for (const o of others) deltas[o] = per;
  return {
    kind: 'gaveUp', contract: def.id, declarer, declarerSide: [declarer], defenderSide: others,
    contractWon: false, counted: null, bonuses: [], valat: null, declarerResult: -per, deltas, trischaken: null,
  };
}

/**
 * The declarer's bank ran out in a 1v3 game: the declarer loses the contract and the round ends.
 * Declared bonuses count as lost and a declared Valat counts as failed.
 */
export function finishForfeit(s: RoundState): RoundResult {
  const def = CONTRACTS[s.contract!];
  const declarer = s.declarer!;
  const defenderSide = [0, 1, 2, 3].filter((x) => x !== declarer);
  const bonuses: BonusOutcome[] = s.declaredBonuses.map((kind) => ({
    kind, side: 'declarer', outcome: 'lost', announced: true, contra: contraMultiplier(s.contra, kind),
  }));
  const valat: ValatState = { achievedBy: null, announced: s.declaredValat, contra: s.declaredValat ? contraMultiplier(s.contra, 'valat') : 1 };
  const p = declarerResult({
    value: def.value, loss: def.loss, contractWon: false,
    contractContra: contraMultiplier(s.contra, 'contract'), bonuses, valat,
  });
  return {
    kind: 'forfeit', contract: def.id, declarer, declarerSide: [declarer], defenderSide, contractWon: false,
    counted: null, bonuses, valat, declarerResult: p,
    deltas: toSeatDeltas(standingsDelta([declarer], defenderSide, p)), trischaken: null,
  };
}

/**
 * Trischaken settlement (cumulative):
 *  1. a player with more than 35 points pays 2 to each other player;
 *  2. else, if the top two are strictly above the bottom two, each of them pays 1 to each of the bottom two;
 *  3. independently, every player who won no tricks receives 2 from each other player.
 */
export function trischakenDeltas(counts: readonly number[], tricksWon: readonly number[]): number[] {
  const deltas = zeroDeltas();
  const seats = [0, 1, 2, 3];
  const over = seats.filter((x) => counts[x]! > 35);
  if (over.length > 0) {
    for (const o of over) {
      for (const x of seats) {
        if (x === o) continue;
        deltas[o]! -= 2;
        deltas[x]! += 2;
      }
    }
  } else {
    const order = [...seats].sort((a, b) => counts[b]! - counts[a]! || a - b);
    if (counts[order[1]!]! > counts[order[2]!]!) {
      for (const top of [order[0]!, order[1]!]) {
        for (const bottom of [order[2]!, order[3]!]) {
          deltas[top]! -= 1;
          deltas[bottom]! += 1;
        }
      }
    }
  }
  for (const z of seats.filter((x) => tricksWon[x] === 0)) {
    for (const x of seats) {
      if (x === z) continue;
      deltas[x]! -= 2;
      deltas[z]! += 2;
    }
  }
  return deltas;
}

export function finishTrischaken(s: RoundState): RoundResult {
  const counts = [0, 1, 2, 3].map((seat) => pileCount(wonCards(s, [seat])));
  const tricksWon = [0, 1, 2, 3].map((seat) => s.tricks.filter((t) => t.winner === seat).length);
  return {
    kind: 'trischaken', contract: 'trischaken', declarer: null, declarerSide: [], defenderSide: [],
    contractWon: null, counted: null, bonuses: [], valat: null, declarerResult: null,
    deltas: trischakenDeltas(counts, tricksWon), trischaken: { counts, tricksWon },
  };
}
