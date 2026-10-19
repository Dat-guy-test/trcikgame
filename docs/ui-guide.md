# Wiring up the UI

This is implemented as a placeholder in `apps/web` (see its README). The notes below explain the design and what a replacement UI must do.

The UI never touches round state. It holds one `HostState` (from `@tarok/engine`), renders `hostView(host, me)` and sends intents
through the host functions. Every function is pure: it returns a new `HostState`.

## 1. The game store (`apps/web/src/lib/game.svelte.ts`)

```ts
import { createHost, hostAct, hostContinue, hostReady, hostRunBots, hostTick, hostView, hostNextDeadlineMs,
         createRng, type Action, type Controller, type MatchConfig } from '@tarok/engine';
import { heuristicBot } from '@tarok/ai';

export class Game {
  host = $state.raw(createHost(config, seed, controllers));   // .raw: replaced on every change, never mutated
  me: number;                                                  // participant index of the local human
  view = $derived(hostView(this.host, this.me));
  private rng = createRng(Date.now() >>> 0);
  private last = performance.now();

  act = (a: Action) => { this.host = hostAct(this.host, this.me, a); this.pump(); };
  ready = () => { this.host = hostReady(this.host, this.me); this.pump(); };
  next = () => { this.host = hostContinue(this.host); this.pump(); };

  /** Called by a 250 ms interval (and on visibilitychange): real time passes. */
  tick = () => {
    const now = performance.now();
    this.host = hostTick(this.host, now - this.last, this.rng);
    this.last = now;
    this.pump();
  };

  /** Bots move one at a time so the table can animate: ~500 ms per bot move. */
  private pump() {
    if (this.timer) return;
    const step = () => {
      this.timer = 0;
      const before = this.host;
      this.host = hostRunBots(this.host, () => heuristicBot.choose, this.rng, 1);
      if (this.host !== before) this.timer = window.setTimeout(step, 500);
    };
    this.timer = window.setTimeout(step, 500);
  }
  private timer = 0;
}
```

For a game with one human, set `controllers[me] = 'human'` and the rest `'bot'`. For a hot-seat game mark several participants
`'human'` and pass the participant whose turn it is (`view.timers.actingParticipant`) to `hostView`.

## 2. Screens and the data they read

| Screen / component | Reads | Sends |
|---|---|---|
| Table | `view.round.hands`, `handSizes`, `trick`, `leader`, `seat`, `table` | nothing |
| Hand (tap a card to select, tap again to play) | `view.legalActions` filtered to `type: 'play'` (gray out the rest) | `act({type:'play', card})` |
| Bidding sheet | `legalActions` with `type: 'bid' / 'pass' / 'confirm'`; show `round.currentBid`, `bidder` | `act(action)` |
| Declaration, contra, king call, king in Talon | the matching `legalActions` (`declare`, `contra` / `noContra`, `callKing`, `kingInTalon`) | `act(action)` |
| Talon take | `round.talon.piles` and the `take` actions (each one is a valid set of cards) | `act({type:'take', cards})` |
| Discard | `round.hands[seat]`, `round.take`; check a selection with `isValidDiscardView(view.round, cards)`; the one action in `legalActions` is a suggestion | `act({type:'discard', cards})` |
| Clocks | `view.timers`: `viewMsLeft`, `decisionMsLeft`, `banksMs`, `graceMsLeft`, `actingParticipant`, `matchMsLeft` | `ready()` during `stage === 'viewing'` |
| Scoreboard | `view.standings`, `placings`, `participantKinds`, `rounds` (history), `queue` (spectators) | nothing |
| Round result | last entry of `view.rounds`; `round.result` for the details (counted points, bonuses) | `next()` while `stage === 'betweenRounds'` |
| Match end | `view.finished`, `view.winners` | back to the menu |

Rules of thumb:

- Never compute legality in the UI. If an action is not in `legalActions` (or `isValidDiscardView` fails) the button is disabled.
- The engine emits codes, not text: `ContractId`, `Phase`, `Action.type`, `BonusKind`, suit names, tarock numbers. Map them through
  the i18n dictionaries (`content/i18n/<lang>.json`); no strings in the engine.
- `stage` drives which screen is on top: `viewing` (cards + ready button + shared timer), `playing`, `betweenRounds`
  (result dialog), `finished`.
- A spectator (`view.seat === null`) gets the same view with no hands and no `legalActions`.
- Dummy hands are in `view.round.hands` once bidding is over. When the local human controls a dummy, the dummy's turn shows up
  in `legalActions` (the actor is the controller), so the hand component should offer the cards of
  `(leader + trick.length) % 4`, not only the human's own seat.

## 3. Mobile layout (from plan section 6)

Hand as a horizontal strip with overlap that never overflows, `dvh` units, safe-area insets, 44 px targets, tap-to-select then
tap-to-play, `prefers-reduced-motion`, Wake Lock while `stage !== 'finished'`. Animate only `transform` and `opacity`.

## 4. Settings and persistence

Name, language, options, card-size and colour-blind mode in `localStorage`. A local game can also keep the `HostState` JSON
(`JSON.stringify(host)`) to resume after a reload; it contains the seed and all hands, so never send it to another player.

## 5. Online later

The same screens work unchanged: replace the `Game` class by a thin client that sends `{act, ready, next}` intents over a WebSocket
and receives a `HostView` per change. The server (a Durable Object per room) owns the `HostState`, calls the same host functions,
sets one alarm from `hostNextDeadlineMs`, and runs `hostSetController(.., 'bot')` for a disconnected player.
