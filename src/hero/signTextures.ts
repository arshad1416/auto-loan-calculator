import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

/**
 * Canvas-drawn sign faces for the hero's night drive. Every figure printed
 * on these signs is one the calculator applies, so keep them in step with
 * src/lib/calculator.ts when the rules change.
 */

const FONT = '"Overpass Variable", "Overpass", "Helvetica Neue", Arial, sans-serif';

const GREEN = '#00643c';
const WHITE = '#f3f1e7';
const BLACK = '#111210';
const YELLOW = '#ffc81f';
const ORANGE = '#ff7a1a';

type G = CanvasRenderingContext2D;

function canvas(w: number, h: number): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  return t;
}

function plate(g: G, w: number, h: number, fill: string, border: string) {
  const r = Math.min(w, h) * 0.07;
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(0, 0, w, h, r);
  g.fill();
  const inset = Math.min(w, h) * 0.035;
  g.strokeStyle = border;
  g.lineWidth = Math.min(w, h) * 0.022;
  g.beginPath();
  g.roundRect(inset, inset, w - inset * 2, h - inset * 2, r * 0.7);
  g.stroke();
}

function downArrow(g: G, x: number, y: number, size: number, color: string) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - size * 0.16, y - size);
  g.lineTo(x + size * 0.16, y - size);
  g.lineTo(x + size * 0.16, y - size * 0.35);
  g.lineTo(x + size * 0.5, y - size * 0.35);
  g.lineTo(x, y + size * 0.3);
  g.lineTo(x - size * 0.5, y - size * 0.35);
  g.lineTo(x - size * 0.16, y - size * 0.35);
  g.closePath();
  g.fill();
}

/** Distance-sign layout: a place on the left, its figure on the right. */
export function taxDistanceSign(rows: Array<[string, string]>): CanvasTexture {
  const [c, g] = canvas(1536, 600);
  plate(g, c.width, c.height, GREEN, WHITE);
  const rowH = (c.height - 110) / rows.length;
  g.fillStyle = WHITE;
  g.textBaseline = 'middle';
  rows.forEach(([place, figure], i) => {
    const y = 55 + rowH * (i + 0.5);
    g.font = `700 ${Math.round(rowH * 0.62)}px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(place, 90, y);
    g.textAlign = 'right';
    g.fillText(figure, c.width - 90, y);
    if (i < rows.length - 1) {
      g.fillRect(90, y + rowH / 2 - 2, c.width - 180, 4);
    }
  });
  return toTexture(c);
}

/** Lane-assignment panel with a down arrow, optionally carrying a yellow tab. */
export function lanePanel(title: string, caption: string, tab?: string): CanvasTexture {
  const [c, g] = canvas(900, 620);
  plate(g, c.width, c.height, GREEN, WHITE);
  g.fillStyle = WHITE;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 108px ${FONT}`;
  g.fillText(title, c.width / 2, 150);
  g.font = `600 58px ${FONT}`;
  g.fillText(caption, c.width / 2, 262);
  if (tab) {
    g.fillStyle = YELLOW;
    g.beginPath();
    g.roundRect(40, 400, c.width - 80, 180, 26);
    g.fill();
    g.fillStyle = BLACK;
    g.font = `800 92px ${FONT}`;
    g.fillText(tab, c.width / 2 - 70, 494);
    downArrow(g, c.width - 170, 500, 86, BLACK);
  } else {
    downArrow(g, c.width / 2, 470, 150, WHITE);
  }
  return toTexture(c);
}

/** Warning diamond. Corners stay transparent so the mesh reads as a diamond. */
export function diamond(lines: string[], tone: 'yellow' | 'orange'): CanvasTexture {
  const [c, g] = canvas(640, 640);
  const side = 420;
  g.translate(320, 320);
  g.rotate(Math.PI / 4);
  g.fillStyle = tone === 'yellow' ? YELLOW : ORANGE;
  g.beginPath();
  g.roundRect(-side / 2, -side / 2, side, side, 34);
  g.fill();
  g.strokeStyle = BLACK;
  g.lineWidth = 13;
  g.beginPath();
  g.roundRect(-side / 2 + 20, -side / 2 + 20, side - 40, side - 40, 22);
  g.stroke();
  g.rotate(-Math.PI / 4);
  g.fillStyle = BLACK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 76px ${FONT}`;
  const lineH = 82;
  lines.forEach((line, i) => {
    g.fillText(line, 0, (i - (lines.length - 1) / 2) * lineH + 4);
  });
  return toTexture(c);
}

/** The small rectangular tab that hangs under a warning diamond. */
export function tab(text: string, tone: 'yellow' | 'orange'): CanvasTexture {
  const [c, g] = canvas(640, 220);
  plate(g, c.width, c.height, tone === 'yellow' ? YELLOW : ORANGE, BLACK);
  g.fillStyle = BLACK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 92px ${FONT}`;
  g.fillText(text, c.width / 2, c.height / 2 + 6);
  return toTexture(c);
}

/** Speed-limit style regulatory sign: caption, a large number, a unit. */
export function limitSign(caption: string[], value: string, unit: string): CanvasTexture {
  const [c, g] = canvas(460, 660);
  plate(g, c.width, c.height, WHITE, BLACK);
  g.fillStyle = BLACK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `800 70px ${FONT}`;
  caption.forEach((line, i) => g.fillText(line, c.width / 2, 92 + i * 76));
  g.font = `800 270px ${FONT}`;
  g.fillText(value, c.width / 2, 392);
  g.font = `800 62px ${FONT}`;
  g.fillText(unit, c.width / 2, 572);
  return toTexture(c);
}

/** Soft round glow used for headlights, tail lights and reflectors. */
export function glow(inner: string, outer: string): CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.25, outer);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return toTexture(c);
}

/** A repeating strip of spruce silhouettes for the treeline. */
export function treeline(seed: number): CanvasTexture {
  const [c, g] = canvas(2048, 256);
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  g.fillStyle = '#fff';
  // Understorey, so the base of the strip is solid.
  g.fillRect(0, 196, c.width, 60);
  let x = 0;
  while (x < c.width) {
    const height = 80 + rand() * 160;
    const halfWidth = height * (0.13 + rand() * 0.06);
    const top = c.height - height;
    const tiers = 5 + Math.floor(rand() * 4);
    // A spruce is a stack of overlapping skirts, each wider than the last.
    for (let i = 0; i < tiers; i++) {
      const apex = top + (height * i) / tiers * 0.82;
      const hem = apex + (height / tiers) * 1.9;
      const reach = halfWidth * ((i + 1.4) / (tiers + 0.4));
      g.beginPath();
      g.moveTo(x, apex);
      g.lineTo(x + reach, hem);
      g.lineTo(x - reach, hem);
      g.closePath();
      g.fill();
    }
    g.fillRect(x - 2, top + height * 0.5, 4, height * 0.5);
    x += 10 + rand() * 30;
  }
  return toTexture(c);
}
