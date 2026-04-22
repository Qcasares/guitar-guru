import type { Bar, Section, Song, TabNote, ChordShape, Finger } from './types';
import { CHORD_LIB } from './chords';

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  song: Song | null;
  errors: ParseError[];
  /** Chord names used that aren't in CHORD_LIB — warn but don't hard-fail. */
  unknownChords: string[];
}

const META_RE = /^(title|artist|bpm|time)\s*:\s*(.+)$/i;
const SECTION_RE = /^\[([^\]]+)\]$/;
const LYRIC_RE = /^>\s?(.*)$/;

/**
 * Parse a lightweight chord-grid song description.
 *
 * Format:
 *   Title: House of the Rising Rain
 *   Artist: Trad.
 *   BPM: 84
 *   Time: 4/4
 *
 *   [Verse 1]
 *   Am C D Em
 *   > There is a | house in | a quiet | town
 *
 *   [Chorus]
 *   G D Em C
 *
 * Rules:
 *   - Header lines (Title/Artist/BPM/Time) are optional and case-insensitive.
 *   - Section header is `[Name]` on its own line.
 *   - Chord lines are whitespace-separated; one chord = one bar.
 *   - Optional `>` lyric line after a chord line carries pipe-separated lyrics,
 *     one per bar (falling back to whole-line repeats if fewer).
 *   - Blank lines are ignored.
 */
export function parseChordGrid(text: string): ParseResult {
  const errors: ParseError[] = [];
  const unknownChords = new Set<string>();

  let title = 'Untitled';
  let artist = '';
  let bpm = 100;
  let beatsPerBar = 4;

  const sections: Section[] = [];
  const bars: Bar[] = [];

  let currentSection: Section | null = null;
  let lastBarsStart = 0; // index into `bars` where the current chord line started
  let lastBarsEnd = 0;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const meta = trimmed.match(META_RE);
    if (meta) {
      const key = meta[1].toLowerCase();
      const value = meta[2].trim();
      if (key === 'title') title = value;
      else if (key === 'artist') artist = value;
      else if (key === 'bpm') {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) errors.push({ line: i + 1, message: `Invalid BPM "${value}"` });
        else bpm = n;
      } else if (key === 'time') {
        const m = value.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) beatsPerBar = Number(m[1]);
      }
      continue;
    }

    const section = trimmed.match(SECTION_RE);
    if (section) {
      currentSection = {
        name: section[1].trim(),
        barOffset: bars.length,
        chords: [],
      };
      sections.push(currentSection);
      continue;
    }

    const lyric = trimmed.match(LYRIC_RE);
    if (lyric) {
      if (!currentSection) {
        errors.push({ line: i + 1, message: 'Lyric line before any [Section] header' });
        continue;
      }
      const parts = lyric[1].split('|').map((s) => s.trim());
      const perBarLyrics = bars.slice(lastBarsStart, lastBarsEnd).map((_, idx) => parts[idx] ?? parts[parts.length - 1] ?? '');
      currentSection.lyrics = [...(currentSection.lyrics ?? []), ...perBarLyrics];
      continue;
    }

    // Otherwise it's a chord line.
    if (!currentSection) {
      // Allow chord lines before any section — roll them into an implicit "Song" section.
      currentSection = { name: 'Song', barOffset: bars.length, chords: [] };
      sections.push(currentSection);
    }

    const chordNames = trimmed.split(/\s+/).filter(Boolean);
    lastBarsStart = bars.length;
    for (const chord of chordNames) {
      if (!CHORD_LIB[chord]) unknownChords.add(chord);
      currentSection.chords.push(chord);
      bars.push({
        chord,
        section: currentSection.name,
        notes: autoTabForChord(CHORD_LIB[chord], beatsPerBar),
      });
    }
    lastBarsEnd = bars.length;
  }

  if (bars.length === 0) {
    errors.push({ line: 0, message: 'No chord data found — paste at least one chord line.' });
    return { song: null, errors, unknownChords: [...unknownChords] };
  }

  const song: Song = {
    title,
    artist,
    bpm,
    beatsPerBar,
    sections,
    bars,
  };

  return { song, errors, unknownChords: [...unknownChords] };
}

/**
 * Auto-generate a simple arpeggio tab line for a chord — one note per beat,
 * walking down through the fretted strings. Used so lead GODMODE has
 * something to play when a user imports a song with only chord labels.
 */
function autoTabForChord(chord: ChordShape | undefined, beatsPerBar: number): TabNote[] {
  if (!chord) return [];
  const startFret = chord.startFret ?? 1;
  const candidates: TabNote[] = [];
  for (const n of chord.notes) {
    if (n.muted) continue;
    candidates.push({
      string: n.string,
      fret: n.open ? 0 : n.fret + startFret - 1,
      beat: 0,
      finger: n.finger,
    });
  }
  // Sort low-to-high (string 6 → string 1) for a predictable arpeggio.
  candidates.sort((a, b) => b.string - a.string);
  // Distribute across beats — cycle if we have fewer than beatsPerBar notes.
  return Array.from({ length: beatsPerBar }).map((_, beat) => {
    const base = candidates[beat % Math.max(candidates.length, 1)];
    const fret = typeof base?.fret === 'number' ? base.fret : 0;
    return {
      string: (base?.string ?? 3) as 1 | 2 | 3 | 4 | 5 | 6,
      fret,
      beat,
      finger: base?.finger as Finger | undefined,
    };
  });
}

/** Serialize a song back to the chord-grid text format for round-tripping. */
export function songToChordGrid(song: Song): string {
  const lines: string[] = [];
  lines.push(`Title: ${song.title}`);
  if (song.artist) lines.push(`Artist: ${song.artist}`);
  lines.push(`BPM: ${song.bpm}`);
  lines.push(`Time: ${song.beatsPerBar}/4`);
  lines.push('');
  for (const section of song.sections) {
    lines.push(`[${section.name}]`);
    lines.push(section.chords.join(' '));
    if (section.lyrics?.length) {
      lines.push(`> ${section.lyrics.join(' | ')}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
