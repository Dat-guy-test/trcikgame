/** What the game screen needs from a game. Implemented by the local `Game` and by `OnlineGame` (WebSocket client). */
import type { Action, CompletedTrick, HostView, OptionChange } from '@tarok/engine';
import type { RoomSettings, VoteInfo, VoteResult } from '@tarok/protocol';

export interface GameLike {
  readonly view: HostView;
  readonly names: readonly string[];
  /** The trick that was just completed, shown for a moment. */
  readonly hold: CompletedTrick | null;
  readonly roundsTotal: number | null;
  readonly online?: boolean;
  /** Online: this player already pressed "next round" and waits for the others. */
  readonly votedNext?: boolean;
  /** Online: the current room options (they change when a vote passes). */
  readonly roomSettings?: RoomSettings | null;
  /** Online: the running option vote, the time left on it, and the outcome of the last one. */
  readonly vote?: VoteInfo | null;
  readonly voteMsLeft?: number | null;
  readonly voteResult?: VoteResult | null;
  nameOf(participant: number | null | undefined): string;
  act(action: Action): void;
  ready(): void;
  next(): void;
  propose?(change: OptionChange): void;
  castVote?(approve: boolean): void;
  start(): void;
  destroy(): void;
}
