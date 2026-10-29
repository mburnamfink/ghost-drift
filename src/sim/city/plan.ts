import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { Block } from '../terrain';
import type { LayoutName } from './layouts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A place a Block may stand. Building and Plaza Blocks Rise and Sink between Waves; Edge Blocks stand
 * for the whole Run. The plan itself never changes.
 */
export interface Plot extends Block {
  kind: 'building' | 'plaza' | 'edge';
  /** Higher Rises earlier. */
  priority: number;
}

/** Every Plot in one Run's city, fixed at the start of the Run. */
export interface CityPlan {
  layout: LayoutName;
  plots: Plot[];
  /** Where the Ship starts, in cells. */
  spawn: Vec2;
  spawnHeading: number;
}

export interface TerrainChange {
  rise: Plot[];
  sink: Plot[];
}

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

  const edge = plan.plots.filter((p) => p.kind === 'edge' && !standing(p.id));
  return { rise: [...edge, ...rise, ...plazaRise], sink };
}
