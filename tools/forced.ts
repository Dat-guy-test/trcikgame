/**
 * Forced-contract benchmark: pnpm forced -- --contract farbendreier --deals 400 --seed 1 [--filter farben]
 * Seat 0 (heuristic) declares the contract on every matching deal, seats 1-3 (heuristic) defend.
 */
import { describeHand, heuristicBot, runForcedContract, willingContracts } from '../packages/ai/src';
import type { ContractId } from '../packages/engine/src';

const argv = process.argv;
const arg = (n: string, d: string) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1]! : d);
const contract = arg('contract', 'farbendreier') as ContractId;
const deals = Number(arg('deals', '400'));
const filterName = arg('filter', 'farben');

const filter = filterName === 'farben'
  ? (h: readonly number[]) => { const f = describeHand(h); return f.farbenScore >= 5.5; }
  : filterName === 'bid'
    ? (h: readonly number[]) => willingContracts(describeHand(h), false).has(contract)
    : undefined;

const t0 = Date.now();
const samples = runForcedContract({ contract, declarer: heuristicBot, defenders: heuristicBot, deals, seed: Number(arg('seed', '1')), filter });
const n = samples.length;
const wins = samples.filter((s) => s.won).length;
const mean = samples.reduce((a, s) => a + s.delta, 0) / n;
console.log(`${contract}: ${n} deals in ${((Date.now() - t0) / 1000).toFixed(1)}s, declarer won ${wins} (${((wins / n) * 100).toFixed(0)}%), mean ${mean.toFixed(2)} per round`);

const buckets = new Map<string, { n: number; w: number; d: number }>();
for (const s of samples) {
  const f = describeHand(s.hand);
  const key = `suit ${Math.min(Math.max(f.longestSuit, 4), 7)}, kings ${Math.min(f.kings, 3)}, tarocks ${f.tarocks <= 2 ? '0-2' : f.tarocks <= 4 ? '3-4' : f.tarocks <= 6 ? '5-6' : '7+'}`;
  const b = buckets.get(key) ?? { n: 0, w: 0, d: 0 };
  b.n++; b.w += s.won ? 1 : 0; b.d += s.delta;
  buckets.set(key, b);
}
console.table(Object.fromEntries([...buckets.entries()].filter(([, b]) => b.n >= 25).sort().map(([k, b]) => [k, { n: b.n, 'win %': Math.round((b.w / b.n) * 100), mean: +(b.d / b.n).toFixed(2) }])));
