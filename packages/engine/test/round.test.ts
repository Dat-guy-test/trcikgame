import { describe, expect, it } from 'vitest';
import {
  IllegalAction, SUITS, apply, bankExpiryOutcome, charge, clockKind, controllerOf, createRng,
  defaultBid, expectedActor, initialBanks, isValidTake, legalActions, newRound, nextStartingPlayer,
  points, randomAction, suitCard, timeoutAction, trischakenDeltas, viewFor, GRACE_SECONDS,
  type Action, type Bid, type RoundState, type SeatKind,
} from '../src';

const P4: SeatKind[] = ['player', 'player', 'player', 'player'];
const start = (seed = 1, seatKinds: SeatKind[] = P4, over: { infiniteContra?: boolean; startingPlayer?: number } = {}) =>
  newRound({ seatKinds, startingPlayer: over.startingPlayer ?? 0, seed, infiniteContra: over.infiniteContra ?? false });

const step = (s: RoundState, actor: number, action: Action) => apply(s, actor, action);
const run = (s: RoundState, steps: [number, Action][]) => steps.reduce((st, [a, act]) => step(st, a, act), s);
const bid = (contract: Bid['contract'], take?: number): Action => ({
  type: 'bid', bid: { ...defaultBid(contract), ...(take === undefined ? {} : { take }) },
});
const pass: Action = { type: 'pass' };
const noContra: Action = { type: 'noContra' };
const noDeclare: Action = { type: 'declare', bonuses: [], valat: false };

/** Seat 0 (starting player) bids `contract`, all others pass, seat 0 confirms. */
const bidAndConfirm = (s: RoundState, contract: Bid['contract'], take?: number) =>
  run(s, [[0, bid(contract, take)], [1, pass], [2, pass], [3, pass], [0, { type: 'confirm' }]]);

describe('bidding', () => {
  it('all pass -> Trischaken, played by everyone, starting player leads', () => {
    const s = run(start(), [[0, pass], [1, pass], [2, pass], [3, pass]]);
    expect(s.contract).toBe('trischaken');
    expect(s.phase).toBe('play');
    expect(s.leader).toBe(0);
    expect(s.declarer).toBeNull();
  });

  it('only the starting player may bid Rufer', () => {
    const s = run(start(), [[0, pass]]);
    expect(() => step(s, 1, bid('rufer'))).toThrow(IllegalAction);
  });

  it('acting out of turn is rejected', () => {
    expect(() => step(start(), 2, pass)).toThrow(IllegalAction);
  });

  it('starting player may hold at equal value, then the last bidder confirms', () => {
    let s = run(start(), [[0, bid('rufer')], [1, bid('dreier')], [2, pass], [3, pass]]);
    expect(s.toAct).toEqual([0]); // the starting player is still in and answers last
    s = step(s, 0, bid('dreier')); // hold
    expect(s.bidder).toBe(0);
    s = run(s, [[1, pass], [2, pass], [3, pass]]);
    expect(s.awaitingConfirm).toBe(true);
    expect(expectedActor(s)).toBe(0);
    s = step(s, 0, { type: 'confirm' });
    expect(s.declarer).toBe(0);
    expect(s.contract).toBe('dreier');
  });

  it('a pass is not final: the starting player can come back after passing', () => {
    let s = run(start(), [[0, pass], [1, bid('solo')], [2, pass], [3, pass]]);
    expect(expectedActor(s)).toBe(0);
    s = step(s, 0, bid('piccolo')); // hold at equal value (2)
    expect(s.bidder).toBe(0);
  });

  it('non-starting players need a strictly higher value', () => {
    const s = run(start(), [[0, pass], [1, bid('solo')]]);
    expect(() => step(s, 2, bid('piccolo'))).toThrow(IllegalAction);
    expect(() => step(s, 2, bid('solo'))).toThrow(IllegalAction);
    expect(step(s, 2, bid('dreier')).bidder).toBe(2);
  });

  it('the confirming last bidder can only raise to a strictly higher value', () => {
    const s = run(start(), [[0, bid('dreier')], [1, pass], [2, pass], [3, pass]]);
    expect(s.awaitingConfirm).toBe(true);
    expect(() => step(s, 0, bid('dreier', 2))).toThrow(IllegalAction); // no Slovenian method
    expect(() => step(s, 0, bid('solo'))).toThrow(IllegalAction);
    expect(step(s, 0, bid('solodreier')).bidder).toBe(0);
  });

  it('Slovenian method: a lower take outbids the same contract', () => {
    const s = run(start(), [[0, pass], [1, bid('dreier', 3)]]);
    expect(step(s, 2, bid('dreier', 2)).currentBid?.take).toBe(2);
  });

  it('timeout defaults: pass, confirm, declare nothing, no contra', () => {
    let s = start();
    expect(timeoutAction(s)?.action).toEqual(pass);
    s = run(s, [[0, bid('dreier')], [1, pass], [2, pass], [3, pass]]);
    expect(timeoutAction(s)?.action).toEqual({ type: 'confirm' });
    s = step(s, 0, { type: 'confirm' });
    expect(s.phase).toBe('declare');
    expect(timeoutAction(s)?.action).toEqual(noDeclare);
    s = step(s, 0, noDeclare);
    expect(s.phase).toBe('contra');
    expect(timeoutAction(s)?.action).toEqual(noContra);
  });
});

