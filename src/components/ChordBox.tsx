import type { ChordShape } from '../music/types';
import { FINGER_COLOR } from '../music/finger-colors';
import { fingerPatternUrl } from './patterns/FingerPatterns';

export type ChordBoxSize = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';
export type FingerEncoding = 'color' | 'pattern';

const SIZES: Record<ChordBoxSize, { cell: number; pad: number; nameSize: number; dotSize: number; strokeW: number }> = {
  sm: { cell: 34, pad: 24, nameSize: 32, dotSize: 30, strokeW: 2.5 },
  md: { cell: 44, pad: 30, nameSize: 44, dotSize: 40, strokeW: 3 },
  lg: { cell: 58, pad: 36, nameSize: 64, dotSize: 52, strokeW: 3.5 },
  xl: { cell: 78, pad: 44, nameSize: 96, dotSize: 72, strokeW: 4 },
  xxl: { cell: 108, pad: 56, nameSize: 144, dotSize: 96, strokeW: 5 },
};

export interface ChordBoxProps {
  chord: ChordShape;
  size?: ChordBoxSize;
  showLabel?: boolean;
  /** Force a name override (e.g. display "Am" when chord.name is "A minor"). */
  nameOverride?: string;
  /** How to encode finger identity — 'color' (default) or 'pattern' for colour-blind-safe dual encoding. */
  encoding?: FingerEncoding;
}

function fingerFill(finger: NonNullable<ChordShape['notes'][number]['finger']> | undefined, encoding: FingerEncoding): string {
  if (!finger) return 'var(--ink)';
  return encoding === 'pattern' ? fingerPatternUrl(finger) : FINGER_COLOR[finger];
}

export function ChordBox({ chord, size = 'lg', showLabel = true, nameOverride, encoding = 'color' }: ChordBoxProps) {
  const { notes, frets, startFret = 1, barres = [] } = chord;
  const s = SIZES[size];
  const W = s.cell * 5 + s.pad * 2;
  const H = s.cell * frets + s.pad * 2 + 40;

  const stringX = (str: number) => s.pad + (6 - str) * s.cell;
  const fretY = (fret: number) => s.pad + 30 + (fret - 0.5) * s.cell;

  return (
    <div style={{ display: 'inline-block', fontFamily: 'inherit', color: 'var(--ink)' }}>
      {showLabel && (
        <div style={{ fontSize: s.nameSize, fontWeight: 900, lineHeight: 1, marginBottom: 8, letterSpacing: '-0.02em' }}>
          {nameOverride ?? chord.name}
        </div>
      )}
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${chord.name} chord diagram`}>
        {startFret === 1 ? (
          <rect x={s.pad - 2} y={s.pad + 22} width={s.cell * 5 + 4} height={10} fill="currentColor" />
        ) : (
          <text x={s.pad - 10} y={s.pad + 30 + s.cell * 0.6} fontSize={s.cell * 0.5} textAnchor="end" fill="currentColor" fontWeight={700}>
            {startFret}fr
          </text>
        )}

        {Array.from({ length: frets + 1 }).map((_, i) => (
          <line key={`f${i}`}
            x1={s.pad} y1={s.pad + 30 + i * s.cell}
            x2={s.pad + s.cell * 5} y2={s.pad + 30 + i * s.cell}
            stroke="currentColor" strokeWidth={s.strokeW * 0.6} strokeLinecap="round" />
        ))}

        {Array.from({ length: 6 }).map((_, i) => {
          const x = s.pad + i * s.cell;
          return (
            <line key={`s${i}`}
              x1={x} y1={s.pad + 30}
              x2={x} y2={s.pad + 30 + frets * s.cell}
              stroke="currentColor" strokeWidth={s.strokeW} strokeLinecap="round" />
          );
        })}

        {notes.filter((n) => n.open || n.muted).map((n, i) => {
          const x = stringX(n.string);
          const y = s.pad + 12;
          if (n.muted) {
            const r = s.dotSize * 0.35;
            return (
              <g key={`om${i}`}>
                <line x1={x - r} y1={y - r} x2={x + r} y2={y + r} stroke="currentColor" strokeWidth={s.strokeW} strokeLinecap="round" />
                <line x1={x + r} y1={y - r} x2={x - r} y2={y + r} stroke="currentColor" strokeWidth={s.strokeW} strokeLinecap="round" />
              </g>
            );
          }
          return (
            <circle key={`om${i}`} cx={x} cy={y} r={s.dotSize * 0.32}
              fill="none" stroke="currentColor" strokeWidth={s.strokeW} />
          );
        })}

        {barres.map((b, i) => {
          const x1 = stringX(b.fromString);
          const x2 = stringX(b.toString);
          const y = fretY(b.fret - startFret + 1);
          const fill = fingerFill(b.finger, encoding);
          return (
            <g key={`b${i}`}>
              <rect
                x={Math.min(x1, x2) - s.dotSize * 0.35}
                y={y - s.dotSize * 0.35}
                width={Math.abs(x2 - x1) + s.dotSize * 0.7}
                height={s.dotSize * 0.7}
                rx={s.dotSize * 0.35}
                fill={fill} stroke="currentColor" strokeWidth={s.strokeW * 0.7} />
              <text x={(x1 + x2) / 2} y={y + s.dotSize * 0.2} fontSize={s.dotSize * 0.55} textAnchor="middle" fill="#fff" fontWeight={900} style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 1 }}>
                {b.finger}
              </text>
            </g>
          );
        })}

        {notes.filter((n) => !n.open && !n.muted && n.fret > 0).map((n, i) => {
          const x = stringX(n.string);
          const y = fretY(n.fret - startFret + 1);
          const fill = fingerFill(n.finger, encoding);
          return (
            <g key={`n${i}`}>
              <circle cx={x} cy={y} r={s.dotSize * 0.5} fill={fill} stroke="currentColor" strokeWidth={s.strokeW * 0.8} />
              {n.finger && (
                <text x={x} y={y + s.dotSize * 0.2} fontSize={s.dotSize * 0.6} textAnchor="middle" fill="#fff" fontWeight={900} style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.55)', strokeWidth: 1 }}>
                  {n.finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
