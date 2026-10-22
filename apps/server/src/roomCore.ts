/**
 * Room logic without any Cloudflare types, so it can be tested in plain Node.
 *
 * A room has a lobby (seats: human / bot / open, owner starts the game) and then runs one engine `HostState`. The server is the
 * authority: it validates every intent, deals from a cryptographic shuffle, drives all clocks and bots, and sends each connection
 * only its own `hostView`. The Durable Object (room.ts) feeds it messages and one alarm.
 *
 * Leaving and rejoining: a player who is gone for TAKEOVER_MS is replaced by a bot. When the round ends and the next one starts, that
 * bot becomes a dummy (as long as two regular players remain and there are at most 4 players). A player who comes back takes
 * the bot's place at once; a dummy's place at once on the score screen or before the first licitation decision, otherwise at the end
 * of the round (until then they watch).
 *
 * Option votes: on the score screen any human may propose one option change; all humans must approve within VOTE_MS.
 */
import { heuristicBot } from '@tarok/ai';
import {
  IllegalAction, actorParticipant, createHost, createRng, hostAct, hostContinue, hostMakeDummy, hostNextDeadlineMs, hostReady,
  hostRunBots, hostSeatPlayer, hostSetController, hostSetOptions, hostTick, hostView, participantKindsFor,
  type CardId, type Controller, type HostState, type MatchConfig, type OptionChange, type Rng,
} from '@tarok/engine';
import {
  MAX_NAME, PROTOCOL_VERSION, parseClientMessage,
  type ClientMessage, type ErrorCode, type RoomSettings, type ServerMessage, type SlotInfo, type VoteResult, type You,
} from '@tarok/protocol';

export const BOT_DELAY_MS = 700;
/** A bot that has to lead right after a trick waits longer, so people can see the finished trick. */
export const TRICK_PAUSE_MS = 1600;
export const AUTO_NEXT_MS = 2500;
/** A disconnected human is replaced by a bot after this long (and gets the seat back on reconnect). */
export const TAKEOVER_MS = 20_000;
/** In the lobby an offline player's seat is released after this long. */
export const LOBBY_RELEASE_MS = 60_000;
/** An option vote ends after this long (and fails unless everybody approved). */
export const VOTE_MS = 60_000;

export interface Slot {
  kind: 'open' | 'human' | 'bot' | 'dummy';
  /** Secret reconnect token of the human in this seat. */
  token: string | null;
  name: string;
  offlineSince: number | null;
}

export interface VoteState {
  proposer: number;
  change: OptionChange;
  /** Absolute time (ms) when the vote ends. */
  deadline: number;
  /** Participant -> answer. */
  votes: Record<number, boolean>;
}

/** Everything that is persisted (plain JSON). Contains secrets and all hands: never send it to a client. */
export interface RoomData {
  v: 1;
  code: string;
  settings: RoomSettings;
  ownerToken: string;
  /** One per participant (regular players, plus dummies). */
  slots: Slot[];
  /** Null while the room is still a lobby. */
  host: HostState | null;
  nextVotes: number[];
  /** The running option vote (missing in rooms saved by older versions). */
  vote?: VoteState | null;
  voteResult?: VoteResult | null;
  touched: number;
}

export interface RoomEnv {
  now(): number;
  randomToken(): string;
  randomSeed(): number;
  /** A full deck in unpredictable order. */
  deck(): CardId[];
}

export interface Transport {
  send(connId: string, msg: ServerMessage): void;
  close(connId: string): void;
}

export function matchConfigFor(s: RoomSettings): MatchConfig {
  return {
    regularPlayers: s.players,
    dummies: s.players === 2 ? 2 : s.players === 3 ? 1 : 0,
    winCondition:
      s.winKind === 'rounds' ? { kind: 'rounds', rounds: s.winValue }
      : s.winKind === 'targetScore' ? { kind: 'targetScore', target: s.winValue }
      : s.winKind === 'none' ? { kind: 'none' }
      : { kind: 'timeLimit', minutes: s.winValue },
    failSafeMinutes: s.failSafeMinutes,
    infiniteContra: s.infiniteContra,
    slovenian: s.slovenian !== false,
    bonuses: s.bonuses !== false,
    timers: { bankSeconds: s.timers ? 'auto' : null },
  };
}

