import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { type CityPlan, densityForWave, generateCity, planChange } from './city';
import { Terrain } from './terrain';

const CELLS = CONFIG.arena.cells;

function openCellsConnected(t: Terrain): boolean {
  const start = t.index(CELLS / 2, CELLS / 2);
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const i = queue.pop()!;
    const x = i % CELLS;
    const y = Math.floor(i / CELLS);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (t.isSolid(nx, ny) || seen.has(t.index(nx, ny))) continue;
      seen.add(t.index(nx, ny));
      queue.push(t.index(nx, ny));
    }
  }
  let open = 0;
  for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS; x++) if (!t.isSolid(x, y)) open++;
  return seen.size === open;
}

/** Runs the schedule for `waves` Waves, applying every change, and returns the Terrain. */
function simulate(
  plan: CityPlan,
  waves: number,
  rng: Rng,
  onWave?: (t: Terrain, wave: number) => void,
) {
  const t = new Terrain(CELLS, CONFIG.arena.cellSize);
  for (let wave = 1; wave <= waves; wave++) {
    const change = planChange(plan, (id) => t.hasBlock(id), wave, rng);
    for (const p of change.sink) t.lower(p.id);
    for (const p of change.rise) t.raise(p);
    onWave?.(t, wave);
  }
  return t;
}

describe('generateCity', () => {
  const plan = generateCity(new Rng(1));

  it('is deterministic for a seed', () => {
    expect(generateCity(new Rng(1))).toEqual(plan);
  });

  it('centres a Plaza 35% of the Arena wide with only Plaza obstacles in it', () => {
    expect(plan.plaza.w).toBe(Math.round(CELLS * CONFIG.city.plazaFraction));
    const inPlaza = (p: { x: number; y: number }) =>
      p.x >= plan.plaza.x &&
      p.x < plan.plaza.x + plan.plaza.w &&
      p.y >= plan.plaza.y &&
      p.y < plan.plaza.y + plan.plaza.h;
    for (const p of plan.plots) expect(inPlaza(p)).toBe(p.kind === 'plaza');
    expect(plan.plots.filter((p) => p.kind === 'plaza').length).toBeGreaterThanOrEqual(
      CONFIG.city.maxPlazaObstacles,
    );
  });

  it('keeps Plaza obstacles clear of the spawn point', () => {
    const t = new Terrain(CELLS, CONFIG.arena.cellSize, plan.plots);
    const mid = CELLS / 2;
    for (let dy = -2; dy <= 1; dy++)
      for (let dx = -2; dx <= 1; dx++) expect(t.isSolid(mid + dx, mid + dy)).toBe(false);
  });

  it('never lets Plots touch, so every road stays open with all Blocks standing', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const city = generateCity(new Rng(seed));
      const t = new Terrain(CELLS, CONFIG.arena.cellSize);
      for (const p of city.plots) {
        for (let y = p.y; y < p.y + p.h; y++)
          for (let x = p.x; x < p.x + p.w; x++) expect(t.isBlock(x, y)).toBe(false);
        t.raise(p);
      }
      expect(openCellsConnected(t)).toBe(true);
    }
  });
});

describe('planChange', () => {
  it('grows density Wave by Wave and levels off at the ceiling', () => {
    const plan = generateCity(new Rng(2));
    const buildings = plan.plots.filter((p) => p.kind === 'building');
    const density: number[] = [];
    simulate(plan, 25, new Rng(9), (t) =>
      density.push(buildings.filter((p) => t.hasBlock(p.id)).length / buildings.length),
    );
    expect(density[0]).toBeCloseTo(CONFIG.city.startDensity, 1);
    expect(density[4]!).toBeGreaterThan(density[0]!);
    for (const d of density.slice(15)) expect(d).toBeCloseTo(CONFIG.city.maxDensity, 1);
    expect(densityForWave(100)).toBe(CONFIG.city.maxDensity);
  });

  it('keeps the city shifting after density levels off', () => {
    const plan = generateCity(new Rng(3));
    const t = simulate(plan, 20, new Rng(4));
    const change = planChange(plan, (id) => t.hasBlock(id), 21, new Rng(5));
    expect(change.sink.length).toBe(CONFIG.city.churnPerWave);
    expect(change.rise.length).toBeGreaterThan(0);
  });

  it('adds Plaza obstacles over time up to the cap', () => {
    const plan = generateCity(new Rng(6));
    const plazaUp = (t: Terrain) =>
      plan.plots.filter((p) => p.kind === 'plaza' && t.hasBlock(p.id)).length;
    expect(plazaUp(simulate(plan, 1, new Rng(1)))).toBe(CONFIG.city.plazaObstaclesAtStart);
    expect(plazaUp(simulate(plan, 40, new Rng(1)))).toBe(CONFIG.city.maxPlazaObstacles);
  });
});
