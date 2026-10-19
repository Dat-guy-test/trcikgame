/**
 * Round state machine: (state, actor, action) -> state.
 * Pure and deterministic; the only randomness is the seeded deal. See docs/rules.md.
 *
 * Flow: bidding -> declare -> contra -> kingCall -> kingInTalon -> take -> discard -> play -> done
 * (phases that do not apply to a contract are skipped; Trischaken goes straight to play).
 */
import { SUITS, isTarock, points, suitCard, type CardId, type Suit } from './cards';
import { deal } from './deal';
import { outbids, outbidsOwnBid, leftBehind, type Bid } from './bidding';
import { CONTRACTS, allowedBonuses, isNegative, valatAllowed, type ContractDef } from './contracts';
import { finishForfeit, finishGaveUp, finishPlayed, finishReshuffle, finishTrischaken } from './evaluate';
import type { BonusKind } from './scoring';
import {
  BANK_PHASES, isRegular, regularSeatsFrom,
  type ContraTarget, type RoundConfig, type RoundState,
} from './state';
import { legalPlays, trickWinnerIndex } from './tricks';

export type Action =
  | { type: 'pass' }
  | { type: 'bid'; bid: Bid }
  | { type: 'confirm' }
  | { type: 'declare'; bonuses: BonusKind[]; valat: boolean }
  | { type: 'contra'; target: ContraTarget }
  | { type: 'noContra' }
  | { type: 'callKing'; suit: Suit }
  | { type: 'kingInTalon'; choice: 'giveUp' | 'playAlone' | 'switchToDreier' }
  | { type: 'take'; cards: CardId[] }
  | { type: 'discard'; cards: CardId[] }
  | { type: 'play'; card: CardId }
  /** Host-issued when the declarer's bank runs out in a 1v3 game. */
  | { type: 'forfeit' };

export class IllegalAction extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalAction';
  }
}

