import type { Rng } from '../../core/rng';
import type { CellRect } from '../terrain';

/** The outline a building takes within its lot. Every cut-out touches the lot's edge. */
export type Footprint = 'rect' | 'L' | 'T' | 'U' | 'cross' | 'Z' | 'stepped';

export type FootprintWeights = Partial<Record<Footprint, number>>;

/** Lots narrower than this on either side stay rectangles: anything else would leave slivers. */
const MIN_SIDE = 4;

export function pickFootprint(rng: Rng, weights: FootprintWeights, lot: CellRect): Footprint {
  if (lot.w < MIN_SIDE || lot.h < MIN_SIDE) return 'rect';
  const options = (Object.entries(weights) as [Footprint, number][]).filter(([, w]) => w > 0);
  let roll = rng.next() * options.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [shape, weight] of options) {
    roll -= weight;
    if (roll < 0) return shape;
  }
  return 'rect';
}

/**
 * Cuts `shape` out of `lot` and returns the rectangles left standing, or undefined for a plain
 * rectangle. Cut sizes keep every remaining arm at least one cell wide and the whole piece connected.
 */
export function carveFootprint(rng: Rng, lot: CellRect, shape: Footprint): CellRect[] | undefined {
  const { w, h } = lot;
  if (shape === 'rect') return undefined;
  const solid = Array.from({ length: h }, () => Array<boolean>(w).fill(true));
  const cut = (x: number, y: number, cw: number, ch: number) => {
    for (let j = y; j < y + ch; j++) for (let i = x; i < x + cw; i++) solid[j]![i] = false;
  };
  /** A cut size from 1 to `max`, at least 1. */
  const size = (max: number) => 1 + rng.int(Math.max(1, Math.floor(max)));
  const side = rng.int(4);
  const horizontal = side < 2;

  switch (shape) {
    case 'L': {
      const cw = size(w / 2);
      const ch = size(h / 2);
      cut(side % 2 ? w - cw : 0, side < 2 ? 0 : h - ch, cw, ch);
      break;
    }
    case 'T': {
      // Both corners on one side, leaving a stem at least two cells wide.
      const cw = horizontal ? size((w - 2) / 2) : size(w / 2);
      const ch = horizontal ? size(h / 2) : size((h - 2) / 2);
      if (horizontal) {
        const y = side === 0 ? 0 : h - ch;
        cut(0, y, cw, ch);
        cut(w - cw, y, cw, ch);
      } else {
        const x = side === 2 ? 0 : w - cw;
        cut(x, 0, cw, ch);
        cut(x, h - ch, cw, ch);
      }
      break;
    }
    case 'U': {
      // A notch in the middle of one side.
      if (horizontal) {
        const nw = Math.max(1, Math.min(w - 2, Math.round(w / 3)));
        const nd = size(h - 2);
        cut(Math.floor((w - nw) / 2), side === 0 ? 0 : h - nd, nw, nd);
      } else {
        const nh = Math.max(1, Math.min(h - 2, Math.round(h / 3)));
        const nd = size(w - 2);
        cut(side === 2 ? 0 : w - nd, Math.floor((h - nh) / 2), nd, nh);
      }
      break;
    }
    case 'cross':
    case 'Z': {
      const cw = size((w - 2) / 2);
      const ch = size((h - 2) / 2);
      const corners: [number, number][] =
        shape === 'cross'
          ? [
              [0, 0],
              [w - cw, 0],
              [0, h - ch],
              [w - cw, h - ch],
            ]
          : side % 2
            ? [
                [0, 0],
                [w - cw, h - ch],
              ]
            : [
                [w - cw, 0],
                [0, h - ch],
              ];
      for (const [x, y] of corners) cut(x, y, cw, ch);
      break;
    }
    case 'stepped': {
      // A staircase chamfer off one corner.
      const steps = Math.min(
        Math.min(w, h) - 1,
        2 + rng.int(Math.max(1, Math.floor(Math.min(w, h) / 2))),
      );
      const flipX = side % 2 === 1;
      const flipY = side >= 2;
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const lx = flipX ? w - 1 - i : i;
          const ly = flipY ? h - 1 - j : j;
          if (lx + ly < steps) solid[j]![i] = false;
        }
      break;
    }
  }
  return decompose(solid).map((r) => ({ ...r, x: r.x + lot.x, y: r.y + lot.y }));
}

/** Greedy row-first cover of the solid cells with as few rectangles as it finds. */
function decompose(solid: boolean[][]): CellRect[] {
  const h = solid.length;
  const w = solid[0]?.length ?? 0;
  const done = solid.map((row) => row.map((s) => !s));
  const out: CellRect[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (done[y]![x]) continue;
      let rw = 0;
      while (x + rw < w && !done[y]![x + rw]) rw++;
      let rh = 1;
      while (y + rh < h && done[y + rh]!.slice(x, x + rw).every((d) => !d)) rh++;
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) done[j]![i] = true;
      out.push({ x, y, w: rw, h: rh });
    }
  }
  return out;
}
