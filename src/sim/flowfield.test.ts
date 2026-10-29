import { describe, expect, it } from 'vitest';
import { FlowField } from './flowfield';
import { terrainFromRows } from './terrain';

// A wall across the middle with a gap on the right; the target is below the wall.
const t = terrainFromRows(['......', '......', '#####.', '......', '......', '......']);
const at = (cx: number, cy: number) => ({ x: t.cellCenter(cx), y: t.cellCenter(cy) });

describe('FlowField', () => {
  const field = new FlowField(t);
  field.build(at(0, 4));

  it('measures distance around Blocks, not through them', () => {
    expect(field.distanceAt(at(0, 4))).toBe(0);
    expect(field.distanceAt(at(0, 0))).toBe(5 + 3 + 5 + 1); // right to the gap, down through it, left, down
  });

  it('routes toward the gap rather than straight at the target', () => {
    const dir = field.directionFrom(at(0, 1))!;
    expect(dir.x).toBeGreaterThan(0.9);
  });

  it('returns null at the target', () => {
    expect(field.directionFrom(at(0, 4))).toBeNull();
  });

  it('never cuts a Block corner diagonally', () => {
    const dir = field.directionFrom(at(4, 1))!;
    expect(dir).toEqual({ x: 1, y: 0 });
  });
});
