import { describe, expect, it } from 'vitest';
import { createRng, fullDeck, shuffle } from '@tarok/engine';
import { PROTOCOL_VERSION, type RoomSettings, type ServerMessage, type StateMessage } from '@tarok/protocol';
import { RoomCore, TAKEOVER_MS, newRoomData, type RoomEnv } from '../src/roomCore';

function setupRoom(over: Partial<RoomSettings> = {}) {
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
  const closed = new Set<string>();
  const io = {
    send: (id: string, m: ServerMessage) => {
      const list = inbox.get(id) ?? [];
      list.push(m);
      inbox.set(id, list);
    },
    close: (id: string) => void closed.add(id),
  };
  const settings: RoomSettings = { players: 4, winKind: 'rounds', winValue: 2, failSafeMinutes: null, infiniteContra: false, timers: true, ...over };
  const core = new RoomCore(newRoomData('ABCDE', settings, 'owner-token', clock.t), io, env, () => {});
  const send = (id: string, msg: object) => core.handle(id, JSON.stringify(msg));
  const join = (id: string, name: string, token?: string) => {
    core.connect(id);
    send(id, { t: 'join', v: PROTOCOL_VERSION, name, token });
  };
  const last = (id: string) => (inbox.get(id) ?? []).at(-1);
  const state = (id: string): StateMessage | undefined =>
    [...(inbox.get(id) ?? [])].reverse().find((m): m is StateMessage => m.t === 'state');
  const tokenOf = (id: string) => {
    const w = (inbox.get(id) ?? []).find((m) => m.t === 'welcome');
    return w && w.t === 'welcome' ? w.token : undefined;
  };
  return { clock, core, send, join, last, state, tokenOf, closed };
}
type Room = ReturnType<typeof setupRoom>;

function fillAndStart(r: Room) {
  r.join('a', 'Ann', 'owner-token');
  r.join('b', 'Bob');
  r.send('a', { t: 'slot', index: 2, kind: 'bot' });
  r.send('a', { t: 'slot', index: 3, kind: 'bot' });
  r.send('a', { t: 'start' });
}

/** Humans act at random until some human sees the match finished. */
function drive(r: Room, humans: string[]) {
  const rng = createRng(9);
  for (let i = 0; i < 60_000; i++) {
    let acted = false;
    for (const id of humans) {
      const st = r.state(id);
      if (!st) continue;
      const v = st.view;
      if (v.finished) return;
      if (v.stage === 'viewing' && !v.ready[v.participant]) { r.send(id, { t: 'ready' }); acted = true; break; }
      if (v.stage === 'betweenRounds' && !st.nextVotes.includes(v.participant)) { r.send(id, { t: 'next' }); acted = true; break; }
      if (v.legalActions.length > 0) {
        r.send(id, { t: 'act', action: v.legalActions[Math.floor(rng() * v.legalActions.length)] });
        acted = true;
        break;
      }
    }
    if (!acted) {
      const t = r.core.nextAlarm();
      if (t === null) throw new Error('room stalled');
      r.clock.t = Math.max(r.clock.t, t);
      r.core.alarm();
    }
  }
  throw new Error('match did not finish');
}

