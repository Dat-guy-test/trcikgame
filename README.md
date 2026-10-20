# Tarok

Browser card game: Slovenian-style Tarok, local against bots or online in rooms.

- Rules (single source of truth): `docs/rules.md`
- Plan and progress: `docs/plan.md`
- Hosting for testing (GitHub Pages + Cloudflare): `docs/hosting.md`

## Layout

- `packages/engine`: pure TypeScript rules, round state machine and match layer (cards, tricks, contracts, bidding, scoring, views, view-based legal actions, clocks, random bot, simulation, match with 2 to any number of players). Tested.
- `packages/engine/src/host.ts`: the host runner (stages, one time reserve per player, bots, per-participant view); see `docs/ui-guide.md`.
- `packages/ai`: bot strategies that decide from a per-player view (random baseline, heuristic bot) and a tournament harness. Tested.
- `packages/protocol`: WebSocket message types and validation shared by client and server. Tested.
- `apps/web`: Svelte 5 + Vite web app with a fully playable placeholder UI (menu, setup, options, rules, local game, online rooms). See `apps/web/README.md`.
- `apps/server`: Cloudflare Worker + one Durable Object per room. `src/roomCore.ts` holds all room logic without Cloudflare types and is tested in Node.
- `content/*`: placeholders for later milestones.
- `tools/simulate.ts`: invariant-checking simulation. `tools/tournament.ts`: bot-vs-bot comparison.

## Commands

```
pnpm install                   # run again after pulling: new workspace packages (protocol, server)
pnpm dev                       # web app on http://localhost:5173
pnpm server:dev                # room server on http://localhost:8787 (needs a Cloudflare login only for deploying)
pnpm server:deploy             # deploy the room server (see docs/hosting.md)
pnpm build && node tools/check-bundle.mjs
pnpm i18n                      # translation key check
pnpm test                      # vitest (engine, ai, protocol, server, web)
pnpm typecheck
pnpm sim -- --games 2000 --seed 1 [--players 2|3] [--infinite-contra]
pnpm tournament -- --deals 500 --seed 1 --lineup heuristic,random,random,random [--players 2|3]
pnpm forced -- --contract farbendreier --deals 3000 --filter bid   # forced-contract benchmark
```

If pnpm warns about ignored build scripts for esbuild or workerd, run `pnpm approve-builds` once.
