# Tarok website: Plan and progress

Merges the original `Plan.txt` with the progress made so far. Rules live in `rules.md`.
Last updated after milestone 9 (CI and deployment repair). Milestones 6 to 9 were written without a build
environment: nothing in them has been compiled or run by the author yet (see section 9, milestones 8 and 9, and section 10).

**Goals:** unbloated, as smooth as possible, perfectly mobile compatible.
**Features:** main menu (name, options, rules + PDF, local game, online game, language switch), configurable
players/bots, dummy players for 2 and 3 player variants, selectable win condition, scoreboard, multi-trick and
multi-round play.

The game is **Slovenian-style Tarok** (4 players, 54 cards, bidding, bonuses, contras), which answers the open
question in the original plan. It needs heavy bidding, bonus and partnership logic, so the engine is the real project.

---

## 1. Status at a glance

| Step | Description | Status |
|---|---|---|
| 0 | Settle the rules (`rules.md`) | Done |
| 1 | Engine + CLI harness | **Done**: core, state machine, views, clock helpers, match layer, property tests, harness |
| 2 | Heuristic bots | **First version done** (plays Farben, tuned with forced-contract benchmarks); more tuning possible |
| 3 | Local game UI | **Placeholder done**: fully playable, art and layout are placeholders |
| 4 | Menus, settings and i18n framework | **Done** for English and Polish (typed keys, lazy language chunk, key check) |
| 5 | Rules notebook and PDF pipeline | Notebook screen renders `docs/rules.md` (English only); PDF not started |
| 6 | Online hosting | **Written, untested**: protocol, room server (Cloudflare Durable Object), lobby and room UI, secure shuffle; rooms by code or link, no automatic matchmaking |
| 6a | Hosting preparation | **Done (untested)**: relative base, GitHub Pages workflow, CI workflow, `docs/hosting.md`, Wake Lock, web manifest |
| 6b | CI / deployment repair | **Done (not yet re-run)**: migration applied by hand, CORS origin and workspace config fixed (milestone 9) |
| 7 | Automatic matchmaking and polish | Not started (matchmaking deliberately not wanted for now) |

---

## 2. Core decisions (unchanged from the original plan)

- **Language:** TypeScript everywhere. One language for client, server and rules; the engine is shared.
- **UI:** Svelte 5 + Vite, plain SPA (not SvelteKit). Fallback: Preact.
- **Rendering:** DOM + CSS transforms. No canvas, no game engine.
- **Card art:** inline SVG/CSS, one sprite, no raster images (themable, colourblind modes).
- **Online:** Cloudflare Workers + Durable Objects (WebSockets), one Durable Object per room. Fallback: small Node
  server with `ws`. Avoid Socket.IO and Firebase.
- **Hosting:** GitHub Pages (static frontend) + Cloudflare Workers (room server). Cloudflare Pages is an alternative.
- **Persistence:** localStorage (name, options, language). No accounts.

---

## 3. Architecture: the key idea

The engine is a pure, framework-free TypeScript package: a deterministic reducer `(state, action) -> state` with a
seeded PRNG. It knows nothing about the DOM or the network.

- **Local play:** the engine runs in the browser.
- **Online play:** the identical engine runs in the room's Durable Object, which is the authority. Clients send
  intents; the server validates and broadcasts a **per-player view**, so hidden hands never cross the wire.
- **Bots:** functions `(playerView) -> action`, running in both places; the server uses them to fill empty seats and for the
  "random move after the grace period" rule. Heuristic bot first; ISMCTS in a Web Worker later.
- **Dummy players** are a rules-config variant of the engine (a seat with a controller), not a UI hack, and are a different
  concept from bots.
- **Match structure:** Match -> Round -> Trick. Win condition and scoreboard are pluggable at the Match layer.
- **Event log:** append-only action log (undo in local play, replays, reconnection, debugging).
- **Time:** the engine stays free of real time. The host (browser or Durable Object) drives the clocks using the pure helpers
  in `clock.ts`, and feeds the engine `timeoutAction` results, `forfeit` actions or random legal moves.

---

## 4. Project structure (pnpm monorepo)

