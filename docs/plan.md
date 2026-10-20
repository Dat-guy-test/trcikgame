# Tarok website: Plan and progress

Merges the original `Plan.txt` with the progress made so far. Rules live in `rules.md`.
Last updated after milestone 8 (single time reserve, hosting preparation, online rooms). Milestones 6 to 8 were written without a build
environment: nothing in them has been compiled or run yet (see section 9, milestone 8, and section 10).

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
| 4 | Menus, settings and i18n framework | **Done** for English and Polish (typed keys, lazy language chunk, CI-style key check) |
| 5 | Rules notebook and PDF pipeline | Notebook screen renders `docs/rules.md` (English only); PDF not started |
| 6 | Online hosting | **Written, untested**: protocol, room server (Cloudflare Durable Object), lobby and room UI, secure shuffle; create / join rooms by code or link, no automatic matchmaking |
| 6a | Hosting preparation | **Done (untested)**: relative base, GitHub Pages workflow, CI workflow, `docs/hosting.md`, Wake Lock, web manifest |
| 7 | Automatic matchmaking and polish | Not started (matchmaking deliberately not wanted for now) |

---

## 2. Core decisions (unchanged from the original plan)

- **Language:** TypeScript everywhere. One language for client, server and rules; the engine is shared.
- **UI:** Svelte 5 + Vite, plain SPA (not SvelteKit). Fallback: Preact.
- **Rendering:** DOM + CSS transforms. No canvas, no game engine.
- **Card art:** inline SVG/CSS, one sprite, no raster images (themable, colourblind modes).
- **Online:** Cloudflare Workers + Durable Objects (WebSockets), one Durable Object per room. Fallback: small Node
  server with `ws`. Avoid Socket.IO and Firebase.
- **Hosting:** Cloudflare Pages (static frontend).
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

```
packages/
  engine/      pure rules, state machine, scoring, variants (shared)      <- real work so far
  ai/          bot strategies + tournament harness (shared)               <- first version
  protocol/    message types + validation (shared client/server)          <- written (milestone 8)
apps/
  web/         Svelte SPA: menu, settings, local and online UIs           <- placeholder
  server/      Cloudflare Worker + Durable Object "Room"                  <- written (milestone 8)
content/
  rules/<lang>/*.md    rules notebook source (single source of truth)
  i18n/<lang>.json     UI strings
tools/         build scripts (PDF, i18n key checks) and simulate.ts (CLI harness)
docs/          rules.md, plan.md
```

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
- `config`: match configuration types and timer defaults (3 min viewing, 20 s licitation, bank 20/15/10 minutes).

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
- Tests: 103 passing (cards, deal, pile counts, trick resolution, legal plays, bidding, settlement, round flows, forfeit, dummies, views,
  Trischaken, clocks, mass simulation covering every contract). Typecheck clean.

### Milestone 2a: match layer (done)
- `match.ts`: pure, JSON-serialisable `MatchState` over rounds. `createMatch`, `matchApply` (applies a round action; a finished round is settled
  immediately), `nextRound` (only between rounds), `addElapsed` (host reports wall-clock time), `replayMatch` (rebuilds a match from its event log),
  `placings`.
- Starting-player rotation skips dummies (3 players + 1 dummy: starters go 0, 2, 3, 0, ...). Standings are tracked for all four seats and always sum
  to zero; dummies are never placed or counted as winners.
- Win conditions: fixed rounds; target score (ends when a regular player has reached it and leads alone, a tie at the top keeps the match going);
  time limit and the optional fail-safe (when time runs out the current round is finished and the match ends; if the table is between rounds it ends
  at once). Round seeds derive from the match seed, so a match is reproducible from its seed and log.
- More than 4 regular players (no dummies): four sit at the table, the rest spectate. After every round the player in seat `round % 4` goes to the back
  of the spectator queue and the first spectator takes that seat, so everybody sits out equally often. The scoreboard (`standings`, `placings`) has one entry
  per participant; `table`, `queue`, `participantKinds` and `seatOf` map participants to seats. Spectators score nothing in rounds they do not play.
- Match-level event log: `roundStarted`, `action`, `roundFinished`, `timeExpired`, `matchFinished`.

