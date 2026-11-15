import { useEffect, useRef } from 'react';
import { rasterise } from '../lib/dotfont';

interface Props {
  /** Text rows. Rendered upper-case, centred, clipped to `cols`. */
  lines: string[];
  /** Characters per row. */
  cols: number;
  className?: string;
  /** Milliseconds for the column wipe when the text changes. */
  wipeMs?: number;
}

const LIT = '#ffb238';
const UNLIT = '#2b1e0a';
const EDGE = '#fff3cf';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Pre-renders one LED (with its halo) so a frame is just a few thousand blits. */
function makeDot(pitch: number, color: string, halo: number): HTMLCanvasElement {
  const size = Math.ceil(pitch * 3);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const mid = size / 2;
  if (halo > 0) {
    const glow = g.createRadialGradient(mid, mid, pitch * 0.2, mid, mid, pitch * 1.45);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'transparent');
    g.globalAlpha = halo;
    g.fillStyle = glow;
    g.fillRect(0, 0, size, size);
    g.globalAlpha = 1;
  }
  g.fillStyle = color;
  g.beginPath();
  g.arc(mid, mid, pitch * 0.36, 0, Math.PI * 2);
  g.fill();
  return c;
}

/**
 * Amber LED message board. New text wipes in column by column behind a
 * bright leading edge, the way a highway message sign refreshes.
 */
const DotMatrix: React.FC<Props> = ({ lines, cols, className, wipeMs = 620 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shownRef = useRef<Uint8Array | null>(null);
  const key = lines.join('\n');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const target = rasterise(key.split('\n'), cols);
    const previous =
      shownRef.current && shownRef.current.length === target.cells.length
        ? shownRef.current
        : new Uint8Array(target.cells.length);

    let raf = 0;
    let pitch = 0;
    let sprites: { lit: HTMLCanvasElement; unlit: HTMLCanvasElement; edge: HTMLCanvasElement } | null = null;
    let progress = prefersReducedMotion() ? 1 : 0;
    const start = performance.now();

    const layout = () => {
      const cssWidth = canvas.clientWidth;
      if (!cssWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      pitch = (cssWidth * dpr) / target.width;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(pitch * target.height);
      canvas.style.height = `${canvas.height / dpr}px`;
      sprites = {
        lit: makeDot(pitch, LIT, 0.5),
        unlit: makeDot(pitch, UNLIT, 0),
        edge: makeDot(pitch, EDGE, 0.85),
      };
    };

    const draw = () => {
      if (!sprites) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const edgeCol = progress < 1 ? Math.floor(progress * (target.width + 2)) : -9;
      const half = sprites.lit.width / 2;
      for (let y = 0; y < target.height; y++) {
        for (let x = 0; x < target.width; x++) {
          const i = y * target.width + x;
          const on = x < edgeCol || progress >= 1 ? target.cells[i] : previous[i];
          const sprite = x === edgeCol || x === edgeCol + 1 ? sprites.edge : on ? sprites.lit : sprites.unlit;
          ctx.drawImage(sprite, (x + 0.5) * pitch - half, (y + 0.5) * pitch - half);
        }
      }
    };

    const tick = (now: number) => {
      progress = Math.min(1, (now - start) / wipeMs);
      draw();
      if (progress < 1) raf = requestAnimationFrame(tick);
      else shownRef.current = target.cells;
    };

    layout();
    if (progress >= 1) {
      draw();
      shownRef.current = target.cells;
    } else {
      raf = requestAnimationFrame(tick);
    }

    const observer = new ResizeObserver(() => {
      layout();
      draw();
    });
    observer.observe(canvas);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      // A wipe cut short still leaves the new text as the thing on screen.
      shownRef.current = target.cells;
    };
  }, [key, cols, wipeMs]);

  return <canvas ref={canvasRef} className={className} role="img" aria-label={lines.join(' ')} />;
};

export default DotMatrix;
