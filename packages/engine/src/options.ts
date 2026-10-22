/**
 * Mid-match changes made by the host layer: option votes (online) and seat changes when a player leaves or comes back.
 * All functions are pure like the rest of the host.
 */
import type { HostState } from './host';
import { matchSetOptions, matchSetParticipantKind, roundHasNoDecision, type MatchOptions } from './match';
import { IllegalAction } from './round';

/** One match option change (what an online vote is about). */
export type OptionChange =
  | { key: 'slovenian'; value: boolean }
  | { key: 'bonuses'; value: boolean }
  | { key: 'infiniteContra'; value: boolean }
  | { key: 'win'; kind: 'rounds' | 'targetScore' | 'timeLimit' | 'none'; value: number };

export function optionPatch(c: OptionChange): Partial<MatchOptions> {
  switch (c.key) {
    case 'slovenian': return { slovenian: c.value };
    case 'bonuses': return { bonuses: c.value };
    case 'infiniteContra': return { infiniteContra: c.value };
    case 'win':
      return {
        winCondition:
          c.kind === 'rounds' ? { kind: 'rounds', rounds: c.value }
          : c.kind === 'targetScore' ? { kind: 'targetScore', target: c.value }
          : c.kind === 'timeLimit' ? { kind: 'timeLimit', minutes: c.value }
          : { kind: 'none' },
      };
  }
}

/** Applies an option change between rounds (from the next round on). */
export function hostSetOptions(h: HostState, change: OptionChange): HostState {
  if (h.stage !== 'betweenRounds') throw new IllegalAction('options can only change between rounds');
  return { ...h, match: matchSetOptions(h.match, optionPatch(change)) };
}

/**
 * A player takes (back) a seat that is a dummy. Allowed while the score screen is shown, or before anybody has made a decision
 * in the licitation (card viewing included). Otherwise it throws `IllegalAction` and the caller waits for the end of the round.
 */
export function hostSeatPlayer(h: HostState, participant: number): HostState {
  if (h.match.participantKinds[participant] !== 'dummy') throw new IllegalAction('this participant is not a dummy');
  const between = h.stage === 'betweenRounds';
  const early = (h.stage === 'viewing' || h.stage === 'playing') && roundHasNoDecision(h.match.round);
  if (!between && !early) throw new IllegalAction('a dummy can only be replaced between rounds or before the first bid');
  const match = matchSetParticipantKind(h.match, participant, 'player');
  const controllers = [...h.controllers];
  controllers[participant] = 'human';
  const ready = [...h.ready];
  ready[participant] = false;
  return { ...h, match, controllers, ready };
}

/** A departed player's bot becomes a dummy for the next round. Only while the score screen is shown. */
export function hostMakeDummy(h: HostState, participant: number): HostState {
  if (h.stage !== 'betweenRounds') throw new IllegalAction('seats can only become dummies between rounds');
  const match = matchSetParticipantKind(h.match, participant, 'dummy');
  const controllers = [...h.controllers];
  controllers[participant] = 'bot';
  return { ...h, match, controllers };
}