describe('declarations and contra', () => {
  it('Rufer has no contra window: declare -> king call', () => {
    const s = run(bidAndConfirm(start(), 'rufer'), [[0, noDeclare]]);
    expect(s.phase).toBe('kingCall');
  });

  it('Solo and Besser Rufer also have no contra', () => {
    expect(run(bidAndConfirm(start(), 'solo'), [[0, noDeclare]]).phase).toBe('kingCall');
    const s = run(start(), [[0, { type: 'bid', bid: { contract: 'besser_rufer', take: 3, bonuses: ['trull'] } }], [1, pass], [2, pass], [3, pass], [0, { type: 'confirm' }]]);
    expect(s.declaredBonuses).toEqual(['trull']);
    expect(run(s, [[0, noDeclare]]).phase).toBe('kingCall');
  });

  it('contra chain: x2 opponents, x4 declarer, x8 opponents, x16 declarer, then it ends', () => {
    let s = run(bidAndConfirm(start(), 'dreier'), [[0, noDeclare]]);
    expect(s.phase).toBe('contra');
    expect(expectedActor(s)).toBe(1);
    expect(() => step(s, 1, { type: 'contra', target: 'konigUltimo' })).toThrow(IllegalAction);
    s = step(s, 1, { type: 'contra', target: 'contract' });
    expect(expectedActor(s)).toBe(0); // only the declarer can rekontra
    s = step(s, 0, { type: 'contra', target: 'contract' });
    s = run(s, [[1, noContra], [2, noContra]]); // opponents answer in seat order
    s = step(s, 3, { type: 'contra', target: 'contract' }); // any opponent may subcontra
    s = step(s, 0, { type: 'contra', target: 'contract' });
    expect(s.contra?.levels.contract).toBe(4);
    expect(s.phase).toBe('take'); // chain ended
  });

  it('infiniteContra continues past x16', () => {
    let s = run(bidAndConfirm(start(1, P4, { infiniteContra: true }), 'dreier'), [[0, noDeclare]]);
    for (const actor of [1, 0, 1, 0]) s = step(s, actor, { type: 'contra', target: 'contract' });
    expect(s.phase).toBe('contra');
    expect(expectedActor(s)).toBe(1);
  });

  it('declared bonuses can be contra\'d separately; silent ones cannot', () => {
    let s = run(bidAndConfirm(start(), 'dreier'), [[0, { type: 'declare', bonuses: ['uhu'], valat: false }]]);
    s = step(s, 1, { type: 'contra', target: 'uhu' });
    expect(s.contra?.levels).toEqual({ contract: 0, uhu: 1 });
    expect(() => step(s, 0, { type: 'contra', target: 'pagatUltimo' })).toThrow(IllegalAction);
  });

  it('König Ultimo cannot be declared in Dreier; Farben allows Valat only', () => {
    const s = bidAndConfirm(start(), 'dreier');
    expect(() => step(s, 0, { type: 'declare', bonuses: ['konigUltimo'], valat: false })).toThrow(IllegalAction);
    const f = bidAndConfirm(start(), 'farbendreier');
    expect(() => step(f, 0, { type: 'declare', bonuses: ['uhu'], valat: false })).toThrow(IllegalAction);
    expect(step(f, 0, { type: 'declare', bonuses: [], valat: true }).declaredValat).toBe(true);
  });

  it('negative contracts skip declarations, allow contra, and start play with the declarer', () => {
    let s = bidAndConfirm(start(), 'bettel');
    expect(s.phase).toBe('contra');
    s = run(s, [[1, noContra], [2, noContra], [3, noContra]]);
    expect(s.phase).toBe('play');
    expect(s.leader).toBe(0);
    expect(s.talonRevealed).toBe(false);
  });
});

