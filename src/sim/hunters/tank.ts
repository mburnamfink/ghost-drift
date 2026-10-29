import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, clamp, distance } from '../../core/vec2';
import { moveHunter, steerHunter } from './movement';
import type { HuntContext, HunterAction, Tank, TankRole } from './types';

/** Distance over which pack cohesion ramps up to full strength. */
const COHESION_RANGE = 10;

export function createTank(
  id: number,
  pos: Vec2,
  rng: Rng,
  pack: { id: number; role: TankRole; orbitDir: 1 | -1 } = {
    id,
    role: 'chaser',
    orbitDir: 1,
  },
): Tank {
  return {
    kind: 'tank',
    id,
    packId: pack.id,
    role: pack.role,
    orbitDir: pack.orbitDir,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: 0,
    loading: false,
  };
}

/** True if this Tank has a clear shot at the Ship; only such Tanks load into a volley. */
export const tankHasShot = (h: Tank, ctx: Pick<HuntContext, 'ship' | 'terrain'>): boolean =>
  distance(h.pos, ctx.ship.pos) < CONFIG.tank.fireRange &&
  ctx.terrain.hasLineOfSight(h.pos, ctx.ship.pos);

/**
 * Moves a Tank; firing happens in volleys run by the World. Out of sight, Chasers close on the Ship
 * and Cutters head for where it will be. Once a Tank can see the Ship within engagement range it
 * stops closing and circles at stand-off range. Throughout, it is pulled toward its pack.
 */
export function stepTank(h: Tank, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.tank;
  const shipPos = ctx.ship.pos;
  const toShip = distance(h.pos, shipPos);
  const cohesion = packCohesion(h, ctx);
  const sees = toShip < cfg.engageRange && ctx.terrain.hasLineOfSight(h.pos, shipPos);
  if (sees && toShip > 1e-6) {
    const out = { x: (h.pos.x - shipPos.x) / toShip, y: (h.pos.y - shipPos.y) / toShip };
    // Positive when too far out: pull inward. Negative when too close: push outward.
    const inward = clamp((toShip - cfg.standoff) / cfg.standoffBand, -1, 1) * 1.5;
    const dir = {
      x: -out.y * h.orbitDir - out.x * inward,
      y: out.x * h.orbitDir - out.y * inward,
    };
    const len = Math.hypot(dir.x, dir.y);
    steerHunter(
      h,
      { x: dir.x / len, y: dir.y / len },
      ctx.tankSpeed,
      cfg.radius,
      ctx,
      dt,
      cohesion,
    );
  } else {
    const cutting = h.role === 'cutter' && toShip > cfg.cutterCommitDistance;
    moveHunter(
      h,
      cutting ? ctx.cutTarget : shipPos,
      cutting ? ctx.cutField : ctx.chaseField,
      ctx.tankSpeed,
      cfg.radius,
      ctx,
      dt,
      cohesion,
    );
  }
  h.aim = Math.atan2(shipPos.y - h.pos.y, shipPos.x - h.pos.x);
  return null;
}

/** Steering toward the centre of the rest of this Tank's pack, stronger the farther away it is. */
function packCohesion(h: Tank, ctx: HuntContext): Vec2 {
  let x = 0;
  let y = 0;
  let n = 0;
  for (const o of ctx.hunters) {
    if (o === h || o.kind !== 'tank' || o.packId !== h.packId) continue;
    x += o.pos.x;
    y += o.pos.y;
    n++;
  }
  if (n === 0) return { x: 0, y: 0 };
  const dx = x / n - h.pos.x;
  const dy = y / n - h.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { x: 0, y: 0 };
  const k = (CONFIG.tank.packCohesion * Math.min(1, d / COHESION_RANGE)) / d;
  return { x: dx * k, y: dy * k };
}
