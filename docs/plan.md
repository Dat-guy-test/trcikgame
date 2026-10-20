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
