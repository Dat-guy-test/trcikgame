# Tarok

Browser card game: Slovenian-style Tarok.

- Rules (single source of truth): `docs/rules.md`
- Plan and progress: `docs/plan.md`

## Layout

- `packages/engine`: pure TypeScript rules and round state machine (cards, tricks, contracts, bidding, scoring, views, clocks, random bot, simulation). Tested.
- `packages/protocol`, `apps/web`, `content/*`: placeholders for later milestones.
- `tools/simulate.ts`: CLI harness.

## Commands

```
pnpm install
pnpm test                      # vitest
pnpm typecheck
pnpm sim -- --games 2000 --seed 1 [--players 3] [--infinite-contra]
```

If pnpm warns about ignored build scripts for esbuild, run `pnpm approve-builds` once.