### Milestone 2b: property tests and view-based legal actions (done)
- `viewActions.ts`: `legalActionsFromView`, `isLegalFromView`, `takeOptions`, `isValidTakeView`, `discardRulesView`, `isValidDiscardView`,
  `raiseableFromView`. `RoundView` gained `infiniteContra`. Bots and UIs no longer need the full state.
- `property.test.ts` (fast-check, 300 random walks over 4 players and 3 + dummy): every step keeps the engine invariants; `apply` is deterministic
  and does not mutate its input; acting out of turn is rejected; the view-based legal actions equal the state-based ones; nobody else gets any.

### Milestone 2c: heuristic bots (first version done)
- New package `@tarok/ai`: `Strategy { choose(view, rng) -> Action }`, `resolveAction` (falls back to a legal action and counts it),
  `randomBot` (baseline), `heuristicBot`, `runTournament` (duplicate format: each deal is replayed once per rotation so every strategy sits in every
  seat) and the `pnpm tournament` CLI.
- `heuristicBot`: hand rating (tarocks, Mond/Szkis, kings, queens, voids); bids the highest contract it is willing to play (Rufer, Solo, Dreier,
  Solodreier, Bettel, Piccolo); never declares bonuses; calls contra only with a very strong hand; calls the king of a suit it is long in but does not
  hold; plays alone when the called king is in the Talon (or switches to Dreier with a strong hand); takes the pile with the best card weights;
  discards from short suits; trick play: lead trumps with 6+ tarocks or lead a king, win cheaply, feed points to a winning partner, and dedicated rules for
  negative contracts and Trischaken.
- Farben: see milestone 3.
- Not bid by the bot (by decision): Besser Rufer, Sechsendreier, Zwiccolo, the Ouvert forms, Slovenian-method bids, declared bonuses. The engine and the
  random bot cover all of them.
- Measured (1500 deals, duplicate seats, 6000 rounds): one heuristic bot against three random bots scores +6.6 per round, the random bots between -1.5
  and -3.1. A table of four heuristic bots plays Rufer / Solo / Dreier / Trischaken (about 21% / 41% / 14% / 24% of rounds) and the declarer side wins
  about 71% of the time. Zero illegal proposals in all runs. Thresholds are untuned (`THRESHOLDS` in `hand.ts`).
- Tests: engine 120 (103 before, 16 match, 1 property test of 300 random walks), ai 10. Typecheck clean for both packages.

### Milestone 3: Farben play and the 2-player variant (done)
- **Forced-contract benchmark** (`packages/ai/src/forced.ts`, `pnpm forced`): seat 0 declares a chosen contract on every deal that passes a filter, the others
  defend; `runForcedComparison` replays the same deals for several bot variants (paired comparison). `createHeuristicBot(options)` makes the bot configurable.
  Farben contracts are too rare in normal tournaments (about 1-2% of rounds) to tune any other way.
- **Farben play** (paired test, 281 deals, declarer counted points against unchanged defenders): leading sure winners first ("masters": a card whose higher
  cards are all played or in hand, using card memory from the tricks so far) +1.1 +- 0.5; Talon pick that prefers cards of the longest suit +0.3; defenders
  cashing sure winners lowers the declarer's result by 0.6 +- 0.3, so both sides gained. Dumping outside the longest suit made no difference (left off).
- **Farben bidding** is now data-driven. A forced run over 45,000 random hands showed that kings dominate and long tarock holdings hurt (1-point tarocks must
  be discarded). The rule is `farbenScore = 2 * kings + (longest plain suit - 4) - 0.75 * max(0, tarocks - 2)`: Farbendreier from 5.5 (won 64% with mean +3.9
  per round over 2,951 deals; about 1.8% of rounds in a heuristic-only tournament), Farbensolo from 10 (untested: too rare to measure; solo win rates were far
  below break-even for every ordinary hand). Your example rule (6+ cards and 2+ kings) turned out to be about break-even.
- **2-player variant** (rules in `rules.md` section 9): seats player / dummy / player / dummy. 1v3: the other player controls both dummies. 2v2: teams are revealed
  when the king is called and each player controls the dummy on their team. Calling the other player's king gives a new result kind `reshuffle` (nothing scored);
  the match layer deals again with the same starting player and does not count it as a round. Trischaken: one player controls both dummies, control follows
  the trick winner. Covered by round tests, a 400-round simulation, the property test (now 2, 3 and 4 players) and a 2-player match test.
