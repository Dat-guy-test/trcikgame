/**
 * Bot tournament: pnpm tournament -- --deals 500 --seed 1 --lineup heuristic,random,random,random [--players 2|3]
 * Every deal is replayed once per rotation, so each strategy sits in every seat.
 */
import { STRATEGIES, runTournament } from '../packages/ai/src';
import type { SeatKind } from '../packages/engine/src';

const argv = process.argv;
const arg = (name: string, fallback: string): string => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1]! : fallback;
};

const players = Number(arg('players', '4'));
const seatKinds: SeatKind[] =
  players === 2 ? ['player', 'dummy', 'player', 'dummy']
  : players === 3 ? ['player', 'dummy', 'player', 'player'] : ['player', 'player', 'player', 'player'];
const lineup = arg('lineup', players === 2 ? 'heuristic,random' : players === 3 ? 'heuristic,random,random' : 'heuristic,random,random,random').split(',');
const strategies = lineup.map((n) => {
  const s = STRATEGIES[n];
  if (!s) throw new Error(`unknown strategy "${n}" (available: ${Object.keys(STRATEGIES).join(', ')})`);
  return { ...s, name: s.name };
});

const t0 = Date.now();
const r = runTournament({ strategies, deals: Number(arg('deals', '500')), seed: Number(arg('seed', '1')), seatKinds });
console.log(`${r.rounds} rounds in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.table(r.stats.map((s) => ({
  strategy: s.name,
  points: s.points,
  'per round': +(s.points / s.rounds).toFixed(3),
  declared: s.declared,
  'declared won': s.declaredWon,
  'illegal proposals': s.fallbacks,
})));
console.table(Object.fromEntries(Object.entries(r.contracts).sort().map(([c, n]) => [c, {
  played: n, 'declarer won': r.contractWins[c] ?? 0, 'win %': +(((r.contractWins[c] ?? 0) / n) * 100).toFixed(0),
}])));
