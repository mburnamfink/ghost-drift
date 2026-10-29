import { describe, expect, it } from 'vitest';
import { resolveCircle, slideAlong } from './collision';
import { terrainFromRows } from './terrain';

const t = terrainFromRows(['....', '.#..', '....', '....'], 4);

describe('resolveCircle', () => {
  it('leaves a circle in open space untouched', () => {
    const r = resolveCircle(t, { x: 14, y: 14 }, 1);
    expect(r.normal).toBeNull();
    expect(r.pos).toEqual({ x: 14, y: 14 });
  });

  it('pushes a circle out of a Block face', () => {
    const r = resolveCircle(t, { x: 3.5, y: 6 }, 1);
    expect(r.pos.x).toBeCloseTo(3);
    expect(r.normal).toEqual({ x: -1, y: 0 });
  });

  it('pushes a center embedded in a Block to the nearest face', () => {
    const r = resolveCircle(t, { x: 4.5, y: 6 }, 1);
    expect(r.pos.x).toBeCloseTo(3);
  });

  it('holds the Arena wall', () => {
    const r = resolveCircle(t, { x: 0.5, y: 10 }, 1);
    expect(r.pos.x).toBeCloseTo(1);
  });

  it('ignores Blocks but not the wall when ghosting', () => {
    expect(resolveCircle(t, { x: 4.5, y: 6 }, 1, true).normal).toBeNull();
    expect(resolveCircle(t, { x: 0.5, y: 10 }, 1, true).pos.x).toBeCloseTo(1);
  });
});

describe('slideAlong', () => {
  it('removes only the component into the surface', () => {
    expect(slideAlong({ x: -3, y: 2 }, { x: 1, y: 0 })).toEqual({ x: 0, y: 2 });
    expect(slideAlong({ x: 3, y: 2 }, { x: 1, y: 0 })).toEqual({ x: 3, y: 2 });
  });
});
