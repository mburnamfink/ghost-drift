import { CONFIG } from '../config';
import { type Vec2, distance, turnToward, wrapAngle } from '../core/vec2';
import type { ShotStyle } from './multiplier';
import type { Ship } from './ship';
import type { Shot } from './shots';
import type { Terrain } from './terrain';

export type Weapon = 'cannon' | 'shotgun';

export const WEAPONS: readonly Weapon[] = ['cannon', 'shotgun'];

export const nextWeapon = (w: Weapon): Weapon =>
  WEAPONS[(WEAPONS.indexOf(w) + 1) % WEAPONS.length]!;

/**
 * A Shotgun discharge: one U-shaped front that sweeps out from where the Ship fired it, reaching far
 * ahead of the nose and shorter to either side. It drifts on at the Ship's velocity of that moment
 * and keeps its line once fired, so the Ship can shoot and veer away; it holds at full range for a
 * moment so a Hunter driven into it is still caught.
 */
export interface Pulse {
  origin: Vec2;
  /** The Ship's velocity when it fired; the front drifts on at this. */
  vel: Vec2;
  heading: number;
  age: number;
  /** Hunters already damaged by this Pulse, so each takes one hit. */
  hit: number[];
  /** How the Ship was flying when it fired. */
  style: ShotStyle;
}

export function shotgunBlast(ship: Ship, style: ShotStyle): Pulse {
  return {
    origin: { ...ship.pos },
    vel: { ...ship.vel },
    heading: ship.heading,
    age: 0,
    hit: [],
    style,
  };
}

/**
 * The U's full reach at `off` radians from the nose: two half-ellipses meeting smoothly abeam at
 * `sideRange`, through `range` ahead and the shorter `backRange` astern, so the arms curl in.
 */
export function pulseReachAt(off: number): number {
  const { range, sideRange, backRange } = CONFIG.shotgun;
  const along = Math.cos(off) >= 0 ? range : backRange;
  return (along * sideRange) / Math.hypot(sideRange * Math.cos(off), along * Math.sin(off));
}

/** How far the front has grown, 0 to 1. */
export const pulseGrowth = (p: Pulse): number => Math.min(1, p.age / CONFIG.shotgun.duration);

export const pulseLifetime = (): number => CONFIG.shotgun.duration + CONFIG.shotgun.hold;

/** Ages Pulses and carries them on at the velocity they were fired with, dropping spent ones. */
export function stepPulses(pulses: Pulse[], dt: number): void {
  let kept = 0;
  for (const p of pulses) {
    p.age += dt;
    p.origin = { x: p.origin.x + p.vel.x * dt, y: p.origin.y + p.vel.y * dt };
    if (p.age <= pulseLifetime()) pulses[kept++] = p;
  }
  pulses.length = kept;
}

/** True if a circle at `pos` lies inside the Pulse's swept U and terrain does not shield it. */
export function pulseReaches(p: Pulse, pos: Vec2, radius: number, terrain: Terrain): boolean {
  const d = distance(p.origin, pos);
  const off = d > 0 ? wrapAngle(Math.atan2(pos.y - p.origin.y, pos.x - p.origin.x) - p.heading) : 0;
  if (d - radius > pulseGrowth(p) * pulseReachAt(off)) return false;
  if (d > radius && Math.abs(off) > CONFIG.shotgun.armAngle + Math.asin(radius / d)) return false;
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
