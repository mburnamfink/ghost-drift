import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, distance, turnToward } from '../../core/vec2';
import { moveHunter, orbitHunter } from './movement';
import type { HuntContext, HunterAction, Juggernaut } from './types';

export function createJuggernaut(id: number, pos: Vec2, rng: Rng): Juggernaut {
  const heading = rng.range(-Math.PI, Math.PI);
  return {
    kind: 'juggernaut',
    id,
    pos,
    vel: { x: 0, y: 0 },
    heading,
    aim: heading,
    fireCooldown: rng.range(1, CONFIG.juggernaut.cooldown),
    hp: CONFIG.juggernaut.hp,
    windup: 0,
    orbitDir: rng.next() < 0.5 ? 1 : -1,
  };
}

/**
 * Closes on the Ship and circles it at short range. Its turret traverses slowly, so a Ship that
 * circles fast outruns its aim. With a clear shot it winds up, then fires a Spray: a fan of large
 * Shells centered on wherever the turret points.
 */
export function stepJuggernaut(h: Juggernaut, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.juggernaut;
  const shipPos = ctx.ship.pos;
  const sees =
    distance(h.pos, shipPos) < cfg.fireRange && ctx.terrain.hasLineOfSight(h.pos, shipPos);
  if (sees) {
    const { standoff, standoffBand, speed, radius } = cfg;
    orbitHunter(h, shipPos, h.orbitDir, standoff, standoffBand, speed, radius, ctx, dt);
  } else {
    moveHunter(h, shipPos, ctx.chaseField, cfg.speed, cfg.radius, ctx, dt);
  }
  const bearing = Math.atan2(shipPos.y - h.pos.y, shipPos.x - h.pos.x);
  h.aim = turnToward(h.aim, bearing, cfg.turretTurnRate * dt);

  if (h.windup > 0) {
    h.windup = Math.max(0, h.windup - dt);
    if (h.windup > 0) return null;
    h.fireCooldown = cfg.cooldown * ctx.rng.range(0.85, 1.15);
    const { count, spread } = cfg.spray;
    const angles = Array.from(
      { length: count },
      (_, i) => h.aim + spread * (count > 1 ? i / (count - 1) - 0.5 : 0),
    );
    return { type: 'spray', angles };
  }
  h.fireCooldown -= dt;
  if (h.fireCooldown <= 0 && sees) h.windup = cfg.windup;
  return null;
}
