import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { generateTerrain, terrainFromRows } from './terrain';

describe('generateTerrain', () => {
  it('is deterministic for a seed', () => {
    const a = generateTerrain(new Rng(42));
    const b = generateTerrain(new Rng(42));
    expect(a.blocks).toEqual(b.blocks);
  });

  it('keeps the spawn area open', () => {
    const t = generateTerrain(new Rng(7));
    const mid = t.cells / 2;
    for (let dy = -2; dy <= 1; dy++) {
      for (let dx = -2; dx <= 1; dx++) expect(t.isSolid(mid + dx, mid + dy)).toBe(false);
    }
  });

  it('has both open ground and Blocks', () => {
    const t = generateTerrain(new Rng(3));
    let blocks = 0;
    for (let y = 0; y < t.cells; y++)
      for (let x = 0; x < t.cells; x++) if (t.isBlock(x, y)) blocks++;
    const fraction = blocks / (t.cells * t.cells);
    expect(fraction).toBeGreaterThan(0.05);
    expect(fraction).toBeLessThan(0.6);
  });

  it('builds multi-cell Blocks that never touch each other', () => {
    const t = generateTerrain(new Rng(5));
    const gap = CONFIG.arena.blockGap;
    for (const b of t.blocks) {
      expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(CONFIG.arena.minBlockCells);
      for (const o of t.blocks) {
        if (o === b) continue;
        const apart =
          o.x >= b.x + b.w + gap ||
          b.x >= o.x + o.w + gap ||
          o.y >= b.y + b.h + gap ||
          b.y >= o.y + o.h + gap;
        expect(apart).toBe(true);
      }
    }
  });

  it('leaves every open cell reachable from the centre', () => {
    const t = generateTerrain(new Rng(11));
    const seen = new Set<number>();
    const start = t.index(t.cells / 2, t.cells / 2);
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const i = queue.pop()!;
      const x = i % t.cells;
      const y = Math.floor(i / t.cells);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (t.isSolid(nx, ny) || seen.has(t.index(nx, ny))) continue;
        seen.add(t.index(nx, ny));
        queue.push(t.index(nx, ny));
      }
    }
    let open = 0;
    for (let y = 0; y < t.cells; y++)
      for (let x = 0; x < t.cells; x++) if (!t.isSolid(x, y)) open++;
    expect(seen.size).toBe(open);
  });
});

describe('Terrain queries', () => {
  const s = CONFIG.arena.cellSize;
  const t = terrainFromRows(['....', '.#..', '....', '....']);

  it('treats outside the Arena as solid', () => {
    expect(t.isSolid(-1, 0)).toBe(true);
    expect(t.isBlock(-1, 0)).toBe(false);
  });

  it('blocks line of sight through a Block', () => {
    expect(t.hasLineOfSight({ x: 0.5 * s, y: 1.5 * s }, { x: 3.5 * s, y: 1.5 * s })).toBe(false);
    expect(t.hasLineOfSight({ x: 0.5 * s, y: 3.5 * s }, { x: 3.5 * s, y: 3.5 * s })).toBe(true);
  });

  it('finds the nearest open point to a Block', () => {
    const p = t.nearestOpenPoint({ x: 1.5 * s, y: 1.2 * s });
    expect(t.isSolidAt(p)).toBe(false);
    expect(p).toEqual({ x: 1.5 * s, y: 0.5 * s });
  });
});
