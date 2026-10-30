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

export const fireInterval = (w: Weapon): number => CONFIG[w].interval;

/**
 * A Shotgun discharge: an arc that sweeps out from the Ship, rides along with it, and holds at full
 * range for a moment so a Hunter driven into it is still caught.
 */
export interface Pulse {
  origin: Vec2;
  heading: number;
  /** 0 fires along the nose; -1 and 1 fire square to the line of travel, left and right. */
  side: -1 | 0 | 1;
  /** How far it sweeps once fully grown. */
  range: number;
  age: number;
  /**
   * Hunters already damaged by this shot. The Pulses of one shot share the list, so a Hunter caught
   * by two of them takes one hit.
   */
  hit: number[];
  /** How the Ship was flying when it fired. */
  style: ShotStyle;
}

/** Below this speed the Ship has no clear line of travel, so side Pulses square to the nose. */
const TRAVEL_MIN_SPEED = 2;

/**
 * Where a Pulse points: the nose for the forward one, square to the line of travel for the sides,
 * so a Powerslide aims the front at one target while the sides rake what the Ship glides past.
 */
function pulseHeading(side: Pulse['side'], ship: Ship): number {
  if (side === 0) return ship.heading;
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  const travel = speed > TRAVEL_MIN_SPEED ? Math.atan2(ship.vel.y, ship.vel.x) : ship.heading;
  return travel + (side * Math.PI) / 2;
}

/** One Shotgun shot: a long Pulse ahead and a short one off each side, all from the Ship. */
export function shotgunBlast(ship: Ship, style: ShotStyle): Pulse[] {
  const { range, sideRange } = CONFIG.shotgun;
  const hit: number[] = [];
  return ([0, -1, 1] as const).map((side) => ({
    origin: { ...ship.pos },
    heading: pulseHeading(side, ship),
    side,
    range: side === 0 ? range : sideRange,
    age: 0,
    hit,
    style,
  }));
}

export const pulseRadius = (p: Pulse): number =>
  Math.min(1, p.age / CONFIG.shotgun.duration) * p.range;

export const pulseLifetime = (): number => CONFIG.shotgun.duration + CONFIG.shotgun.hold;

/** Ages Pulses and carries them with the Ship, dropping spent ones. */
export function stepPulses(pulses: Pulse[], ship: Ship, dt: number): void {
  let kept = 0;
  for (const p of pulses) {
    p.age += dt;
    p.origin = { ...ship.pos };
    p.heading = pulseHeading(p.side, ship);
    if (p.age <= pulseLifetime()) pulses[kept++] = p;
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
