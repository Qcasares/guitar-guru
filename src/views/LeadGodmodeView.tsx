import { useMemo } from 'react';
import type { Song } from '../music/types';
import { CHORD_LIB } from '../music/chords';
import { ChordBox } from '../components/ChordBox';
import { TabStaff } from '../components/TabStaff';
import { Fretboard, highlightsFromChord, withActiveNote } from '../components/Fretboard';
import { FINGER_NAME } from '../music/finger-colors';

interface LeadGodmodeViewProps {
  song: Song;
  beat: number;
  beatPhase: number;
  chordSize: 'md' | 'lg' | 'xl';
  showTab: boolean;
  encoding?: 'color' | 'pattern';
  /** Absolute bar index of the A loop marker (or null). */
  loopA?: number | null;
  /** Absolute bar index of the B loop marker (or null). */
  loopB?: number | null;
  onOpenCloseup: () => void;
  /** Window of bars around the current position to show at once. */
  barWindow?: number;
}

function activeNoteInBar(song: Song, bar: number, beatInBar: number, phase: number): number {
  const notes = song.bars[bar]?.notes ?? [];
  if (notes.length === 0) return -1;
  const continuousBeat = beatInBar + phase;
  let bestIdx = 0;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].beat <= continuousBeat + 0.01) bestIdx = i;
  }
  return bestIdx;
}

export function LeadGodmodeView({ song, beat, beatPhase, chordSize, showTab, encoding = 'color', loopA = null, loopB = null, onOpenCloseup, barWindow = 3 }: LeadGodmodeViewProps) {
  const totalBeats = song.bars.length * song.beatsPerBar;
  const clampedBeat = Math.min(beat, totalBeats - 1);
  const barIdx = Math.floor(clampedBeat / song.beatsPerBar);
  const beatInBar = clampedBeat % song.beatsPerBar;

  const windowStart = Math.max(0, Math.min(barIdx - 1, song.bars.length - barWindow));
  const windowEnd = Math.min(song.bars.length, windowStart + barWindow);
  const visibleBars = song.bars.slice(windowStart, windowEnd);
  const activeBarInWindow = barIdx - windowStart;

  const activeNote = activeNoteInBar(song, barIdx, beatInBar, beatPhase);

  // Playhead position as a percentage across the visible staff area.
  const leftOffsetPct = useMemo(() => {
    const barFraction = activeBarInWindow + (beatInBar + beatPhase) / song.beatsPerBar;
    // Staff has 40px padding then barWidth per bar — approximate with CSS calc in px if needed.
    // Easier: treat the whole stage as 0..visibleBars.length, then nudge for the 40px label column.
    const pct = barFraction / visibleBars.length;
    return `calc(40px + (100% - 60px) * ${pct.toFixed(4)})`;
  }, [activeBarInWindow, beatInBar, beatPhase, song.beatsPerBar, visibleBars.length]);

  const currentBar = song.bars[barIdx];
  const currentChord = CHORD_LIB[currentBar?.chord ?? 'Am'] ?? CHORD_LIB.Am;
  const currentNote = currentBar?.notes[activeNote];
  const voiceLabel = currentNote
    ? `String ${currentNote.string}, fret ${currentNote.fret}${currentNote.finger ? ` · ${FINGER_NAME[currentNote.finger]}` : ''}`
    : 'Rest';

  const neckHighlights = useMemo(
    () => withActiveNote(highlightsFromChord(currentChord), currentNote),
    [currentChord, currentNote],
  );

  return (
    <div className="w4">
      <div className="w4-header">
        <div className="w4-title">
          <span className="godmode-tag">Lead · GODMODE</span>
          <span>{song.title}</span>
        </div>
        <div style={{ color: 'var(--ink-mute)', fontSize: 18, fontWeight: 700 }}>
          bar {barIdx + 1} / {song.bars.length} · ♩ = {song.bpm}
        </div>
      </div>

      <div className="w4-neck-wrap" aria-label="Full-neck fretboard with current chord lit up">
        <div className="lbl">Neck · {currentChord.name} · active note pulses</div>
        <Fretboard highlights={neckHighlights} frets={12} height={180} encoding={encoding} />
      </div>

      {showTab && (
        <div className="w4-staff-wrap" role="img" aria-label="Tablature with playhead">
          <div className="w4-playhead" style={{ left: leftOffsetPct }} />
          <TabStaff
            bars={visibleBars}
            beatsPerBar={song.beatsPerBar}
            barWidth={360}
            lineHeight={48}
            fontSize={38}
            activeBar={activeBarInWindow}
            activeNote={activeNote}
            loopABar={loopA !== null && loopA >= windowStart && loopA < windowEnd ? loopA - windowStart : -1}
            loopBBar={loopB !== null && loopB >= windowStart && loopB < windowEnd ? loopB - windowStart : -1}
          />
        </div>
      )}

      <div className="w4-footer">
        <div className="w4-posbox">
          <div className="lbl">Current position</div>
          <button
            className="gg-closeup-opener"
            onClick={onOpenCloseup}
            aria-label={`Open close-up for ${currentChord.name}`}>
            <ChordBox chord={currentChord} size={chordSize} encoding={encoding} />
            <span className="gg-tap-hint">tap to zoom ⤢</span>
          </button>
        </div>
        <div className="w4-voice" aria-live="polite">
          <span className="pulse" aria-hidden="true" />
          <span>Voice: <b>{voiceLabel}</b></span>
        </div>
      </div>
    </div>
  );
}
