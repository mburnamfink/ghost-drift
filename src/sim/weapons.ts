import { CONFIG } from '../config';
import { type Vec2, distance, turnToward, wrapAngle } from '../core/vec2';
import type { Shot } from './shots';
import type { Terrain } from './terrain';

export type Weapon = 'cannon' | 'shotgun';

export const WEAPONS: readonly Weapon[] = ['cannon', 'shotgun'];

export const nextWeapon = (w: Weapon): Weapon =>
  WEAPONS[(WEAPONS.indexOf(w) + 1) % WEAPONS.length]!;

export const fireInterval = (w: Weapon): number => CONFIG[w].interval;

/** A Shotgun discharge: an arc that sweeps outward from where it was fired, carried by the Ship's momentum. */
export interface Pulse {
  origin: Vec2;
  vel: Vec2;
  heading: number;
  age: number;
  /** Hunters this Pulse has already damaged; each takes one hit per Pulse. */
  hit: number[];
}

export const pulseRadius = (p: Pulse): number =>
  (p.age / CONFIG.shotgun.duration) * CONFIG.shotgun.range;

/** Grows Pulses in place, dropping spent ones. */
export function stepPulses(pulses: Pulse[], dt: number): void {
  let kept = 0;
  for (const p of pulses) {
    p.age += dt;
    p.origin.x += p.vel.x * dt;
    p.origin.y += p.vel.y * dt;
    if (p.age <= CONFIG.shotgun.duration) pulses[kept++] = p;
  }
  pulses.length = kept;
}

/** True if any part of a circle at `pos` lies inside the Pulse's swept arc and terrain does not shield it. */
export function pulseReaches(p: Pulse, pos: Vec2, radius: number, terrain: Terrain): boolean {
  const d = distance(p.origin, pos);
  if (d - radius > pulseRadius(p)) return false;
  if (d > radius) {
    const off = Math.abs(wrapAngle(Math.atan2(pos.y - p.origin.y, pos.x - p.origin.x) - p.heading));
    if (off > CONFIG.shotgun.halfAngle + Math.asin(radius / d)) return false;
  }
  return terrain.hasLineOfSight(p.origin, pos);
}

/**
 * Bends each Cannon Bolt a little toward the Hunter nearest its line of flight, if one lies within
 * the homing cone and the Bolt's remaining range. Assists near misses; never turns a Bolt around.
 */
export function homeBolts(bolts: readonly Shot[], targets: readonly Vec2[], dt: number): void {
  const cfg = CONFIG.cannon;
  for (const b of bolts) {
    const heading = Math.atan2(b.vel.y, b.vel.x);
    const reach = cfg.speed * b.life;
    let best: number | null = null;
    let bestOff: number = cfg.homingCone;
    for (const t of targets) {
      if (distance(b.pos, t) > reach) continue;
      const bearing = Math.atan2(t.y - b.pos.y, t.x - b.pos.x);
      const off = Math.abs(wrapAngle(bearing - heading));
      if (off < bestOff) {
        bestOff = off;
        best = bearing;
      }
    }
    if (best === null) continue;
    const turned = turnToward(heading, best, cfg.homingRate * dt);
    b.vel = { x: Math.cos(turned) * cfg.speed, y: Math.sin(turned) * cfg.speed };
  }
}
