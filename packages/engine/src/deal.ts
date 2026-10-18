import { type CardId, fullDeck } from './cards';
import { createRng, shuffle } from './rng';

export interface Deal {
  /** Four hands of 12 cards, in seat order, each sorted by card id. */
  hands: [CardId[], CardId[], CardId[], CardId[]];
  /** Two piles of 3 cards. */
  talon: [CardId[], CardId[]];
}

const byId = (a: number, b: number) => a - b;

export function deal(seed: number): Deal {
  const deck = shuffle(fullDeck(), createRng(seed));
  const hand = (i: number) => deck.slice(i * 12, i * 12 + 12).sort(byId);
  return {
    hands: [hand(0), hand(1), hand(2), hand(3)],
    talon: [deck.slice(48, 51), deck.slice(51, 54)],
  };
}
