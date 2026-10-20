/**
 * Clock rules (pure helpers; the host/server drives real time). See docs/rules.md (section 10.2).
 *
 * Every human has ONE time reserve per round ("time"). It is charged for card viewing, bidding, declarations, contra and card play,
 * but only while the table waits for that player. Dummy decisions drain the controller's time. Bots are not timed.
 * With an empty reserve a player gets GRACE_SECONDS per turn; then:
 *  - 'licitation' turns (bidding, declare, contra): the default action (`timeoutAction`);
 *  - 'bank' turns (from the king call on): a random legal move, or `forfeit` for the declarer of a 1v3 game.
 */
import { effectiveOneVsThree, expectedActor } from './round';
import { BANK_PHASES, type RoundState } from './state';

export type ClockKind = 'licitation' | 'bank' | null;

/** Seconds a player may take per turn once their time is empty. */
export const GRACE_SECONDS = 10;

export function clockKind(s: RoundState): ClockKind {
  if (s.phase === 'done') return null;
  return BANK_PHASES.includes(s.phase) ? 'bank' : 'licitation';
}

export interface Banks {
  /** Remaining milliseconds per seat (dummy seats are unused). */
  ms: number[];
}

export function initialBanks(seatKinds: readonly ('player' | 'dummy')[], bankSeconds: number): Banks {
  return { ms: seatKinds.map((k) => (k === 'player' ? bankSeconds * 1000 : 0)) };
}

/** Charges `elapsedMs` of waiting time to a seat's reserve. Never goes below zero. */
export function charge(banks: Banks, seat: number, elapsedMs: number): Banks {
  const ms = banks.ms.slice();
  ms[seat] = Math.max(0, ms[seat]! - elapsedMs);
  return { ms };
}

export type ExpiryOutcome =
  /** The declarer of a 1v3 game ran out of time on a 'bank' turn: they lose and the round ends (`forfeit` action). */
  | 'forfeit'
  /** Everyone else gets GRACE_SECONDS per turn, then a random legal move. */
  | 'graceThenRandomMove';

export function bankExpiryOutcome(s: RoundState, actor: number): ExpiryOutcome {
  if (clockKind(s) === 'bank' && actor === s.declarer && expectedActor(s) === actor && effectiveOneVsThree(s)) {
    return 'forfeit';
  }
  return 'graceThenRandomMove';
}
