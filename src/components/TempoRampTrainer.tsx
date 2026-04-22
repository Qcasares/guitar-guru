import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Song } from '../music/types';
import { AudioInput, rms } from '../audio/audio-input';
import { OnsetDetector } from '../audio/onset-detect';
import { click as metronomeClick, primeAudio } from '../audio/metronome';
import { speak, stop as stopVoice } from '../audio/voice';

interface Props {
  song: Song;
  onClose: () => void;
}

type Phase = 'setup' | 'running' | 'stopped';

const MIN_SCALE = 0.4;
const MAX_SCALE = 1.25;
const RAMP_UP = 0.05;
const RAMP_DOWN = 0.05;
const CLEAN_ACCURACY = 0.7;
const DIRTY_PASSES_TO_RAMP_DOWN = 2;
/** Timing tolerance — onsets within this many ms of the expected beat count as on-time. */
const TOLERANCE_MS = 120;

export function TempoRampTrainer({ song, onClose }: Props) {
  const sections = song.sections;
  const [sectionIdx, setSectionIdx] = useState(0);
  const [startScale, setStartScale] = useState(0.5);
  const [scale, setScale] = useState(0.5);
  const [phase, setPhase] = useState<Phase>('setup');

  const [passNumber, setPassNumber] = useState(0);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [bestScale, setBestScale] = useState(0.5);
  const [micError, setMicError] = useState<string | null>(null);
  const [streak, setStreak] = useState<'clean' | 'dirty' | null>(null);
  const [dirtyInARow, setDirtyInARow] = useState(0);

  const audioRef = useRef<AudioInput | null>(null);
  const detectorRef = useRef<OnsetDetector>(new OnsetDetector());
  const beatTimerRef = useRef<number | null>(null);
  // Expected beat times (performance.now() values) for the current pass.
  const expectedBeatsRef = useRef<number[]>([]);
  // Onsets collected during the current pass.
  const onsetsRef = useRef<number[]>([]);
  // Current pass scale — we need this inside callbacks that outlive a single render.
  const scaleRef = useRef(0.5);
  const dirtyRef = useRef(0);

  const section = sections[Math.min(sectionIdx, sections.length - 1)];

  // Derive the bar range covered by the selected section.
  const range = useMemo(() => {
    const start = section?.barOffset ?? 0;
    const next = sections.find((s) => s.barOffset > start);
    const end = next ? next.barOffset : song.bars.length;
    return { start, end };
  }, [section, sections, song.bars.length]);

  const beatsInSection = (range.end - range.start) * song.beatsPerBar;

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stopAll = useCallback(() => {
    if (beatTimerRef.current) window.clearInterval(beatTimerRef.current);
    beatTimerRef.current = null;
    audioRef.current?.stop();
    audioRef.current = null;
    stopVoice();
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  /** Compute accuracy for the pass just completed, and advance or stop. */
  const finishPass = useCallback(() => {
    const expected = expectedBeatsRef.current;
    const onsets = onsetsRef.current;
    let onTime = 0;
    for (const eAt of expected) {
      const nearest = onsets.reduce(
        (best, o) => (Math.abs(o - eAt) < Math.abs(best - eAt) ? o : best),
        Number.NEGATIVE_INFINITY,
      );
      if (Math.abs(nearest - eAt) <= TOLERANCE_MS) onTime++;
    }
    const acc = expected.length > 0 ? onTime / expected.length : 0;
    setAccuracy(acc);

    const clean = acc >= CLEAN_ACCURACY;
    if (clean) {
      setStreak('clean');
      dirtyRef.current = 0;
      setDirtyInARow(0);
      const next = Math.min(MAX_SCALE, Math.round((scaleRef.current + RAMP_UP) * 100) / 100);
      scaleRef.current = next;
      setScale(next);
      setBestScale((b) => (next > b ? next : b));
      speak(`Pass ${passNumber + 1}, ${Math.round(acc * 100)} percent. Speeding up to ${Math.round(song.bpm * next)} BPM.`, { rate: 1.1 });
    } else {
      setStreak('dirty');
      dirtyRef.current += 1;
      setDirtyInARow(dirtyRef.current);
      if (dirtyRef.current >= DIRTY_PASSES_TO_RAMP_DOWN) {
        const next = Math.max(MIN_SCALE, Math.round((scaleRef.current - RAMP_DOWN) * 100) / 100);
        scaleRef.current = next;
        setScale(next);
        dirtyRef.current = 0;
        setDirtyInARow(0);
        speak(`Pass ${passNumber + 1}, ${Math.round(acc * 100)} percent. Slowing down to ${Math.round(song.bpm * next)} BPM.`, { rate: 1.1 });
      } else {
        speak(`Pass ${passNumber + 1}, ${Math.round(acc * 100)} percent. Try again.`, { rate: 1.1 });
      }
    }
    setPassNumber((n) => n + 1);
    // Reset per-pass buffers.
    expectedBeatsRef.current = [];
    onsetsRef.current = [];
  }, [passNumber, song.bpm]);

  const startPass = useCallback(() => {
    const bpm = song.bpm * scaleRef.current;
    const msPerBeat = 60_000 / bpm;
    const start = performance.now() + 300; // small lead-in so the first beat isn't stepped on
    const expected: number[] = [];
    for (let i = 0; i < beatsInSection; i++) {
      expected.push(start + i * msPerBeat);
    }
    expectedBeatsRef.current = expected;
    onsetsRef.current = [];
    detectorRef.current.reset();

    // Beat ticker — clicks the metronome + records the expected beat time.
    let beat = 0;
    const tick = () => {
      if (beat >= beatsInSection) {
        if (beatTimerRef.current) window.clearInterval(beatTimerRef.current);
        beatTimerRef.current = null;
        // Small wait for any trailing onset, then evaluate.
        window.setTimeout(() => {
          finishPass();
          if (phase === 'running') startPass(); // next pass
        }, 180);
        return;
      }
      const beatInBar = beat % song.beatsPerBar;
      metronomeClick({ accent: beatInBar === 0 });
      beat++;
    };
    // Align the first tick to the scheduled start time.
    window.setTimeout(() => {
      tick();
      beatTimerRef.current = window.setInterval(tick, msPerBeat);
    }, 300);
  }, [song.bpm, song.beatsPerBar, beatsInSection, finishPass, phase]);

  const begin = useCallback(() => {
    setMicError(null);
    setPhase('running');
    setPassNumber(0);
    setAccuracy(null);
    setStreak(null);
    setDirtyInARow(0);
    dirtyRef.current = 0;
    scaleRef.current = startScale;
    setScale(startScale);
    setBestScale(startScale);
    primeAudio();

    const input = new AudioInput();
    audioRef.current = input;
    input.start((frame) => {
      const now = performance.now();
      if (rms(frame.timeData) < 0.015) return;
      if (detectorRef.current.process(frame.timeData, frame.sampleRate, now)) {
        onsetsRef.current.push(now);
      }
    }).catch((err) => {
      setMicError(err instanceof Error ? err.message : String(err));
      setPhase('stopped');
    });

    startPass();
  }, [startScale, startPass]);

  const halt = useCallback(() => {
    stopAll();
    setPhase('stopped');
  }, [stopAll]);

  return (
    <div className="gg-closeup" role="dialog" aria-modal="true" aria-label="Tempo-ramp trainer" onClick={onClose}>
      <div className="gg-closeup-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="gg-closeup-header">
          <div className="gg-closeup-title">
            <span className="tag">Trainer</span>
            <span className="name" style={{ fontSize: 36 }}>Tempo ramp</span>
          </div>
          <button className="gg-closeup-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {phase === 'setup' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <label style={labelStyle}>
                  Section
                  <select value={sectionIdx} onChange={(e) => setSectionIdx(Number(e.target.value))} style={selectStyle}>
                    {sections.map((s, i) => (
                      <option key={i} value={i}>{s.name} ({s.chords.length} bars)</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  Start speed — {Math.round(startScale * 100)}% ({Math.round(song.bpm * startScale)} BPM)
                  <input
                    type="range" min={0.4} max={1.0} step={0.05}
                    value={startScale}
                    onChange={(e) => setStartScale(Number(e.target.value))}
                    style={{ width: '100%', marginTop: 10 }}
                  />
                </label>
              </div>

              <div style={{ padding: 14, background: 'var(--bg-alt)', border: '2px dashed var(--ink)', borderRadius: 10, fontSize: 14, lineHeight: 1.5 }}>
                Play along with the click. After each pass the trainer speaks your accuracy and ramps the tempo up by +{Math.round(RAMP_UP * 100)}% if you nailed {Math.round(CLEAN_ACCURACY * 100)}% of the beats within {TOLERANCE_MS} ms, or back down by -{Math.round(RAMP_DOWN * 100)}% after {DIRTY_PASSES_TO_RAMP_DOWN} misses in a row.
              </div>

              <button onClick={begin} style={bigPrimaryStyle}>▶  Start ramp</button>
            </>
          )}

          {phase === 'running' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                <Stat label="BPM" value={String(Math.round(song.bpm * scale))} big />
                <Stat label="Scale" value={`${Math.round(scale * 100)}%`} />
                <Stat label="Pass" value={String(passNumber + 1)} />
                <Stat label="Last" value={accuracy === null ? '—' : `${Math.round(accuracy * 100)}%`} accent={accuracy !== null && accuracy >= CLEAN_ACCURACY ? 'green' : accuracy !== null ? 'red' : undefined} />
              </div>

              <div style={{ padding: 14, background: 'var(--bg-alt)', border: '2px dashed var(--ink)', borderRadius: 10, display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{section.name}</div>
                <div style={{ fontSize: 15, color: 'var(--ink-mute)', fontWeight: 700 }}>
                  · {section.chords.join(' · ')}
                </div>
              </div>

              {streak && (
                <div style={{ fontWeight: 800, color: streak === 'clean' ? 'var(--accent-green)' : 'var(--accent)' }}>
                  {streak === 'clean' ? '✓ Clean pass — ramping up' : `✗ Dirty pass (${dirtyInARow}/${DIRTY_PASSES_TO_RAMP_DOWN})`}
                </div>
              )}

              <div style={{ fontSize: 14, color: 'var(--ink-mute)' }}>
                Best so far: <b>{Math.round(bestScale * 100)}%</b> — {Math.round(song.bpm * bestScale)} BPM
              </div>

              <button onClick={halt} style={bigSecondaryStyle}>Stop</button>
            </>
          )}

          {phase === 'stopped' && (
            <div style={{ textAlign: 'center', padding: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
                Session complete
              </div>
              <div style={{ fontSize: 120, fontWeight: 900, lineHeight: 1 }}>
                {Math.round(song.bpm * bestScale)}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>max BPM reached</div>
              <div style={{ marginTop: 12, color: 'var(--ink-mute)', fontWeight: 700 }}>
                {passNumber} pass{passNumber === 1 ? '' : 'es'} · best {Math.round(bestScale * 100)}%
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
                <button onClick={begin} style={bigPrimaryStyle}>Try again</button>
                <button onClick={() => setPhase('setup')} style={bigSecondaryStyle}>Change section</button>
              </div>
            </div>
          )}

          {micError && (
            <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
              Mic error: {micError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, big = false, accent }: { label: string; value: string; big?: boolean; accent?: 'green' | 'red' }) {
  const color = accent === 'green' ? 'var(--accent-green)' : accent === 'red' ? 'var(--accent)' : 'var(--ink)';
  return (
    <div style={{ padding: 10, border: '3px solid var(--ink)', borderRadius: 10, textAlign: 'center', background: 'var(--surface)', boxShadow: '3px 3px 0 var(--ink)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, color: 'var(--ink-mute)' }}>{label}</div>
      <div style={{ fontSize: big ? 42 : 26, fontWeight: 900, lineHeight: 1.1, color }}>{value}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--ink-mute)',
};

const selectStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 6,
  width: '100%',
  padding: '12px 14px',
  fontSize: 18,
  fontWeight: 800,
  fontFamily: 'inherit',
  background: 'var(--surface)',
  color: 'var(--ink)',
  border: '3px solid var(--ink)',
  borderRadius: 8,
  cursor: 'pointer',
};

const bigPrimaryStyle: React.CSSProperties = {
  padding: '16px 22px', fontSize: 18, fontWeight: 900,
  background: 'var(--accent)', color: '#fff',
  border: '3px solid var(--ink)', borderRadius: 10, cursor: 'pointer',
  minHeight: 64, boxShadow: '3px 3px 0 var(--ink)',
};

const bigSecondaryStyle: React.CSSProperties = {
  padding: '14px 18px', fontSize: 16, fontWeight: 800,
  background: 'var(--surface)', color: 'var(--ink)',
  border: '3px solid var(--ink)', borderRadius: 10, cursor: 'pointer',
  minHeight: 56, boxShadow: '3px 3px 0 var(--ink)',
};
