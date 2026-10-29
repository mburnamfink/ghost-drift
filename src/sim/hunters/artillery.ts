import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import { type Vec2, clamp, distance } from '../../core/vec2';
import { FlowField } from '../flowfield';
import type { Terrain } from '../terrain';
import { moveHunter } from './movement';
import { updatePerch } from './percher';
import type { Artillery, HuntContext, HunterAction } from './types';

export function createArtillery(id: number, pos: Vec2, terrain: Terrain, rng: Rng): Artillery {
  return {
    kind: 'artillery',
    id,
    pos,
    vel: { x: 0, y: 0 },
    heading: rng.range(-Math.PI, Math.PI),
    aim: 0,
    fireCooldown: rng.range(1.5, CONFIG.artillery.cooldown),
    perch: null,
    perchField: new FlowField(terrain),
    repickTime: 0,
  };
}

/**
 * Holds a Perch behind cover at long range and lobs Salvos along the Ship's projected path. Needs
 * no line of sight, but only fires at a Ship under open sky: tall Blocks nearby block the arc.
 */
export function stepArtillery(h: Artillery, ctx: HuntContext, dt: number): HunterAction | null {
  const cfg = CONFIG.artillery;
  const { ship, terrain } = ctx;
  updatePerch(
    h,
    ctx,
    dt,
    cfg,
    (p) => terrain.blocksNear(p, 2) - Math.abs(distance(p, ship.pos) - cfg.idealRange),
  );
  moveHunter(h, h.perch ?? h.pos, h.perchField, cfg.speed, cfg.radius, ctx, dt);
  h.aim = Math.atan2(ship.pos.y - h.pos.y, ship.pos.x - h.pos.x);

  h.fireCooldown -= dt;
  if (
    h.fireCooldown > 0 ||
    distance(h.pos, ship.pos) > cfg.maxRange ||
    !terrain.isOpenSky(ship.pos, cfg.openSkyCells)
  ) {
    return null;
  }
  h.fireCooldown = cfg.cooldown * ctx.rng.range(0.85, 1.2);
  const margin = terrain.cellSize;
  const targets = cfg.salvoLeads
    .map((t) => ({
      x: clamp(ship.pos.x + ship.vel.x * t, margin, terrain.worldSize - margin),
      y: clamp(ship.pos.y + ship.vel.y * t, margin, terrain.worldSize - margin),
    }))
    .filter((p) => !terrain.isSolidAt(p));
  return { type: 'salvo', targets };
}
