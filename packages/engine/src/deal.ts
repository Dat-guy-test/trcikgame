import { DECK_SIZE, type CardId, fullDeck } from './cards';
import { createRng, cryptoRng, shuffle } from './rng';

export interface Deal {
  /** Four hands of 12 cards, in seat order, each sorted by card id. */
  hands: [CardId[], CardId[], CardId[], CardId[]];
  /** Two piles of 3 cards. */
  talon: [CardId[], CardId[]];
}

const byId = (a: number, b: number) => a - b;

/** A full deck in an unpredictable order (cryptographic shuffle). Online rooms pass this to `newRound` instead of a seed. */
export function secureDeck(): CardId[] {
  return shuffle(fullDeck(), cryptoRng());
}

function checkDeck(deck: readonly CardId[]): readonly CardId[] {
  if (deck.length !== DECK_SIZE || new Set(deck).size !== DECK_SIZE || deck.some((c) => !Number.isInteger(c) || c < 0 || c >= DECK_SIZE)) {
    throw new Error('invalid deck: it must be a permutation of all 54 cards');
  }
  return deck;
}

/** Deals from `deck` (a full deck order) when given, otherwise from the seeded shuffle (local play, tests). */
export function deal(seed: number, deck?: readonly CardId[]): Deal {
  const order = deck ? checkDeck(deck) : shuffle(fullDeck(), createRng(seed));
  const hand = (i: number) => order.slice(i * 12, i * 12 + 12).sort(byId);
  return {
    hands: [hand(0), hand(1), hand(2), hand(3)],
    talon: [order.slice(48, 51), order.slice(51, 54)],
  };
}
