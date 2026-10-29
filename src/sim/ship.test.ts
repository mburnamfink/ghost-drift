import { describe, expect, it } from 'vitest';
import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { type Controls, NO_CONTROLS } from './controls';
import { canBeHit, createShip, type Ship, speedOf, stepShip } from './ship';
import { Terrain, terrainFromRows } from './terrain';

const DT = 1 / CONFIG.sim.stepHz;
const open = terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64)));

function run(ship: Ship, controls: Partial<Controls>, seconds: number, terrain = open) {
  const c = { ...NO_CONTROLS, ...controls };
  for (let t = 0; t < seconds; t += DT) stepShip(ship, c, terrain, DT);
}

const center = () => createShip({ x: 128, y: 128 });

describe('Ship handling', () => {
  it('approaches top speed under full thrust', () => {
    const ship = center();
    run(ship, { thrust: 1 }, 3);
    expect(speedOf(ship)).toBeGreaterThan(SHIP_TOP_SPEED * 0.95);
    expect(speedOf(ship)).toBeLessThanOrEqual(SHIP_TOP_SPEED + 1e-6);
  });

  it('realigns velocity with heading after a turn when gripping', () => {
    const ship = center();
    run(ship, { thrust: 1 }, 2);
    run(ship, { thrust: 1, steer: 1 }, 0.5);
    run(ship, { thrust: 1 }, 0.5);
    const travel = Math.atan2(ship.vel.y, ship.vel.x);
    expect(Math.abs(travel - ship.heading)).toBeLessThan(0.05);
  });

  it('keeps most of its speed through a full-lock turn', () => {
    const ship = center();
    run(ship, { thrust: 1 }, 3);
    run(ship, { thrust: 1, steer: 1 }, 3);
    expect(speedOf(ship)).toBeGreaterThan(SHIP_TOP_SPEED * 0.85);
    expect(speedOf(ship)).toBeLessThanOrEqual(SHIP_TOP_SPEED + 1e-6);
  });

  it('keeps traveling in a straight line while Powersliding, whatever the heading does', () => {
    const ship = center();
    run(ship, { thrust: 1 }, 2);
    const before = Math.atan2(ship.vel.y, ship.vel.x);
    run(ship, { thrust: 1, steer: 1, slide: true }, 0.6);
    expect(Math.atan2(ship.vel.y, ship.vel.x)).toBeCloseTo(before, 6);
    expect(Math.abs(ship.heading - before)).toBeGreaterThan(2);
  });

  it('bleeds speed slowly while Powersliding, even under thrust', () => {
    const ship = center();
    run(ship, { thrust: 1 }, 2);
    const before = speedOf(ship);
    run(ship, { thrust: 1, slide: true }, 0.5);
    expect(speedOf(ship)).toBeLessThan(before);
    expect(speedOf(ship)).toBeCloseTo(before * Math.exp(-CONFIG.ship.slideDrag * 0.5), 1);
  });
});

describe('Burst', () => {
  it('spends a Charge and grants invulnerability', () => {
    const ship = center();
    stepShip(ship, { ...NO_CONTROLS, burst: true }, open, DT);
    expect(ship.charges).toBe(CONFIG.ship.burstCharges - 1);
    expect(canBeHit(ship)).toBe(false);
  });

  it('does nothing without Charges', () => {
    const ship = center();
    ship.charges = 0;
    const r = stepShip(ship, { ...NO_CONTROLS, burst: true }, open, DT);
    expect(r.burstStarted).toBe(false);
  });

  it('passes through a Block and never ends inside one', () => {
    const rows = Array.from({ length: 16 }, () => '.'.repeat(16));
    rows[8] = '......####......';
    const t = terrainFromRows(rows);
    // Heading +x along row 8, just short of the Blocks.
    const ship = createShip({ x: 5 * 4, y: 8.5 * 4 });
    run(ship, { burst: true }, DT);
    run(ship, {}, CONFIG.ship.burstDuration + 0.1, t);
    expect(ship.pos.x).toBeGreaterThan(10 * 4);
    expect(t.isSolidAt(ship.pos)).toBe(false);
  });

  it('bounces off the Edge like a billiard ball instead of passing through', () => {
    const wall = { id: 1, x: 10, y: 0, w: 2, h: 16, height: 20, wall: true };
    const t = new Terrain(16, 4, [wall]);
    // Heading +x at the wall, 20 units short, at a shallow angle.
    const ship = createShip({ x: 20, y: 30 }, 0.3);
    run(ship, { burst: true }, DT, t);
    for (let time = 0; time < CONFIG.ship.burstDuration; time += DT) {
      run(ship, {}, DT, t);
      expect(ship.pos.x).toBeLessThanOrEqual(wall.x * 4 - CONFIG.ship.radius + 1e-6);
    }
    expect(Math.cos(ship.heading)).toBeLessThan(0);
    expect(Math.sin(ship.heading)).toBeCloseTo(Math.sin(0.3), 5);
  });

  it('bounces off the Arena bounds too', () => {
    const ship = createShip({ x: 10, y: 128 }, Math.PI);
    run(ship, { burst: true }, DT);
    run(ship, {}, CONFIG.ship.burstDuration);
    expect(ship.pos.x).toBeGreaterThan(CONFIG.ship.radius);
    expect(Math.cos(ship.heading)).toBeGreaterThan(0.99);
  });

  it('exits at top speed', () => {
    const ship = center();
    run(ship, { burst: true }, DT);
    run(ship, {}, CONFIG.ship.burstDuration);
    expect(speedOf(ship)).toBeGreaterThan(SHIP_TOP_SPEED * 0.9);
  });
});

describe('Firing', () => {
  it('fires along the heading at the configured cadence', () => {
    const ship = center();
    let shots = 0;
    for (let t = 0; t < 1; t += DT)
      if (stepShip(ship, { ...NO_CONTROLS, fire: true }, open, DT).fired !== null) shots++;
    expect(shots).toBeGreaterThanOrEqual(Math.floor(1 / CONFIG.cannon.interval));
    expect(shots).toBeLessThanOrEqual(Math.ceil(1 / CONFIG.cannon.interval) + 1);
  });
});
