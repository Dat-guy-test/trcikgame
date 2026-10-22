import { describe, expect, it } from 'vitest';
import { createRng, fullDeck, shuffle } from '@tarok/engine';
import { PROTOCOL_VERSION, type RoomSettings, type ServerMessage, type StateMessage } from '@tarok/protocol';
import { RoomCore, TAKEOVER_MS, VOTE_MS, newRoomData, type RoomEnv } from '../src/roomCore';

function setupRoom() {
  const clock = { t: 1_000_000 };
  let tokens = 0;
  const rng = createRng(5);
  const env: RoomEnv = {
    now: () => clock.t,
    randomToken: () => `tok${++tokens}`,
    randomSeed: () => Math.floor(rng() * 2 ** 31),
    deck: () => shuffle(fullDeck(), rng),
  };
  const inbox = new Map<string, ServerMessage[]>();
  const io = {
    send: (id: string, m: ServerMessage) => void inbox.set(id, [...(inbox.get(id) ?? []), m]),
    close: () => {},
  };
  const settings: RoomSettings = { players: 4, winKind: 'none', winValue: 1, failSafeMinutes: null, infiniteContra: false, timers: true };
  const core = new RoomCore(newRoomData('ABCDE', settings, 'owner-token', clock.t), io, env, () => {});
  const send = (id: string, msg: object) => core.handle(id, JSON.stringify(msg));
  const join = (id: string, name: string, token?: string) => {
    core.connect(id);
    send(id, { t: 'join', v: PROTOCOL_VERSION, name, token });
  };
  const state = (id: string): StateMessage | undefined =>
    [...(inbox.get(id) ?? [])].reverse().find((m): m is StateMessage => m.t === 'state');
  const tokenOf = (id: string) => {
    const w = (inbox.get(id) ?? []).find((m) => m.t === 'welcome');
    return w && w.t === 'welcome' ? w.token : undefined;
  };
  const advanceAlarm = () => {
    const t = core.nextAlarm();
    if (t === null) throw new Error('room stalled');
    clock.t = Math.max(clock.t, t);
    core.alarm();
  };
  return { clock, core, send, join, state, tokenOf, advanceAlarm };
}
type Room = ReturnType<typeof setupRoom>;

function fillAndStart(r: Room) {
  r.join('a', 'Ann', 'owner-token');
  r.join('b', 'Bob');
  r.send('a', { t: 'slot', index: 2, kind: 'bot' });
  r.send('a', { t: 'slot', index: 3, kind: 'bot' });
  r.send('a', { t: 'start' });
}

/** The given humans act at random until the score screen of the current round is shown. */
function playUntilScoreScreen(r: Room, humans: string[]) {
  const rng = createRng(9);
  for (let i = 0; i < 60_000; i++) {
    if (r.core.data.host!.stage === 'betweenRounds') return;
    let acted = false;
    for (const id of humans) {
      const v = r.state(id)?.view;
      if (!v) continue;
      if (v.stage === 'viewing' && !v.ready[v.participant]) { r.send(id, { t: 'ready' }); acted = true; break; }
      if (v.legalActions.length > 0) {
        r.send(id, { t: 'act', action: v.legalActions[Math.floor(rng() * v.legalActions.length)] });
        acted = true;
        break;
      }
    }
    if (!acted) r.advanceAlarm();
  }
  throw new Error('round did not finish');
}

