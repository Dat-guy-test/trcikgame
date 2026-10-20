// Performance budget (plan section 7): initial JS under 50 KB gzipped. Run after `pnpm --filter @tarok/web build`.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = new URL('../apps/web/dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const gz = (f) => gzipSync(readFileSync(join(dist, f))).length;

// Initial = the entry script plus everything it (and the modulepreloads) pulls in statically.
const initial = new Set([...html.matchAll(/(?:src|href)="(?:\.\/|\/)(assets\/[^"]+\.js)"/g)].map((m) => m[1]));
const seen = new Set();
const visit = (f) => {
  if (seen.has(f)) return;
  seen.add(f);
  for (const m of readFileSync(join(dist, f), 'utf8').matchAll(/from"\.\/([^"]+\.js)"|import"\.\/([^"]+\.js)"/g)) visit(`assets/${m[1] ?? m[2]}`);
};
initial.forEach(visit);

const total = [...seen].reduce((s, f) => s + gz(f), 0);
console.log('initial JS (gzip):', (total / 1024).toFixed(1), 'KB in', seen.size, 'files');
for (const f of readdirSync(join(dist, 'assets')).filter((x) => x.endsWith('.js') && !seen.has(`assets/${x}`))) {
  console.log('  lazy', f.padEnd(34), (gz(`assets/${f}`) / 1024).toFixed(1), 'KB');
}
const LIMIT = 50 * 1024;
if (total > LIMIT) { console.error(`over the ${LIMIT / 1024} KB budget`); process.exit(1); }
