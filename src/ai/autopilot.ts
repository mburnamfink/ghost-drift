import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { Rng } from '../core/rng';
import { type Vec2, clamp, distance, fromAngle, wrapAngle } from '../core/vec2';
import { type Controls, NO_CONTROLS } from '../sim/controls';
import { FlowField } from '../sim/flowfield';
import type { Hunter } from '../sim/hunters';
import { canBeHit, speedOf } from '../sim/ship';
import type { Weapon } from '../sim/weapons';
import type { World } from '../sim/world';

/** Seconds between rebuilds of the route to the current target. */
const ROUTE_REFRESH = 0.3;
/** Hunters closer than this are fought with the Shotgun, farther ones with the Cannon. */
const SHOTGUN_RANGE = 15;
/** A Shell passing closer than this, sooner than `DODGE_HORIZON` seconds from now, is dodged. */
const DODGE_MISS = 3.5;
const DODGE_HORIZON = 0.8;

/**
 * Plays the game through the same Controls a player produces, for the `?demo` mode. It hunts the
 * nearest Hunter by flow field, swerves around Blocks and incoming Shells, Powerslides past targets
 * off its nose with guns blazing, and Bursts out of trouble. Deliberately good, not perfect.
 */
export class Autopilot {
  private route: FlowField | null = null;
  private routeTimer = 0;
  private routeTerrain: World['terrain'] | null = null;
  private slideTime = 0;
  private stuckTime = 0;
  private patrol: Vec2 | null = null;
  private rng = new Rng(1);

  reset(world: World): void {
    this.route = null;
    this.routeTerrain = null;
    this.slideTime = 0;
    this.stuckTime = 0;
    this.patrol = null;
    this.rng = new Rng(world.seed ^ 0x5eed);
  }

  controls(world: World, dt: number): Controls {
    const { ship, terrain } = world;
    const speed = speedOf(ship);
    const target = nearestHunter(world);
    const goal = target?.pos ?? this.patrolPoint(world);

    let desired = this.routeTo(world, goal, dt);
    desired = avoidBlocks(world, desired, speed);
    const dodge = dodgeShells(world);
    if (dodge)
      desired = Math.atan2(Math.sin(desired) + dodge.y * 2, Math.cos(desired) + dodge.x * 2);

    const c: Controls = { ...NO_CONTROLS, thrust: 1 };
    c.steer = clamp(wrapAngle(desired - ship.heading) * 2.5, -1, 1);

    if (target) {
      const toTarget = Math.atan2(target.pos.y - ship.pos.y, target.pos.x - ship.pos.x);
      const off = Math.abs(wrapAngle(toTarget - ship.heading));
      const range = distance(ship.pos, target.pos);
      const sees = terrain.hasLineOfSight(ship.pos, target.pos);
      this.updateSlide(world, c, toTarget, off, range, sees, dt);
      c.fire = sees && anyInSights(world);
      const want: Weapon = range < SHOTGUN_RANGE ? 'shotgun' : 'cannon';
      c.swap = ship.weapon !== want;
    } else {
      this.slideTime = 0;
    }

    this.stuckTime = speed < 4 ? this.stuckTime + dt : 0;
    c.burst = ship.charges > 0 && ship.burstTime <= 0 && (this.stuckTime > 0.8 || inDanger(world));
    if (c.burst) this.stuckTime = 0;
    return c;
  }

  /**
   * Slides when moving fast past a visible target well off the nose: momentum carries the Ship on
   * while the nose, and the guns, swing onto it. Ends when speed bleeds away or the line of travel
   * is about to meet a wall.
   */
  private updateSlide(
    world: World,
    c: Controls,
    toTarget: number,
    off: number,
    range: number,
    sees: boolean,
    dt: number,
  ): void {
    const { ship, terrain } = world;
    const speed = speedOf(ship);
    const travel =
      speed > 1 ? { x: ship.vel.x / speed, y: ship.vel.y / speed } : fromAngle(ship.heading);
    const runway = terrain.castRay(ship.pos, travel, 40);
    const sliding = this.slideTime > 0;
    const keep =
      sliding && this.slideTime < 1.6 && speed > SHIP_TOP_SPEED * 0.4 && runway > 10 && sees;
    const start =
      !sliding &&
      speed > SHIP_TOP_SPEED * 0.7 &&
      sees &&
      range < 70 &&
      off > 0.35 &&
      off < 1.8 &&
      runway > 28;
    if (keep || start) {
      this.slideTime += dt;
      c.slide = true;
      c.steer = clamp(wrapAngle(toTarget - ship.heading) * 3, -1, 1);
    } else {
      this.slideTime = 0;
    }
  }

