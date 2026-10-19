/** Persistent user settings (localStorage). No accounts. */
export type Lang = 'en' | 'pl';

export interface Settings {
  name: string;
  lang: Lang;
  /** Show the point value on every card. */
  showPoints: boolean;
  /** Four distinct suit colours. */
  colorblind: boolean;
  /** Pause between bot moves in milliseconds (0 = instant). */
  botDelay: number;
}

const KEY = 'tarok.settings';

const defaults = (): Settings => ({
  name: '',
  lang: typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en',
  showPoints: false,
  colorblind: false,
  botDelay: 600,
});

function load(): Settings {
  try {
    return { ...defaults(), ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return defaults();
  }
}

export const settings = $state<Settings>(load());

$effect.root(() => {
  $effect(() => {
    const s = $state.snapshot(settings);
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* private mode: settings just are not remembered */
    }
    const root = document.documentElement;
    root.dataset.cb = s.colorblind ? '1' : '0';
    root.dataset.points = s.showPoints ? '1' : '0';
  });
});
