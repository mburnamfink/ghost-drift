import { distance } from '../../core/vec2';
import type { Vec2 } from '../../core/vec2';
import { choosePerch } from './movement';
import type { Artillery, HuntContext, Sniper } from './types';

interface PerchConfig {
  fleeDistance: number;
  perchCandidates: number;
  repickInterval: number;
}

/**
 * Keeps a Sniper or Artillery's Perch current: picks one when it has none, when the interval runs
 * out, or when the Ship has come close enough to compromise it.
 */
export function updatePerch(
  h: Sniper | Artillery,
  ctx: HuntContext,
  dt: number,
  cfg: PerchConfig,
  score: (p: Vec2) => number,
): void {
  h.repickTime -= dt;
  const compromised = h.perch !== null && distance(h.perch, ctx.ship.pos) < cfg.fleeDistance * 1.5;
  if (h.perch && h.repickTime > 0 && !compromised) return;
  h.repickTime = cfg.repickInterval;
  const next = choosePerch(ctx, cfg.perchCandidates, (p) =>
    distance(p, ctx.ship.pos) < cfg.fleeDistance * 1.5 ? -Infinity : score(p),
  );
  if (!next) return;
  h.perch = next;
  h.perchField.build(next);
}
