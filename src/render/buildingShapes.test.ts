import { describe, expect, it } from 'vitest';
import { buildingGeometry } from './buildingShapes';

describe('buildingGeometry', () => {
  it('never draws outside the Block it stands for, whatever the style', () => {
    for (let seed = 0; seed < 200; seed++) {
      const [w, h, d] = [8 + (seed % 5) * 6, 4 + (seed % 7) * 3, 4 + (seed % 3) * 10];
      const geometry = buildingGeometry(w, h, d, seed, true);
      geometry.computeBoundingBox();
      const b = geometry.boundingBox!;
      expect(b.min.x).toBeGreaterThanOrEqual(-w / 2 - 1e-6);
      expect(b.max.x).toBeLessThanOrEqual(w / 2 + 1e-6);
      expect(b.min.z).toBeGreaterThanOrEqual(-d / 2 - 1e-6);
      expect(b.max.z).toBeLessThanOrEqual(d / 2 + 1e-6);
      expect(b.min.y).toBeGreaterThanOrEqual(0);
      expect(b.max.y).toBeCloseTo(h, 6);
    }
  });

  it('draws a plain box when variety is off', () => {
    const geometry = buildingGeometry(10, 6, 12, 3, false);
    // Four sides and a top, two triangles each.
    expect(geometry.getAttribute('position').count).toBe(5 * 2 * 3);
  });
});
