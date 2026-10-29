import { PALETTE } from '../render/palette';
import { hollowStroke, solidStroke, textPath, textUnits, wrapText } from './angularFont';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

const CYAN = css(PALETTE.ship);
const PALE = css(PALETTE.bolt);
const AMBER = '#ffe36b';
/** Bottom of DRIFT's fill: the Ship's cyan deepened toward blue. */
const DEEP_BLUE = '#1f6bff';
const HUNTER = css(PALETTE.hunter);

/** The GHOST DRIFT logo, centered on `cx`, with its top at `top`. */
function logo(cx: number, top: number): string {
  const u = 26;
  const weight = u * 0.95;
  const driftUnits = textUnits('DRIFT');
  const ghost = textPath('GHOST', cx - (textUnits('GHOST') * u) / 2, top, u);
  const drift = textPath('DRIFT', cx - (driftUnits * u) / 2 + u * 2.2, top + u * 8.4, u);

  // Afterimages as in a Powerslide: each left further back along the line of travel and turned a
  // little further, as the nose swings while the Ship slides on.
  const pivot = `${cx} ${top + u * 3}`;
  const echoes = [4, 3, 2, 1]
    .map((k) => {
      const echo = hollowStroke(ghost, weight, 2, CYAN, 0.12 + 0.1 * (4 - k));
      const slide = `translate(${-k * u * 1.15} ${k * u * 0.2}) rotate(${k * 1.3} ${pivot})`;
      return `<g transform="${slide}">${echo}</g>`;
    })
    .join('');
  const speedLines = [0.6, 2.2, 3.8, 5.4]
    .map((row, i) => {
      const y = top + u * 8.4 + row * u;
      const x1 = cx - (driftUnits * u) / 2 - u * (6 + i * 1.5);
      return `<line x1="${x1}" y1="${y}" x2="${x1 + u * (4 + i)}" y2="${y}" stroke="${AMBER}" stroke-width="3" opacity="${0.9 - i * 0.15}"/>`;
    })
    .join('');
  const bar = `<polygon points="${cx - u * 13},${top + u * 15.8} ${cx + u * 15},${top + u * 15.8} ${cx + u * 14.2},${top + u * 16.4} ${cx - u * 13.8},${top + u * 16.4}" fill="${AMBER}"/>`;

  return `<g transform="skewX(-14)" transform-origin="${cx} ${top + u * 8}">
    ${echoes}
    ${hollowStroke(ghost, weight, 3, CYAN)}
    ${speedLines}
    ${solidStroke(drift, weight, 'url(#driftFill)')}
    ${bar}
  </g>`;
}

/** The GHOST DRIFT logo on a transparent background, to sit over the live title scene. */
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