- Tests: engine 127, ai 11. Typecheck clean.

### Milestone 4: host runner (done)
- `host.ts`: a pure, JSON-serialisable `HostState` around the match. The host owns what the engine leaves out. Stages: `viewing` (shared 3-minute card
  viewing, ends early when every human at the table is ready), `playing`, `betweenRounds` (waits for `hostContinue`), `finished`.
- Input: `hostAct` (rejects out-of-turn actions, spectators and `forfeit`), `hostReady`, `hostContinue`, `hostSetController` (hand a participant to a bot for a
  disconnect / AFK, or back; it also unblocks a card-viewing phase).
- Time: `hostTick(host, ms, rng)` charges only the waiting human. Licitation: 20 s per decision, then the default action. Bank (from the king call): empty bank
  means forfeit for a 1v3 declarer, otherwise 10 s of grace and then a random legal move. Bots are never timed. The match time limit and fail-safe also run
  from the tick. Long ticks (a suspended tab) are processed event by event. `hostNextDeadlineMs` says when something will next happen (one server alarm).
- Bots: `hostRunBots(host, botFor, rng, maxMoves)` moves bots until a human must act (`maxMoves = 1` animates one move at a time; an illegal proposal falls
  back to a legal action). `hostRunToEnd` plays a match on autopilot. `randomViewBot` is a minimal bot; `@tarok/ai` strategies fit the `BotFn` shape.
- `hostView(host, participant)`: everything a client renders in one object: the round view (a spectator gets `seat -1`: no hands), the participant's
  legal actions, table and spectator queue, standings and placings, round history, and all clocks. `viewFor` accepts seat -1 for spectators.
- Tests: 17 host tests (autopilot for 2, 3, 4 and 6 players, viewing, licitation timeout, forfeit, grace and random move, time limit, spectators, JSON round
  trip, deadlines) and a soak test with random input and time jumps over 40 matches checking the engine invariants and zero-sum standings. Engine 144 tests,
  ai 12 (heuristic bots play whole 2 to 6 player matches through the host).
- `docs/ui-guide.md` describes how to wire a UI to the host.

### Milestone 5: placeholder web UI (done)
- `apps/web`: Svelte 5 + Vite SPA, hash router, screens loaded as separate chunks. Initial JS is 19.5 KB gzipped (budget 50); the game chunk
  (UI + engine + bots) is 23.5 KB and loads only when a game starts. Checked by `tools/check-bundle.mjs`.
- Menu (name, local game, online placeholder, rules, options, language switch), setup (2 to 8 players, win condition, fail-safe, clocks, unlimited contra),
  options (name, language, point values on cards, colour-blind suits, bot speed), rules screen (renders `docs/rules.md`, PDF button disabled).
- Game screen, all phases playable: card viewing with the shared clock and a Ready button, bidding (including Slovenian-method and Besser Rufer
  bonus choices), declarations, contra chain, king call, king in the Talon, Talon take (tap cards or take a pile), discard (with suggestion), card play
  (tap to select, tap again to play), a pause on each finished trick, round result dialog with counted points and bonuses, scoreboard with round history,
  final standings. Dummies show their open hands; a human who controls a dummy plays its cards from the bottom hand. Spectators (more than 4 players)
  see the table without hands and continue with the next round.
- Everything the human can do comes from `HostView.legalActions` (plus `isValidTakeView` / `isValidDiscardView` for free card selections); the UI has no
  rules logic. Strings are keys: 149 keys in English and Polish, no strings in the engine.
- Tests (`apps/web/test`, jsdom): menu language switch, setup, rules rendering, and four complete matches (4 players with clocks, 3 + dummy, 2 + 2 dummies,
  5 players with a rotating spectator) played only by clicking the real buttons; they check that phases bidding, declare, king call, take, discard and play
  were all exercised and that the final standings sum to zero. svelte-check: 0 errors.
- Not verified here: how it looks. There was no browser in the build environment, so layout, colours and touch behaviour on real phones are untested
  (the code follows the mobile rules in section 6: dvh, safe areas, 44 px targets, tap-to-select, reduced motion).
