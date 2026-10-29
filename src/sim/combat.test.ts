import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { NO_CONTROLS } from './controls';
import { type Tank, createTank } from './hunters';
import { terrainFromRows } from './terrain';
import { type World, createWorld, stepWorld } from './world';

const DT = 1 / CONFIG.sim.stepHz;

function liveWorld(): World {
  const world = createWorld(1, terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64))));
  world.wave = 1;
  world.lull = 0;
  return world;
}

function run(world: World, seconds: number, controls = NO_CONTROLS) {
  for (let t = 0; t < seconds; t += DT) stepWorld(world, controls, DT);
}

const ringOfTanks = (world: World, n: number, radius: number): Tank[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const t = createTank(
      100 + i,
      {
        x: world.ship.pos.x + Math.cos(a) * radius,
        y: world.ship.pos.y + Math.sin(a) * radius,
      },
      new Rng(i),
    );
    world.hunters.push(t);
    return t;
  });

describe('Volleys', () => {
  it('has every Tank with a shot wind up together, then fire together', () => {
    const world = liveWorld();
    world.volley.timer = DT / 2;
    const tanks = ringOfTanks(world, 4, 30);
    stepWorld(world, NO_CONTROLS, DT);
    expect(tanks.every((t) => t.loading)).toBe(true);
    expect(world.shells).toHaveLength(0);
    run(world, CONFIG.volley.windup);
    expect(world.shells).toHaveLength(4);
    expect(tanks.every((t) => !t.loading)).toBe(true);
  });

  it('aims each Shell roughly at the Ship, not all at one point', () => {
    const world = liveWorld();
    world.volley.timer = DT / 2;
    ringOfTanks(world, 8, 30);
    run(world, CONFIG.volley.windup + DT);
    const { pos } = world.ship;
    const misses = world.shells.map((s) => {
      // Closest approach of the Shell's line of flight to the Ship.
      const speed = Math.hypot(s.vel.x, s.vel.y);
      return Math.abs((pos.x - s.pos.x) * s.vel.y - (pos.y - s.pos.y) * s.vel.x) / speed;
    });
    for (const m of misses) expect(m).toBeLessThanOrEqual(CONFIG.volley.aimSpread + 0.01);
    expect(new Set(misses.map((m) => m.toFixed(2))).size).toBeGreaterThan(1);
  });

  it('holds fire between volleys', () => {
    const world = liveWorld();
    world.volley.timer = 2;
    ringOfTanks(world, 4, 30);
    run(world, 1.5);
    expect(world.shells).toHaveLength(0);
  });
});

describe('Slide combo', () => {
  it('multiplies each kill in one Powerslide by its place in the combo, then reports the total', () => {
    const world = liveWorld();
    world.volley.timer = 99;
    world.ship.heading = 0;
    world.ship.vel = { x: 30, y: 0 };
    const { x, y } = world.ship.pos;
    // Beyond engagement range, so they drive straight down the firing line instead of circling.
    world.hunters.push(
      ...[55, 70, 85].map((dx, i) => createTank(300 + i, { x: x + dx, y }, new Rng(i))),
    );
    const sliding = { ...NO_CONTROLS, slide: true, fire: true };
    for (let t = 0; t < 3 && world.hunters.length > 0; t += DT) stepWorld(world, sliding, DT);
    const kills = world.events.filter((e) => e.type === 'hunterDestroyed');
    expect(kills.map((e) => (e.type === 'hunterDestroyed' ? e.slideMultiplier : 0))).toEqual([
      1, 2, 3,
    ]);
    const base = CONFIG.waves.killScore;
    expect(world.score).toBe(base * (1 + 2 + 3));
    stepWorld(world, NO_CONTROLS, DT);
    expect(world.events).toContainEqual({ type: 'slideComboEnded', kills: 3, points: base * 6 });
  });
});
