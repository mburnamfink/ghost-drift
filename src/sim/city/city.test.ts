import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { Rng } from '../../core/rng';
import { Terrain, partsOf } from '../terrain';
import { type CityPlan, LAYOUT_NAMES, densityForWave, generateCity, planChange } from '.';

const CELLS = CONFIG.arena.cells;

/** True if every open cell can be reached from `from` (in cells). */
function openCellsConnected(t: Terrain, from: { x: number; y: number }): boolean {
  const start = t.index(Math.floor(from.x), Math.floor(from.y));
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

describe.each(LAYOUT_NAMES)('generateCity: %s', (layout) => {
  const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
  const plans = seeds.map((s) => generateCity(new Rng(s), layout));

  it('is deterministic for a seed', () => {
    expect(generateCity(new Rng(1), layout)).toEqual(plans[0]);
  });

  it('never overlaps Plots, and leaves every open cell reachable with all of them standing', () => {
    for (const plan of plans) {
      const t = new Terrain(CELLS, CONFIG.arena.cellSize);
      for (const p of plan.plots) {
        for (const r of partsOf(p))
          for (let y = r.y; y < r.y + r.h; y++)
            for (let x = r.x; x < r.x + r.w; x++) expect(t.isBlock(x, y)).toBe(false);
        t.raise(p);
      }
      expect(openCellsConnected(t, plan.spawn)).toBe(true);
    }
  });

  it('keeps the spawn clear and leaves plenty of open ground', () => {
    for (const plan of plans) {
      const t = new Terrain(CELLS, CONFIG.arena.cellSize, plan.plots);
      const sx = Math.floor(plan.spawn.x);
      const sy = Math.floor(plan.spawn.y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) expect(t.isSolid(sx + dx, sy + dy)).toBe(false);
      let open = 0;
      for (let y = 0; y < CELLS; y++) for (let x = 0; x < CELLS; x++) if (!t.isSolid(x, y)) open++;
      expect(open / (CELLS * CELLS)).toBeGreaterThan(0.2);
    }
  });

  it('surrounds the city with an Edge and fills it with buildings and Plaza obstacles', () => {
    for (const plan of plans) {
      const count = (kind: string) => plan.plots.filter((p) => p.kind === kind).length;
      expect(count('edge')).toBeGreaterThan(20);
      expect(count('building')).toBeGreaterThan(12);
      expect(count('plaza')).toBeGreaterThanOrEqual(CONFIG.city.plazaObstaclesAtStart);
    }
  });
});

describe.each(LAYOUT_NAMES)('Arch: %s', (layout) => {
  const plans = [1, 2, 3, 4, 5, 6].map((s) => generateCity(new Rng(s), layout));

  it('joins two rectangular towers over a road left clear with every Plot standing', () => {
    expect(plans.filter((p) => p.arch).length).toBeGreaterThanOrEqual(5);
    for (const plan of plans) {
      const arch = plan.arch;
      if (!arch) continue;
      const towers = plan.plots.filter((p) => p.id === arch.a || p.id === arch.b);
      expect(towers).toHaveLength(2);
      for (const t of towers) {
        expect(t.kind).toBe('building');
        expect(t.parts).toBeUndefined();
      }
      const t = new Terrain(CELLS, CONFIG.arena.cellSize, plan.plots);
      const { span } = arch;
      for (let y = span.y; y < span.y + span.h; y++)
        for (let x = span.x; x < span.x + span.w; x++) expect(t.isSolid(x, y)).toBe(false);
    }
  });

  it('keeps its towers standing from the first Wave on', () => {
    const plan = plans.find((p) => p.arch)!;
    const { a, b } = plan.arch!;
    simulate(plan, 25, new Rng(4), (t) => {
      expect(t.hasBlock(a)).toBe(true);
      expect(t.hasBlock(b)).toBe(true);
    });
  });
});

describe('Lined roads', () => {
  it('wall the Circuit loop and Hub spokes with buildings that never Sink', () => {
    for (const layout of ['circuit', 'hub'] as const) {
      const plan = generateCity(new Rng(5), layout);
      const lining = plan.plots.filter((p) => p.permanent && p.kind === 'building');
      expect(lining.length).toBeGreaterThan(10);
      simulate(plan, 25, new Rng(6), (t) => {
        for (const p of lining) expect(t.hasBlock(p.id)).toBe(true);
      });
    }
  });

  it('leave Grid and Districts to the normal schedule, apart from Arch towers', () => {
    for (const layout of ['grid', 'districts'] as const) {
      const plan = generateCity(new Rng(5), layout);
      const permanent = plan.plots.filter((p) => p.permanent).map((p) => p.id);
      expect(permanent.sort()).toEqual(plan.arch ? [plan.arch.a, plan.arch.b].sort() : []);
    }
  });
});

describe('Building footprints', () => {
  const shaped = (layout: (typeof LAYOUT_NAMES)[number]) => {
    const buildings = [1, 2, 3].flatMap((s) =>
      generateCity(new Rng(s), layout).plots.filter((p) => p.kind === 'building' && !p.permanent),
    );
    return buildings.filter((p) => p.parts).length / buildings.length;
  };

  it('shapes some buildings in every Layout, and Districts more than Grid', () => {
    // Towers stand on footprints too narrow to shape.
    for (const layout of LAYOUT_NAMES.filter((l) => l !== 'towers')) {
      expect(shaped(layout)).toBeGreaterThan(0.15);
    }
    expect(shaped('districts')).toBeGreaterThan(shaped('grid'));
  });
});

describe('generateCity', () => {
  it('picks every layout for some seed', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, s) => generateCity(new Rng(s)).layout));
    expect([...seen].sort()).toEqual([...LAYOUT_NAMES].sort());
  });
});

