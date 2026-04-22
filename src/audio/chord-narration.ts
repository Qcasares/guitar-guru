import type { ChordShape, ChordNote, ChordBarre } from '../music/types';
import { FINGER_NAME } from '../music/finger-colors';
import { speak } from './voice';

type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

const OPEN_STRING_NOTE: Record<StringNumber, string> = {
  6: 'E',
  5: 'A',
  4: 'D',
  3: 'G',
  2: 'B',
  1: 'e',
};

const DIGIT_WORD: Record<string, string> = {
  '0': 'zero',
  '1': 'one',
  '2': 'two',
  '3': 'three',
  '4': 'four',
  '5': 'five',
  '6': 'six',
  '7': 'seven',
  '8': 'eight',
  '9': 'nine',
};

/**
 * Expand a compact chord name like "Em" or "D7" into spoken form ("E minor", "D seven").
 * Plain names like "C", "G", "F", or already-expanded names ("D minor") pass through unchanged.
 */
const expandChordName = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const digitSuffix = trimmed.match(/^([A-G][#b]?)(\d+)(.*)$/);
  if (digitSuffix) {
    const [, root, digits, rest] = digitSuffix;
    const spoken = digits.split('').map((d) => DIGIT_WORD[d] ?? d).join(' ');
    return `${root} ${spoken}${rest ? ` ${rest.trim()}` : ''}`.trim();
  }

  const minorSuffix = trimmed.match(/^([A-G][#b]?)m(?![a-z])(.*)$/);
  if (minorSuffix) {
    const [, root, rest] = minorSuffix;
    return `${root} minor${rest ? ` ${rest.trim()}` : ''}`.trim();
  }

  return trimmed;
};

const isCoveredByBarre = (note: ChordNote, barres: readonly ChordBarre[]): boolean =>
  barres.some((b) => {
    const lo = Math.min(b.fromString, b.toString);
    const hi = Math.max(b.fromString, b.toString);
    return note.string >= lo && note.string <= hi && note.fret === b.fret;
  });

const describeBarre = (barre: ChordBarre): string => {
  const finger = FINGER_NAME[barre.finger];
  return `Barre across strings ${barre.fromString} to ${barre.toString} at fret ${barre.fret} with ${finger} finger.`;
};

const describeNote = (note: ChordNote, startFret: number): string => {
  if (note.muted) return `String ${note.string} muted.`;
  if (note.open || note.fret === 0) {
    return `String ${note.string} open ${OPEN_STRING_NOTE[note.string]}.`;
  }

  const parts: string[] = [`String ${note.string}`, `fret ${note.fret}`];
  if (startFret > 1) {
    parts.push(`absolute fret ${note.fret + startFret - 1}`);
  }

  const fingerClause = note.finger !== undefined ? `, press with ${FINGER_NAME[note.finger]} finger` : '';
  return `${parts.join(', ')}${fingerClause}.`;
};

/**
 * Narrate a chord shape as a single verbose spoken sentence for low-vision users.
 * Reads chord name, optional starting fret, any barres (first), then fretted / open / muted
 * notes ordered from string 6 (low E) down to string 1 (high e).
 */
export const narrateChord = (chord: ChordShape, opts?: { rate?: number }): void => {
  const startFret = chord.startFret ?? 1;
  const barres = chord.barres ?? [];

  const segments: string[] = [];
  segments.push(`${expandChordName(chord.name)}.`);
  if (startFret > 1) segments.push(`Starting at fret ${startFret}.`);

  for (const barre of barres) segments.push(describeBarre(barre));

  const ordered = [...chord.notes]
    .filter((n) => !isCoveredByBarre(n, barres))
    .sort((a, b) => b.string - a.string);

  for (const note of ordered) segments.push(describeNote(note, startFret));

  const sentence = segments.join(' ').replace(/\s+/g, ' ').trim();
  speak(sentence, { rate: opts?.rate ?? 1.05, priority: 'replace' });
};
