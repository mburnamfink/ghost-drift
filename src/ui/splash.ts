import { Rng } from '../core/rng';
import { PALETTE } from '../render/palette';
import { hollowStroke, solidStroke, textPath, textUnits, wrapText } from './angularFont';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

const CYAN = css(PALETTE.ship);
const PALE = css(PALETTE.bolt);
const AMBER = '#ffe36b';
const SPARK = css(PALETTE.spark);
/** Bottom of DRIFT's fill: the Ship's cyan deepened toward blue. */
const DEEP_BLUE = '#1f6bff';
const HUNTER = css(PALETTE.hunter);

/** The GHOST DRIFT logo, centered on `cx`, with its top at `top`. */
function logo(cx: number, top: number): string {
  const u = 26;
  const weight = u * 0.95;
  const driftUnits = textUnits('DRIFT');
  const ghost = textPath('GHOST', cx - (textUnits('GHOST') * u) / 2, top, u);
  const driftLeft = cx - (driftUnits * u) / 2 + u * 2.2;
  const drift = textPath('DRIFT', driftLeft, top + u * 8.4, u);

  // Afterimages as in a Powerslide: each left further back along the line of travel and turned a
  // little further, as the nose swings while the Ship slides on.
  const pivot = `${cx} ${top + u * 11.4}`;
  const echoes = [4, 3, 2, 1]
    .map((k) => {
      const echo = hollowStroke(drift, weight, 2, CYAN, 0.12 + 0.1 * (4 - k));
      const slide = `translate(${-k * u * 1.15} ${k * u * 0.2}) rotate(${k * 1.3} ${pivot})`;
      return `<g transform="${slide}">${echo}</g>`;
    })
    .join('');
  const sparks = driftSparks(driftLeft, driftUnits * u, top + u * 14.9, u);

  return `<g transform="skewX(-14)" transform-origin="${cx} ${top + u * 8}">
    ${hollowStroke(ghost, weight, 3, CYAN)}
    ${sparks}
    ${echoes}
    ${solidStroke(drift, weight, 'url(#driftFill)')}
  </g>`;
}

/**
 * Sparks thrown off DRIFT's feet as off the hull in a Powerslide: small tumbling chips left behind
 * along the line of travel, thickest under the letters and thinning, shrinking and fading behind.
 * Seeded so the logo never changes.
 */
function driftSparks(left: number, width: number, feet: number, u: number): string {
  const rng = new Rng(7);
  return Array.from({ length: 34 }, () => {
    // 0 under the front of the word, 1 well behind it.
    const behind = rng.next() ** 1.6;
    const x = left + width * 0.8 - behind * (width * 0.8 + u * 7);
    const y = feet + u * (0.2 + rng.range(-0.2, 1.1) + behind * 0.6);
    const size = u * (0.55 - 0.3 * behind) * rng.range(0.6, 1.2);
    const color = rng.next() < 0.25 ? AMBER : SPARK;
    const spin = rng.range(0, 90);
    return `<rect x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}" fill="${color}" opacity="${(1 - 0.8 * behind).toFixed(2)}" transform="rotate(${spin.toFixed(0)} ${x} ${y})"/>`;
  }).join('');
}

/** The GHOST DRIFT logo on a transparent background, to sit over the splash art. */
export function splashSvg(): string {
  const w = 1600;
  const h = 470;
  return `<svg class="logo" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="driftFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${PALE}"/>
        <stop offset="0.45" stop-color="${CYAN}"/>
        <stop offset="1" stop-color="${DEEP_BLUE}"/>
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g filter="url(#glow)">${logo(w / 2, 20)}</g>
  </svg>`;
}

const TONES = {
  /** Game over: the Hunters' warm colors. */
  warm: { stops: [AMBER, HUNTER], echo: HUNTER },
  /** Pause: the Ship's cyan deepening to blue, like DRIFT. */
  cool: { stops: [PALE, CYAN, DEEP_BLUE], echo: CYAN },
} as const;

let headingCount = 0;

/**
 * A heading in the title's lettering: solid in `tone`, with one wireframe echo behind. Long text
 * wraps onto further lines.
 */
export function headingSvg(text: string, tone: keyof typeof TONES): string {
  const w = 1600;
  const u = 18;
  const weight = u * 0.95;
  const lines = wrapText(text, 78);
  const lineHeight = u * 8.5;
  const h = lines.length * lineHeight + u * 2;
  const d = lines
    .map((line, i) => textPath(line, w / 2 - (textUnits(line) * u) / 2, u + i * lineHeight, u))
    .join(' ');
  const { stops, echo } = TONES[tone];
  const fill = `heading-fill-${headingCount++}`;
  const gradient = stops
    .map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`)
    .join('');
  return `<svg class="heading" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="${fill}" x1="0" y1="0" x2="0" y2="1">${gradient}</linearGradient></defs>
    <g transform="skewX(-14)" transform-origin="${w / 2} ${h / 2}">
      <g transform="translate(${-u * 0.9} 0)">${hollowStroke(d, weight, 2, echo, 0.5)}</g>
      ${solidStroke(d, weight, `url(#${fill})`)}
    </g>
  </svg>`;
}

/** Three initials in the title's lettering, each over an underline; the slot being edited blinks. */
export function initialsSvg(letters: readonly string[], cursor: number): string {
  const u = 14;
  const weight = u * 0.95;
  const slot = u * 7;
  const w = slot * letters.length;
  const h = u * 9;
  const slots = letters
    .map((letter, i) => {
      const x = i * slot + (slot - 4 * u) / 2;
      const underline = `<rect class="${i === cursor ? 'slot cursor' : 'slot'}" x="${x - u * 0.5}" y="${u * 7.6}" width="${u * 5}" height="${u * 0.5}" fill="${i === cursor ? AMBER : PALE}"/>`;
      return `${solidStroke(textPath(letter, x, u, u), weight, i === cursor ? AMBER : CYAN)}${underline}`;
    })
    .join('');
  return `<svg class="initials" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <g transform="skewX(-14)" transform-origin="${w / 2} ${h / 2}">${slots}</g>
  </svg>`;
}
