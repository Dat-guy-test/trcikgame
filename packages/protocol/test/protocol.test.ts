import { describe, expect, it } from 'vitest';
import { generateRoomCode, isRoomCode, parseAction, parseClientMessage, validateSettings } from '../src';

const msg = (x: unknown) => parseClientMessage(JSON.stringify(x));

describe('client messages', () => {
  it('accepts well-formed intents and drops unknown fields', () => {
    expect(msg({ t: 'act', action: { type: 'play', card: 40, evil: true } })).toEqual({ t: 'act', action: { type: 'play', card: 40 } });
    expect(msg({ t: 'act', action: { type: 'bid', bid: { contract: 'dreier', take: 3, bonuses: [] } } })).toEqual({
      t: 'act', action: { type: 'bid', bid: { contract: 'dreier', take: 3, bonuses: [] } },
    });
    expect(msg({ t: 'join', v: 1, name: 'Ann', token: 'abc' })).toEqual({ t: 'join', v: 1, name: 'Ann', token: 'abc' });
    expect(msg({ t: 'slot', index: 2, kind: 'bot' })).toEqual({ t: 'slot', index: 2, kind: 'bot' });
    for (const t of ['ready', 'next', 'start', 'ping']) expect(msg({ t })).toEqual({ t });
  });

  it('rejects malformed input', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('x'.repeat(5000))).toBeNull();
    expect(msg({ t: 'nope' })).toBeNull();
    expect(msg({ t: 'act', action: { type: 'play', card: 54 } })).toBeNull();
    expect(msg({ t: 'act', action: { type: 'play', card: 1.5 } })).toBeNull();
    expect(msg({ t: 'act', action: { type: 'take', cards: [1, 2, 3, 4, 5, 6, 7] } })).toBeNull();
    expect(msg({ t: 'act', action: { type: 'callKing', suit: 'stars' } })).toBeNull();
    expect(msg({ t: 'slot', index: 1, kind: 'human' })).toBeNull();
    expect(msg({ t: 'join', name: 5 })).toBeNull();
  });

  it('never accepts a forfeit from a client', () => {
    expect(parseAction({ type: 'forfeit' })).toBeNull();
  });
});

describe('settings and codes', () => {
  const ok = { players: 4, winKind: 'rounds', winValue: 8, failSafeMinutes: null, infiniteContra: false, timers: true };

  it('validates room settings', () => {
    expect(validateSettings(ok)).toEqual(ok);
    expect(validateSettings({ ...ok, players: 9 })).toBeNull();
    expect(validateSettings({ ...ok, winKind: 'x' })).toBeNull();
    expect(validateSettings({ ...ok, winValue: 0 })).toBeNull();
    expect(validateSettings({ ...ok, timers: 'yes' })).toBeNull();
    expect(validateSettings(null)).toBeNull();
  });

  it('room codes avoid look-alike characters', () => {
    let i = 0;
    const code = generateRoomCode(() => i++ % 31);
    expect(code).toHaveLength(5);
    expect(isRoomCode(code)).toBe(true);
    expect(isRoomCode('ABCO1')).toBe(false);
    expect(isRoomCode('abcde')).toBe(false);
  });
});