export function newRoomData(code: string, settings: RoomSettings, ownerToken: string, now: number): RoomData {
  const kinds = participantKindsFor(matchConfigFor(settings));
  return {
    v: 1, code, settings, ownerToken,
    slots: kinds.map((k) => ({ kind: k === 'dummy' ? 'dummy' : 'open', token: null, name: '', offlineSince: null }) as Slot),
    host: null, nextVotes: [], vote: null, voteResult: null, touched: now,
  };
}

function settingsWith(s: RoomSettings, c: OptionChange): RoomSettings {
  switch (c.key) {
    case 'slovenian': return { ...s, slovenian: c.value };
    case 'bonuses': return { ...s, bonuses: c.value };
    case 'infiniteContra': return { ...s, infiniteContra: c.value };
    case 'win': return { ...s, winKind: c.kind, winValue: c.value };
  }
}

function differs(s: RoomSettings, c: OptionChange): boolean {
  switch (c.key) {
    case 'slovenian': return (s.slovenian !== false) !== c.value;
    case 'bonuses': return (s.bonuses !== false) !== c.value;
    case 'infiniteContra': return s.infiniteContra !== c.value;
    case 'win': return c.kind === 'none' ? s.winKind !== 'none' : s.winKind !== c.kind || s.winValue !== c.value;
  }
}

interface Conn {
  participant: number | null;
  owner: boolean;
  joined: boolean;
}

const botFor = () => heuristicBot.choose;
const cleanName = (raw: string): string => raw.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, MAX_NAME) || 'Player';

export class RoomCore {
  private conns = new Map<string, Conn>();
  private lastTick: number;
  private botReadyAt: number | null = null;
  private rng: Rng;

  constructor(
    public data: RoomData,
    private io: Transport,
    private env: RoomEnv,
    private persist: (d: RoomData) => void,
  ) {
    this.lastTick = env.now();
    this.rng = createRng(env.randomSeed());
  }

  get connectionCount(): number {
    return this.conns.size;
  }

  // ----- connections -----

  connect(id: string): void {
    if (this.conns.size === 0) {
      // nobody was here: do not charge the quiet time (clocks) and do not let it use up a running vote
      const now = this.env.now();
      this.lastTick = now;
      if (this.data.vote) this.data.vote.deadline += Math.max(0, now - this.data.touched);
    }
    this.conns.set(id, { participant: null, owner: false, joined: false });
    this.touch();
  }

  disconnect(id: string): void {
    const c = this.conns.get(id);
    if (!c) return;
    this.conns.delete(id);
    if (c.participant !== null && !this.isConnected(c.participant)) {
      const slot = this.data.slots[c.participant];
      if (slot && slot.kind === 'human') slot.offlineSince = this.env.now();
    }
    this.changed();
  }

  handle(id: string, raw: string): void {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.advance();
    this.afterHostChange();
    const msg = parseClientMessage(raw);
    if (!msg) return this.error(id, 'bad_message', this.describeBad(raw));
    if (msg.t === 'ping') return this.io.send(id, { t: 'pong' });
    if (msg.t === 'join') return this.join(id, conn, msg);
    if (!conn.joined) return this.error(id, 'bad_message', 'Join first');
    try {
      switch (msg.t) {
        case 'act': return this.act(id, conn, msg.action);
        case 'ready': return this.ready(id, conn);
        case 'next': return this.next(id, conn);
        case 'propose': return this.propose(id, conn, msg.change);
        case 'vote': return this.castVote(id, conn, msg.approve);
        case 'slot': return this.setSlot(id, conn, msg.index, msg.kind);
        case 'start': return this.start(id, conn);
      }
    } catch (e) {
      if (e instanceof IllegalAction) this.error(id, 'illegal', e.message);
      else this.error(id, 'bad_message', 'Could not apply that');
    }
  }

