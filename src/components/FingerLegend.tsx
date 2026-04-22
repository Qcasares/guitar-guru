import { FINGER_COLOR, FINGER_NAME } from '../music/finger-colors';
import type { Finger } from '../music/types';
import { fingerPatternUrl } from './patterns/FingerPatterns';

interface FingerLegendProps {
  size?: number;
  direction?: 'row' | 'column';
  encoding?: 'color' | 'pattern';
}

const FINGERS: Finger[] = [1, 2, 3, 4];

export function FingerLegend({ size = 36, direction = 'row', encoding = 'color' }: FingerLegendProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: direction,
        gap: 14,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
      aria-label="Finger legend">
      {FINGERS.map((f) => (
        <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={size / 2 - 3}
              fill={encoding === 'pattern' ? fingerPatternUrl(f) : FINGER_COLOR[f]}
              stroke="var(--ink)"
              strokeWidth={3}
            />
            <text
              x={size / 2}
              y={size / 2 + size * 0.2}
              textAnchor="middle"
              fontSize={size * 0.55}
              fontWeight={800}
              fill="#fff"
              style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 1 }}
            >
              {f}
            </text>
          </svg>
          <div style={{ fontSize: size * 0.5, color: 'var(--ink-soft)', fontWeight: 700 }}>
            {FINGER_NAME[f]}
          </div>
        </div>
      ))}
    </div>
  );
}
