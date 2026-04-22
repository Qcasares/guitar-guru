# Guitar Guru

Accessible guitar tab player for low-vision players. Implements a hybrid of
**wireframe 1** (Giant Now/Next — rhythm) and **wireframe 4** (Tab Staff Lead
— "GODMODE") from the `Guitar Tab Player Wireframes` design package.

## Run

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # Typecheck + production bundle into ./dist
npm run preview    # Serve the built bundle
```

## What's inside

| Area | File |
| --- | --- |
| App shell, transport wiring, shortcuts | `src/App.tsx` |
| Rhythm view (W1 Giant Now/Next) | `src/views/RhythmView.tsx` |
| Lead GODMODE view (W4 Tab Staff + playhead) | `src/views/LeadGodmodeView.tsx` |
| BPM-driven beat clock | `src/audio/transport.ts` |
| Web Audio metronome click | `src/audio/metronome.ts` |
| Voice announcer (SpeechSynthesis) | `src/audio/voice.ts` |
| Chord/tab/button/legend SVG components | `src/components/*.tsx` |
| Chord library · song data · types | `src/music/*.ts` |

## Accessibility choices

- **80px+ controls** — every playback button is at minimum 80px tall.
- **Finger colour coding** — 1 red, 2 blue, 3 green, 4 orange, T purple.
- **Themes** — Sketch (default), High-contrast, and Dark.
- **Chord sizes** — MD / LG / XL / XXL. Default XL.
- **Voice announcer** — calls out the upcoming chord (rhythm) or the current
  note string/fret/finger (lead GODMODE).
- **Keyboard shortcuts** — Space play/pause, ←/→ scrub by bar, R restart, M
  toggle mode.
- **Reduced-motion-friendly** — the playhead uses a short `transition`
  (120ms) that can be turned off via `prefers-reduced-motion` at the browser
  level.

## Modes

**Rhythm (W1)** — huge Now / Next chord cards. Four beat dots pulse with the
transport; the Now card flashes on each downbeat. The voice announces the next
chord one beat before the bar change.

**Lead · GODMODE (W4)** — three-bar tab-staff window with a red playhead that
tracks the beat in real time. The active note is highlighted in its finger
colour. The voice reads every note ("string 3, fret 2, index").

## Design source

Sourced from `Guitar Tab Player Wireframes.html` (chat transcript in
`guitar-guru/chats/chat1.md`). Typography follows the final user feedback —
Aptos / Helvetica / Arial, bold weights (700–900).
