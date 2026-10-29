import { CONFIG } from '../config';
import type { Vec2 } from '../core/vec2';

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A solid structure covering whole cells. Position and size, in cells, are its bounding rectangle;
 * a compound Block (an L, a T…) also lists the non-overlapping rectangles it is made of.
 */
export interface Block extends CellRect {
  /** Stable identity, so presentation can follow a Block as it Rises and Sinks. */
  id: number;
  parts?: CellRect[];
  /** Impassable even to a Burst: the Edge. */
  wall?: boolean;
  /** Visual height in world units; ignored by the simulation (ADR-0002). */
  height: number;
}

/** The rectangles a Block covers: its parts if compound, else itself. */
export const partsOf = (b: Block): readonly CellRect[] => b.parts ?? [b];

/**
 * The Arena floor plan: a square grid of open cells and Blocks (ADR-0003). Blocks Rise and Sink
 * between Waves (ADR-0005). World coordinates run from 0 to `worldSize` on both axes; anything
 * outside is the Arena wall.
 */
export class Terrain {
  readonly worldSize: number;
  private readonly solid: Uint8Array;
  private readonly standing = new Map<number, Block>();
  private readonly walls: Uint8Array;
  /** Bumped whenever a Block Rises or Sinks, so views can tell when to redraw. */
  version = 0;

  constructor(
    readonly cells: number,
    readonly cellSize: number,
    blocks: readonly Block[] = [],
  ) {
    this.worldSize = cells * cellSize;
    this.solid = new Uint8Array(cells * cells);
    this.walls = new Uint8Array(cells * cells);
    for (const b of blocks) this.raise(b);
  }

  get blocks(): Block[] {
    return [...this.standing.values()];
  }

  hasBlock(id: number): boolean {
    return this.standing.has(id);
  }

  /** Blocks never overlap, so cells can be marked and cleared per Block without reference counts. */
  raise(b: Block): void {
    if (this.standing.has(b.id)) return;
    this.standing.set(b.id, b);
    this.fill(b, 1);
  }

  lower(id: number): void {
    const b = this.standing.get(id);
    if (!b) return;
    this.standing.delete(id);
    this.fill(b, 0);
  }

  private fill(b: Block, value: 0 | 1): void {
    this.version++;
    for (const r of partsOf(b)) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++)
          if (this.inBounds(x, y)) {
            this.solid[this.index(x, y)] = value;
            if (b.wall) this.walls[this.index(x, y)] = value;
          }
      }
    }
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.cells && cy < this.cells;
  }

  index(cx: number, cy: number): number {
    return cy * this.cells + cx;
  }

  /** Out-of-bounds cells count as solid: they are the Arena wall. */
  isSolid(cx: number, cy: number): boolean {
    return !this.inBounds(cx, cy) || this.solid[this.index(cx, cy)] === 1;
  }

  /** Cells nothing passes, not even a Burst: the Edge, and everything outside the Arena. */
  isWall(cx: number, cy: number): boolean {
    return !this.inBounds(cx, cy) || this.walls[this.index(cx, cy)] === 1;
  }

  isBlock(cx: number, cy: number): boolean {
    return this.inBounds(cx, cy) && this.solid[this.index(cx, cy)] === 1;
  }

  cellOf(world: number): number {
    return Math.floor(world / this.cellSize);
  }

  cellCenter(cell: number): number {
    return (cell + 0.5) * this.cellSize;
  }

  isSolidAt(p: Vec2): boolean {
    return this.isSolid(this.cellOf(p.x), this.cellOf(p.y));
  }

  /** True if a straight segment from `a` to `b` crosses no Blocks. */
  hasLineOfSight(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.ceil(Math.hypot(dx, dy) / (this.cellSize * 0.25));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isSolidAt({ x: a.x + dx * t, y: a.y + dy * t })) return false;
    }
    return true;
  }

  /** Distance along unit vector `dir` from `from` to the first solid cell, or `maxDistance` if none. */
  castRay(from: Vec2, dir: Vec2, maxDistance: number): number {
    const step = this.cellSize * 0.25;
    for (let d = step; d < maxDistance; d += step) {
      if (this.isSolidAt({ x: from.x + dir.x * d, y: from.y + dir.y * d })) return d - step;
    }
    return maxDistance;
  }

  /** True if no Block stands within `radiusCells` cells of `p`. The Arena wall does not count. */
  isOpenSky(p: Vec2, radiusCells: number): boolean {
    const cx = this.cellOf(p.x);
    const cy = this.cellOf(p.y);
    for (let y = cy - radiusCells; y <= cy + radiusCells; y++) {
      for (let x = cx - radiusCells; x <= cx + radiusCells; x++)
        if (this.isBlock(x, y)) return false;
    }
    return true;
  }

  /** Length in cells of the longest open run from `p` along the four axes, capped at `limit`. */
  sightline(p: Vec2, limit: number): number {
    const cx = this.cellOf(p.x);
    const cy = this.cellOf(p.y);
    let best = 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      let n = 0;
      while (n < limit && !this.isSolid(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
      best = Math.max(best, n);
    }
    return best;
  }

  /** Number of Block cells within `radiusCells` of `p`; a measure of cover. */
  blocksNear(p: Vec2, radiusCells: number): number {
    const cx = this.cellOf(p.x);
    const cy = this.cellOf(p.y);
    let n = 0;
    for (let y = cy - radiusCells; y <= cy + radiusCells; y++) {
      for (let x = cx - radiusCells; x <= cx + radiusCells; x++) if (this.isBlock(x, y)) n++;
    }
    return n;
  }

  /** Centre of the open cell nearest to `p`, searching outward ring by ring. */
  nearestOpenPoint(p: Vec2): Vec2 {
    const cx = Math.min(this.cells - 1, Math.max(0, this.cellOf(p.x)));
    const cy = Math.min(this.cells - 1, Math.max(0, this.cellOf(p.y)));
    let best: Vec2 | null = null;
    let bestDist = Infinity;
    for (let r = 0; r < this.cells; r++) {
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          const onRing = Math.max(Math.abs(x - cx), Math.abs(y - cy)) === r;
          if (!onRing || this.isSolid(x, y)) continue;
          const c = { x: this.cellCenter(x), y: this.cellCenter(y) };
          const d = Math.hypot(c.x - p.x, c.y - p.y);
          if (d < bestDist) {
            best = c;
            bestDist = d;
          }
        }
      }
      if (best) return best;
    }
    throw new Error('Terrain has no open cells');
  }

  get center(): Vec2 {
    return { x: this.worldSize / 2, y: this.worldSize / 2 };
  }
}

/** Builds Terrain from a square ASCII map, `#` for a one-cell Block. The first row is y = 0. */
export function terrainFromRows(rows: readonly string[], cellSize: number = CONFIG.arena.cellSize) {
  const cells = rows.length;
  const blocks: Block[] = [];
  rows.forEach((row, y) => {
    if (row.length !== cells)
      throw new Error(`Row ${y} has ${row.length} cells, expected ${cells}`);
    for (let x = 0; x < cells; x++) {
      if (row[x] === '#') blocks.push({ id: blocks.length + 1, x, y, w: 1, h: 1, height: 1 });
    }
  });
  return new Terrain(cells, cellSize, blocks);
}
