import { describe, expect, it } from 'vitest';
import {
  CONTRACTS, bidValue, defaultBid, leftBehind, outbids, outbidsOwnBid, validateBid,
  defaultBankSeconds, resolveBankSeconds, DEFAULT_TIMERS, type Bid, type BonusKind, type MatchConfig,
} from '../src';

const bid = (contract: Bid['contract'], take?: number, bonuses: BonusKind[] = []): Bid => ({
  contract,
  take: take ?? CONTRACTS[contract].take,
  bonuses,
});

describe('contract table', () => {
  it('has the values from the rules (Farbensolo is 6)', () => {
    const v = Object.fromEntries(Object.values(CONTRACTS).map((c) => [c.id, c.value]));
    expect(v).toMatchObject({
      rufer: 1, solo: 2, besser_rufer: 1, dreier: 4, solodreier: 8, sechsendreier: 2,
      farbendreier: 3, farbensolo: 6, bettel: 3, piccolo: 2, zwiccolo: 2, bettel_ouvert: 6, piccolo_ouvert: 5,
    });
    expect(CONTRACTS.sechsendreier.loss).toBe(4);
  });

  it('forbids contra in rufer, solo and besser_rufer only (among biddable contracts)', () => {
    const noContra = Object.values(CONTRACTS).filter((c) => c.biddable && !c.contra).map((c) => c.id);
    expect(noContra.sort()).toEqual(['besser_rufer', 'rufer', 'solo']);
  });
});

describe('outbids', () => {
  it('first bid always stands (if valid)', () => {
    expect(outbids(null, bid('dreier'), false)).toBe(true);
  });

  it('needs a strictly higher value for non-starting players', () => {
    expect(outbids(bid('dreier'), bid('dreier'), false)).toBe(false);
    expect(outbids(bid('solo'), bid('piccolo'), false)).toBe(false);
    expect(outbids(bid('solo'), bid('dreier'), false)).toBe(true);
  });

  it('the starting player may hold at equal value, same or different contract', () => {
    expect(outbids(bid('dreier'), bid('dreier'), true)).toBe(true);
    expect(outbids(bid('solo'), bid('piccolo'), true)).toBe(true);
    expect(outbids(bid('dreier'), bid('solo'), true)).toBe(false);
  });

  it('Rufer is only for the starting player', () => {
    expect(validateBid(bid('rufer'), false)).toBe('starting_player_only');
    expect(outbids(null, bid('rufer'), true)).toBe(true);
  });

  it('Trischaken cannot be bid', () => {
    expect(validateBid(bid('trischaken', 0), true)).toBe('not_biddable');
  });

  it('Besser Rufer needs a bonus declaration and is worth 1 + declared bonuses', () => {
    expect(validateBid(bid('besser_rufer', 3, []), false)).toBe('bonus_declaration_required');
    expect(bidValue(bid('besser_rufer', 3, ['trull']))).toBe(3);
    expect(outbids(bid('dreier'), bid('besser_rufer', 3, ['uhu']), false)).toBe(true); // 1 + 4 = 5 > 4
    expect(outbids(bid('dreier'), bid('besser_rufer', 3, ['trull']), false)).toBe(false); // 1 + 2 = 3 < 4
  });

  describe('Slovenian method', () => {
    it('a lower take outbids the same contract at the same value, for anyone', () => {
      expect(outbids(bid('dreier', 3), bid('dreier', 2), false)).toBe(true);
      expect(outbids(bid('dreier', 2), bid('dreier', 1), false)).toBe(true);
      expect(outbids(bid('dreier', 1), bid('dreier', 1), false)).toBe(false);
    });

    it('a higher take never outbids, not even for the starting player', () => {
      expect(outbids(bid('dreier', 2), bid('dreier', 3), true)).toBe(false);
    });

    it('works on every positive contract that takes from the Talon', () => {
      for (const id of ['besser_rufer', 'dreier', 'sechsendreier', 'farbendreier'] as const) {
        const bonuses: BonusKind[] = id === 'besser_rufer' ? ['trull'] : [];
        const hi = bid(id, CONTRACTS[id].take, bonuses);
        const lo = bid(id, CONTRACTS[id].take - 1, bonuses);
        expect(outbids(hi, lo, false)).toBe(true);
      }
      expect(outbids(bid('rufer', 3), bid('rufer', 2), true)).toBe(true);
    });

    it('Sechsendreier take ranges 6..1; Solo variants have no modifier', () => {
      expect(validateBid(bid('sechsendreier', 1), false)).toBeNull();
      expect(validateBid(bid('sechsendreier', 7), false)).toBe('invalid_take');
      expect(validateBid(bid('dreier', 4), false)).toBe('invalid_take');
      expect(validateBid(bid('solodreier', 1), false)).toBe('invalid_take');
    });

    it('Besser Rufer with the modifier must still declare bonuses and match the value', () => {
      const cur = bid('besser_rufer', 3, ['trull']);
      expect(outbids(cur, bid('besser_rufer', 2, []), false)).toBe(false);
      expect(outbids(cur, bid('besser_rufer', 2, ['trull']), false)).toBe(true);
      expect(outbids(cur, bid('besser_rufer', 2, ['vierKonige']), false)).toBe(true); // same total value
      expect(outbids(cur, bid('besser_rufer', 3, ['vierKonige']), false)).toBe(false); // same take, same value
    });
  });

  it('the confirming last bidder may only raise to a strictly higher value', () => {
    expect(outbidsOwnBid(bid('dreier'), bid('dreier', 2), true)).toBe(false);
    expect(outbidsOwnBid(bid('dreier'), bid('solo'), true)).toBe(false);
    expect(outbidsOwnBid(bid('dreier'), bid('solodreier'), true)).toBe(true);
  });
});

