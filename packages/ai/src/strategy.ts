/** A strategy decides from a per-player view only, so it runs unchanged in the browser and on the server. */
import { isLegalFromView, legalActionsFromView, type Action, type Rng, type RoundView } from '@tarok/engine';

export interface Strategy {
  name: string;
  choose(view: RoundView, rng: Rng): Action;
}

/** Asks the strategy, and falls back to the first legal action if it proposed something illegal. */
export function resolveAction(strategy: Strategy, view: RoundView, rng: Rng): { action: Action; fellBack: boolean } {
  const proposed = strategy.choose(view, rng);
  if (isLegalFromView(view, proposed)) return { action: proposed, fellBack: false };
  const legal = legalActionsFromView(view);
  if (legal.length === 0) throw new Error('no legal action for this view');
  return { action: legal[0]!.action, fellBack: true };
}
