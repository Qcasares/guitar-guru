import { BigButton } from './BigButton';

interface PlaybackControlsProps {
  playing: boolean;
  tempoScale: number;
  loopActive: boolean;
  metronome: boolean;
  voice: boolean;
  countIn: boolean;
  synth: boolean;
  haptics: boolean;
  hapticsAvailable: boolean;
  showTab: boolean;
  showTabToggleEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  trackLoaded: boolean;
  trackOn: boolean;
  stretchSupported: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRestart: () => void;
  onTempo: (scale: number) => void;
  onToggleLoop: () => void;
  onToggleMetronome: () => void;
  onToggleVoice: () => void;
  onToggleCountIn: () => void;
  onToggleSynth: () => void;
  onToggleHaptics: () => void;
  onToggleTab: () => void;
  onToggleLoopA: () => void;
  onToggleLoopB: () => void;
  onClearLoopAB: () => void;
  onToggleTrack: () => void;
}

export function PlaybackControls({
  playing,
  tempoScale,
  loopActive,
  metronome,
  voice,
  countIn,
  synth,
  haptics,
  hapticsAvailable,
  showTab,
  showTabToggleEnabled,
  loopA,
  loopB,
  trackLoaded,
  trackOn,
  stretchSupported,
  onPlayPause,
  onPrev,
  onNext,
  onRestart,
  onTempo,
  onToggleLoop,
  onToggleMetronome,
  onToggleVoice,
  onToggleCountIn,
  onToggleSynth,
  onToggleHaptics,
  onToggleTab,
  onToggleLoopA,
  onToggleLoopB,
  onClearLoopAB,
  onToggleTrack,
}: PlaybackControlsProps) {
  const abActive = loopA !== null && loopB !== null && loopA < loopB;
  return (
    <div className="gg-controls" role="toolbar" aria-label="Playback controls">
      <BigButton onClick={onRestart} label="Restart from the beginning" size="lg">⏮</BigButton>
      <BigButton onClick={onPrev} label="Previous bar" size="lg">◀◀</BigButton>
      <BigButton onClick={onPlayPause} active color="var(--accent)" size="xl" label={playing ? 'Pause' : 'Play'}>
        {playing ? '❚❚  PAUSE' : '▶  PLAY'}
      </BigButton>
      <BigButton onClick={onNext} label="Next bar" size="lg">▶▶</BigButton>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0.5, 0.75, 1].map((scale) => (
          <BigButton
            key={scale}
            size="md"
            active={Math.abs(tempoScale - scale) < 0.01}
            color="var(--ink)"
            onClick={() => onTempo(scale)}
            label={`Tempo ${Math.round(scale * 100)} percent`}>
            {scale === 1 ? '1×' : scale === 0.75 ? '¾×' : '½×'}
          </BigButton>
        ))}
      </div>
      <BigButton size="md" active={abActive || loopActive} onClick={onToggleLoop} label="Toggle section loop">
        {abActive ? `A–B loop` : 'LOOP'}
      </BigButton>
      <BigButton
        size="md"
        active={loopA !== null}
        color="var(--accent)"
        onClick={onToggleLoopA}
        label="Set or clear loop A marker">
        {loopA !== null ? `A · bar ${loopA + 1}` : 'A'}
      </BigButton>
      <BigButton
        size="md"
        active={loopB !== null}
        color="var(--accent)"
        onClick={onToggleLoopB}
        label="Set or clear loop B marker">
        {loopB !== null ? `B · bar ${loopB + 1}` : 'B'}
      </BigButton>
      {(loopA !== null || loopB !== null) && (
        <BigButton size="md" onClick={onClearLoopAB} label="Clear loop markers">CLR</BigButton>
      )}
      <BigButton size="md" active={metronome} onClick={onToggleMetronome} label="Toggle metronome">METRO</BigButton>
      <BigButton size="md" active={countIn} onClick={onToggleCountIn} label="Toggle count-in">COUNT-IN</BigButton>
      <BigButton size="md" active={synth} onClick={onToggleSynth} label="Toggle synth playback">♫ SYNTH</BigButton>
      {trackLoaded && (
        <BigButton size="md" active={trackOn} onClick={onToggleTrack} label="Toggle recorded audio track">
          🎵 TRACK
        </BigButton>
      )}
      {trackLoaded && trackOn && Math.abs(tempoScale - 1) > 0.01 && (
        <span
          style={{
            alignSelf: 'center',
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '4px 8px',
            borderRadius: 6,
            border: '2px solid var(--ink)',
            background: stretchSupported ? 'var(--accent-green)' : 'var(--accent-orange)',
            color: '#fff',
          }}
          aria-live="polite">
          {stretchSupported ? 'pitch-stretch' : 'no stretch'}
        </span>
      )}
      <BigButton size="md" active={voice} onClick={onToggleVoice} label="Toggle voice announce">🎙 VOICE</BigButton>
      {hapticsAvailable && (
        <BigButton size="md" active={haptics} onClick={onToggleHaptics} label="Toggle haptic beat pulse">📳 HAPTIC</BigButton>
      )}
      {showTabToggleEnabled && (
        <BigButton size="md" active={showTab} onClick={onToggleTab} label="Show or hide tab staff">TAB</BigButton>
      )}
    </div>
  );
}