- Known placeholder shortcuts: cards are CSS and text (swap `Card.svelte`); one human only (no hot-seat); no animation beyond a trick pause; the bots always
  use the heuristic strategy; PWA, Wake Lock and the PDF are not done.

### Fixes after the first test on real devices
- **Selection no longer vanishes.** The selected card(s) were cleared on every 250 ms clock tick (the view object is rebuilt each tick, and an effect depended on
  it). The selection now only resets when the situation really changes (phase, trick, whose turn) or when you tap away from the cards and buttons. A Play
  button was added next to tap-again-to-play. Two UI tests reproduce the old bug (they fail without the fix): selection survives ticks, discard selection survives.
- **Card size scales with the screen:** the root font size grows from 16 px on phones up to 30 px on large monitors (limited by window height), and cards and UI
  are sized in rem, so phones are unchanged.
- **Talon is public.** The round view gained `talonTaken` (the cards the declarer took; empty for Solo-type contracts, `null` before the take). The table
  shows the revealed Talon to everybody, with the taken cards highlighted and the defenders' pile dimmed (collapsible during play).
- **Dummy hands open when play starts** (after the declarer's take and discard, or immediately when there is no Talon stage), no longer when bidding ends.
  `rules.md` section 9 was updated.
- Tests: engine 147, ai 12, web 9. Typecheck clean.

### Milestone 6: one time reserve (done, untested)
- All separate timers are gone. Each human has one **time** reserve per round (30 min with 2 players, 20 with 3, 15 with 4 or more) that pays for card viewing,
  bidding, declarations, contra and card play. `TimerConfig` is now just `{ bankSeconds }`; `viewSeconds` and `licitationDecisionSeconds` were removed.
- Card viewing still has a Ready button; every unready human pays from their own time, and running out counts as ready. With clocks off there is no viewing stage.
- Empty time: 10 s grace per turn, then the default action in bidding / declaration / contra, a random legal move from the king call on, and forfeit for a
  1v3 declarer (immediately when the reserve reaches zero during play, after the grace when it was already empty on entering play).
- `HostView.timers` is now `{ banksMs, graceMsLeft, actingParticipant, draining, matchMsLeft }` (`draining` lets a client count the running clocks down locally).
- "Bank" renamed "time" in the UI (`clock.time`), `rules.md` sections 1.5 and 10.2 rewritten, `rules.md` and `docs/rules.md` kept identical.
- Tests: `host.test.ts` rewritten for the new clocks (viewing is paid from the reserve, bidding drains it, grace then pass, forfeit after grace), `bidding.test.ts` defaults updated.

### Milestone 7: ready for hosting (done, untested)
- **Secure deal.** `deal(seed, deck?)`, `secureDeck()` (Web Crypto shuffle), `RoundConfig.deck`, and an optional `deck` argument on `createMatch`, `nextRound`,
  `createHost` and `hostContinue`. Local play still uses seeds. Tests in `online.test.ts`.
- `apps/web/vite.config.ts` uses `base: './'` (works under a GitHub Pages sub-path; the router is hash-based). `tools/check-bundle.mjs` understands relative asset paths.
- `.github/workflows/pages.yml` (build, i18n check, bundle budget, deploy to GitHub Pages) and `ci.yml` (typecheck, i18n, tests).
- Wake Lock while a game is open (`lib/wakeLock.ts`), `manifest.webmanifest` and an SVG icon (installable on Android in principle; no service worker yet, so no offline mode).
- `docs/hosting.md`: step-by-step for GitHub Pages, Cloudflare Workers, alternatives, local development.

### Milestone 8: online rooms (written, untested)
- **`@tarok/protocol`**: `ClientMessage` (join, act, ready, next, slot, start, ping) and `ServerMessage` (welcome, lobby, state, error, pong); a hand-written validator rebuilds
  clean actions from untrusted JSON (`forfeit` is never accepted), room settings validation, room codes without look-alike characters. Tests included.
- **`apps/server`**: Worker (`POST /api/rooms`, `GET /api/rooms/:code/info`, `GET /api/rooms/:code/ws`, CORS and origin check via `ALLOWED_ORIGIN`) and a SQLite-backed Durable Object per
  room. All room logic lives in `roomCore.ts` without Cloudflare types and has Node tests (lobby rules, whole match with two humans + bots + a spectator, no hidden-hand leaks,
  takeover and reconnect, frozen empty room).
- **Rooms.** The creator gets a secret token and becomes the host. Others join by link or code and take free seats; the host can turn free seats into bots and starts the game once every
  seat is filled. Latecomers after the start and extra visitors are spectators (public view, no hands). The server deals from `secureDeck()`, validates every intent, runs the engine host,
  drives the clocks from one alarm (`hostNextDeadlineMs`), paces bots (0.7 s, 1.6 s after a finished trick) and sends each connection only its own `hostView`.
- **Reconnects.** The seat token is kept in the browser. A human who is offline for 20 s is replaced by a bot (`hostSetController`) and gets the seat back on reconnect; a second tab
  replaces the first. A room with nobody connected is frozen (no clocks, no bots); rooms untouched for 24 h delete themselves. State is persisted as JSON after every change.
- **Next round** starts when every human has pressed it (a room with only bots continues by itself).
- **Web client.** `OnlineGame` (WebSocket client with the same surface as the local `Game`, local count-down of running clocks, trick display pause), `GameLike` interface so the game screen is shared,
  `screens/Online.svelte` (name, room settings, create, join by code, server address) and `screens/Room.svelte` (name prompt, lobby with seats and invite link, then the game),
  hash route `#/room/CODE`. 30 new UI keys in English and Polish.
- **Not done on purpose:** automatic matchmaking, accounts, chat, taking over an abandoned seat as a new player, rate limiting.
- **Known gaps:** `replayMatch` cannot reproduce online matches (the decks are not logged); the client has no UI test for the online screens; the server persists the whole state on every
  move (fine for testing, worth throttling later); standard (non-hibernating) WebSockets are used, which keeps rooms simple but bills duration while connected.

---

## 10. Next expected step

1. **Run everything once.** Milestones 6 to 8 were written without a Node environment. Extract the zip over the repo, run `node tools/apply-changes.mjs`, `pnpm install`, then
   `pnpm typecheck && pnpm test && pnpm i18n` and fix whatever the compiler or tests report (most likely spots: Svelte 5 typing in `online.svelte.ts` / `Room.svelte`, the
   `cloudflare:workers` types in `apps/server`, and the wrangler version in `apps/server/package.json`).
2. **Try it for real:** `pnpm server:dev` + `pnpm dev` with two browsers, then deploy following `docs/hosting.md` and play on two phones.
3. **Look at it on a real phone and fix the layout** (still not verified), then replace `Card.svelte` and the colours with the real art; PWA service worker, Playwright screenshots at phone sizes in CI.
4. Online follow-ups: UI tests for `Online` / `Room` with a fake WebSocket, Playwright test with two browsers against `wrangler dev`, rate limiting, hibernating WebSockets, throttled persistence,
   optional chat, host kicking a player, sit-down for spectators when a seat frees up.
5. Rules notebook per language and the PDF pipeline (step 5); Polish rules text.
6. Ongoing bot work: tune other thresholds with forced benchmarks, defence in called-king games, optional ISMCTS.
7. Later (step 7): automatic matchmaking with a queue Durable Object, if wanted.

---

## 11. Open questions

All decisions the owner has made are folded into `rules.md`. Remaining assumptions are listed in `rules.md` section 12; none block the next step.
New assumptions made in this milestone (easy to change):

- Target-score matches continue while the top score is tied; first place is only decided by a unique leader at or above the target.
- With more than 4 players the player in seat `round % 4` is swapped out each round (one spectator in, one player out); dummies are only used with 3 players.
- `replayMatch` does not restore elapsed time (the `timeExpired` event restores its effect).

New assumptions in milestones 6 to 8 (easy to change):

- Card viewing is paid from the time reserve per player (not a shared clock); with clocks off there is no viewing stage.
- A declarer who enters play with an empty reserve gets the 10 s grace before forfeiting; running out during play forfeits at once.
- Online: a disconnected human is replaced by a bot after 20 s; "next round" needs every human; a room frozen while empty does not charge time; the creator of a room is its host for life.

The 2-player variant is implemented; its assumptions are in `rules.md` section 12 (items 9 to 11).
