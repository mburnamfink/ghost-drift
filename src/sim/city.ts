import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { Block } from './terrain';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A place a Block may stand. Its Block Rises and Sinks between Waves; the plan itself never changes. */
export interface Plot extends Block {
  kind: 'building' | 'plaza';
  /** Higher Rises earlier. */
  priority: number;
}

/** Every Plot in one Run's city, fixed at the start of the Run. */
export interface CityPlan {
  plaza: Rect;
  plots: Plot[];
}

export interface TerrainChange {
  rise: Plot[];
  sink: Plot[];
}

/**
 * Lays out a city by recursive subdivision (ADR-0005). A ring road runs inside the Arena wall and
 * Avenues frame the central Plaza, cutting the rest into eight districts. Each district is split by
 * Streets, then Alleys, until the pieces are Plot-sized. Roads separate every Plot from every other,
 * so open ground stays connected however many Blocks stand.
 */
export function generateCity(rng: Rng, cells: number = CONFIG.arena.cells): CityPlan {
  const c = CONFIG.city;
  const plazaSize = Math.round(cells * c.plazaFraction);
  const p0 = Math.floor((cells - plazaSize) / 2);
  const p1 = p0 + plazaSize;
  const bands: [number, number][] = [
    [c.ringRoad, p0 - c.avenue],
    [p0, p1],
    [p1 + c.avenue, cells - c.ringRoad],
  ];

  const plots: Plot[] = [];
  let nextId = 1;
  const addBuilding = (r: Rect, district: Rect) => {
    if (rng.next() < c.emptyPlotChance) return;
    // Plots on a district's edge face an Avenue, the ring road or the Plaza. Raising them first
    // lines the Avenues early and leaves the side streets to fill in over later Waves.
    const frontage =
      r.x === district.x ||
      r.y === district.y ||
      r.x + r.w === district.x + district.w ||
      r.y + r.h === district.y + district.h;
    const size = Math.min(1, (r.w * r.h) / (c.maxPlotCells * c.maxPlotCells));
    const height =
      c.minBlockHeight + (c.maxBlockHeight - c.minBlockHeight) * (0.5 * size + 0.5 * rng.next());
    plots.push({
      ...r,
      id: nextId++,
      height,
      kind: 'building',
      priority: r.w * r.h * rng.range(0.6, 1.4) * (frontage ? c.frontagePriority : 1),
    });
  };

  const subdivide = (r: Rect, depth: number, district: Rect) => {
    const road = depth === 0 ? c.street : c.alley;
    const canSplitX = r.w >= 2 * c.minPlotCells + road;
    const canSplitY = r.h >= 2 * c.minPlotCells + road;
    if ((r.w <= c.maxPlotCells && r.h <= c.maxPlotCells) || (!canSplitX && !canSplitY)) {
      addBuilding(r, district);
      return;
    }
    const splitX = canSplitX && (r.w >= r.h || !canSplitY);
    const length = splitX ? r.w : r.h;
    const at = c.minPlotCells + rng.int(length - road - 2 * c.minPlotCells + 1);
    if (splitX) {
      subdivide({ x: r.x, y: r.y, w: at, h: r.h }, depth + 1, district);
      subdivide({ x: r.x + at + road, y: r.y, w: r.w - at - road, h: r.h }, depth + 1, district);
    } else {
      subdivide({ x: r.x, y: r.y, w: r.w, h: at }, depth + 1, district);
      subdivide({ x: r.x, y: r.y + at + road, w: r.w, h: r.h - at - road }, depth + 1, district);
    }
  };

  bands.forEach(([x0, x1], i) =>
    bands.forEach(([y0, y1], j) => {
      if (i === 1 && j === 1) return;
      const district = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      subdivide(district, 0, district);
    }),
  );

  const plaza = { x: p0, y: p0, w: plazaSize, h: plazaSize };
  for (const r of plazaObstacles(rng, plaza, cells / 2)) {
    const [lo, hi] = c.plazaObstacleHeight;
    plots.push({
      ...r,
      id: nextId++,
      height: rng.range(lo, hi),
      kind: 'plaza',
      priority: rng.next(),
    });
  }
  return { plaza, plots };
}

