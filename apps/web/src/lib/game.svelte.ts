/**
 * The local game: one `HostState` from the engine, one human (participant 0), the rest heuristic bots.
 * The UI renders `view` and sends intents through `act` / `ready` / `next`; it never decides legality itself.
 */
import { heuristicBot } from '@tarok/ai';
import {
  DEFAULT_TIMERS, IllegalAction, actorParticipant, createHost, createRng, hostAct, hostContinue, hostReady,
  hostRunBots, hostTick, hostView, participantKindsFor, type Action, type CompletedTrick, type HostState, type MatchConfig,
} from '@tarok/engine';
import type { GameSetup } from './setup.svelte';
import { settings } from './settings.svelte';

export function configFromSetup(s: GameSetup): MatchConfig {
  const dummies = s.players === 2 ? 2 : s.players === 3 ? 1 : 0;
  return {
    regularPlayers: s.players,
    dummies,
    winCondition:
      s.winKind === 'rounds' ? { kind: 'rounds', rounds: s.winValue }
      : s.winKind === 'targetScore' ? { kind: 'targetScore', target: s.winValue }
      : { kind: 'timeLimit', minutes: s.winValue },
    failSafeMinutes: s.failSafeMinutes,
    infiniteContra: s.infiniteContra,
    timers: s.timers ? DEFAULT_TIMERS : { viewSeconds: null, licitationDecisionSeconds: null, bankSeconds: null },
  };
}

/** How long a finished trick stays on the table before the next card can be played. */
const TRICK_HOLD_MS = 1300;
const TICK_MS = 250;

export class Game {
  host = $state.raw<HostState>(undefined as unknown as HostState);
  /** The trick that was just completed, shown for a moment. */
  hold = $state.raw<CompletedTrick | null>(null);
  readonly me = 0;
  readonly view = $derived(hostView(this.host, this.me));
  readonly names: string[];

  private rng = createRng((Date.now() ^ Math.floor(Math.random() * 2 ** 31)) >>> 0);
  private last = 0;
  private tickTimer = 0;
  private botTimer = 0;
  private holdTimer = 0;
  private destroyed = false;
  private botDelay: () => number;

  constructor(setup: GameSetup, names: { you: string; bot: (n: number) => string; dummy: string }, opts: { botDelay?: () => number; seed?: number } = {}) {
    const config = configFromSetup(setup);
    const seed = opts.seed ?? (Math.floor(Math.random() * 2 ** 31) >>> 0);
    const kinds = participantKindsFor(config);
    this.host = createHost(config, seed, kinds.map((_, p) => (p === this.me ? 'human' : 'bot')));
    let bots = 0;
    this.names = kinds.map((k, p) => (p === this.me ? names.you : k === 'dummy' ? names.dummy : names.bot(++bots)));
    this.botDelay = opts.botDelay ?? (() => settings.botDelay);
  }

  start(): void {
    this.last = performance.now();
    this.tickTimer = window.setInterval(this.tick, TICK_MS);
    document.addEventListener('visibilitychange', this.tick);
    this.pump();
  }

  destroy(): void {
    this.destroyed = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.botTimer);
    clearTimeout(this.holdTimer);
    document.removeEventListener('visibilitychange', this.tick);
  }

  // ----- intents -----

  act = (action: Action): void => {
    if (this.hold) this.clearHold();
    this.apply(() => hostAct(this.host, this.me, action));
  };
  ready = (): void => {
    this.apply(() => hostReady(this.host, this.me));
  };
  next = (): void => {
    this.apply(() => hostContinue(this.host));
  };

  /** Real time passes (interval and tab becoming visible again). */
  tick = (): void => {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    if (dt > 0) this.apply(() => hostTick(this.host, dt, this.rng));
  };

  /** A human (or bot) at the table by participant, for labels. */
  nameOf(participant: number | null | undefined): string {
    return participant === null || participant === undefined ? "" : (this.names[participant] ?? "");
  }

  // ----- internals -----

  private apply(step: () => HostState): void {
    if (this.destroyed) return;
    let next: HostState;
    try {
      next = step();
    } catch (e) {
      if (e instanceof IllegalAction) return; // a stale click: the UI only offers legal actions
      throw e;
    }
    this.update(next);
  }

  private update(next: HostState): void {
    const prev = this.host;
    const before = prev.match.round.tricks.length;
    const sameRound = prev.match.roundIndex === next.match.roundIndex;
    const tricks = next.match.round.tricks;
    if (sameRound && tricks.length > before) this.holdTrick(tricks[tricks.length - 1]!);
    else if (!sameRound && this.hold) this.clearHold();
    this.host = next;
    this.pump();
  }

  private holdTrick(t: CompletedTrick): void {
    clearTimeout(this.holdTimer);
    this.hold = t;
    this.holdTimer = window.setTimeout(() => this.clearHold(), this.botDelay() === 0 ? 0 : TRICK_HOLD_MS);
  }

  private clearHold(): void {
    clearTimeout(this.holdTimer);
    this.hold = null;
    this.pump();
  }

  /** Bots move one at a time (so the table can animate), never while a finished trick is on display. */
  private pump(): void {
    if (this.destroyed || this.botTimer || this.hold) return;
    const h = this.host;
    if (h.stage !== 'playing') return;
    const p = actorParticipant(h);
    if (p === null || p === this.me) return;
    this.botTimer = window.setTimeout(() => {
      this.botTimer = 0;
      if (this.destroyed) return;
      this.update(hostRunBots(this.host, () => heuristicBot.choose, this.rng, 1));
    }, this.botDelay());
  }
}
