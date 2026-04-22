// Thin wrapper around navigator.vibrate — graceful no-op where unsupported
// (most desktops) without forcing callers to guard every call.

export function supported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function buzz(pattern: number | number[]): void {
  if (!supported()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw if called from a non-user-gesture context. Ignore.
  }
}

export function stop(): void {
  if (!supported()) return;
  try { navigator.vibrate(0); } catch { /* ignore */ }
}

/** Beat-tick presets. */
export const PATTERNS = {
  beat:     12,                 // soft off-beat tick
  downbeat: 30,                 // accented beat 1
  section:  [40, 60, 40, 60, 40], // triple-buzz on section boundary
} as const;
