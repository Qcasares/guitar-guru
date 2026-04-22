import type { Song } from './types';

// "House of the Rising Rain" — practice arrangement.
// 16 bars that carry both a rhythm chord progression and a sample lead line
// (so RHYTHM mode and LEAD GODMODE mode can share the same transport clock).
export const SAMPLE_SONG: Song = {
  title: 'House of the Rising Rain',
  artist: 'Trad. — practice arrangement',
  bpm: 84,
  beatsPerBar: 4,
  sections: [
    { name: 'Verse 1', barOffset: 0, chords: ['Am', 'C', 'D', 'Em'], lyrics: ['There is a', 'house in', 'a quiet', 'town…'] },
    { name: 'Verse 2', barOffset: 4, chords: ['Am', 'C', 'Em', 'Am'], lyrics: ['And it’s', 'been the', 'ruin of', 'many…'] },
    { name: 'Chorus',  barOffset: 8, chords: ['G', 'D', 'Em', 'C'], lyrics: ['Oh mother', 'tell your', 'children', 'now…'] },
    { name: 'Outro',   barOffset: 12, chords: ['Am', 'C', 'D', 'Am'], lyrics: ['…not to', 'do what', 'I have', 'done.'] },
  ],
  bars: [
    // Verse 1
    { chord: 'Am', section: 'Verse 1', notes: [
      { string: 5, fret: 0, beat: 0, finger: 1 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 3, fret: 2, beat: 2, finger: 3 },
      { string: 2, fret: 1, beat: 3, finger: 1 },
    ]},
    { chord: 'C', section: 'Verse 1', notes: [
      { string: 5, fret: 3, beat: 0, finger: 3 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 2, fret: 1, beat: 2, finger: 1 },
      { string: 1, fret: 0, beat: 3 },
    ]},
    { chord: 'D', section: 'Verse 1', notes: [
      { string: 4, fret: 0, beat: 0 },
      { string: 3, fret: 2, beat: 1, finger: 1 },
      { string: 1, fret: 2, beat: 2, finger: 2 },
      { string: 2, fret: 3, beat: 3, finger: 3 },
    ]},
    { chord: 'Em', section: 'Verse 1', notes: [
      { string: 6, fret: 0, beat: 0 },
      { string: 5, fret: 2, beat: 1, finger: 2 },
      { string: 4, fret: 2, beat: 2, finger: 3 },
      { string: 1, fret: 0, beat: 3 },
    ]},
    // Verse 2
    { chord: 'Am', section: 'Verse 2', notes: [
      { string: 5, fret: 0, beat: 0 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 3, fret: 2, beat: 2, finger: 3 },
      { string: 2, fret: 1, beat: 3, finger: 1 },
    ]},
    { chord: 'C', section: 'Verse 2', notes: [
      { string: 5, fret: 3, beat: 0, finger: 3 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 3, fret: 0, beat: 2 },
      { string: 2, fret: 1, beat: 3, finger: 1 },
    ]},
    { chord: 'Em', section: 'Verse 2', notes: [
      { string: 6, fret: 0, beat: 0 },
      { string: 5, fret: 2, beat: 1, finger: 2 },
      { string: 4, fret: 2, beat: 2, finger: 3 },
      { string: 3, fret: 0, beat: 3 },
    ]},
    { chord: 'Am', section: 'Verse 2', notes: [
      { string: 5, fret: 0, beat: 0 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 2, fret: 1, beat: 2, finger: 1 },
      { string: 3, fret: 2, beat: 3, finger: 3 },
    ]},
    // Chorus
    { chord: 'G', section: 'Chorus', notes: [
      { string: 6, fret: 3, beat: 0, finger: 2 },
      { string: 5, fret: 2, beat: 1, finger: 1 },
      { string: 1, fret: 3, beat: 2, finger: 3 },
      { string: 2, fret: 0, beat: 3 },
    ]},
    { chord: 'D', section: 'Chorus', notes: [
      { string: 4, fret: 0, beat: 0 },
      { string: 3, fret: 2, beat: 1, finger: 1 },
      { string: 2, fret: 3, beat: 2, finger: 3 },
      { string: 1, fret: 2, beat: 3, finger: 2 },
    ]},
    { chord: 'Em', section: 'Chorus', notes: [
      { string: 6, fret: 0, beat: 0 },
      { string: 5, fret: 2, beat: 1, finger: 2 },
      { string: 4, fret: 2, beat: 2, finger: 3 },
      { string: 1, fret: 0, beat: 3 },
    ]},
    { chord: 'C', section: 'Chorus', notes: [
      { string: 5, fret: 3, beat: 0, finger: 3 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 3, fret: 0, beat: 2 },
      { string: 2, fret: 1, beat: 3, finger: 1 },
    ]},
    // Outro
    { chord: 'Am', section: 'Outro', notes: [
      { string: 5, fret: 0, beat: 0 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 3, fret: 2, beat: 2, finger: 3 },
      { string: 2, fret: 1, beat: 3, finger: 1 },
    ]},
    { chord: 'C', section: 'Outro', notes: [
      { string: 5, fret: 3, beat: 0, finger: 3 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 2, fret: 1, beat: 2, finger: 1 },
      { string: 1, fret: 0, beat: 3 },
    ]},
    { chord: 'D', section: 'Outro', notes: [
      { string: 4, fret: 0, beat: 0 },
      { string: 3, fret: 2, beat: 1, finger: 1 },
      { string: 1, fret: 2, beat: 2, finger: 2 },
      { string: 2, fret: 3, beat: 3, finger: 3 },
    ]},
    { chord: 'Am', section: 'Outro', notes: [
      { string: 5, fret: 0, beat: 0 },
      { string: 4, fret: 2, beat: 1, finger: 2 },
      { string: 3, fret: 2, beat: 2, finger: 3 },
      { string: 2, fret: 1, beat: 3, finger: 1 },
    ]},
  ],
};
