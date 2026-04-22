# Real recorded audio track — design spec

**Date:** 2026-04-22
**Status:** Approved for implementation
**Scope:** one feature spec → one implementation plan → one merge

## Problem

GuitarGuru today plays chord and tab data through an in-browser synth (`src/audio/synth.ts`). There is no way to play a real recorded audio file alongside (or instead of) the synth. Three user scenarios need it:

1. **Play-along** — the user loads the original recording, plays along, synth silent.
2. **Backing track** — the user plays lead or rhythm over a guitar-less mix.
3. **Teacher track** — the user listens to a reference take to learn the feel, then switches back to synth to practice.

One audio-track feature covers all three; the user picks a mode per song.

## Non-goals

- Multi-track stems / mixing.
- Audio editing (trim, fade, EQ).
- YouTube or streaming extraction.
- Automatic BPM detection from audio — the user sets BPM; mismatch means the drift is on the user.
- Waveform visualization (out of scope for v1, the Web Audio graph leaves a node available for future addition).

## High-level approach

Transport stays the master clock. A new `AudioTrack` module layers on top of Transport events the same way `metronome`, `haptics`, and `chord-detect` already do — additive, no Transport refactor. Rejected alternatives:

- *Audio-master* (Transport reads `audioEl.currentTime`): forces every Transport call to branch on "is a track loaded?"; fragile when no track is present.
- *Shared AudioContext clock*: Transport currently uses `performance.now()`; switching is a refactor out of scope.

The audio element uses `HTMLMediaElement.preservesPitch = true` + `playbackRate = tempoScale` for pitch-preserving time stretch at ½× / ¾×, supported in Chrome, Firefox, and Safari. `AudioBufferSourceNode` was rejected because it does not expose `preservesPitch`.

## Architecture

New module **`src/audio/audio-track.ts`** exposing an `AudioTrack` class:

- Owns an `HTMLAudioElement`, routed through the existing `AudioContext` via `MediaElementAudioSourceNode → GainNode → destination`. The `GainNode` is used for 10 ms fade-in/out to mask seek clicks on loop wrap.
- API surface:
  - `load(url: string): Promise<void>` — assigns `src`, waits for `loadedmetadata`, returns duration.
  - `play(startBeat, bpm, tempoScale, offsetSec)` — computes `audioEl.currentTime = offsetSec + startBeat * 60/bpm`, sets `playbackRate`, `preservesPitch = true`, calls `audioEl.play()`.
  - `pause()` / `mute(bool)` / `setTempoScale(n)` / `seekToBeat(beat, bpm, offsetSec)` / `dispose()`.
- **Drift watchdog** at ~2 Hz: compares `audioEl.currentTime` vs expected; if `|delta| > 50 ms`, re-seek. 50 ms is below the perceptual threshold for rhythm-guitar practice; no point correcting tighter because `HTMLAudioElement.currentTime` writes are not sample-accurate.
- Loop wrap: Transport fires a seek-to-loopStart; `AudioTrack.seekToBeat` runs the gain-fade envelope (10 ms ramp down → seek → 10 ms ramp up).
- Count-in: `AudioTrack` stays paused during the 4-beat count; on count-in end the existing `transport.play()` call drives `AudioTrack.play()` via the same lifecycle hooks used by synth/metronome.

## Data model

Extend `src/music/types.ts`:

```ts
export type AudioTrackRef = {
  source: { kind: 'blob'; blobId: string } | { kind: 'url'; url: string };
  offsetSec: number;                    // audio time that corresponds to beat 1
  mode: 'playalong' | 'backing' | 'teacher';
  durationSec?: number;                 // cached from loadedmetadata
  filename?: string;                    // display-only, for blob sources
};

export type Song = /* existing fields */ & {
  audio?: AudioTrackRef;
};
```

Blobs live in **IndexedDB**, keyed by a random UUID `blobId`. Song JSON only carries the reference, so `localStorage[guitarguru.song.v1]` stays small.

Extend the chord-grid text format with three optional headers in `src/music/song-parser.ts`:

```
Audio: https://example.com/song.mp3
AudioOffset: 3.42
AudioMode: playalong
```

Parser rules:
- `META_RE` regex extended to match `audio|audiooffset|audiomode`.
- `Audio:` with a URL creates `source = { kind: 'url', url }`.
- `songToChordGrid` emits the three headers only when set, and only for URL sources. Blob sources omit `Audio:` from exported text with a non-fatal warning in the import dialog ("this song's audio file is saved locally and will not travel with the text export").

