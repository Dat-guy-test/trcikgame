/**
 * Messages between the web client and the room server (WebSocket, JSON), plus validation of everything the server receives.
 * Only types are imported from the engine, so the client bundle gets no engine code from here.
 *
 * Flow: the client creates a room over HTTP (`POST /api/rooms` with RoomSettings), then opens the WebSocket and sends `join`.
 * The server answers `welcome` (with the secret token used to reconnect) and then pushes `lobby` or `state` after every change.
 * Clients send intents only; the server validates them and sends each client its own `HostView`, so hidden hands never cross the wire.
 *
 * Between rounds (score screen) a player may `propose` one match option change; every human player must `vote` yes within 60 s.
 */
import type { Action, Bid, BonusKind, ContractId, ContraTarget, HostView, OptionChange, Suit } from '@tarok/engine';

export const PROTOCOL_VERSION = 1;
export const MAX_MESSAGE_CHARS = 4096;
export const MAX_NAME = 20;

export type { OptionChange };

// ---------------------------------------------------------------------------------------------
// Rooms

export interface RoomSettings {
  /** Regular players including bots (2 to 8). Two players get two dummies, three get one. */
  players: number;
  /** `none` = no win condition (unlimited rounds). */
  winKind: 'rounds' | 'targetScore' | 'timeLimit' | 'none';
  /** Rounds, points or minutes depending on `winKind` (ignored for `none`). */
  winValue: number;
  failSafeMinutes: number | null;
  infiniteContra: boolean;
  /** Slovenian method allowed in bidding. Missing = yes. */
  slovenian?: boolean;
  /** Bonuses enabled (declaring and scoring). Missing = yes. */
  bonuses?: boolean;
  /** Time reserve per player (card viewing, bidding, play). Off = no clocks. */
  timers: boolean;
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4,8}$/;

export const isRoomCode = (s: string): boolean => ROOM_CODE_RE.test(s);

/** `randomInt(n)` must return an integer in 0..n-1 (the server passes a crypto-based one). */
export function generateRoomCode(randomInt: (n: number) => number, length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ROOM_CODE_CHARS[randomInt(ROOM_CODE_CHARS.length)]!;
  return out;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);

export function validateSettings(x: unknown): RoomSettings | null {
  if (!isObj(x)) return null;
  const { players, winKind, winValue, failSafeMinutes, infiniteContra, timers, slovenian, bonuses } = x;
  if (!isInt(players) || players < 2 || players > 8) return null;
  if (winKind !== 'rounds' && winKind !== 'targetScore' && winKind !== 'timeLimit' && winKind !== 'none') return null;
  if (!isInt(winValue) || winValue < 1 || winValue > 10_000) return null;
  if (failSafeMinutes !== null && (!isInt(failSafeMinutes) || failSafeMinutes < 1 || failSafeMinutes > 1000)) return null;
  if (typeof infiniteContra !== 'boolean' || typeof timers !== 'boolean') return null;
  if (slovenian !== undefined && typeof slovenian !== 'boolean') return null;
  if (bonuses !== undefined && typeof bonuses !== 'boolean') return null;
  return {
    players, winKind, winValue, failSafeMinutes, infiniteContra, timers,
    ...(slovenian === undefined ? {} : { slovenian }),
    ...(bonuses === undefined ? {} : { bonuses }),
  };
}

