import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import { type Vec2, distance, normalize, turnToward } from '../core/vec2';
import { resolveCircle, slideAlong } from './collision';
import type { FlowField } from './flowfield';
import type { Terrain } from './terrain';

export type HunterRole = 'chaser' | 'cutter';

export interface Hunter {
  id: number;
  role: HunterRole;
  pos: Vec2;
  vel: Vec2;
  /** Direction the hull faces; follows travel. */
  heading: number;
  /** Direction the turret faces; tracks the Ship. */
  aim: number;
  fireCooldown: number;
}

/** Shared per-step view of the world that every Hunter steers by. */
export interface HuntContext {
  terrain: Terrain;
  shipPos: Vec2;
  chaseField: FlowField;
  cutField: FlowField;
  cutTarget: Vec2;
  hunters: readonly Hunter[];
  speed: number;
  rng: Rng;
}

/** Hunters steer straight at a target they can see within this range, else follow the flow field. */
const DIRECT_STEER_RANGE = 40;

export function createHunter(id: number, role: HunterRole, pos: Vec2, rng: Rng): Hunter {
  return {
    id,
    role,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: rng.range(0.5, CONFIG.hunter.fireInterval),
  };
}

/** Advances one Hunter. Returns the angle of a Shell fired this step, or null. */
export function stepHunter(h: Hunter, ctx: HuntContext, dt: number): number | null {
  const cfg = CONFIG.hunter;
  const toShip = distance(h.pos, ctx.shipPos);
  const cutting = h.role === 'cutter' && toShip > cfg.cutterCommitDistance;
  const target = cutting ? ctx.cutTarget : ctx.shipPos;
  const field = cutting ? ctx.cutField : ctx.chaseField;

  let dir: Vec2;
  if (distance(h.pos, target) < DIRECT_STEER_RANGE && ctx.terrain.hasLineOfSight(h.pos, target)) {
    dir = normalize({ x: target.x - h.pos.x, y: target.y - h.pos.y });
  } else {
    dir = field.directionFrom(h.pos) ?? normalize({ x: target.x - h.pos.x, y: target.y - h.pos.y });
  }

  const sep = separation(h, ctx.hunters);
  const desired = normalize({ x: dir.x + sep.x, y: dir.y + sep.y });
  const dvx = desired.x * ctx.speed - h.vel.x;
  const dvy = desired.y * ctx.speed - h.vel.y;
  const dv = Math.hypot(dvx, dvy);
  const maxDv = cfg.accel * dt;
  const k = dv > maxDv ? maxDv / dv : 1;
  h.vel = { x: h.vel.x + dvx * k, y: h.vel.y + dvy * k };

  const hit = resolveCircle(
    ctx.terrain,
    { x: h.pos.x + h.vel.x * dt, y: h.pos.y + h.vel.y * dt },
    cfg.radius,
  );
  h.pos = hit.pos;
  if (hit.normal) h.vel = slideAlong(h.vel, hit.normal);

  if (Math.hypot(h.vel.x, h.vel.y) > 0.5) {
    h.heading = turnToward(h.heading, Math.atan2(h.vel.y, h.vel.x), cfg.turnRate * dt);
  }
  h.aim = Math.atan2(ctx.shipPos.y - h.pos.y, ctx.shipPos.x - h.pos.x);

  h.fireCooldown -= dt;
  if (
    h.fireCooldown <= 0 &&
    toShip < cfg.fireRange &&
    ctx.terrain.hasLineOfSight(h.pos, ctx.shipPos)
  ) {
    h.fireCooldown = cfg.fireInterval * ctx.rng.range(0.8, 1.25);
    // Aimed at where the Ship is now, not where it will be: moving is how the Ship dodges.
    return h.aim;
  }
  return null;
}

function separation(h: Hunter, hunters: readonly Hunter[]): Vec2 {
  const range = CONFIG.hunter.separation;
  let x = 0;
  let y = 0;
  for (const o of hunters) {
    if (o === h) continue;
    const dx = h.pos.x - o.pos.x;
    const dy = h.pos.y - o.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= range || d < 1e-6) continue;
    const push = (1 - d / range) * 1.5;
    x += (dx / d) * push;
    y += (dy / d) * push;
  }
  return { x, y };
}
