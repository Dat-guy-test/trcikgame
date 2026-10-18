import { describe, expect, it } from 'vitest';
import { declarerResult, standingsDelta, type SettlementInput } from '../src';

const base = (over: Partial<SettlementInput>): SettlementInput => ({
  value: 1,
  loss: 1,
  contractWon: true,
  contractContra: 1,
  bonuses: [],
  valat: { achievedBy: null, announced: false, contra: 1 },
  ...over,
});

describe('declarerResult', () => {
  it('simple win and loss', () => {
    expect(declarerResult(base({ value: 4, loss: 4 }))).toBe(4);
    expect(declarerResult(base({ value: 4, loss: 4, contractWon: false }))).toBe(-4);
  });

  it('Sechsendreier wins 2 and loses 4', () => {
    expect(declarerResult(base({ value: 2, loss: 4 }))).toBe(2);
    expect(declarerResult(base({ value: 2, loss: 4, contractWon: false }))).toBe(-4);
  });

  it('rulebook example: won Rufer with a lost (silent) Uhu = -1', () => {
    const r = declarerResult(base({ bonuses: [{ kind: 'uhu', side: 'declarer', outcome: 'lost', announced: false, contra: 1 }] }));
    expect(r).toBe(-1);
  });

  it('earned bonuses raise a win and soften a loss', () => {
    const earned = [{ kind: 'pagatUltimo', side: 'declarer', outcome: 'earned', announced: true, contra: 1 }] as const;
    expect(declarerResult(base({ value: 4, loss: 4, bonuses: earned }))).toBe(4 + 2);
    expect(declarerResult(base({ value: 4, loss: 4, contractWon: false, bonuses: earned }))).toBe(-4 + 2);
  });

  it('defender bonuses count against the declarer side', () => {
    const r = declarerResult(base({ value: 4, loss: 4, bonuses: [{ kind: 'marabu', side: 'defender', outcome: 'earned', announced: false, contra: 1 }] }));
    expect(r).toBe(4 - 4);
    const lost = declarerResult(base({ value: 4, loss: 4, bonuses: [{ kind: 'kakadu', side: 'defender', outcome: 'lost', announced: false, contra: 1 }] }));
    expect(lost).toBe(4 + 3);
  });

  it('contras multiply the contract and each declared bonus separately', () => {
    const r = declarerResult(base({
      value: 4, loss: 4, contractContra: 2,
      bonuses: [{ kind: 'uhu', side: 'declarer', outcome: 'earned', announced: true, contra: 4 }],
    }));
    expect(r).toBe(4 * 2 + 4 * 4);
  });

  describe('Valat is the last multiplier', () => {
    it('silent Valat achieved: x4', () => {
      expect(declarerResult(base({ value: 4, loss: 4, valat: { achievedBy: 'declarer', announced: false, contra: 1 } }))).toBe(16);
    });

    it('declared Valat achieved: x8, and its own contra multiplies on top', () => {
      expect(declarerResult(base({ value: 4, loss: 4, valat: { achievedBy: 'declarer', announced: true, contra: 1 } }))).toBe(32);
      expect(declarerResult(base({ value: 4, loss: 4, valat: { achievedBy: 'declarer', announced: true, contra: 2 } }))).toBe(64);
    });

    it('multiplies contras on the contract and on bonuses (all inside Q)', () => {
      const r = declarerResult(base({
        value: 4, loss: 4, contractContra: 2,
        bonuses: [{ kind: 'uhu', side: 'declarer', outcome: 'earned', announced: true, contra: 2 }],
        valat: { achievedBy: 'declarer', announced: true, contra: 1 },
      }));
      expect(r).toBe((8 + 8) * 8);
    });

    it('declared and failed: the declarer loses the contract, multiplier still applies', () => {
      const failed = base({ value: 4, loss: 4, contractWon: true, valat: { achievedBy: null, announced: true, contra: 1 } });
      expect(declarerResult(failed)).toBe(-4 * 8);
      expect(declarerResult({ ...failed, valat: { achievedBy: null, announced: true, contra: 2 } })).toBe(-4 * 16);
    });

    it('declared and failed because the defenders took all tricks', () => {
      expect(declarerResult(base({ value: 4, loss: 4, contractWon: false, valat: { achievedBy: 'defender', announced: true, contra: 1 } }))).toBe(-32);
    });

    it('silent Valat by the defenders: x4 against the declarer', () => {
      expect(declarerResult(base({ value: 4, loss: 4, contractWon: false, valat: { achievedBy: 'defender', announced: false, contra: 1 } }))).toBe(-16);
    });
  });
});

describe('standingsDelta', () => {
  const sum = (d: { delta: number }[]) => d.reduce((s, x) => s + x.delta, 0);

  it('2v2: each declarer-side seat +P, each defender -P', () => {
    const d = standingsDelta([0, 2], [1, 3], 3);
    expect(d).toEqual([{ seat: 0, delta: 3 }, { seat: 2, delta: 3 }, { seat: 1, delta: -3 }, { seat: 3, delta: -3 }]);
    expect(sum(d)).toBe(0);
  });

  it('1v3: declarer receives P from each opponent', () => {
    const d = standingsDelta([1], [0, 2, 3], 4);
    expect(d.find((x) => x.seat === 1)?.delta).toBe(12);
    expect(sum(d)).toBe(0);
    expect(sum(standingsDelta([1], [0, 2, 3], -4))).toBe(0);
  });
});
