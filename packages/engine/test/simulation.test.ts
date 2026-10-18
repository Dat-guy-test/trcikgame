import { describe, expect, it } from 'vitest';
import { runSimulation } from '../src';

describe('random-bot simulation (invariants hold in every state)', () => {
  it('4 players: 400 rounds', () => {
    const r = runSimulation({ games: 400, seed: 1, exhaustiveEvery: 5 });
    expect(r.games).toBe(400);
    expect(r.kinds.played).toBeGreaterThan(50);
    expect(r.kinds.trischaken).toBeGreaterThan(5);
  });

  it('3 players + 1 dummy: 300 rounds', () => {
    const r = runSimulation({ games: 300, seed: 2, seatKinds: ['player', 'dummy', 'player', 'player'], exhaustiveEvery: 5 });
    expect(r.games).toBe(300);
  });

  it('infinite contra chains also stay consistent', () => {
    const r = runSimulation({ games: 200, seed: 3, infiniteContra: true });
    expect(r.games).toBe(200);
  });

  it('covers every contract, give-ups and contras across many rounds', () => {
    const r = runSimulation({ games: 2500, seed: 4 });
    for (const c of [
      'rufer', 'solo', 'besser_rufer', 'dreier', 'solodreier', 'sechsendreier', 'farbendreier', 'farbensolo',
      'bettel', 'piccolo', 'zwiccolo', 'bettel_ouvert', 'piccolo_ouvert', 'trischaken',
    ]) {
      expect(r.contracts[c], c).toBeGreaterThan(0);
    }
    expect(r.kinds.gaveUp).toBeGreaterThan(0);
    expect(r.contraRaised).toBeGreaterThan(0);
  }, 120_000);
});
