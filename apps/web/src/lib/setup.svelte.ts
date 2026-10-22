/** The last local-game setup (remembered) and the one the game screen is about to use. */
export interface GameSetup {
  /** Regular players including you (2 to 8). Two players get two dummies, three get one, more than four take turns at the table. */
  players: number;
  /** `none` = no win condition (unlimited rounds). */
  winKind: 'rounds' | 'targetScore' | 'timeLimit' | 'none';
  /** Rounds, points or minutes depending on `winKind`. */
  winValue: number;
  /** Also end (after the current round) when this many minutes have passed. */
  failSafeMinutes: number | null;
  infiniteContra: boolean;
  /** Slovenian method (bidding with fewer Talon cards). */
  slovenian: boolean;
  /** Bonuses (declaring and scoring). */
  bonuses: boolean;
  /** Card-viewing, licitation and bank clocks (human players only). */
  timers: boolean;
}

const KEY = 'tarok.setup';
const defaults = (): GameSetup => ({
  players: 4, winKind: 'rounds', winValue: 8, failSafeMinutes: null, infiniteContra: false, slovenian: true, bonuses: true, timers: true,
});

function load(): GameSetup {
  try {
    return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<GameSetup>) };
  } catch {
    return defaults();
  }
}

export const setup = $state<GameSetup>(load());

$effect.root(() => {
  $effect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify($state.snapshot(setup)));
    } catch {
      /* ignore */
    }
  });
});
