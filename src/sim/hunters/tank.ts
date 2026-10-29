import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, distance } from '../../core/vec2';
import { moveHunter, orbitHunter } from './movement';
import type { HuntContext, HunterAction, Tank, TankRole } from './types';

export function createTank(id: number, role: TankRole, pos: Vec2, rng: Rng): Tank {
  return {
    kind: 'tank',
    id,
    role,
    orbitDir: rng.next() < 0.5 ? 1 : -1,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: rng.range(0.5, CONFIG.tank.fireInterval),
  };
}

/**
 * Out of sight, Chasers close on the Ship and Cutters head for where it will be. Once a Tank can see
 * the Ship within engagement range it stops closing and circles at stand-off range, firing Shells:
 * Tanks box the Ship in with fire, not bodies.
 */
export function stepTank(h: Tank, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.tank;
  const shipPos = ctx.ship.pos;
  const toShip = distance(h.pos, shipPos);
  const sees = toShip < cfg.engageRange && ctx.terrain.hasLineOfSight(h.pos, shipPos);
  if (sees) {
    const { standoff, standoffBand, radius } = cfg;
    orbitHunter(h, shipPos, h.orbitDir, standoff, standoffBand, ctx.tankSpeed, radius, ctx, dt);
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
    );
  }
  h.aim = Math.atan2(shipPos.y - h.pos.y, shipPos.x - h.pos.x);

  h.fireCooldown -= dt;
  if (h.fireCooldown <= 0 && toShip < cfg.fireRange && ctx.terrain.hasLineOfSight(h.pos, shipPos)) {
    h.fireCooldown = cfg.fireInterval * ctx.rng.range(0.8, 1.25);
    // Aimed at where the Ship is now, not where it will be: moving is how the Ship dodges.
    return { type: 'shell', angle: h.aim };
  }
  return null;
}
