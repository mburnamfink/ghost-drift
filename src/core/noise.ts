import type { Rng } from './rng';

/** Smooth value noise over a `size`×`size` grid, sampled with lattice spacing `period`. Output in [0, 1]. */
export function valueNoiseGrid(rng: Rng, size: number, period: number): Float32Array {
  const lattice = Math.ceil(size / period) + 2;
  const knots = new Float32Array(lattice * lattice);
  for (let i = 0; i < knots.length; i++) knots[i] = rng.next();
  const knot = (x: number, y: number) => knots[y * lattice + x]!;
  const smooth = (t: number) => t * t * (3 - 2 * t);

  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / period;
      const fy = y / period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = smooth(fx - x0);
      const ty = smooth(fy - y0);
      const top = knot(x0, y0) + (knot(x0 + 1, y0) - knot(x0, y0)) * tx;
      const bottom = knot(x0, y0 + 1) + (knot(x0 + 1, y0 + 1) - knot(x0, y0 + 1)) * tx;
      out[y * size + x] = top + (bottom - top) * ty;
    }
  }
  return out;
}
