import type { Vec2 } from '../core/vec2';
import type { Terrain } from './terrain';

export interface CollisionResult {
  pos: Vec2;
  /** Summed push-out direction, or null if nothing was touched. */
  normal: Vec2 | null;
}

/**
 * Pushes a circle out of every solid cell it overlaps. With `ghost` set, only walls hold (the Edge
 * and the Arena's bounds), so a Burst passes through buildings but never leaves the city.
 */
export function resolveCircle(
  terrain: Terrain,
  pos: Vec2,
  radius: number,
  ghost = false,
): CollisionResult {
  let { x, y } = pos;
  let nx = 0;
  let ny = 0;
  const size = terrain.cellSize;

  // Two passes settle corners where pushing out of one cell lands in its neighbor.
  for (let pass = 0; pass < 2; pass++) {
    const minX = terrain.cellOf(x - radius);
    const maxX = terrain.cellOf(x + radius);
    const minY = terrain.cellOf(y - radius);
    const maxY = terrain.cellOf(y + radius);
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        const solid = ghost ? terrain.isWall(cx, cy) : terrain.isSolid(cx, cy);
        if (!solid) continue;
        const closestX = Math.max(cx * size, Math.min(x, (cx + 1) * size));
        const closestY = Math.max(cy * size, Math.min(y, (cy + 1) * size));
        let dx = x - closestX;
        let dy = y - closestY;
        const dist = Math.hypot(dx, dy);
        if (dist >= radius) continue;
        if (dist < 1e-6) {
          // Center is inside the cell: push out along the shortest axis.
          const left = x - cx * size;
          const right = (cx + 1) * size - x;
          const down = y - cy * size;
          const up = (cy + 1) * size - y;
          const m = Math.min(left, right, down, up);
          dx = m === left ? -1 : m === right ? 1 : 0;
          dy = m === down ? -1 : m === up ? 1 : 0;
          const push = m + radius;
          x += dx * push;
          y += dy * push;
        } else {
          dx /= dist;
          dy /= dist;
          x += dx * (radius - dist);
          y += dy * (radius - dist);
        }
        nx += dx;
        ny += dy;
      }
    }
  }

  const n = Math.hypot(nx, ny);
  return { pos: { x, y }, normal: n > 0 ? { x: nx / n, y: ny / n } : null };
}

/** Removes the part of `vel` that drives into a surface with unit normal `normal`. */
export function slideAlong(vel: Vec2, normal: Vec2): Vec2 {
  const into = vel.x * normal.x + vel.y * normal.y;
  return into < 0 ? { x: vel.x - normal.x * into, y: vel.y - normal.y * into } : vel;
}