/** Rebuilds a clean OptionChange from untrusted JSON, or null. */
export function parseOptionChange(x: unknown): OptionChange | null {
  if (!isObj(x)) return null;
  const key = x.key;
  switch (key) {
    case 'slovenian':
    case 'bonuses':
    case 'infiniteContra':
      return typeof x.value === 'boolean' ? { key, value: x.value } : null;
    case 'win': {
      const kind = x.kind;
      if (kind !== 'rounds' && kind !== 'targetScore' && kind !== 'timeLimit' && kind !== 'none') return null;
      if (!isInt(x.value) || x.value < 1 || x.value > 10_000) return null;
      return { key: 'win', kind, value: x.value };
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Client -> server

export type ClientMessage =
  | { t: 'join'; v: number; name: string; token?: string }
  | { t: 'act'; action: Action }
  | { t: 'ready' }
  | { t: 'next' }
  /** Score screen only, human players only: propose changing one match option. */
  | { t: 'propose'; change: OptionChange }
  /** Answer to the running proposal. */
  | { t: 'vote'; approve: boolean }
  /** Host only, lobby only: make a seat a bot or open it for a player. */
  | { t: 'slot'; index: number; kind: 'open' | 'bot' }
  /** Host only. */
  | { t: 'start' }
  | { t: 'ping' };

const SUITS: readonly Suit[] = ['spades', 'clubs', 'diamonds', 'hearts'];
const KING_CHOICES = ['giveUp', 'playAlone', 'switchToDreier'] as const;

const isCards = (x: unknown): x is number[] =>
  Array.isArray(x) && x.length <= 6 && x.every((c) => isInt(c) && c >= 0 && c < 54);

/** Rebuilds a clean Action from untrusted JSON (extra fields are dropped), or null. `forfeit` is never accepted from a client. */
export function parseAction(x: unknown): Action | null {
  if (!isObj(x)) return null;
  switch (x.type) {
    case 'pass': return { type: 'pass' };
    case 'confirm': return { type: 'confirm' };
    case 'noContra': return { type: 'noContra' };
    case 'bid': {
      const b = x.bid;
      if (!isObj(b) || typeof b.contract !== 'string' || !isInt(b.take) || !Array.isArray(b.bonuses)) return null;
      if (b.bonuses.length > 9 || !b.bonuses.every((k) => typeof k === 'string')) return null;
      const bid: Bid = { contract: b.contract as ContractId, take: b.take, bonuses: [...(b.bonuses as BonusKind[])] };
      return { type: 'bid', bid };
    }
    case 'declare': {
      if (!Array.isArray(x.bonuses) || x.bonuses.length > 9 || !x.bonuses.every((k) => typeof k === 'string')) return null;
      if (typeof x.valat !== 'boolean') return null;
      return { type: 'declare', bonuses: [...(x.bonuses as BonusKind[])], valat: x.valat };
    }
    case 'contra':
      return typeof x.target === 'string' ? { type: 'contra', target: x.target as ContraTarget } : null;
    case 'callKing':
      return SUITS.includes(x.suit as Suit) ? { type: 'callKing', suit: x.suit as Suit } : null;
    case 'kingInTalon':
      return (KING_CHOICES as readonly unknown[]).includes(x.choice) ? { type: 'kingInTalon', choice: x.choice as (typeof KING_CHOICES)[number] } : null;
    case 'take': return isCards(x.cards) ? { type: 'take', cards: [...x.cards] } : null;
    case 'discard': return isCards(x.cards) ? { type: 'discard', cards: [...x.cards] } : null;
    case 'play': return isInt(x.card) && x.card >= 0 && x.card < 54 ? { type: 'play', card: x.card } : null;
    default: return null;
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_CHARS) return null;
  let x: unknown;
  try {
    x = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(x)) return null;
  switch (x.t) {
    case 'join': {
      if (typeof x.name !== 'string') return null;
      if (x.token !== undefined && (typeof x.token !== 'string' || x.token.length > 100)) return null;
      const join: Extract<ClientMessage, { t: 'join' }> = { t: 'join', v: isInt(x.v) ? x.v : 0, name: x.name.slice(0, 100) };
      if (typeof x.token === 'string') join.token = x.token;
      return join;
    }
    case 'act': {
      const action = parseAction(x.action);
      return action ? { t: 'act', action } : null;
    }
    case 'propose': {
      const change = parseOptionChange(x.change);
      return change ? { t: 'propose', change } : null;
    }
    case 'vote': return typeof x.approve === 'boolean' ? { t: 'vote', approve: x.approve } : null;
    case 'ready': return { t: 'ready' };
    case 'next': return { t: 'next' };
    case 'start': return { t: 'start' };
    case 'ping': return { t: 'ping' };
    case 'slot':
      return isInt(x.index) && x.index >= 0 && x.index < 8 && (x.kind === 'open' || x.kind === 'bot')
        ? { t: 'slot', index: x.index, kind: x.kind }
        : null;
    default: return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Server -> client

export interface You {
  /** Seat holder's participant index, or null when watching. */
  participant: number | null;
  owner: boolean;
}

export interface SlotInfo {
  kind: 'open' | 'human' | 'bot' | 'dummy';
  name: string | null;
  connected: boolean;
  owner: boolean;
}

export interface LobbyMessage {
  t: 'lobby';
  code: string;
  you: You;
  settings: RoomSettings;
  slots: SlotInfo[];
}

/** The running option vote. Every human player has to approve; any rejection or the end of the time ends it. */
export interface VoteInfo {
  proposer: number;
  change: OptionChange;
  /** Time left when the message was sent. */
  msLeft: number;
  /** Participant -> answer so far. */
  votes: Record<number, boolean>;
}

export interface VoteResult {
  change: OptionChange;
  passed: boolean;
}

export interface StateMessage {
  t: 'state';
  you: You;
  /** The current room options (they change when a vote passes). */
  settings: RoomSettings;
  /** This participant's view of the game (hidden hands never appear in it). */
  view: HostView;
  /** Display names per participant; null for bots and dummies (the client names them). */
  names: (string | null)[];
  /** False for a human who is offline (a bot plays for them after a short delay). */
  connected: boolean[];
  /** Participants who pressed "next round". */
  nextVotes: number[];
  /** The running option vote, if any. */
  vote: VoteInfo | null;
  /** Outcome of the last vote, shown until the next round starts. */
  voteResult: VoteResult | null;
}

export type ErrorCode =
  | 'bad_message' | 'bad_version' | 'not_owner' | 'illegal' | 'seats_not_filled' | 'room_not_found' | 'replaced';

export type ServerMessage =
  | { t: 'welcome'; v: number; code: string; token: string; you: You }
  | LobbyMessage
  | StateMessage
  | { t: 'error'; code: ErrorCode; message: string }
  | { t: 'pong' };

const SERVER_TYPES = new Set(['welcome', 'lobby', 'state', 'error', 'pong']);

/** The client trusts its own server; this only checks the envelope. */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const x: unknown = JSON.parse(raw);
    return isObj(x) && typeof x.t === 'string' && SERVER_TYPES.has(x.t) ? (x as unknown as ServerMessage) : null;
  } catch {
    return null;
  }
}
