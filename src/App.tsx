import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModeSwitch } from './components/ModeSwitch';
import { PlaybackControls } from './components/PlaybackControls';
import { TweaksPanel, type ChordSize } from './components/TweaksPanel';
import { FingerLegend } from './components/FingerLegend';
import { FingerCloseup } from './components/FingerCloseup';
import { SongImportDialog } from './components/SongImportDialog';
import { ChordChangeTrainer } from './components/ChordChangeTrainer';
import { TempoRampTrainer } from './components/TempoRampTrainer';
import { FocusSpotlight } from './components/FocusSpotlight';
import { FingerPatternDefs } from './components/patterns/FingerPatterns';
import { narrateChord } from './audio/chord-narration';
import { playFingerCue, primeFingerAudio } from './audio/finger-sonification';
import { loadPreferences, savePreferences } from './lib/preferences';
import { onInstallPromptAvailable } from './lib/pwa';
import { RhythmView } from './views/RhythmView';
import { LeadGodmodeView } from './views/LeadGodmodeView';
import { Transport } from './audio/transport';
import { AudioTrack } from './audio/audio-track';
import { deleteBlob, getBlob, listBlobIds } from './lib/audio-storage';
import { click as metronomeClick, primeAudio } from './audio/metronome';
import { speak, stop as stopVoice } from './audio/voice';
import { strum, playTabNote } from './audio/synth';
import { AudioInput, rms } from './audio/audio-input';
import { detectChord, type ChordMatch } from './audio/chord-detect';
import { buzz, PATTERNS as HAPTIC, supported as hapticsSupported } from './audio/haptics';
import { VoiceRecognizer, supported as voiceSupported } from './voice/recognition';
import { parseCommand, commandLabel, type Command } from './voice/parser';
import { CHORD_LIB } from './music/chords';
import { SAMPLE_SONG } from './music/songs';
import { FINGER_NAME } from './music/finger-colors';
import type { AudioTrackRef, Density, PlaybackMode, Song, Theme } from './music/types';

const SONG_STORAGE_KEY = 'guitarguru.song.v1';

const sidebarBtn: React.CSSProperties = {
  padding: '11px 13px', width: '100%',
  fontSize: 14, fontWeight: 800, letterSpacing: '0.03em',
  background: 'var(--bg-alt)', color: 'var(--ink)',
  border: '3px solid var(--ink)', borderRadius: 10, cursor: 'pointer',
  boxShadow: '3px 3px 0 var(--ink)', textAlign: 'left',
  display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between',
  fontFamily: 'inherit',
};
const sidebarBtnActive: React.CSSProperties = {
  ...sidebarBtn,
  background: 'var(--ink)',
  color: 'var(--bg)',
  boxShadow: 'none',
  transform: 'translate(2px, 2px)',
};
const toggleBtn: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 13, fontWeight: 700,
  background: 'var(--bg)', color: 'var(--ink)',
  border: '2px solid var(--ink)', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'inherit',
};
const kbd: React.CSSProperties = {
  fontSize: 11, padding: '2px 6px',
  border: '1.5px solid currentColor', borderRadius: 4, opacity: 0.7,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

function loadStoredSong(): Song | null {
  try {
    const raw = localStorage.getItem(SONG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.bars?.length) return null;
    return parsed as Song;
  } catch {
    return null;
  }
}

/** Track the viewport so we can shrink dense views on phones. */
function useIsNarrow(breakpoint = 600): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return narrow;
}

