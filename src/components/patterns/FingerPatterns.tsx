import type { JSX } from 'react';
import type { Finger } from '../../music/types';
import { FINGER_COLOR } from '../../music/finger-colors';

/**
 * SVG pattern defs for finger indicators. Rendered once per <svg> tree,
 * these provide a pattern+colour dual encoding so low-vision and
 * colour-blind users can still distinguish fingers when colour alone fails.
 *
 * IDs are global (document-scoped), so a single mount per <svg> is enough.
 * All patterns are 20x20 in userSpaceOnUse units with the finger colour as
 * the background so the original colour encoding is preserved underneath.
 */

const PATTERN_SIZE = 20;
const STROKE = '#111';
const STROKE_W = 2.5;

function patternId(finger: Finger): string {
  return `gg-finger-pattern-${finger}`;
}

/** Returns a CSS-compatible url(#id) string for use as an SVG fill attribute. */
export function fingerPatternUrl(finger: Finger): string {
  return `url(#${patternId(finger)})`;
}

/** True when FingerPatternDefs has been mounted. Stubbed to always true. */
export function fingerPatternsAvailable(): boolean {
  return true;
}

function Background({ finger }: { finger: Finger }): JSX.Element {
  return <rect width={PATTERN_SIZE} height={PATTERN_SIZE} fill={FINGER_COLOR[finger]} />;
}

/** 1 — index, red: horizontal stripes. */
function IndexPattern(): JSX.Element {
  return (
    <pattern id={patternId(1)} width={PATTERN_SIZE} height={PATTERN_SIZE} patternUnits="userSpaceOnUse">
      <Background finger={1} />
      <line x1="0" y1="5" x2={PATTERN_SIZE} y2="5" stroke={STROKE} strokeWidth={STROKE_W} />
      <line x1="0" y1="15" x2={PATTERN_SIZE} y2="15" stroke={STROKE} strokeWidth={STROKE_W} />
    </pattern>
  );
}

/** 2 — middle, blue: 45-degree diagonal stripes. */
function MiddlePattern(): JSX.Element {
  return (
    <pattern id={patternId(2)} width={PATTERN_SIZE} height={PATTERN_SIZE} patternUnits="userSpaceOnUse">
      <Background finger={2} />
      <path d="M-5 5 L5 -5 M0 20 L20 0 M15 25 L25 15" stroke={STROKE} strokeWidth={STROKE_W} />
    </pattern>
  );
}

/** 3 — ring, green: dots on a grid. */
function RingPattern(): JSX.Element {
  return (
    <pattern id={patternId(3)} width={PATTERN_SIZE} height={PATTERN_SIZE} patternUnits="userSpaceOnUse">
      <Background finger={3} />
      <circle cx="5" cy="5" r="2" fill={STROKE} />
      <circle cx="15" cy="5" r="2" fill={STROKE} />
      <circle cx="5" cy="15" r="2" fill={STROKE} />
      <circle cx="15" cy="15" r="2" fill={STROKE} />
    </pattern>
  );
}

/** 4 — pinky, orange: cross-hatch at +/-45 degrees. */
function PinkyPattern(): JSX.Element {
  return (
    <pattern id={patternId(4)} width={PATTERN_SIZE} height={PATTERN_SIZE} patternUnits="userSpaceOnUse">
      <Background finger={4} />
      <path
        d="M-5 5 L5 -5 M0 20 L20 0 M15 25 L25 15 M-5 15 L15 -5 M0 20 L20 0 M5 25 L25 5"
        stroke={STROKE}
        strokeWidth={STROKE_W}
      />
    </pattern>
  );
}

/** T — thumb, purple: concentric rings. */
function ThumbPattern(): JSX.Element {
  return (
    <pattern id={patternId('T')} width={PATTERN_SIZE} height={PATTERN_SIZE} patternUnits="userSpaceOnUse">
      <Background finger="T" />
      <circle cx="10" cy="10" r="7" fill="none" stroke={STROKE} strokeWidth={STROKE_W} />
      <circle cx="10" cy="10" r="3" fill="none" stroke={STROKE} strokeWidth={STROKE_W} />
    </pattern>
  );
}

/** <defs> element containing all finger patterns; mount as child of any <svg>. */
export function FingerPatternDefs(): JSX.Element {
  return (
    <defs>
      <IndexPattern />
      <MiddlePattern />
      <RingPattern />
      <PinkyPattern />
      <ThumbPattern />
    </defs>
  );
}
