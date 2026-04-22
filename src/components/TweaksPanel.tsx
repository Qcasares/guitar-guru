import type { Density, Theme } from '../music/types';

export type ChordSize = 'md' | 'lg' | 'xl' | 'xxl';

interface TweaksPanelProps {
  theme: Theme;
  density: Density;
  chordSize: ChordSize;
  showLyrics: boolean;
  showFingers: boolean;
  onTheme: (t: Theme) => void;
  onDensity: (d: Density) => void;
  onChordSize: (s: ChordSize) => void;
  onShowLyrics: (v: boolean) => void;
  onShowFingers: (v: boolean) => void;
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'high-contrast', label: 'High-contrast' },
  { id: 'dark', label: 'Dark' },
];

const SIZES: ChordSize[] = ['md', 'lg', 'xl', 'xxl'];

const DENSITIES: Density[] = ['compact', 'normal', 'spacious'];

export function TweaksPanel({
  theme,
  density,
  chordSize,
  showLyrics,
  showFingers,
  onTheme,
  onDensity,
  onChordSize,
  onShowLyrics,
  onShowFingers,
}: TweaksPanelProps) {
  return (
    <div className="gg-card gg-tweaks" aria-label="Display tweaks">
      <h3>Tweaks</h3>

      <label htmlFor="tweak-theme">Theme</label>
      <div className="row" id="tweak-theme" style={{ marginBottom: 14 }}>
        {THEMES.map((t) => (
          <button
            key={t.id}
            className="toggle"
            aria-pressed={theme === t.id}
            onClick={() => onTheme(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <label htmlFor="tweak-size">Chord size</label>
      <div className="row" id="tweak-size" style={{ marginBottom: 14 }}>
        {SIZES.map((s) => (
          <button
            key={s}
            className="toggle"
            aria-pressed={chordSize === s}
            onClick={() => onChordSize(s)}>
            {s.toUpperCase()}
          </button>
        ))}
      </div>

      <label htmlFor="tweak-density">Layout density</label>
      <div className="row" id="tweak-density" style={{ marginBottom: 14 }}>
        {DENSITIES.map((d) => (
          <button
            key={d}
            className="toggle"
            aria-pressed={density === d}
            onClick={() => onDensity(d)}>
            {d[0].toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      <label>Display</label>
      <div className="row">
        <button className="toggle" aria-pressed={showLyrics} onClick={() => onShowLyrics(!showLyrics)}>
          Lyrics
        </button>
        <button className="toggle" aria-pressed={showFingers} onClick={() => onShowFingers(!showFingers)}>
          Finger colours
        </button>
      </div>
    </div>
  );
}
