/** Random legal-move bot, used for simulations and for the "random move after the grace period" rule. */
import { isTarock } from './cards';
import { apply, discardRules, legalActions, playRules, type Action, type LegalAction } from './round';
import type { Rng } from './rng';
import { shuffle } from './rng';
import type { RoundState } from './state';

const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)]!;

const isPassive = (a: Action): boolean =>
  a.type === 'pass' || a.type === 'confirm' || a.type === 'noContra' ||
  (a.type === 'declare' && a.bonuses.length === 0 && !a.valat);

const PASSIVE_PROBABILITY: Record<string, number> = { bidding: 0.55, declare: 0.6, contra: 0.7 };

/** A random valid discard (accepts any subset the rules allow, not just the canonical one). */
function randomDiscard(s: RoundState, rng: Rng): LegalAction {
  const { eligible, requiredTarocks } = discardRules(s);
  const tarocks = shuffle(eligible.filter(isTarock), rng);
  const others = shuffle(eligible.filter((c) => !isTarock(c)), rng);
  const farben = playRules(s).farben;
  const chosen = farben
    ? [...tarocks.slice(0, requiredTarocks), ...others.slice(0, s.take - requiredTarocks)]
    : shuffle(eligible, rng).slice(0, s.take);
  return { actor: s.declarer!, action: { type: 'discard', cards: chosen } };
}

export function randomAction(s: RoundState, rng: Rng): LegalAction {
  if (s.phase === 'discard') return randomDiscard(s, rng);
  const acts = legalActions(s);
  if (acts.length === 0) throw new Error('no legal actions');
  const passive = acts.filter((a) => isPassive(a.action));
  const p = PASSIVE_PROBABILITY[s.phase];
  if (p !== undefined && passive.length > 0 && rng() < p) return pick(passive, rng);
  return pick(acts, rng);
}

export function playRandomMove(s: RoundState, rng: Rng): RoundState {
  const { actor, action } = randomAction(s, rng);
  return apply(s, actor, action);
}
