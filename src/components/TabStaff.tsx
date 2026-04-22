import type { Bar } from '../music/types';
import { FINGER_COLOR } from '../music/finger-colors';

export interface TabStaffProps {
  bars: Bar[];
  beatsPerBar: number;
  /** CSS pixel width allocated per bar. */
  barWidth?: number;
  lineHeight?: number;
  fontSize?: number;
  /** Index of the currently-playing bar (for highlighting). */
  activeBar?: number;
  /** Index of the currently-playing note within the active bar. */
  activeNote?: number;
  /** Indices (within `bars`) of A and B loop markers; -1 means "not set / offscreen". */
  loopABar?: number;
  loopBBar?: number;
}

const STRING_LABELS = ['e', 'B', 'G', 'D', 'A', 'E'];

export function TabStaff({
  bars,
  beatsPerBar,
  barWidth = 360,
  lineHeight = 44,
  fontSize = 36,
  activeBar = -1,
  activeNote = -1,
  loopABar = -1,
  loopBBar = -1,
}: TabStaffProps) {
  const height = lineHeight * 6 + 40;
  const W = barWidth * bars.length + 60;

  // Resolve the loop-range rectangle within the currently-visible window.
  // `loopABar` / `loopBBar` may be -1 (not visible) or beyond range; clamp to
  // [0, bars.length] and only paint when the clamped range has positive width.
  const abFrom = Math.max(0, loopABar);
  const abTo = Math.min(bars.length, loopBBar >= 0 ? loopBBar + 1 : -1);
  const showAB = loopABar >= 0 && loopBBar >= 0 && abFrom < abTo;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', color: 'var(--ink)' }}>
      {showAB && (
        <rect
          x={40 + abFrom * barWidth}
          y={10}
          width={(abTo - abFrom) * barWidth}
          height={5 * lineHeight + 20}
          fill="var(--accent)"
          fillOpacity={0.09}
          stroke="var(--accent)"
          strokeOpacity={0.35}
          strokeWidth={2}
          strokeDasharray="6 4"
          rx={4}
        />
      )}
      {loopABar >= 0 && loopABar < bars.length && (
        <text x={40 + loopABar * barWidth + 6} y={9} fontSize={13} fontWeight={900} fill="var(--accent)">A</text>
      )}
      {loopBBar >= 0 && loopBBar < bars.length && (
        <text x={40 + (loopBBar + 1) * barWidth - 18} y={9} fontSize={13} fontWeight={900} fill="var(--accent)">B</text>
      )}

      {Array.from({ length: 6 }).map((_, i) => {
        const y = 20 + i * lineHeight;
        return <line key={`str${i}`} x1={40} y1={y} x2={W - 20} y2={y} stroke="currentColor" strokeWidth={1.5} />;
      })}

      {STRING_LABELS.map((ln, i) => (
        <text key={ln} x={28} y={28 + i * lineHeight} fontSize={lineHeight * 0.55}
          textAnchor="end" fill="currentColor" fontWeight={800}>
          {ln}
        </text>
      ))}

      {Array.from({ length: bars.length + 1 }).map((_, i) => (
        <line key={`bar${i}`}
          x1={40 + i * barWidth} y1={20}
          x2={40 + i * barWidth} y2={20 + 5 * lineHeight}
          stroke="currentColor" strokeWidth={i === 0 || i === bars.length ? 3 : 1.5} />
      ))}

      {bars.map((bar, bi) => (
        <g key={`b-${bi}`}>
          {bar.chord && (
            <text x={40 + bi * barWidth + 10} y={10} fontSize={14} fontWeight={800} fill="var(--ink-mute)">
              {bar.chord}
            </text>
          )}
          {bar.notes.map((n, ni) => {
            const x = 40 + bi * barWidth + ((n.beat + 0.5) / beatsPerBar) * barWidth;
            const y = 20 + (n.string - 1) * lineHeight + 7;
            const active = bi === activeBar && ni === activeNote;
            const color = n.finger ? FINGER_COLOR[n.finger] : 'var(--ink)';
            return (
              <g key={`${bi}-${ni}`}>
                <rect
                  x={x - fontSize * 0.6} y={y - fontSize * 0.8}
                  width={fontSize * 1.2} height={fontSize * 1}
                  rx={6}
                  fill={active ? color : 'var(--surface-2)'}
                  stroke={active ? 'var(--ink)' : 'transparent'}
                  strokeWidth={active ? 2.5 : 0} />
                <text
                  x={x} y={y}
                  fontSize={fontSize}
                  textAnchor="middle"
                  fill={active ? '#fff' : 'currentColor'}
                  fontWeight={900}>
                  {n.fret}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
