export type Finger = 1 | 2 | 3 | 4 | 'T';

export interface ChordNote {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  finger?: Finger;
  open?: boolean;
  muted?: boolean;
}

export interface ChordBarre {
  fromString: 1 | 2 | 3 | 4 | 5 | 6;
  toString: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  finger: Finger;
}

export interface ChordShape {
  name: string;
  notes: ChordNote[];
  frets: number;
  startFret?: number;
  barres?: ChordBarre[];
}

export interface TabNote {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number | 'x';
  /** 0-based beat index within the bar; may be fractional for off-beats. */
  beat: number;
  /** Preferred fretting finger for voice announcement. */
  finger?: Finger;
}

export interface Bar {
  notes: TabNote[];
  /** Chord playing over this bar (rhythm reference). */
  chord?: string;
  /** Section label — used for subheading in the UI. */
  section?: string;
}

export interface Section {
  name: string;
  /** One chord per bar, aligned with `bars` indices starting at `barOffset`. */
  chords: string[];
  /** First bar index this section covers. */
  barOffset: number;
  lyrics?: string[];
}

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

export interface Song {
  title: string;
  artist: string;
  bpm: number;
  beatsPerBar: number;
  bars: Bar[];
  sections: Section[];
  audio?: AudioTrackRef;
}

export type PlaybackMode = 'rhythm' | 'lead';

export type Theme = 'classic' | 'sketch' | 'high-contrast' | 'dark';

export type Density = 'compact' | 'normal' | 'spacious';
