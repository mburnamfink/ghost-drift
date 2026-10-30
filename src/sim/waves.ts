import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec2';
import type { Terrain } from './terrain';

export interface WaveMix {
  tanks: number;
  berserkers: number;
  snipers: number;
  artillery: number;
  juggernauts: number;
}

/** Count for a special type: one when it first appears, then one more every `every` Waves, capped. */
const ramp = (wave: number, from: number, every: number, max: number) =>
  wave < from ? 0 : Math.min(max, 1 + Math.floor((wave - from) / every));

/** Multiplies how many of each Hunter type a Wave sends; 1 where unset, 0 for none. */
export type EnemyDensity = Partial<Record<keyof WaveMix, number>>;

/**
 * How many of each Hunter type a Wave sends, scaled by `density`. From Wave 4, fewer Tanks and
 * more special types. A Wave always has at least one Hunter, or it would end before it began.
 */
export function waveMix(wave: number, density: EnemyDensity = {}): WaveMix {
  const c = CONFIG.waves;
  const tanks = Math.min(c.maxCount, c.firstCount + c.countPerWave * (wave - 1));
  const base: WaveMix = {
    tanks: wave >= c.tankReductionFromWave ? Math.round(tanks * (1 - c.tankReduction)) : tanks,
    berserkers: ramp(wave, c.berserkerFromWave, 2, c.maxBerserkers),
    snipers: ramp(wave, c.sniperFromWave, 1.5, c.maxSnipers),
    artillery: ramp(wave, c.artilleryFromWave, 2, c.maxArtillery),
    juggernauts: juggernautsFor(wave),
  };
  const mix = { ...base };
  for (const key of Object.keys(mix) as (keyof WaveMix)[]) {
    mix[key] = Math.round(base[key] * (density[key] ?? 1));
  }
  if (waveTotal(mix) === 0) mix.tanks = 1;
  return mix;
}

/** Juggernauts come in their own Waves, every few Waves, with a second joining later on. */
function juggernautsFor(wave: number): number {
  const { juggernautFromWave: from, juggernautEvery: every, maxJuggernauts } = CONFIG.waves;
  if (wave < from || (wave - from) % every !== 0) return 0;
  return Math.min(maxJuggernauts, 1 + Math.floor((wave - from) / (every * 3)));
}

export const waveTotal = (mix: WaveMix): number =>
  mix.tanks + mix.berserkers + mix.snipers + mix.artillery + mix.juggernauts;

export const tankSpeed = (wave: number): number =>
  Math.min(CONFIG.tank.maxSpeed, CONFIG.tank.baseSpeed + CONFIG.tank.speedPerWave * (wave - 1));

/**
 * Picks `count` distinct open cell centers at least `minSpawnDistance` from the Ship. If the Arena
 * cannot supply enough, the farthest open cells are used instead. The first `roomy` points stand at
 * least `juggernaut.spawnClearance` cells from any Block, or as far from one as the Arena allows.
 */
export function spawnPoints(
  terrain: Terrain,
  shipPos: Vec2,
  count: number,
  rng: Rng,
  roomy = 0,
): Vec2[] {
  const room = clearance(terrain);
  const candidates: { p: Vec2; d: number; room: number }[] = [];
  for (let y = 0; y < terrain.cells; y++) {
    for (let x = 0; x < terrain.cells; x++) {
      if (terrain.isSolid(x, y)) continue;
      const p = { x: terrain.cellCenter(x), y: terrain.cellCenter(y) };
      candidates.push({
        p,
        d: Math.hypot(p.x - shipPos.x, p.y - shipPos.y),
        room: room[terrain.index(x, y)]!,
      });
    }
  }
  let pool = candidates.filter((c) => c.d >= CONFIG.waves.minSpawnDistance);
  if (pool.length < count) pool = [...candidates].sort((a, b) => b.d - a.d).slice(0, count);

  const picked: Vec2[] = [];
  const take = (from: typeof pool) => {
    const c = from[rng.int(from.length)]!;
    picked.push(c.p);
    pool.splice(pool.indexOf(c), 1);
  };
  for (let i = 0; i < roomy && pool.length > 0; i++) {
    const most = Math.max(...pool.map((c) => c.room));
    const need = Math.min(most, CONFIG.juggernaut.spawnClearance);
    take(pool.filter((c) => c.room >= need));
  }
  while (picked.length < count && pool.length > 0) take(pool);
  return picked;
}

/** Each cell's distance in cells to the nearest solid cell or the Arena's rim, diagonals counting as one. */
function clearance(terrain: Terrain): Int32Array {
  const n = terrain.cells;
  const dist = new Int32Array(n * n).fill(-1);
  let frontier: number[] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const rim = x === 0 || y === 0 || x === n - 1 || y === n - 1;
      if (terrain.isSolid(x, y)) dist[terrain.index(x, y)] = 0;
      else if (rim) dist[terrain.index(x, y)] = 1;
      else continue;
      frontier.push(terrain.index(x, y));
    }
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % n;
      const y = (i - x) / n;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const j = terrain.index(nx, ny);
          if (dist[j] !== -1) continue;
          dist[j] = dist[i]! + 1;
          next.push(j);
        }
    }
    frontier = next;
  }
  return dist;
}
