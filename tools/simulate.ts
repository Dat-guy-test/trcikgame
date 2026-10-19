/**
 * CLI harness: random legal-move bots play many rounds, every state is checked against the
 * engine invariants (card conservation, zero-sum standings, 70 counted points, no hidden-info
 * leaks in views). Usage: pnpm sim -- --games 2000 --seed 1 --players 4 [--infinite-contra]
 */
import { runSimulation, type SeatKind } from '../packages/engine/src';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const games = arg('games', 1000);
const seed = arg('seed', 1);
const players = arg('players', 4);
const seatKinds: SeatKind[] =
  players === 2 ? ['player', 'dummy', 'player', 'dummy']
  : players === 3 ? ['player', 'dummy', 'player', 'player'] : ['player', 'player', 'player', 'player'];

const t0 = Date.now();
const r = runSimulation({
  games, seed, seatKinds,
  infiniteContra: process.argv.includes('--infinite-contra'),
  exhaustiveEvery: 10,
});
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`${r.games} rounds in ${secs}s, ${r.actions} actions (max ${r.maxActions} per round)`);
console.log('result kinds:', r.kinds);
console.log('contracts:', r.contracts);
console.log(`declarer side won ${r.wins}, lost ${r.losses}; Valat achieved ${r.valatAchieved}; rounds with a contra: ${r.contraRaised}`);
console.log('bonus outcomes seen:', Object.keys(r.bonusesSeen).length, 'distinct');
console.log('OK: all invariants held.');
