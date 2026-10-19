export * from './strategy';
export * from './random';
export * from './hand';
export * from './heuristic';
export * from './tournament';

import { heuristicBot } from './heuristic';
import { randomBot } from './random';
import type { Strategy } from './strategy';

export const STRATEGIES: Readonly<Record<string, Strategy>> = {
  heuristic: heuristicBot,
  random: randomBot,
};
export * from './forced';
