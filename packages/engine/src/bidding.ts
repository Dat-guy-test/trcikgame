/** Bid validation and ordering. See docs/rules.md (bidding). */
import { CONTRACTS, allowedBonuses, type ContractId } from './contracts';
import { BONUS_VALUES, type BonusKind } from './scoring';

export interface Bid {
  contract: ContractId;
  /** Cards taken from the Talon. Lower than the contract's default means the Slovenian method. */
  take: number;
  /** Besser Rufer only: the bonuses declared with the bid (at least one). Empty for other contracts. */
  bonuses: readonly BonusKind[];
}

/** Match options that change which bids exist. Undefined means enabled. */
export interface BidOptions {
  /** Slovenian method: bidding with fewer Talon cards. */
  slovenian?: boolean;
  /** Bonuses. Without them Besser Rufer (which needs a declared bonus) cannot be bid. */
  bonuses?: boolean;
}

export const bidOptionsOf = (c: { slovenian?: boolean; bonuses?: boolean }): BidOptions => ({
  slovenian: c.slovenian !== false,
  bonuses: c.bonuses !== false,
});

export function bidValue(b: Bid): number {
  const def = CONTRACTS[b.contract];
  if (!def.needsBonusDeclaration) return def.value;
  return def.value + b.bonuses.reduce((sum, k) => sum + BONUS_VALUES[k].announced, 0);
}

export function defaultBid(contract: ContractId): Bid {
  return { contract, take: CONTRACTS[contract].take, bonuses: [] };
}

/** Returns an error code, or null if the bid is well-formed for this player. */
export function validateBid(b: Bid, isStartingPlayer: boolean, opts: BidOptions = {}): string | null {
  const def = CONTRACTS[b.contract];
  if (!def.biddable) return 'not_biddable';
  if (opts.bonuses === false && def.needsBonusDeclaration) return 'not_biddable';
  if (def.starterOnly && !isStartingPlayer) return 'starting_player_only';
  if (def.take === 0) {
    if (b.take !== 0) return 'invalid_take';
  } else if (!Number.isInteger(b.take) || b.take < 1 || b.take > def.take) {
    return 'invalid_take';
  }
  if (opts.slovenian === false && def.take > 0 && b.take !== def.take) return 'invalid_take';
  if (def.needsBonusDeclaration) {
    if (b.bonuses.length === 0) return 'bonus_declaration_required';
    const allowed = allowedBonuses(def);
    if (new Set(b.bonuses).size !== b.bonuses.length || b.bonuses.some((k) => !allowed.includes(k))) {
      return 'invalid_bonus';
    }
  } else if (b.bonuses.length !== 0) {
    return 'bonus_not_allowed';
  }
  return null;
}

/**
 * Whether `candidate` outbids `current` for a player who is (or is not) the starting player.
 * The confirming last bidder may only raise to a strictly higher *value*; the caller enforces
 * that by using `outbidsOwnBid` instead.
 */
export function outbids(current: Bid | null, candidate: Bid, isStartingPlayer: boolean, opts: BidOptions = {}): boolean {
  if (validateBid(candidate, isStartingPlayer, opts) !== null) return false;
  if (current === null) return true;

  const vNew = bidValue(candidate);
  const vOld = bidValue(current);
  if (vNew > vOld) return true;
  if (vNew < vOld) return false;

  if (candidate.contract === current.contract) {
    if (candidate.take < current.take) return true; // Slovenian method, open to anyone
    if (candidate.take === current.take) return isStartingPlayer; // hold
    return false;
  }
  return isStartingPlayer; // hold with a different contract of equal value
}

/** The last bidder re-raising their own bid: strictly higher value only. */
export function outbidsOwnBid(current: Bid, candidate: Bid, isStartingPlayer: boolean, opts: BidOptions = {}): boolean {
  return validateBid(candidate, isStartingPlayer, opts) === null && bidValue(candidate) > bidValue(current);
}

/**
 * Which cards stay behind when the declarer takes `take` cards (docs/rules.md).
 * Sechsendreier (6 cards): the left-behind cards come from pile A first, then pile B.
 * Returns how many cards are left behind from the chosen pile A and from the other pile B.
 */
export function leftBehind(contract: ContractId, take: number): { fromA: number; fromB: number } {
  const total = CONTRACTS[contract].take;
  if (total === 0 || take < 1 || take > total) throw new Error('invalid take');
  const left = total - take;
  if (total === 3) return { fromA: left, fromB: 3 };
  return { fromA: Math.min(left, 3), fromB: Math.max(0, left - 3) };
}
