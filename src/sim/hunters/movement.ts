import { CONFIG } from '../../config';
import { type Vec2, distance, normalize, turnToward } from '../../core/vec2';
import { resolveCircle, slideAlong } from '../collision';
import type { FlowField } from '../flowfield';
import type { Hunter, HuntContext } from './types';

/** Closer than this to a destination, a Hunter stops instead of circling it. */
const ARRIVE_DISTANCE = 1.5;

/**
 * Accelerates a Hunter toward `target` at up to `speed`, spreading away from other Hunters and
 * sliding along terrain. It steers straight at a visible, nearby target and otherwise descends
 * `field`, which must lead to the same target.
 */
export function moveHunter(
  h: Hunter,
  target: Vec2,
  field: FlowField,
  speed: number,
  radius: number,
  ctx: HuntContext,
  dt: number,
): void {
  const cfg = CONFIG.hunters;
  const toTarget = distance(h.pos, target);
  let dir: Vec2;
  if (toTarget < ARRIVE_DISTANCE) {
    dir = { x: 0, y: 0 };
  } else if (toTarget < cfg.directSteerRange && ctx.terrain.hasLineOfSight(h.pos, target)) {
    dir = normalize({ x: target.x - h.pos.x, y: target.y - h.pos.y });
  } else {
    dir = field.directionFrom(h.pos) ?? normalize({ x: target.x - h.pos.x, y: target.y - h.pos.y });
  }

  const sep = separation(h, ctx.hunters);
  const steer = { x: dir.x + sep.x, y: dir.y + sep.y };
  const len = Math.hypot(steer.x, steer.y);
  // Without a destination, separation alone may move the Hunter, but never faster than it wanders.
  const desired = len > 1 ? { x: steer.x / len, y: steer.y / len } : steer;
  const dvx = desired.x * speed - h.vel.x;
  const dvy = desired.y * speed - h.vel.y;
  const dv = Math.hypot(dvx, dvy);
  const maxDv = cfg.accel * dt;
  const k = dv > maxDv ? maxDv / dv : 1;
  h.vel = { x: h.vel.x + dvx * k, y: h.vel.y + dvy * k };

  const hit = resolveCircle(
    ctx.terrain,
    { x: h.pos.x + h.vel.x * dt, y: h.pos.y + h.vel.y * dt },
    radius,
  );
  h.pos = hit.pos;
  if (hit.normal) h.vel = slideAlong(h.vel, hit.normal);

  if (Math.hypot(h.vel.x, h.vel.y) > 0.5) {
    h.heading = turnToward(h.heading, Math.atan2(h.vel.y, h.vel.x), cfg.turnRate * dt);
  }
}

function separation(h: Hunter, hunters: readonly Hunter[]): Vec2 {
  const range = CONFIG.hunters.separation;
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

/**
 * Picks the best of `candidates` random open cells by `score`, for Hunters that hold a Perch.
 * Returns null only if no open cell was sampled.
 */
export function choosePerch(
  ctx: HuntContext,
  candidates: number,
  score: (p: Vec2) => number,
): Vec2 | null {
  const t = ctx.terrain;
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates; i++) {
    const cx = ctx.rng.int(t.cells);
    const cy = ctx.rng.int(t.cells);
    if (t.isSolid(cx, cy)) continue;
    const p = { x: t.cellCenter(cx), y: t.cellCenter(cy) };
    const s = score(p);
    if (s > bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}
