import { PALETTE } from '../render/palette';
import { hollowStroke, solidStroke, textPath, textUnits, wrapText } from './angularFont';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

const CYAN = css(PALETTE.ship);
const PALE = css(PALETTE.bolt);
const AMBER = '#ffe36b';
/** Bottom of DRIFT's fill: the Ship's cyan deepened toward blue. */
const DEEP_BLUE = '#1f6bff';
const HUNTER = css(PALETTE.hunter);

/** The GHOST DRIFT logo, centred on `cx`, with its top at `top`. */
function logo(cx: number, top: number): string {
  const u = 26;
  const weight = u * 0.95;
  const driftUnits = textUnits('DRIFT');
  const ghost = textPath('GHOST', cx - (textUnits('GHOST') * u) / 2, top, u);
  const drift = textPath('DRIFT', cx - (driftUnits * u) / 2 + u * 2.2, top + u * 8.4, u);

  const echoes = [3, 2, 1]
    .map((k) => {
      const dx = -k * u * 0.75;
      const echo = hollowStroke(ghost, weight, 2, CYAN, 0.18 + 0.12 * (3 - k));
      return `<g transform="translate(${dx} 0)">${echo}</g>`;
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

/**
 * A game-over message in the title's lettering: solid, in the Hunters' warm colours, with one
 * wireframe echo behind. Long messages wrap onto a second line.
 */
export function gameOverSvg(message: string): string {
  const w = 1600;
  const u = 18;
  const weight = u * 0.95;
  const lines = wrapText(message, 78);
  const lineHeight = u * 8.5;
  const h = lines.length * lineHeight + u * 2;
  const paths = lines.map((line, i) =>
    textPath(line, w / 2 - (textUnits(line) * u) / 2, u + i * lineHeight, u),
  );
  const d = paths.join(' ');
  return `<svg class="game-over" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="overFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${AMBER}"/>
        <stop offset="1" stop-color="${HUNTER}"/>
      </linearGradient>
    </defs>
    <g transform="skewX(-14)" transform-origin="${w / 2} ${h / 2}">
      <g transform="translate(${-u * 0.9} 0)">${hollowStroke(d, weight, 2, HUNTER, 0.5)}</g>
      ${solidStroke(d, weight, 'url(#overFill)')}
    </g>
  </svg>`;
}
