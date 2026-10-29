import { CONFIG } from '../config';
import { valueNoiseGrid } from '../core/noise';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';

/** A solid rectangular structure covering whole cells. Position and size are in cells. */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Visual height in world units; ignored by the simulation (ADR-0002). */
  height: number;
}

export interface TerrainParams {
  cells: number;
  cellSize: number;
  spawnClearRadius: number;
  densityPeriod: number;
  placementAttempts: number;
  placementChance: number;
  minBlockCells: number;
  maxBlockCells: number;
  blockGap: number;
  minBlockHeight: number;
  maxBlockHeight: number;
}

/**
 * The Arena floor plan: a square grid of open cells and Blocks (ADR-0003).
 * World coordinates run from 0 to `worldSize` on both axes; anything outside is the Arena wall.
 */
export class Terrain {
  readonly worldSize: number;

  constructor(
    readonly cells: number,
    readonly cellSize: number,
    private readonly solid: Uint8Array,
    readonly blocks: readonly Block[],
  ) {
    this.worldSize = cells * cellSize;
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

const smoothstep = (lo: number, hi: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/**
 * Builds an Arena of rectangular Blocks whose Density varies smoothly across it. Candidate Blocks
 * are scattered at random and kept with a probability set by a coarse noise field, so some regions
 * are open and others are mazes. Blocks never touch: a `blockGap` of open cells always separates
 * them, which keeps every open cell reachable.
 */
export function generateTerrain(rng: Rng, params: TerrainParams = CONFIG.arena): Terrain {
  const { cells, blockGap, minBlockCells, maxBlockCells } = params;
  const density = valueNoiseGrid(rng, cells, params.densityPeriod);
  const solid = new Uint8Array(cells * cells);
  const blocks: Block[] = [];
  const mid = cells / 2;

  const areaFree = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y < Math.min(cells, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(cells, x1); x++)
        if (solid[y * cells + x]) return false;
    }
    return true;
  };

  for (let attempt = 0; attempt < params.placementAttempts; attempt++) {
    const w = minBlockCells + rng.int(maxBlockCells - minBlockCells + 1);
    const h = minBlockCells + rng.int(maxBlockCells - minBlockCells + 1);
    const x = rng.int(cells - w + 1);
    const y = rng.int(cells - h + 1);
    const d = density[Math.floor(y + h / 2) * cells + Math.floor(x + w / 2)]!;
    const keep = rng.next() < params.placementChance * smoothstep(0.3, 0.75, d);
    const height =
      params.minBlockHeight +
      (params.maxBlockHeight - params.minBlockHeight) * (0.4 * d + 0.6 * rng.next());
    if (!keep) continue;
    const nearestX = Math.max(x, Math.min(mid, x + w));
    const nearestY = Math.max(y, Math.min(mid, y + h));
    if (Math.hypot(nearestX - mid, nearestY - mid) <= params.spawnClearRadius) continue;
    if (!areaFree(x - blockGap, y - blockGap, x + w + blockGap, y + h + blockGap)) continue;
    for (let cy = y; cy < y + h; cy++)
      for (let cx = x; cx < x + w; cx++) solid[cy * cells + cx] = 1;
    blocks.push({ x, y, w, h, height });
  }
  return new Terrain(cells, params.cellSize, solid, blocks);
}

/** Builds Terrain from a square ASCII map, `#` for a one-cell Block. The first row is y = 0. */
export function terrainFromRows(rows: readonly string[], cellSize: number = CONFIG.arena.cellSize) {
  const cells = rows.length;
  const solid = new Uint8Array(cells * cells);
  const blocks: Block[] = [];
  rows.forEach((row, y) => {
    if (row.length !== cells)
      throw new Error(`Row ${y} has ${row.length} cells, expected ${cells}`);
    for (let x = 0; x < cells; x++) {
      if (row[x] !== '#') continue;
      solid[y * cells + x] = 1;
      blocks.push({ x, y, w: 1, h: 1, height: 1 });
    }
  });
  return new Terrain(cells, cellSize, solid, blocks);
}
