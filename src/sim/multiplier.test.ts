import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { NO_CONTROLS } from './controls';
import { createTank } from './hunters';
import { terrainFromRows } from './terrain';
import { type World, createWorld, stepWorld } from './world';

const DT = 1 / CONFIG.sim.stepHz;
const BASE = CONFIG.waves.killScore;

function liveWorld(): World {
  const world = createWorld(1, terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64))));
  world.wave = 1;
  world.lull = 0;
  world.ship.heading = 0;
  world.ship.invulnerableTime = 999;
  return world;
}

/** Puts quiet Tanks in a line straight ahead of the Ship, beyond engagement range. */
function tanksAhead(world: World, distances: number[]) {
  const { x, y } = world.ship.pos;
  world.hunters.push(
    ...distances.map((dx, i) => {
      const tank = createTank(300 + i, 'chaser', { x: x + dx, y }, new Rng(i));
      tank.fireCooldown = 99;
      return tank;
    }),
  );
}

function shootAll(world: World, slide: boolean) {
  const controls = { ...NO_CONTROLS, fire: true, slide };
  for (let t = 0; t < 3 && world.hunters.length > 0; t += DT) stepWorld(world, controls, DT);
}

const killMultipliers = (world: World) =>
  world.events.flatMap((e) => (e.type === 'hunterDestroyed' ? [e.multiplier] : []));

describe('Multiplier', () => {
  it('rises with each Powerslide kill, each kill scoring at the Multiplier before it', () => {
    const world = liveWorld();
    world.ship.vel = { x: 30, y: 0 };
    tanksAhead(world, [55, 70, 85]);
    shootAll(world, true);
    expect(killMultipliers(world)).toEqual([1, 2, 3]);
    expect(world.score).toBe(BASE * (1 + 2 + 3));
    expect(world.multiplier.value).toBe(4);
  });

  it('is kept but not raised by kills made without sliding', () => {
    const world = liveWorld();
    world.multiplier = { value: 3, timer: 1 };
    tanksAhead(world, [40]);
    shootAll(world, false);
    expect(killMultipliers(world)).toEqual([3]);
    expect(world.multiplier.value).toBe(3);
    expect(world.multiplier.timer).toBeGreaterThan(CONFIG.multiplier.timeout - 1);
  });

  it('falls back to 1 after too long without a kill', () => {
    const world = liveWorld();
    world.multiplier = { value: 5, timer: CONFIG.multiplier.timeout };
    // Keeps the Wave live, so the clock runs.
    tanksAhead(world, [110]);
    for (let t = 0; t < CONFIG.multiplier.timeout - 0.1; t += DT) stepWorld(world, NO_CONTROLS, DT);
    expect(world.multiplier.value).toBe(5);
    for (let t = 0; t < 0.2; t += DT) stepWorld(world, NO_CONTROLS, DT);
    expect(world.multiplier.value).toBe(1);
    expect(world.events).toContainEqual({ type: 'multiplierLost', value: 5 });
  });

  it('holds its clock between Waves', () => {
    const world = liveWorld();
    world.lull = 99;
    world.multiplier = { value: 4, timer: 1 };
    for (let t = 0; t < 3; t += DT) stepWorld(world, NO_CONTROLS, DT);
    expect(world.multiplier).toEqual({ value: 4, timer: 1 });
  });

  it('stops rising at its cap', () => {
    const world = liveWorld();
    world.ship.vel = { x: 30, y: 0 };
    world.multiplier = { value: CONFIG.multiplier.max, timer: 1 };
    tanksAhead(world, [55]);
    shootAll(world, true);
    expect(world.multiplier.value).toBe(CONFIG.multiplier.max);
  });
});