describe('option votes', () => {
  it('pass when every human approves, and apply from the next round', () => {
    const r = setupRoom();
    fillAndStart(r);
    playUntilScoreScreen(r, ['a', 'b']);
    r.send('a', { t: 'propose', change: { key: 'slovenian', value: false } });
    expect(r.state('b')!.vote?.change).toEqual({ key: 'slovenian', value: false });
    r.send('a', { t: 'next' });
    r.send('b', { t: 'next' });
    expect(r.core.data.host!.stage).toBe('betweenRounds'); // the vote blocks the next round
    r.send('b', { t: 'vote', approve: true });
    expect(r.state('a')!.vote).toBeNull();
    expect(r.state('a')!.voteResult).toEqual({ change: { key: 'slovenian', value: false }, passed: true });
    expect(r.core.data.settings.slovenian).toBe(false);
    expect(r.core.data.host!.stage).toBe('viewing'); // both had pressed next, the round started
    expect(r.core.data.host!.match.round.config.slovenian).toBe(false);
  });

  it('fail on a rejection', () => {
    const r = setupRoom();
    fillAndStart(r);
    playUntilScoreScreen(r, ['a', 'b']);
    r.send('a', { t: 'propose', change: { key: 'bonuses', value: false } });
    r.send('b', { t: 'vote', approve: false });
    expect(r.state('a')!.voteResult?.passed).toBe(false);
    expect(r.core.data.settings.bonuses).toBeUndefined();
    expect(r.core.data.host!.match.config.bonuses).toBe(true);
  });

  it('fail when the time runs out', () => {
    const r = setupRoom();
    fillAndStart(r);
    playUntilScoreScreen(r, ['a', 'b']);
    r.send('a', { t: 'propose', change: { key: 'infiniteContra', value: true } });
    expect(r.state('a')!.vote).not.toBeNull();
    r.clock.t += VOTE_MS + 1;
    r.core.alarm();
    expect(r.state('a')!.vote).toBeNull();
    expect(r.state('a')!.voteResult?.passed).toBe(false);
  });

  it('can only be started on the score screen', () => {
    const r = setupRoom();
    fillAndStart(r);
    r.send('a', { t: 'propose', change: { key: 'slovenian', value: false } });
    expect(r.state('a')!.vote).toBeNull();
  });
});

describe('leaving and rejoining', () => {
  it('a bot replaces the player, becomes a dummy after the round, and the player sits down again on the score screen', () => {
    const r = setupRoom();
    fillAndStart(r);
    const token = r.tokenOf('b')!;
    r.core.disconnect('b');
    r.clock.t += TAKEOVER_MS + 1000;
    r.core.alarm();
    expect(r.core.data.host!.controllers[1]).toBe('bot');
    playUntilScoreScreen(r, ['a']);
    expect(r.core.data.host!.match.participantKinds[1]).toBe('player'); // still a bot, not yet a dummy

    r.join('b2', 'Bob', token); // score screen: takes the bot's seat at once
    expect(r.core.data.host!.controllers[1]).toBe('human');
    expect(r.state('b2')!.you.participant).toBe(1);
  });

  it('after the next round starts the bot is a dummy; a returning player takes the seat before the first decision', () => {
    const r = setupRoom();
    fillAndStart(r);
    const token = r.tokenOf('b')!;
    r.core.disconnect('b');
    r.clock.t += TAKEOVER_MS + 1000;
    r.core.alarm();
    playUntilScoreScreen(r, ['a']);
    r.send('a', { t: 'next' });
    expect(r.core.data.host!.match.participantKinds[1]).toBe('dummy');
    expect(r.core.data.host!.controllers[1]).toBe('bot');

    r.join('b2', 'Bob', token); // nobody has bid yet
    expect(r.core.data.host!.match.participantKinds[1]).toBe('player');
    expect(r.core.data.host!.controllers[1]).toBe('human');
  });

  it('a dummy who returns after a decision watches until the round ends', () => {
    const r = setupRoom();
    fillAndStart(r);
    const token = r.tokenOf('b')!;
    r.core.disconnect('b');
    r.clock.t += TAKEOVER_MS + 1000;
    r.core.alarm();
    playUntilScoreScreen(r, ['a']);
    r.send('a', { t: 'next' });
    r.send('a', { t: 'ready' });
    const round = () => r.core.data.host!.match.round;
    for (let i = 0; i < 50 && round().toAct.length === 3 && round().currentBid === null; i++) {
      if (r.state('a')!.view.legalActions.length > 0) r.send('a', { t: 'act', action: { type: 'pass' } });
      else r.advanceAlarm();
    }
    expect(round().toAct.length < 3 || round().currentBid !== null).toBe(true);

    r.join('b2', 'Bob', token);
    expect(r.core.data.host!.match.participantKinds[1]).toBe('dummy');
    expect(r.state('b2')!.view.seat).toBeNull(); // watching

    playUntilScoreScreen(r, ['a']);
    expect(r.core.data.host!.match.participantKinds[1]).toBe('player');
    expect(r.core.data.host!.controllers[1]).toBe('human');
  });
});
