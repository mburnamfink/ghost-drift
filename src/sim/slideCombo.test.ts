import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { NO_CONTROLS } from './controls';
import { createTank } from './hunters';
import { terrainFromRows } from './terrain';
import { type World, createWorld, stepWorld } from './world';

const DT = 1 / CONFIG.sim.stepHz;

function liveWorld(): World {
  const world = createWorld(1, terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64))));
  world.wave = 1;
  world.lull = 0;
  return world;
}

describe('Slide combo', () => {
  it('multiplies each kill in one Powerslide by its place in the combo, then reports the total', () => {
    const world = liveWorld();
    world.ship.heading = 0;
    world.ship.vel = { x: 30, y: 0 };
    const { x, y } = world.ship.pos;
    // Beyond engagement range, so they drive straight down the firing line instead of circling.
    world.hunters.push(
      ...[55, 70, 85].map((dx, i) => {
        const tank = createTank(300 + i, 'chaser', { x: x + dx, y }, new Rng(i));
        tank.fireCooldown = 99;
        return tank;
      }),
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