  /** Heading toward `goal`: straight at it when visible, else along a flow field. */
  private routeTo(world: World, goal: Vec2, dt: number): number {
    const { ship, terrain } = world;
    if (distance(ship.pos, goal) < 60 && terrain.hasLineOfSight(ship.pos, goal)) {
      return Math.atan2(goal.y - ship.pos.y, goal.x - ship.pos.x);
    }
    if (this.routeTerrain !== terrain) {
      this.route = new FlowField(terrain);
      this.routeTerrain = terrain;
      this.routeTimer = 0;
    }
    this.routeTimer -= dt;
    if (this.routeTimer <= 0) {
      this.route!.build(goal);
      this.routeTimer = ROUTE_REFRESH;
    }
    const dir = this.route!.directionFrom(ship.pos);
    return dir ? Math.atan2(dir.y, dir.x) : Math.atan2(goal.y - ship.pos.y, goal.x - ship.pos.x);
  }

  /** Between Waves: cruise to random open points, keeping speed up. */
  private patrolPoint(world: World): Vec2 {
    const { ship, terrain } = world;
    if (!this.patrol || distance(ship.pos, this.patrol) < 12) {
      const size = terrain.worldSize;
      const p = { x: size * this.rng.range(0.25, 0.75), y: size * this.rng.range(0.25, 0.75) };
      this.patrol = terrain.isSolidAt(p) ? terrain.nearestOpenPoint(p) : p;
    }
    return this.patrol;
  }
}

function nearestHunter(world: World): Hunter | null {
  let best: Hunter | null = null;
  let bestD = Infinity;
  for (const h of world.hunters) {
    const d = distance(h.pos, world.ship.pos);
    if (d < bestD) [best, bestD] = [h, d];
  }
  return best;
}

/** True if any Hunter sits close enough to the nose that a shot now would land. */
function anyInSights(world: World): boolean {
  const { ship, terrain } = world;
  for (const h of world.hunters) {
    const d = distance(h.pos, ship.pos);
    if (d > 110) continue;
    const bearing = Math.atan2(h.pos.y - ship.pos.y, h.pos.x - ship.pos.x);
    const cone = CONFIG.cannon.homingCone + Math.atan2(CONFIG[h.kind].radius, d);
    const reach = ship.weapon === 'shotgun' ? CONFIG.shotgun.halfAngle : cone;
    if (
      Math.abs(wrapAngle(bearing - ship.heading)) < reach &&
      terrain.hasLineOfSight(ship.pos, h.pos)
    ) {
      return true;
    }
  }
  return false;
}

/** Bends `desired` away from Blocks ahead, toward whichever side has more room. */
export function avoidBlocks(world: World, desired: number, speed: number): number {
  const { ship, terrain } = world;
  const look = 8 + speed * 0.6;
  const clearAhead = terrain.castRay(ship.pos, fromAngle(desired), look);
  if (clearAhead >= look) return desired;
  const left = terrain.castRay(ship.pos, fromAngle(desired - 0.6), look);
  const right = terrain.castRay(ship.pos, fromAngle(desired + 0.6), look);
  const urgency = 1 - clearAhead / look;
  return desired + (right >= left ? 1 : -1) * (0.4 + urgency);
}

/** A unit push away from the most pressing incoming Shell, or null if none threatens. */
function dodgeShells(world: World): Vec2 | null {
  const { ship } = world;
  let worst: { push: Vec2; t: number } | null = null;
  for (const s of world.shells) {
    const rx = s.pos.x - ship.pos.x;
    const ry = s.pos.y - ship.pos.y;
    const vx = s.vel.x - ship.vel.x;
    const vy = s.vel.y - ship.vel.y;
    const v2 = vx * vx + vy * vy;
    if (v2 < 1e-6) continue;
    const t = -(rx * vx + ry * vy) / v2;
    if (t < 0 || t > DODGE_HORIZON) continue;
    const mx = rx + vx * t;
    const my = ry + vy * t;
    const miss = Math.hypot(mx, my);
    if (miss > DODGE_MISS || (worst && worst.t < t)) continue;
    // Move to the side the Shell will pass on the far side of.
    const len = miss || 1;
    worst = { push: miss > 1e-3 ? { x: -mx / len, y: -my / len } : { x: -vy, y: vx }, t };
  }
  if (!worst) return null;
  const len = Math.hypot(worst.push.x, worst.push.y) || 1;
  return { x: worst.push.x / len, y: worst.push.y / len };
}

/** Moments a Burst's invulnerability is worth a Charge. */
function inDanger(world: World): boolean {
  const { ship } = world;
  if (!canBeHit(ship)) return false;
  for (const h of world.hunters) {
    if (h.kind === 'sniper' && h.charge?.locked && distance(h.charge.target, ship.pos) < 6)
      return true;
    if (h.kind === 'berserker' && h.phase !== 'hunt' && distance(h.pos, ship.pos) < 14) return true;
  }
  for (const i of world.impacts) {
    if (i.time < 0.3 && distance(i.pos, ship.pos) < CONFIG.artillery.blastRadius + 2) return true;
  }
  return ship.hull === 1 && dodgeShells(world) !== null;
}
