import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { FlowField } from '../flowfield';
import type { Ship } from '../ship';
import type { Terrain } from '../terrain';

export type HunterKind = 'tank' | 'berserker' | 'sniper' | 'artillery' | 'juggernaut';
export type TankRole = 'chaser' | 'cutter';

interface HunterBase {
  id: number;
  pos: Vec2;
  vel: Vec2;
  /** Direction the hull faces; follows travel. */
  heading: number;
  /** Direction the gun faces. */
  aim: number;
  fireCooldown: number;
}

export interface Tank extends HunterBase {
  kind: 'tank';
  role: TankRole;
  /** 1 to circle the Ship counterclockwise, -1 clockwise. */
  orbitDir: 1 | -1;
}

export type BerserkerPhase = 'hunt' | 'windup' | 'lunge';

export interface Berserker extends HunterBase {
  kind: 'berserker';
  phase: BerserkerPhase;
  /** Seconds left in the current wind-up or lunge. */
  phaseTime: number;
  /** Fixed at the end of the wind-up: straight at where the Ship was then. */
  lungeDir: Vec2;
}

/** Sniper or Artillery: holds a Perch at range rather than closing in. */
interface Percher extends HunterBase {
  perch: Vec2 | null;
  /** Route to `perch`, rebuilt whenever the Perch changes. */
  perchField: FlowField;
  /** Seconds until the Perch is reconsidered. */
  repickTime: number;
}

export interface SniperCharge {
  /** Seconds since the charge began. */
  time: number;
  /** Where the shot will go: the Ship's projected position, frozen once locked. */
  target: Vec2;
  locked: boolean;
}

export interface Sniper extends Percher {
  kind: 'sniper';
  charge: SniperCharge | null;
}

export interface Artillery extends Percher {
  kind: 'artillery';
}

/** The armored mini-boss: takes many hits, and fires Sprays after a wind-up. */
export interface Juggernaut extends HunterBase {
  kind: 'juggernaut';
  /** Damage it can still take. */
  hp: number;
  /** Seconds left of the Spray wind-up; 0 when not winding up. */
  windup: number;
  orbitDir: 1 | -1;
}

export type Hunter = Tank | Berserker | Sniper | Artillery | Juggernaut;

/** Shared per-step view of the world that every Hunter decides by. */
export interface HuntContext {
  terrain: Terrain;
  ship: Ship;
  chaseField: FlowField;
  cutField: FlowField;
  cutTarget: Vec2;
  hunters: readonly Hunter[];
  tankSpeed: number;
  rng: Rng;
}

/** What a Hunter wants to do this step beyond moving; the World carries it out. */
export type HunterAction =
  | { type: 'shell'; angle: number }
  | { type: 'snipe'; dir: Vec2 }
  | { type: 'salvo'; targets: Vec2[] }
  | { type: 'spray'; angles: number[] };
