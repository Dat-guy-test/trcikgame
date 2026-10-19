/** 125000 -> "2:05" (rounds up so a running clock never shows 0:00 early). */
export function mmss(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '';
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