describe('leftBehind (Talon cards not taken)', () => {
  it('3-card contracts leave the rest of the chosen pile, plus the other pile', () => {
    expect(leftBehind('dreier', 3)).toEqual({ fromA: 0, fromB: 3 });
    expect(leftBehind('dreier', 2)).toEqual({ fromA: 1, fromB: 3 });
    expect(leftBehind('rufer', 1)).toEqual({ fromA: 2, fromB: 3 });
  });

  it('Sechsendreier removes cards from one pile only, until it is exhausted', () => {
    expect(leftBehind('sechsendreier', 6)).toEqual({ fromA: 0, fromB: 0 });
    expect(leftBehind('sechsendreier', 5)).toEqual({ fromA: 1, fromB: 0 });
    expect(leftBehind('sechsendreier', 4)).toEqual({ fromA: 2, fromB: 0 });
    expect(leftBehind('sechsendreier', 3)).toEqual({ fromA: 3, fromB: 0 });
    expect(leftBehind('sechsendreier', 2)).toEqual({ fromA: 3, fromB: 1 });
    expect(leftBehind('sechsendreier', 1)).toEqual({ fromA: 3, fromB: 2 });
  });
});

describe('timer defaults', () => {
  it('time per round is 30 / 20 / 15 minutes for 2 / 3 / 4+ regular players', () => {
    expect([2, 3, 4, 5, 8].map(defaultBankSeconds)).toEqual([1800, 1200, 900, 900, 900]);
  });

  it('resolves "auto" from the number of regular players, dummies not counted', () => {
    const cfg: MatchConfig = {
      regularPlayers: 3, dummies: 1, winCondition: { kind: 'rounds', rounds: 5 },
      failSafeMinutes: null, infiniteContra: false, timers: DEFAULT_TIMERS,
    };
    expect(resolveBankSeconds(cfg)).toBe(1200);
    expect(DEFAULT_TIMERS.bankSeconds).toBe('auto');
  });
});
