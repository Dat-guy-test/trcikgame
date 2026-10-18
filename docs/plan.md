# Tarok website: Plan and progress

Merges the original `Plan.txt` with the progress made so far. Rules live in `rules.md`.
Last updated after milestone 1 (engine core, state machine, simulation harness).

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
| 1 | Engine + CLI harness | **In progress**: core, state machine, views, clock helpers and harness done; match layer remaining |
| 2 | Heuristic bots | Not started |
| 3 | Local game UI | Not started |
| 4 | Menus, settings and i18n framework | Not started |
| 5 | Rules notebook and PDF pipeline | Not started (source of truth is `docs/rules.md`) |
| 6 | Online hosting | Not started |
| 7 | Matchmaking and polish | Not started |

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
  ai/          bot strategies (shared)                                    <- not created yet
  protocol/    message types + validation (shared client/server)          <- placeholder
apps/
  web/         Svelte SPA: menu, settings, local and online UIs           <- placeholder
  server/      Cloudflare Worker + Durable Object "Room"                  <- not created yet
content/
  rules/<lang>/*.md    rules notebook source (single source of truth)
  i18n/<lang>.json     UI strings
tools/         build scripts (PDF, i18n key checks) and simulate.ts (CLI harness)
docs/          rules.md, plan.md
```

Engine modules (`packages/engine/src`): `cards`, `rng`, `deal`, `tricks`, `contracts` (contract table as data), `bidding`,
`scoring`, `config`, `state`, `evaluate`, `round` (state machine), `view`, `clock`, `bot` (random bot), `sim`.

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

**Timers in the UI:** show the shared card-viewing clock, the per-decision licitation clock, each player's bank and a grace-period
indicator; a "no contra" button; a "ready" button during card viewing; match time-limit banner ("finishing this round").

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
  rotation; 3 players + 1 dummy works. The 2-player variant is deferred.
- `view.ts`: `viewFor(state, seat)` hides other hands, the unrevealed Talon and other players' discards; reveals dummy hands after bidding and
  all hands in Ouvert after trick 1.
- `clock.ts`: pure timer helpers (`clockKind`, banks, `bankExpiryOutcome`: forfeit for a 1v3 declarer, otherwise 10 s grace then a random
  legal move) and the licitation `timeoutAction`.
- Random legal-move bot and `sim.ts` invariants: all 54 cards conserved at every step, standings sum to zero, counted points total 70,
  view leaks checked, every legal action accepted by `apply`, termination.
- CLI: `pnpm sim -- --games 2000 --seed 1 [--players 3] [--infinite-contra]`.
- Tests: 103 passing (cards, deal, pile counts, trick resolution, legal plays, bidding, settlement, round flows, forfeit, dummies, views,
  Trischaken, clocks, mass simulation covering every contract). Typecheck clean.

---

## 10. Next expected step

**Finish step 1, then step 2.** In this order:

1. **Match layer** (pure, in `packages/engine`): `Match` state over rounds with the starting-player rotation (skipping dummies), cumulative
   standings per seat (dummies tracked but excluded from placings), win conditions (target score, fixed rounds, time limit and the optional
   fail-safe), and a match-level event log. Tests for each win condition and the "finish the current round" behaviour.
2. **Property-based tests** (fast-check) on the state machine: random action sequences never break invariants; `apply` is deterministic.
3. **View-based legal actions:** derive what a bot or UI may do from a `RoundView` alone, so bots never need the full state.
4. **Heuristic bots** in `packages/ai` (step 2): conservative bidding by hand strength, sensible king calls and discards, trick play with
   must-beat awareness for negative contracts, and bot-vs-bot tournaments to compare strategies.

After that: local game UI (step 3).

---

## 11. Open questions

All decisions the owner has made are folded into `rules.md`. Remaining assumptions are listed in `rules.md` section 12; none block the next step.
Deferred: the 2-player variant (each player controls a dummy; reshuffle if the declarer calls the other player's king).
