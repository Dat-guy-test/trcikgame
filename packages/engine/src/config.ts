/** Match configuration types. See docs/rules.md (match structure and time). */

export type WinCondition =
  | { kind: 'targetScore'; target: number }
  | { kind: 'rounds'; rounds: number }
  | { kind: 'timeLimit'; minutes: number }
  /** No win condition: the match goes on until the players leave (or the optional fail-safe time limit ends it). */
  | { kind: 'none' };

export interface TimerConfig {
  /**
   * The one time reserve every human player has per round. Card viewing, bidding, declarations, contra and card play all
   * draw on it. `'auto'` uses defaultBankSeconds(regularPlayers); `null` switches all clocks off.
   */
  bankSeconds: number | 'auto' | null;
}

export interface MatchConfig {
  regularPlayers: number;
  dummies: number;
  winCondition: WinCondition;
  /** Optional fail-safe: finish the current round after this many minutes, then end the match. */
  failSafeMinutes: number | null;
  /** Continue the contra chain past Mordkontra (x16). */
  infiniteContra: boolean;
  /** Slovenian method (bidding with fewer Talon cards). Default (undefined) = enabled. */
  slovenian?: boolean;
  /** Bonuses (declaring and scoring, Valat included). Default (undefined) = enabled. */
  bonuses?: boolean;
  timers: TimerConfig;
}

export const DEFAULT_TIMERS: TimerConfig = { bankSeconds: 'auto' };

/** 30 min for 2 players, 20 min for 3, 15 min for 4 or more (regular players only). */
export function defaultBankSeconds(regularPlayers: number): number {
  if (regularPlayers <= 2) return 30 * 60;
  if (regularPlayers === 3) return 20 * 60;
  return 15 * 60;
}

export function resolveBankSeconds(cfg: MatchConfig): number | null {
  const b = cfg.timers.bankSeconds;
  return b === 'auto' ? defaultBankSeconds(cfg.regularPlayers) : b;
}
