import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  IllegalAction, apply, checkInvariants, isLegalFromView, legalActions, legalActionsFromView, newRound, viewFor,
  type LegalAction, type RoundState, type SeatKind,
} from '../src';

const P4: SeatKind[] = ['player', 'player', 'player', 'player'];
const D3: SeatKind[] = ['player', 'dummy', 'player', 'player'];
const D2: SeatKind[] = ['player', 'dummy', 'player', 'dummy'];

const arbSetup = fc.record({
  seed: fc.integer({ min: 0, max: 2 ** 31 - 1 }),
  players: fc.constantFrom(4, 3, 2),
  start: fc.nat(3),
  choices: fc.array(fc.nat(), { maxLength: 300 }),
});

const canon = (acts: readonly LegalAction[]) => acts.map((a) => JSON.stringify(a)).sort();

/** Plays a random walk through legal actions (then always the first legal action) and checks each step. */
interface Setup { seed: number; players: number; start: number; choices: number[] }

function walk(setup: Setup): RoundState {
  const seatKinds = setup.players === 2 ? D2 : setup.players === 3 ? D3 : P4;
  const regs = [0, 1, 2, 3].filter((x) => seatKinds[x] === 'player');
  let s = newRound({
    seatKinds, startingPlayer: regs[setup.start % regs.length]!, seed: setup.seed, infiniteContra: setup.seed % 2 === 0,
  });
  for (let i = 0; s.phase !== 'done'; i++) {
    if (i > 1000) throw new Error('did not terminate');
    const acts = legalActions(s);
    expect(acts.length).toBeGreaterThan(0);
    const a = acts[i < setup.choices.length ? setup.choices[i]! % acts.length : 0]!;

    // The view-based legal actions equal the state-based ones, and nobody else may act.
    const v = viewFor(s, a.actor);
    expect(canon(legalActionsFromView(v))).toEqual(canon(acts));
    expect(isLegalFromView(v, a.action)).toBe(true);
    const other = [0, 1, 2, 3].find((x) => x !== a.actor)!;
    expect(legalActionsFromView(viewFor(s, other))).toEqual([]);
    expect(() => apply(s, other, a.action)).toThrow(IllegalAction);

    // apply is deterministic and does not mutate its input.
    const before = JSON.stringify(s);
    const n1 = apply(s, a.actor, a.action);
    const n2 = apply(s, a.actor, a.action);
    expect(JSON.stringify(n1)).toBe(JSON.stringify(n2));
    expect(JSON.stringify(s)).toBe(before);

    s = n1;
    checkInvariants(s);
  }
  return s;
}

describe('state machine properties', () => {
  it('random action sequences keep every invariant and terminate', () => {
    fc.assert(fc.property(arbSetup, (setup) => { walk(setup); }), { numRuns: 300 });
  }, 180_000);
});
