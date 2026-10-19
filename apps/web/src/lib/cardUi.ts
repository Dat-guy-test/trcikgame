/** Card presentation helpers shared by the components. Replace `Card.svelte` to change the artwork; this stays. */
import { SUITS, describe, isTarock, points, strength, suitIndex, type CardId, type Suit } from '@tarok/engine';
import { t, type Key } from './i18n.svelte';

export const SUIT_SYMBOL: Record<Suit, string> = { spades: '♠', clubs: '♣', diamonds: '♦', hearts: '♥' };

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI', 'XXII'];

export interface CardFace {
  tarock: boolean;
  suit: Suit | null;
  /** Corner label: pip, face letter or roman numeral. */
  label: string;
  /** Centre symbol. */
  symbol: string;
  points: number;
  special: 'pagat' | 'mond' | 'szkis' | null;
}

const FACE_KEY: Record<string, Key> = { jack: 'face.jack', rider: 'face.rider', queen: 'face.queen', king: 'face.king' };

export function cardFace(id: CardId): CardFace {
  const info = describe(id);
  if (info.kind === 'tarock') {
    const n = info.number;
    return {
      tarock: true, suit: null, label: ROMAN[n]!, symbol: n === 1 ? 'I' : n === 21 ? '☾' : n === 22 ? '★' : String(n),
      points: points(id), special: n === 1 ? 'pagat' : n === 21 ? 'mond' : n === 22 ? 'szkis' : null,
    };
  }
  const face = info.face !== undefined ? t(FACE_KEY[info.face]!) : String(info.pip);
  return { tarock: false, suit: info.suit, label: face, symbol: SUIT_SYMBOL[info.suit], points: points(id), special: null };
}

/** Full spoken name, for screen readers and tooltips. */
export function cardName(id: CardId): string {
  const f = cardFace(id);
  if (f.tarock) {
    if (f.special === 'pagat') return t('card.pagat');
    if (f.special === 'mond') return t('card.mond');
    if (f.special === 'szkis') return t('card.szkis');
    return t('card.tarock', { n: f.label });
  }
  return `${f.label} ${t(`suit.${f.suit!}` as Key)}`;
}

const SUIT_ORDER = [0, 3, 1, 2]; // spades, hearts, clubs, diamonds: colours alternate

/** Tarocks first (high to low), then each suit high to low. */
export function sortHand(cards: readonly CardId[]): CardId[] {
  const key = (c: CardId) => (isTarock(c) ? -1000 - strength(c) : SUIT_ORDER.indexOf(suitIndex(c)) * 100 - strength(c));
  return [...cards].sort((a, b) => key(a) - key(b));
}

export const suitName = (s: Suit): string => t(`suit.${s}` as Key);
export const ALL_SUITS = SUITS;