## Auto-detect beat 1 on attach

In `src/audio/audio-track.ts`, function `detectBeatOne(arrayBuffer: ArrayBuffer): Promise<number>`:

1. Decode the first 15 s via `OfflineAudioContext(1, 15 * 44100, 44100).decodeAudioData(...)`.
2. Sum channels to mono.
3. Run the same one-pole envelope follower used in `src/audio/onset-detect.ts` (shared via an extracted helper `computeEnvelope(samples: Float32Array): Float32Array`).
4. Find the first sample where envelope > `0.05` after a sustained ≥200 ms run of envelope < `0.02` (silence). That sample's timestamp becomes `offsetSec`.
5. If no onset found in the 15 s window, default to `0`.

Exposed in the import dialog as a number input (`Beat 1 at: 3.42 s`) with a `↻ re-detect` button. User can nudge ±0.01 s; all edits save to `AudioTrackRef.offsetSec`.

## Per-mode mixing defaults

Defaults are applied at two moments only: (a) when the user first attaches a track to a song, and (b) when the user changes the Mode dropdown afterward. Outside those moments the user's toggles stand — switching songs does not reapply defaults, so a user who toggles synth back on in play-along mode keeps it on next session.

| Mode | Synth | Voice announcements | Metronome |
|------|-------|---------------------|-----------|
| `playalong` | off | off | off |
| `backing`   | user's choice (unchanged) | off | off |
| `teacher`   | off | on | off |

Rationale: in `playalong` and `teacher`, the recording itself *is* the reference, so synth/voice announcements would double-up and clash. In `backing` the recording is instrumentation without the part the user is playing; voice announcements are still redundant because the user is reading chord diagrams.

## Loop and count-in

- **A-B loop / section loop:** on loop wrap (fired inside `Transport.loop()` — no change there), the parent `App.tsx` already calls out to the audio subsystem the same way it drives metronome/haptics. `AudioTrack.seekToBeat(loopStart, bpm, offsetSec)` seeks the audio element and runs the gain-fade.
- **Count-in:** the existing 4-beat count-in runs before `transport.play()`. `AudioTrack.play()` is called from the same site that calls `synth.play()`, after count-in completes.
- **Audio ends before song ends:** `audioEl.onended` → `AudioTrack.mute(true)`; Transport + synth (if enabled) keep going. Fire `announce('audio track ended')`.
- **Loop region extends past audio end:** audio stops inside the loop; the in-`playalong`-mode UI silently treats it as `backing` for the rest of the session (no error, no teardown).

## UI surfaces

**`SongImportDialog.tsx`** — new "🎵 Audio track" section directly under the BPM / Time fields:

- File picker button "Attach audio file" (accepts `audio/*`); on file → read as ArrayBuffer → `putBlob` → store `blobId` + filename.
- URL input "…or paste audio URL".
- Mode dropdown (Play-along / Backing / Teacher), default `playalong`.
- Offset field "Beat 1 at: N.NN s" with `↻ re-detect` button (triggers auto-detect on the current source).
- Clear button "Remove track".

**`PlaybackControls.tsx`** — new `🎵 TRACK` toggle:

- Renders only when the current song has `audio` attached.
- Toggles `AudioTrack.mute(true/false)` without tearing the element down.
- Tempo badge: shows `PITCH-STRETCH` at non-1× tempo when `preservesPitch` is supported, `NO STRETCH` fallback if not (UA sniff via `'preservesPitch' in HTMLMediaElement.prototype`).

**Sidepanel card** in `App.tsx` — when a track is loaded, a compact card:

```
🎵 Track
filename.mp3 · 3:42 · play-along
📂 Change  ·  ✕ Remove
```

**Keyboard shortcut** — `A` toggles the track on/off (currently unused in the keyboard row). Added to the help overlay and README keyboard list.

## Persistence

New module **`src/lib/audio-storage.ts`** — thin IndexedDB wrapper:

- DB: `guitarguru-audio`, version 1.
- Object store: `blobs`, keyed by `blobId` (string).
- API: `putBlob(id, blob): Promise<void>`, `getBlob(id): Promise<Blob | null>`, `deleteBlob(id): Promise<void>`, `listBlobIds(): Promise<string[]>`.

Boot flow in `App.tsx`:

