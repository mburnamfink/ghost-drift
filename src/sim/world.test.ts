import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { NO_CONTROLS } from './controls';
import { createHunter } from './hunter';
import { Rng } from '../core/rng';
import { terrainFromRows } from './terrain';
import { createWorld, stepWorld, type World } from './world';
import { waveSize } from './waves';

const DT = 1 / CONFIG.sim.stepHz;
const openArena = () => terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64)));

function runUntil(
  world: World,
  done: (w: World) => boolean,
  maxSeconds = 30,
  controls = NO_CONTROLS,
) {
  for (let t = 0; t < maxSeconds && !done(world); t += DT) stepWorld(world, controls, DT);
}

describe('Waves', () => {
  it('spawns the first Wave after the opening lull, away from the Ship', () => {
    const world = createWorld(1, openArena());
    runUntil(world, (w) => w.wave === 1);
    expect(world.hunters).toHaveLength(waveSize(1));
    for (const h of world.hunters) {
      expect(
        Math.hypot(h.pos.x - world.ship.pos.x, h.pos.y - world.ship.pos.y),
      ).toBeGreaterThanOrEqual(CONFIG.waves.minSpawnDistance);
    }
    expect(world.hunters.some((h) => h.role === 'cutter')).toBe(true);
    expect(world.hunters.some((h) => h.role === 'chaser')).toBe(true);
  });

  it('restores Charges on clearing a Wave and then sends a larger one', () => {
    const world = createWorld(2, openArena());
    runUntil(world, (w) => w.wave === 1);
    world.ship.charges = 0;
    world.hunters.length = 0;
    stepWorld(world, NO_CONTROLS, DT);
    expect(world.events.some((e) => e.type === 'waveCleared')).toBe(true);
    expect(world.ship.charges).toBe(CONFIG.ship.burstCharges);
    runUntil(world, (w) => w.wave === 2);
    expect(world.hunters).toHaveLength(waveSize(2));
  });
});

describe('Combat', () => {
  it('destroys a Hunter hit by a Bolt and scores it', () => {
    const world = createWorld(3, openArena());
    world.wave = 1;
    world.lull = 0;
    const { x, y } = world.ship.pos;
    world.ship.heading = 0;
    world.hunters.push(createHunter(99, 'chaser', { x: x + 20, y }, new Rng(1)));
    world.hunters[0]!.fireCooldown = 99;
    runUntil(world, (w) => w.hunters.length === 0, 1, { ...NO_CONTROLS, fire: true });
    expect(world.hunters).toHaveLength(0);
    expect(world.score).toBe(CONFIG.waves.killScore);
  });

  it('kills a Ship that sits still among Hunters', () => {
    const world = createWorld(4, openArena());
    runUntil(world, (w) => w.over, 60);
    expect(world.over).toBe(true);
    expect(world.events.some((e) => e.type === 'shipDestroyed')).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = createWorld(5);
    const b = createWorld(5);
    const controls = { ...NO_CONTROLS, thrust: 1, steer: 0.3, fire: true };
    for (let i = 0; i < 1200; i++) {
      stepWorld(a, controls, DT);
      stepWorld(b, controls, DT);
    }
    expect(a.ship.pos).toEqual(b.ship.pos);
    expect(a.hunters.map((h) => h.pos)).toEqual(b.hunters.map((h) => h.pos));
  });
});
