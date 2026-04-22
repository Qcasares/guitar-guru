# Real Recorded Audio Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a GuitarGuru user attach a recorded audio track (local file or URL) to any song and play it in sync with chord/tab playback across play-along, backing-track, and teacher modes, with pitch-preserving tempo stretch, auto-detected beat-1, and IndexedDB persistence.

**Architecture:** Transport stays the master clock. A new `AudioTrack` class owns an `HTMLAudioElement` routed through the existing `AudioContext` via `MediaElementAudioSourceNode`; `preservesPitch + playbackRate` drives tempo stretch. Blobs live in IndexedDB keyed by UUID; the song JSON carries the reference. Auto-detect runs an offline onset search on the first 15 s at attach time. UI additions land in `SongImportDialog` (attach section) and `PlaybackControls` (TRACK toggle + stretch badge).

**Tech Stack:** TypeScript, React 18, Vite, Web Audio API, IndexedDB, Vitest (new), fake-indexeddb (new).

**Spec:** `docs/superpowers/specs/2026-04-22-real-recorded-audio-track-design.md`

---

## File Structure

**New files:**
- `src/audio/audio-track.ts` — `AudioTrack` class + `findFirstOnset` pure helper + `detectBeatOneFromBuffer` (decodes via OfflineAudioContext).
- `src/lib/audio-storage.ts` — IndexedDB CRUD for audio blobs.
- `src/audio/__tests__/audio-track.test.ts` — unit tests for `findFirstOnset`.
- `src/lib/__tests__/audio-storage.test.ts` — unit tests for the IndexedDB wrapper (uses fake-indexeddb).
- `src/music/__tests__/song-parser-audio.test.ts` — parse + serialize round-trip for `Audio:` / `AudioOffset:` / `AudioMode:`.
- `vitest.config.ts` — Vitest config (jsdom + fake-indexeddb global setup).
- `src/test-setup.ts` — boots fake-indexeddb into `globalThis.indexedDB` for tests.

**Modified files:**
- `src/music/types.ts` — add `AudioTrackRef`, extend `Song`.
- `src/music/song-parser.ts` — extend `META_RE`; carry audio headers through `parseChordGrid`; emit them from `songToChordGrid` for URL sources; emit a warning for blob sources.
- `src/components/SongImportDialog.tsx` — new "🎵 Audio track" section with attach/URL/mode/offset/re-detect.
- `src/components/PlaybackControls.tsx` — `TRACK` toggle + stretch badge + props.
- `src/App.tsx` — own `AudioTrack` lifecycle, wire it to transport play/pause/seek/tempo/loop, boot GC, object-URL mgmt, sidepanel card, `A` keyboard shortcut.
- `package.json` — add `vitest`, `jsdom`, `fake-indexeddb`, `test` / `test:run` scripts.
- `README.md` — update keyboard row (add `A`), add "Audio tracks" section.
- `docs/ACCESSIBILITY.md` — one-line update noting the new `A` shortcut.

---

## Task 1: Vitest smoke test wired up

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/test-setup.ts`
- Create: `src/__tests__/smoke.test.ts`

- [ ] **Step 1.1: Install Vitest + jsdom + fake-indexeddb**

Run:
```
npm install --save-dev vitest@^2 jsdom@^25 fake-indexeddb@^6 @types/node
```

- [ ] **Step 1.2: Add test scripts to package.json**

Edit `package.json` scripts block to add:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 1.3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 1.4: Create `src/test-setup.ts`**

```ts
import 'fake-indexeddb/auto';
```

- [ ] **Step 1.5: Create `src/__tests__/smoke.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });

  it('has indexedDB available via fake-indexeddb', () => {
    expect(typeof indexedDB).toBe('object');
    expect(indexedDB).toBeTruthy();
  });
});
```

- [ ] **Step 1.6: Run the smoke test**

Run: `npm run test:run`
Expected: `2 passed` with `smoke.test.ts` listed. If vitest reports an unknown environment, confirm `jsdom` is installed.

- [ ] **Step 1.7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test-setup.ts src/__tests__/smoke.test.ts
git commit -m "chore(test): add vitest + jsdom + fake-indexeddb harness"
```

---

## Task 2: `AudioTrackRef` type

**Files:**
- Modify: `src/music/types.ts`

- [ ] **Step 2.1: Add `AudioTrackRef` and extend `Song`**

Append to `src/music/types.ts` (below the existing `Song` interface; also extend `Song`):

```ts
export type AudioSource =
  | { kind: 'blob'; blobId: string }
  | { kind: 'url'; url: string };

export type AudioMode = 'playalong' | 'backing' | 'teacher';

export interface AudioTrackRef {
  source: AudioSource;
  /** Audio-timeline seconds that correspond to beat 1 of the song. */
  offsetSec: number;
  mode: AudioMode;
  /** Cached from `loadedmetadata`, used for the sidepanel readout. */
  durationSec?: number;
  /** Display only — original filename for blob sources. */
  filename?: string;
}
```

Update the existing `Song` interface to include `audio?: AudioTrackRef;`.

- [ ] **Step 2.2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean (no errors in repo).

- [ ] **Step 2.3: Commit**

```bash
git add src/music/types.ts
git commit -m "feat(types): add AudioTrackRef and Song.audio"
```

---

## Task 3: Parse `Audio:` / `AudioOffset:` / `AudioMode:` headers

**Files:**
- Modify: `src/music/song-parser.ts`
- Create: `src/music/__tests__/song-parser-audio.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `src/music/__tests__/song-parser-audio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseChordGrid, songToChordGrid } from '../song-parser';

