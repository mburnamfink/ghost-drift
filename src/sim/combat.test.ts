import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { NO_CONTROLS } from './controls';
import { type Tank, createTank } from './hunters';
import { terrainFromRows } from './terrain';
import { packPositions, packSizes } from './waves';
import { type World, createWorld, stepWorld } from './world';

const DT = 1 / CONFIG.sim.stepHz;

function liveWorld(): World {
  const world = createWorld(1, terrainFromRows(Array.from({ length: 64 }, () => '.'.repeat(64))));
  world.wave = 1;
  world.lull = 0;
  return world;
}

function run(world: World, seconds: number, controls = NO_CONTROLS) {
  for (let t = 0; t < seconds; t += DT) stepWorld(world, controls, DT);
}

const ringOfTanks = (world: World, n: number, radius: number): Tank[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const t = createTank(
      100 + i,
      {
        x: world.ship.pos.x + Math.cos(a) * radius,
        y: world.ship.pos.y + Math.sin(a) * radius,
      },
      new Rng(i),
    );
    world.hunters.push(t);
    return t;
  });

describe('Volleys', () => {
  it('has every Tank with a shot wind up together, then fire together', () => {
    const world = liveWorld();
    world.volley.timer = DT / 2;
    const tanks = ringOfTanks(world, 4, 30);
    stepWorld(world, NO_CONTROLS, DT);
    expect(tanks.every((t) => t.loading)).toBe(true);
    expect(world.shells).toHaveLength(0);
    run(world, CONFIG.volley.windup);
    expect(world.shells).toHaveLength(4);
    expect(tanks.every((t) => !t.loading)).toBe(true);
  });

  it('holds fire between volleys', () => {
    const world = liveWorld();
    world.volley.timer = 2;
    ringOfTanks(world, 4, 30);
    run(world, 1.5);
    expect(world.shells).toHaveLength(0);
  });
});

describe('Packs', () => {
  it('splits Tanks into packs of three to five', () => {
    for (const n of [3, 7, 12, 23]) {
      const sizes = packSizes(n, new Rng(n));
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(n);
      for (const s of sizes) expect(s).toBeGreaterThanOrEqual(Math.min(n, CONFIG.tank.packSize[0]));
    }
  });

  it('spawns a pack close together', () => {
    const world = liveWorld();
    const centre = { x: 40, y: 40 };
    const spread = (CONFIG.tank.packSpawnSpread + 1) * world.terrain.cellSize * Math.SQRT2;
    for (const p of packPositions(world.terrain, centre, 5, new Rng(1))) {
      expect(Math.hypot(p.x - centre.x, p.y - centre.y)).toBeLessThan(spread);
    }
  });
});

describe('Chain Blasts', () => {
  it('sets off nearby Tanks in sequence and spares distant ones and the Ship', () => {
    const world = liveWorld();
    world.volley.timer = 99;
    const { x, y } = world.ship.pos;
    const near = [0, 6, 12].map((dx, i) => createTank(200 + i, { x: x + 40 + dx, y }, new Rng(i)));
    const far = createTank(210, { x: x + 40, y: y + 40 }, new Rng(9));
    world.hunters.push(...near, far);
    world.hunters.splice(0, 1);
    world.blasts.push({ pos: { x: x + 40, y }, time: 0 });
    // Freeze the Tanks in place so only blasts act.
    for (const t of world.hunters) t.vel = { x: 0, y: 0 };
    stepWorld(world, NO_CONTROLS, DT);
    expect(world.hunters.map((h) => h.id)).not.toContain(201);
    run(world, CONFIG.chain.delay * 2 + DT);
    expect(world.hunters.map((h) => h.id)).toEqual([210]);
    expect(world.ship.hull).toBe(CONFIG.ship.hull);
  });
});

describe('Slide combo', () => {
  it('multiplies each kill in one Powerslide by its place in the combo, then reports the total', () => {
    const world = liveWorld();
    world.volley.timer = 99;
    world.ship.heading = 0;
    world.ship.vel = { x: 30, y: 0 };
    const { x, y } = world.ship.pos;
    // Beyond engagement range, so they drive straight down the firing line instead of circling,
    // and spaced wider than a Chain Blast so each needs its own Bolt.
    world.hunters.push(
      ...[55, 70, 85].map((dx, i) => createTank(300 + i, { x: x + dx, y }, new Rng(i))),
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
