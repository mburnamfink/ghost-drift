/**
 * The angular lettering of the title and game-over screens. Each glyph is a width and a set of
 * polylines on a grid 6 units tall, chamfered at 45°, drawn as mitred strokes so one definition
 * can be rendered solid (a thick stroke) or wireframe (that stroke hollowed out).
 */
type Glyph = { w: number; paths: [number, number][][] };

// prettier-ignore
const GLYPHS: Record<string, Glyph> = {
  A: { w: 4, paths: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]], [[0, 3], [4, 3]]] },
  B: { w: 4, paths: [[[0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]] },
  C: { w: 4, paths: [[[4, 0], [1, 0], [0, 1], [0, 5], [1, 6], [4, 6]]] },
  D: { w: 4, paths: [[[0, 0], [3, 0], [4, 1], [4, 5], [3, 6], [0, 6], [0, 0]]] },
  E: { w: 4, paths: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]] },
  F: { w: 4, paths: [[[4, 0], [0, 0], [0, 6]], [[0, 3], [3, 3]]] },
  G: { w: 4, paths: [[[4, 0], [1, 0], [0, 1], [0, 5], [1, 6], [4, 6], [4, 3], [2, 3]]] },
  H: { w: 4, paths: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]] },
  I: { w: 2, paths: [[[0, 0], [2, 0]], [[1, 0], [1, 6]], [[0, 6], [2, 6]]] },
  J: { w: 4, paths: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]] },
  K: { w: 4, paths: [[[0, 0], [0, 6]], [[4, 0], [1, 3], [4, 6]], [[0, 3], [1, 3]]] },
  L: { w: 4, paths: [[[0, 0], [0, 6], [4, 6]]] },
  M: { w: 5, paths: [[[0, 6], [0, 0], [2.5, 3], [5, 0], [5, 6]]] },
  N: { w: 4, paths: [[[0, 6], [0, 0], [4, 6], [4, 0]]] },
  O: { w: 4, paths: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]] },
  P: { w: 4, paths: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]] },
  Q: { w: 4, paths: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 4.5], [4, 6]]] },
  // The leg runs on from the bowl's corner so no stroke end pokes into the counter.
  R: { w: 4, paths: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [4, 4], [4, 6]], [[0, 3], [3, 3]]] },
  S: { w: 4, paths: [[[4, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [0, 6]]] },
  T: { w: 4, paths: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]] },
  U: { w: 4, paths: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]] },
  V: { w: 4, paths: [[[0, 0], [0, 3], [2, 6], [4, 3], [4, 0]]] },
  W: { w: 5, paths: [[[0, 0], [0, 6], [2.5, 3], [5, 6], [5, 0]]] },
  X: { w: 4, paths: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]] },
  Y: { w: 4, paths: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]] },
  Z: { w: 4, paths: [[[0, 0], [4, 0], [0, 6], [4, 6]]] },
  '.': { w: 1, paths: [[[0.5, 5.6], [0.5, 5.7]]] },
  ' ': { w: 1.5, paths: [] },
};

/** Space between letters, in grid units. */
const GAP = 1.6;
/** Sharper corners than this ratio are bevelled, so V, W and N don't grow long spikes. */
const MITER_LIMIT = 2.6;

const glyph = (ch: string): Glyph => GLYPHS[ch] ?? GLYPHS[' ']!;

/** Width of `text` in grid units. */
export const textUnits = (text: string): number =>
  [...text].reduce((sum, ch) => sum + glyph(ch).w, 0) + GAP * Math.max(0, text.length - 1);

/** SVG path data for `text` with its top-left at (x, y), at `u` pixels per grid unit. */
export function textPath(text: string, x: number, y: number, u: number): string {
  let cursor = 0;
  const parts: string[] = [];
  for (const ch of text.toUpperCase()) {
    for (const path of glyph(ch).paths) {
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
    cursor += glyph(ch).w + GAP;
  }
  return parts.join(' ');
}

/** Breaks `text` into lines of at most `maxUnits` wide, at spaces. */
export function wrapText(text: string, maxUnits: number): string[] {
  const lines: string[] = [];
  for (const word of text.toUpperCase().split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && textUnits(`${last} ${word}`) <= maxUnits) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  return lines;
}

const strokeAttrs = `fill="none" stroke-linejoin="miter" stroke-linecap="square" stroke-miterlimit="${MITER_LIMIT}"`;

export function solidStroke(d: string, weight: number, paint: string): string {
  return `<path d="${d}" stroke="${paint}" stroke-width="${weight}" ${strokeAttrs}/>`;
}

let maskCount = 0;

/**
 * A stroke `weight` wide hollowed to an outline `line` thick. The inside is cut away with a mask,
 * so whatever lies behind shows through, and overlapping strokes merge into one outline.
 */
export function hollowStroke(
  d: string,
  weight: number,
  line: number,
  color: string,
  opacity = 1,
): string {
  const id = `hollow-${maskCount++}`;
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="-10000" y="-10000" width="20000" height="20000">
      <g ${strokeAttrs}>
        <path d="${d}" stroke="white" stroke-width="${weight}"/>
        <path d="${d}" stroke="black" stroke-width="${weight - line * 2}"/>
      </g>
    </mask>
    <path d="${d}" stroke="${color}" stroke-width="${weight}" opacity="${opacity}" mask="url(#${id})" ${strokeAttrs}/>`;
}
