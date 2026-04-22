import type { Song } from '../music/types';
import { CHORD_LIB } from '../music/chords';
import { ChordBox } from '../components/ChordBox';

interface RhythmViewProps {
  song: Song;
  beat: number;
  beatPhase: number;
  chordSize: 'lg' | 'xl' | 'xxl';
  encoding?: 'color' | 'pattern';
  onOpenCloseup: () => void;
}

function chordForBeat(song: Song, beat: number) {
  const barIdx = Math.floor(beat / song.beatsPerBar);
  const bar = song.bars[Math.min(barIdx, song.bars.length - 1)];
  return bar?.chord ?? 'Am';
}

function sectionForBar(song: Song, barIdx: number) {
  let current = song.sections[0];
  for (const s of song.sections) {
    if (s.barOffset <= barIdx) current = s;
  }
  return current;
}

export function RhythmView({ song, beat, beatPhase, chordSize, encoding = 'color', onOpenCloseup }: RhythmViewProps) {
  const totalBeats = song.bars.length * song.beatsPerBar;
  const clampedBeat = Math.min(beat, totalBeats - 1);
  const barIdx = Math.floor(clampedBeat / song.beatsPerBar);
  const beatInBar = clampedBeat % song.beatsPerBar;

  const currentChordName = chordForBeat(song, clampedBeat);
  const nextChordName = chordForBeat(song, clampedBeat + (song.beatsPerBar - beatInBar));
  const beatsUntilNext = song.beatsPerBar - beatInBar;

  const currentChord = CHORD_LIB[currentChordName] ?? CHORD_LIB.Am;
  const nextChord = CHORD_LIB[nextChordName] ?? CHORD_LIB.Am;

  const section = sectionForBar(song, barIdx);
  const onBeat = beatPhase < 0.25;

  const nextSize = chordSize === 'xxl' ? 'xl' : chordSize === 'xl' ? 'lg' : 'md';

  return (
    <div className="w1">
      <div className="w1-header">
        <div>
          <span className="gg-pill">{section.name}</span>
          <span style={{ marginLeft: 12 }}>bar {barIdx + 1} of {song.bars.length}</span>
        </div>
        <div>♩ = {song.bpm}</div>
      </div>

      <div className="w1-stage">
        <div className={`w1-now${onBeat ? ' on-beat' : ''}`} aria-live="polite">
          <div className="label">NOW</div>
          <button
            className="gg-closeup-opener"
            onClick={onOpenCloseup}
            aria-label={`Open close-up for ${currentChord.name}`}>
            <ChordBox chord={currentChord} size={chordSize} encoding={encoding} />
            <span className="gg-tap-hint">tap to zoom ⤢</span>
          </button>
          <div className="w1-beatdots" aria-hidden="true">
            {Array.from({ length: song.beatsPerBar }).map((_, i) => (
              <span
                key={i}
                className={[
                  'dot',
                  i === 0 ? 'downbeat' : '',
                  i === beatInBar && beatPhase < 0.5 ? 'active' : '',
                ].filter(Boolean).join(' ')}
              />
            ))}
          </div>
        </div>
        <div className="w1-next">
          <div className="label">Next ↓</div>
          <ChordBox chord={nextChord} size={nextSize} encoding={encoding} />
          <div style={{ fontSize: 22, color: 'var(--ink-mute)', marginTop: 12, fontWeight: 700 }}>
            in {beatsUntilNext} beat{beatsUntilNext === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div style={{ color: 'var(--ink-mute)', fontSize: 16, fontWeight: 700, textAlign: 'center' }}>
        Rhythm mode · strum on the accented downbeat · colours show the recommended fingering
      </div>
    </div>
  );
}
