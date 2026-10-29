import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, distance, normalize } from '../../core/vec2';
import { FlowField } from '../flowfield';
import type { Terrain } from '../terrain';
import { moveHunter } from './movement';
import { updatePerch } from './percher';
import type { HuntContext, HunterAction, Sniper } from './types';

/** Seconds before a Sniper that lost sight of the Ship mid-charge may start another. */
const RECHARGE_AFTER_CANCEL = 0.5;

export function createSniper(id: number, pos: Vec2, terrain: Terrain, rng: Rng): Sniper {
  return {
    kind: 'sniper',
    id,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: rng.range(1, CONFIG.sniper.cooldown),
    perch: null,
    perchField: new FlowField(terrain),
    repickTime: 0,
    charge: null,
  };
}

/**
 * Holds a Perch with long sightlines at range. With the Ship in sight it charges a shot, tracking
 * where the Ship will be `lockTime` after the lock if it holds course; then the aim freezes and the
 * shot follows. Losing sight before the lock cancels the charge.
 */
export function stepSniper(h: Sniper, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.sniper;
  const { ship, terrain } = ctx;
  updatePerch(h, ctx, dt, cfg, (p) => {
    const sight = terrain.hasLineOfSight(p, ship.pos) ? 30 : 0;
    return sight + terrain.sightline(p, 30) - Math.abs(distance(p, ship.pos) - cfg.idealRange);
  });
  // A charging Sniper holds still.
  const target = h.charge ? h.pos : (h.perch ?? h.pos);
  moveHunter(h, target, h.perchField, h.charge ? 0 : cfg.speed, cfg.radius, ctx, dt);

  const sees = distance(h.pos, ship.pos) <= cfg.maxRange && terrain.hasLineOfSight(h.pos, ship.pos);
  const lead = () => ({
    x: ship.pos.x + ship.vel.x * cfg.lockTime,
    y: ship.pos.y + ship.vel.y * cfg.lockTime,
  });
  h.fireCooldown -= dt;
  let action: HunterAction | null = null;

  if (!h.charge) {
    if (h.fireCooldown <= 0 && sees) h.charge = { time: 0, target: lead(), locked: false };
  } else {
    h.charge.time += dt;
    if (!h.charge.locked) {
      if (!sees) {
        h.charge = null;
        h.fireCooldown = RECHARGE_AFTER_CANCEL;
      } else {
        h.charge.target = lead();
        if (h.charge.time >= cfg.chargeTime) h.charge.locked = true;
      }
    } else if (h.charge.time >= cfg.chargeTime + cfg.lockTime) {
      action = {
        type: 'snipe',
        dir: normalize({ x: h.charge.target.x - h.pos.x, y: h.charge.target.y - h.pos.y }),
      };
      h.charge = null;
      h.fireCooldown = cfg.cooldown * ctx.rng.range(0.85, 1.2);
    }
  }

  const aimAt = h.charge?.target ?? ship.pos;
  h.aim = Math.atan2(aimAt.y - h.pos.y, aimAt.x - h.pos.x);
  return action;
}