export function App() {
  const [song, setSong] = useState<Song>(() => loadStoredSong() ?? SAMPLE_SONG);
  const totalBeats = song.bars.length * song.beatsPerBar;

  // Persist the active song whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(SONG_STORAGE_KEY, JSON.stringify(song));
    } catch {
      // Storage might be full or disabled in private mode — fail silently.
    }
  }, [song]);

  // Seed from persisted preferences once — subsequent changes auto-save below.
  const initialPrefs = useMemo(loadPreferences, []);

  const [mode, setMode] = useState<PlaybackMode>(initialPrefs.mode);
  const [theme, setTheme] = useState<Theme>(initialPrefs.theme);
  const [density, setDensity] = useState<Density>(initialPrefs.density);
  const [chordSize, setChordSize] = useState<ChordSize>(initialPrefs.chordSize);
  const [showLyrics, setShowLyrics] = useState(initialPrefs.showLyrics);
  const [showFingers, setShowFingers] = useState(initialPrefs.showFingers);

  const [playing, setPlaying] = useState(false);
  const [beat, setBeat] = useState(initialPrefs.lastBar * SAMPLE_SONG.beatsPerBar);
  const [beatPhase, setBeatPhase] = useState(0);
  const [tempoScale, setTempoScale] = useState(initialPrefs.tempoScale);
  const [loopActive, setLoopActive] = useState(initialPrefs.loopActive);
  const [metronome, setMetronome] = useState(initialPrefs.metronome);
  const [voice, setVoice] = useState(initialPrefs.voice);
  const [countInEnabled, setCountInEnabled] = useState(initialPrefs.countInEnabled);
  const [countIn, setCountIn] = useState(0); // 0 = idle, 4..1 = ticking down
  const [synthOn, setSynthOn] = useState(initialPrefs.synth);
  const [hapticsOn, setHapticsOn] = useState(initialPrefs.hapticsOn);
  const [showTab, setShowTab] = useState(initialPrefs.showTab);
  const [closeupOpen, setCloseupOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [trainerOpen, setTrainerOpen] = useState(false);
  const [rampOpen, setRampOpen] = useState(false);
  const [spotlightOn, setSpotlightOn] = useState(initialPrefs.spotlightOn);
  const [fingerSonification, setFingerSonification] = useState(initialPrefs.fingerSonification);
  const [fingerEncoding, setFingerEncoding] = useState<'color' | 'pattern'>(initialPrefs.fingerEncoding);

  const [installPrompt, setInstallPrompt] = useState<null | (() => Promise<'accepted' | 'dismissed'>)>(null);
  const [installState, setInstallState] = useState<'idle' | 'installed'>('idle');

  // Polite-live status message for screen readers / low-vision users —
  // WCAG 4.1.3. A concise phrase fired when a user-visible state changes.
  const [liveStatus, setLiveStatus] = useState('');
  const announce = useCallback((msg: string) => {
    // Reset then set so the same message re-announces when fired twice in a row.
    setLiveStatus('');
    window.setTimeout(() => setLiveStatus(msg), 20);
  }, []);
  const [voiceCmdOn, setVoiceCmdOn] = useState(false);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [hearing, setHearing] = useState<ChordMatch | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const voiceRef = useRef<VoiceRecognizer | null>(null);
  const speakStatusRef = useRef<(() => void) | null>(null);
  const audioInputRef = useRef<AudioInput | null>(null);
  // Debounce tracker: require N consecutive matches of the current chord
  // before we act on auto-advance, so transient strums don't skip bars.
  const stableRef = useRef<{ chord: string; count: number }>({ chord: '', count: 0 });
  const hearingRef = useRef<ChordMatch | null>(null);

  const isNarrow = useIsNarrow(600);

  const transportRef = useRef<Transport | null>(null);
  const audioTrackRef = useRef<AudioTrack | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [trackLoaded, setTrackLoaded] = useState(false);
  const [trackOn, setTrackOn] = useState(true);
  const prevBeatRef = useRef(0);
  const stretchSupported = useMemo(
    () => typeof HTMLMediaElement !== 'undefined' && 'preservesPitch' in HTMLMediaElement.prototype,
    [],
  );

  // Loop range priority: explicit A-B markers > section-loop toggle > off.
  const loopRange = useMemo(() => {
    if (loopA !== null && loopB !== null && loopA < loopB) {
      return {
        fromBeat: loopA * song.beatsPerBar,
        toBeat: (loopB + 1) * song.beatsPerBar,
      };
    }
    if (!loopActive) return null;
    const barIdx = Math.floor(beat / song.beatsPerBar);
    const section = [...song.sections].reverse().find((s) => s.barOffset <= barIdx);
    if (!section) return null;
    const next = song.sections.find((s) => s.barOffset > section.barOffset);
    const fromBeat = section.barOffset * song.beatsPerBar;
    const toBeat = (next ? next.barOffset : song.bars.length) * song.beatsPerBar;
    return { fromBeat, toBeat };
    // intentional: beat included so section loop recalculates when we cross sections
  }, [loopA, loopB, loopActive, beat, song]);

  const announceForBeat = useCallback((b: number) => {
    if (!voice) return;
    const barIdx = Math.floor(b / song.beatsPerBar);
    const beatInBar = b % song.beatsPerBar;
    const bar = song.bars[barIdx];
    if (!bar) return;

    if (mode === 'rhythm') {
      // Announce the upcoming chord on beat 3 of each bar (one beat before the change).
      if (beatInBar === song.beatsPerBar - 2) {
        const next = song.bars[barIdx + 1];
        if (next?.chord && next.chord !== bar.chord) {
          speak(`Next: ${next.chord}`, { rate: 1.1 });
        }
      }
    } else {
      // Lead: announce the note on each onset.
      const note = bar.notes.find((n) => Math.floor(n.beat) === beatInBar);
      if (note) {
        const fingerPart = note.finger ? `, ${FINGER_NAME[note.finger]} finger` : '';
        const fretWord = note.fret === 0 ? 'open' : `fret ${note.fret}`;
        speak(`String ${note.string}, ${fretWord}${fingerPart}`, { rate: 1.35 });
      }
    }
  }, [mode, voice]);

  const handleBeat = useCallback((b: number) => {
    const beatInBar = b % song.beatsPerBar;
    const barIdx = Math.floor(b / song.beatsPerBar);
    const bar = song.bars[barIdx];
    if (metronome) metronomeClick({ accent: beatInBar === 0 });
    announceForBeat(b);

    if (hapticsOn) {
      const atSectionStart = beatInBar === 0 && song.sections.some((s) => s.barOffset === barIdx);
      if (atSectionStart) buzz(HAPTIC.section as unknown as number[]);
      else if (beatInBar === 0) buzz(HAPTIC.downbeat);
      else buzz(HAPTIC.beat);
    }

    if (synthOn && bar) {
      if (mode === 'rhythm') {
        // Strum chord on beats 0 and 2 (down, up) — classic 4/4 rhythm pattern.
        if (beatInBar === 0 && bar.chord && CHORD_LIB[bar.chord]) {
          strum(CHORD_LIB[bar.chord], { direction: 'down', gain: 0.55 });
        } else if (beatInBar === 2 && bar.chord && CHORD_LIB[bar.chord]) {
          strum(CHORD_LIB[bar.chord], { direction: 'up', gain: 0.38 });
        }
      } else {
        // Lead: play whichever tab note falls on this integer beat.
        const noteOnBeat = bar.notes.find((n) => Math.floor(n.beat) === beatInBar);
        if (noteOnBeat) playTabNote(noteOnBeat);
      }
    }

    // Finger sonification — pitched cue under the metronome, tied to the
    // active note's fretting finger so colour is never the sole encoding.
    if (fingerSonification && mode === 'lead' && bar) {
      const noteOnBeat = bar.notes.find((n) => Math.floor(n.beat) === beatInBar);
      if (noteOnBeat?.finger) playFingerCue(noteOnBeat.finger, { gain: 0.18 });
    }
  }, [metronome, announceForBeat, synthOn, mode, hapticsOn, song, fingerSonification]);

  const handleTick = useCallback((s: { playing: boolean; beat: number; beatPhase: number }) => {
    setPlaying(s.playing);
    setBeat(s.beat);
    setBeatPhase(s.beatPhase);
  }, []);

  // Lazily (re)create the transport and keep its options in sync with React state.
  useEffect(() => {
    if (!transportRef.current) {
      transportRef.current = new Transport({
        bpm: song.bpm,
        tempoScale,
        totalBeats,
        loop: loopRange,
        onTick: handleTick,
        onBeat: handleBeat,
      });
    } else {
      transportRef.current.update({
        bpm: song.bpm,
        tempoScale,
        totalBeats,
        loop: loopRange,
        onTick: handleTick,
        onBeat: handleBeat,
      });
    }
  }, [song.bpm, totalBeats, tempoScale, loopRange, handleTick, handleBeat]);

  useEffect(() => () => transportRef.current?.dispose(), []);

  const getAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      audioCtxRef.current = new Ctor();
    }
    return audioCtxRef.current;
  }, []);

  const ensureAudioLoaded = useCallback(async (ref: AudioTrackRef): Promise<void> => {
    try {
      audioTrackRef.current?.dispose();
      audioTrackRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      const ctx = getAudioCtx();
      const track = new AudioTrack({
        audioContext: ctx,
        onEnded: () => announce('Audio track ended'),
      });
      audioTrackRef.current = track;

      let url: string;
      if (ref.source.kind === 'blob') {
        const blob = await getBlob(ref.source.blobId);
        if (!blob) {
          setTrackLoaded(false);
          return;
        }
        url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
      } else {
        url = ref.source.url;
      }
      await track.load(url);
      setTrackLoaded(true);
      setTrackOn(true);
    } catch {
      setTrackLoaded(false);
    }
  }, [announce, getAudioCtx]);

  // Boot once: GC orphan blobs (anything not referenced by the current song)
  // and restore the attached audio track if the song has one.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const currentBlobId = song.audio?.source.kind === 'blob' ? song.audio.source.blobId : null;
        const all = await listBlobIds();
        for (const id of all) {
          if (id !== currentBlobId) await deleteBlob(id);
        }
        if (cancelled) return;
        if (song.audio) await ensureAudioLoaded(song.audio);
      } catch {
        // GC/restore failures are non-fatal; user just re-attaches.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Re-load the audio track whenever the song's audio reference changes
  // (attach, swap, or detach).
  const audioKey = song.audio
    ? song.audio.source.kind === 'blob'
      ? `blob:${song.audio.source.blobId}`
      : `url:${song.audio.source.url}`
    : null;
  useEffect(() => {
    if (!song.audio) {
      audioTrackRef.current?.dispose();
      audioTrackRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setTrackLoaded(false);
      return;
    }
    void ensureAudioLoaded(song.audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- audioKey captures identity
  }, [audioKey]);

  // Detect beat jumps that aren't a natural +1 tick (loop wrap, manual seek,
  // bar skip, restart) and re-seek the audio to match.
  useEffect(() => {
    const delta = beat - prevBeatRef.current;
    if (Math.abs(delta) > 1 && song.audio && trackLoaded && audioTrackRef.current) {
      void audioTrackRef.current.seekToBeat(beat, song.bpm, song.audio.offsetSec);
    }
    prevBeatRef.current = beat;
  }, [beat, song, trackLoaded]);

  // Keep the audio element's playbackRate synced with the tempoScale state.
  useEffect(() => {
    audioTrackRef.current?.setTempoScale(tempoScale);
  }, [tempoScale]);

  const onToggleTrack = useCallback(() => {
    setTrackOn((prev) => {
      const next = !prev;
      audioTrackRef.current?.mute(!next);
      announce(next ? 'Track on' : 'Track off');
      return next;
    });
  }, [announce]);

  // Call when the transport is about to start playback — seeks and plays the
  // attached recording at the current beat.
  const startAudio = useCallback(() => {
    if (!song.audio || !trackLoaded || !trackOn || !audioTrackRef.current) return;
    const t = transportRef.current;
    const currentBeat = t ? Math.floor(beat) : 0;
    void audioTrackRef.current.play(currentBeat, song.bpm, song.audio.offsetSec, tempoScale);
  }, [song, trackLoaded, trackOn, beat, tempoScale]);

  const pauseAudio = useCallback(() => {
    audioTrackRef.current?.pause();
  }, []);

  // Restore playback position once the transport exists. We only do this on
  // first mount; thereafter the user is in control of where the playhead is.
  useEffect(() => {
    if (initialPrefs.lastBar > 0) {
      transportRef.current?.seek(initialPrefs.lastBar * song.beatsPerBar);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-clear the voice toast after 1.6 s.
  useEffect(() => {
    if (!voiceToast) return;
    const h = window.setTimeout(() => setVoiceToast(null), 1600);
    return () => window.clearTimeout(h);
  }, [voiceToast]);

  // Microphone lifecycle — start the AudioInput when listening flips on,
  // throttle analysis to ~12 Hz to keep CPU under 10% on a modest laptop.
  useEffect(() => {
    if (!listening) {
      audioInputRef.current?.stop();
      audioInputRef.current = null;
      setHearing(null);
      hearingRef.current = null;
      stableRef.current = { chord: '', count: 0 };
      return;
    }
    const input = new AudioInput();
    audioInputRef.current = input;
    let lastAt = 0;
    input
      .start((frame) => {
        const now = performance.now();
        if (now - lastAt < 85) return;
        lastAt = now;
        if (rms(frame.timeData) < 0.01) {
          setHearing(null);
          hearingRef.current = null;
          return;
        }
        const match = detectChord(frame.freqData, frame.sampleRate, frame.fftSize);
        setHearing(match);
        hearingRef.current = match;
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setMicError(msg);
        setListening(false);
      });
    return () => {
      input.stop();
    };
  }, [listening]);

  // Auto-advance — when the detected chord stably matches the current bar's
  // chord, move the transport forward by one bar.
  useEffect(() => {
    if (!listening || !autoAdvance || !hearing) return;
    const barIdxNow = Math.floor(beat / song.beatsPerBar);
    const target = song.bars[barIdxNow]?.chord;
    if (!target) return;
    const tracker = stableRef.current;
    if (hearing.chord === target) {
      if (tracker.chord === target) tracker.count += 1;
      else { tracker.chord = target; tracker.count = 1; }
      if (tracker.count >= 3) {
        transportRef.current?.seekBars(1, song.beatsPerBar);
        tracker.chord = '';
        tracker.count = 0;
      }
    } else {
      if (tracker.chord !== '') stableRef.current = { chord: '', count: 0 };
    }
  }, [hearing, listening, autoAdvance, beat, song]);

  // Install-prompt lifecycle — stash the deferred prompt function when
  // Chrome/Edge offers one; clear it after accept/dismiss.
  useEffect(() => {
    const unsubscribe = onInstallPromptAvailable((prompt) => {
      setInstallPrompt(() => prompt);
    });
    const onInstalled = () => {
      setInstallPrompt(null);
      setInstallState('installed');
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      unsubscribe();
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Apply theme + density at the document root so CSS custom properties cascade globally.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  // Persist preferences whenever any tracked knob changes. Debounced 300 ms
  // so dragging the tempo slider or scrubbing bars doesn't pummel storage.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      savePreferences({
        mode, theme, density, chordSize, showLyrics, showFingers, showTab,
        fingerEncoding, tempoScale,
        metronome, voice, synth: synthOn, countInEnabled,
        hapticsOn, fingerSonification, loopActive, spotlightOn,
        lastBar: Math.floor(beat / song.beatsPerBar),
      });
    }, 300);
    return () => window.clearTimeout(handle);
  }, [
    mode, theme, density, chordSize, showLyrics, showFingers, showTab,
    fingerEncoding, tempoScale, metronome, voice, synthOn, countInEnabled,
    hapticsOn, fingerSonification, loopActive, spotlightOn,
    beat, song.beatsPerBar,
  ]);

  const runCountIn = useCallback(() => {
    primeAudio();
    const beatMs = 60_000 / (song.bpm * tempoScale);
    let remaining = song.beatsPerBar;
    setCountIn(remaining);
    metronomeClick({ accent: true });
    if (voice) speak(String(song.beatsPerBar - remaining + 1), { rate: 1.6 });
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        setCountIn(0);
        transportRef.current?.play();
        startAudio();
        return;
      }
      setCountIn(remaining);
      metronomeClick({ accent: remaining === song.beatsPerBar });
      if (voice) speak(String(song.beatsPerBar - remaining + 1), { rate: 1.6 });
      window.setTimeout(tick, beatMs);
    };
    window.setTimeout(tick, beatMs);
  }, [tempoScale, voice, startAudio]);

  const currentBarIdx = Math.floor(beat / song.beatsPerBar);
  const toggleLoopA = useCallback(() => {
    setLoopA((a) => (a === currentBarIdx ? null : currentBarIdx));
  }, [currentBarIdx]);
  const toggleLoopB = useCallback(() => {
    setLoopB((b) => (b === currentBarIdx ? null : currentBarIdx));
  }, [currentBarIdx]);
  const clearLoopAB = useCallback(() => { setLoopA(null); setLoopB(null); }, []);

  const dispatchVoiceCommand = useCallback((cmd: Command) => {
    setVoiceToast(commandLabel(cmd));
    const t = transportRef.current;
    switch (cmd.kind) {
      case 'play': primeAudio(); t?.play(); startAudio(); break;
      case 'pause': t?.pause(); pauseAudio(); break;
      case 'toggle-play':
        primeAudio();
        t?.toggle();
        if (t?.isPlaying()) startAudio();
        else pauseAudio();
        break;
      case 'next': t?.seekBars(1, song.beatsPerBar); break;
      case 'prev': t?.seekBars(-1, song.beatsPerBar); break;
      case 'restart': t?.seek(0); stopVoice(); break;
      case 'tempo': setTempoScale(Math.max(0.25, Math.min(2, cmd.scale))); break;
      case 'tempo-delta':
        setTempoScale((s) => Math.max(0.25, Math.min(2, Math.round((s + cmd.delta) * 100) / 100)));
        break;
      case 'loop': setLoopActive((v) => !v); break;
      case 'listen': setListening(true); break;
      case 'listen-off': setListening(false); break;
      case 'mode-rhythm': setMode('rhythm'); break;
      case 'mode-lead': setMode('lead'); break;
      case 'toggle-mode': setMode((m) => (m === 'rhythm' ? 'lead' : 'rhythm')); break;
      case 'status': /* deferred to speakStatus below */ queueMicrotask(() => speakStatusRef.current?.()); break;
      case 'closeup': setCloseupOpen((v) => !v); break;
      case 'count-in': setCountInEnabled((v) => !v); break;
      case 'narrate': {
        const bar = song.bars[Math.floor(beat / song.beatsPerBar)];
        const chord = bar?.chord ? CHORD_LIB[bar.chord] : null;
        if (chord) narrateChord(chord);
        break;
      }
      case 'spotlight': setSpotlightOn((v) => !v); break;
      case 'loop-a': toggleLoopA(); break;
      case 'loop-b': toggleLoopB(); break;
      case 'loop-clear': clearLoopAB(); break;
    }
  }, [song, beat, toggleLoopA, toggleLoopB, clearLoopAB, startAudio, pauseAudio]);

  const speakStatus = useCallback(() => {
    const barIdxNow = Math.floor(beat / song.beatsPerBar);
    const sec = [...song.sections].reverse().find((s) => s.barOffset <= barIdxNow);
    const bar = song.bars[barIdxNow];
    const bpm = Math.round(song.bpm * tempoScale);
    const parts = [
      playing ? 'Playing' : 'Paused',
      `${sec?.name ?? 'Song'}, bar ${barIdxNow + 1} of ${song.bars.length}`,
      bar?.chord ? `chord ${bar.chord}` : null,
      `${bpm} BPM`,
      loopActive ? 'loop on' : null,
      mode === 'lead' ? 'lead GODMODE' : 'rhythm',
    ].filter(Boolean);
    speak(parts.join(', '), { rate: 1.2, priority: 'replace' });
  }, [beat, song, tempoScale, playing, loopActive, mode]);

  // Keep a ref to speakStatus so the voice dispatcher can call it without
  // re-subscribing to every status-dependent change (mode, beat, etc.).
  useEffect(() => { speakStatusRef.current = speakStatus; }, [speakStatus]);

  // Voice command recognition lifecycle — placed after dispatchVoiceCommand
  // so the closure captures the latest dispatcher reference.
  useEffect(() => {
    if (!voiceCmdOn) {
      voiceRef.current?.stop();
      voiceRef.current = null;
      return;
    }
    const rec = new VoiceRecognizer({
      onFinalTranscript: (text) => {
        if (importOpen || trainerOpen || closeupOpen) return;
        const cmd = parseCommand(text);
        if (cmd) dispatchVoiceCommand(cmd);
      },
      onError: (msg) => {
        setVoiceError(msg);
        setVoiceCmdOn(false);
      },
    });
    voiceRef.current = rec;
    rec.start();
    return () => {
      rec.stop();
      voiceRef.current = null;
    };
  }, [voiceCmdOn, importOpen, trainerOpen, closeupOpen, dispatchVoiceCommand]);

  const onPlayPause = useCallback(() => {
    primeAudio();
    const t = transportRef.current;
    if (!t) return;
    if (t.isPlaying()) {
      t.pause();
      pauseAudio();
      setCountIn(0);
      return;
    }
    if (countInEnabled) runCountIn();
    else {
      t.play();
      startAudio();
    }
  }, [countInEnabled, runCountIn, pauseAudio, startAudio]);
  const onRestart = useCallback(() => {
    transportRef.current?.seek(0);
    stopVoice();
  }, []);
  const onPrev = useCallback(() => {
    transportRef.current?.seekBars(-1, song.beatsPerBar);
  }, []);
  const onNext = useCallback(() => {
    transportRef.current?.seekBars(1, song.beatsPerBar);
  }, []);

  // Keyboard shortcuts — Space play/pause, ←/→ scrub by bar, R restart, M mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.code === 'Space') { e.preventDefault(); onPlayPause(); }
      else if (e.code === 'ArrowRight') onNext();
      else if (e.code === 'ArrowLeft') onPrev();
      else if (e.key.toLowerCase() === 'r') onRestart();
      else if (e.key.toLowerCase() === 'm') setMode((m) => m === 'rhythm' ? 'lead' : 'rhythm');
      else if (e.key.toLowerCase() === 'z') setCloseupOpen((v) => !v);
      else if (e.key.toLowerCase() === 'i') setImportOpen((v) => !v);
      else if (e.key.toLowerCase() === 'l') { setMicError(null); setListening((v) => !v); }
      else if (e.key === '?' || e.key === '/') { e.preventDefault(); speakStatus(); }
      else if (e.key.toLowerCase() === 't') setTrainerOpen((v) => !v);
      else if (e.key.toLowerCase() === 'g') setRampOpen((v) => !v);
      else if (e.key.toLowerCase() === 'v') { setVoiceError(null); setVoiceCmdOn((v) => !v); }
      else if (e.key.toLowerCase() === 'f') setSpotlightOn((v) => !v);
      else if (e.key.toLowerCase() === 'd') {
        const bar = song.bars[Math.floor(beat / song.beatsPerBar)];
        const chord = bar?.chord ? CHORD_LIB[bar.chord] : null;
        if (chord) narrateChord(chord);
      }
      else if (e.key === '[') { e.preventDefault(); toggleLoopA(); }
      else if (e.key === ']') { e.preventDefault(); toggleLoopB(); }
      else if (e.key === '\\') { e.preventDefault(); clearLoopAB(); }
      else if (e.key.toLowerCase() === 'a') { if (trackLoaded) { e.preventDefault(); onToggleTrack(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlayPause, onNext, onPrev, onRestart, speakStatus, song, beat, toggleLoopA, toggleLoopB, clearLoopAB, trackLoaded, onToggleTrack]);

  const currentSection = [...song.sections].reverse().find((s) => s.barOffset <= Math.floor(beat / song.beatsPerBar)) ?? song.sections[0];
  const currentBar = song.bars[Math.floor(beat / song.beatsPerBar)];
  const lyricLine = (() => {
    if (!showLyrics) return null;
    const relBar = Math.floor(beat / song.beatsPerBar) - currentSection.barOffset;
    return currentSection.lyrics?.[relBar] ?? null;
  })();

  const rhythmChordSizeRaw = chordSize === 'xxl' ? 'xxl' : chordSize === 'xl' ? 'xl' : 'lg';
  const leadChordSizeRaw = chordSize === 'md' ? 'md' : chordSize === 'lg' ? 'lg' : 'xl';
  // On phones, cap the chord-box size so it can't overflow the viewport.
  const rhythmChordSize = isNarrow ? (rhythmChordSizeRaw === 'xxl' ? 'xl' : rhythmChordSizeRaw === 'xl' ? 'lg' : 'lg') : rhythmChordSizeRaw;
  const leadChordSize = isNarrow ? (leadChordSizeRaw === 'xl' ? 'lg' : leadChordSizeRaw) : leadChordSizeRaw;

  return (
    <div className="gg-app">
      <a href="#gg-main" className="gg-skip-link">Skip to main content</a>

      {/* Global live region for low-vision / screen-reader status updates. */}
      <div className="gg-live-status" role="status" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {/* Global finger-pattern defs — referenced by pattern-encoded fills in any SVG. */}
      <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}>
        <FingerPatternDefs />
      </svg>

      <FocusSpotlight enabled={spotlightOn} />

      {voiceToast && (
        <div className="gg-voice-toast" aria-live="polite">
          🗣 {voiceToast}
        </div>
      )}
      <header className="gg-topbar" role="banner">
        <div>
          <div className="gg-title-sub">
            Guitar Guru
            {typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches && (
              <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 8px', background: 'var(--accent-blue)', color: '#fff', borderRadius: 999, letterSpacing: '0.12em' }}>
                INSTALLED
              </span>
            )}
          </div>
          <h1>{song.title}</h1>
          <div style={{ color: 'var(--ink-mute)', fontWeight: 700, fontSize: 14, marginTop: 2 }}>
            {song.artist}
          </div>
        </div>
        <ModeSwitch mode={mode} onChange={(m) => { setMode(m); announce(m === 'rhythm' ? 'Rhythm mode' : 'Lead GODMODE'); }} />
      </header>

      <main className="gg-main" id="gg-main" tabIndex={-1}>
        <section className="gg-stage" aria-label={mode === 'rhythm' ? 'Rhythm guitar display' : 'Lead GODMODE display'}>
          {mode === 'rhythm' ? (
            <RhythmView
              song={song}
              beat={beat}
              beatPhase={beatPhase}
              chordSize={rhythmChordSize}
              encoding={fingerEncoding}
              onOpenCloseup={() => setCloseupOpen(true)}
            />
          ) : (
            <LeadGodmodeView
              song={song}
              beat={beat}
              beatPhase={beatPhase}
              chordSize={leadChordSize}
              showTab={showTab}
              encoding={fingerEncoding}
              loopA={loopA}
              loopB={loopB}
              onOpenCloseup={() => setCloseupOpen(true)}
              barWindow={isNarrow ? 2 : 3}
            />
          )}
          {countIn > 0 && (
            <div className="gg-countin-overlay" aria-live="assertive" aria-label={`Count-in ${countIn}`}>
              {countIn}
            </div>
          )}
        </section>

        {closeupOpen && currentBar?.chord && CHORD_LIB[currentBar.chord] && (
          <FingerCloseup
            chord={CHORD_LIB[currentBar.chord]}
            onClose={() => setCloseupOpen(false)}
          />
        )}

        {importOpen && (
          <SongImportDialog
            currentSong={song}
            onApply={(next) => {
              const prevAudio = song.audio;
              const nextAudio = next.audio;
              const attached = !prevAudio && !!nextAudio;
              const modeChanged = !!prevAudio && !!nextAudio && prevAudio.mode !== nextAudio.mode;
              if ((attached || modeChanged) && nextAudio) {
                if (nextAudio.mode === 'playalong' || nextAudio.mode === 'teacher') {
                  setSynthOn(false);
                }
                if (nextAudio.mode === 'teacher') setVoice(true);
                else if (nextAudio.mode === 'playalong') setVoice(false);
                setMetronome(false);
              }
              setSong(next);
              transportRef.current?.seek(0);
              stopVoice();
              setImportOpen(false);
            }}
            onReset={() => {
              setSong(SAMPLE_SONG);
              transportRef.current?.seek(0);
              stopVoice();
              setImportOpen(false);
            }}
            onClose={() => setImportOpen(false)}
          />
        )}

        {trainerOpen && (
          <ChordChangeTrainer onClose={() => setTrainerOpen(false)} />
        )}

        {rampOpen && (
          <TempoRampTrainer song={song} onClose={() => setRampOpen(false)} />
        )}

        <aside className="gg-sidepanel">
          <div className="gg-card">
            <h3>Now playing</h3>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 44, fontWeight: 900 }}>{currentBar?.chord ?? '—'}</div>
              <div style={{ color: 'var(--ink-mute)', fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {currentSection.name}
              </div>
            </div>
            {lyricLine && (
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', fontStyle: 'italic' }}>
                “{lyricLine}”
              </div>
            )}
            <button
              onClick={() => setImportOpen(true)}
              style={{
                marginTop: 12, padding: '10px 14px', width: '100%',
                fontSize: 14, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                background: 'var(--bg-alt)', color: 'var(--ink)',
                border: '3px solid var(--ink)', borderRadius: 8, cursor: 'pointer',
                boxShadow: '3px 3px 0 var(--ink)',
              }}>
              ✎ Change song
            </button>
          </div>

          {(installPrompt || installState === 'installed') && (
            <div className="gg-card" style={{ borderColor: 'var(--accent-blue)' }}>
              <h3 style={{ color: 'var(--accent-blue)' }}>Install app</h3>
              {installState === 'installed' ? (
                <div style={{ fontWeight: 800 }}>✓ Installed on this device.</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginBottom: 10 }}>
                    Install Guitar Guru as a standalone app — works offline, launches full-screen on your tablet or phone.
                  </div>
                  <button
                    onClick={async () => {
                      if (!installPrompt) return;
                      const result = await installPrompt();
                      if (result === 'accepted') setInstallState('installed');
                      setInstallPrompt(null);
                    }}
                    style={{
                      padding: '14px 16px', width: '100%',
                      fontSize: 15, fontWeight: 900, letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: 'var(--accent-blue)', color: '#fff',
                      border: '3px solid var(--ink)', borderRadius: 10, cursor: 'pointer',
                      boxShadow: '3px 3px 0 var(--ink)',
                      fontFamily: 'inherit',
                    }}>
                    📲 Install on device
                  </button>
                </>
              )}
            </div>
          )}

          <div className="gg-card gg-bpm-readout">
            <span>♩ =</span>
            <b>{Math.round(song.bpm * tempoScale)}</b>
            <span style={{ color: 'var(--ink-mute)', fontWeight: 700, fontSize: 14 }}>BPM · {song.beatsPerBar}/4</span>
          </div>

          {song.audio && trackLoaded && (
            <div className="gg-card" style={{ borderColor: 'var(--accent)' }}>
              <h3 style={{ color: 'var(--accent)' }}>🎵 Track</h3>
              <div style={{ fontSize: 15, fontWeight: 800, wordBreak: 'break-all' }}>
                {song.audio.source.kind === 'blob'
                  ? song.audio.filename ?? 'Attached file'
                  : song.audio.source.url}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', fontWeight: 700, marginTop: 4 }}>
                {song.audio.mode === 'playalong' ? 'Play-along' : song.audio.mode === 'backing' ? 'Backing track' : 'Teacher track'}
                {trackOn ? ' · on' : ' · muted'} · offset {song.audio.offsetSec.toFixed(2)}s
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>
                Press <b>A</b> to toggle
              </div>
            </div>
          )}

          {(loopA !== null || loopB !== null) && (
            <div className="gg-card" style={{ borderColor: 'var(--accent)' }}>
              <h3 style={{ color: 'var(--accent)' }}>A–B loop</h3>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {loopA !== null && loopB !== null && loopA < loopB
                  ? <>Bar {loopA + 1} → {loopB + 1} · {(loopB - loopA + 1) * song.beatsPerBar} beats</>
                  : loopA !== null
                    ? <>A at bar {loopA + 1} · set <b>B</b> to finish</>
                    : <>B at bar {(loopB ?? 0) + 1} · set <b>A</b> to finish</>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>
                <b>[</b> set A · <b>]</b> set B · <b>\</b> clear
              </div>
            </div>
          )}

          <div className="gg-card">
            <h3>Practice trainers</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => setTrainerOpen(true)} style={sidebarBtn}>
                ⏱  Chord changes / minute <span style={kbd}>T</span>
              </button>
              <button onClick={() => setRampOpen(true)} style={sidebarBtn}>
                📈  Tempo ramp <span style={kbd}>G</span>
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 6 }}>
              Mic-driven drills that track accuracy and auto-adjust tempo.
            </div>
          </div>

          {voiceSupported() && (
            <div className="gg-card gg-listen-card">
              <h3>Voice commands</h3>
              <button
                className={`gg-listen-btn${voiceCmdOn ? ' on' : ''}`}
                onClick={() => { setVoiceError(null); setVoiceCmdOn((v) => !v); }}
                aria-pressed={voiceCmdOn}>
                {voiceCmdOn ? '● Listening for commands' : '🗣  Turn on voice control'}
              </button>
              {voiceCmdOn && (
                <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 8, lineHeight: 1.5 }}>
                  Say: <b>play</b> / <b>pause</b> / <b>next</b> / <b>back</b> / <b>restart</b> / <b>half speed</b> / <b>full speed</b> / <b>slower</b> / <b>faster</b> / <b>loop</b> / <b>zoom</b> / <b>where am I</b> / <b>rhythm</b> / <b>god mode</b>.
                </div>
              )}
              {voiceError && (
                <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13, marginTop: 6 }}>
                  {voiceError}
                </div>
              )}
            </div>
          )}

          <div className="gg-card gg-listen-card">
            <h3>Listen mode</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                className={`gg-listen-btn${listening ? ' on' : ''}`}
                onClick={() => { setMicError(null); setListening((v) => !v); }}
                aria-pressed={listening}>
                {listening ? '● Listening — tap to stop' : '🎧 Turn on microphone'}
              </button>
              {listening && (
                <button
                  className={`gg-listen-btn subtle${autoAdvance ? ' on' : ''}`}
                  onClick={() => setAutoAdvance((v) => !v)}
                  aria-pressed={autoAdvance}>
                  {autoAdvance ? '✓ Auto-advance on chord match' : 'Auto-advance on chord match'}
                </button>
              )}
              {listening && (
                <div className="gg-hearing" aria-live="polite">
                  {hearing ? (
                    <>
                      <span className="label">Hearing</span>
                      <b>{hearing.chord}</b>
                      <span className="score">{Math.round(hearing.score * 100)}%</span>
                    </>
                  ) : (
                    <span className="label quiet">Play a chord…</span>
                  )}
                </div>
              )}
              {micError && (
                <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
                  Mic error: {micError}
                </div>
              )}
            </div>
          </div>

          {showFingers && (
            <div className="gg-card">
              <h3>Finger {fingerEncoding === 'pattern' ? 'patterns' : 'colours'}</h3>
              <FingerLegend size={36} encoding={fingerEncoding} />
              <div className="row" style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                <button
                  className="toggle"
                  aria-pressed={fingerEncoding === 'color'}
                  onClick={() => setFingerEncoding('color')}
                  style={toggleBtn}>
                  Colour
                </button>
                <button
                  className="toggle"
                  aria-pressed={fingerEncoding === 'pattern'}
                  onClick={() => setFingerEncoding('pattern')}
                  style={toggleBtn}>
                  Pattern + colour
                </button>
              </div>
            </div>
          )}

          <div className="gg-card">
            <h3>Accessibility extras</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={() => {
                  const bar = song.bars[Math.floor(beat / song.beatsPerBar)];
                  const chord = bar?.chord ? CHORD_LIB[bar.chord] : null;
                  if (chord) narrateChord(chord);
                }}
                style={sidebarBtn}>
                🔊  Narrate current chord <span style={kbd}>D</span>
              </button>
              <button
                aria-pressed={spotlightOn}
                onClick={() => setSpotlightOn((v) => !v)}
                style={spotlightOn ? sidebarBtnActive : sidebarBtn}>
                {spotlightOn ? '✓ Focus spotlight' : '🔦  Focus spotlight'} <span style={kbd}>F</span>
              </button>
              <button
                aria-pressed={fingerSonification}
                onClick={() => {
                  try { primeFingerAudio(); } catch { /* ignore */ }
                  setFingerSonification((v) => !v);
                }}
                style={fingerSonification ? sidebarBtnActive : sidebarBtn}>
                {fingerSonification ? '✓ Finger sonification' : '🎵  Finger sonification'}
              </button>
            </div>
          </div>

          <TweaksPanel
            theme={theme}
            density={density}
            chordSize={chordSize}
            showLyrics={showLyrics}
            showFingers={showFingers}
            onTheme={setTheme}
            onDensity={setDensity}
            onChordSize={setChordSize}
            onShowLyrics={setShowLyrics}
            onShowFingers={setShowFingers}
          />
        </aside>
      </main>

      <footer className="gg-footer" role="contentinfo">
        <div style={{ flex: 1, minWidth: 0 }}>
          <PlaybackControls
            playing={playing}
            tempoScale={tempoScale}
            loopActive={loopActive}
            metronome={metronome}
            voice={voice}
            countIn={countInEnabled}
            synth={synthOn}
            haptics={hapticsOn}
            hapticsAvailable={hapticsSupported()}
            showTab={showTab}
            showTabToggleEnabled={mode === 'lead'}
            loopA={loopA}
            loopB={loopB}
            onPlayPause={onPlayPause}
            onPrev={onPrev}
            onNext={onNext}
            onRestart={onRestart}
            onTempo={(s) => { setTempoScale(s); announce(`Tempo ${Math.round(s * 100)}%`); }}
            onToggleLoop={() => setLoopActive((v) => { announce(v ? 'Loop off' : 'Loop on'); return !v; })}
            onToggleMetronome={() => setMetronome((v) => { announce(v ? 'Metronome off' : 'Metronome on'); return !v; })}
            onToggleCountIn={() => setCountInEnabled((v) => { announce(v ? 'Count-in off' : 'Count-in on'); return !v; })}
            onToggleSynth={() => setSynthOn((v) => { announce(v ? 'Synth off' : 'Synth on'); return !v; })}
            onToggleHaptics={() => setHapticsOn((v) => { announce(v ? 'Haptics off' : 'Haptics on'); return !v; })}
            onToggleTab={() => setShowTab((v) => { announce(v ? 'Tab hidden' : 'Tab visible'); return !v; })}
            onToggleLoopA={toggleLoopA}
            onToggleLoopB={toggleLoopB}
            onClearLoopAB={clearLoopAB}
            trackLoaded={trackLoaded}
            trackOn={trackOn}
            stretchSupported={stretchSupported}
            onToggleTrack={onToggleTrack}
            onToggleVoice={() => {
              setVoice((v) => {
                if (v) stopVoice();
                return !v;
              });
            }}
          />
          <div style={{ marginTop: 8, fontSize: 13, textAlign: 'center' }}>
            Shortcuts: <b>Space</b> play · <b>← →</b> bar · <b>R</b> restart · <b>M</b> mode · <b>Z</b> close-up · <b>I</b> import · <b>L</b> listen · <b>V</b> voice · <b>?</b> status · <b>T</b> trainer · <b>G</b> ramp · <b>D</b> narrate · <b>F</b> focus · <b>[ ]</b> A/B loop · <b>\</b> clear · <b>A</b> track ·
            {' '}
            {Object.keys(CHORD_LIB).length} chord shapes loaded
          </div>
        </div>
      </footer>
    </div>
  );
}
