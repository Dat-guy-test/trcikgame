/** Trick resolution and legal-move generation. See docs/rules.md (trick play). */
import {
  type CardId,
  PAGAT,
  MOND,
  SZKIS,
  isTarock,
  strength,
  suitIndex,
} from './cards';

export interface Play {
  player: number;
  card: CardId;
}

export interface PlayRules {
  /**
   * Farben contracts: tarocks are an ordinary suit when deciding who wins a trick (no trumping, no Pagat exception).
   * This does NOT change which cards may be played: the follow-suit / must-tarock obligation is the same in every contract.
   */
  farben: boolean;
  /** Negative contracts and Trischaken: must-beat and the Pagat restriction apply. */
  negative: boolean;
}

/** Index (into `plays`) of the card currently winning the trick. Works for partial tricks. */
export function trickWinnerIndex(plays: readonly Play[], farben: boolean): number {
  if (plays.length === 0) throw new Error('empty trick');
  const first = plays[0]!;

  if (!farben) {
    let tarockCount = 0;
    let pagat = -1;
    let hasMond = false;
    let hasSzkis = false;
    let bestTarock = -1;
    let bestTarockStrength = -1;
    plays.forEach((p, i) => {
      if (!isTarock(p.card)) return;
      tarockCount++;
      if (p.card === PAGAT) pagat = i;
      if (p.card === MOND) hasMond = true;
      if (p.card === SZKIS) hasSzkis = true;
      const st = strength(p.card);
      if (st > bestTarockStrength) {
        bestTarockStrength = st;
        bestTarock = i;
      }
    });
    if (tarockCount > 0) {
      // Pagat exception: 1, 21 and 22 all on the table -> the Pagat wins.
      if (pagat >= 0 && hasMond && hasSzkis) return pagat;
      return bestTarock;
    }
  }

  const led = suitIndex(first.card);
  let best = 0;
  let bestStrength = strength(first.card);
  for (let i = 1; i < plays.length; i++) {
    const c = plays[i]!.card;
    if (suitIndex(c) !== led) continue;
    const st = strength(c);
    if (st > bestStrength) {
      bestStrength = st;
      best = i;
    }
  }
  return best;
}

/**
 * Cards the player may legally play. The first three steps apply to EVERY contract (Farben included):
 *  1. a card of the led suit, if the player has one;
 *  2. otherwise a tarock, if the player has one;
 *  3. otherwise any card.
 * Negative contracts additionally apply, in this order:
 *  1. Pagat restriction: the Pagat may not be played unless it is the player's last tarock.
 *  2. Must-beat: if any remaining card beats the current winner, only those may be played.
 */
export function legalPlays(
  hand: readonly CardId[],
  trick: readonly Play[],
  rules: PlayRules,
): CardId[] {
  let candidates: CardId[];

  if (trick.length === 0) {
    candidates = hand.slice();
  } else {
    const led = suitIndex(trick[0]!.card);
    candidates = hand.filter((c) => suitIndex(c) === led);
    if (candidates.length === 0) {
      const tarocks = hand.filter(isTarock);
      candidates = tarocks.length > 0 ? tarocks : hand.slice();
    }
  }

  if (!rules.negative) return candidates;

  if (hand.filter(isTarock).length > 1) {
    candidates = candidates.filter((c) => c !== PAGAT);
  }

  if (trick.length > 0) {
    const beating = candidates.filter(
      (c) => trickWinnerIndex([...trick, { player: -1, card: c }], rules.farben) === trick.length,
    );
    if (beating.length > 0) candidates = beating;
  }
  return candidates;
}