describe('talon, king call, discards', () => {
  const toTake = (contract: Bid['contract'], take?: number, seed = 1) => {
    let s = bidAndConfirm(start(seed), contract, take);
    s = step(s, 0, noDeclare);
    if (s.phase === 'contra') s = run(s, [[1, noContra], [2, noContra], [3, noContra]]);
    return s;
  };

  it('Dreier: take a whole pile, then discard 3 cards worth less than 5 points', () => {
    let s = toTake('dreier');
    expect(s.phase).toBe('take');
    expect(s.talonRevealed).toBe(true);
    const [p0, p1] = s.talon as [number[], number[]];
    expect(isValidTake(s, [p0[0]!, p1[0]!, p0[1]!])).toBe(false);
    s = step(s, 0, { type: 'take', cards: p0 });
    expect(s.phase).toBe('discard');
    expect(s.hands[0]).toHaveLength(15);
    expect(s.defenderExtra.sort()).toEqual([...p1].sort());
    const five = s.hands[0]!.find((c) => points(c) >= 5);
    if (five !== undefined) {
      expect(() => step(s, 0, { type: 'discard', cards: [five, ...s.hands[0]!.filter((c) => c !== five && points(c) < 5).slice(0, 2)] })).toThrow(IllegalAction);
    }
    const ok = legalActions(s)[0]!;
    s = apply(s, ok.actor, ok.action);
    expect(s.phase).toBe('play');
    expect(s.hands[0]).toHaveLength(12);
    expect(s.declarerExtra).toHaveLength(3);
  });

  it('Slovenian method on a 3-card contract: take n cards of one pile only', () => {
    const s = toTake('dreier', 2);
    const [p0, p1] = s.talon as [number[], number[]];
    expect(isValidTake(s, [p0[0]!, p0[1]!])).toBe(true);
    expect(isValidTake(s, [p1[0]!, p1[2]!])).toBe(true);
    expect(isValidTake(s, [p0[0]!, p1[0]!])).toBe(false);
    const after = step(s, 0, { type: 'take', cards: [p0[0]!, p0[1]!] });
    expect(after.hands[0]).toHaveLength(14);
    expect(after.defenderExtra).toHaveLength(4);
  });

  it('Sechsendreier: cards left behind are removed from one pile first', () => {
    const [p0, p1] = (toTake('sechsendreier', 6).talon as [number[], number[]]);
    for (const [take, taken] of [
      [5, [...p0.slice(0, 2), ...p1]],   // 1 left from one pile
      [4, [...p0.slice(0, 1), ...p1]],   // 2 left from one pile
      [3, [...p1]],                      // a whole pile left
      [2, [...p1.slice(0, 2)]],          // pile A whole + 1 of B
      [1, [p1[0]!]],                     // pile A whole + 2 of B
    ] as [number, number[]][]) {
      const s = toTake('sechsendreier', take);
      expect(isValidTake(s, taken), `take ${take}`).toBe(true);
    }
    const s5 = toTake('sechsendreier', 5);
    expect(isValidTake(s5, [...p0.slice(0, 2), ...p1.slice(0, 2), p0[2]!].slice(0, 5))).toBe(true); // still 1 left from pile 1
    expect(isValidTake(s5, [p0[0]!, p0[1]!, p1[0]!, p1[1]!, p0[2]!].filter((_, i) => i !== 4))).toBe(false);
  });

  it('Solo-type contracts: the whole Talon goes to the defenders, no take or discard', () => {
    const s = toTake('solodreier');
    expect(s.phase).toBe('play');
    expect(s.defenderExtra).toHaveLength(6);
  });

  it('Farben: 1-point tarocks must be discarded first', () => {
    let s = toTake('farbendreier');
    s = step(s, 0, { type: 'take', cards: s.talon[0]! });
    const hand = s.hands[0]!;
    const taroks = hand.filter((c) => c >= 32 && points(c) < 5);
    const plain = hand.filter((c) => c < 32 && points(c) < 5);
    if (taroks.length > 0 && plain.length >= 3) {
      expect(() => step(s, 0, { type: 'discard', cards: plain.slice(0, 3) })).toThrow(IllegalAction);
    }
    const ok = legalActions(s)[0]!;
    expect(apply(s, ok.actor, ok.action).phase).toBe('play');
  });

  /** Finds a seed where the called king lies in the Talon (declarer 0, Rufer). */
  const kingInTalonRound = () => {
    for (let seed = 1; seed < 500; seed++) {
      const s0 = run(bidAndConfirm(start(seed), 'rufer'), [[0, noDeclare]]);
      for (const suit of SUITS) {
        if (s0.talon.flat().includes(suitCard(suit, 7))) return step(s0, 0, { type: 'callKing', suit });
      }
    }
    throw new Error('no seed found');
  };

  it('called king in the Talon: give up costs 3 (each other player gets 1)', () => {
    const s = step(kingInTalonRound(), 0, { type: 'kingInTalon', choice: 'giveUp' });
    expect(s.phase).toBe('done');
    expect(s.result?.kind).toBe('gaveUp');
    expect(s.result?.deltas).toEqual([-3, 1, 1, 1]);
  });

  it('called king in the Talon: play alone keeps the contract, switch makes it Dreier', () => {
    const k = kingInTalonRound();
    expect(k.phase).toBe('kingInTalon');
    expect(k.talonRevealed).toBe(true);
    const alone = step(k, 0, { type: 'kingInTalon', choice: 'playAlone' });
    expect(alone.alone).toBe(true);
    expect(alone.contract).toBe('rufer');
    expect(alone.phase).toBe('take');
    const dreier = step(k, 0, { type: 'kingInTalon', choice: 'switchToDreier' });
    expect(dreier.contract).toBe('dreier');
    expect(dreier.phase).toBe('take');
  });

  it('calling a king the declarer holds means playing alone', () => {
    const s0 = run(bidAndConfirm(start(7), 'rufer'), [[0, noDeclare]]);
    const own = SUITS.find((su) => s0.hands[0]!.includes(suitCard(su, 7)));
    if (own) expect(step(s0, 0, { type: 'callKing', suit: own }).alone).toBe(true);
  });
});

