// One-off migration: applies the small edits this change makes to files that already exist in the repo.
// Usage (from the repo root, after extracting the zip over it):  node tools/apply-changes.mjs   -- then delete this file.
// All edits are checked first; if any expected text is missing nothing is written. Safe to run twice.
import { readFileSync, writeFileSync } from 'node:fs';

const en = {
  clockOld: `  'clock.bank': 'bank',`,
  clockNew: `  'clock.time': 'time',`,
  introOld: `  'online.soon': 'Online play is not available yet. It needs the game server, which is the next big step.',`,
  introNew: `  'online.intro': 'Create a room and share its code, or join a friend’s room. Empty seats can be filled by bots.',`,
  joinOld: `  'online.join': 'Join',`,
  joinNew: `  'online.join': 'Join',
  'online.noServer': 'No game server is set. Enter its address under "Server address".',
  'online.server': 'Server address',
  'online.creating': 'Creating…',
  'online.failed': 'Could not reach the server.',
  'online.notFound': 'No room with that code.',
  'online.settings': 'Room settings',
  'room.title': 'Room {code}',
  'room.share': 'Invite link',
  'room.copy': 'Copy link',
  'room.copied': 'Copied',
  'room.connecting': 'Connecting…',
  'room.reconnecting': 'Connection lost. Reconnecting…',
  'room.seatOpen': 'Open seat',
  'room.makeBot': 'Make bot',
  'room.makeOpen': 'Open the seat',
  'room.host': 'host',
  'room.offline': 'offline',
  'room.start': 'Start game',
  'room.waitHost': 'Waiting for the host to start the game.',
  'room.needSeats': 'Every seat needs a player or a bot.',
  'room.spectator': 'You are watching this room.',
  'room.join': 'Join',
  'room.waitingNext': 'Waiting for the others…',
  'room.error.replaced': 'This room was opened in another tab.',
  'room.error.generic': 'Something went wrong: {message}',
  'seat.you': 'you',`,
  timersOld: `  'setup.timers': 'Use clocks (card viewing, bidding, bank)',`,
  timersNew: `  'setup.timers': 'Use time limits (one time reserve per player)',`,
};
const pl = {
  clockOld: `  'clock.bank': 'bank',`,
  clockNew: `  'clock.time': 'czas',`,
  introOld: `  'online.soon': 'Gra online jest jeszcze niedostępna. Potrzebny jest serwer gry, to kolejny duży krok.',`,
  introNew: `  'online.intro': 'Utwórz pokój i podaj kod albo dołącz do pokoju znajomego. Wolne miejsca mogą zająć boty.',`,
  joinOld: `  'online.join': 'Dołącz',`,
  joinNew: `  'online.join': 'Dołącz',
  'online.noServer': 'Nie ustawiono serwera gry. Wpisz jego adres w polu „Adres serwera”.',
  'online.server': 'Adres serwera',
  'online.creating': 'Tworzenie…',
  'online.failed': 'Nie można połączyć się z serwerem.',
  'online.notFound': 'Nie ma pokoju o takim kodzie.',
  'online.settings': 'Ustawienia pokoju',
  'room.title': 'Pokój {code}',
  'room.share': 'Link z zaproszeniem',
  'room.copy': 'Kopiuj link',
  'room.copied': 'Skopiowano',
  'room.connecting': 'Łączenie…',
  'room.reconnecting': 'Utracono połączenie. Łączenie ponownie…',
  'room.seatOpen': 'Wolne miejsce',
  'room.makeBot': 'Zrób botem',
  'room.makeOpen': 'Zwolnij miejsce',
  'room.host': 'gospodarz',
  'room.offline': 'offline',
  'room.start': 'Start gry',
  'room.waitHost': 'Czekamy, aż gospodarz rozpocznie grę.',
  'room.needSeats': 'Każde miejsce musi zająć gracz albo bot.',
  'room.spectator': 'Oglądasz ten pokój.',
  'room.join': 'Dołącz',
  'room.waitingNext': 'Czekamy na pozostałych…',
  'room.error.replaced': 'Ten pokój został otwarty w innej karcie.',
  'room.error.generic': 'Coś poszło nie tak: {message}',
  'seat.you': 'ty',`,
  timersOld: `  'setup.timers': 'Używaj zegarów (oglądanie kart, licytacja, bank)',`,
  timersNew: `  'setup.timers': 'Używaj limitów czasu (jedna pula czasu na gracza)',`,
};
const locale = (f) => ({ file: f.file, edits: [[f.d.clockOld, f.d.clockNew], [f.d.introOld, f.d.introNew], [f.d.joinOld, f.d.joinNew], [f.d.timersOld, f.d.timersNew]] });

