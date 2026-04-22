import { useEffect, useState } from 'react';
import type { ChordShape, Finger } from '../music/types';
import { FINGER_COLOR, FINGER_NAME } from '../music/finger-colors';
import { ChordBox } from './ChordBox';

interface FingerCloseupProps {
  chord: ChordShape;
  onClose: () => void;
}

interface FingerFretting {
  finger: Finger;
  string: number;
  fret: number;
  barreTo?: number;
}

const STRING_NAMES = ['', 'high e', 'B', 'G', 'D', 'A', 'low E'];

function instructionsFor(chord: ChordShape): FingerFretting[] {
  const out: FingerFretting[] = [];
  const startFret = chord.startFret ?? 1;
  for (const b of chord.barres ?? []) {
    const from = Math.min(b.fromString, b.toString);
    const to = Math.max(b.fromString, b.toString);
    out.push({ finger: b.finger, string: from, fret: b.fret, barreTo: to });
  }
  for (const n of chord.notes) {
    if (n.muted || n.open || !n.finger) continue;
    out.push({
      finger: n.finger,
      string: n.string,
      fret: n.fret + startFret - 1,
    });
  }
  // Sort by finger number (1, 2, 3, 4, T) for a logical reading order.
  return out.sort((a, b) => {
    const order = (f: Finger) => (f === 'T' ? 0 : Number(f));
    return order(a.finger) - order(b.finger);
  });
}

export function FingerCloseup({ chord, onClose }: FingerCloseupProps) {
  const [focus, setFocus] = useState<Finger | null>(null);
  const instructions = instructionsFor(chord);

  // Dismiss on Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const focused = focus ? instructions.find((i) => i.finger === focus) : null;

  return (
    <div
      className="gg-closeup"
      role="dialog"
      aria-modal="true"
      aria-label={`Finger close-up for ${chord.name}`}
      onClick={onClose}>
      <div className="gg-closeup-card" onClick={(e) => e.stopPropagation()}>
        <div className="gg-closeup-header">
          <div className="gg-closeup-title">
            <span className="tag">Close-up</span>
            <span className="name">{chord.name}</span>
          </div>
          <button className="gg-closeup-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="gg-closeup-body">
          <div className="gg-closeup-diagram">
            {focused ? (
              <SingleFingerCallout fretting={focused} />
            ) : (
              <ChordBox chord={chord} size="xxl" />
            )}
          </div>

          <ul className="gg-closeup-fingers">
            {instructions.map((i) => {
              const stringName = i.barreTo
                ? `strings ${i.string}–${i.barreTo}`
                : `string ${i.string} (${STRING_NAMES[i.string]})`;
              const pressed = focus === i.finger;
              return (
                <li key={`${i.finger}-${i.string}-${i.fret}`}>
                  <button
                    className="gg-closeup-row"
                    aria-pressed={pressed}
                    onClick={() => setFocus(pressed ? null : i.finger)}>
                    <span
                      className="dot"
                      style={{ background: FINGER_COLOR[i.finger] }}>
                      {i.finger}
                    </span>
                    <span className="copy">
                      <b>{FINGER_NAME[i.finger][0].toUpperCase() + FINGER_NAME[i.finger].slice(1)} finger</b>
                      {i.barreTo
                        ? ` — barre across ${stringName}, fret ${i.fret}.`
                        : ` — ${stringName}, fret ${i.fret}. Press behind the fret wire.`}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="gg-closeup-footer">
          Tap a finger row to isolate it · Esc or tap outside to close
        </div>
      </div>
    </div>
  );
}

function SingleFingerCallout({ fretting }: { fretting: FingerFretting }) {
  const color = FINGER_COLOR[fretting.finger];
  const size = 320;
  const barre = typeof fretting.barreTo === 'number';
  return (
    <div style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
      <svg width={barre ? size * 1.6 : size} height={size} viewBox={`0 0 ${barre ? size * 1.6 : size} ${size}`} role="img" aria-label={`${FINGER_NAME[fretting.finger]} finger callout`}>
        {/* fingertip shape — oversized circle with a subtle shadow */}
        <defs>
          <radialGradient id="fingerGrad" cx="50%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="60%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </radialGradient>
        </defs>
        {barre ? (
          <rect x={size * 0.15} y={size * 0.3} width={size * 1.25} height={size * 0.4} rx={size * 0.2} fill="url(#fingerGrad)" stroke="var(--ink)" strokeWidth={5} />
        ) : (
          <circle cx={size / 2} cy={size / 2} r={size * 0.42} fill="url(#fingerGrad)" stroke="var(--ink)" strokeWidth={5} />
        )}
        <text
          x={barre ? size * 0.78 : size / 2}
          y={size / 2 + size * 0.12}
          fontSize={size * 0.45}
          textAnchor="middle"
          fill="#fff"
          fontWeight={900}>
          {fretting.finger}
        </text>
      </svg>
    </div>
  );
}
