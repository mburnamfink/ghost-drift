import { describe, expect, it } from 'vitest';
import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { Rng } from '../core/rng';
import { NO_CONTROLS } from './controls';
import { createTank } from './hunters';
import { type KillCredit, multiplierValue, stepMomentum } from './multiplier';
import { createShip } from './ship';
import { createShot } from './shots';
import { terrainFromRows } from './terrain';
import { type World, createWorld, stepWorld } from './world';

const DT = 1 / CONFIG.sim.stepHz;
const BASE = CONFIG.waves.killScore;
const cfg = CONFIG.multiplier;

function liveWorld(): World {
  const world = createWorld(1, terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64))));
  world.wave = 1;
  world.lull = 0;
  world.ship.heading = 0;
  world.ship.invulnerableTime = 999;
  return world;
}

/** Puts a quiet Tank `distance` from the Ship along `angle`. */
function tankAt(world: World, distance: number, angle = 0, id = 300) {
  const { x, y } = world.ship.pos;
  const tank = createTank(
    id,
    'chaser',
    { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance },
    new Rng(id),
  );
  tank.fireCooldown = 99;
  world.hunters.push(tank);
  return tank;
}

function run(world: World, seconds: number, controls = NO_CONTROLS) {
  for (let t = 0; t < seconds && world.hunters.length > 0; t += DT) stepWorld(world, controls, DT);
}

const kills = (world: World) =>
  world.events.flatMap((e) => (e.type === 'hunterDestroyed' ? [e] : []));
const credits = (world: World): (KillCredit | null)[] => kills(world).map((k) => k.credit);

/** Travelling east at most of top speed, with the nose swung `degrees` off the line of travel. */
function drifting(world: World, degrees: number, speed = SHIP_TOP_SPEED * 0.9) {
  world.ship.vel = { x: speed, y: 0 };
  world.ship.heading = (degrees * Math.PI) / 180;
}

describe('Multiplier heat', () => {
  it('heats a little for any kill, scoring it at the Multiplier before it', () => {
    const world = liveWorld();
    world.multiplier.heat = 2.5;
    tankAt(world, 40);
    run(world, 2, { ...NO_CONTROLS, fire: true });
    const [kill] = kills(world);
    expect(kill!.multiplier).toBe(3);
    expect(world.score).toBe(BASE * 3);
    expect(kill!.credit).toEqual({ tags: [], chain: 1, heat: cfg.killHeat });
  });

  it('heats for DRIFT when the shot left with the nose well off the line of travel, at speed', () => {
    const world = liveWorld();
    drifting(world, -50);
    tankAt(world, 40, world.ship.heading);
    run(world, 2, { ...NO_CONTROLS, slide: true, fire: true });
    expect(credits(world)[0]!.tags).toContain('drift');
  });

  it('gives nothing for tapping slide with the nose still on the line of travel', () => {
    const world = liveWorld();
    drifting(world, 0);
    tankAt(world, 40);
    run(world, 2, { ...NO_CONTROLS, slide: true, fire: true });
    expect(credits(world)[0]!.tags).not.toContain('drift');
  });

  it('gives nothing for spinning the nose round while sliding slowly', () => {
    const world = liveWorld();
    drifting(world, -50, SHIP_TOP_SPEED * cfg.driftSpeed * 0.6);
    tankAt(world, 40, world.ship.heading);
    run(world, 2, { ...NO_CONTROLS, slide: true, fire: true });
    expect(credits(world)[0]!.tags).not.toContain('drift');
  });

  it('judges a shot by how it was fired, not by a slide started before it lands', () => {
    const world = liveWorld();
    drifting(world, 0);
    tankAt(world, 100);
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, 2, { ...NO_CONTROLS, slide: true, steer: -1 });
    expect(world.ship.sliding).toBe(true);
    expect(credits(world)[0]!.tags).not.toContain('drift');
  });

  it('heats for SPEED once top speed has been held long enough', () => {
    const ship = createShip({ x: 0, y: 0 }, 0);
    const world = liveWorld();
    const m = world.multiplier;
    ship.vel = { x: SHIP_TOP_SPEED, y: 0 };
    for (let t = 0; t < cfg.momentumFill * 0.9; t += DT) stepMomentum(m, ship, DT);
    expect(m.momentum).toBeLessThan(1);
    for (let t = 0; t < cfg.momentumFill * 0.2; t += DT) stepMomentum(m, ship, DT);
    expect(m.momentum).toBe(1);
    tankAt(world, 40);
    run(world, 2, { ...NO_CONTROLS, fire: true });
    expect(credits(world)[0]!.tags).toContain('speed');
  });

  it('loses its momentum when the Ship slows or is hit', () => {
    const ship = createShip({ x: 0, y: 0 }, 0);
    const world = liveWorld();
    world.multiplier.momentum = 1;
    stepMomentum(world.multiplier, ship, cfg.momentumDrain);
    expect(world.multiplier.momentum).toBe(0);

    world.multiplier.momentum = 1;
    world.ship.invulnerableTime = 0;
    world.shells.push(createShot(world.ship.pos, 0, 0, 1));
    stepWorld(world, NO_CONTROLS, DT);
    expect(world.multiplier.momentum).toBe(0);
  });

  it('chains kills made close together, a Shotgun blast through a pack included', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    [8, 11, 14].forEach((d, i) => tankAt(world, d, 0.1 * (i - 1), 300 + i));
    run(world, 1, { ...NO_CONTROLS, fire: true });
    expect(credits(world).map((c) => c!.chain)).toEqual([1, 2, 3]);
    expect(credits(world)[2]!.tags).toContain('chain');
    expect(world.multiplier.heat).toBeCloseTo(3 * cfg.killHeat + 3 * cfg.chainHeat, 1);
  });

  it('scores Artillery friendly fire without heating or chaining', () => {
    const world = liveWorld();
    world.multiplier.heat = 4.5;
    const tank = tankAt(world, 60);
    world.impacts.push({ from: tank.pos, pos: { ...tank.pos }, time: DT / 2, flight: 1 });
    stepWorld(world, NO_CONTROLS, DT);
    expect(credits(world)).toEqual([null]);
    expect(world.score).toBe(BASE * 5);
    expect(world.multiplier.heat).toBeLessThan(4.5);
    expect(world.multiplier.chain).toBe(0);
  });

  it('burns off faster the hotter it runs, and holds between Waves', () => {
    const lost = (heat: number, lull: number) => {
      const world = liveWorld();
      world.lull = lull;
      tankAt(world, 110);
      world.multiplier.heat = heat;
      for (let t = 0; t < 1; t += DT) stepWorld(world, NO_CONTROLS, DT);
      return heat - world.multiplier.heat;
    };
    expect(lost(18, 0)).toBeGreaterThan(lost(3, 0) * 2);
    expect(lost(10, 99)).toBe(0);
  });

  it('has no cap', () => {
    const world = liveWorld();
    world.multiplier.heat = 40.5;
    drifting(world, -50);
    tankAt(world, 40, world.ship.heading);
    run(world, 2, { ...NO_CONTROLS, slide: true, fire: true });
    expect(multiplierValue(world.multiplier)).toBeGreaterThan(41);
  });
});