describe('forfeit (declarer bank ran out)', () => {
  const dreierOnBank = () => {
    let s = bidAndConfirm(start(), 'dreier');
    s = step(s, 0, noDeclare);
    return run(s, [[1, noContra], [2, noContra], [3, noContra]]);
  };

  it('1v3: the declarer loses the contract and pays every opponent', () => {
    const s = step(dreierOnBank(), 0, { type: 'forfeit' });
    expect(s.phase).toBe('done');
    expect(s.result?.kind).toBe('forfeit');
    expect(s.result?.deltas).toEqual([-12, 4, 4, 4]);
  });

  it('is rejected for other seats, in licitation and in 2v2 games', () => {
    expect(() => step(dreierOnBank(), 1, { type: 'forfeit' })).toThrow(IllegalAction);
    expect(() => step(bidAndConfirm(start(), 'dreier'), 0, { type: 'forfeit' })).toThrow(IllegalAction);
    const rufer = run(bidAndConfirm(start(), 'rufer'), [[0, noDeclare]]);
    expect(rufer.phase).toBe('kingCall');
    expect(() => step(rufer, 0, { type: 'forfeit' })).toThrow(IllegalAction);
  });

  it('a declared Valat still applies its multiplier when the declarer forfeits', () => {
    let s = bidAndConfirm(start(), 'dreier');
    s = step(s, 0, { type: 'declare', bonuses: [], valat: true });
    s = run(s, [[1, noContra], [2, noContra], [3, noContra]]);
    expect(step(s, 0, { type: 'forfeit' }).result?.deltas).toEqual([-96, 32, 32, 32]);
  });

  it('clock helpers: licitation vs bank time, and what happens when a bank runs out', () => {
    const s = dreierOnBank();
    expect(clockKind(start())).toBe('licitation');
    expect(clockKind(s)).toBe('bank');
    expect(bankExpiryOutcome(s, 0)).toBe('forfeit');
    expect(bankExpiryOutcome(run(bidAndConfirm(start(), 'rufer'), [[0, noDeclare]]), 0)).toBe('graceThenRandomMove');
    expect(GRACE_SECONDS).toBe(10);
    const banks = charge(initialBanks(P4, 600), 2, 100_000);
    expect(banks.ms[2]).toBe(500_000);
    expect(charge(banks, 2, 10_000_000).ms[2]).toBe(0);
  });
});