describe('song-parser audio headers', () => {
  it('parses Audio URL header', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song, errors } = parseChordGrid(text);
    expect(errors).toEqual([]);
    expect(song?.audio).toEqual({
      source: { kind: 'url', url: 'https://example.com/song.mp3' },
      offsetSec: 0,
      mode: 'playalong',
    });
  });

  it('parses AudioOffset and AudioMode', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioOffset: 3.42',
      'AudioMode: teacher',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    expect(song?.audio?.offsetSec).toBeCloseTo(3.42, 2);
    expect(song?.audio?.mode).toBe('teacher');
  });

  it('ignores AudioOffset/AudioMode when Audio is absent', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'AudioOffset: 3.42',
      'AudioMode: teacher',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    expect(song?.audio).toBeUndefined();
  });

  it('falls back to playalong for an unknown AudioMode', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioMode: frobozz',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    expect(song?.audio?.mode).toBe('playalong');
  });
});
```

- [ ] **Step 3.2: Run the tests — confirm they fail**

Run: `npm run test:run -- song-parser-audio`
Expected: 4 failing tests, all with `song.audio` undefined.

- [ ] **Step 3.3: Extend `song-parser.ts` to parse the headers**

In `src/music/song-parser.ts`:

Replace `const META_RE = /^(title|artist|bpm|time)\s*:\s*(.+)$/i;` with:
```ts
const META_RE = /^(title|artist|bpm|time|audio|audiooffset|audiomode)\s*:\s*(.+)$/i;
```

Add, above `parseChordGrid`, a helper:
```ts
function normalizeAudioMode(value: string): import('./types').AudioMode {
  const v = value.trim().toLowerCase();
  if (v === 'backing' || v === 'teacher') return v;
  return 'playalong';
}
```

Inside `parseChordGrid`, declare three locals near the other meta state:
```ts
let audioUrl: string | null = null;
let audioOffsetSec = 0;
let audioMode: import('./types').AudioMode = 'playalong';
```

Inside the `if (meta)` block, extend the key dispatch (add after the existing `time` handler):
```ts
else if (key === 'audio') audioUrl = value;
else if (key === 'audiooffset') {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) audioOffsetSec = n;
}
else if (key === 'audiomode') audioMode = normalizeAudioMode(value);
```

At the point the `Song` is constructed, attach audio when `audioUrl` is set:
```ts
const song: Song = {
  title,
  artist,
  bpm,
  beatsPerBar,
  sections,
  bars,
  ...(audioUrl
    ? {
        audio: {
          source: { kind: 'url' as const, url: audioUrl },
          offsetSec: audioOffsetSec,
          mode: audioMode,
        },
      }
    : {}),
};
```

- [ ] **Step 3.4: Run the tests — confirm they pass**

Run: `npm run test:run -- song-parser-audio`
Expected: 4 passing.

- [ ] **Step 3.5: Commit**

```bash
git add src/music/song-parser.ts src/music/__tests__/song-parser-audio.test.ts
git commit -m "feat(song-parser): parse Audio / AudioOffset / AudioMode headers"
```

---

## Task 4: Serialize audio headers from `songToChordGrid`

**Files:**
- Modify: `src/music/song-parser.ts`
- Modify: `src/music/__tests__/song-parser-audio.test.ts`

- [ ] **Step 4.1: Extend the test file with serialization cases**

Append to `src/music/__tests__/song-parser-audio.test.ts`:

```ts
describe('songToChordGrid audio headers', () => {
  it('emits Audio/AudioOffset/AudioMode for URL sources', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioOffset: 3.42',
      'AudioMode: backing',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const { song } = parseChordGrid(text);
    const out = songToChordGrid(song!);
    expect(out).toContain('Audio: https://example.com/song.mp3');
    expect(out).toContain('AudioOffset: 3.42');
    expect(out).toContain('AudioMode: backing');
  });

  it('round-trips URL audio through parse/serialize/parse', () => {
    const text = [
      'Title: Demo',
      'BPM: 100',
      'Audio: https://example.com/song.mp3',
      'AudioOffset: 1.25',
      'AudioMode: teacher',
      '',
      '[A]',
      'G D',
    ].join('\n');
    const first = parseChordGrid(text).song!;
    const serialized = songToChordGrid(first);
    const second = parseChordGrid(serialized).song!;
    expect(second.audio).toEqual(first.audio);
  });

  it('omits Audio for blob sources and does not crash', () => {
    const song = parseChordGrid(['Title: Demo', 'BPM: 100', '', '[A]', 'G D'].join('\n')).song!;
    const withBlob = {
      ...song,
      audio: {
        source: { kind: 'blob' as const, blobId: 'abc' },
        offsetSec: 0,
        mode: 'playalong' as const,
      },
    };
    const out = songToChordGrid(withBlob);
    expect(out).not.toContain('Audio:');
    expect(out).not.toContain('AudioOffset');
    expect(out).not.toContain('AudioMode');
  });
});
```

- [ ] **Step 4.2: Run the tests — confirm they fail**

Run: `npm run test:run -- song-parser-audio`
Expected: 3 new failing tests.

- [ ] **Step 4.3: Update `songToChordGrid`**

In `src/music/song-parser.ts`, inside `songToChordGrid` between the `Time:` emission and the blank line, add:

```ts
if (song.audio && song.audio.source.kind === 'url') {
  lines.push(`Audio: ${song.audio.source.url}`);
  if (song.audio.offsetSec > 0) {
    lines.push(`AudioOffset: ${song.audio.offsetSec}`);
  }
  if (song.audio.mode !== 'playalong') {
    lines.push(`AudioMode: ${song.audio.mode}`);
  }
}
```

The first failing test expects `AudioMode: backing` regardless of default — but that test uses `backing`, which is not the default, so emission triggers. The offset `3.42` is > 0 so that emits too. Good.

- [ ] **Step 4.4: Run the tests — confirm they pass**

Run: `npm run test:run -- song-parser-audio`
Expected: all 7 passing.

- [ ] **Step 4.5: Commit**

```bash
git add src/music/song-parser.ts src/music/__tests__/song-parser-audio.test.ts
git commit -m "feat(song-parser): serialize Audio headers for URL sources"
```

---

## Task 5: `findFirstOnset` pure helper

**Files:**
- Create: `src/audio/audio-track.ts`
- Create: `src/audio/__tests__/audio-track.test.ts`

- [ ] **Step 5.1: Write failing tests for `findFirstOnset`**

Create `src/audio/__tests__/audio-track.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { findFirstOnset } from '../audio-track';

