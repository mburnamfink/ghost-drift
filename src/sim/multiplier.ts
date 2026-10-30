import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { wrapAngle } from '../core/vec2';
import { type Ship, isBursting, speedOf } from './ship';

/** Why a kill heated the Multiplier, beyond being a kill. */
export type StyleTag = 'drift' | 'speed' | 'chain';

/**
 * How the Ship was flying when a shot left it. Judged at the trigger and carried by the shot, so a
 * slide started after firing earns nothing, while one that ended before the shot landed still counts.
 */
export interface ShotStyle {
  /** Nose well off the line of travel, at speed: a real Powerslide, not a tap. */
  drift: boolean;
  /** The momentum meter was full. */
  fast: boolean;
}

/**
 * Score multiplier as heat: kills add heat for their style, and it burns off all the time, faster
 * the hotter it runs, which is the only thing that holds it down. The Multiplier is one more than
 * its whole part.
 */
export interface Multiplier {
  heat: number;
  /** 0 to 1: how long the Ship has held top speed. Full earns the speed style. */
  momentum: number;
  /** Kills in the current chain, each within `chainWindow` of the last. */
  chain: number;
  /** World time of the player's last kill. */
  lastKill: number;
}

export const newMultiplier = (): Multiplier => ({
  heat: 0,
  momentum: 0,
  chain: 0,
  lastKill: -Infinity,
});

export const multiplierValue = (m: Multiplier): number => 1 + Math.floor(m.heat);

export function shotStyle(ship: Ship, m: Multiplier): ShotStyle {
  const cfg = CONFIG.multiplier;
  const speed = speedOf(ship);
  const slip =
    speed > 0 ? Math.abs(wrapAngle(ship.heading - Math.atan2(ship.vel.y, ship.vel.x))) : 0;
  return {
    drift: speed >= SHIP_TOP_SPEED * cfg.driftSpeed && slip >= cfg.driftAngle,
    fast: m.momentum >= 1,
  };
}

/** Fills momentum at top speed and drains it when slow; a Burst holds it either way. */
export function stepMomentum(m: Multiplier, ship: Ship, dt: number): void {
  const cfg = CONFIG.multiplier;
  if (isBursting(ship)) return;
  const speed = speedOf(ship) / SHIP_TOP_SPEED;
  if (speed >= cfg.fastSpeed) m.momentum = Math.min(1, m.momentum + dt / cfg.momentumFill);
  else if (speed < cfg.slowSpeed) m.momentum = Math.max(0, m.momentum - dt / cfg.momentumDrain);
}

/** Burns heat off while a Wave is live. */
export function drainHeat(m: Multiplier, dt: number): void {
  const { drain, drainPerHeat } = CONFIG.multiplier;
  m.heat = Math.max(0, m.heat - (drain + drainPerHeat * m.heat) * dt);
}

export interface KillCredit {
  tags: StyleTag[];
  /** Kills in the chain so far, this one included. */
  chain: number;
  heat: number;
}

/** Heats the Multiplier for a kill the player made with a shot fired in `style`. */
export function creditKill(m: Multiplier, style: ShotStyle, time: number): KillCredit {
  const cfg = CONFIG.multiplier;
  m.chain = time - m.lastKill <= cfg.chainWindow ? m.chain + 1 : 1;
  m.lastKill = time;
  const tags: StyleTag[] = [];
  let heat = cfg.killHeat;
  if (style.drift) {
    tags.push('drift');
    heat += cfg.driftHeat;
  }
  if (style.fast) {
    tags.push('speed');
    heat += cfg.speedHeat;
  }
  if (m.chain > 1) {
    tags.push('chain');
    heat += cfg.chainHeat * Math.min(m.chain - 1, cfg.chainLinks);
  }
  m.heat += heat;
  return { tags, chain: m.chain, heat };
}
