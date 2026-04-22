import type { ChordShape, Finger, TabNote } from '../music/types';
import { FINGER_COLOR } from '../music/finger-colors';
import { fingerPatternUrl } from './patterns/FingerPatterns';

export interface FretboardHighlight {
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  finger?: Finger;
  /** Draw with a pulse ring — used for the currently-playing note. */
  active?: boolean;
  /** Render muted ("×") or open ("○") marker above the nut. */
  muted?: boolean;
  open?: boolean;
  /** Text override for the dot (defaults to the finger number). */
  label?: string;
}

interface FretboardProps {
  highlights: FretboardHighlight[];
  frets?: number;
  height?: number;
  showFretNumbers?: boolean;
  encoding?: 'color' | 'pattern';
}

export function Fretboard({
  highlights,
  frets = 12,
  height = 220,
  showFretNumbers = true,
  encoding = 'color',
}: FretboardProps) {
  const pad = 46;
  const fretW = 80;
  const W = fretW * frets + pad * 2;
  const stringGap = (height - pad) / 5;

  const stringY = (str: number) => pad / 2 + (str - 1) * stringGap;
  const fretX = (fret: number) => pad + (fret - 0.5) * fretW;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', color: 'var(--ink)' }}>
      {/* board */}
      <rect x={pad} y={0} width={fretW * frets} height={height} fill="var(--surface-2)" stroke="currentColor" strokeWidth={3} />

      {/* inlay dots */}
      {[3, 5, 7, 9].map((f) => (
        <circle key={f} cx={fretX(f)} cy={height / 2} r={7} fill="currentColor" opacity={0.25} />
      ))}
      {frets >= 12 && (
        <g>
          <circle cx={fretX(12)} cy={height * 0.3} r={7} fill="currentColor" opacity={0.25} />
          <circle cx={fretX(12)} cy={height * 0.7} r={7} fill="currentColor" opacity={0.25} />
        </g>
      )}

      {/* nut */}
      <rect x={pad - 6} y={0} width={10} height={height} fill="currentColor" />

      {/* fret lines */}
      {Array.from({ length: frets + 1 }).map((_, i) => (
        <line key={`f${i}`}
          x1={pad + i * fretW} y1={0}
          x2={pad + i * fretW} y2={height}
          stroke="currentColor" strokeWidth={2} />
      ))}

      {/* strings — thicker toward low E */}
      {Array.from({ length: 6 }).map((_, i) => {
        const y = stringY(i + 1);
        return (
          <line key={`s${i}`}
            x1={pad} y1={y}
            x2={pad + fretW * frets} y2={y}
            stroke="currentColor" strokeWidth={1 + i * 0.55} opacity={0.75} />
        );
      })}

      {showFretNumbers && Array.from({ length: frets }).map((_, i) => (
        <text key={`fn${i}`} x={fretX(i + 1)} y={height - 6} fontSize={14} textAnchor="middle" fill="currentColor" fontWeight={700} opacity={0.7}>
          {i + 1}
        </text>
      ))}

      {/* muted / open markers at the nut */}
      {highlights.filter((h) => h.muted || h.open).map((h, i) => {
        const y = stringY(h.string);
        const x = pad - 18;
        if (h.muted) {
          const r = 9;
          return (
            <g key={`om${i}`}>
              <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
              <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            </g>
          );
        }
        return <circle key={`om${i}`} cx={x} cy={y} r={9} fill="none" stroke="currentColor" strokeWidth={2.5} />;
      })}

      {/* fretted highlights */}
      {highlights.filter((h) => !h.muted && !h.open && h.fret > 0).map((h, i) => {
        const x = fretX(h.fret);
        const y = stringY(h.string);
        const solidColor = h.finger ? FINGER_COLOR[h.finger] : 'var(--ink)';
        const fill = h.finger && encoding === 'pattern' ? fingerPatternUrl(h.finger) : solidColor;
        const r = h.active ? 22 : 18;
        return (
          <g key={`hl${i}`}>
            {h.active && (
              <circle cx={x} cy={y} r={30} fill="none" stroke={solidColor} strokeWidth={3} opacity={0.35}>
                <animate attributeName="r" values="20;36;20" dur="1.1s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.55;0.0;0.55" dur="1.1s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={x} cy={y} r={r} fill={fill} stroke="currentColor" strokeWidth={2.5} />
            <text x={x} y={y + 6} fontSize={18} textAnchor="middle" fill="#fff" fontWeight={900} style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 1 }}>
              {h.label ?? h.finger ?? ''}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// Convenience: build Fretboard highlights from a chord shape.
export function highlightsFromChord(chord: ChordShape): FretboardHighlight[] {
  const out: FretboardHighlight[] = [];
  const startFret = chord.startFret ?? 1;
  for (const b of chord.barres ?? []) {
    const from = Math.min(b.fromString, b.toString);
    const to = Math.max(b.fromString, b.toString);
    for (let s = from; s <= to; s++) {
      out.push({ string: s as 1 | 2 | 3 | 4 | 5 | 6, fret: b.fret, finger: b.finger });
    }
  }
  for (const n of chord.notes) {
    if (n.muted) out.push({ string: n.string, fret: 0, muted: true });
    else if (n.open) out.push({ string: n.string, fret: 0, open: true });
    else out.push({ string: n.string, fret: n.fret + startFret - 1, finger: n.finger });
  }
  return out;
}

// Convenience: mark a single note as the active pulse overlay on an existing set.
export function withActiveNote(highlights: FretboardHighlight[], note: TabNote | undefined): FretboardHighlight[] {
  if (!note || typeof note.fret !== 'number' || note.fret === 0) return highlights;
  const fret = note.fret;
  return [
    ...highlights.map((h) => (h.string === note.string && h.fret === fret ? { ...h, active: true } : h)),
    // Add the active note if it's not already part of the chord shape.
    ...(highlights.some((h) => h.string === note.string && h.fret === fret)
      ? []
      : [{ string: note.string, fret, finger: note.finger, active: true } as FretboardHighlight]),
  ];
}
