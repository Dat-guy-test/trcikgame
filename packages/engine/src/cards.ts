/**
 * Card model. See docs/rules.md (cards and points).
 *
 * Card ids are 0..53:
 *   0..31  suit cards: id = suitIndex * 8 + rankIndex   (rankIndex 0 = lowest, 7 = King)
 *   32..53 tarocks:    id = 31 + n                        (n = 1..22, 22 = Szkis)
 */

export type Suit = 'spades' | 'clubs' | 'diamonds' | 'hearts';
export const SUITS: readonly Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];

export type CardId = number;
export const DECK_SIZE = 54;
export const TAROCK_OFFSET = 31;
export const TAROCK_SUIT_INDEX = 4;

export const PAGAT: CardId = TAROCK_OFFSET + 1;
export const MOND: CardId = TAROCK_OFFSET + 21;
export const SZKIS: CardId = TAROCK_OFFSET + 22;

export type Face = 'jack' | 'rider' | 'queen' | 'king';

/** Pip labels from the lowest rank upward. Black: 7<8<9<10, red: 4<3<2<1 (reversed). */
const BLACK_PIPS = [7, 8, 9, 10] as const;
const RED_PIPS = [4, 3, 2, 1] as const;
const FACES: readonly Face[] = ['jack', 'rider', 'queen', 'king'];
const SUIT_RANK_POINTS = [1, 1, 1, 1, 2, 3, 4, 5] as const;

export type CardInfo =
  | { kind: 'suit'; suit: Suit; rankIndex: number; pip: number; face?: undefined }
  | { kind: 'suit'; suit: Suit; rankIndex: number; face: Face; pip?: undefined }
  | { kind: 'tarock'; number: number };

export function isTarock(id: CardId): boolean {
  return id >= 32;
}

/** 0..3 for the four suits, 4 for tarocks. */
export function suitIndex(id: CardId): number {
  return id < 32 ? id >> 3 : TAROCK_SUIT_INDEX;
}

export function isRedSuitIndex(i: number): boolean {
  return i === 2 || i === 3;
}

/** Tarock number 1..22. Throws for suit cards. */
export function tarockNumber(id: CardId): number {
  if (!isTarock(id)) throw new Error(`card ${id} is not a tarock`);
  return id - TAROCK_OFFSET;
}

/** Strength within the card's own suit: rankIndex (0..7) for suits, number (1..22) for tarocks. */
export function strength(id: CardId): number {
  return isTarock(id) ? id - TAROCK_OFFSET : id & 7;
}

export function isKing(id: CardId): boolean {
  return id < 32 && (id & 7) === 7;
}

export function points(id: CardId): number {
  if (isTarock(id)) {
    const n = id - TAROCK_OFFSET;
    return n === 1 || n === 21 || n === 22 ? 5 : 1;
  }
  return SUIT_RANK_POINTS[id & 7]!;
}

export function suitCard(suit: Suit | number, rankIndex: number): CardId {
  const s = typeof suit === 'number' ? suit : SUITS.indexOf(suit);
  if (s < 0 || s > 3 || rankIndex < 0 || rankIndex > 7) throw new Error('invalid suit card');
  return s * 8 + rankIndex;
}

export function tarock(n: number): CardId {
  if (n < 1 || n > 22) throw new Error('tarock number must be 1..22');
  return TAROCK_OFFSET + n;
}

export function describe(id: CardId): CardInfo {
  if (id < 0 || id >= DECK_SIZE) throw new Error(`invalid card id ${id}`);
  if (isTarock(id)) return { kind: 'tarock', number: id - TAROCK_OFFSET };
  const si = id >> 3;
  const rankIndex = id & 7;
  const suit = SUITS[si]!;
  if (rankIndex < 4) {
    const pips = isRedSuitIndex(si) ? RED_PIPS : BLACK_PIPS;
    return { kind: 'suit', suit, rankIndex, pip: pips[rankIndex]! };
  }
  return { kind: 'suit', suit, rankIndex, face: FACES[rankIndex - 4]! };
}

export function fullDeck(): CardId[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}