const illegal = (msg: string): never => {
  throw new IllegalAction(msg);
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function need<T extends Action['type']>(a: Action, t: T): Extract<Action, { type: T }> {
  if (a.type !== t) illegal(`expected ${t}, got ${a.type}`);
  return a as Extract<Action, { type: T }>;
}

const defOf = (s: RoundState): ContractDef => CONTRACTS[s.contract!];
const regularCount = (cfg: RoundConfig): number => cfg.seatKinds.filter((k) => k === 'player').length;

export function newRound(config: RoundConfig): RoundState {
  if (config.seatKinds.length !== 4) throw new Error('exactly 4 seats are required');
  if (config.seatKinds.filter((k) => k === 'player').length < 2) {
    throw new Error('at least 2 regular players are required');
  }
  if (!isRegular(config, config.startingPlayer)) throw new Error('the starting player must be a regular player');
  const d = deal(config.seed);
  return {
    config: clone(config),
    phase: 'bidding',
    hands: d.hands.map((h) => [...h]),
    talon: d.talon.map((p) => [...p]),
    talonRevealed: false,
    talonSeen: null,
    currentBid: null,
    bidder: null,
    toAct: regularSeatsFrom(config, config.startingPlayer),
    awaitingConfirm: false,
    contract: null,
    take: 0,
    declarer: null,
    declaredBonuses: [],
    declaredValat: false,
    contra: null,
    calledKing: null,
    alone: false,
    partner: null,
    declarerExtra: [],
    defenderExtra: [],
    leader: config.startingPlayer,
    trick: [],
    tricks: [],
    ouvertRevealed: false,
    trischakenController: config.startingPlayer,
    result: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Who acts

/** Who decides for `seat` when it is that seat's turn to play a card. Dummies are controlled. */
export function controllerOf(s: RoundState, seat: number): number {
  if (isRegular(s.config, seat)) return seat;
  if (s.contract === 'trischaken') return s.trischakenController;
  const def = defOf(s);
  if (regularCount(s.config) === 2) {
    // 2 players: the other player controls every dummy of the opposing side. In a 1v3 game that is all of them;
    // in a called-king game the teams are known at once and each player controls the dummy on their own team.
    const other = regularSeatsFrom(s.config, s.declarer! + 1).find((x) => x !== s.declarer)!;
    return def.calledKing && !s.alone && s.partner === seat ? s.declarer! : other;
  }
  if (def.calledKing) return s.declarer!;
  // First playing opponent of the declarer.
  const first = regularSeatsFrom(s.config, s.declarer! + 1).find((x) => x !== s.declarer);
  return first!;
}

/** The seat that must act now, or null when the round is over. */
export function expectedActor(s: RoundState): number | null {
  switch (s.phase) {
    case 'bidding':
      return s.awaitingConfirm ? s.bidder : (s.toAct[0] ?? null);
    case 'contra':
      return s.contra!.toAct[0] ?? null;
    case 'declare':
    case 'kingCall':
    case 'kingInTalon':
    case 'take':
    case 'discard':
      return s.declarer;
    case 'play':
      return controllerOf(s, (s.leader + s.trick.length) % 4);
    case 'done':
      return null;
  }
}

/** Seat whose card is played next (differs from the actor when a dummy is played). */
export function seatToPlay(s: RoundState): number {
  return (s.leader + s.trick.length) % 4;
}

/** The declarer plays alone against three opponents (1v3 contract, or a called king held by the declarer). */
export function effectiveOneVsThree(s: RoundState): boolean {
  return s.declarer !== null && (defOf(s).teams === 'oneVsThree' || s.alone);
}

// ---------------------------------------------------------------------------------------------
// Transitions

function startPlay(s: RoundState): void {
  s.phase = 'play';
  s.leader = s.declarer ?? s.config.startingPlayer;
  s.trick = [];
}

function revealTalon(s: RoundState): void {
  s.talonRevealed = true;
  s.talonSeen ??= s.talon.map((p) => [...p]);
}

function enterTalonStage(s: RoundState): void {
  const def = defOf(s);
  if (isNegative(def)) {
    startPlay(s); // Talon stays hidden and unused
    return;
  }
  revealTalon(s);
  if (def.take > 0) {
    s.phase = 'take';
    return;
  }
  s.defenderExtra.push(...s.talon.flat());
  s.talon = [[], []];
  startPlay(s);
}

function afterLicitation(s: RoundState): void {
  if (defOf(s).calledKing) s.phase = 'kingCall';
  else enterTalonStage(s);
}

const nonDeclarerRegulars = (s: RoundState): number[] =>
  regularSeatsFrom(s.config, s.declarer! + 1).filter((x) => x !== s.declarer);

const maxContraLevel = (s: RoundState): number => (s.config.infiniteContra ? Number.POSITIVE_INFINITY : 4);

/** Items the given side may raise next: opponents raise even levels, the declarer odd levels. */
export function raiseableItems(s: RoundState, side: 'opp' | 'decl'): string[] {
  const levels = s.contra?.levels ?? {};
  return Object.keys(levels).filter((k) => {
    const lv = levels[k]!;
    return lv < maxContraLevel(s) && (side === 'opp' ? lv % 2 === 0 : lv % 2 === 1);
  });
}

function enterContra(s: RoundState): void {
  if (!defOf(s).contra) {
    afterLicitation(s);
    return;
  }
  const levels: Record<string, number> = { contract: 0 };
  for (const b of s.declaredBonuses) levels[b] = 0;
  if (s.declaredValat) levels.valat = 0;
  s.contra = { levels, side: 'opp', toAct: nonDeclarerRegulars(s) };
  s.phase = 'contra';
}

function endContra(s: RoundState): void {
  s.contra!.toAct = [];
  afterLicitation(s);
}

function finishBidding(s: RoundState): void {
  const bid = s.currentBid!;
  s.contract = bid.contract;
  s.take = bid.take;
  s.declarer = s.bidder;
  s.declaredBonuses = [...bid.bonuses];
  if (defOf(s).bonuses !== 'none') s.phase = 'declare';
  else enterContra(s);
}

function startTrischaken(s: RoundState): void {
  s.contract = 'trischaken';
  s.declarer = null;
  s.trischakenController = s.config.startingPlayer;
  startPlay(s);
}

function setBid(s: RoundState, seat: number, bid: Bid): void {
  s.currentBid = bid;
  s.bidder = seat;
  s.toAct = regularSeatsFrom(s.config, seat + 1).filter((x) => x !== seat);
  s.awaitingConfirm = false;
}

function applyBidding(s: RoundState, actor: number, action: Action): void {
  const isSP = actor === s.config.startingPlayer;
  if (s.awaitingConfirm) {
    if (action.type === 'confirm') return finishBidding(s);
    const a = need(action, 'bid');
    if (!outbidsOwnBid(s.currentBid!, a.bid, isSP)) illegal('a player may only raise their own bid to a higher value');
    return setBid(s, actor, a.bid);
  }
  if (action.type === 'pass') {
    s.toAct.shift();
    if (s.toAct.length === 0) {
      if (s.currentBid === null) startTrischaken(s);
      else s.awaitingConfirm = true;
    }
    return;
  }
  const a = need(action, 'bid');
  if (!outbids(s.currentBid, a.bid, isSP)) illegal('bid does not outbid the current bid');
  setBid(s, actor, a.bid);
}

function applyDeclare(s: RoundState, action: Action): void {
  const a = need(action, 'declare');
  const def = defOf(s);
  const allowed = allowedBonuses(def);
  if (a.bonuses.some((b) => !allowed.includes(b))) illegal('bonus not available in this contract');
  if (a.valat && !valatAllowed(def)) illegal('Valat not available in this contract');
  s.declaredBonuses = [...new Set([...s.declaredBonuses, ...a.bonuses])];
  s.declaredValat = a.valat;
  enterContra(s);
}

function applyContra(s: RoundState, action: Action): void {
  const c = s.contra!;
  if (action.type === 'noContra') {
    c.toAct.shift();
    if (c.toAct.length === 0) endContra(s);
    return;
  }
  const a = need(action, 'contra');
  if (!raiseableItems(s, c.side).includes(a.target)) illegal('this side cannot raise that item now');
  c.levels[a.target]! += 1;
  c.side = c.side === 'opp' ? 'decl' : 'opp';
  c.toAct = c.side === 'decl' ? [s.declarer!] : nonDeclarerRegulars(s);
  if (raiseableItems(s, c.side).length === 0) endContra(s);
}

function applyKingCall(s: RoundState, action: Action): void {
  const a = need(action, 'callKing');
  if (!SUITS.includes(a.suit)) illegal('unknown suit');
  s.calledKing = a.suit;
  const king = suitCard(a.suit, 7);
  if (s.hands[s.declarer!]!.includes(king)) {
    s.alone = true;
    enterTalonStage(s);
    return;
  }
  if (regularCount(s.config) === 2) {
    // 2 players: teams are revealed at once. The other player's king means a reshuffle; a dummy's king makes it the partner.
    const holder = s.hands.findIndex((h) => h.includes(king));
    if (holder >= 0 && isRegular(s.config, holder)) {
      s.result = finishReshuffle(s);
      s.phase = 'done';
      return;
    }
    if (holder >= 0) s.partner = holder;
  }
  if (s.talon.flat().includes(king)) {
    revealTalon(s);
    s.phase = 'kingInTalon';
  } else {
    enterTalonStage(s);
  }
}

function applyKingInTalon(s: RoundState, action: Action): void {
  const a = need(action, 'kingInTalon');
  if (a.choice === 'giveUp') {
    s.result = finishGaveUp(s);
    s.phase = 'done';
  } else if (a.choice === 'playAlone') {
    s.alone = true;
    enterTalonStage(s);
  } else {
    s.contract = 'dreier';
    s.take = CONTRACTS.dreier.take;
    const allowed = allowedBonuses(CONTRACTS.dreier);
    s.declaredBonuses = s.declaredBonuses.filter((b) => allowed.includes(b));
    s.contra = null;
    enterTalonStage(s);
  }
}

/** Is `cards` a legal set to take from the revealed Talon (RULES: cards left behind come from one pile first)? */
export function isValidTake(s: RoundState, cards: readonly CardId[]): boolean {
  if (new Set(cards).size !== cards.length || cards.length !== s.take) return false;
  const [p0, p1] = s.talon as [CardId[], CardId[]];
  if (!cards.every((c) => p0.includes(c) || p1.includes(c))) return false;
  const { fromA, fromB } = leftBehind(s.contract!, s.take);
  const left0 = p0.length - cards.filter((c) => p0.includes(c)).length;
  const left1 = p1.length - cards.filter((c) => p1.includes(c)).length;
  return (left0 === fromA && left1 === fromB) || (left1 === fromA && left0 === fromB);
}

function applyTake(s: RoundState, action: Action): void {
  const a = need(action, 'take');
  if (!isValidTake(s, a.cards)) illegal('invalid Talon take');
  const all = s.talon.flat();
  s.hands[s.declarer!]!.push(...a.cards);
  s.defenderExtra.push(...all.filter((c) => !a.cards.includes(c)));
  s.talon = [[], []];
  s.phase = 'discard';
}

/** Discard rules: only cards worth less than 5 points; in Farben, 1-point tarocks must go first. */
export function discardRules(s: RoundState): { eligible: CardId[]; requiredTarocks: number } {
  const hand = s.hands[s.declarer!]!;
  const eligible = hand.filter((c) => points(c) < 5);
  const requiredTarocks = defOf(s).farben ? Math.min(s.take, eligible.filter(isTarock).length) : 0;
  return { eligible, requiredTarocks };
}

export function isValidDiscard(s: RoundState, cards: readonly CardId[]): boolean {
  if (new Set(cards).size !== cards.length || cards.length !== s.take) return false;
  const { eligible, requiredTarocks } = discardRules(s);
  if (!cards.every((c) => eligible.includes(c))) return false;
  return !defOf(s).farben || cards.filter(isTarock).length === requiredTarocks;
}

function applyDiscard(s: RoundState, action: Action): void {
  const a = need(action, 'discard');
  if (!isValidDiscard(s, a.cards)) illegal('invalid discard');
  const hand = s.hands[s.declarer!]!;
  s.hands[s.declarer!] = hand.filter((c) => !a.cards.includes(c));
  s.declarerExtra.push(...a.cards);
  startPlay(s);
}

export function playRules(s: RoundState): { farben: boolean; negative: boolean } {
  const def = defOf(s);
  return { farben: def.farben, negative: isNegative(def) };
}

function applyPlay(s: RoundState, action: Action): void {
  const a = need(action, 'play');
  const seat = seatToPlay(s);
  const hand = s.hands[seat]!;
  if (!legalPlays(hand, s.trick, playRules(s)).includes(a.card)) illegal('card is not a legal play');
  s.hands[seat] = hand.filter((c) => c !== a.card);
  s.trick.push({ player: seat, card: a.card });

  const def = defOf(s);
  if (def.calledKing && s.calledKing && !s.alone && a.card === suitCard(s.calledKing, 7) && seat !== s.declarer) {
    s.partner = seat;
  }
  if (s.trick.length < 4) return;

  const idx = trickWinnerIndex(s.trick, def.farben);
  const winner = s.trick[idx]!.player;
  s.tricks.push({ leader: s.leader, plays: s.trick, winner, winningCard: s.trick[idx]!.card });
  s.trick = [];
  s.leader = winner;
  if (s.contract === 'trischaken' && isRegular(s.config, winner)) s.trischakenController = winner;
  if (s.tricks.length === 1 && def.ouvert) s.ouvertRevealed = true;

  let over = s.tricks.length === 12;
  if (def.negativeTricks !== null) {
    over ||= s.tricks.filter((t) => t.winner === s.declarer).length > def.negativeTricks;
  }
  if (over) {
    s.result = s.contract === 'trischaken' ? finishTrischaken(s) : finishPlayed(s);
    s.phase = 'done';
  }
}

function forfeit(s: RoundState, actor: number): RoundState {
  if (!BANK_PHASES.includes(s.phase)) illegal('forfeit is only possible on bank time');
  if (actor !== s.declarer || expectedActor(s) !== actor) illegal('only the declarer whose bank ran out can forfeit');
  if (!effectiveOneVsThree(s)) illegal('forfeit only applies to 1v3 games');
  s.result = finishForfeit(s);
  s.phase = 'done';
  return s;
}

export function apply(state: RoundState, actor: number, action: Action): RoundState {
  if (state.phase === 'done') illegal('the round is over');
  const s = clone(state);
  if (action.type === 'forfeit') return forfeit(s, actor);
  const expected = expectedActor(s);
  if (actor !== expected) illegal(`seat ${actor} is not to act (expected ${String(expected)})`);
  switch (s.phase) {
    case 'bidding': applyBidding(s, actor, action); break;
    case 'declare': applyDeclare(s, action); break;
    case 'contra': applyContra(s, action); break;
    case 'kingCall': applyKingCall(s, action); break;
    case 'kingInTalon': applyKingInTalon(s, action); break;
    case 'take': applyTake(s, action); break;
    case 'discard': applyDiscard(s, action); break;
    case 'play': applyPlay(s, action); break;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Legal actions (server side; bots will move to per-player views later)

const BONUS_SINGLETONS = (def: ContractDef): BonusKind[][] => allowedBonuses(def).map((b) => [b]);

const ALL_BIDS: readonly Bid[] = Object.values(CONTRACTS)
  .filter((d) => d.biddable)
  .flatMap((d) => {
    const takes = d.take === 0 ? [0] : Array.from({ length: d.take }, (_, i) => i + 1);
    const bonusSets: BonusKind[][] = d.needsBonusDeclaration ? BONUS_SINGLETONS(d) : [[]];
    return takes.flatMap((take) => bonusSets.map((bonuses) => ({ contract: d.id, take, bonuses })));
  });

export interface LegalAction {
  actor: number;
  action: Action;
}

/**
 * All legal actions for the seat to act. Exceptions: `declare` offers none / one bonus / Valat,
 * and `discard` offers one canonical choice (any valid subset is accepted by `apply`).
 */
export function legalActions(s: RoundState): LegalAction[] {
  const actor = expectedActor(s);
  if (actor === null) return [];
  const out: LegalAction[] = [];
  const add = (action: Action) => out.push({ actor, action });
  const def = s.contract ? defOf(s) : null;

  switch (s.phase) {
    case 'bidding': {
      const isSP = actor === s.config.startingPlayer;
      if (s.awaitingConfirm) {
        add({ type: 'confirm' });
        for (const bid of ALL_BIDS) if (outbidsOwnBid(s.currentBid!, bid, isSP)) add({ type: 'bid', bid: clone(bid) });
      } else {
        add({ type: 'pass' });
        for (const bid of ALL_BIDS) if (outbids(s.currentBid, bid, isSP)) add({ type: 'bid', bid: clone(bid) });
      }
      break;
    }
    case 'declare': {
      add({ type: 'declare', bonuses: [], valat: false });
      for (const b of allowedBonuses(def!)) {
        if (!s.declaredBonuses.includes(b)) add({ type: 'declare', bonuses: [b], valat: false });
      }
      if (valatAllowed(def!)) add({ type: 'declare', bonuses: [], valat: true });
      break;
    }
    case 'contra': {
      add({ type: 'noContra' });
      for (const target of raiseableItems(s, s.contra!.side)) add({ type: 'contra', target: target as ContraTarget });
      break;
    }
    case 'kingCall':
      for (const suit of SUITS) add({ type: 'callKing', suit });
      break;
    case 'kingInTalon':
      for (const choice of ['giveUp', 'playAlone', 'switchToDreier'] as const) add({ type: 'kingInTalon', choice });
      break;
    case 'take': {
      const cards = s.talon.flat();
      for (let mask = 1; mask < 1 << cards.length; mask++) {
        const subset = cards.filter((_, i) => (mask >> i) & 1);
        if (subset.length === s.take && isValidTake(s, subset)) add({ type: 'take', cards: subset });
      }
      break;
    }
    case 'discard': {
      const { eligible, requiredTarocks } = discardRules(s);
      const sorted = [...eligible].sort((a, b) => points(a) - points(b) || a - b);
      const tarocks = sorted.filter(isTarock).slice(0, requiredTarocks);
      const rest = sorted.filter((c) => !tarocks.includes(c) && !(def!.farben && isTarock(c)));
      const pool = def!.farben ? [...tarocks, ...rest] : sorted;
      add({ type: 'discard', cards: pool.slice(0, s.take) });
      break;
    }
    case 'play': {
      const seat = seatToPlay(s);
      for (const card of legalPlays(s.hands[seat]!, s.trick, playRules(s))) add({ type: 'play', card });
      break;
    }
    case 'done':
      break;
  }
  return out;
}

/**
 * Default action when the 20-second licitation clock runs out: pass, confirm the current
 * contract, declare nothing, no contra. Returns null outside licitation (bank time has its own rules).
 */
export function timeoutAction(s: RoundState): LegalAction | null {
  const actor = expectedActor(s);
  if (actor === null) return null;
  switch (s.phase) {
    case 'bidding': return { actor, action: s.awaitingConfirm ? { type: 'confirm' } : { type: 'pass' } };
    case 'declare': return { actor, action: { type: 'declare', bonuses: [], valat: false } };
    case 'contra': return { actor, action: { type: 'noContra' } };
    default: return null;
  }
}

export { BANK_PHASES };
