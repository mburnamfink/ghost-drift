import { Rng } from '../core/rng';
import { PALETTE } from '../render/palette';

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

const CYAN = css(PALETTE.ship);
const PALE = css(PALETTE.bolt);
const AMBER = '#ffe36b';
/** Bottom of DRIFT's fill: the Ship's cyan deepened toward blue. */
const DEEP_BLUE = '#1f6bff';
const SKY = css(PALETTE.sky);
const EDGE = css(PALETTE.edge);
const WIRE = css(PALETTE.ghostEdge);
const GRID = css(PALETTE.grid);
const HUNTER = css(PALETTE.hunter);
const LASER = css(PALETTE.laser);

/**
 * An angular alphabet on a grid 6 units tall: each glyph is a width and a set of chamfered
 * polylines, drawn with mitred strokes. Only the letters the logo needs.
 */
const GLYPHS: Record<string, { w: number; paths: [number, number][][] }> = {
  G: {
    w: 4,
    paths: [
      [
        [4, 0],
        [1, 0],
        [0, 1],
        [0, 5],
        [1, 6],
        [4, 6],
        [4, 3],
        [2, 3],
      ],
    ],
  },
  H: {
    w: 4,
    paths: [
      [
        [0, 0],
        [0, 6],
      ],
      [
        [4, 0],
        [4, 6],
      ],
      [
        [0, 3],
        [4, 3],
      ],
    ],
  },
  O: {
    w: 4,
    paths: [
      [
        [1, 0],
        [3, 0],
        [4, 1],
        [4, 5],
        [3, 6],
        [1, 6],
        [0, 5],
        [0, 1],
        [1, 0],
      ],
    ],
  },
  S: {
    w: 4,
    paths: [
      [
        [4, 0],
        [1, 0],
        [0, 1],
        [0, 2],
        [1, 3],
        [3, 3],
        [4, 4],
        [4, 5],
        [3, 6],
        [0, 6],
      ],
    ],
  },
  T: {
    w: 4,
    paths: [
      [
        [0, 0],
        [4, 0],
      ],
      [
        [2, 0],
        [2, 6],
      ],
    ],
  },
  D: {
    w: 4,
    paths: [
      [
        [0, 0],
        [3, 0],
        [4, 1],
        [4, 5],
        [3, 6],
        [0, 6],
        [0, 0],
      ],
    ],
  },
  // The leg runs on from the bowl's corner so no stroke end pokes into the counter.
  R: {
    w: 4,
    paths: [
      [
        [0, 6],
        [0, 0],
        [3, 0],
        [4, 1],
        [4, 2],
        [3, 3],
        [4, 4],
        [4, 6],
      ],
      [
        [0, 3],
        [3, 3],
      ],
    ],
  },
  I: {
    w: 2,
    paths: [
      [
        [0, 0],
        [2, 0],
      ],
      [
        [1, 0],
        [1, 6],
      ],
      [
        [0, 6],
        [2, 6],
      ],
    ],
  },
  F: {
    w: 4,
    paths: [
      [
        [4, 0],
        [0, 0],
        [0, 6],
      ],
      [
        [0, 3],
        [3, 3],
      ],
    ],
  },
};

const GAP = 1.6;

/** SVG path data for `word` with its top-left at (x, y), in units of `u` pixels, and its width. */
function wordPath(word: string, x: number, y: number, u: number): { d: string; width: number } {
  let cursor = 0;
  const parts: string[] = [];
  for (const ch of word) {
    const glyph = GLYPHS[ch]!;
    for (const path of glyph.paths) {
      // Closing with Z mitres the last corner; returning to the start point would leave a stub.
      const [first, last] = [path[0]!, path[path.length - 1]!];
      const closed = path.length > 2 && first[0] === last[0] && first[1] === last[1];
      const points = closed ? path.slice(0, -1) : path;
      parts.push(
        points
          .map(([gx, gy], i) => `${i === 0 ? 'M' : 'L'}${x + (cursor + gx) * u} ${y + gy * u}`)
          .join(' ') + (closed ? ' Z' : ''),
      );
    }
    cursor += glyph.w + GAP;
  }
  return { d: parts.join(' '), width: (cursor - GAP) * u };
}

/** Width in grid units of `word`, for centring. */
const wordUnits = (word: string) =>
  [...word].reduce((sum, ch) => sum + GLYPHS[ch]!.w, 0) + GAP * (word.length - 1);

/** A stroke `weight` wide, hollowed to an outline `line` thick: the wireframe look. */
function hollow(d: string, weight: number, line: number, color: string, opacity = 1): string {
  return `<g opacity="${opacity}" fill="none" stroke-linejoin="miter" stroke-linecap="square" stroke-miterlimit="8">
    <path d="${d}" stroke="${color}" stroke-width="${weight}"/>
    <path d="${d}" stroke="${SKY}" stroke-width="${weight - line * 2}"/>
  </g>`;
}

function solid(d: string, weight: number, paint: string): string {
  return `<path d="${d}" fill="none" stroke="${paint}" stroke-width="${weight}" stroke-linejoin="miter" stroke-linecap="square" stroke-miterlimit="8"/>`;
}