describe('planChange', () => {
  it('grows density Wave by Wave and levels off at the ceiling', () => {
    const plan = generateCity(new Rng(2), 'grid');
    const buildings = plan.plots.filter((p) => p.kind === 'building' && !p.permanent);
    const density: number[] = [];
    simulate(plan, 25, new Rng(9), (t) =>
      density.push(buildings.filter((p) => t.hasBlock(p.id)).length / buildings.length),
    );
    expect(density[0]).toBeCloseTo(CONFIG.city.startDensity, 1);
    expect(density[4]!).toBeGreaterThan(density[0]!);
    for (const d of density.slice(15)) expect(d).toBeCloseTo(CONFIG.city.maxDensity, 1);
    expect(densityForWave(100)).toBe(CONFIG.city.maxDensity);
  });

  it('raises the whole Edge at the start and never sinks it', () => {
    const plan = generateCity(new Rng(7), 'hub');
    const edge = plan.plots.filter((p) => p.kind === 'edge');
    simulate(plan, 20, new Rng(3), (t) => {
      for (const p of edge) expect(t.hasBlock(p.id)).toBe(true);
    });
  });

  it('raises Plots near the Edge sooner than those in the middle', () => {
    const plan = generateCity(new Rng(8), 'grid');
    const t = simulate(plan, 1, new Rng(2));
    const mid = CELLS / 2;
    const standingShare = (near: boolean) => {
      const group = plan.plots.filter((p) => {
        if (p.kind !== 'building') return false;
        const d = Math.hypot(p.x + p.w / 2 - mid, p.y + p.h / 2 - mid);
        return near ? d > CELLS * 0.32 : d < CELLS * 0.22;
      });
      return group.filter((p) => t.hasBlock(p.id)).length / group.length;
    };
    expect(standingShare(true)).toBeGreaterThan(standingShare(false));
  });

  it('keeps the city shifting after density levels off', () => {
    const plan = generateCity(new Rng(3), 'districts');
    const t = simulate(plan, 20, new Rng(4));
    const change = planChange(plan, (id) => t.hasBlock(id), 21, new Rng(5));
    expect(change.sink.length).toBe(CONFIG.city.churnPerWave);
    expect(change.rise.length).toBeGreaterThan(0);
  });

  it('adds Plaza obstacles over time up to the cap', () => {
    const plan = generateCity(new Rng(6), 'grid');
    const plazaUp = (t: Terrain) =>
      plan.plots.filter((p) => p.kind === 'plaza' && t.hasBlock(p.id)).length;
    expect(plazaUp(simulate(plan, 1, new Rng(1)))).toBe(CONFIG.city.plazaObstaclesAtStart);
    expect(plazaUp(simulate(plan, 40, new Rng(1)))).toBe(CONFIG.city.maxPlazaObstacles);
  });
});