describe('dummies', () => {
  const D3: SeatKind[] = ['player', 'dummy', 'player', 'player'];

  it('dummies never bid: bidding skips their seat', () => {
    const s = start(1, D3);
    expect(s.toAct).toEqual([0, 2, 3]);
    const t = run(s, [[0, pass], [2, pass], [3, pass]]);
    expect(t.contract).toBe('trischaken');
  });

  it('starting-player rotation skips dummy seats', () => {
    expect(nextStartingPlayer(D3, 0)).toBe(2);
    expect(nextStartingPlayer(D3, 3)).toBe(0);
    expect(nextStartingPlayer(D3, 2)).toBe(3);
  });

  it('the dummy hand is hidden until play starts and public afterwards', () => {
    const s = start(1, D3);
    expect(viewFor(s, 0).hands[1]).toBeNull();
    const after = run(s, [[0, pass], [2, pass], [3, pass]]);
    expect(viewFor(after, 2).hands[1]).toEqual(after.hands[1]);
  });

  it('dummy cards are always played by a regular player (controller rules)', () => {
    const rng = createRng(99);
    for (let g = 0; g < 60; g++) {
      let s = start(g + 1, D3);
      while (s.phase !== 'done') {
        const actor = expectedActor(s)!;
        expect(D3[actor]).toBe('player');
        if (s.phase === 'play' && D3[(s.leader + s.trick.length) % 4] === 'dummy') {
          const who = controllerOf(s, (s.leader + s.trick.length) % 4);
          expect(who).toBe(actor);
          if (s.contract === 'rufer' || s.contract === 'solo' || s.contract === 'besser_rufer') expect(who).toBe(s.declarer);
        }
        const a = randomAction(s, rng);
        s = apply(s, a.actor, a.action);
      }
    }
  });
});

