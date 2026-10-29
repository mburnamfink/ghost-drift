import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Terrain, terrainFromRows } from './terrain';

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

describe('Rising and Sinking', () => {
  it('marks and clears exactly the cells a Block covers', () => {
    const t = new Terrain(8, 4);
    const block = { id: 7, x: 2, y: 3, w: 3, h: 2, height: 5 };
    t.raise(block);
    expect(t.isBlock(2, 3)).toBe(true);
    expect(t.isBlock(4, 4)).toBe(true);
    expect(t.isBlock(5, 4)).toBe(false);
    expect(t.blocks).toEqual([block]);
    t.lower(7);
    expect(t.isBlock(2, 3)).toBe(false);
    expect(t.blocks).toEqual([]);
  });
});
