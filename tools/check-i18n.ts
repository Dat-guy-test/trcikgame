/**
 * i18n check: every locale has exactly the English keys, and every t('key') used in the web app exists.
 * Usage: pnpm i18n
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = 'apps/web/src';
const keysOf = (file: string): Set<string> =>
  new Set([...readFileSync(file, 'utf8').matchAll(/^\s*'?([\w.]+)'?:\s*'/gm)].map((m) => m[1]!));

const en = keysOf(join(root, 'lib/locales/en.ts'));
let bad = 0;
const fail = (m: string) => { console.error(m); bad++; };

for (const f of readdirSync(join(root, 'lib/locales')).filter((x) => x !== 'en.ts')) {
  const keys = keysOf(join(root, 'lib/locales', f));
  for (const k of en) if (!keys.has(k)) fail(`${f}: missing "${k}"`);
  for (const k of keys) if (!en.has(k)) fail(`${f}: unknown key "${k}"`);
}

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
for (const file of walk(root).filter((f) => /\.(svelte|ts)$/.test(f) && !f.includes('locales'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) if (!en.has(m[1]!)) fail(`${file}: unknown key "${m[1]}"`);
}
if (bad > 0) process.exit(1);
console.log(`i18n OK: ${en.size} keys in ${readdirSync(join(root, 'lib/locales')).length} languages`);