const OBSTACLE_SHAPES: [number, number][] = [
  [2, 2],
  [3, 3],
  [1, 4],
  [4, 1],
  [2, 5],
  [5, 2],
];

/** Pillars and short walls inside the Plaza, clear of the spawn point and spaced apart. */
function plazaObstacles(rng: Rng, plaza: Rect, mid: number): Rect[] {
  const placed: Rect[] = [];
  const inset = 2;
  const spacing = 3;
  const clearRadius = CONFIG.arena.spawnClearRadius + 1;
  for (
    let attempt = 0;
    attempt < 200 && placed.length < CONFIG.city.plazaObstacleCandidates;
    attempt++
  ) {
    const [w, h] = OBSTACLE_SHAPES[rng.int(OBSTACLE_SHAPES.length)]!;
    const x = plaza.x + inset + rng.int(plaza.w - 2 * inset - w + 1);
    const y = plaza.y + inset + rng.int(plaza.h - 2 * inset - h + 1);
    const nearestX = Math.max(x, Math.min(mid, x + w));
    const nearestY = Math.max(y, Math.min(mid, y + h));
    if (Math.hypot(nearestX - mid, nearestY - mid) <= clearRadius) continue;
    const r = { x, y, w, h };
    if (placed.some((o) => rectsWithin(o, r, spacing))) continue;
    placed.push(r);
  }
  return placed;
}

const rectsWithin = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/** Fraction of building Plots that should stand during `wave`. */
export const densityForWave = (wave: number): number =>
  Math.min(
    CONFIG.city.maxDensity,
    CONFIG.city.startDensity + CONFIG.city.densityPerWave * (wave - 1),
  );

export const plazaObstaclesForWave = (wave: number): number =>
  Math.min(
    CONFIG.city.maxPlazaObstacles,
    CONFIG.city.plazaObstaclesAtStart + Math.floor((wave - 1) / CONFIG.city.plazaObstacleEvery),
  );

/**
 * Decides which Blocks Rise and Sink before `wave`, given which are standing. Density climbs to a
 * ceiling; from `churnFromWave` some standing Blocks also Sink and are replaced, so the city keeps
 * shifting even once density has levelled off.
 */
export function planChange(
  plan: CityPlan,
  standing: (id: number) => boolean,
  wave: number,
  rng: Rng,
): TerrainChange {
  const c = CONFIG.city;
  const buildings = plan.plots.filter((p) => p.kind === 'building');
  const up = buildings.filter((p) => standing(p.id));
  const sink: Plot[] = [];
  if (wave >= c.churnFromWave) {
    const pool = [...up];
    for (let i = 0; i < c.churnPerWave && pool.length > 0; i++) {
      sink.push(pool.splice(rng.int(pool.length), 1)[0]!);
    }
  }

  const target = Math.round(buildings.length * densityForWave(wave));
  const need = target - (up.length - sink.length);
  const candidates = buildings
    .filter((p) => !standing(p.id) && !sink.includes(p))
    .map((p) => ({ p, score: p.priority * rng.range(0.5, 1.5) }))
    .sort((a, b) => b.score - a.score)
    .map((s) => s.p);
  const rise = candidates.slice(0, Math.max(0, need));

  const plaza = plan.plots
    .filter((p) => p.kind === 'plaza')
    .sort((a, b) => b.priority - a.priority);
  const plazaUp = plaza.filter((p) => standing(p.id)).length;
  const plazaRise = plaza
    .filter((p) => !standing(p.id))
    .slice(0, Math.max(0, plazaObstaclesForWave(wave) - plazaUp));

  return { rise: [...rise, ...plazaRise], sink };
}
