/**
 * Online game: a WebSocket client with the same surface as the local `Game` (`view`, `act`, `ready`, `next`), so the game screen
 * works unchanged. The server owns the game; this class only sends intents and renders the `HostView` it is given.
 * Between messages it counts the running clocks down locally so they look smooth.
 */
import type { Action, CompletedTrick, HostView } from '@tarok/engine';
import { PROTOCOL_VERSION, parseServerMessage, type ClientMessage, type LobbyMessage, type StateMessage } from '@tarok/protocol';
import type { GameLike } from './gamelike';
import { t } from './i18n.svelte';
import { loadToken, saveToken, wsUrl } from './server';

const HOLD_MS = 1300;
const PING_MS = 25_000;

/** The snapshot's clocks, advanced by the time that passed since it arrived. */
function adjust(view: HostView, dt: number): HostView {
  const tm = view.timers;
  const banksMs = [...tm.banksMs];
  for (const p of tm.draining) {
    const b = banksMs[p];
    if (b !== null && b !== undefined) banksMs[p] = Math.max(0, b - dt);
  }
  return {
    ...view,
    timers: {
      ...tm,
      banksMs,
      graceMsLeft: tm.graceMsLeft === null ? null : Math.max(0, tm.graceMsLeft - dt),
      matchMsLeft: tm.matchMsLeft === null ? null : Math.max(0, tm.matchMsLeft - dt),
    },
  };
}

export class OnlineGame implements GameLike {
  readonly online = true;
  status = $state<'connecting' | 'open' | 'reconnecting' | 'closed'>('connecting');
  /** Set when the room cannot be used (not found, server unreachable, opened in another tab). */
  fatal = $state<'notFound' | 'unreachable' | 'replaced' | null>(null);
  /** A short message from the server (for example an illegal move), shown for a few seconds. */
  notice = $state<string | null>(null);
  lobby = $state.raw<LobbyMessage | null>(null);
  server = $state.raw<StateMessage | null>(null);
  hold = $state.raw<CompletedTrick | null>(null);

  private clockMs = $state(performance.now());
  private baseAt = 0;
  private code = '';
  private name = '';
  private ws: WebSocket | null = null;
  private closed = false;
  private everOpened = false;
  private retry = 0;
  private tickTimer = 0;
  private pingTimer = 0;
  private holdTimer = 0;
  private retryTimer = 0;
  private noticeTimer = 0;

  readonly view: HostView = $derived.by(() => {
    const s = this.server;
    if (!s) return undefined as unknown as HostView;
    return adjust(s.view, Math.max(0, this.clockMs - this.baseAt));
  });

  readonly names: string[] = $derived.by(() => {
    const s = this.server;
    if (!s) return [];
    let bots = 0;
    return s.names.map((n, p) => n ?? (s.view.participantKinds[p] === 'dummy' ? t('role.dummy') : t('bot.name', { n: ++bots })));
  });

  get roundsTotal(): number | null {
    const s = this.server?.settings;
    return s && s.winKind === 'rounds' ? s.winValue : null;
  }

  get votedNext(): boolean {
    const s = this.server;
    return !!s && s.you.participant !== null && s.view.stage === 'betweenRounds' && s.nextVotes.includes(s.you.participant);
  }

  nameOf(participant: number | null | undefined): string {
    return participant === null || participant === undefined ? '' : (this.names[participant] ?? '');
  }

  // The game screen calls these; the room screen owns the connection (connect / close).
  start(): void {}
  destroy(): void {}

  connect(code: string, name: string): void {
    this.code = code;
    this.name = name;
    this.closed = false;
    this.tickTimer = window.setInterval(() => (this.clockMs = performance.now()), 250);
    this.open();
  }

  fail(reason: 'notFound' | 'unreachable'): void {
    this.fatal = reason;
    this.status = 'closed';
  }

  close(): void {
    this.closed = true;
    clearInterval(this.tickTimer);
    clearInterval(this.pingTimer);
    clearTimeout(this.holdTimer);
    clearTimeout(this.retryTimer);
    clearTimeout(this.noticeTimer);
    this.ws?.close();
  }

  // ----- intents -----

  act = (action: Action): void => {
    this.clearHold();
    this.send({ t: 'act', action });
  };
  ready = (): void => this.send({ t: 'ready' });
  next = (): void => this.send({ t: 'next' });
  setSlot(index: number, kind: 'open' | 'bot'): void {
    this.send({ t: 'slot', index, kind });
  }
  startGame(): void {
    this.send({ t: 'start' });
  }

  // ----- connection -----

  private send(m: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private open(): void {
    const ws = new WebSocket(wsUrl(this.code));
    this.ws = ws;
    this.status = this.everOpened ? 'reconnecting' : 'connecting';
    ws.onopen = () => {
      this.everOpened = true;
      this.retry = 0;
      this.status = 'open';
      this.send({ t: 'join', v: PROTOCOL_VERSION, name: this.name, token: loadToken(this.code) ?? undefined });
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping' }), PING_MS);
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') this.onMessage(ev.data);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.closed || this.fatal) return;
      this.retry++;
      if (!this.everOpened && this.retry > 3) return this.fail('unreachable');
      this.status = 'reconnecting';
      this.retryTimer = window.setTimeout(() => this.open(), Math.min(10_000, 500 * 2 ** this.retry));
    };
  }

  private onMessage(raw: string): void {
    const m = parseServerMessage(raw);
    if (!m) return;
    switch (m.t) {
      case 'welcome':
        saveToken(this.code, m.token);
        break;
      case 'lobby':
        this.lobby = m;
        break;
      case 'state': {
        const prev = this.server?.view;
        if (prev && m.view.round.tricks.length > prev.round.tricks.length) this.holdTrick(m.view.round.tricks[m.view.round.tricks.length - 1]!);
        this.baseAt = performance.now();
        this.server = m;
        this.lobby = null;
        break;
      }
      case 'error':
        if (m.code === 'replaced') {
          this.fatal = 'replaced';
          this.status = 'closed';
        } else if (m.code === 'room_not_found') this.fail('notFound');
        else {
          this.notice = m.message;
          clearTimeout(this.noticeTimer);
          this.noticeTimer = window.setTimeout(() => (this.notice = null), 4000);
        }
        break;
      case 'pong':
        break;
    }
  }

  private holdTrick(trick: CompletedTrick): void {
    clearTimeout(this.holdTimer);
    this.hold = trick;
    this.holdTimer = window.setTimeout(() => this.clearHold(), HOLD_MS);
  }

  private clearHold(): void {
    clearTimeout(this.holdTimer);
    this.hold = null;
  }
}
