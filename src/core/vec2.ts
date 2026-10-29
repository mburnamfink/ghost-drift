export interface Vec2 {
  x: number;
  y: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const fromAngle = (angle: number, len = 1): Vec2 => ({
  x: Math.cos(angle) * len,
  y: Math.sin(angle) * len,
});

export function normalize(a: Vec2): Vec2 {
  const len = length(a);
  return len > 1e-9 ? { x: a.x / len, y: a.y / len } : { x: 0, y: 0 };
}

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

/** Wraps an angle into (-π, π]. */
export function wrapAngle(a: number): number {
  const tau = Math.PI * 2;
  a = ((a % tau) + tau) % tau;
  return a > Math.PI ? a - tau : a;
}

/** Rotates `from` toward `to` by at most `maxStep`, taking the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const diff = wrapAngle(to - from);
  return Math.abs(diff) <= maxStep ? to : from + Math.sign(diff) * maxStep;
}
