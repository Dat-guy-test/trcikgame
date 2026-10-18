import { describe as suite, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DECK_SIZE, MOND, PAGAT, SZKIS, describe, fullDeck, isKing, isTarock, points, suitCard, tarock,
  deal, pileCount, createRng, shuffle, COUNTED_TOTAL,
} from '../src';

suite('deck', () => {
  it('has 54 unique cards, 22 tarocks and 4 kings', () => {
    const deck = fullDeck();
    expect(new Set(deck).size).toBe(DECK_SIZE);
    expect(deck.filter(isTarock)).toHaveLength(22);
    expect(deck.filter(isKing)).toHaveLength(4);
  });

  it('raw card points total 106', () => {
    expect(fullDeck().reduce((s, c) => s + points(c), 0)).toBe(106);
  });

  it('values the special tarocks at 5 and the rest at 1', () => {
    expect([PAGAT, MOND, SZKIS].map(points)).toEqual([5, 5, 5]);
    expect(points(tarock(2))).toBe(1);
    expect(points(tarock(20))).toBe(1);
  });

  it('values suit cards: pips 1, jack 2, rider 3, queen 4, king 5', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((r) => points(suitCard('spades', r)))).toEqual([1, 1, 1, 1, 2, 3, 4, 5]);
  });

  it('orders black pips 7<8<9<10 and red pips 4<3<2<1', () => {
    const pip = (s: 'spades' | 'hearts', r: number) => {
      const d = describe(suitCard(s, r));
      return d.kind === 'suit' ? d.pip : undefined;
    };
    expect([0, 1, 2, 3].map((r) => pip('spades', r))).toEqual([7, 8, 9, 10]);
    expect([0, 1, 2, 3].map((r) => pip('hearts', r))).toEqual([4, 3, 2, 1]);
  });
});

suite('deal', () => {
  it('is a reproducible partition into 4x12 + 2x3', () => {
    const d = deal(12345);
    expect(deal(12345)).toEqual(d);
    const all = [...d.hands.flat(), ...d.talon.flat()];
    expect(all).toHaveLength(54);
    expect(new Set(all).size).toBe(54);
    expect(d.talon[0]).toHaveLength(3);
    expect(d.talon[1]).toHaveLength(3);
  });
});

suite('pileCount', () => {
  it('matches the triples-minus-two description on hand-built piles', () => {
    // One triple: king + king + king = 15 - 2 = 13
    expect(pileCount([suitCard(0, 7), suitCard(1, 7), suitCard(2, 7)])).toBe(13);
    // Triple (5 + 5 + 1) = 11 - 2 = 9, plus one leftover card of 1 point: 1 - 1 = 0
    expect(pileCount([suitCard(0, 7), suitCard(1, 7), suitCard(2, 0), suitCard(3, 0)])).toBe(5 + 5 + 1 - 2 + 1 - 1);
    // Empty pile
    expect(pileCount([])).toBe(0);
  });

  it('counts the whole deck as 70', () => {
    expect(pileCount(fullDeck())).toBe(COUNTED_TOTAL);
  });

  it('two complementary piles always count to 70, for every split size', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 0, max: 54 }), (seed, k) => {
        const deck = shuffle(fullDeck(), createRng(seed));
        expect(pileCount(deck.slice(0, k)) + pileCount(deck.slice(k))).toBe(COUNTED_TOTAL);
      }),
    );
  });
});
