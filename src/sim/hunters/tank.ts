import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, distance } from '../../core/vec2';
import { moveHunter } from './movement';
import type { HuntContext, HunterAction, Tank, TankRole } from './types';

export function createTank(id: number, role: TankRole, pos: Vec2, rng: Rng): Tank {
  return {
    kind: 'tank',
    id,
    role,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: rng.range(0.5, CONFIG.tank.fireInterval),
  };
}

/** Chasers close on the Ship; Cutters head for where it will be. Both fire Shells when in sight. */
export function stepTank(h: Tank, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.tank;
  const shipPos = ctx.ship.pos;
  const toShip = distance(h.pos, shipPos);
  const cutting = h.role === 'cutter' && toShip > cfg.cutterCommitDistance;
  moveHunter(
    h,
    cutting ? ctx.cutTarget : shipPos,
    cutting ? ctx.cutField : ctx.chaseField,
    ctx.tankSpeed,
    cfg.radius,
    ctx,
    dt,
  );
  h.aim = Math.atan2(shipPos.y - h.pos.y, shipPos.x - h.pos.x);

  h.fireCooldown -= dt;
  if (h.fireCooldown <= 0 && toShip < cfg.fireRange && ctx.terrain.hasLineOfSight(h.pos, shipPos)) {
    h.fireCooldown = cfg.fireInterval * ctx.rng.range(0.8, 1.25);
    // Aimed at where the Ship is now, not where it will be: moving is how the Ship dodges.
    return { type: 'shell', angle: h.aim };
  }
  return null;
}
