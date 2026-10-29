import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { Rng } from '../../core/rng';
import { NO_CONTROLS } from '../controls';
import { terrainFromRows } from '../terrain';
import { waveMix } from '../waves';
import { type World, createWorld, stepWorld } from '../world';
import { type Juggernaut, createJuggernaut } from '.';

const DT = 1 / CONFIG.sim.stepHz;
const cfg = CONFIG.juggernaut;

function liveWorld(): World {
  const world = createWorld(1, terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64))));
  world.wave = 1;
  world.lull = 0;
  world.ship.heading = 0;
  return world;
}

/** A Juggernaut `dx` ahead of the Ship, aimed at it and not about to fire. */
function placeJuggernaut(world: World, dx: number): Juggernaut {
  const { x, y } = world.ship.pos;
  const j = createJuggernaut(7, { x: x + dx, y }, new Rng(1));
  j.aim = Math.PI;
  j.fireCooldown = 99;
  world.hunters.push(j);
  return j;
}

function run(world: World, seconds: number, controls = NO_CONTROLS) {
  for (let t = 0; t < seconds; t += DT) stepWorld(world, controls, DT);
}

describe('Juggernaut armor', () => {
  it('takes one damage per Bolt and dies only when its armor is gone', () => {
    const world = liveWorld();
    const j = placeJuggernaut(world, 25);
    const parked = { ...j.pos };
    world.ship.invulnerableTime = 99;
    const firing = { ...NO_CONTROLS, fire: true };
    for (let t = 0; t < 10 && world.hunters.includes(j); t += DT) {
      // Held in the line of fire.
      j.pos = { ...parked };
      stepWorld(world, firing, DT);
      if (world.hunters.includes(j)) expect(j.hp).toBeGreaterThan(0);
    }
    expect(world.hunters).not.toContain(j);
    const hits = world.events.filter((e) => e.type === 'hunterHit');
    expect(hits).toHaveLength(cfg.hp - 1);
    expect(world.score).toBe(CONFIG.waves.killScore * cfg.scoreMultiplier);
  });

  it('takes Pulse damage once per Pulse', () => {
    const world = liveWorld();
    world.ship.weapon = 'shotgun';
    const j = placeJuggernaut(world, 10);
    stepWorld(world, { ...NO_CONTROLS, fire: true }, DT);
    run(world, CONFIG.shotgun.duration);
    expect(j.hp).toBe(cfg.hp - cfg.pulseDamage);
  });

  it('takes Artillery blast damage without dying outright', () => {
    const world = liveWorld();
    const j = placeJuggernaut(world, 40);
    world.impacts.push({ from: { x: 0, y: 0 }, pos: { ...j.pos }, time: DT / 2, flight: 1 });
    stepWorld(world, NO_CONTROLS, DT);
    expect(world.hunters).toContain(j);
    expect(j.hp).toBe(cfg.hp - cfg.blastDamage);
  });
});

describe('Juggernaut Spray', () => {
  it('winds up, then fires a fan of large Shells centered on the Ship', () => {
    const world = liveWorld();
    const j = placeJuggernaut(world, 30);
    j.fireCooldown = 0;
    stepWorld(world, NO_CONTROLS, DT);
    expect(j.windup).toBeGreaterThan(0);
    expect(world.shells).toHaveLength(0);
    run(world, cfg.windup);
    expect(world.shells).toHaveLength(cfg.spray.count);
    const toShip = Math.atan2(world.ship.pos.y - j.pos.y, world.ship.pos.x - j.pos.x);
    const offsets = world.shells.map((s) => {
      const off = Math.atan2(s.vel.y, s.vel.x) - toShip;
      return Math.atan2(Math.sin(off), Math.cos(off));
    });
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    expect(Math.abs(mean)).toBeLessThan(0.15);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeCloseTo(cfg.spray.spread, 1);
    for (const s of world.shells) expect(s.radius).toBe(cfg.spray.radius);
  });

  it('cannot swing its turret onto a Ship circling it fast', () => {
    const world = liveWorld();
    const j = placeJuggernaut(world, 0.1);
    j.pos = { x: world.ship.pos.x, y: world.ship.pos.y - 20 };
    const ship = world.ship;
    // Orbit the Juggernaut at 20 units, about 2 rad/s, faster than its turret traverses.
    let lag = 0;
    for (let t = 0; t < 3; t += DT) {
      const a = Math.atan2(ship.pos.y - j.pos.y, ship.pos.x - j.pos.x) + 2 * DT;
      ship.pos = { x: j.pos.x + Math.cos(a) * 20, y: j.pos.y + Math.sin(a) * 20 };
      stepWorld(world, NO_CONTROLS, DT);
      const bearing = Math.atan2(ship.pos.y - j.pos.y, ship.pos.x - j.pos.x);
      lag = Math.abs(Math.atan2(Math.sin(bearing - j.aim), Math.cos(bearing - j.aim)));
    }
    expect(lag).toBeGreaterThan(cfg.spray.spread / 2);
  });
});

describe('Juggernaut Waves', () => {
  it('arrives every few Waves from its first, with a second joining later', () => {
    const { juggernautFromWave: from, juggernautEvery: every } = CONFIG.waves;
    expect(waveMix(from - 1).juggernauts).toBe(0);
    expect(waveMix(from).juggernauts).toBe(1);
    expect(waveMix(from + 1).juggernauts).toBe(0);
    expect(waveMix(from + every).juggernauts).toBe(1);
    expect(waveMix(from + every * 3).juggernauts).toBe(2);
  });
});
