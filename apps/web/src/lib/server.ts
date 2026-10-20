/** Where the room server lives, and the few HTTP calls the web app makes to it. */
import type { RoomSettings } from '@tarok/protocol';

const KEY = 'tarok.server';
const clean = (s: string): string => s.trim().replace(/\/+$/, '');

/** Address of the room server: what the player typed, else the build-time VITE_SERVER_URL, else localhost in dev. */
export function getServerUrl(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return clean(v);
  } catch {
    /* ignore */
  }
  const env = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';
  return clean(env || (import.meta.env.DEV ? 'http://localhost:8787' : ''));
}

export function setServerUrl(v: string): void {
  try {
    if (v.trim()) localStorage.setItem(KEY, clean(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const wsUrl = (code: string): string => `${getServerUrl().replace(/^http/, 'ws')}/api/rooms/${code}/ws`;

const tokenKey = (code: string) => `tarok.room.${code}`;
export function loadToken(code: string): string | null {
  try {
    return localStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}
export function saveToken(code: string, token: string): void {
  try {
    localStorage.setItem(tokenKey(code), token);
  } catch {
    /* ignore */
  }
}

export async function createRoom(settings: RoomSettings): Promise<{ code: string; token: string }> {
  const res = await fetch(`${getServerUrl()}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error(`server answered ${res.status}`);
  return (await res.json()) as { code: string; token: string };
}

/** true / false, or null when the server cannot be reached. */
export async function roomExists(code: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${getServerUrl()}/api/rooms/${code}/info`);
    return res.ok;
  } catch {
    return null;
  }
}
