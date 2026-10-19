/** UI strings. The engine emits codes (contract ids, phases, action types); only the UI turns them into words. */
import en from './locales/en';
import type { Lang } from './settings.svelte';
import { settings } from './settings.svelte';

export type Key = keyof typeof en;
type Dict = Record<Key, string>;

let dict = $state.raw<Dict>(en);

export function t(key: Key, params?: Record<string, string | number>): string {
  let s = dict[key] ?? en[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Loads a dictionary on demand (Polish is a separate chunk). */
export async function loadLang(lang: Lang): Promise<void> {
  dict = lang === 'pl' ? (await import('./locales/pl')).default : en;
  settings.lang = lang;
  document.documentElement.lang = lang;
}
