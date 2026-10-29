import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import { type Footprint, carveFootprint } from './footprints';

const SHAPES: Footprint[] = ['L', 'T', 'U', 'cross', 'Z', 'stepped'];

describe('carveFootprint', () => {
  it.each(SHAPES)('%s: stays in its lot, leaves no overlaps, and stays in one piece', (shape) => {
    for (let seed = 0; seed < 60; seed++) {
      const lot = { x: 10, y: 20, w: 4 + (seed % 6), h: 4 + ((seed >> 1) % 6) };
      const parts = carveFootprint(new Rng(seed), lot, shape)!;
      const cells = new Set<string>();
      for (const r of parts) {
        expect(r.x).toBeGreaterThanOrEqual(lot.x);
        expect(r.y).toBeGreaterThanOrEqual(lot.y);
        expect(r.x + r.w).toBeLessThanOrEqual(lot.x + lot.w);
        expect(r.y + r.h).toBeLessThanOrEqual(lot.y + lot.h);
        for (let y = r.y; y < r.y + r.h; y++)
          for (let x = r.x; x < r.x + r.w; x++) {
            expect(cells.has(`${x},${y}`)).toBe(false);
            cells.add(`${x},${y}`);
          }
      }
      expect(cells.size).toBeLessThan(lot.w * lot.h);

      const [first] = cells;
      const seen = new Set([first!]);
      const queue = [first!];
      while (queue.length) {
        const [x, y] = queue.pop()!.split(',').map(Number) as [number, number];
        for (const next of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
          if (cells.has(next) && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(seen.size).toBe(cells.size);
    }
  });

  it('leaves a plain rectangle as one piece', () => {
    expect(carveFootprint(new Rng(1), { x: 0, y: 0, w: 6, h: 6 }, 'rect')).toBeUndefined();
  });
});
