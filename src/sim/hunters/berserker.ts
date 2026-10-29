import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, distance, normalize } from '../../core/vec2';
import { moveHunter, slideHunter, steerHunter } from './movement';
import type { Berserker, HuntContext, HunterAction } from './types';

export function createBerserker(id: number, pos: Vec2, rng: Rng): Berserker {
  return {
    kind: 'berserker',
    id,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: rng.range(0, CONFIG.berserker.lungeCooldown),
    phase: 'hunt',
    phaseTime: 0,
    lungeDir: { x: 1, y: 0 },
  };
}

/**
 * Unarmed and fast: runs the Ship down, and once close with a clear line it stops, winds up, then
 * lunges straight at where the Ship was when the wind-up ended. It damages only by ramming.
 * `fireCooldown` is the time until it may lunge again.
 */
export function stepBerserker(h: Berserker, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.berserker;
  const ship = ctx.ship.pos;
  h.fireCooldown -= dt;
  h.aim = Math.atan2(ship.y - h.pos.y, ship.x - h.pos.x);

  switch (h.phase) {
    case 'hunt':
      moveHunter(h, ship, ctx.chaseField, cfg.speed, cfg.radius, ctx, dt);
      if (
        h.fireCooldown <= 0 &&
        distance(h.pos, ship) < cfg.lungeRange &&
        ctx.terrain.hasLineOfSight(h.pos, ship)
      ) {
        h.phase = 'windup';
        h.phaseTime = cfg.windup;
      }
      break;
    case 'windup':
      steerHunter(h, { x: 0, y: 0 }, 0, cfg.radius, ctx, dt);
      h.heading = h.aim;
      h.phaseTime -= dt;
      if (h.phaseTime <= 0) {
        h.phase = 'lunge';
        h.phaseTime = cfg.lungeTime;
        h.lungeDir = normalize({ x: ship.x - h.pos.x, y: ship.y - h.pos.y });
      }
      break;
    case 'lunge': {
      h.vel = { x: h.lungeDir.x * cfg.lungeSpeed, y: h.lungeDir.y * cfg.lungeSpeed };
      const hitWall = slideHunter(h, cfg.radius, ctx, dt);
      h.phaseTime -= dt;
      if (h.phaseTime <= 0 || hitWall) endLunge(h);
      break;
    }
  }
  return null;
}

/** Called when a lunge runs out, hits terrain, or connects with the Ship. */
export function endLunge(h: Berserker): void {
  h.phase = 'hunt';
  h.fireCooldown = CONFIG.berserker.lungeCooldown;
  h.vel = { x: h.vel.x * 0.3, y: h.vel.y * 0.3 };
}
