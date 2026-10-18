/**
 * Clock rules (pure helpers; the host/server drives real time). See docs/rules.md (timers).
 *
 *  - 'view'       : 3 minutes shared by all players when hands are revealed (host-managed).
 *  - 'licitation' : 20 s per decision during bidding, declarations and contra; on expiry use `timeoutAction`.
 *  - 'bank'       : from and including the king call; draws on the acting player's per-round bank.
 *                   Dummy decisions drain the controller's bank. Bots are not timed.
 */
import { effectiveOneVsThree, expectedActor } from './round';
import { BANK_PHASES, type RoundState } from './state';

export type ClockKind = 'licitation' | 'bank' | null;

/** Seconds a player may take per turn once their bank is empty. */
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

/** Charges `elapsedMs` of waiting time to a seat's bank. Never goes below zero. */
export function charge(banks: Banks, seat: number, elapsedMs: number): Banks {
  const ms = banks.ms.slice();
  ms[seat] = Math.max(0, ms[seat]! - elapsedMs);
  return { ms };
}

export type ExpiryOutcome =
  /** The declarer of a 1v3 game ran out of bank: they lose and the round ends (`forfeit` action). */
  | 'forfeit'
  /** Everyone else gets GRACE_SECONDS per turn, then a random legal move is played. */
  | 'graceThenRandomMove';

export function bankExpiryOutcome(s: RoundState, actor: number): ExpiryOutcome {
  if (clockKind(s) === 'bank' && actor === s.declarer && expectedActor(s) === actor && effectiveOneVsThree(s)) {
    return 'forfeit';
  }
  return 'graceThenRandomMove';
}
