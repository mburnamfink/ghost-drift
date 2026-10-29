import type { Vec2 } from '../core/vec2';
import type { Terrain } from './terrain';

/** A Bolt or a Shell in flight. Which one is decided by the list it lives in. */
export interface Shot {
  pos: Vec2;
  vel: Vec2;
  life: number;
  /** Hit radius, if not the default for its kind of shot. */
  radius?: number;
}

export function createShot(
  from: Vec2,
  angle: number,
  speed: number,
  life: number,
  radius?: number,
): Shot {
  return {
    pos: { ...from },
    vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    life,
    ...(radius === undefined ? {} : { radius }),
  };
}

/** Moves shots in place, dropping any that expired or struck terrain. */
export function stepShots(shots: Shot[], terrain: Terrain, dt: number): void {
  let kept = 0;
  for (const s of shots) {
    s.pos.x += s.vel.x * dt;
    s.pos.y += s.vel.y * dt;
    s.life -= dt;
    if (s.life > 0 && !terrain.isSolidAt(s.pos)) shots[kept++] = s;
  }
  shots.length = kept;
}