const changes = [
  { file: 'packages/engine/src/state.ts', edits: [[
    `  /** Continue the contra chain past Mordkontra (x16). */\n  infiniteContra: boolean;\n}`,
    `  /** Continue the contra chain past Mordkontra (x16). */\n  infiniteContra: boolean;\n  /** Full deck order for the deal (online rooms: cryptographic shuffle). Without it the deal comes from \`seed\`. */\n  deck?: number[];\n}`]] },
  { file: 'packages/engine/src/round.ts', edits: [[`const d = deal(config.seed);`, `const d = deal(config.seed, config.deck);`]] },
  { file: 'packages/engine/src/match.ts', edits: [
    [`import type { MatchConfig } from './config';`, `import type { CardId } from './cards';\nimport type { MatchConfig } from './config';`],
    [`export function createMatch(config: MatchConfig, seed: number, firstStartingPlayer?: number): MatchState {`,
     `export function createMatch(config: MatchConfig, seed: number, firstStartingPlayer?: number, deck?: CardId[]): MatchState {`],
    [`const round = newRound({ seatKinds, startingPlayer, seed: roundSeed, infiniteContra: cfg.infiniteContra });`,
     `const round = newRound({ seatKinds, startingPlayer, seed: roundSeed, infiniteContra: cfg.infiniteContra, deck });`],
    [`export function nextRound(m: MatchState): MatchState {`, `export function nextRound(m: MatchState, deck?: CardId[]): MatchState {`],
    [`const round = newRound({ seatKinds: m.seatKinds, startingPlayer, seed, infiniteContra: m.config.infiniteContra });`,
     `const round = newRound({ seatKinds: m.seatKinds, startingPlayer, seed, infiniteContra: m.config.infiniteContra, deck });`],
  ] },
  { file: 'packages/engine/test/bidding.test.ts', edits: [
    [`it('bank is 20 / 15 / 10 minutes for 2 / 3 / 4+ regular players', () => {`, `it('time per round is 30 / 20 / 15 minutes for 2 / 3 / 4+ regular players', () => {`],
    [`.toEqual([1200, 900, 600, 600, 600]);`, `.toEqual([1800, 1200, 900, 900, 900]);`],
    [`expect(resolveBankSeconds(cfg)).toBe(900);`, `expect(resolveBankSeconds(cfg)).toBe(1200);`],
    [`    expect(DEFAULT_TIMERS.viewSeconds).toBe(180);\n    expect(DEFAULT_TIMERS.licitationDecisionSeconds).toBe(20);`, `    expect(DEFAULT_TIMERS.bankSeconds).toBe('auto');`],
  ] },
  { file: 'packages/ai/test/heuristic.test.ts', edits: [[
    `timers: { viewSeconds: 180, licitationDecisionSeconds: 20, bankSeconds: 'auto' },`, `timers: { bankSeconds: 'auto' },`]] },
  { file: 'apps/web/src/lib/game.svelte.ts', edits: [
    [`timers: s.timers ? DEFAULT_TIMERS : { viewSeconds: null, licitationDecisionSeconds: null, bankSeconds: null },`, `timers: s.timers ? DEFAULT_TIMERS : { bankSeconds: null },`],
    [`  readonly names: string[];`,
     `  readonly names: string[];\n  get roundsTotal(): number | null {\n    const wc = this.host.match.config.winCondition;\n    return wc.kind === 'rounds' ? wc.rounds : null;\n  }`],
  ] },
  { file: 'apps/web/src/components/ActionPanel.svelte', edits: [
    [`import type { Game } from '../lib/game.svelte';`, `import type { GameLike } from '../lib/gamelike';`],
    [`let { game, selected = $bindable([]) }: { game: Game; selected: number[] } = $props();`, `let { game, selected = $bindable([]) }: { game: GameLike; selected: number[] } = $props();`],
    [`<Clock ms={v.timers.viewMsLeft} />`, `<Clock ms={v.timers.banksMs[v.participant] ?? null} label={t('clock.time')} warn={60_000} />`],
    [`<Clock ms={v.timers.decisionMsLeft} />`, `<Clock ms={v.timers.banksMs[v.participant] ?? null} label={t('clock.time')} />`],
  ] },
  { file: 'apps/web/src/components/ResultDialog.svelte', edits: [
    [`import type { Game } from '../lib/game.svelte';`, `import type { GameLike } from '../lib/gamelike';`],
    [`let { game }: { game: Game } = $props();`, `let { game }: { game: GameLike } = $props();`],
    [`<button class="btn primary" data-testid="next-round" onclick={game.next}>{t('action.nextRound')}</button>`,
     `<button class="btn primary" data-testid="next-round" disabled={game.votedNext === true} onclick={game.next}>{game.votedNext ? t('room.waitingNext') : t('action.nextRound')}</button>`],
    [`<button class="btn" data-testid="again" onclick={() => location.reload()}>{t('action.again')}</button>`,
     `<button class="btn" data-testid="again" onclick={() => (game.online ? go('online') : location.reload())}>{t('action.again')}</button>`],
  ] },
  { file: 'apps/web/src/components/Seat.svelte', edits: [[`label={t('clock.bank')}`, `label={t('clock.time')}`]] },
  { file: 'apps/web/src/screens/GameScreen.svelte', edits: [
    [`  import { Game } from '../lib/game.svelte';`, `  import { Game } from '../lib/game.svelte';\n  import type { GameLike } from '../lib/gamelike';\n  import { keepAwake } from '../lib/wakeLock';`],
    [`  const game = new Game($state.snapshot(setup), {
    you: settings.name.trim() || t('you'),
    bot: (n) => t('bot.name', { n }),
    dummy: t('role.dummy'),
  });
  onMount(() => {
    game.start();
    return () => game.destroy();
  });`,
     `  // An online room passes its own game; otherwise this is a local game against bots.
  let { game: given = undefined }: { game?: GameLike } = $props();
  const game: GameLike =
    untrack(() => given) ??
    new Game($state.snapshot(setup), {
      you: settings.name.trim() || t('you'),
      bot: (n) => t('bot.name', { n }),
      dummy: t('role.dummy'),
    });
  onMount(() => {
    game.start();
    const release = keepAwake();
    return () => {
      release();
      game.destroy();
    };
  });`],
    [`  const roundsTotal = $derived(game.host.match.config.winCondition.kind === 'rounds' ? game.host.match.config.winCondition.rounds : null);`,
     `  const roundsTotal = $derived(game.roundsTotal);`],
  ] },
  { file: 'apps/web/src/App.svelte', edits: [[`    game: () => import('./screens/GameScreen.svelte'),`, `    game: () => import('./screens/GameScreen.svelte'),\n    room: () => import('./screens/Room.svelte'),`]] },
  locale({ file: 'apps/web/src/lib/locales/en.ts', d: en }),
  locale({ file: 'apps/web/src/lib/locales/pl.ts', d: pl }),
  { file: 'apps/web/index.html', edits: [[`    <title>Tarok</title>`, `    <link rel="manifest" href="manifest.webmanifest" />\n    <title>Tarok</title>`]] },
  { file: 'tools/check-bundle.mjs', edits: [[`/(?:src|href)="\\/(assets\\/[^"]+\\.js)"/g`, `/(?:src|href)="(?:\\.\\/|\\/)(assets\\/[^"]+\\.js)"/g`]] },
  { file: 'package.json', edits: [[`"build": "pnpm --filter @tarok/web build"`,
    `"build": "pnpm --filter @tarok/web build",\n    "server:dev": "pnpm --filter @tarok/server dev",\n    "server:deploy": "pnpm --filter @tarok/server cf:deploy"`]] },
  { file: 'docs/ui-guide.md', edits: [[
    "| Clocks | `view.timers`: `viewMsLeft`, `decisionMsLeft`, `banksMs`, `graceMsLeft`, `actingParticipant`, `matchMsLeft` | `ready()` during `stage === 'viewing'` |",
    "| Clocks | `view.timers`: `banksMs` (one time reserve per player, also paid while viewing and bidding), `graceMsLeft`, `actingParticipant`, `draining` (whose reserve is running), `matchMsLeft` | `ready()` during `stage === 'viewing'` |"]] },
];

const plan = [];
let bad = 0;
for (const c of changes) {
  let src;
  try { src = readFileSync(c.file, 'utf8'); } catch { console.error(`missing file: ${c.file}`); bad++; continue; }
  const orig = src;
  let n = 0;
  for (const [from, to] of c.edits) {
    if (orig.includes(to)) continue; // already applied
    const count = src.split(from).length - 1;
    if (count !== 1) { console.error(`${c.file}: expected exactly one match, found ${count} for:\n  ${from.split('\n')[0]}`); bad++; continue; }
    src = src.replace(from, () => to);
    n++;
  }
  plan.push({ file: c.file, src, n });
}
if (bad) { console.error(`\n${bad} problem(s); nothing was written.`); process.exit(1); }
for (const p of plan) { if (p.n > 0) writeFileSync(p.file, p.src); console.log(`${p.n > 0 ? 'patched' : 'already done'}  ${p.file}`); }
