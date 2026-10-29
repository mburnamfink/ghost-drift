import { describe, expect, it } from 'vitest';
import { CONFIG, SHIP_TOP_SPEED } from '../../config';
import { Rng } from '../../core/rng';
import { NO_CONTROLS } from '../controls';
import { FlowField } from '../flowfield';
import { createShip } from '../ship';
import { terrainFromRows } from '../terrain';
import { waveMix } from '../waves';
import { type World, createWorld, stepWorld } from '../world';
import { createArtillery, createBerserker, createSniper, createTank, stepHunter } from '.';
import type { HuntContext, Sniper } from './types';

const DT = 1 / CONFIG.sim.stepHz;
const openRows = () => Array.from({ length: 64 }, () => '.'.repeat(64));

/** A World mid-Wave on open ground, with no Hunters until the test adds them. */
function liveWorld(rows = openRows()): World {
  const world = createWorld(1, terrainFromRows(rows));
  world.wave = 1;
  world.lull = 0;
  return world;
}

/** Sets the Ship cruising straight along +x at top speed. */
function cruise(world: World) {
  world.ship.heading = 0;
  world.ship.vel = { x: SHIP_TOP_SPEED, y: 0 };
}

const THRUST = { ...NO_CONTROLS, thrust: 1 };

describe('Sniper', () => {
  function sniperAbove(world: World): Sniper {
    const s = createSniper(
      50,
      { x: world.ship.pos.x + 30, y: world.ship.pos.y - 80 },
      world.terrain,
      new Rng(1),
    );
    s.fireCooldown = 0;
    world.hunters.push(s);
    return s;
  }

  it('hits a Ship that holds a straight line through the lock', () => {
    const world = liveWorld();
    world.ship.pos = { x: 60, y: 128 };
    cruise(world);
    sniperAbove(world);
    for (let t = 0; t < 2 && !world.events.some((e) => e.type === 'sniperFired'); t += DT)
      stepWorld(world, THRUST, DT);
    expect(world.events.some((e) => e.type === 'sniperFired')).toBe(true);
    expect(world.ship.hull).toBe(CONFIG.ship.hull - 1);
  });

  it('misses a Ship that turns after a human reaction time once the laser locks', () => {
    const world = liveWorld();
    world.ship.pos = { x: 60, y: 128 };
    cruise(world);
    const s = sniperAbove(world);
    for (let t = 0; t < 2 && !s.charge?.locked; t += DT) stepWorld(world, THRUST, DT);
    expect(s.charge?.locked).toBe(true);
    const reaction = 0.25;
    for (let t = 0; t < reaction; t += DT) stepWorld(world, THRUST, DT);
    for (let t = 0; t < 1 && !world.events.some((e) => e.type === 'sniperFired'); t += DT) {
      stepWorld(world, { ...THRUST, steer: 1 }, DT);
    }
    expect(world.events.some((e) => e.type === 'sniperFired')).toBe(true);
    expect(world.ship.hull).toBe(CONFIG.ship.hull);
  });

  it('cancels its charge when it loses sight of the Ship', () => {
    const rows = openRows();
    rows[20] = '#'.repeat(64);
    const world = liveWorld(rows);
    world.ship.pos = { x: 128, y: 20 * 4 + 40 };
    const s = createSniper(50, { x: 128, y: 20 * 4 - 30 }, world.terrain, new Rng(1));
    s.charge = { time: 0, target: { ...world.ship.pos }, locked: false };
    world.hunters.push(s);
    stepWorld(world, NO_CONTROLS, DT);
    expect(s.charge).toBeNull();
  });
});

describe('Artillery', () => {
  function context(world: World): HuntContext {
    world.chaseField.build(world.ship.pos);
    return {
      terrain: world.terrain,
      ship: world.ship,
      chaseField: world.chaseField,
      cutField: new FlowField(world.terrain),
      cutTarget: world.ship.pos,
      hunters: world.hunters,
      tankSpeed: 15,
      rng: new Rng(2),
    };
  }

  it('lands a Salvo along the Ship’s projected path when it is under open sky', () => {
    const world = liveWorld();
    cruise(world);
    const a = createArtillery(60, { x: 60, y: 60 }, world.terrain, new Rng(1));
    a.fireCooldown = 0;
    const action = stepHunter(a, context(world), DT);
    expect(action?.type).toBe('salvo');
    if (action?.type !== 'salvo') return;
    const { pos } = world.ship;
    expect(action.targets.map((p) => Math.round(p.x - pos.x))).toEqual(
      CONFIG.artillery.salvoLeads.map((t) => Math.round(SHIP_TOP_SPEED * t)),
    );
  });

  it('holds fire at a Ship beyond its maximum range', () => {
    const world = liveWorld();
    cruise(world);
    const { pos } = world.ship;
    const a = createArtillery(
      60,
      { x: pos.x - CONFIG.artillery.maxRange - 5, y: pos.y },
      world.terrain,
      new Rng(1),
    );
    a.fireCooldown = 0;
    expect(stepHunter(a, context(world), DT)).toBeNull();
  });

  it('holds fire while the Ship is near Blocks', () => {
    const rows = openRows();
    rows[33] = '.'.repeat(33) + '#' + '.'.repeat(30);
    const world = liveWorld(rows);
    const a = createArtillery(60, { x: 30, y: 30 }, world.terrain, new Rng(1));
    a.fireCooldown = 0;
    expect(stepHunter(a, context(world), DT)).toBeNull();
  });

  it('blasts the Ship and every Hunter in range, and credits the kills', () => {
    const world = liveWorld();
    const at = { x: world.ship.pos.x + 3, y: world.ship.pos.y };
    world.hunters.push(createTank(70, 'chaser', { x: at.x + 2, y: at.y }, new Rng(1)));
    world.hunters.push(createTank(71, 'chaser', { x: at.x + 60, y: at.y }, new Rng(1)));
    world.impacts.push({ from: { x: 0, y: 0 }, pos: at, time: DT / 2, flight: 2 });
    stepWorld(world, NO_CONTROLS, DT);
    expect(world.ship.hull).toBe(CONFIG.ship.hull - 1);
    expect(world.hunters.map((h) => h.id)).toEqual([71]);
    expect(world.score).toBe(CONFIG.waves.killScore);
  });
});

