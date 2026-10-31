import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { NO_CONTROLS } from './controls';
import { type Hunter, createTank } from './hunters';
import { terrainFromRows } from './terrain';
import { type World, createWorld, stepWorld } from './world';

const DT = 1 / CONFIG.sim.stepHz;

function liveWorld(rows = Array.from({ length: 64 }, () => '.'.repeat(64))): World {
  const world = createWorld(1, terrainFromRows(rows));
  world.wave = 1;
  world.lull = 0;
  world.ship.heading = 0;
  return world;
}

function placeTank(world: World, id: number, dx: number, dy: number): Hunter {
  const { x, y } = world.ship.pos;
  const tank = createTank(id, 'chaser', { x: x + dx, y: y + dy }, new Rng(id));
  tank.fireCooldown = 99;
  world.hunters.push(tank);
  return tank;
}

function run(world: World, seconds: number, controls = NO_CONTROLS) {
  for (let t = 0; t < seconds; t += DT) stepWorld(world, controls, DT);
}

describe('Weapon swap', () => {
  it('starts on the Cannon and cycles on each press', () => {
    const world = liveWorld();
    expect(world.ship.weapon).toBe('cannon');
    stepWorld(world, { ...NO_CONTROLS, swap: true }, DT);
    expect(world.ship.weapon).toBe('shotgun');
    stepWorld(world, { ...NO_CONTROLS, swap: true }, DT);
    expect(world.ship.weapon).toBe('cannon');
  });
});

describe('Shotgun', () => {
  it('destroys every Hunter in its arc and range, and none behind or beyond', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    const range = CONFIG.shotgun.range;
    const inArc = [placeTank(world, 1, range * 0.6, 0), placeTank(world, 2, range * 0.5, 5)];
    const spared = [placeTank(world, 3, -10, 0), placeTank(world, 4, range + 10, 0)];
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.shotgun.duration);
    for (const h of inArc) expect(world.hunters).not.toContain(h);
    for (const h of spared) expect(world.hunters).toContain(h);
  });

  it('sweeps a shorter reach off each side, hitting each Hunter once', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    const side = CONFIG.shotgun.sideRange;
    const near = [placeTank(world, 1, 0, side * 0.7), placeTank(world, 2, 0, -side * 0.7)];
    const far = [placeTank(world, 3, 0, side + 6), placeTank(world, 4, 0, -side - 6)];
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.shotgun.duration);
    for (const h of near) expect(world.hunters).not.toContain(h);
    for (const h of far) expect(world.hunters).toContain(h);
  });

  it('leaves no gap between the front and the sides', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    const d = 10 / Math.SQRT2;
    const diagonal = [placeTank(world, 1, d, d), placeTank(world, 2, d, -d)];
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.shotgun.duration);
    for (const h of diagonal) expect(world.hunters).not.toContain(h);
  });

  it('holds at full range so a Hunter driven into the arc after the sweep is still caught', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    world.ship.vel = { x: 40, y: 0 };
    // Beyond the arc's reach until the Ship has carried it well forward.
    const ahead = placeTank(world, 1, CONFIG.shotgun.range + 14, 0);
    stepWorld(world, { ...NO_CONTROLS, thrust: 1, fire: true }, DT);
    run(world, CONFIG.shotgun.duration, { ...NO_CONTROLS, thrust: 1 });
    expect(world.hunters).toContain(ahead);
    run(world, CONFIG.shotgun.hold, { ...NO_CONTROLS, thrust: 1 });
    expect(world.hunters).not.toContain(ahead);
  });

  it('aims along the nose, not the line of travel', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    // Sliding east with the nose turned north.
    world.ship.vel = { x: 35, y: 0 };
    world.ship.heading = -Math.PI / 2;
    const nose = placeTank(world, 1, 0, -CONFIG.shotgun.range * 0.5);
    const travel = placeTank(world, 2, CONFIG.shotgun.range + 6, 0);
    const slide = { ...NO_CONTROLS, slide: true };
    stepWorld(world, { ...slide, fire: true }, DT);
    run(world, CONFIG.shotgun.duration, slide);
    expect(world.hunters).not.toContain(nose);
    expect(world.hunters).toContain(travel);
  });

  it('keeps the line it was fired on while the Ship veers away', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    world.ship.vel = { x: 40, y: 0 };
    // Out of reach until the arc has drifted on along the line it was fired down.
    const ahead = placeTank(world, 1, CONFIG.shotgun.range + 10, 0);
    stepWorld(world, { ...NO_CONTROLS, thrust: 1, fire: true }, DT);
    const headings = world.pulses.map((p) => p.heading);
    const veer = { ...NO_CONTROLS, thrust: 1, steer: 1 };
    run(world, CONFIG.shotgun.duration, veer);
    expect(world.pulses.map((p) => p.heading)).toEqual(headings);
    run(world, CONFIG.shotgun.hold, veer);
    expect(world.hunters).not.toContain(ahead);
    expect(Math.cos(world.ship.heading)).toBeLessThan(0.5);
  });

  it('is stopped by Blocks', () => {
    const rows = Array.from({ length: 64 }, () => '.'.repeat(64));
    // The Ship spawns at the center (128, 128); column 34 is 8 units ahead.
    rows[32] = '.'.repeat(34) + '#' + '.'.repeat(29);
    const world = liveWorld(rows);
    world.ship.weapon = 'shotgun';
    world.ship.pos = { x: 130, y: 130 };
    const hidden = placeTank(world, 1, 12, 0);
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.shotgun.duration);
    expect(world.hunters).toContain(hidden);
  });
});

describe('Cannon', () => {
  it('bends a near miss onto a Hunter', () => {
    const world = liveWorld();
    // A Bolt flying straight passes this Tank's edge by 3 units at 60 out.
    const target = placeTank(world, 1, 60, CONFIG.tank.radius + CONFIG.cannon.radius + 3);
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.cannon.life);
    expect(world.hunters).not.toContain(target);
  });

  it('leaves a Hunter well off its line alone', () => {
    const world = liveWorld();
    const target = placeTank(world, 1, 30, 20);
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.cannon.life);
    expect(world.hunters).toContain(target);
  });
});