describe('lobby', () => {
  it('only the host starts, and only when every seat is filled', () => {
    const r = setupRoom();
    r.join('a', 'Ann', 'owner-token');
    r.join('b', 'Bob');
    const lobby = r.last('b');
    expect(lobby?.t).toBe('lobby');
    if (lobby?.t === 'lobby') expect(lobby.slots.map((s) => s.kind)).toEqual(['human', 'human', 'open', 'open']);
    r.send('b', { t: 'start' });
    expect(r.last('b')).toMatchObject({ t: 'error', code: 'not_owner' });
    r.send('a', { t: 'start' });
    expect(r.last('a')).toMatchObject({ t: 'error', code: 'seats_not_filled' });
    r.send('b', { t: 'slot', index: 2, kind: 'bot' });
    expect(r.last('b')).toMatchObject({ t: 'error', code: 'not_owner' });
    r.send('a', { t: 'slot', index: 2, kind: 'bot' });
    r.send('a', { t: 'slot', index: 3, kind: 'bot' });
    r.send('a', { t: 'start' });
    expect(r.last('a')?.t).toBe('state');
  });

  it('rejects garbage and acting before joining', () => {
    const r = setupRoom();
    r.core.connect('x');
    r.send('x', { t: 'act', action: { type: 'pass' } });
    expect(r.last('x')).toMatchObject({ t: 'error', code: 'bad_message' });
    r.core.handle('x', '{{{');
    expect(r.last('x')).toMatchObject({ t: 'error', code: 'bad_message' });
  });

  it('shares unique names', () => {
    const r = setupRoom();
    r.join('a', 'Ann', 'owner-token');
    r.join('b', 'Ann');
    expect(r.core.data.slots.map((s) => s.name).slice(0, 2)).toEqual(['Ann', 'Ann 2']);
  });
});

describe('a game', () => {
  it('hides other hands, lets a spectator watch, and plays a whole match with two humans and two bots', () => {
    const r = setupRoom();
    fillAndStart(r);
    r.join('s', 'Spectator');
    const a = r.state('a')!;
    expect(a.view.round.hands[0]).not.toBeNull();
    expect(a.view.round.hands[1]).toBeNull();
    expect(JSON.stringify(a)).not.toContain('"deck"');
    const spec = r.state('s')!;
    expect(spec.you.participant).toBeNull();
    expect(spec.view.round.hands.every((h) => h === null)).toBe(true);
    expect(spec.view.legalActions).toEqual([]);
    r.send('s', { t: 'act', action: { type: 'pass' } });
    expect(r.last('s')).toMatchObject({ t: 'error', code: 'illegal' });

    drive(r, ['a', 'b']);
    const done = r.state('a')!.view;
    expect(done.finished).toBe(true);
    expect(done.standings.reduce((x, y) => x + y, 0)).toBe(0);
    expect(r.state('s')!.view.finished).toBe(true);
  });

  it('acting out of turn is an error, not a crash', () => {
    const r = setupRoom();
    fillAndStart(r);
    r.send('a', { t: 'ready' });
    r.send('b', { t: 'ready' });
    const who = r.state('a')!.view.legalActions.length > 0 ? 'b' : 'a';
    r.send(who, { t: 'act', action: { type: 'pass' } });
    expect(r.last(who)).toMatchObject({ t: 'error', code: 'illegal' });
  });
});

describe('reconnecting', () => {
  it('a bot takes over a disconnected human after a while; the token gives the seat back', () => {
    const r = setupRoom();
    fillAndStart(r);
    const token = r.tokenOf('b')!;
    r.core.disconnect('b');
    r.clock.t += TAKEOVER_MS + 1000;
    r.core.alarm();
    expect(r.core.data.host!.controllers[1]).toBe('bot');
    r.join('b2', 'Bob', token);
    expect(r.core.data.host!.controllers[1]).toBe('human');
    expect(r.state('b2')!.you.participant).toBe(1);
  });

  it('a second connection with the same token replaces the first', () => {
    const r = setupRoom();
    r.join('a', 'Ann', 'owner-token');
    r.join('a2', 'Ann', 'owner-token');
    expect(r.closed.has('a')).toBe(true);
    expect(r.last('a2')?.t).toBe('lobby');
  });

  it('an empty room is frozen: no alarm, and quiet time is not charged', () => {
    const r = setupRoom();
    fillAndStart(r);
    r.core.disconnect('a');
    r.core.disconnect('b');
    expect(r.core.nextAlarm()).toBeNull();
    const banks = [...r.core.data.host!.clocks.banksMs];
    r.clock.t += 3_600_000;
    r.join('a2', 'Ann', 'owner-token');
    expect(r.core.data.host!.clocks.banksMs[0]).toBeGreaterThan(banks[0]! - 5_000);
  });
});
