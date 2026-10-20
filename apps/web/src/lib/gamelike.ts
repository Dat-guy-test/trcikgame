/** What the game screen needs from a game. Implemented by the local `Game` and by `OnlineGame` (WebSocket client). */
import type { Action, CompletedTrick, HostView } from '@tarok/engine';

export interface GameLike {
  readonly view: HostView;
  readonly names: readonly string[];
  /** The trick that was just completed, shown for a moment. */
  readonly hold: CompletedTrick | null;
  readonly roundsTotal: number | null;
  readonly online?: boolean;
  /** Online: this player already pressed "next round" and waits for the others. */
  readonly votedNext?: boolean;
  nameOf(participant: number | null | undefined): string;
  act(action: Action): void;
  ready(): void;
  next(): void;
  start(): void;
  destroy(): void;
}
