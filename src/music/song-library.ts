import type { Song } from './types';
import { parseChordGrid } from './song-parser';

/**
 * A curated practice progression shipped with the app so users can start
 * playing without typing a grid from scratch. Every entry uses only the
 * 12 chord shapes stocked in `CHORD_LIB` (C, D, Dm, D7, E, Em, F, G, G7,
 * A, Am, Bm) and is royalty-safe: traditional, public domain, or a
 * generic structural progression.
 */
export interface CuratedSong {
  /** URL-safe slug, stable across renames. */
  id: string;
  /** Display title. */
  title: string;
  /** Short attribution — "Trad.", "Pachelbel (simplified)", etc. */
  artist: string;
  /** Difficulty bucket used to sort/filter the library. */
  difficulty: 'beginner' | 'intermediate';
  /** One-line pitch explaining why the user should practice this. */
  description: string;
  /** The chord-grid-format body ready for `parseChordGrid()`. */
  grid: string;
}

/**
 * Library of six pre-baked progressions. Kept inline (not JSON) so the
 * bundler tree-shakes anything unused and so TypeScript validates the
 * shape at compile time.
 */
export const SONG_LIBRARY: CuratedSong[] = [
  {
    id: 'twelve-bar-blues-a',
    title: '12-bar blues in A',
    artist: 'Trad.',
    difficulty: 'beginner',
    description:
      'The bedrock of rock and blues — one progression unlocks thousands of songs.',
    grid: [
      'Title: 12-bar blues in A',
      'Artist: Trad.',
      'BPM: 80',
      'Time: 4/4',
      '',
      '[I chord (4 bars)]',
      'A A A A',
      '> one | two | three | four',
      '',
      '[IV then I (2+2)]',
      'D D A A',
      '> four | chord | back | home',
      '',
      '[Turnaround (V-IV-I-I)]',
      'E D A A',
      '> five | four | one | rest',
    ].join('\n'),
  },
  {
    id: 'pop-i-v-vi-iv-g',
    title: 'Pop I-V-vi-IV in G',
    artist: 'Trad. progression',
    difficulty: 'beginner',
    description: 'The most popular four-chord loop in modern pop.',
    grid: [
      'Title: Pop I-V-vi-IV in G',
      'Artist: Trad. progression',
      'BPM: 96',
      'Time: 4/4',
      '',
      '[Intro]',
      'G D Em C',
      '> hum | along | nice | and easy',
      '',
      '[Verse]',
      'G D Em C',
      '> sing a | simple | little | story',
      '',
      '[Chorus]',
      'G D Em C',
      '> lift it | raise it | hold it | land it',
    ].join('\n'),
  },
  {
    id: 'house-of-the-rising-sun',
    title: 'House of the Rising Sun',
    artist: 'Trad.',
    difficulty: 'intermediate',
    description:
      'Haunting folk arpeggio staple — great for practicing smooth chord transitions.',
    grid: [
      'Title: House of the Rising Sun',
      'Artist: Trad.',
      'BPM: 72',
      'Time: 4/4',
      '',
      '[Verse]',
      'Am C D F Am C Em Am',
      '> there | is a | house | in | New | Orleans | they | call',
      '',
      '[Verse 2]',
      'Am C D F Am C Em Am',
      '> the | rising | sun | and | it has | been the | ruin | of',
      '',
      '[Outro]',
      'Am C D F Am C Em Am',
      '> many | a poor | boy | and | God | I know | I am | one',
    ].join('\n'),
  },
  {
    id: 'knockin-on-progression',
    title: "Knockin' on progression",
    artist: 'Trad. D-A-G cycle',
    difficulty: 'beginner',
    description:
      'Eight-bar G-D cycle that powers countless campfire sing-alongs — simple, forgiving, endlessly loopable.',
    grid: [
      "Title: Knockin' on progression",
      'Artist: Trad. D-A-G cycle',
      'BPM: 72',
      'Time: 4/4',
      '',
      '[Cycle A]',
      'G D Am Am',
      '> strum | easy | hold it | hold it',
      '',
      '[Cycle B]',
      'G D C C',
      '> strum | easy | resolve | resolve',
    ].join('\n'),
  },
  {
    id: 'amazing-grace',
    title: 'Amazing Grace',
    artist: 'Trad.',
    difficulty: 'beginner',
    description:
      'Classic hymn in G — teaches a clean G-C-D trio with one gentle Em detour.',
    grid: [
      'Title: Amazing Grace',
      'Artist: Trad.',
      'BPM: 66',
      'Time: 4/4',
      '',
      '[Phrase 1]',
      'G C G Em',
      '> Amazing | grace, how | sweet the | sound',
      '',
      '[Phrase 2]',
      'G C D G',
      '> that saved | a wretch | like | me',
      '',
      '[Tag]',
      'G C G D G',
      '> I | once was | lost, but | now am | found',
    ].join('\n'),
  },
  {
    id: 'canon-progression',
    title: 'Canon progression',
    artist: 'Pachelbel (simplified)',
    difficulty: 'intermediate',
    description:
      'The ubiquitous D-major Canon loop — good for fingerpicking practice.',
    grid: [
      'Title: Canon progression',
      'Artist: Pachelbel (simplified)',
      'BPM: 60',
      'Time: 4/4',
      '',
      '[Canon A]',
      'D A Bm F G D G A',
      '> one | two | three | four | five | six | seven | eight',
      '',
      '[Canon B]',
      'D A Bm F G D G A',
      '> cycle | again | with | feel | open | the | fingers | up',
    ].join('\n'),
  },
];

/**
 * Parse a curated library entry into a playable `Song`.
 *
 * Throws if the grid cannot be parsed — curated entries are validated
 * at build-time by the `parseChordGrid` contract, so a throw here means
 * the library itself regressed and deserves a loud failure rather than
 * a silent fallback.
 */
export function loadCurated(entry: CuratedSong): Song {
  const result = parseChordGrid(entry.grid);
  if (!result.song) {
    const detail = result.errors.map((e) => `line ${e.line}: ${e.message}`).join('; ');
    throw new Error(`Failed to parse curated song "${entry.id}": ${detail}`);
  }
  return result.song;
}