describe('2 players (alternating player / dummy seats)', () => {
  const D2: SeatKind[] = ['player', 'dummy', 'player', 'dummy'];

  it('only the two regular players bid', () => {
    const s = start(1, D2);
    expect(s.toAct).toEqual([0, 2]);
    expect(run(s, [[0, pass], [2, pass]]).contract).toBe('trischaken');
    expect(nextStartingPlayer(D2, 0)).toBe(2);
    expect(nextStartingPlayer(D2, 2)).toBe(0);
  });

  const toPlay = (seed: number, declarer: number, contract: Bid['contract']) => {
    let s = start(seed, D2, { startingPlayer: declarer });
    const other = declarer === 0 ? 2 : 0;
    s = run(s, [[declarer, bid(contract)], [other, pass], [declarer, { type: 'confirm' }]]);
    return step(s, declarer, noDeclare);
  };

  it('1v3: the non-declarer controls both dummies', () => {
    for (const declarer of [0, 2]) {
      let s = toPlay(3, declarer, 'dreier');
      s = run(s, [[declarer === 0 ? 2 : 0, noContra]]);
      s = step(s, declarer, { type: 'take', cards: s.talon[0]! });
      const ok = legalActions(s)[0]!;
      s = apply(s, ok.actor, ok.action);
      const other = declarer === 0 ? 2 : 0;
      expect(controllerOf(s, 1)).toBe(other);
      expect(controllerOf(s, 3)).toBe(other);
    }
  });

  /** Seed where, after seat 0 bids Rufer, the king of some suit lies in `where` (a seat) and not in seat 0's hand. */
  const findKing = (where: number) => {
    for (let seed = 1; seed < 400; seed++) {
      const s0 = run(start(seed, D2), [[0, bid('rufer')], [2, pass], [0, { type: 'confirm' }], [0, noDeclare]]);
      for (const suit of SUITS) if (s0.hands[where]!.includes(suitCard(suit, 7))) return { s0, suit, where };
    }
    throw new Error('no seed found');
  };

  it('2v2: a dummy holding the called king is the partner at once and is controlled by the declarer', () => {
    const { s0, suit, where } = findKing(1);
    const s = step(s0, 0, { type: 'callKing', suit });
    expect(s.partner).toBe(where);
    expect(s.alone).toBe(false);
    expect(controllerOf(s, where)).toBe(0);
    expect(controllerOf(s, where === 1 ? 3 : 1)).toBe(2);
    expect(viewFor(s, 2).partner).toBe(where);
  });

  it('calling the king of the other regular player reshuffles: nothing is scored', () => {
    const { s0, suit } = findKing(2);
    const s = step(s0, 0, { type: 'callKing', suit });
    expect(s.phase).toBe('done');
    expect(s.result?.kind).toBe('reshuffle');
    expect(s.result?.deltas).toEqual([0, 0, 0, 0]);
  });

  it('Trischaken: one player controls both dummies and control follows the trick winner', () => {
    const rng = createRng(5);
    for (let g = 0; g < 40; g++) {
      let s = run(start(g + 1, D2), [[0, pass], [2, pass]]);
      while (s.phase !== 'done') {
        const actor = expectedActor(s)!;
        expect(D2[actor]).toBe('player');
        const seat = (s.leader + s.trick.length) % 4;
        if (D2[seat] === 'dummy') expect(controllerOf(s, seat)).toBe(s.trischakenController);
        const prev = s.tricks.length;
        const a = randomAction(s, rng);
        const next = apply(s, a.actor, a.action);
        if (next.tricks.length > prev) {
          const w = next.tricks[next.tricks.length - 1]!.winner;
          expect(next.trischakenController).toBe(D2[w] === 'player' ? w : s.trischakenController);
        }
        s = next;
      }
    }
  });
});

