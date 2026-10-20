import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TIMERS, createHost, createRng, deal, fullDeck, hostContinue, hostRunBots, newRound, randomViewBot, secureDeck, shuffle,
  type Controller, type MatchConfig,
} from '../src';

const cfg: MatchConfig = {
  regularPlayers: 4, dummies: 0, winCondition: { kind: 'rounds', rounds: 3 }, failSafeMinutes: null, infiniteContra: false, timers: DEFAULT_TIMERS,
};
const bots: Controller[] = ['bot', 'bot', 'bot', 'bot'];
const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

describe('unpredictable deals (online rooms)', () => {
  it('secureDeck is a permutation of all 54 cards and differs between calls', () => {
    const a = secureDeck();
    expect(sorted(a)).toEqual(fullDeck());
    expect(secureDeck()).not.toEqual(a);
  });

  it('deal() accepts an explicit deck order and rejects malformed decks', () => {
    const deck = shuffle(fullDeck(), createRng(3));
    const d = deal(999, deck);
    expect(d.hands[0]).toEqual(sorted(deck.slice(0, 12)));
    expect(d.hands[3]).toEqual(sorted(deck.slice(36, 48)));
    expect(d.talon[1]).toEqual(deck.slice(51, 54));
    expect(() => deal(1, deck.slice(0, 53))).toThrow();
    expect(() => deal(1, [...deck.slice(0, 53), deck[0]!])).toThrow();
  });

  it('newRound, createHost and hostContinue use the supplied decks', () => {
    const deck1 = secureDeck();
    const deck2 = secureDeck();
    const r = newRound({ seatKinds: ['player', 'player', 'player', 'player'], startingPlayer: 0, seed: 1, infiniteContra: false, deck: deck1 });
    expect(r.hands[1]).toEqual(sorted(deck1.slice(12, 24)));

    let h = createHost(cfg, 1, bots, undefined, deck1);
    expect(h.match.round.hands[0]).toEqual(sorted(deck1.slice(0, 12)));
    h = hostRunBots(h, () => randomViewBot, createRng(2));
    expect(h.stage).toBe('betweenRounds');
    h = hostContinue(h, deck2);
    expect(h.match.round.hands[0]).toEqual(sorted(deck2.slice(0, 12)));
  });
});
