/** Mass simulation with random legal-move bots, plus the invariants every state must satisfy. */
import { DECK_SIZE } from './cards';
import { apply, legalActions } from './round';
import { newRound } from './round';
import { createRng } from './rng';
import { randomAction } from './bot';
import { COUNTED_TOTAL } from './scoring';
import { nextStartingPlayer, type RoundState, type SeatKind } from './state';
import { viewFor } from './view';

export function allCards(s: RoundState): number[] {
  return [
    ...s.hands.flat(),
    ...s.talon.flat(),
    ...s.trick.map((p) => p.card),
    ...s.tricks.flatMap((t) => t.plays.map((p) => p.card)),
    ...s.declarerExtra,
    ...s.defenderExtra,
  ];
}

export function checkInvariants(s: RoundState): void {
  const cards = allCards(s);
  if (cards.length !== DECK_SIZE || new Set(cards).size !== DECK_SIZE) {
    throw new Error(`card conservation broken: ${cards.length} cards, ${new Set(cards).size} unique`);
  }

  for (let seat = 0; seat < 4; seat++) {
    if (s.config.seatKinds[seat] === 'dummy') continue;
    const v = viewFor(s, seat);
    if (JSON.stringify(v.hands[seat]) !== JSON.stringify(s.hands[seat])) throw new Error('own hand missing from view');
    for (let other = 0; other < 4; other++) {
      const shouldSee =
        other === seat || ((s.phase === 'play' || s.phase === 'done') && s.config.seatKinds[other] === 'dummy') || s.ouvertRevealed;
      if (!shouldSee && v.hands[other] !== null) throw new Error(`view of seat ${seat} leaks hand ${other}`);
    }
    if (seat !== s.declarer && v.discards !== null) throw new Error('view leaks discards');
    if (!s.talonRevealed && v.talon.piles !== null) throw new Error('view leaks the Talon');
  }

  if (s.phase === 'done') {
    const r = s.result;
    if (!r) throw new Error('finished round without a result');
    if (r.deltas.reduce((a, b) => a + b, 0) !== 0) throw new Error(`standings do not sum to zero: ${r.deltas}`);
    if (r.counted && r.counted.declarer + r.counted.defender !== COUNTED_TOTAL) {
      throw new Error(`counted points sum to ${r.counted.declarer + r.counted.defender}, not ${COUNTED_TOTAL}`);
    }
    if (r.kind === 'played' && r.contract !== 'trischaken' && r.counted && s.hands.some((h) => h.length > 0)) {
      throw new Error('played-out round still has cards in hand');
    }
  }
}

export interface SimReport {
  games: number;
  actions: number;
  maxActions: number;
  contracts: Record<string, number>;
  kinds: Record<string, number>;
  wins: number;
  losses: number;
  bonusesSeen: Record<string, number>;
  valatAchieved: number;
  contraRaised: number;
}

export interface SimOptions {
  games: number;
  seed: number;
  seatKinds?: SeatKind[];
  infiniteContra?: boolean;
  /** Also apply every legal action (on a copy) every N steps to prove each one is accepted. */
  exhaustiveEvery?: number;
}

export function runSimulation(opts: SimOptions): SimReport {
  const seatKinds = opts.seatKinds ?? ['player', 'player', 'player', 'player'];
  const rng = createRng(opts.seed);
  const report: SimReport = {
    games: 0, actions: 0, maxActions: 0, contracts: {}, kinds: {}, wins: 0, losses: 0,
    bonusesSeen: {}, valatAchieved: 0, contraRaised: 0,
  };
  let startingPlayer = seatKinds.indexOf('player');

  for (let g = 0; g < opts.games; g++) {
    let s = newRound({ seatKinds, startingPlayer, seed: (opts.seed * 7919 + g) >>> 0, infiniteContra: opts.infiniteContra ?? false });
    checkInvariants(s);
    let steps = 0;
    while (s.phase !== 'done') {
      if (steps++ > 600) throw new Error(`game ${g} did not terminate`);
      const acts = legalActions(s);
      if (acts.length === 0) throw new Error(`no legal actions in phase ${s.phase}`);
      if (opts.exhaustiveEvery && steps % opts.exhaustiveEvery === 0) {
        for (const a of acts) apply(s, a.actor, a.action);
      }
      const { actor, action } = randomAction(s, rng);
      s = apply(s, actor, action);
      checkInvariants(s);
    }
    const r = s.result!;
    report.games++;
    report.actions += steps;
    report.maxActions = Math.max(report.maxActions, steps);
    report.contracts[r.contract] = (report.contracts[r.contract] ?? 0) + 1;
    report.kinds[r.kind] = (report.kinds[r.kind] ?? 0) + 1;
    if (r.contractWon === true) report.wins++;
    else if (r.contractWon === false) report.losses++;
    for (const b of r.bonuses) {
      const key = `${b.kind}:${b.side}:${b.outcome}${b.announced ? ':announced' : ''}`;
      report.bonusesSeen[key] = (report.bonusesSeen[key] ?? 0) + 1;
    }
    if (r.valat?.achievedBy) report.valatAchieved++;
    if (s.contra && Object.values(s.contra.levels).some((l) => l > 0)) report.contraRaised++;
    startingPlayer = nextStartingPlayer(seatKinds, startingPlayer);
  }
  return report;
}
