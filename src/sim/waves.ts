import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';
import type { Terrain } from './terrain';

export const waveSize = (wave: number): number =>
  Math.min(CONFIG.waves.maxCount, CONFIG.waves.firstCount + CONFIG.waves.countPerWave * (wave - 1));

export const hunterSpeed = (wave: number): number =>
  Math.min(
    CONFIG.hunter.maxSpeed,
    CONFIG.hunter.baseSpeed + CONFIG.hunter.speedPerWave * (wave - 1),
  );

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
