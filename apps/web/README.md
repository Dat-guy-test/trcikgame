# apps/web

Svelte 5 + Vite single-page app. A **working placeholder UI**: every phase of the game is playable, the art is CSS and text.

```
pnpm install
pnpm dev            # http://localhost:5173
pnpm build          # then: node tools/check-bundle.mjs   (initial JS budget: 50 KB gzip)
pnpm --filter @tarok/web test        # DOM tests: whole 2, 3, 4 and 5 player matches played through the buttons
pnpm --filter @tarok/web typecheck   # svelte-check
pnpm i18n           # every language has the English keys, every t('key') exists
```

## Where things are

| Path | What |
|---|---|
| `src/lib/game.svelte.ts` | `Game`: one `HostState` from the engine, one human (participant 0), bots, trick display pause, clock ticking. The only place that talks to the engine's host. |
| `src/screens/` | `Menu`, `Setup`, `Options`, `Rules` (renders `docs/rules.md`), `Online` (placeholder), `GameScreen` |
| `src/components/ActionPanel.svelte` | bidding, declarations, contra, king call, Talon, discard. Built from `view.legalActions`; no rules logic |
| `src/components/Card.svelte` | **the one file to replace for real card art** (keep the props). `lib/cardUi.ts` holds labels and sorting |
| `src/lib/locales/` | `en.ts` (key set) and `pl.ts` (lazy chunk). Add a language: copy `pl.ts`, register it in `i18n.svelte.ts` and `settings.svelte.ts` |
| `src/app.css` | colour and spacing variables (the table, the card faces, colour-blind palette) |

Swapping in real art or a new layout does not touch the game logic: components only read `HostView` and call `game.act / ready / next`.
See `docs/ui-guide.md` for the data each component uses.
