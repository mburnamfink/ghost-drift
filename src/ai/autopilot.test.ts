import { describe, expect, it } from 'vitest';
import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { speedOf } from '../sim/ship';
import { createWorld, stepWorld } from '../sim/world';
import { Autopilot } from './autopilot';

const DT = 1 / CONFIG.sim.stepHz;

describe('Autopilot', () => {
  it('keeps moving, kills Hunters, and lands kills while Powersliding', () => {
    const world = createWorld(2, undefined, 1, 'grid');
    const autopilot = new Autopilot();
    autopilot.reset(world);
    let kills = 0;
    let slideKills = 0;
    let speed = 0;
    let steps = 0;
    for (let t = 0; t < 40 && !world.over; t += DT, steps++) {
      stepWorld(world, autopilot.controls(world, DT), DT);
      speed += speedOf(world.ship);
      for (const e of world.events) {
        if (e.type !== 'hunterDestroyed') continue;
        kills++;
        if (world.ship.sliding) slideKills++;
      }
      world.events.length = 0;
    }
    expect(kills).toBeGreaterThanOrEqual(10);
    expect(slideKills).toBeGreaterThan(0);
    expect(speed / steps).toBeGreaterThan(SHIP_TOP_SPEED * 0.5);
  });
});
