// User-preference persistence. A single JSON blob in localStorage captures
// every knob worth remembering across reloads — playback state, tweaks,
// accessibility toggles, and last-played bar. Schema is versioned so we can
// break shape later without blowing up on stale payloads.

import type { Density, PlaybackMode, Theme } from '../music/types';
import type { ChordSize } from '../components/TweaksPanel';

const STORAGE_KEY = 'guitarguru.prefs.v2';

export interface Preferences {
  mode: PlaybackMode;
  theme: Theme;
  density: Density;
  chordSize: ChordSize;
  showLyrics: boolean;
  showFingers: boolean;
  showTab: boolean;
  fingerEncoding: 'color' | 'pattern';
  tempoScale: number;
  metronome: boolean;
  voice: boolean;
  synth: boolean;
  countInEnabled: boolean;
  hapticsOn: boolean;
  fingerSonification: boolean;
  loopActive: boolean;
  spotlightOn: boolean;
  lastBar: number;
}

export const DEFAULT_PREFS: Preferences = {
  mode: 'rhythm',
  theme: 'sketch',
  density: 'normal',
  chordSize: 'xl',
  showLyrics: true,
  showFingers: true,
  showTab: true,
  fingerEncoding: 'color',
  tempoScale: 1,
  metronome: true,
  voice: true,
  synth: true,
  countInEnabled: true,
  hapticsOn: false,
  fingerSonification: false,
  loopActive: false,
  spotlightOn: false,
  lastBar: 0,
};

/**
 * Read preferences from localStorage, merging over defaults so fields added
 * in a newer build pick up sane values without a full reset.
 */
export function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

/**
 * Merge-save — callers pass only the fields they changed, we overlay on top
 * of the last-saved payload. Failures are swallowed (private mode, quota).
 */
export function savePreferences(patch: Partial<Preferences>): void {
  try {
    const current = loadPreferences();
    const merged: Preferences = { ...current, ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* storage disabled — fail silently */
  }
}

export function resetPreferences(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
