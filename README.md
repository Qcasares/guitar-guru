# Guitar Guru

**Live at [guitar-guru.pages.dev](https://guitar-guru.pages.dev) · Installable PWA · WCAG 2.2 AA ([full statement](./docs/ACCESSIBILITY.md))**

Accessible guitar tab player for **low-vision players**. Pick between two views
that share a single transport:

- **Rhythm** — giant Now / Next chord cards; the Now card flashes on the
  downbeat and the voice announces the upcoming chord one beat before it hits.
- **Lead GODMODE** — 3-bar tab-staff window with a red playhead that tracks the
  beat in real time, a full-neck fretboard diagram that lights up the active
  chord shape, and voice read-out of every note (*"string 3, fret 2, index"*).

## Run locally

```bash
npm install
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # Typecheck + production bundle into ./dist
npm run preview    # Serve the built bundle
npm run deploy     # Build + push to Cloudflare Pages (requires wrangler login)
```

Tested on Chrome, Safari, and Edge. Firefox works for everything except voice
command input (Web Speech Recognition isn't supported there — voice output
still works).

## Feature map

### Playback + timing
- BPM-driven Transport (`src/audio/transport.ts`) with ½× / ¾× / 1× tempo scale
- 4-beat visual + spoken count-in before play
- Section-based loop **and** manual A–B loop points (`[` / `]` / `\`)
- Web Audio metronome with accented downbeat

### Audio
- Web Audio string-pluck **synth** — strums chords in rhythm mode, plucks tab
  notes in lead (`src/audio/synth.ts`)
- **Voice announcer** via SpeechSynthesis — upcoming chord / current note
- Audio **status ping** (`?`) — speaks section / bar / chord / BPM / loop
- **Finger sonification** — rising C-pentatonic cue per finger (T=A3, 1=C4,
  2=E4, 3=G4, 4=C5) so colour is never the only encoding
- **Chord-diagram narration** (`D`) — verbose shape read-out

### Input
- **Voice commands** — Web Speech Recognition, 20+ verbs (play / pause / next
  / slower / loop / zoom / rhythm / god mode / set a / set b / ...)
- **Microphone chord detection** — chromagram + template matching over 80–1200
  Hz; auto-advance mode steps the transport when you play the current chord
- **Haptic beat pulse** — Vibration API, tick / downbeat / triple-buzz at
  section boundaries
- Keyboard shortcuts: `Space · ← → · R · M · Z · I · L · V · ? · T · G · D · F
  · [ ] · \`

### Content
- **Chord library** — 12 shapes (C · D · Dm · D7 · E · Em · F · G · G7 · A ·
  Am · Bm) with finger colour + pattern encoding
- **Song library** — 6 royalty-safe progressions (12-bar blues in A, Pop
  I-V-vi-IV, House of the Rising Sun, Knockin' on progression, Amazing Grace,
  Canon progression)
- **Custom song import** — paste a chord grid, live preview + validation
- **Finger close-up** (`Z`) — full-stage modal with giant fingertip callouts
  and per-finger instructions
- **Practice trainers** — chord-changes-per-minute (Justin Guitar-style) and
  tempo-ramp (Soundslice-style) drills, both mic-driven

### Visual + accessibility
- **80 px+ controls** everywhere
- **Finger encoding** — colour only, or colour + SVG pattern (stripes / dots /
  hatch / rings) for deuteranopia / tritanopia
- **Themes** — Sketch (cream, default), High-contrast (21:1), Dark
- **Chord sizes** MD / LG / XL / XXL · **Density** Compact / Normal / Spacious
- **Focus spotlight** (`F`) — dims everything except the active chord
- **Responsive** down to 360 px; stacks cleanly at 600 px breakpoint
- **`prefers-reduced-motion`** honoured — every animation/transition neutralised
- **Skip-to-main-content** link + polite `aria-live` status region
- **PWA installable** — offline-ready service worker, custom Cloudflare headers
  for correct MIME + cache

Full conformance statement: [`docs/ACCESSIBILITY.md`](./docs/ACCESSIBILITY.md).

## Architecture at a glance

| Area | File / dir |
|---|---|
| App shell, transport wiring, keyboard + voice dispatch | `src/App.tsx` |
| Rhythm view (Now/Next) | `src/views/RhythmView.tsx` |
| Lead GODMODE view (tab staff + fretboard + playhead) | `src/views/LeadGodmodeView.tsx` |
| Beat clock | `src/audio/transport.ts` |
| Metronome / synth / voice / narration / sonification / haptics | `src/audio/*.ts` |
| Mic pipeline + onset + chord detection | `src/audio/audio-input.ts`, `onset-detect.ts`, `chord-detect.ts` |
| Voice commands | `src/voice/recognition.ts`, `src/voice/parser.ts` |
| Chord box / tab staff / fretboard / close-up / spotlight | `src/components/*.tsx` |
| Finger pattern SVG defs | `src/components/patterns/FingerPatterns.tsx` |
| Chord library · song library · song parser · types | `src/music/*.ts` |
| Preferences + PWA register | `src/lib/preferences.ts`, `src/lib/pwa.ts` |

## Deploy

Live on **Cloudflare Pages**. `npm run deploy` builds and pushes from any
logged-in machine (requires a one-time `npx wrangler login`). Project config
lives in `public/_headers` + `public/_redirects`; both files are
Cloudflare-and-Netlify-compatible, so switching platforms later costs nothing.

Optional: wire up `.github/workflows/deploy.yml` (in the repo, dormant by
default) to auto-deploy on every push to `main` once you create a scoped
`CLOUDFLARE_API_TOKEN` and add it as a repo secret. See the workflow file for
the exact Cloudflare dashboard steps.

## Design source

Sourced from the `Guitar Tab Player Wireframes` Claude Design handoff bundle.
Typography follows the user's explicit feedback — **Aptos / Helvetica / Arial,
bold weights (700–900)**; no handwritten display fonts.
