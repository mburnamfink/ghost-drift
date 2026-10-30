/** Areas a layout keeps open or encloses, in cell units. A cell belongs to a shape if its center does. */
export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'disc'; x: number; y: number; r: number }
  /**
   * An elliptical band `width` wide whose center line has radii `rx` and `ry`. With `sweep`, only the
   * arc running `sweep` radians counterclockwise from angle `from`, with square ends.
   */
  | {
      kind: 'ring';
      x: number;
      y: number;
      rx: number;
      ry: number;
      width: number;
      from?: number;
      sweep?: number;
    }
  /** A straight road from (ax, ay) to (bx, by) with round ends, `width` wide. */
  | { kind: 'capsule'; ax: number; ay: number; bx: number; by: number; width: number };

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function contains(s: Shape, px: number, py: number): boolean {
  switch (s.kind) {
    case 'rect':
      return px >= s.x && px < s.x + s.w && py >= s.y && py < s.y + s.h;
    case 'disc':
      return Math.hypot(px - s.x, py - s.y) <= s.r;
    case 'ring': {
      if (!onArc(s, px, py)) return false;
      const rho = Math.hypot((px - s.x) / s.rx, (py - s.y) / s.ry);
      // Approximate distance from the ellipse; exact enough for road widths of a few cells.
      return Math.abs(rho - 1) * ((s.rx + s.ry) / 2) <= s.width / 2;
    }
    case 'capsule': {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const t = Math.max(
        0,
        Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / (dx * dx + dy * dy || 1)),
      );
      return Math.hypot(px - (s.ax + dx * t), py - (s.ay + dy * t)) <= s.width / 2;
    }
  }
}

/** Signed distance from the edge of a union of circles: negative inside, positive outside. */
export const unionDistance = (circles: readonly Circle[], px: number, py: number): number =>
  Math.min(...circles.map((c) => Math.hypot(px - c.x, py - c.y) - c.r));

/**
 * Where a point sits relative to a road's center line: `along` it from the road's start, and
 * `offset` to one side. Only rings and capsules are roads; other shapes return null.
 */
export function roadPosition(
  s: Shape,
  px: number,
  py: number,
): { along: number; offset: number } | null {
  switch (s.kind) {
    case 'ring': {
      if (!onArc(s, px, py)) return null;
      const mean = (s.rx + s.ry) / 2;
      const angle = Math.atan2((py - s.y) / s.ry, (px - s.x) / s.rx);
      const rho = Math.hypot((px - s.x) / s.rx, (py - s.y) / s.ry);
      return { along: (angle + Math.PI) * mean, offset: Math.abs(rho - 1) * mean };
    }
    case 'capsule': {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const length = Math.hypot(dx, dy) || 1;
      const t = ((px - s.ax) * dx + (py - s.ay) * dy) / length;
      if (t < 0 || t > length) return null;
      return { along: t, offset: Math.abs((px - s.ax) * dy - (py - s.ay) * dx) / length };
    }
    default:
      return null;
  }
}

type Ring = Extract<Shape, { kind: 'ring' }>;

function onArc(s: Ring, px: number, py: number): boolean {
  if (s.sweep === undefined) return true;
  const angle = Math.atan2((py - s.y) / s.ry, (px - s.x) / s.rx);
  const tau = Math.PI * 2;
  return (((angle - (s.from ?? 0)) % tau) + tau) % tau <= s.sweep;
}
