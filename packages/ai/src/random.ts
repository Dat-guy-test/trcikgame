import { legalActionsFromView, type Action, type Rng, type RoundView } from '@tarok/engine';
import type { Strategy } from './strategy';

const PASSIVE: Record<string, number> = { bidding: 0.55, declare: 0.6, contra: 0.7 };

const isPassive = (a: Action): boolean =>
  a.type === 'pass' || a.type === 'confirm' || a.type === 'noContra' ||
  (a.type === 'declare' && a.bonuses.length === 0 && !a.valat);

/** Baseline: a random legal move, biased towards passing in licitation. */
export const randomBot: Strategy = {
  name: 'random',
  choose(v: RoundView, rng: Rng): Action {
    const acts = legalActionsFromView(v).map((a) => a.action);
    if (acts.length === 0) throw new Error('not this seat\'s turn');
    const passive = acts.filter(isPassive);
    const p = PASSIVE[v.phase];
    const pool = p !== undefined && passive.length > 0 && rng() < p ? passive : acts;
    return pool[Math.floor(rng() * pool.length)]!;
  },
};