  /** Why a message was rejected, for the error shown to the player. */
  private describeBad(raw: string): string {
    try {
      const x: unknown = JSON.parse(raw);
      const t = typeof x === 'object' && x !== null ? (x as { t?: unknown }).t : undefined;
      if (t === 'propose') return 'Invalid option change';
      if (t === 'vote') return 'Invalid vote';
    } catch {
      /* not JSON */
    }
    return 'Invalid message';
  }

  // ----- join -----

  private join(id: string, conn: Conn, msg: Extract<ClientMessage, { t: 'join' }>): void {
    if (conn.joined) return this.error(id, 'bad_message', 'Already joined');
    if (msg.v !== PROTOCOL_VERSION) return this.error(id, 'bad_version', 'Client and server versions differ');
    const d = this.data;
    const token = msg.token ?? null;
    const isOwner = token !== null && token === d.ownerToken;
    let idx = token !== null ? d.slots.findIndex((s) => s.kind === 'human' && s.token === token) : -1;
    const name = cleanName(msg.name);

    if (idx >= 0) {
      // Reconnect: the old connection of this seat (another tab) is replaced.
      for (const [otherId, c] of [...this.conns]) {
        if (otherId !== id && c.participant === idx) {
          this.error(otherId, 'replaced', 'This room was opened somewhere else');
          this.conns.delete(otherId);
          this.io.close(otherId);
        }
      }
      d.slots[idx]!.name = this.uniqueName(name, idx);
    } else if (d.host === null) {
      const free = d.slots.findIndex((s) => s.kind === 'open');
      if (free >= 0) {
        idx = free;
        d.slots[free] = { kind: 'human', token: isOwner ? token : this.env.randomToken(), name: this.uniqueName(name, free), offlineSince: null };
      }
    }

    conn.joined = true;
    conn.owner = isOwner;
    conn.participant = idx >= 0 ? idx : null;
    if (idx >= 0) {
      d.slots[idx]!.offlineSince = null;
      this.reseat(idx);
    }
    const secret = idx >= 0 ? d.slots[idx]!.token! : isOwner ? d.ownerToken : this.env.randomToken();
    this.io.send(id, { t: 'welcome', v: PROTOCOL_VERSION, code: d.code, token: secret, you: this.youOf(conn) });
    this.changed();
  }

  /**
   * A player is back. A bot that replaced them hands the seat back at once. A dummy is replaced at once on the score screen or
   * before the first licitation decision; otherwise the player watches until the round ends (see `promoteWaiting`).
   */
  private reseat(p: number): void {
    const h = this.data.host;
    if (!h) return;
    if (h.match.participantKinds[p] === 'dummy') {
      try {
        this.data.host = hostSeatPlayer(h, p);
      } catch (e) {
        if (!(e instanceof IllegalAction)) throw e;
      }
    } else if (h.controllers[p] !== 'human') {
      this.data.host = hostSetController(h, p, 'human');
    }
  }

  /** Players who came back while their seat was a dummy sit down when the round has ended. */
  private promoteWaiting(): void {
    this.data.slots.forEach((s, p) => {
      if (s.kind === 'human' && this.isConnected(p)) this.reseat(p);
    });
  }

