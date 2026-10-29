import { describe, expect, it } from 'vitest';
import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { type Controls, NO_CONTROLS } from './controls';
import { canBeHit, createShip, type Ship, speedOf, stepShip } from './ship';
import { terrainFromRows } from './terrain';

const DT = 1 / CONFIG.sim.stepHz;
const open = terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64)));

function run(ship: Ship, controls: Partial<Controls>, seconds: number, terrain = open) {
  const c = { ...NO_CONTROLS, ...controls };
  for (let t = 0; t < seconds; t += DT) stepShip(ship, c, terrain, DT);
}

const centre = () => createShip({ x: 128, y: 128 });

describe('Ship handling', () => {
  it('approaches top speed under full thrust', () => {
    const ship = centre();
    run(ship, { thrust: 1 }, 3);
    expect(speedOf(ship)).toBeGreaterThan(SHIP_TOP_SPEED * 0.95);
    expect(speedOf(ship)).toBeLessThanOrEqual(SHIP_TOP_SPEED + 1e-6);
  });

  it('realigns velocity with heading after a turn when gripping', () => {
    const ship = centre();
    run(ship, { thrust: 1 }, 2);
    run(ship, { thrust: 1, steer: 1 }, 0.5);
    run(ship, { thrust: 1 }, 0.5);
    const travel = Math.atan2(ship.vel.y, ship.vel.x);
    expect(Math.abs(travel - ship.heading)).toBeLessThan(0.05);
  });

  it('lets the heading swing away from travel while Powersliding, at a cost in speed', () => {
    const gripping = centre();
    const sliding = centre();
    run(gripping, { thrust: 1 }, 2);
    run(sliding, { thrust: 1 }, 2);
    run(gripping, { thrust: 1, steer: 1 }, 0.4);
    run(sliding, { thrust: 1, steer: 1, slide: true }, 0.4);
    const slip = Math.abs(Math.atan2(sliding.vel.y, sliding.vel.x) - sliding.heading);
    expect(slip).toBeGreaterThan(0.8);
    expect(speedOf(sliding)).toBeLessThan(speedOf(gripping));
  });
});

describe('Burst', () => {
  it('spends a Charge and grants invulnerability', () => {
    const ship = centre();
    stepShip(ship, { ...NO_CONTROLS, burst: true }, open, DT);
    expect(ship.charges).toBe(CONFIG.ship.burstCharges - 1);
    expect(canBeHit(ship)).toBe(false);
  });

  it('does nothing without Charges', () => {
    const ship = centre();
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

  it('exits at top speed', () => {
    const ship = centre();
    run(ship, { burst: true }, DT);
    run(ship, {}, CONFIG.ship.burstDuration);
    expect(speedOf(ship)).toBeGreaterThan(SHIP_TOP_SPEED * 0.9);
  });
});

describe('Firing', () => {
  it('fires along the heading at the configured cadence', () => {
    const ship = centre();
    let shots = 0;
    for (let t = 0; t < 1; t += DT)
      if (stepShip(ship, { ...NO_CONTROLS, fire: true }, open, DT).fired !== null) shots++;
    expect(shots).toBeGreaterThanOrEqual(Math.floor(1 / CONFIG.ship.fireInterval));
    expect(shots).toBeLessThanOrEqual(Math.ceil(1 / CONFIG.ship.fireInterval) + 1);
  });
});
