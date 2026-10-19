import { describe, expect, it } from 'vitest';
import {
  MOND, SZKIS, PAGAT, createRng, isLegalFromView, legalActionsFromView, newRound, suitCard, tarock, viewFor,
  type CardId, type RoundView,
} from '@tarok/engine';
import { createHost, hostRunToEnd, type Controller } from '@tarok/engine';
import { describeHand, heuristicBot, randomBot, runTournament, STRATEGIES } from '../src';

/** A bidding-phase view for seat 0 (starting player) with a chosen hand. */
function viewWith(hand: CardId[], seat = 0): RoundView {
  const v = viewFor(newRound({ seatKinds: ['player', 'player', 'player', 'player'], startingPlayer: 0, seed: 1, infiniteContra: false }), 0);
  const hands = [...v.hands];
  hands[seat] = hand;
  return { ...v, hands };
}

describe('hand features', () => {
  it('counts tarocks, kings and voids', () => {
    const f = describeHand([MOND, SZKIS, PAGAT, tarock(10), suitCard('spades', 7), suitCard('spades', 6), suitCard('clubs', 0)]);
    expect(f.tarocks).toBe(4);
    expect(f.kings).toBe(1);
    expect(f.queens).toBe(1);
    expect(f.hasMond && f.hasSzkis && f.hasPagat).toBe(true);
    expect(f.voids).toBe(2);
  });
});

describe('bidding decisions', () => {
  const rng = createRng(1);
  const strong = [...[22, 21, 20, 19, 18, 17, 16, 15].map(tarock), ...[0, 1, 2, 3].map((s) => suitCard(s, 7))];
  const weak = [0, 1, 2, 3].flatMap((r) => [0, 1, 2].map((s) => suitCard(s, r)));
  const middling = [...[3, 5, 8, 11, 13].map(tarock), suitCard(0, 5), suitCard(0, 1), suitCard(1, 2), suitCard(1, 0), suitCard(2, 3), suitCard(2, 1), suitCard(3, 4)];

  it('a very strong hand bids Solodreier', () => {
    const a = heuristicBot.choose(viewWith(strong), rng);
    expect(a.type === 'bid' && a.bid.contract).toBe('solodreier');
  });

  it('a hand with no tarocks and no court cards bids Bettel', () => {
    const a = heuristicBot.choose(viewWith(weak), rng);
    expect(a.type === 'bid' && a.bid.contract).toBe('bettel');
  });

  it('a long plain suit with kings bids a Farben contract', () => {
    // 7 spades incl. the king, 2 more kings, 2 tarocks, 1 other card.
    const farben = [0, 1, 2, 3, 4, 5, 7].map((r) => suitCard(0, r)).concat([suitCard(1, 7), suitCard(2, 7), tarock(5), tarock(9), suitCard(3, 0)]);
    const a = heuristicBot.choose(viewWith(farben), rng);
    
    expect(a.type === 'bid' && a.bid.contract.startsWith('farben')).toBe(true);
  });

  it('a middling hand passes', () => {
    expect(heuristicBot.choose(viewWith(middling), rng)).toEqual({ type: 'pass' });
  });

  it('every proposal is legal for the view', () => {
    for (const h of [strong, weak, middling]) {
      const v = viewWith(h);
      expect(isLegalFromView(v, heuristicBot.choose(v, rng))).toBe(true);
      expect(legalActionsFromView(v).length).toBeGreaterThan(0);
    }
  });
});

describe('bot-vs-bot play', () => {
  it('heuristic bots finish 4-player rounds without proposing an illegal action', () => {
    const r = runTournament({ strategies: [heuristicBot, heuristicBot, heuristicBot, heuristicBot], deals: 150, seed: 5, duplicate: false });
    expect(r.rounds).toBe(150);
    expect(r.stats.every((s) => s.fallbacks === 0)).toBe(true);
    expect(r.stats.reduce((a, s) => a + s.points, 0)).toBe(0);
  });

  it('mixed lineups work with 3 players + a dummy', () => {
    const r = runTournament({
      strategies: [heuristicBot, randomBot, heuristicBot], deals: 100, seed: 6, seatKinds: ['player', 'dummy', 'player', 'player'],
    });
    expect(r.rounds).toBe(300);
    expect(r.stats.every((s) => s.fallbacks === 0)).toBe(true);
  });

  it('heuristic vs random works with 2 players + 2 dummies', () => {
    const r = runTournament({
      strategies: [heuristicBot, randomBot], deals: 200, seed: 8, seatKinds: ['player', 'dummy', 'player', 'dummy'],
    });
    expect(r.rounds).toBe(400);
    expect(r.stats.every((s) => s.fallbacks === 0)).toBe(true);
    expect(r.stats.reduce((a, s) => a + s.points, 0)).toBeLessThanOrEqual(0 + 400 * 20); // dummies may hold points
  });

  it('the random baseline never proposes an illegal action either', () => {
    const r = runTournament({ strategies: [randomBot, randomBot, randomBot, randomBot], deals: 100, seed: 7 });
    expect(r.stats.every((s) => s.fallbacks === 0)).toBe(true);
  });

  it('heuristic bots play whole matches through the host runner (2 to 6 players)', () => {
    for (const [players, dummies] of [[2, 2], [3, 1], [4, 0], [6, 0]] as const) {
      const n = players > 4 ? players : 4;
      const h = hostRunToEnd(
        createHost({
          regularPlayers: players, dummies, winCondition: { kind: 'rounds', rounds: 6 }, failSafeMinutes: null, infiniteContra: false,
          timers: { viewSeconds: 180, licitationDecisionSeconds: 20, bankSeconds: 'auto' },
        }, 3, Array.from({ length: n }, () => 'bot' as Controller)),
        () => heuristicBot.choose, createRng(3),
      );
      expect(h.stage).toBe('finished');
      expect(h.match.standings.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it('exposes the strategy registry', () => {
    expect(Object.keys(STRATEGIES).sort()).toEqual(['heuristic', 'random']);
  });
});