packages/
engine/ pure rules, state machine, scoring, variants (shared) <- real work so far
ai/ bot strategies + tournament harness (shared) <- first version
protocol/ message types + validation (shared client/server) <- written (milestone 8)
apps/
web/ Svelte SPA: menu, settings, local and online UIs <- placeholder
server/ Cloudflare Worker + Durable Object “Room” <- written (milestone 8)
content/
rules/<lang>/*.md rules notebook source (single source of truth)
i18n/<lang>.json UI strings
tools/ build scripts (PDF, i18n key checks) and simulate.ts (CLI harness)
docs/ rules.md, plan.md, ui-guide.md, hosting.md


Engine modules (`packages/engine/src`): `cards`, `rng`, `deal`, `tricks`, `contracts` (contract table as data), `bidding`,
`scoring`, `config`, `state`, `evaluate`, `round` (state machine), `view`, `viewActions` (legal actions from a view),
`match` (rounds, standings, win conditions, 2 to any number of players), `clock`, `bot` (random bot), `sim`, `host` (host runner: stages, clocks, bots, per-participant view).
AI modules (`packages/ai/src`): `strategy`, `random`, `hand`, `heuristic`, `tournament`, `forced`.

---

## 5. Feature-specific notes

**Menu and routing:** tiny hash router (about 30 lines) or none; lazily loaded screens; forms write to a settings store.

**Options and tips:** store flags, e.g. `showPointValues` toggles a CSS class on the card layer.

**Internationalisation:** typed JSON dictionaries lazy-loaded per language; `Intl.PluralRules`; CI check for missing keys; CSS
logical properties from day one; system font stack or one subsetted font per script; localise card and suit names; **keep all
strings out of the engine**: the engine emits codes, the UI translates them. Polish and English from the start (the rules were
written in Polish).

**Rules notebook and PDF:** write the rules once as Markdown per language (`docs/rules.md` is the English source); at build time
render to the in-app notebook (HTML) and a downloadable PDF (Typst or Pandoc).

**Online lobby:** Phase 1: host a game with a room code or share link, configurable seats (human or bot). Phase 2: matchmaking with
a queue Durable Object that fills empty seats with bots after a timeout. Handle reconnects (session token in localStorage), turn
timers and AFK-to-bot takeover.

**Timers in the UI:** show each player's time reserve (it also pays for card viewing and bidding) and a grace-period indicator; a "no contra" button; a "ready" button during card viewing; match time-limit banner ("finishing this round").

---

## 6. Mobile compatibility

Mobile-first with `dvh` units, safe-area insets and 44px touch targets; Pointer Events with tap-to-select then tap-to-play (drag
optional); the hand as a fan or horizontal strip that never overflows; explicit portrait and landscape handling; PWA with a service
worker (`vite-plugin-pwa`); respect `prefers-reduced-motion`; Wake Lock API during games.

---

## 7. Performance budget (enforced in CI)

Initial JS under about 50 KB gzipped; separate chunks for menu, game, rules and online code; languages loaded on demand; animate only
`transform` and `opacity` (FLIP, no animation library); bundle-size check and Lighthouse CI failing the build on regression; compact
protocol (short keys, MessagePack later if needed).

---

## 8. Development order

1. **Engine + CLI harness:** rules, variants (including dummies), scoring and win conditions; Vitest, property-based tests
   (fast-check) and bot-vs-bot mass simulation.
2. Heuristic bots.
3. Local game UI (mobile layout from the start).
4. Menus, settings, i18n framework (second language early to prove nothing is hardcoded).
5. Rules notebook and PDF pipeline.
6. Online hosting: Durable Object room, protocol, reconnects, bot fill.
7. Matchmaking and polish: PWA, accessibility, Playwright on mobile viewports, load testing.

---

## 9. Progress log

### Milestone 0: rules settled
- Interpreted `Rules.txt`, found its gaps and inconsistencies, and settled each with the project owner (Farbensolo is 6; "farben"
  means tarocks do not trump; negative contracts use must-beat; contra rules; Valat as the last multiplier; bidding rounds with
  non-final passes and a confirming last bidder; dummies; timers; Trischaken settlement).
- Everything merged into `docs/rules.md`, which replaces `Rules.txt` and the interim `RULES-DECISIONS.md`.

### Milestone 1a: engine core (done)
- Monorepo scaffold (pnpm, TypeScript strict, Vitest, fast-check, tsx).
- `cards`: ids 0..53, suit and tarock order (red pips reversed), points (raw total 106), seeded `rng` and `deal` (4x12 + 2x3).
- `tricks`: trick winner (Pagat exception, Farben as a suit) and `legalPlays` (follow suit, tarock, must-beat, Pagat restriction
  applied before must-beat).
- `contracts`: all contracts as data rows (value, loss value, take, Farben, negative target, ouvert, who may bid, bonus access, contra,
  give-up cost).
- `bidding`: bid validation and ordering (strict raise, starting-player hold, Slovenian method with `take`, Sechsendreier 6 -> 1 and
  "remove from one pile first"), Besser Rufer bids carrying bonuses.
- `scoring`: pile count (closed form, always 70 over two piles), settlement formula with Valat as last multiplier, zero-sum standings.
- `config`: match configuration types and timer defaults.

### Milestone 1b: state machine, views, clock, harness (done)
- `round.ts`: `newRound`, `apply(state, actor, action)`, `legalActions`, `expectedActor`, `timeoutAction`. Phases:
  bidding -> declare -> contra -> kingCall -> kingInTalon -> take -> discard -> play -> done (inapplicable phases skipped; all-pass goes to
  Trischaken). Covers bidding rounds with non-final passes and confirmation, declarations, the contra chain (x16 cap or infinite),
  king call and king-in-Talon options (give up / play alone / switch to Dreier), Talon take with the Slovenian method, discards (including
  Farben rules), play with early end for negative contracts, `forfeit`.
- `evaluate.ts`: all bonus detection (silent and declared, ultimo "played but not winning" rule, Mondfang, Sküsfang, Trull, Vier Könige,
  Valat), settlement, give-up, forfeit, Trischaken.
- Dummies: seats with controllers (declarer / previous trick winner / first regular opponent), skipped in bidding and in starting-player
  rotation; 3 players + 1 dummy works. (The 2-player variant followed in milestone 3.)
- `view.ts`: `viewFor(state, seat)` hides other hands, the unrevealed Talon and other players' discards; reveals dummy hands when play starts
  (after the Talon stage) and all hands in Ouvert after trick 1.
- `clock.ts`: pure timer helpers (`clockKind`, banks, `bankExpiryOutcome`: forfeit for a 1v3 declarer, otherwise 10 s grace then a random
  legal move) and the licitation `timeoutAction`.
- Random legal-move bot and `sim.ts` invariants: all 54 cards conserved at every step, standings sum to zero, counted points total 70,
  view leaks checked, every legal action accepted by `apply`, termination.
- CLI: `pnpm sim -- --games 2000 --seed 1 [--players 3] [--infinite-contra]`.
- Tests: 103 passing at the time. Typecheck clean.

### Milestone 2a: match layer (done)
- `match.ts`: pure, JSON-serialisable `MatchState` over rounds. `createMatch`, `matchApply`, `nextRound` (only between rounds), `addElapsed`,
  `replayMatch`, `placings`.
- Starting-player rotation skips dummies. Standings are tracked for all four seats and always sum to zero; dummies are never placed.
- Win conditions: fixed rounds; target score (a tie at the top keeps the match going); time limit and the optional fail-safe (current round is
  finished, then the match ends; between rounds it ends at once). Round seeds derive from the match seed.
- More than 4 regular players (no dummies): four sit at the table, the rest spectate; after every round the player in seat `round % 4` goes to the
  back of the queue. The scoreboard has one entry per participant.
- Match-level event log: `roundStarted`, `action`, `roundFinished`, `timeExpired`, `matchFinished`.

### Milestone 2b: property tests and view-based legal actions (done)
- `viewActions.ts`: `legalActionsFromView`, `isLegalFromView`, `takeOptions`, `isValidTakeView`, `discardRulesView`, `isValidDiscardView`,
  `raiseableFromView`. Bots and UIs no longer need the full state.
- `property.test.ts` (fast-check, 300 random walks over 2, 3 and 4 players): invariants, determinism, no mutation, out-of-turn rejection,
  view-based legal actions equal state-based ones.

### Milestone 2c: heuristic bots (first version done)
- New package `@tarok/ai`: `Strategy`, `resolveAction`, `randomBot`, `heuristicBot`, `runTournament` (duplicate format) and `pnpm tournament`.
- `heuristicBot`: hand rating; bids Rufer, Solo, Dreier, Solodreier, Bettel, Piccolo and Farben contracts; never declares bonuses; contra only with a
  very strong hand; dedicated rules for negative contracts and Trischaken.
- Not bid by the bot (by decision): Besser Rufer, Sechsendreier, Zwiccolo, the Ouvert forms, Slovenian-method bids, declared bonuses.
- Measured: one heuristic bot against three random bots scores +6.6 per round; four heuristic bots: declarer side wins about 71%. Zero illegal proposals.

### Milestone 3: Farben play and the 2-player variant (done)
- **Forced-contract benchmark** (`pnpm forced`) with paired comparisons; Farben play (sure winners first, longest-suit Talon pick) and data-driven Farben
  bidding (`farbenScore`, Farbendreier from 5.5, Farbensolo from 10 untested).
- **2-player variant**: seats player / dummy / player / dummy; 1v3: the other player controls both dummies; 2v2: teams revealed when the king is called;
  calling the other player's king gives a `reshuffle` result (nothing scored, same starting player, not counted as a round); Trischaken control follows the trick winner.

### Milestone 4: host runner (done)
- `host.ts`: pure, JSON-serialisable `HostState`: stages `viewing`, `playing`, `betweenRounds`, `finished`; `hostAct`, `hostReady`, `hostContinue`,
  `hostSetController`, `hostTick`, `hostNextDeadlineMs`, `hostRunBots`, `hostRunToEnd`, `hostView`.
- Tests: 17 host tests plus a soak test with random input and time jumps over 40 matches. `docs/ui-guide.md` describes wiring a UI.

### Milestone 5: placeholder web UI (done)
- `apps/web`: Svelte 5 + Vite SPA, hash router, lazy screens. Initial JS 19.5 KB gzipped (budget 50).
- Menu, setup, options, rules screen, and a fully playable game screen (all phases). Everything the human can do comes from `HostView.legalActions`; no
  rules logic in the UI. jsdom tests play whole matches through the real buttons (4 players with clocks, 3 + dummy, 2 + 2 dummies, 5 players).
- Not verified: how it looks on real devices at that time.

### Fixes after the first test on real devices
- Selection no longer vanishes on clock ticks (plus a Play button); card size scales with the screen; the Talon is public (`talonTaken`);
  dummy hands open when play starts.

### Milestone 6: one time reserve (done, untested)
- All separate timers replaced by one **time** reserve per human per round (30 / 20 / 15 min for 2 / 3 / 4+ players) paying for card viewing, bidding,
  declarations, contra and play. `TimerConfig` is now `{ bankSeconds }`. Empty time: 10 s grace, then default action (licitation), random legal move,
  or forfeit for a 1v3 declarer. `HostView.timers` is `{ banksMs, graceMsLeft, actingParticipant, draining, matchMsLeft }`.

### Milestone 7: ready for hosting (done, untested)
- Secure deal (`deal(seed, deck?)`, `secureDeck()`, `RoundConfig.deck`, optional `deck` argument on `createMatch`, `nextRound`, `createHost`, `hostContinue`).
- `base: './'`, GitHub Pages and CI workflows, `docs/hosting.md`, Wake Lock, web manifest.

### Milestone 8: online rooms (written, untested)
- **`@tarok/protocol`**: client and server messages, a hand-written validator (`forfeit` never accepted), settings validation, look-alike-free room codes.
- **`apps/server`**: Worker (`POST /api/rooms`, `GET /api/rooms/:code/info`, `GET /api/rooms/:code/ws`, CORS and origin check via `ALLOWED_ORIGIN`) and a
  SQLite-backed Durable Object per room; all room logic in `roomCore.ts` with Node tests.
- **Rooms**: creator is host; others join by link or code; host turns free seats into bots and starts; latecomers spectate; server deals from `secureDeck()`,
  validates every intent, drives clocks from one alarm, paces bots, sends each connection only its own `hostView`.
- **Reconnects**: seat token in the browser; 20 s offline means a bot takes over; second tab replaces the first; an empty room is frozen; rooms idle for 24 h delete themselves.
- **Web client**: `OnlineGame` (same surface as the local `Game` via `GameLike`), `Online` and `Room` screens, route `#/room/CODE`.
- Not done on purpose: matchmaking, accounts, chat, rate limiting.
- Known gaps: `replayMatch` cannot reproduce online matches (decks not logged); no UI tests for the online screens; whole state persisted on every move;
  standard (non-hibernating) WebSockets.

### Milestone 9: CI and deployment repair (done, not yet re-run)
Cause of the failing CI: the milestone 6 to 8 migration (`tools/apply-changes.mjs`) was never applied, so half of the repository was at the milestone 5 API and
half at the milestone 8 API. Typecheck errors: `createMatch` / `nextRound` without the `deck` parameter, `RoundConfig` without `deck`, tests still using
`viewSeconds` / `licitationDecisionSeconds`.
- Applied the migration by hand: `RoundConfig.deck`, `deal(config.seed, config.deck)`, `deck` parameters in `match.ts`, new `TimerConfig` use in tests and
  `game.svelte.ts` (plus `roundsTotal`), `GameLike` in `ActionPanel` / `ResultDialog` / `GameScreen`, `room` route in `App.svelte`, Wake Lock, manifest link,
  bundle checker for relative asset paths, root `server:dev` / `server:deploy` scripts, `ui-guide.md` clocks row.
- **Deployment bugs found on the way:** `wrangler.toml` `ALLOWED_ORIGIN` was a repository URL (an origin has no path, so every request from the Pages site would
  be rejected with 403); it is now `https://dat-guy-test.github.io`. `pnpm-workspace.yaml` had placeholder text in `allowBuilds`.
- **Locales:** `pl.ts` had typos (`{messege}`), an English string and stale keys; both dictionaries now have the same keys, `clock.bank` became `clock.time`,
  `online.soon` was removed, `room.waitingNext` added.
- `tools/apply-changes.mjs` is obsolete (do not run it; it would duplicate locale keys): delete it. The duplicate `plan.md` and `rules.md` in the repository root
  are also stale: delete them and keep the `docs/` copies.

---

## 10. Next expected step

1. **Re-run CI.** Push the milestone 9 changes. Expect the engine typecheck to pass; the first run may still reveal errors that were hidden behind the engine failure
   (pnpm stops at the first failing package). Most likely spots: Svelte 5 typing in `online.svelte.ts` / `Room.svelte` / `GameScreen.svelte`, the
   `cloudflare:workers` types in `apps/server`, and the wrangler version. Run `pnpm typecheck && pnpm i18n && pnpm test` locally first if possible.
2. **Deploy:** `pnpm server:deploy`, set the repository variable `VITE_SERVER_URL` (or paste the Workers URL under *Play online -> Server address*), enable
   Pages (Source: GitHub Actions), then play on two phones. Check `https://<worker>.workers.dev/` shows `tarok server ok` and that creating a room does not
   return 403.
3. **Look at it on a real phone and fix the layout**, then replace `Card.svelte` and the colours with the real art; PWA service worker, Playwright screenshots in CI.
4. Online follow-ups: UI tests for `Online` / `Room` with a fake WebSocket, Playwright test with two browsers against `wrangler dev`, rate limiting, hibernating
   WebSockets, throttled persistence, optional chat, host kicking a player, sit-down for spectators when a seat frees up.
5. Rules notebook per language and the PDF pipeline (step 5); Polish rules text.
6. Ongoing bot work: tune other thresholds with forced benchmarks, defence in called-king games, optional ISMCTS.
7. Later (step 7): automatic matchmaking with a queue Durable Object, if wanted.

---

## 11. Open questions

All decisions the owner has made are folded into `rules.md`. Remaining assumptions are listed in `rules.md` section 12; none block the next step.

- Target-score matches continue while the top score is tied; first place is only decided by a unique leader at or above the target.
- With more than 4 players the player in seat `round % 4` is swapped out each round; dummies are only used with 3 players.
- `replayMatch` does not restore elapsed time (the `timeExpired` event restores its effect).
- Card viewing is paid from the time reserve per player (not a shared clock); with clocks off there is no viewing stage.
- A declarer who enters play with an empty reserve gets the 10 s grace before forfeiting; running out during play forfeits at once.
- Online: a disconnected human is replaced by a bot after 20 s; "next round" needs every human; a room frozen while empty does not charge time; the creator
  of a room is its host for life.

The 2-player variant is implemented; its assumptions are in `rules.md` section 12 (items 9 to 11).
