import { CONFIG } from '../config';
import { valueNoiseGrid } from '../core/noise';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';

export interface TerrainParams {
  cells: number;
  cellSize: number;
  spawnClearRadius: number;
  densityPeriod: number;
  detailPeriod: number;
  maxFill: number;
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
    /** Visual height of each Block; ignored by the simulation (ADR-0002). */
    readonly heights: Float32Array,
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
 * Builds an Arena whose Density varies smoothly across it. A coarse noise field sets local Density;
 * a fine noise field, thresholded by that Density, decides which cells become Blocks. Open pockets
 * unreachable from the centre are filled so every open cell is navigable.
 */
export function generateTerrain(rng: Rng, params: TerrainParams = CONFIG.arena): Terrain {
  const { cells } = params;
  const density = valueNoiseGrid(rng, cells, params.densityPeriod);
  const detail = valueNoiseGrid(rng, cells, params.detailPeriod);
  const solid = new Uint8Array(cells * cells);
  const heights = new Float32Array(cells * cells);
  const mid = cells / 2;

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const i = y * cells + x;
      if (Math.hypot(x + 0.5 - mid, y + 0.5 - mid) <= params.spawnClearRadius) continue;
      const d = density[i]!;
      const fill = params.maxFill * smoothstep(0.3, 0.8, d);
      if (detail[i]! < fill) {
        solid[i] = 1;
        heights[i] =
          params.minBlockHeight +
          (params.maxBlockHeight - params.minBlockHeight) * (0.4 * d + 0.6 * rng.next());
      }
    }
  }

  fillUnreachable(solid, cells, Math.floor(mid), Math.floor(mid));
  for (let i = 0; i < solid.length; i++) {
    if (solid[i] === 1 && heights[i] === 0) heights[i] = params.minBlockHeight;
  }
  return new Terrain(cells, params.cellSize, solid, heights);
}

function fillUnreachable(solid: Uint8Array, cells: number, sx: number, sy: number): void {
  const seen = new Uint8Array(cells * cells);
  const queue = [sy * cells + sx];
  seen[queue[0]!] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    const x = i % cells;
    const y = (i - x) / cells;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
      const n = ny * cells + nx;
      if (seen[n] || solid[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  for (let i = 0; i < solid.length; i++) if (!seen[i]) solid[i] = 1;
}

/** Builds Terrain from a square ASCII map, `#` for a Block. The first row is y = 0. */
export function terrainFromRows(rows: readonly string[], cellSize: number = CONFIG.arena.cellSize) {
  const cells = rows.length;
  const solid = new Uint8Array(cells * cells);
  const heights = new Float32Array(cells * cells);
  rows.forEach((row, y) => {
    if (row.length !== cells)
      throw new Error(`Row ${y} has ${row.length} cells, expected ${cells}`);
    for (let x = 0; x < cells; x++) {
      if (row[x] === '#') {
        solid[y * cells + x] = 1;
        heights[y * cells + x] = 1;
      }
    }
  });
  return new Terrain(cells, cellSize, solid, heights);
}
