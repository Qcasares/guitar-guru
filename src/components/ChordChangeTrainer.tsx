import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHORD_LIB } from '../music/chords';
import { AudioInput, rms } from '../audio/audio-input';
import { detectChord } from '../audio/chord-detect';
import { speak, stop as stopVoice } from '../audio/voice';
import { ChordBox } from './ChordBox';

interface TrainerProps {
  onClose: () => void;
}

const PR_STORAGE_KEY = 'guitarguru.trainer.prs.v1';
const COUNTDOWN_SEC = 60;

interface PRTable {
  [pairKey: string]: number;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('↔');
}

function loadPRs(): PRTable {
  try {
    const raw = localStorage.getItem(PR_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PRTable) : {};
  } catch { return {}; }
}

function savePRs(prs: PRTable): void {
  try { localStorage.setItem(PR_STORAGE_KEY, JSON.stringify(prs)); } catch { /* ignore */ }
}

type Phase = 'setup' | 'counting-in' | 'running' | 'done';

const CHORD_OPTIONS = Object.keys(CHORD_LIB);

export function ChordChangeTrainer({ onClose }: TrainerProps) {
  const [chordA, setChordA] = useState('Am');
  const [chordB, setChordB] = useState('D');
  const [phase, setPhase] = useState<Phase>('setup');
  const [countIn, setCountIn] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [transitions, setTransitions] = useState(0);
  const [lastMatched, setLastMatched] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const prs = useMemo(loadPRs, []);
  const [personalBest, setPersonalBest] = useState<number | null>(prs[pairKey(chordA, chordB)] ?? null);

  const audioRef = useRef<AudioInput | null>(null);
  const lastChordRef = useRef<string | null>(null);
  const lastChangeAtRef = useRef(0);
  const timerIntervalRef = useRef<number | null>(null);

  // Esc to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // When the pair changes in setup, refresh the displayed PR.
  useEffect(() => {
    if (phase === 'setup') setPersonalBest(prs[pairKey(chordA, chordB)] ?? null);
  }, [chordA, chordB, phase, prs]);

  // Audio + timer lifecycle tied to `phase`.
  useEffect(() => {
    if (phase !== 'running') return;

    const input = new AudioInput();
    audioRef.current = input;
    let lastAnalysisAt = 0;
    input.start((frame) => {
      const now = performance.now();
      if (now - lastAnalysisAt < 60) return;
      lastAnalysisAt = now;
      if (rms(frame.timeData) < 0.012) return;

      const match = detectChord(frame.freqData, frame.sampleRate, frame.fftSize);
      if (!match) return;
      if (match.chord !== chordA && match.chord !== chordB) return;

      // A transition is an alternation: we count it only when the detected
      // chord differs from the last accepted one AND at least 200 ms have
      // passed since the last counted transition (prevents buzz doubling).
      const priorChord = lastChordRef.current;
      const sinceLast = now - lastChangeAtRef.current;
      if (priorChord && priorChord !== match.chord && sinceLast > 200) {
        setTransitions((t) => t + 1);
        lastChangeAtRef.current = now;
      }
      if (priorChord !== match.chord) {
        lastChordRef.current = match.chord;
        setLastMatched(match.chord);
      }
    }).catch((err) => {
      setMicError(err instanceof Error ? err.message : String(err));
      setPhase('setup');
    });

    const start = performance.now();
    timerIntervalRef.current = window.setInterval(() => {
      const secs = Math.floor((performance.now() - start) / 1000);
      setElapsed(secs);
      if (secs >= COUNTDOWN_SEC) {
        setPhase('done');
      }
    }, 200);

    return () => {
      input.stop();
      audioRef.current = null;
      if (timerIntervalRef.current) window.clearInterval(timerIntervalRef.current);
    };
  }, [phase, chordA, chordB]);

  // On phase 'done' — compute result, update PR, speak.
  useEffect(() => {
    if (phase !== 'done') return;
    const score = transitions;
    const key = pairKey(chordA, chordB);
    const prev = prs[key] ?? 0;
    let msg = `${score} changes between ${chordA} and ${chordB}`;
    if (score > prev) {
      prs[key] = score;
      savePRs(prs);
      setPersonalBest(score);
      msg += `. New personal best, up from ${prev}.`;
    } else if (prev > 0) {
      msg += `. Personal best is still ${prev}.`;
    }
    speak(msg, { rate: 1.1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const begin = useCallback(() => {
    if (chordA === chordB) return;
    setMicError(null);
    setTransitions(0);
    setElapsed(0);
    setLastMatched(null);
    lastChordRef.current = null;
    lastChangeAtRef.current = 0;
    setPhase('counting-in');
    // 3-second visual count-in with spoken numbers.
    let n = 3;
    setCountIn(n);
    speak('3', { rate: 1.4 });
    const tick = window.setInterval(() => {
      n -= 1;
      if (n <= 0) {
        window.clearInterval(tick);
        setCountIn(0);
        setPhase('running');
        speak('Go!', { rate: 1.4 });
      } else {
        setCountIn(n);
        speak(String(n), { rate: 1.4 });
      }
    }, 1000);
  }, [chordA, chordB]);

  const reset = useCallback(() => {
    stopVoice();
    setPhase('setup');
    setTransitions(0);
    setElapsed(0);
  }, []);

  const remaining = Math.max(0, COUNTDOWN_SEC - elapsed);
  const chordADef = CHORD_LIB[chordA];
  const chordBDef = CHORD_LIB[chordB];

  return (
    <div className="gg-closeup" role="dialog" aria-modal="true" aria-label="Chord-change trainer" onClick={onClose}>
      <div className="gg-closeup-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
        <div className="gg-closeup-header">
          <div className="gg-closeup-title">
            <span className="tag">Trainer</span>
            <span className="name" style={{ fontSize: 36 }}>Chord changes / min</span>
          </div>
          <button className="gg-closeup-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {phase === 'setup' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <label style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
                  Chord A
                  <select value={chordA} onChange={(e) => setChordA(e.target.value)} style={selectStyle}>
                    {CHORD_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 14, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
                  Chord B
                  <select value={chordB} onChange={(e) => setChordB(e.target.value)} style={selectStyle}>
                    {CHORD_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              {chordA === chordB && (
                <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>
                  Pick two different chords to practice transitions.
                </div>
              )}

              <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                {chordADef && <ChordBox chord={chordADef} size="lg" />}
                {chordBDef && <ChordBox chord={chordBDef} size="lg" />}
              </div>

              <div style={{ padding: 12, background: 'var(--bg-alt)', border: '2px dashed var(--ink)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 13, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
                  Personal best
                </div>
                <div style={{ fontSize: 32, fontWeight: 900 }}>
                  {personalBest !== null ? `${personalBest} changes` : '— none yet —'}
                </div>
              </div>

              <button onClick={begin} disabled={chordA === chordB} style={{ ...bigPrimaryStyle, opacity: chordA === chordB ? 0.5 : 1 }}>
                ▶  Start 60-second test
              </button>

              <div style={{ color: 'var(--ink-mute)', fontSize: 13, textAlign: 'center' }}>
                Needs microphone access. The app counts each clean A → B → A transition you play.
              </div>
            </>
          )}

          {phase === 'counting-in' && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 18, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--ink-mute)' }}>
                Get ready
              </div>
              <div style={{ fontSize: 200, fontWeight: 900, lineHeight: 1, color: 'var(--accent)' }}>{countIn || 'Go'}</div>
            </div>
          )}

          {phase === 'running' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <Stat label="Transitions" value={String(transitions)} big />
                <Stat label="Time left" value={`${remaining}s`} />
                <Stat label="Pace / min" value={String(Math.round(transitions * (60 / Math.max(elapsed, 1))))} />
              </div>
              <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
                <div style={{ outline: lastMatched === chordA ? '6px solid var(--accent)' : 'none', outlineOffset: 8, borderRadius: 4 }}>
                  {chordADef && <ChordBox chord={chordADef} size="lg" />}
                </div>
                <div style={{ outline: lastMatched === chordB ? '6px solid var(--accent)' : 'none', outlineOffset: 8, borderRadius: 4 }}>
                  {chordBDef && <ChordBox chord={chordBDef} size="lg" />}
                </div>
              </div>
              <button onClick={reset} style={bigSecondaryStyle}>Stop</button>
            </>
          )}

          {phase === 'done' && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-mute)' }}>
                Time!
              </div>
              <div style={{ fontSize: 140, fontWeight: 900, lineHeight: 1 }}>{transitions}</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
                clean {chordA} ↔ {chordB} changes
              </div>
              {personalBest !== null && personalBest === transitions && transitions > 0 && (
                <div style={{ marginTop: 10, color: 'var(--accent-green)', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 18 }}>
                  ✓ New personal best!
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18 }}>
                <button onClick={begin} style={bigPrimaryStyle}>Try again</button>
                <button onClick={reset} style={bigSecondaryStyle}>Change chords</button>
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

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div style={{ padding: 12, border: '3px solid var(--ink)', borderRadius: 10, textAlign: 'center', background: 'var(--surface)', boxShadow: '3px 3px 0 var(--ink)' }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, color: 'var(--ink-mute)' }}>{label}</div>
      <div style={{ fontSize: big ? 48 : 28, fontWeight: 900, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  display: 'block',
  marginTop: 6,
  width: '100%',
  padding: '12px 14px',
  fontSize: 20,
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