/** The GHOST DRIFT logo, centred on `cx`, with its top at `top`. */
function logo(cx: number, top: number): string {
  const u = 26;
  const weight = u * 0.95;
  const ghostUnits = wordUnits('GHOST');
  const driftUnits = wordUnits('DRIFT');
  const ghost = wordPath('GHOST', cx - (ghostUnits * u) / 2, top, u);
  const drift = wordPath('DRIFT', cx - (driftUnits * u) / 2 + u * 2.2, top + u * 8.4, u);

  const echoes = [3, 2, 1]
    .map((k) => {
      const dx = -k * u * 0.75;
      return `<g transform="translate(${dx} 0)">${hollow(ghost.d, weight, 2, CYAN, 0.18 + 0.12 * (3 - k))}</g>`;
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
    ${hollow(ghost.d, weight, 3, CYAN)}
    ${speedLines}
    ${solid(drift.d, weight, 'url(#driftFill)')}
    ${bar}
  </g>`;
}

/** Perspective floor, Edge skyline, wireframe blocks, Hunters on the horizon, and the Ship sliding. */
function scene(w: number, h: number): string {
  const rng = new Rng(7);
  const horizon = h * 0.62;
  const vx = w / 2;
  const parts: string[] = [];

  for (let i = -24; i <= 24; i++) {
    parts.push(
      `<line x1="${vx}" y1="${horizon}" x2="${vx + i * 140}" y2="${h}" stroke="${GRID}" stroke-width="2"/>`,
    );
  }
  for (let k = 1; k < 12; k++) {
    const y = horizon + (h - horizon) * Math.pow(k / 11, 2.2);
    parts.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="${GRID}" stroke-width="2"/>`);
  }

  // The Edge: a ragged wall of solid towers along the horizon.
  let x = -20;
  const skyline: string[] = [];
  while (x < w + 20) {
    const tw = rng.range(24, 70);
    const th = rng.range(40, 150) * (0.6 + (0.8 * Math.abs(x - vx)) / w);
    const lean = rng.range(-6, 6);
    skyline.push(
      `<polygon points="${x},${horizon} ${x + lean},${horizon - th} ${x + tw + lean * 0.5},${horizon - th - rng.range(0, 14)} ${x + tw},${horizon}" fill="${EDGE}" opacity="${rng.range(0.75, 1)}"/>`,
    );
    x += tw * rng.range(0.7, 1);
  }
  parts.push(skyline.join(''));

  // Wireframe city blocks receding toward the vanishing point.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const near = 0.25 + k * 0.17;
      const bx = vx + side * w * (0.18 + near * 0.5);
      const by = horizon + (h - horizon) * near * 0.55;
      const bw = 70 + near * 160;
      const bh = 60 + near * 220 * rng.range(0.6, 1.2);
      const depth = bw * 0.35 * side;
      const fx = side > 0 ? bx : bx - bw;
      parts.push(`<g fill="none" stroke="${WIRE}" stroke-width="1.5" opacity="${0.35 + near * 0.4}">
        <polygon points="${fx},${by} ${fx + bw},${by} ${fx + bw},${by - bh} ${fx},${by - bh}"/>
        <polyline points="${side > 0 ? fx : fx + bw},${by - bh} ${(side > 0 ? fx : fx + bw) - depth},${by - bh - bw * 0.12} ${(side > 0 ? fx + bw : fx) - depth},${by - bh - bw * 0.12} ${side > 0 ? fx + bw : fx},${by - bh}"/>
      </g>`);
    }
  }

  // Hunters on the horizon, one with a Sniper's laser.
  for (const [hx, s] of [
    [vx - 320, 1],
    [vx + 260, 0.8],
    [vx + 420, 1.1],
  ] as const) {
    parts.push(
      `<polygon points="${hx - 18 * s},${horizon + 14} ${hx + 18 * s},${horizon + 8} ${hx - 10 * s},${horizon + 2}" fill="${HUNTER}"/>`,
    );
  }
  parts.push(
    `<line x1="${vx + 260}" y1="${horizon + 6}" x2="${vx + 470}" y2="${h * 0.88}" stroke="${LASER}" stroke-width="2" opacity="0.55"/>`,
  );

  // The Ship mid-slide: nose swung right, trail and sparks streaming along its line of travel.
  const sx = vx + 470;
  const sy = h * 0.88;
  // Two facets with a ridge between, as the hull reads from behind in the game.
  const ship = (dx: number, opacity: number) => {
    const nose = `${sx + dx + 46},${sy - 44}`;
    const ridge = `${sx + dx + 12},${sy + 10}`;
    return `<g opacity="${opacity}">
      <polygon points="${nose} ${ridge} ${sx + dx - 42},${sy + 22}" fill="${PALE}"/>
      <polygon points="${nose} ${sx + dx + 58},${sy + 20} ${ridge}" fill="${CYAN}"/>
    </g>`;
  };
  parts.push([5, 4, 3, 2, 1].map((k) => ship(-k * 40, 0.08 * (6 - k))).join(''));
  parts.push(ship(0, 1));
  for (let i = 0; i < 26; i++) {
    const px = sx - rng.range(10, 260);
    const py = sy + rng.range(-6, 30);
    parts.push(
      `<rect x="${px}" y="${py}" width="${rng.range(3, 9)}" height="2" fill="${css(PALETTE.spark)}" opacity="${rng.range(0.4, 1)}"/>`,
    );
  }
  return parts.join('');
}

/** The title screen backdrop and logo as one SVG, scaled to cover the screen. */
export function splashSvg(): string {
  const w = 1600;
  const h = 900;
  return `<svg class="splash" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SKY}"/>
        <stop offset="0.62" stop-color="#140b2a"/>
        <stop offset="1" stop-color="${SKY}"/>
      </linearGradient>
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
    <rect width="${w}" height="${h}" fill="url(#sky)"/>
    ${scene(w, h)}
    <g filter="url(#glow)">${logo(w / 2, 70)}</g>
  </svg>`;
}
