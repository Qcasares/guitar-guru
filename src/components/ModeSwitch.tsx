import type { PlaybackMode } from '../music/types';

interface ModeSwitchProps {
  mode: PlaybackMode;
  onChange: (mode: PlaybackMode) => void;
}

export function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div className="gg-mode-switch" role="tablist" aria-label="Playback mode">
      <button
        role="tab"
        aria-pressed={mode === 'rhythm'}
        aria-selected={mode === 'rhythm'}
        onClick={() => onChange('rhythm')}>
        Rhythm
      </button>
      <button
        role="tab"
        className="godmode"
        aria-pressed={mode === 'lead'}
        aria-selected={mode === 'lead'}
        onClick={() => onChange('lead')}>
        Lead · GODMODE
      </button>
    </div>
  );
}
