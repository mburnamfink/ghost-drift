import { CONFIG } from '../config';
import { type Vec2, clamp, distance, wrapAngle } from '../core/vec2';
import { type Controls, NO_CONTROLS } from '../sim/controls';
import type { CityLayoutName } from '../sim/city';
import { FlowField } from '../sim/flowfield';
import type { Hunter, HunterKind } from '../sim/hunters';
import { speedOf } from '../sim/ship';
import type { EnemyDensity } from '../sim/waves';
import type { Weapon } from '../sim/weapons';
import { type World, createWorld } from '../sim/world';
import { avoidBlocks } from './autopilot';

/**
 * Where the Ship's nose should point: a compass bearing in degrees (0 east, 90 south, as the
 * overhead map shows it), a cell to head for, straight at the nearest Hunter, or along the
 * streets toward it.
 */
export type Aim = number | { x: number; y: number } | 'nearest' | 'hunt';

/** One beat of the showcase. Anything left out is off: no thrust, no fire, no slide. */
export interface Move {
  /** Seconds this beat lasts. */
  for: number;
  aim?: Aim;
  /** Only Hunters of this kind count for `nearest` and `hunt`. */
  target?: HunterKind;
  thrust?: number;
  slide?: boolean;
  fire?: boolean;
  /** Bursts on the first step of the beat. */
  burst?: boolean;
  /** Switches to this gun on the first step of the beat if it is not already in hand. */
  weapon?: Weapon;
}

export interface Showcase {
  seed: number;
  layout: CityLayoutName;
  wave: number;
  density: EnemyDensity;
  moves: readonly Move[];
}

/**
 * The attract loop's run: a fixed city and Wave, and a script of what the Ship does beat by beat.
 * The simulation is seeded and the script reads only the World, so every Hunter reacts the same
 * way every time it plays.
 */
export const SHOWCASE: Showcase = {
  seed: 4,
  layout: 'showcaseHub',
  wave: 7,
  density: { tanks: 0.5 },
  // Drafted by searching beat sequences against the simulation for kills, Powerslide and Shotgun
  // kills and no hits. Any change to the city, Hunters or Ship handling changes how it plays out: watch it again.
  moves: [
    { for: 1.6, thrust: 1, aim: 22, fire: true },
    { for: 1.2, slide: true, aim: 'nearest', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', weapon: 'shotgun', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', target: 'juggernaut', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', fire: true },
    { for: 2.4, thrust: 1, aim: 'hunt', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', weapon: 'cannon', fire: true },
    { for: 0.6, thrust: 1, burst: true, aim: 'nearest', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', weapon: 'shotgun', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', weapon: 'cannon', fire: true },
    { for: 0.6, thrust: 1, burst: true, aim: 'nearest', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', fire: true },
    { for: 2.4, thrust: 1, aim: 'hunt', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', weapon: 'shotgun', fire: true },
    { for: 1.2, thrust: 1, aim: 300, weapon: 'cannon', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', weapon: 'shotgun', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', weapon: 'cannon', fire: true },
    { for: 1.2, thrust: 1, aim: 'hunt', weapon: 'shotgun', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', weapon: 'cannon', fire: true },
    { for: 0.6, thrust: 1, burst: true, aim: 'nearest', fire: true },
    { for: 2.4, slide: true, aim: 'nearest', fire: true },
    { for: 0.6, thrust: 1, burst: true, aim: 'nearest', fire: true },
    { for: 1.2, slide: true, aim: 'nearest', weapon: 'shotgun', fire: true },
    // Coast while WAVE CLEARED shows.
    { for: 1.6, thrust: 0.6 },
  ],
};

export const showcaseDuration = (s: Showcase = SHOWCASE): number =>
  s.moves.reduce((sum, m) => sum + m.for, 0);

export const createShowcaseWorld = (s: Showcase = SHOWCASE): World =>
  createWorld(s.seed, undefined, s.wave, s.layout, s.density);

/**
 * Beats usually last whole numbers of simulation steps, so a step can land exactly on a boundary,
 * where rounding in the running sums would decide which beat it belongs to. Splitting or merging
 * beats changes that rounding; this slack makes the answer the same either way.
 */
const BOUNDARY_SLACK = 1e-6;

/** Seconds between rebuilds of the route toward a hunted Hunter. */
const ROUTE_REFRESH = 0.3;

/** Flies a Showcase's script. Call `controls` once per simulation step, before stepping. */
export class ShowcasePilot {
  private beat = -1;
  private route: FlowField | null = null;
  private routeTerrain: World['terrain'] | null = null;
  private routeBuilt = -Infinity;

  constructor(private readonly showcase: Showcase = SHOWCASE) {}

  controls(world: World): Controls {
    const { moves } = this.showcase;
    let index = 0;
    for (let start = 0; index < moves.length - 1; index++) {
      start += moves[index]!.for;
      if (world.time < start - BOUNDARY_SLACK) break;
    }
    const move = moves[index]!;
    const first = index !== this.beat;
    this.beat = index;

    const { ship } = world;
    const c: Controls = {
      ...NO_CONTROLS,
      thrust: move.thrust ?? 0,
      slide: move.slide ?? false,
      fire: move.fire ?? false,
      burst: first && (move.burst ?? false),
      swap: first && move.weapon !== undefined && move.weapon !== ship.weapon,
    };
    let bearing = this.bearing(world, move);
    if (bearing === null) return c;
    // A slide's line of travel is locked, so only steering under thrust can avoid walls.
    if (!c.slide && c.thrust > 0) bearing = avoidBlocks(world, bearing, speedOf(ship));
    c.steer = clamp(wrapAngle(bearing - ship.heading) * (c.slide ? 3 : 2.5), -1, 1);
    return c;
  }

  private bearing(world: World, move: Move): number | null {
    const { ship } = world;
    const { aim } = move;
    if (aim === undefined) return null;
    if (typeof aim === 'number') return (aim * Math.PI) / 180;
    let goal: Vec2 | null;
    if (aim === 'nearest' || aim === 'hunt') {
      goal = nearest(world, move.target)?.pos ?? null;
      if (goal && aim === 'hunt') return this.routeTo(world, goal);
    } else {
      const size = CONFIG.arena.cellSize;
      goal = { x: (aim.x + 0.5) * size, y: (aim.y + 0.5) * size };
    }
    return goal ? Math.atan2(goal.y - ship.pos.y, goal.x - ship.pos.x) : null;
  }

  /** Heading toward `goal`: straight at it when in sight, else along a flow field. */
  private routeTo(world: World, goal: Vec2): number {
    const { ship, terrain } = world;
    const straight = Math.atan2(goal.y - ship.pos.y, goal.x - ship.pos.x);
    if (terrain.hasLineOfSight(ship.pos, goal)) return straight;
    if (this.routeTerrain !== terrain) {
      this.route = new FlowField(terrain);
      this.routeTerrain = terrain;
      this.routeBuilt = -Infinity;
    }
    if (world.time - this.routeBuilt >= ROUTE_REFRESH) {
      this.route!.build(goal);
      this.routeBuilt = world.time;
    }
    const dir = this.route!.directionFrom(ship.pos);
    return dir ? Math.atan2(dir.y, dir.x) : straight;
  }
}

function nearest(world: World, kind: HunterKind | undefined): Hunter | null {
  let best: Hunter | null = null;
  for (const h of world.hunters) {
    if (kind && h.kind !== kind) continue;
    if (!best || distance(h.pos, world.ship.pos) < distance(best.pos, world.ship.pos)) best = h;
  }
  return best;
}