/** Generate silence + a single 20ms triangle-ramp "click" at `clickAtSec`. */
function makeClickSamples(durationSec: number, sampleRate: number, clickAtSec: number): Float32Array {
  const total = Math.floor(durationSec * sampleRate);
  const buf = new Float32Array(total);
  const clickStart = Math.floor(clickAtSec * sampleRate);
  const clickLen = Math.floor(0.02 * sampleRate);
  for (let i = 0; i < clickLen && clickStart + i < total; i++) {
    const t = i / clickLen;
    const env = t < 0.5 ? t * 2 : (1 - t) * 2;
    buf[clickStart + i] = env;
  }
  return buf;
}

describe('findFirstOnset', () => {
  const SR = 44100;

  it('finds an onset at ~1.0s', () => {
    const samples = makeClickSamples(3, SR, 1.0);
    const t = findFirstOnset(samples, SR);
    expect(t).toBeGreaterThan(0.9);
    expect(t).toBeLessThan(1.1);
  });

  it('finds an onset at the very start when there is no silence lead-in', () => {
    const samples = makeClickSamples(3, SR, 0.0);
    const t = findFirstOnset(samples, SR);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(0.1);
  });

  it('returns 0 when nothing is above threshold', () => {
    const samples = new Float32Array(SR * 2); // all silence
    const t = findFirstOnset(samples, SR);
    expect(t).toBe(0);
  });

  it('ignores onsets below the silence-exit rule (brief spike inside noise)', () => {
    // Noise floor at 0.01, a louder peak at 1.5s. Silence-exit rule requires
    // a ≥200ms sustained run below 0.02 before a peak qualifies; the first
    // 1.5s of noise at 0.01 satisfies that, so onset at 1.5s should be found.
    const samples = new Float32Array(SR * 3);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0.01 * Math.sin(i * 0.1);
    }
    const peakStart = Math.floor(1.5 * SR);
    for (let i = 0; i < 0.02 * SR; i++) {
      samples[peakStart + i] = 0.5;
    }
    const t = findFirstOnset(samples, SR);
    expect(t).toBeGreaterThan(1.4);
    expect(t).toBeLessThan(1.6);
  });
});
```

- [ ] **Step 5.2: Create `src/audio/audio-track.ts` with the helper**

```ts
// findFirstOnset returns the timestamp (seconds) of the first audible onset in
// `samples`, defined as the envelope crossing `ONSET_THRESHOLD` on the way up
// after a sustained ≥SILENCE_HOLD_MS run below `SILENCE_THRESHOLD`. Returns 0
// when the window has no qualifying onset.

const ONSET_THRESHOLD = 0.05;
const SILENCE_THRESHOLD = 0.02;
const SILENCE_HOLD_MS = 200;
const ENVELOPE_TAU_MS = 8;

export function findFirstOnset(samples: Float32Array, sampleRate: number): number {
  if (samples.length === 0) return 0;
  const frameSize = 256;
  const frameMs = (frameSize / sampleRate) * 1000;
  const alpha = 1 - Math.exp(-frameMs / ENVELOPE_TAU_MS);
  let env = 0;
  let prevEnv = 0;
  let silentFrames = Math.ceil(SILENCE_HOLD_MS / frameMs); // start as if we're already silent
  const silentFramesNeeded = Math.ceil(SILENCE_HOLD_MS / frameMs);

  for (let start = 0; start < samples.length; start += frameSize) {
    let peak = 0;
    const end = Math.min(start + frameSize, samples.length);
    for (let i = start; i < end; i++) {
      const v = samples[i];
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
    }
    prevEnv = env;
    env = env + alpha * (peak - env);

    if (env < SILENCE_THRESHOLD) {
      silentFrames++;
    } else {
      if (
        silentFrames >= silentFramesNeeded &&
        prevEnv <= ONSET_THRESHOLD &&
        env > ONSET_THRESHOLD
      ) {
        return start / sampleRate;
      }
      silentFrames = 0;
    }
  }
  return 0;
}
```

- [ ] **Step 5.3: Run the tests — expect pass**

Run: `npm run test:run -- audio-track`
Expected: 4 passing.

- [ ] **Step 5.4: Commit**

```bash
git add src/audio/audio-track.ts src/audio/__tests__/audio-track.test.ts
git commit -m "feat(audio): findFirstOnset helper for beat-1 auto-detect"
```

---

## Task 6: IndexedDB audio-blob storage

**Files:**
- Create: `src/lib/audio-storage.ts`
- Create: `src/lib/__tests__/audio-storage.test.ts`

- [ ] **Step 6.1: Write failing tests**

Create `src/lib/__tests__/audio-storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteBlob, getBlob, listBlobIds, putBlob, _resetDbForTests } from '../audio-storage';

