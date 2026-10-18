import { describe, expect, it } from 'vitest';
import { MOND, PAGAT, SZKIS, legalPlays, suitCard, tarock, trickWinnerIndex, type Play } from '../src';

const plays = (...cards: number[]): Play[] => cards.map((card, player) => ({ player, card }));
const S = (r: number) => suitCard('spades', r);
const H = (r: number) => suitCard('hearts', r);
const C = (r: number) => suitCard('clubs', r);

describe('trickWinnerIndex', () => {
  it('highest card of the led suit wins when no tarocks are played', () => {
    expect(trickWinnerIndex(plays(S(2), S(6), H(7), S(4)), false)).toBe(1);
  });

  it('off-suit cards never win', () => {
    expect(trickWinnerIndex(plays(S(0), H(7), C(7), S(1)), false)).toBe(3);
  });

  it('any tarock beats suit cards, the highest tarock wins', () => {
    expect(trickWinnerIndex(plays(S(7), tarock(3), tarock(9), S(6)), false)).toBe(2);
  });

  it('Szkis wins over Mond and others', () => {
    expect(trickWinnerIndex(plays(tarock(5), MOND, SZKIS, tarock(20)), false)).toBe(2);
  });

  it('Pagat exception: 1, 21 and 22 all on the table -> the Pagat wins', () => {
    expect(trickWinnerIndex(plays(MOND, SZKIS, PAGAT, S(1)), false)).toBe(2);
  });

  it('Pagat does not win with only two of the three', () => {
    expect(trickWinnerIndex(plays(PAGAT, SZKIS, S(1), S(2)), false)).toBe(1);
    expect(trickWinnerIndex(plays(PAGAT, MOND, S(1), S(2)), false)).toBe(1);
  });

  it('Farben: tarocks are an ordinary suit, no Pagat exception', () => {
    // Tarock led: highest tarock of the led "suit" wins, Szkis beats Pagat.
    expect(trickWinnerIndex(plays(PAGAT, MOND, SZKIS, tarock(5)), true)).toBe(2);
    // Suit led: a tarock thrown in does not trump.
    expect(trickWinnerIndex(plays(S(2), tarock(20), S(5), S(1)), true)).toBe(2);
  });
});

describe('legalPlays (positive contracts)', () => {
  const rules = { farben: false, negative: false };

  it('leader may play anything', () => {
    const hand = [S(1), H(2), tarock(4)];
    expect(legalPlays(hand, [], rules)).toEqual(hand);
  });

  it('must follow suit, even with a lower card (no must-beat)', () => {
    const hand = [S(0), S(1), H(2), tarock(4)];
    expect(legalPlays(hand, plays(S(7)), rules)).toEqual([S(0), S(1)]);
  });

  it('must play a tarock when the suit cannot be followed', () => {
    const hand = [H(2), C(1), tarock(4), tarock(9)];
    expect(legalPlays(hand, plays(S(7)), rules)).toEqual([tarock(4), tarock(9)]);
  });

  it('may play anything with neither suit nor tarocks', () => {
    const hand = [H(2), C(1)];
    expect(legalPlays(hand, plays(S(7)), rules)).toEqual(hand);
  });

  it('tarock led: must follow with a tarock, else anything', () => {
    expect(legalPlays([H(2), tarock(4)], plays(tarock(7)), rules)).toEqual([tarock(4)]);
    expect(legalPlays([H(2), C(1)], plays(tarock(7)), rules)).toEqual([H(2), C(1)]);
  });

  it('Farben: with no card of the led suit, anything goes (no tarock obligation)', () => {
    const hand = [H(2), tarock(4)];
    expect(legalPlays(hand, plays(S(7)), { farben: true, negative: false })).toEqual(hand);
  });
});

describe('legalPlays (negative contracts)', () => {
  const rules = { farben: false, negative: true };

  it('must beat if possible', () => {
    const hand = [S(0), S(3), S(6)];
    expect(legalPlays(hand, plays(S(4)), rules)).toEqual([S(6)]);
  });

  it('any card of the suit when none can beat', () => {
    const hand = [S(0), S(3)];
    expect(legalPlays(hand, plays(S(7)), rules)).toEqual(hand);
  });

  it('must beat the highest tarock on the table when playing tarocks', () => {
    const hand = [tarock(4), tarock(9), tarock(15)];
    expect(legalPlays(hand, plays(tarock(8)), rules)).toEqual([tarock(9), tarock(15)]);
    expect(legalPlays(hand, plays(S(2), tarock(10)), rules)).toEqual([tarock(15)]);
  });

  it('a tarock already on the table cannot be beaten by following the suit', () => {
    const hand = [S(0), S(6)];
    expect(legalPlays(hand, plays(S(2), tarock(4)), rules)).toEqual(hand);
  });

  it('Pagat cannot be played (or led) unless it is the last tarock', () => {
    expect(legalPlays([PAGAT, tarock(5), S(1)], [], rules)).toEqual([tarock(5), S(1)]);
    expect(legalPlays([PAGAT, S(1)], [], rules)).toEqual([PAGAT, S(1)]);
    expect(legalPlays([PAGAT, tarock(5), S(1)], plays(H(7)), rules)).toEqual([tarock(5)]);
  });

  it('Pagat restriction applies before must-beat', () => {
    // Pagat could win via the exception (Mond + Szkis on the table), but it is restricted first.
    const hand = [PAGAT, tarock(5)];
    expect(legalPlays(hand, plays(MOND, SZKIS), rules)).toEqual([tarock(5)]);
  });

  it('the last tarock may be the Pagat', () => {
    expect(legalPlays([PAGAT, H(1)], plays(S(7)), rules)).toEqual([PAGAT]);
  });
});
