/** Keeps the screen on while a game is open (Wake Lock API; silently does nothing where it is missing). */
export function keepAwake(): () => void {
  let lock: WakeLockSentinel | null = null;
  let stopped = false;
  const request = async (): Promise<void> => {
    try {
      if (!stopped && 'wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
    } catch {
      /* denied (battery saver) or unsupported */
    }
  };
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') void request();
  };
  document.addEventListener('visibilitychange', onVisible);
  void request();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => {});
  };
}
