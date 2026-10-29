import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import { type Tank, tankHasShot } from './hunters';
import type { Ship } from './ship';
import type { Terrain } from './terrain';

export interface Volley {
  /** Seconds until the next wind-up begins. */
  timer: number;
  /** Seconds left in the current wind-up; 0 when none is under way. */
  windup: number;
}

export const createVolley = (rng: Rng): Volley => ({
  timer: CONFIG.volley.interval * rng.range(0.5, 1),
  windup: 0,
});

/**
 * Runs the shared Tank firing rhythm. When the timer expires, every Tank with a clear shot loads
 * and the wind-up starts; when the wind-up ends, every loaded Tank that still has a shot fires at
 * once. Returns the Tanks firing this step.
 */
export function advanceVolley(
  volley: Volley,
  tanks: readonly Tank[],
  ship: Ship,
  terrain: Terrain,
  dt: number,
  rng: Rng,
): Tank[] {
  const ctx = { ship, terrain };
  if (volley.windup > 0) {
    volley.windup -= dt;
    if (volley.windup > 0) return [];
    volley.windup = 0;
    const firing = tanks.filter((t) => t.loading && tankHasShot(t, ctx));
    for (const t of tanks) t.loading = false;
    return firing;
  }
  volley.timer -= dt;
  if (volley.timer > 0) return [];
  volley.timer = CONFIG.volley.interval * rng.range(0.9, 1.1);
  let loaded = false;
  for (const t of tanks) {
    t.loading = tankHasShot(t, ctx);
    loaded ||= t.loading;
  }
  if (loaded) volley.windup = CONFIG.volley.windup;
  return [];
}