describe('waveMix', () => {
  it('introduces Snipers and Artillery on schedule, capped', () => {
    expect(waveMix(2)).toMatchObject({ snipers: 0, artillery: 0 });
    expect(waveMix(CONFIG.waves.sniperFromWave).snipers).toBe(1);
    expect(waveMix(CONFIG.waves.artilleryFromWave).artillery).toBe(1);
    expect(waveMix(100)).toMatchObject({
      snipers: CONFIG.waves.maxSnipers,
      artillery: CONFIG.waves.maxArtillery,
    });
  });
});

it('scores Snipers and Artillery above Tanks', () => {
  const world = liveWorld();
  const { pos } = world.ship;
  world.ship = createShip(pos, 0);
  world.hunters.push(createSniper(80, { x: pos.x + 15, y: pos.y }, world.terrain, new Rng(1)));
  for (let t = 0; t < 1 && world.hunters.length > 0; t += DT)
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
  expect(world.score).toBe(CONFIG.waves.killScore * CONFIG.sniper.scoreMultiplier);
});

describe('Tank stand-off', () => {
  it('circles a Ship it can see at stand-off range instead of closing to point blank', () => {
    const world = liveWorld();
    const { pos } = world.ship;
    const tank = createTank(90, 'chaser', { x: pos.x + 45, y: pos.y }, new Rng(1));
    tank.fireCooldown = 99;
    world.hunters.push(tank);
    const startAngle = Math.atan2(tank.pos.y - pos.y, tank.pos.x - pos.x);
    let closest = Infinity;
    for (let t = 0; t < 6; t += DT) {
      stepWorld(world, NO_CONTROLS, DT);
      closest = Math.min(closest, Math.hypot(tank.pos.x - pos.x, tank.pos.y - pos.y));
    }
    expect(closest).toBeGreaterThan(CONFIG.tank.standoff - CONFIG.tank.standoffBand);
    const endAngle = Math.atan2(tank.pos.y - pos.y, tank.pos.x - pos.x);
    expect(Math.abs(endAngle - startAngle)).toBeGreaterThan(1);
    expect(world.ship.hull).toBe(CONFIG.ship.hull);
  });
});

describe('Berserker', () => {
  function berserkerNear(world: World) {
    const { pos } = world.ship;
    const b = createBerserker(95, { x: pos.x + 18, y: pos.y }, new Rng(1));
    b.fireCooldown = 0;
    world.hunters.push(b);
    return b;
  }

  it('winds up, then lunges into a Ship that stays put', () => {
    const world = liveWorld();
    const b = berserkerNear(world);
    stepWorld(world, NO_CONTROLS, DT);
    expect(b.phase).toBe('windup');
    for (let t = 0; t < 1.2 && world.ship.hull === CONFIG.ship.hull; t += DT)
      stepWorld(world, NO_CONTROLS, DT);
    expect(world.ship.hull).toBe(CONFIG.ship.hull - 1);
  });

  it('misses a Ship that moves off the line during the wind-up', () => {
    const world = liveWorld();
    world.ship.heading = Math.PI / 2;
    world.ship.vel = { x: 0, y: SHIP_TOP_SPEED };
    const b = berserkerNear(world);
    for (let t = 0; t < CONFIG.berserker.windup + CONFIG.berserker.lungeTime; t += DT) {
      stepWorld(world, THRUST, DT);
    }
    expect(b.phase).toBe('hunt');
    expect(world.ship.hull).toBe(CONFIG.ship.hull);
  });
});

describe('waveMix from Wave 4', () => {
  it('sends a quarter fewer Tanks and more special Hunters', () => {
    const base = (w: number) => CONFIG.waves.firstCount + CONFIG.waves.countPerWave * (w - 1);
    expect(waveMix(3).tanks).toBe(base(3));
    expect(waveMix(6).tanks).toBe(Math.round(base(6) * 0.75));
    const specials = (w: number) => {
      const m = waveMix(w);
      return m.berserkers + m.snipers + m.artillery;
    };
    expect(specials(2)).toBe(1);
    expect(specials(6)).toBeGreaterThanOrEqual(6);
  });
});
