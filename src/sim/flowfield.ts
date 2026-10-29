import type { Vec2 } from '../core/vec2';
import type { Terrain } from './terrain';

const UNREACHABLE = -1;

/**
 * Breadth-first distance map from one target cell over open terrain (ADR-0003). Any number of
 * Hunters can descend it to reach the target without their own path queries.
 */
export class FlowField {
  private readonly dist: Int32Array;
  private queue: Int32Array;

  constructor(private readonly terrain: Terrain) {
    this.dist = new Int32Array(terrain.cells * terrain.cells).fill(UNREACHABLE);
    this.queue = new Int32Array(terrain.cells * terrain.cells);
  }

  build(target: Vec2): void {
    const t = this.terrain;
    const open = t.isSolidAt(target) ? t.nearestOpenPoint(target) : target;
    this.dist.fill(UNREACHABLE);
    const start = t.index(t.cellOf(open.x), t.cellOf(open.y));
    this.dist[start] = 0;
    this.queue[0] = start;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const i = this.queue[head]!;
      const x = i % t.cells;
      const y = (i - x) / t.cells;
      const d = this.dist[i]! + 1;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (t.isSolid(nx, ny)) continue;
        const n = t.index(nx, ny);
        if (this.dist[n] !== UNREACHABLE) continue;
        this.dist[n] = d;
        this.queue[tail++] = n;
      }
    }
  }

  distanceAt(p: Vec2): number {
    const t = this.terrain;
    const cx = t.cellOf(p.x);
    const cy = t.cellOf(p.y);
    return t.isSolid(cx, cy) ? UNREACHABLE : this.dist[t.index(cx, cy)]!;
  }

  /**
   * Unit vector from `p` toward the centre of the best neighbouring cell, or null if `p` is in the
   * target cell or cannot reach it. Diagonal moves are allowed only when both adjacent sides are
   * open, so units never cut a Block's corner.
   */
  directionFrom(p: Vec2): Vec2 | null {
    const t = this.terrain;
    const cx = t.cellOf(p.x);
    const cy = t.cellOf(p.y);
    const here = this.distanceAt(p);
    if (here <= 0) return null;

    let best = here;
    let bx = 0;
    let by = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || t.isSolid(cx + dx, cy + dy)) continue;
        if (dx !== 0 && dy !== 0 && (t.isSolid(cx + dx, cy) || t.isSolid(cx, cy + dy))) continue;
        const d = this.dist[t.index(cx + dx, cy + dy)]!;
        if (d !== UNREACHABLE && d < best) {
          best = d;
          bx = dx;
          by = dy;
        }
      }
    }
    if (best === here) return null;
    const tx = t.cellCenter(cx + bx) - p.x;
    const ty = t.cellCenter(cy + by) - p.y;
    const len = Math.hypot(tx, ty);
    return len > 1e-6 ? { x: tx / len, y: ty / len } : null;
  }
}