  private uniqueName(name: string, exceptIdx: number): string {
    const taken = new Set(this.data.slots.filter((s, i) => i !== exceptIdx && s.kind === 'human').map((s) => s.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name.slice(0, MAX_NAME - 3)} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  // ----- lobby -----

  private setSlot(id: string, conn: Conn, index: number, kind: 'open' | 'bot'): void {
    if (!conn.owner) return this.error(id, 'not_owner', 'Only the host can change seats');
    const d = this.data;
    if (d.host) return this.error(id, 'illegal', 'The game has already started');
    const slot = d.slots[index];
    if (!slot || (slot.kind !== 'open' && slot.kind !== 'bot')) return this.error(id, 'illegal', 'That seat cannot be changed');
    slot.kind = kind;
    this.changed();
  }

  private start(id: string, conn: Conn): void {
    if (!conn.owner) return this.error(id, 'not_owner', 'Only the host can start the game');
    const d = this.data;
    if (d.host) return this.error(id, 'illegal', 'The game has already started');
    if (d.slots.some((s) => s.kind === 'open')) return this.error(id, 'seats_not_filled', 'Every seat needs a player or a bot');
    if (!d.slots.some((s) => s.kind === 'human')) return this.error(id, 'illegal', 'At least one human player is needed');
    const controllers = d.slots.map((s): Controller => (s.kind === 'human' ? 'human' : 'bot'));
    d.host = createHost(matchConfigFor(d.settings), this.env.randomSeed(), controllers, undefined, this.env.deck());
    d.nextVotes = [];
    this.lastTick = this.env.now();
    this.changed();
  }

  // ----- game intents -----

  private requireGame(id: string, conn: Conn): HostState | null {
    if (!this.data.host) {
      this.error(id, 'illegal', 'The game has not started');
      return null;
    }
    if (conn.participant === null) {
      this.error(id, 'illegal', 'Spectators cannot act');
      return null;
    }
    return this.data.host;
  }

  private act(id: string, conn: Conn, action: Parameters<typeof hostAct>[2]): void {
    const h = this.requireGame(id, conn);
    if (!h) return;
    this.data.host = hostAct(h, conn.participant!, action);
    this.afterHostChange();
    this.changed();
  }

  private ready(id: string, conn: Conn): void {
    const h = this.requireGame(id, conn);
    if (!h) return;
    this.data.host = hostReady(h, conn.participant!);
    this.changed();
  }

  /** "Next round": starts when every human has pressed it (and no option vote is running). */
  private next(id: string, conn: Conn): void {
    const h = this.requireGame(id, conn);
    if (!h) return;
    if (h.stage !== 'betweenRounds') return this.error(id, 'illegal', 'No round has just ended');
    if (!this.data.nextVotes.includes(conn.participant!)) this.data.nextVotes.push(conn.participant!);
    this.afterHostChange();
    this.changed();
  }

  private humansOf(h: HostState): number[] {
    return h.controllers.map((_, p) => p).filter((p) => h.controllers[p] === 'human' && h.match.participantKinds[p] === 'player');
  }

  /**
   * Starts the next round. First, bots that replaced players who are still away become dummies (when at least two regular players
   * remain and the match has at most 4 players).
   */
  private startNextRound(h: HostState): HostState {
    let cur = h;
    this.data.slots.forEach((s, p) => {
      if (s.kind !== 'human' || this.isConnected(p)) return;
      if (cur.controllers[p] !== 'bot' || cur.match.participantKinds[p] !== 'player') return;
      try {
        cur = hostMakeDummy(cur, p);
      } catch (e) {
        if (!(e instanceof IllegalAction)) throw e;
      }
    });
    return hostContinue(cur, this.env.deck());
  }

  /** Clears stale votes, seats returning players and starts the next round once every human voted. */
  private afterHostChange(): void {
    const d = this.data;
    if (!d.host) return;
    if (d.host.stage !== 'betweenRounds') {
      d.nextVotes = [];
      d.vote = null;
      d.voteResult = null;
      return;
    }
    this.promoteWaiting();
    const h = d.host;
    if (d.vote) return; // an option vote is running: the next round waits for it
    const humans = this.humansOf(h);
    if (humans.length > 0 && humans.every((p) => d.nextVotes.includes(p))) {
      d.host = this.startNextRound(h);
      d.nextVotes = [];
    }
  }

  // ----- option votes -----

  private propose(id: string, conn: Conn, change: OptionChange): void {
    const h = this.requireGame(id, conn);
    if (!h) return;
    const d = this.data;
    if (h.stage !== 'betweenRounds') return this.error(id, 'illegal', 'Options can only be changed between rounds');
    if (!this.humansOf(h).includes(conn.participant!)) return this.error(id, 'illegal', 'Only players can propose changes');
    if (h.match.finished) return this.error(id, 'illegal', 'The match is over');
    if (d.vote) return this.error(id, 'illegal', 'A vote is already running');
    if (!differs(d.settings, change)) return this.error(id, 'illegal', 'The option already has that value');
    d.vote = { proposer: conn.participant!, change, deadline: this.env.now() + VOTE_MS, votes: { [conn.participant!]: true } };
    d.voteResult = null;
    this.resolveVote();
    this.afterHostChange();
    this.changed();
  }

  private castVote(id: string, conn: Conn, approve: boolean): void {
    const h = this.requireGame(id, conn);
    if (!h) return;
    const d = this.data;
    if (!d.vote) return this.error(id, 'illegal', 'No vote is running');
    if (!this.humansOf(h).includes(conn.participant!)) return this.error(id, 'illegal', 'Only players can vote');
    d.vote.votes[conn.participant!] = approve;
    this.resolveVote();
    this.afterHostChange();
    this.changed();
  }

  /** Ends the vote when everybody approved (change applied), somebody rejected, or the time is up. */
  private resolveVote(): void {
    const d = this.data;
    const v = d.vote;
    const h = d.host;
    if (!v || !h) return;
    const humans = this.humansOf(h);
    const allYes = humans.length > 0 && humans.every((p) => v.votes[p] === true);
    const rejected = humans.some((p) => v.votes[p] === false);
    const expired = this.env.now() >= v.deadline;
    if (!allYes && !rejected && !expired) return;
    let passed = allYes && !rejected;
    if (passed) {
      try {
        d.host = hostSetOptions(h, v.change);
        d.settings = settingsWith(d.settings, v.change);
      } catch (e) {
        if (!(e instanceof IllegalAction)) throw e;
        passed = false;
      }
    }
    d.vote = null;
    d.voteResult = { change: v.change, passed };
  }

  // ----- time -----

  private advance(): void {
    const now = this.env.now();
    const h = this.data.host;
    if (h) this.data.host = hostTick(h, Math.max(1, now - this.lastTick), this.rng);
    this.lastTick = now;
  }

  private housekeeping(now: number): void {
    const d = this.data;
    d.slots.forEach((s, p) => {
      if (s.kind !== 'human' || s.offlineSince === null || this.isConnected(p)) return;
      const away = now - s.offlineSince;
      if (!d.host) {
        if (away >= LOBBY_RELEASE_MS) d.slots[p] = { kind: 'open', token: null, name: '', offlineSince: null };
      } else if (d.host.controllers[p] === 'human' && away >= TAKEOVER_MS) {
        d.host = hostSetController(d.host, p, 'bot');
      }
    });
    this.resolveVote();
    this.afterHostChange();
  }

  /** The next thing a bot (or the automatic "next round" with no humans) should do, and how long to wait first. */
  private pending(): { delay: number; run: () => void } | null {
    const h = this.data.host;
    if (!h) return null;
    if (h.stage === 'playing') {
      const p = actorParticipant(h);
      if (p !== null && h.controllers[p] !== 'human') {
        const r = h.match.round;
        const delay = r.trick.length === 0 && r.tricks.length > 0 ? TRICK_PAUSE_MS : BOT_DELAY_MS;
        return { delay, run: () => { this.data.host = hostRunBots(h, botFor, this.rng, 1); } };
      }
    }
    if (h.stage === 'betweenRounds' && this.humansOf(h).length === 0) {
      return { delay: AUTO_NEXT_MS, run: () => { this.data.host = this.startNextRound(h); this.data.nextVotes = []; } };
    }
    return null;
  }

  /** Absolute time (ms) when `alarm()` should run next, or null. With nobody connected the room is frozen. */
  nextAlarm(): number | null {
    if (this.conns.size === 0) return null;
    const now = this.env.now();
    const h = this.data.host;
    let t = Number.POSITIVE_INFINITY;
    if (h) {
      const d = hostNextDeadlineMs(h);
      if (d !== null) t = Math.min(t, this.lastTick + d);
      const p = this.pending();
      if (p) {
        if (this.botReadyAt === null) this.botReadyAt = now + p.delay;
        t = Math.min(t, this.botReadyAt);
      } else this.botReadyAt = null;
    }
    if (this.data.vote) t = Math.min(t, this.data.vote.deadline);
    this.data.slots.forEach((s, p) => {
      if (s.kind !== 'human' || s.offlineSince === null) return;
      if (h && h.controllers[p] !== 'human') return;
      t = Math.min(t, s.offlineSince + (h ? TAKEOVER_MS : LOBBY_RELEASE_MS));
    });
    return t === Number.POSITIVE_INFINITY ? null : Math.max(t, now + 25);
  }

  /** Runs due work (clocks, takeovers, votes, one bot move) and returns the next alarm time. */
  alarm(): number | null {
    if (this.conns.size === 0) return null;
    const now = this.env.now();
    this.advance();
    this.housekeeping(now);
    const p = this.pending();
    if (p && this.botReadyAt !== null && now >= this.botReadyAt) {
      p.run();
      this.botReadyAt = null;
      this.afterHostChange();
    } else if (!p) this.botReadyAt = null;
    this.changed();
    return this.nextAlarm();
  }

  // ----- output -----

  private isConnected(p: number): boolean {
    for (const c of this.conns.values()) if (c.participant === p) return true;
    return false;
  }

  private youOf(c: Conn): You {
    return { participant: c.participant, owner: c.owner };
  }

  private slotInfo(s: Slot, p: number): SlotInfo {
    return {
      kind: s.kind,
      name: s.kind === 'human' ? s.name : null,
      connected: s.kind === 'human' ? this.isConnected(p) : s.kind !== 'open',
      owner: s.kind === 'human' && s.token === this.data.ownerToken,
    };
  }

  private messageFor(c: Conn): ServerMessage {
    const d = this.data;
    const you = this.youOf(c);
    if (!d.host) return { t: 'lobby', code: d.code, you, settings: d.settings, slots: d.slots.map((s, p) => this.slotInfo(s, p)) };
    // A returning player whose seat is still a dummy watches (public view) until they sit down.
    const sits = c.participant !== null && d.host.match.participantKinds[c.participant] !== 'dummy';
    return {
      t: 'state', you, settings: d.settings,
      view: hostView(d.host, sits ? c.participant! : -1),
      names: d.slots.map((s) => (s.kind === 'human' ? s.name : null)),
      connected: d.slots.map((s, p) => (s.kind === 'human' ? this.isConnected(p) : s.kind !== 'open')),
      nextVotes: d.nextVotes,
      vote: d.vote
        ? { proposer: d.vote.proposer, change: d.vote.change, msLeft: Math.max(0, d.vote.deadline - this.env.now()), votes: d.vote.votes }
        : null,
      voteResult: d.voteResult ?? null,
    };
  }

  private touch(): void {
    this.data.touched = this.env.now();
  }

  private changed(): void {
    this.touch();
    this.persist(this.data);
    for (const [id, c] of this.conns) if (c.joined) this.io.send(id, this.messageFor(c));
  }

  private error(id: string, code: ErrorCode, message: string): void {
    this.io.send(id, { t: 'error', code, message });
  }
}