describe('audio-storage', () => {
  beforeEach(async () => {
    await _resetDbForTests();
  });

  it('round-trips a blob', async () => {
    const data = new Uint8Array([1, 2, 3, 4]);
    const blob = new Blob([data], { type: 'audio/mpeg' });
    await putBlob('id-1', blob);
    const out = await getBlob('id-1');
    expect(out).not.toBeNull();
    const roundTripped = new Uint8Array(await out!.arrayBuffer());
    expect(Array.from(roundTripped)).toEqual([1, 2, 3, 4]);
  });

  it('returns null for a missing id', async () => {
    const out = await getBlob('does-not-exist');
    expect(out).toBeNull();
  });

  it('deleteBlob removes the entry', async () => {
    await putBlob('id-2', new Blob([new Uint8Array([9])]));
    await deleteBlob('id-2');
    const out = await getBlob('id-2');
    expect(out).toBeNull();
  });

  it('listBlobIds returns all current ids', async () => {
    await putBlob('a', new Blob(['x']));
    await putBlob('b', new Blob(['y']));
    const ids = await listBlobIds();
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 6.2: Run the tests — confirm they fail**

Run: `npm run test:run -- audio-storage`
Expected: 4 failing tests, all `Cannot find module '../audio-storage'`.

- [ ] **Step 6.3: Implement `src/lib/audio-storage.ts`**

```ts
// Thin IndexedDB wrapper for persisting audio blobs across sessions.
// Blobs are stored in the `blobs` object store, keyed by a string blobId
// generated by the caller (typically crypto.randomUUID()).

const DB_NAME = 'guitarguru-audio';
const DB_VERSION = 1;
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  await withStore('readwrite', (store) => store.put(blob, id));
}

export async function getBlob(id: string): Promise<Blob | null> {
  const result = await withStore<Blob | undefined>('readonly', (store) => store.get(id) as IDBRequest<Blob | undefined>);
  return result ?? null;
}

export async function deleteBlob(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export async function listBlobIds(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>('readonly', (store) => store.getAllKeys() as IDBRequest<IDBValidKey[]>);
  return keys.filter((k): k is string => typeof k === 'string');
}

/** Test-only hook to reset the shared db handle between tests. */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
```

- [ ] **Step 6.4: Run the tests — confirm they pass**

Run: `npm run test:run -- audio-storage`
Expected: 4 passing.

- [ ] **Step 6.5: Commit**

```bash
git add src/lib/audio-storage.ts src/lib/__tests__/audio-storage.test.ts
git commit -m "feat(storage): IndexedDB wrapper for audio blobs"
```

---

## Task 7: `AudioTrack` class — load + play + pause lifecycle

**Files:**
- Modify: `src/audio/audio-track.ts`

- [ ] **Step 7.1: Append the `AudioTrack` class**

Add to `src/audio/audio-track.ts` (below `findFirstOnset`):

```ts
export interface AudioTrackOpts {
  audioContext: AudioContext;
  /** Fires when the media naturally ends mid-song. App shows a toast. */
  onEnded?: () => void;
  /** Fires when the media fails to load or errors during playback. */
  onError?: (message: string) => void;
}

export class AudioTrack {
  private readonly audioEl: HTMLAudioElement;
  private readonly ctx: AudioContext;
  private source: MediaElementAudioSourceNode | null = null;
  private gain: GainNode;
  private muted = false;
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private expectedStartSec = 0;
  private expectedStartedAt = 0;
  private tempoScale = 1;

  constructor(opts: AudioTrackOpts) {
    this.ctx = opts.audioContext;
    this.audioEl = new Audio();
    this.audioEl.crossOrigin = 'anonymous';
    this.audioEl.preload = 'auto';
    (this.audioEl as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 1;
    this.gain.connect(this.ctx.destination);

    this.audioEl.addEventListener('ended', () => opts.onEnded?.());
    this.audioEl.addEventListener('error', () => {
      const err = this.audioEl.error;
      opts.onError?.(err ? `audio error ${err.code}` : 'audio error');
    });
  }

  /** Load a URL (object-URL for blob sources, direct URL otherwise). */
  async load(url: string): Promise<{ durationSec: number }> {
    this.audioEl.src = url;
    await new Promise<void>((resolve, reject) => {
      const onMeta = () => {
        this.audioEl.removeEventListener('loadedmetadata', onMeta);
        this.audioEl.removeEventListener('error', onErr);
        resolve();
      };
      const onErr = () => {
        this.audioEl.removeEventListener('loadedmetadata', onMeta);
        this.audioEl.removeEventListener('error', onErr);
        reject(new Error('audio load failed'));
      };
      this.audioEl.addEventListener('loadedmetadata', onMeta);
      this.audioEl.addEventListener('error', onErr);
    });

    // Attach source node once per element — re-creating it across loads throws.
    if (!this.source) {
      this.source = this.ctx.createMediaElementSource(this.audioEl);
      this.source.connect(this.gain);
    }

    return { durationSec: this.audioEl.duration };
  }

  isLoaded(): boolean {
    return !!this.source;
  }

  mute(value: boolean): void {
    this.muted = value;
    this.gain.gain.value = value ? 0 : 1;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** Seek audio to match `beat` using `bpm` and offset. Caller is responsible for resuming. */
  async seekToBeat(beat: number, bpm: number, offsetSec: number): Promise<void> {
    const audioTime = offsetSec + (beat * 60) / bpm;
    const dur = this.audioEl.duration;
    const clamped = Number.isFinite(dur) && dur > 0 ? Math.max(0, Math.min(dur - 0.01, audioTime)) : Math.max(0, audioTime);
    await this.fadeAround(() => {
      this.audioEl.currentTime = clamped;
    });
  }

  async play(beat: number, bpm: number, offsetSec: number, tempoScale: number): Promise<void> {
    this.setTempoScale(tempoScale);
    await this.seekToBeat(beat, bpm, offsetSec);
    this.expectedStartSec = this.audioEl.currentTime;
    this.expectedStartedAt = performance.now();
    try {
      await this.audioEl.play();
    } catch (err) {
      // Autoplay restrictions — caller should surface a prompt.
      throw err;
    }
    this.startDriftWatch(bpm, offsetSec, tempoScale);
  }

  pause(): void {
    this.audioEl.pause();
    this.stopDriftWatch();
  }

  setTempoScale(scale: number): void {
    this.tempoScale = scale;
    this.audioEl.playbackRate = scale;
  }

  dispose(): void {
    this.stopDriftWatch();
    try {
      this.audioEl.pause();
      this.audioEl.removeAttribute('src');
      this.audioEl.load();
    } catch {
      /* ignore */
    }
  }

  /** 10ms gain ramp down → run `mutator` → 10ms gain ramp up, to mask seek clicks. */
  private async fadeAround(mutator: () => void): Promise<void> {
    const now = this.ctx.currentTime;
    const target = this.muted ? 0 : 1;
    this.gain.gain.cancelScheduledValues(now);
    this.gain.gain.setValueAtTime(this.gain.gain.value, now);
    this.gain.gain.linearRampToValueAtTime(0, now + 0.01);
    await new Promise((r) => setTimeout(r, 12));
    mutator();
    const after = this.ctx.currentTime;
    this.gain.gain.setValueAtTime(0, after);
    this.gain.gain.linearRampToValueAtTime(target, after + 0.01);
  }

  private startDriftWatch(bpm: number, offsetSec: number, tempoScale: number): void {
    this.stopDriftWatch();
    this.driftTimer = setInterval(() => {
      if (this.audioEl.paused) return;
      const elapsedSec = ((performance.now() - this.expectedStartedAt) / 1000) * tempoScale;
      const expected = this.expectedStartSec + elapsedSec;
      const actual = this.audioEl.currentTime;
      const drift = actual - expected;
      if (Math.abs(drift) > 0.05) {
        this.audioEl.currentTime = Math.max(0, expected);
        this.expectedStartedAt = performance.now();
        this.expectedStartSec = expected;
      }
      // Capture for linting / future telemetry.
      void bpm;
      void offsetSec;
    }, 500);
  }

  private stopDriftWatch(): void {
    if (this.driftTimer) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
  }
}
```

- [ ] **Step 7.2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 7.3: Commit**

```bash
git add src/audio/audio-track.ts
git commit -m "feat(audio): AudioTrack class with drift watchdog and gain-faded seeks"
```

---

## Task 8: Decode-on-attach helper

**Files:**
- Modify: `src/audio/audio-track.ts`

- [ ] **Step 8.1: Append `detectBeatOneFromArrayBuffer`**

Add to the bottom of `src/audio/audio-track.ts`:

```ts
/**
 * Decode the first 15 seconds of an audio file into a mono Float32Array and
 * run `findFirstOnset` on it. Used on attach to auto-pick beat 1.
 *
 * Uses `OfflineAudioContext` for decoding — browser-only, does not run in
 * Vitest's jsdom. Unit tests cover `findFirstOnset`; this wrapper is tested
 * by hand.
 */
export async function detectBeatOneFromArrayBuffer(buf: ArrayBuffer): Promise<number> {
  // OfflineAudioContext requires a positive length; 15s @ 44.1kHz is the target window.
  const targetSec = 15;
  const sampleRate = 44100;
  const ctx = new OfflineAudioContext(1, Math.floor(targetSec * sampleRate), sampleRate);
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(buf.slice(0));
  } catch {
    return 0;
  }

  const channels = decoded.numberOfChannels;
  const len = Math.min(decoded.length, targetSec * sampleRate);
  const mono = new Float32Array(len);
  for (let ch = 0; ch < channels; ch++) {
    const data = decoded.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += data[i] / channels;
  }
  return findFirstOnset(mono, decoded.sampleRate);
}
```

- [ ] **Step 8.2: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 8.3: Commit**

```bash
git add src/audio/audio-track.ts
git commit -m "feat(audio): detectBeatOneFromArrayBuffer for auto-offset on attach"
```

---

## Task 9: SongImportDialog audio attach section

**Files:**
- Modify: `src/components/SongImportDialog.tsx`

- [ ] **Step 9.1: Import helpers + add props**

At the top of the file, below the existing imports, add:

```ts
import { detectBeatOneFromArrayBuffer } from '../audio/audio-track';
import { putBlob, deleteBlob } from '../lib/audio-storage';
import type { AudioTrackRef, AudioMode } from '../music/types';
```

Extend the props:

```ts
interface SongImportDialogProps {
  currentSong: Song;
  onApply: (song: Song) => void;
  onReset: () => void;
  onClose: () => void;
}
```

becomes (add one new callback):

```ts
interface SongImportDialogProps {
  currentSong: Song;
  onApply: (song: Song) => void;
  onReset: () => void;
  onClose: () => void;
  /** Gives the parent a chance to dispose an existing object URL / blob. */
  onReplaceAudio?: (prev: AudioTrackRef | undefined) => void;
}
```

- [ ] **Step 9.2: Add audio state + file-handler logic**

Inside the component, below the existing `const [text, setText] = useState(...)`, add:

```tsx
const [audio, setAudio] = useState<AudioTrackRef | undefined>(currentSong.audio);
const [audioBusy, setAudioBusy] = useState<string | null>(null);
const [audioError, setAudioError] = useState<string | null>(null);

const onFilePicked = async (file: File) => {
  setAudioError(null);
  setAudioBusy('Decoding…');
  try {
    const buf = await file.arrayBuffer();
    const offsetSec = await detectBeatOneFromArrayBuffer(buf);
    const blobId = crypto.randomUUID();
    await putBlob(blobId, new Blob([buf], { type: file.type || 'audio/mpeg' }));
    const prev = audio;
    setAudio({
      source: { kind: 'blob', blobId },
      offsetSec,
      mode: audio?.mode ?? 'playalong',
      filename: file.name,
    });
    if (prev && prev.source.kind === 'blob') {
      await deleteBlob(prev.source.blobId);
    }
  } catch (err) {
    setAudioError(err instanceof Error ? err.message : 'Could not decode file');
  } finally {
    setAudioBusy(null);
  }
};

const onUrlChanged = (url: string) => {
  setAudio((prev) => {
    if (!url.trim()) return undefined;
    return {
      source: { kind: 'url', url: url.trim() },
      offsetSec: prev?.offsetSec ?? 0,
      mode: prev?.mode ?? 'playalong',
    };
  });
};

const onModeChanged = (mode: AudioMode) => {
  setAudio((prev) => (prev ? { ...prev, mode } : prev));
};

const onOffsetChanged = (value: string) => {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) {
    setAudio((prev) => (prev ? { ...prev, offsetSec: n } : prev));
  }
};

const onClearAudio = async () => {
  const prev = audio;
  setAudio(undefined);
  if (prev && prev.source.kind === 'blob') {
    await deleteBlob(prev.source.blobId);
  }
};
```

- [ ] **Step 9.3: Render the audio section inside the `edit` tab**

In the `tab === 'edit'` block, insert this section **below** the `<textarea>` and **above** the two-column preview/validation grid:

```tsx
<fieldset style={{ border: '2px dashed var(--ink)', borderRadius: 8, padding: 14, background: 'var(--bg-alt)' }}>
  <legend style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--ink-mute)', padding: '0 6px' }}>
    🎵 Audio track (optional)
  </legend>
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <label style={{ fontSize: 13, fontWeight: 700 }}>
      Attach audio file
      <input
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFilePicked(f);
        }}
        style={{ display: 'block', marginTop: 4 }}
      />
    </label>
    <label style={{ fontSize: 13, fontWeight: 700 }}>
      …or paste an audio URL
      <input
        type="url"
        value={audio?.source.kind === 'url' ? audio.source.url : ''}
        onChange={(e) => onUrlChanged(e.target.value)}
        placeholder="https://example.com/song.mp3"
        style={{ display: 'block', marginTop: 4, width: '100%', padding: 8, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }}
      />
    </label>

    {audio && (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          Mode
          <select
            value={audio.mode}
            onChange={(e) => onModeChanged(e.target.value as AudioMode)}
            style={{ display: 'block', marginTop: 4, width: '100%', padding: 8, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }}>
            <option value="playalong">Play-along (user strums over original)</option>
            <option value="backing">Backing track (no guitar in mix)</option>
            <option value="teacher">Teacher track (reference only)</option>
          </select>
        </label>
        <label style={{ fontSize: 13, fontWeight: 700 }}>
          Beat 1 at (sec)
          <input
            type="number"
            step="0.01"
            min="0"
            value={audio.offsetSec}
            onChange={(e) => onOffsetChanged(e.target.value)}
            style={{ display: 'block', marginTop: 4, width: '100%', padding: 8, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--surface)', color: 'var(--ink)', fontFamily: 'inherit' }}
          />
        </label>
      </div>
    )}

    {audio && (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--ink-mute)' }}>
        <span>
          {audio.source.kind === 'blob'
            ? `Local: ${audio.filename ?? 'attached file'}`
            : `URL: ${audio.source.url.slice(0, 48)}${audio.source.url.length > 48 ? '…' : ''}`}
        </span>
        <button
          type="button"
          onClick={() => void onClearAudio()}
          style={{ marginLeft: 'auto', padding: '6px 10px', fontWeight: 800, background: 'var(--surface)', color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 6, cursor: 'pointer' }}>
          ✕ Remove
        </button>
      </div>
    )}

    {audioBusy && <div style={{ fontSize: 13, color: 'var(--ink-mute)' }}>{audioBusy}</div>}
    {audioError && <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{audioError}</div>}
  </div>
</fieldset>
```

- [ ] **Step 9.4: Thread `audio` through `onApply`**

Replace the `Load song ▶` button's `onClick` with:

```tsx
onClick={() => {
  if (!parse.song) return;
  const next = { ...parse.song, audio } as Song;
  onApply(next);
}}
```

- [ ] **Step 9.5: Verify typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 9.6: Commit**

```bash
git add src/components/SongImportDialog.tsx
git commit -m "feat(ui): audio-track attach section in SongImportDialog"
```

---

## Task 10: `TRACK` toggle + stretch badge in PlaybackControls

**Files:**
- Modify: `src/components/PlaybackControls.tsx`

- [ ] **Step 10.1: Extend props**

In `PlaybackControlsProps`, add four new fields near the other toggles (keep alphabetical-by-feature order loose):

```ts
trackLoaded: boolean;
trackOn: boolean;
onToggleTrack: () => void;
stretchSupported: boolean;
```

Add them to the destructured params list.

- [ ] **Step 10.2: Add the toggle + badge to the JSX**

Below the existing `♫ SYNTH` toggle and above the `🎙 VOICE` toggle, insert:

```tsx
{trackLoaded && (
  <BigButton
    size="md"
    active={trackOn}
    onClick={onToggleTrack}
    label="Toggle recorded audio track">
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
```

- [ ] **Step 10.3: Verify typecheck**

Run: `npm run typecheck`
Expected: clean — but `App.tsx` will now fail because it does not pass the new props yet. Leave it broken; Task 11 fixes it.

- [ ] **Step 10.4: Commit (defer App.tsx changes; keep this atomic)**

Don't commit yet — the build is broken pending Task 11. We'll commit both together in Task 11.5.

---

## Task 11: App.tsx lifecycle wiring, sidepanel card, keyboard `A`, boot GC

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 11.1: Add imports**

At the top of `src/App.tsx`, add:

```ts
import { AudioTrack } from './audio/audio-track';
import { deleteBlob, getBlob, listBlobIds } from './lib/audio-storage';
import type { AudioTrackRef } from './music/types';
```

- [ ] **Step 11.2: Add state + refs at the top of the `App` component body**

Near the other `useRef` / `useState` hooks:

```tsx
const audioTrackRef = useRef<AudioTrack | null>(null);
const objectUrlRef = useRef<string | null>(null);
const [trackLoaded, setTrackLoaded] = useState(false);
const [trackOn, setTrackOn] = useState(true);
const stretchSupported = useMemo(
  () => typeof HTMLMediaElement !== 'undefined' && 'preservesPitch' in HTMLMediaElement.prototype,
  [],
);
```

- [ ] **Step 11.3: Boot-time GC + audio restore effect**

Add a new `useEffect` (runs once; independent of the existing song-restore effect):

```tsx
useEffect(() => {
  let cancelled = false;
  void (async () => {
    // GC orphan blobs from any previous crash / song swap.
    const current = song.audio?.source.kind === 'blob' ? song.audio.source.blobId : null;
    const all = await listBlobIds();
    for (const id of all) {
      if (id !== current) {
        await deleteBlob(id);
      }
    }
    if (cancelled) return;
    if (song.audio) {
      await ensureAudioLoaded(song.audio);
    }
  })();
  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
}, []);
```

- [ ] **Step 11.4: Add `ensureAudioLoaded` helper inside the component body**

```tsx
const ensureAudioLoaded = async (ref: AudioTrackRef): Promise<void> => {
  try {
    // Dispose prior instance + object URL.
    audioTrackRef.current?.dispose();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const ctx = getAudioContext();
    const track = new AudioTrack({ audioContext: ctx });
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
};
```

**Note:** `getAudioContext()` is the existing helper that returns the shared `AudioContext`. If your App.tsx uses a different name, substitute it. If no shared helper exists, instantiate `new AudioContext()` once at module scope:

```ts
const sharedCtx = new AudioContext();
function getAudioContext() { return sharedCtx; }
```

Declared above the `App` function.

- [ ] **Step 11.5: Reload-on-song-swap effect**

```tsx
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- function identity is stable enough
}, [song.audio?.source.kind === 'blob' ? song.audio.source.blobId : song.audio?.source.kind === 'url' ? song.audio.source.url : null]);
```

- [ ] **Step 11.6: Hook AudioTrack into transport lifecycle**

Find the existing `handlePlayPause` / `transport.play` / `transport.pause` sites and, alongside each:

- On play start (after count-in, at the same call site that calls `synth.play()`), add:
```ts
if (trackLoaded && trackOn && song.audio && audioTrackRef.current) {
  const beat = barIdx * song.beatsPerBar;
  void audioTrackRef.current.play(beat, song.bpm, song.audio.offsetSec, tempoScale);
}
```
(Use the same `barIdx`/`beat` value the synth's play call uses. If the code uses a `startBeat` local, reuse it verbatim.)

- On pause:
```ts
audioTrackRef.current?.pause();
```

- On seek (bar skip, restart, loop wrap):
```ts
if (song.audio && audioTrackRef.current) {
  void audioTrackRef.current.seekToBeat(newBeat, song.bpm, song.audio.offsetSec);
}
```

- When tempo scale changes (in the existing tempo-button handler):
```ts
audioTrackRef.current?.setTempoScale(scale);
```

Apply to every site touching transport. Search for `transport.play`, `transport.pause`, `transport.seek` to make sure none are missed.

- [ ] **Step 11.7: Mute toggle**

Add a new callback for the TRACK toggle:

```tsx
const onToggleTrack = () => {
  setTrackOn((prev) => {
    const next = !prev;
    audioTrackRef.current?.mute(!next);
    announce(next ? 'Track on' : 'Track off');
    return next;
  });
};
```

- [ ] **Step 11.8: Keyboard shortcut `A`**

In the existing `useEffect` that handles keyboard shortcuts, add a branch (ignore when a modal or input is focused — match the pattern already in place):

```ts
if (e.key === 'a' || e.key === 'A') {
  if (trackLoaded) {
    e.preventDefault();
    onToggleTrack();
  }
  return;
}
```

- [ ] **Step 11.9: Sidepanel card**

In the sidepanel JSX (near the other small cards), add:

```tsx
{song.audio && trackLoaded && (
  <div className="gg-sidepanel-card" style={{ borderColor: 'var(--accent)' }}>
    <div style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 800, color: 'var(--ink-mute)' }}>
      🎵 Track
    </div>
    <div style={{ fontSize: 15, fontWeight: 700 }}>
      {song.audio.source.kind === 'blob'
        ? song.audio.filename ?? 'attached file'
        : song.audio.source.url}
    </div>
    <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
      {song.audio.mode === 'playalong' ? 'Play-along' : song.audio.mode === 'backing' ? 'Backing' : 'Teacher'}
      {typeof song.audio.durationSec === 'number' && ` · ${Math.floor(song.audio.durationSec / 60)}:${String(Math.floor(song.audio.durationSec % 60)).padStart(2, '0')}`}
    </div>
  </div>
)}
```

If the existing sidepanel uses a different card class name, match it — the goal is one sidepanel card consistent with the rest.

- [ ] **Step 11.10: Pass the new props to PlaybackControls**

In the `<PlaybackControls ... />` JSX:

```tsx
trackLoaded={trackLoaded}
trackOn={trackOn}
onToggleTrack={onToggleTrack}
stretchSupported={stretchSupported}
```

- [ ] **Step 11.11: Mode defaults on attach / mode change**

After `onApply` fires in the import dialog handler, apply mode defaults once per transition (attach or mode change). In the existing `handleApplySong` (or equivalent), detect:

```ts
const prevAudio = song.audio;
const nextAudio = newSong.audio;
const audioAttached = !prevAudio && nextAudio;
const modeChanged = prevAudio && nextAudio && prevAudio.mode !== nextAudio.mode;
if (audioAttached || modeChanged) {
  const mode = nextAudio!.mode;
  if (mode === 'playalong' || mode === 'teacher') setSynth(false);
  if (mode !== 'backing') setVoice(mode === 'teacher'); // playalong=off, teacher=on
  setMetronome(false);
}
setSong(newSong);
```

(Use the existing setters; the naming above is a placeholder — the file already has `setSynth`, `setVoice`, `setMetronome` or their equivalents. If the voice toggle is named differently, use the real name. Search for the existing voice toggle setter site in `App.tsx` to confirm.)

- [ ] **Step 11.12: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean. Fix any stragglers.

- [ ] **Step 11.13: Commit Tasks 10 and 11 together**

```bash
git add src/components/PlaybackControls.tsx src/App.tsx
git commit -m "feat(audio): wire AudioTrack to transport lifecycle + TRACK toggle"
```

---

## Task 12: Docs touch-ups

**Files:**
- Modify: `README.md`
- Modify: `docs/ACCESSIBILITY.md`

- [ ] **Step 12.1: Update README keyboard row**

Search `README.md` for the keyboard shortcut row. Add `A` to the list so it reads:

```
Space · ← → · R · M · Z · I · L · V · ? · T · G · D · F · [ ] · \ · A
```

And add a short "Audio tracks" section after the "Songs" section:

```markdown
### Audio tracks

You can attach a real recording to any song — local file or URL. Open the Song dialog, scroll to **🎵 Audio track**, and either pick a file or paste a URL. Pick a mode:

- **Play-along** — you strum over the original recording.
- **Backing** — a guitar-less mix you play the part on top of.
- **Teacher** — a reference take you listen to before practicing.

Beat 1 is auto-detected; you can nudge the offset. Tempo stretch is pitch-preserving where the browser supports it. Press `A` to toggle the track.
```

- [ ] **Step 12.2: Update ACCESSIBILITY.md**

Find the existing "Keyboard shortcuts" table and add one row:

```markdown
| `A` | Toggle recorded audio track on/off (when a track is attached) |
```

- [ ] **Step 12.3: Commit**

```bash
git add README.md docs/ACCESSIBILITY.md
git commit -m "docs: Audio track section + A keyboard shortcut"
```

---

## Task 13: Final verification

- [ ] **Step 13.1: Full test run**

Run: `npm run test:run`
Expected: all passing (smoke + song-parser + audio-track + audio-storage).

- [ ] **Step 13.2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean; no new TS errors.

- [ ] **Step 13.3: Dev-server hand test checklist**

Run: `npm run dev`

Verify in the browser:

1. Attach an MP3 via the file picker. Toast → decoded → auto-offset fills.
2. Press Play. Audio starts on beat 1. Synth is muted (play-along default).
3. Switch to ¾× — audio slows, pitch preserved (badge shows `pitch-stretch`).
4. Set A at bar 5, B at bar 9, press Play. Loop wraps — audio seeks, no obvious click.
5. Pause, Restart, Play — audio tracks from beat 0.
6. Press `A` — track mutes; press again — un-mutes.
7. Change song to one without audio — track card disappears; no errors in the console.
8. Reload the tab — blob-backed song restores the audio from IndexedDB.
9. Paste a URL into a fresh song, export via `songToChordGrid` (the Song dialog's text is the serialized form), re-import — URL/offset/mode survive.

- [ ] **Step 13.4: Deploy (optional, if the user asks)**

Run: `npm run deploy`

Expected: Wrangler upload completes, new URL is live.

- [ ] **Step 13.5: No separate commit needed** — Tasks 1-12 each committed their work.

---

## Self-review notes

**Spec coverage:**

- Architecture (spec §High-level / §Architecture) → Task 7 (`AudioTrack` class), Task 11 (wiring).
- Data model (spec §Data model) → Task 2 (types), Tasks 3-4 (parser).
- Auto-detect (spec §Auto-detect beat 1) → Task 5 (`findFirstOnset`), Task 8 (decode wrapper).
- Per-mode mixing defaults (spec §Per-mode mixing defaults) → Task 11.11 (setters on attach / mode change).
- Loop + count-in (spec §Loop and count-in) → Task 11.6 (seek on loop wrap; play fires post-count-in at the existing synth-play site).
- UI surfaces (spec §UI surfaces) → Task 9 (import dialog), Task 10 (controls), Task 11.9 (sidepanel), Task 11.8 (keyboard).
- Persistence (spec §Persistence) → Task 6 (storage), Task 11.3 (boot GC + restore), Task 11.4 (object URL lifecycle).
- Edge cases (spec §Edge cases) → unsupported format handled in Task 9 (error state in the dialog) and Task 7 (`onError`); CORS via same. Drift watchdog → Task 7. Offset > duration → Task 7 (`seekToBeat` clamps).
- Testing (spec §Testing) → Tasks 1, 3, 4, 5, 6.

**Type consistency check:** `AudioTrackRef`, `AudioMode`, `AudioSource` names used identically across types, parser, dialog, and App. `findFirstOnset` signature matches tests and callers.

**Placeholder scan:** No TBDs. Each code block is concrete. Task 11.6 references existing App.tsx call sites by pattern rather than line number because App.tsx is already substantial — the engineer is instructed to search for `transport.play` / `transport.pause` / `transport.seek` and mirror each site.
