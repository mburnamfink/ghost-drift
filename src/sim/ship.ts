import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { type Vec2, dot, fromAngle, length } from '../core/vec2';
import { resolveCircle, slideAlong } from './collision';
import type { Controls } from './controls';
import type { Terrain } from './terrain';
import { type Weapon, fireInterval, nextWeapon } from './weapons';

export interface Ship {
  pos: Vec2;
  vel: Vec2;
  heading: number;
  hull: number;
  charges: number;
  /** Seconds of Burst remaining; > 0 while bursting. */
  burstTime: number;
  /** Seconds of post-hit invulnerability remaining. */
  invulnerableTime: number;
  fireCooldown: number;
  weapon: Weapon;
  sliding: boolean;
}

export function createShip(pos: Vec2, heading = 0): Ship {
  return {
    pos,
    vel: { x: 0, y: 0 },
    heading,
    hull: CONFIG.ship.hull,
    charges: CONFIG.ship.burstCharges,
    burstTime: 0,
    invulnerableTime: 0,
    fireCooldown: 0,
    weapon: 'cannon',
    sliding: false,
  };
}

export const isBursting = (ship: Ship): boolean => ship.burstTime > 0;
export const canBeHit = (ship: Ship): boolean => ship.burstTime <= 0 && ship.invulnerableTime <= 0;
export const speedOf = (ship: Ship): number => length(ship.vel);

export interface ShipStepResult {
  burstStarted: boolean;
  /** True if a Burst bounced off a wall this step. */
  bounced: boolean;
  /** Heading the current weapon fired along this step, if it fired. */
  fired: number | null;
}

/** Advances the Ship one fixed step: handling, Burst, firing cadence and terrain collision. */
export function stepShip(
  ship: Ship,
  controls: Controls,
  terrain: Terrain,
  dt: number,
): ShipStepResult {
  const cfg = CONFIG.ship;
  const result: ShipStepResult = { burstStarted: false, bounced: false, fired: null };

  ship.invulnerableTime = Math.max(0, ship.invulnerableTime - dt);
  ship.fireCooldown = Math.max(0, ship.fireCooldown - dt);
  if (controls.swap) ship.weapon = nextWeapon(ship.weapon);

  if (controls.burst && !isBursting(ship) && ship.charges > 0) {
    ship.charges--;
    ship.burstTime = cfg.burstDuration;
    result.burstStarted = true;
  }

  const bursting = isBursting(ship);
  ship.sliding = controls.slide && !bursting;
  const turnRate = ship.sliding ? cfg.slideTurnRate : cfg.turnRate;
  ship.heading += controls.steer * turnRate * dt;
  const forward = fromAngle(ship.heading);
  const right = { x: -forward.y, y: forward.x };

  if (bursting) {
    ship.vel = { x: forward.x * cfg.burstSpeed, y: forward.y * cfg.burstSpeed };
  } else if (ship.sliding) {
    // Momentum carries the Ship straight on while the nose swings free; thrust has no effect.
    const decay = Math.exp(-cfg.slideDrag * dt);
    ship.vel = { x: ship.vel.x * decay, y: ship.vel.y * decay };
  } else {
    let along = dot(ship.vel, forward) + controls.thrust * cfg.thrust * dt;
    let side = dot(ship.vel, right);
    const before = Math.hypot(along, side);
    side *= Math.exp(-cfg.grip * dt);
    if (along > 0) {
      // Grip turns most of the sideways momentum forward instead of scrubbing it, so turns keep speed.
      const kept = Math.hypot(along, side) + (before - Math.hypot(along, side)) * cfg.carve;
      along = Math.sqrt(Math.max(0, kept * kept - side * side));
    }
    const drag = Math.exp(-cfg.drag * dt);
    along *= drag;
    side *= drag;
    ship.vel = {
      x: forward.x * along + right.x * side,
      y: forward.y * along + right.y * side,
    };
  }

  const moved = { x: ship.pos.x + ship.vel.x * dt, y: ship.pos.y + ship.vel.y * dt };
  const hit = resolveCircle(terrain, moved, cfg.radius, bursting);
  ship.pos = hit.pos;
  if (hit.normal && bursting) {
    // A Burst caroms off walls like a billiard ball, keeping its speed.
    const into = dot(ship.vel, hit.normal);
    if (into < 0) {
      ship.vel = {
        x: ship.vel.x - 2 * into * hit.normal.x,
        y: ship.vel.y - 2 * into * hit.normal.y,
      };
      ship.heading = Math.atan2(ship.vel.y, ship.vel.x);
      result.bounced = true;
    }
  } else if (hit.normal) {
    ship.vel = slideAlong(ship.vel, hit.normal);
  }

  if (bursting) {
    ship.burstTime = Math.max(0, ship.burstTime - dt);
    if (ship.burstTime === 0) endBurst(ship, terrain, fromAngle(ship.heading));
  }

  if (controls.fire && !bursting && ship.fireCooldown === 0) {
    ship.fireCooldown = fireInterval(ship.weapon);
    result.fired = ship.heading;
  }

  return result;
}

function endBurst(ship: Ship, terrain: Terrain, forward: Vec2): void {
  const r = CONFIG.ship.radius;
  if (resolveCircle(terrain, ship.pos, r).normal) {
    ship.pos = terrain.nearestOpenPoint(ship.pos);
  }
  // Leave a Burst at top speed: it is an escape, not a stop.
  ship.vel = { x: forward.x * SHIP_TOP_SPEED, y: forward.y * SHIP_TOP_SPEED };
}
