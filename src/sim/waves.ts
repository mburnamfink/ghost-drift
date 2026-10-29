import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';
import type { Terrain } from './terrain';

export interface WaveMix {
  tanks: number;
  berserkers: number;
  snipers: number;
  artillery: number;
}

/** Count for a special type: one when it first appears, then one more every `every` Waves, capped. */
const ramp = (wave: number, from: number, every: number, max: number) =>
  wave < from ? 0 : Math.min(max, 1 + Math.floor((wave - from) / every));

/** How many of each Hunter type a Wave sends. From Wave 4, fewer Tanks and more special types. */
export function waveMix(wave: number): WaveMix {
  const c = CONFIG.waves;
  const tanks = Math.min(c.maxCount, c.firstCount + c.countPerWave * (wave - 1));
  return {
    tanks: wave >= c.tankReductionFromWave ? Math.round(tanks * (1 - c.tankReduction)) : tanks,
    berserkers: ramp(wave, c.berserkerFromWave, 2, c.maxBerserkers),
    snipers: ramp(wave, c.sniperFromWave, 1.5, c.maxSnipers),
    artillery: ramp(wave, c.artilleryFromWave, 2, c.maxArtillery),
  };
}

export const waveTotal = (mix: WaveMix): number =>
  mix.tanks + mix.berserkers + mix.snipers + mix.artillery;

export const tankSpeed = (wave: number): number =>
  Math.min(CONFIG.tank.maxSpeed, CONFIG.tank.baseSpeed + CONFIG.tank.speedPerWave * (wave - 1));

/**
 * Picks `count` distinct open cell centres at least `minSpawnDistance` from the Ship. If the Arena
 * cannot supply enough, the farthest open cells are used instead.
 */
export function spawnPoints(terrain: Terrain, shipPos: Vec2, count: number, rng: Rng): Vec2[] {
  const candidates: { p: Vec2; d: number }[] = [];
  for (let y = 0; y < terrain.cells; y++) {
    for (let x = 0; x < terrain.cells; x++) {
      if (terrain.isSolid(x, y)) continue;
      const p = { x: terrain.cellCenter(x), y: terrain.cellCenter(y) };
      candidates.push({ p, d: Math.hypot(p.x - shipPos.x, p.y - shipPos.y) });
    }
  }
  let pool = candidates.filter((c) => c.d >= CONFIG.waves.minSpawnDistance);
  if (pool.length < count) pool = candidates.sort((a, b) => b.d - a.d).slice(0, count);

  const picked: Vec2[] = [];
  while (picked.length < count && pool.length > 0) {
    const i = rng.int(pool.length);
    picked.push(pool[i]!.p);
    pool[i] = pool[pool.length - 1]!;
    pool.pop();
  }
  return picked;
}

/** Splits `tanks` into packs of `tank.packSize`; a remainder too small for a pack joins the last. */
export function packSizes(tanks: number, rng: Rng): number[] {
  const [min, max] = CONFIG.tank.packSize;
  const sizes: number[] = [];
  let left = tanks;
  while (left > 0) {
    const size = Math.min(left, min + rng.int(max - min + 1));
    sizes.push(size);
    left -= size;
  }
  if (sizes.length > 1 && sizes[sizes.length - 1]! < min) {
    const last = sizes.pop()!;
    sizes[sizes.length - 1]! += last;
  }
  return sizes;
}

/** `count` distinct open cell centres near `centre`, for a pack spawning together. */
export function packPositions(terrain: Terrain, centre: Vec2, count: number, rng: Rng): Vec2[] {
  const spread = CONFIG.tank.packSpawnSpread;
  const cx = terrain.cellOf(centre.x);
  const cy = terrain.cellOf(centre.y);
  const cells: Vec2[] = [];
  for (let y = cy - spread; y <= cy + spread; y++) {
    for (let x = cx - spread; x <= cx + spread; x++) {
      if (!terrain.isSolid(x, y))
        cells.push({ x: terrain.cellCenter(x), y: terrain.cellCenter(y) });
    }
  }
  const picked: Vec2[] = [];
  while (picked.length < count && cells.length > 0) {
    picked.push(cells.splice(rng.int(cells.length), 1)[0]!);
  }
  while (picked.length < count) picked.push({ ...centre });
  return picked;
}
