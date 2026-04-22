import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Props for {@link FocusSpotlight}.
 */
export interface FocusSpotlightProps {
  /** Whether the spotlight is active. */
  enabled: boolean;
  /** CSS selector of the element(s) to keep fully bright. If multiple match, all stay lit. Default: '.w1-now, .w4-posbox, .gg-voice-toast'. */
  targetSelector?: string;
  /** Dim opacity for everything OUTSIDE the target(s). 0 = pure black, 1 = fully visible. Default: 0.18. */
  dimOpacity?: number;
}

/** Internal cutout shape measured from a target element. */
interface CutoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_SELECTOR = '.w1-now, .w4-posbox, .gg-voice-toast';
const DEFAULT_DIM_OPACITY = 0.18;
const PADDING = 8;
const BORDER_RADIUS = 16;
const POLL_INTERVAL_MS = 200;

/**
 * Measure all elements matching `selector` and return their padded bounding rects.
 * Returns an empty array if there are no matches.
 */
function measureTargets(selector: string): CutoutRect[] {
  const nodes = document.querySelectorAll<HTMLElement>(selector);
  const rects: CutoutRect[] = [];
  nodes.forEach((node) => {
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    rects.push({
      x: r.left - PADDING,
      y: r.top - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    });
  });
  return rects;
}

/**
 * Full-viewport dim overlay with SVG-mask cutouts around the currently focused
 * element(s). When `enabled` is true a fixed portal is mounted in `document.body`,
 * dimming everything except elements matching `targetSelector`.
 *
 * Re-measures on window resize, scroll, and every 200 ms via rAF so the spotlight
 * tracks the now-playing chord as the song progresses.
 */
export function FocusSpotlight(props: FocusSpotlightProps): JSX.Element | null {
  const { enabled, targetSelector = DEFAULT_SELECTOR, dimOpacity = DEFAULT_DIM_OPACITY } = props;
  const [rects, setRects] = useState<CutoutRect[]>([]);
  const [viewport, setViewport] = useState<{ w: number; h: number }>(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 0,
    h: typeof window !== 'undefined' ? window.innerHeight : 0,
  }));
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const update = (): void => {
      setRects(measureTargets(targetSelector));
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };

    update();

    const onResize = (): void => update();
    const onScroll = (): void => update();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);

    const tick = (ts: number): void => {
      if (ts - lastTickRef.current >= POLL_INTERVAL_MS) {
        lastTickRef.current = ts;
        update();
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, targetSelector]);

  if (!enabled) return null;
  if (typeof document === 'undefined') return null;

  const backdropAlpha = Math.max(0, Math.min(1, 1 - dimOpacity));
  const maskId = 'gg-focus-spotlight-mask';

  const overlay = (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 15,
      }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${viewport.w} ${viewport.h}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <mask id={maskId}>
            <rect x={0} y={0} width={viewport.w} height={viewport.h} fill="white" />
            {rects.map((r, i) => (
              <rect
                key={i}
                x={r.x}
                y={r.y}
                width={r.width}
                height={r.height}
                rx={BORDER_RADIUS}
                ry={BORDER_RADIUS}
                fill="black"
                style={{ transition: 'all 160ms ease-out' }}
              />
            ))}
          </mask>
        </defs>
        <rect
          x={0}
          y={0}
          width={viewport.w}
          height={viewport.h}
          fill={`rgba(0,0,0,${backdropAlpha})`}
          mask={`url(#${maskId})`}
        />
      </svg>
    </div>
  );

  return createPortal(overlay, document.body);
}