1. Load song from `localStorage[guitarguru.song.v1]`.
2. If `song.audio?.source.kind === 'blob'`, `getBlob(blobId)` → `URL.createObjectURL(blob)` → `AudioTrack.load(url)`.
3. Stash the object URL in a ref; revoke it on song swap or unmount.

Garbage collection on boot:

- `listBlobIds()` → compute `orphans = allIds − currentBlobId`.
- `deleteBlob(id)` for each orphan.
- Rationale: covers mid-session crashes and the user replacing a track. Worst case: a user attaches a track, closes the tab before saving, blob is orphaned; next boot GCs it.

`preferences.v2` is unaffected — audio state lives in the song, not prefs.

## Edge cases

| Case | Behavior |
|------|----------|
| Unsupported format | `audioEl.onerror` → toast `"couldn't play this file — try MP3 or AAC"`, song keeps chord data, `audio` ref is cleared. |
| CORS on URL source | Catch `audioEl.onerror`, toast `"remote audio blocked by CORS — host it somewhere that allows cross-origin (e.g. Cloudflare R2)"`. |
| Offset > duration | Clamp to `duration - 0.1` on save, toast `"offset longer than the track — clamped"`. |
| Tab backgrounded | rAF slows, drift grows, drift watchdog corrects on refocus. No special handling. |
| User toggles tempo during play | `setTempoScale` sets `playbackRate` on the element; browser handles the rate change without seeking. |
| `preservesPitch` unsupported | Pitch drops with rate. Badge `NO STRETCH`. Acceptable degradation. |
| Blob size > 50 MB | Accepted — IndexedDB handles it. UI warns `"large file — may be slow on mobile"` if `blob.size > 25 MB`. |

## Testing

Unit tests (Vitest, once installed — GuitarGuru has no test harness today; add `vitest` + one `tsconfig.test.json` as part of this work):

- `audio-storage.putBlob / getBlob / deleteBlob / listBlobIds` round-trip with a fake-indexeddb backend.
- `detectBeatOne` against three shipped 2 s test fixtures: (a) silence → click at 1.0 s → expect `1.0 ± 0.05`; (b) no onset → expect `0`; (c) click at 0.0 s → expect `0`.
- `song-parser` round-trip for the three new headers.
- `song-parser` drops `Audio:` for blob sources during `songToChordGrid`.

Hand-tested (per existing project convention — no E2E harness today):

- Attach MP3, play, pause, seek, loop, tempo change at ½× and ¾×.
- URL-sourced song round-trips through `songToChordGrid` → `parseChordGrid`.
- Offline-reload restores blob-sourced song from IndexedDB.
- Tab-backgrounded 30 s then foregrounded — drift corrects within one watchdog tick.

## File-level change list

**New:**
- `src/audio/audio-track.ts`
- `src/lib/audio-storage.ts`
- `src/audio/__tests__/detect-beat-one.test.ts`
- `src/lib/__tests__/audio-storage.test.ts`
- `src/music/__tests__/song-parser-audio.test.ts`
- `test-fixtures/beat-one-click.wav`, `test-fixtures/beat-one-silence.wav`, `test-fixtures/beat-one-immediate.wav`
- `vitest.config.ts`
- `tsconfig.test.json`

**Modified:**
- `src/music/types.ts` — add `AudioTrackRef`, extend `Song`.
- `src/music/song-parser.ts` — extended `META_RE`, `songToChordGrid` updates.
- `src/audio/onset-detect.ts` — extract `computeEnvelope` helper, re-export.
- `src/components/SongImportDialog.tsx` — audio track section.
- `src/components/PlaybackControls.tsx` — `TRACK` toggle + stretch badge.
- `src/App.tsx` — wire `AudioTrack` to transport lifecycle, sidepanel card, `A` shortcut, boot GC.
- `package.json` — add `vitest`, test script.
- `README.md` — update keyboard row to include `A`.

## Success criteria

1. Attaching an MP3 via file picker plays in sync with chord diagrams at 1×, ½×, ¾×.
2. Closing and reopening the tab restores the track from IndexedDB.
3. A URL-hosted audio round-trips through the chord-grid text export.
4. A-B loop seeks the audio alongside the transport without audible clicks.
5. Auto-detect lands within ±100 ms of beat 1 on a typical pop recording with a 4-count intro.
6. `vitest run` is green.
7. `npm run build` clean, no new TS errors.