describe('Talon and dummy visibility', () => {
  const D3: SeatKind[] = ['player', 'dummy', 'player', 'player'];
  const toTake = (seatKinds: SeatKind[], contract: Bid['contract']) => {
    const s = start(1, seatKinds);
    const order = seatKinds.map((k, i) => (k === 'player' ? i : -1)).filter((i) => i >= 0 && i !== 0);
    let t = run(s, [[0, bid(contract)], ...order.map((i): [number, Action] => [i, pass]), [0, { type: 'confirm' }]]);
    if (t.phase === 'declare') t = step(t, 0, noDeclare);
    if (t.phase === 'contra') t = run(t, order.map((i): [number, Action] => [i, noContra]));
    return t;
  };

  it('everybody sees the revealed Talon and what the declarer took', () => {
    let s = toTake(P4, 'dreier');
    expect(viewFor(s, 2).talon.piles).toHaveLength(2);
    expect(viewFor(s, 2).talonTaken).toBeNull();
    const [p0, p1] = s.talon as [number[], number[]];
    s = step(s, 0, { type: 'take', cards: p0 });
    expect(viewFor(s, 2).talonTaken).toEqual(p0);
    expect(viewFor(s, 3).talon.piles).toEqual([p0, p1]);
    expect(viewFor(s, 2).discards).toBeNull();
  });

  it('with no Talon cards taken (Solodreier) the taken list is empty, and negative contracts reveal nothing', () => {
    expect(viewFor(toTake(P4, 'solodreier'), 1).talonTaken).toEqual([]);
    const bettel = toTake(P4, 'bettel');
    expect(viewFor(bettel, 1).talon.piles).toBeNull();
    expect(viewFor(bettel, 1).talonTaken).toBeNull();
  });

  it('dummy hands stay hidden through bidding and the Talon stage, and open when play starts', () => {
    let s = toTake(D3, 'dreier');
    expect(s.phase).toBe('take');
    expect(viewFor(s, 2).hands[1]).toBeNull();
    s = step(s, 0, { type: 'take', cards: s.talon[0]! });
    expect(viewFor(s, 2).hands[1]).toBeNull();
    const ok = legalActions(s)[0]!;
    s = apply(s, ok.actor, ok.action);
    expect(s.phase).toBe('play');
    expect(viewFor(s, 2).hands[1]).toEqual(s.hands[1]);
    expect(viewFor(toTake(D3, 'solodreier'), 3).hands[1]).toEqual(toTake(D3, 'solodreier').hands[1]); // no Talon stage: open at once
  });
});

describe('view projection', () => {
  it('hides other hands and the unrevealed Talon', () => {
    const s = start(5);
    const v = viewFor(s, 2);
    expect(v.hands[2]).toEqual(s.hands[2]);
    expect(v.hands[0]).toBeNull();
    expect(v.hands[3]).toBeNull();
    expect(v.talon).toEqual({ revealed: false, piles: null });
    expect(v.handSizes).toEqual([12, 12, 12, 12]);
  });

  it('shows the Talon once revealed, and discards only to the declarer', () => {
    let s = bidAndConfirm(start(), 'dreier');
    s = run(s, [[0, noDeclare], [1, noContra], [2, noContra], [3, noContra]]);
    s = step(s, 0, { type: 'take', cards: s.talon[0]! });
    const ok = legalActions(s)[0]!;
    s = apply(s, ok.actor, ok.action);
    expect(viewFor(s, 1).talon.piles).toHaveLength(2);
    expect(viewFor(s, 0).discards).toHaveLength(3);
    expect(viewFor(s, 1).discards).toBeNull();
    expect(viewFor(s, 1).discardCount).toBe(3);
  });
});

describe('Trischaken settlement', () => {
  it('a player over 35 pays 2 to each other player', () => {
    expect(trischakenDeltas([40, 10, 10, 8], [5, 3, 2, 2])).toEqual([-6, 2, 2, 2]);
  });

  it('top two strictly above the bottom two: each pays 1 to each of the bottom two', () => {
    expect(trischakenDeltas([20, 18, 10, 8], [3, 3, 3, 3])).toEqual([-2, -2, 2, 2]);
  });

  it('ties between 2nd and 3rd place move no points', () => {
    expect(trischakenDeltas([20, 20, 20, 10], [3, 3, 3, 3])).toEqual([0, 0, 0, 0]);
  });

  it('a player with no tricks receives 2 from each other player, on top of the rest', () => {
    const d = trischakenDeltas([20, 20, 10, 5], [4, 4, 4, 0]);
    expect(d).toEqual([-2 - 2, -2 - 2, 2 - 2, 2 + 6]);
    expect(d.reduce((a, b) => a + b, 0)).toBe(0);
  });
});
