/** Match configuration types. See docs/rules.md (match structure and timers). */

export type WinCondition =
  | { kind: 'targetScore'; target: number }
  | { kind: 'rounds'; rounds: number }
  | { kind: 'timeLimit'; minutes: number };

export interface TimerConfig {
  /** Shared card-viewing time when hands are revealed. */
  viewSeconds: number | null;
  /** Per-decision limit before and during licitation. */
  licitationDecisionSeconds: number | null;
  /** Per-player, per-round bank. `'auto'` uses defaultBankSeconds(regularPlayers). */
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
  timers: TimerConfig;
}

export const DEFAULT_TIMERS: TimerConfig = {
  viewSeconds: 3 * 60,
  licitationDecisionSeconds: 20,
  bankSeconds: 'auto',
};

/** 20 min for 2 players, 15 min for 3, 10 min for 4 or more (regular players only). */
export function defaultBankSeconds(regularPlayers: number): number {
  if (regularPlayers <= 2) return 20 * 60;
  if (regularPlayers === 3) return 15 * 60;
  return 10 * 60;
}

export function resolveBankSeconds(cfg: MatchConfig): number | null {
  const b = cfg.timers.bankSeconds;
  return b === 'auto' ? defaultBankSeconds(cfg.regularPlayers) : b;
}
