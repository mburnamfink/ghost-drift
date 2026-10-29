import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { type Vec2, clamp, fromAngle } from '../core/vec2';
import type { Controls } from './controls';
import { FlowField } from './flowfield';
import { type Hunter, createHunter, stepHunter } from './hunter';
import { type Ship, canBeHit, createShip, isBursting, stepShip } from './ship';
import { type Shot, createShot, stepShots } from './shots';
import { type CityPlan, type TerrainChange, generateCity, planChange } from './city';
import { Terrain } from './terrain';
import { hunterSpeed, spawnPoints, waveSize } from './waves';

/** Things that happened during a step, for presentation layers to react to. Never read by the sim. */
export type SimEvent =
  | { type: 'boltFired'; pos: Vec2 }
  | { type: 'hunterDestroyed'; pos: Vec2 }
  | { type: 'shipHit'; pos: Vec2 }
  | { type: 'shipDestroyed'; pos: Vec2 }
  | { type: 'burstStarted'; pos: Vec2 }
  | { type: 'waveStarted'; wave: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'terrainChanged'; change: TerrainChange };

export interface World {
  readonly seed: number;
  readonly rng: Rng;
  readonly terrain: Terrain;
  /** Null when the World was built on fixed terrain, which then never changes. */
  readonly city: CityPlan | null;
  /** Rises and Sinks announced during the lull, applied when the next Wave starts. */
  pendingChange: TerrainChange | null;
  ship: Ship;
  hunters: Hunter[];
  bolts: Shot[];
  shells: Shot[];
  /** Current Wave number; 0 before the first. */
  wave: number;
  /** Seconds until the next Wave spawns; 0 while a Wave is live. */
  lull: number;
  score: number;
  time: number;
  over: boolean;
  /** Appended to by every step; the owner drains it. */
  events: SimEvent[];
  chaseField: FlowField;
  cutField: FlowField;
  cutTarget: Vec2;
  fieldTimer: number;
  nextId: number;
}

export function createWorld(seed: number, terrain?: Terrain): World {
  const rng = new Rng(seed);
  const city = terrain ? null : generateCity(rng);
  const t = terrain ?? new Terrain(CONFIG.arena.cells, CONFIG.arena.cellSize);
  if (city) for (const p of planChange(city, () => false, 1, rng).rise) t.raise(p);
  const ship = createShip(t.center, -Math.PI / 2);
  return {
    seed,
    rng,
    terrain: t,
    city,
    pendingChange: null,
    ship,
    hunters: [],
    bolts: [],
    shells: [],
    wave: 0,
    lull: 1.5,
    score: 0,
    time: 0,
    over: false,
    events: [],
    chaseField: new FlowField(t),
    cutField: new FlowField(t),
    cutTarget: { ...ship.pos },
    fieldTimer: 0,
    nextId: 1,
  };
}

export function stepWorld(world: World, controls: Controls, dt: number): void {
  if (world.over) return;
  world.time += dt;

  const shipStep = stepShip(world.ship, controls, world.terrain, dt);
  if (shipStep.burstStarted)
    world.events.push({ type: 'burstStarted', pos: { ...world.ship.pos } });
  if (shipStep.fired !== null) fireBolt(world, shipStep.fired);

  refreshFlowFields(world, dt);
  stepHunters(world, dt);
  stepShots(world.bolts, world.terrain, dt);
  stepShots(world.shells, world.terrain, dt);
  resolveBoltHits(world);
  resolveShipContacts(world);
  advanceWaves(world, dt);
}

function fireBolt(world: World, angle: number): void {
  const muzzle = fromAngle(angle, CONFIG.ship.radius + 0.6);
  const pos = { x: world.ship.pos.x + muzzle.x, y: world.ship.pos.y + muzzle.y };
  world.bolts.push(createShot(pos, angle, CONFIG.bolt.speed, CONFIG.bolt.life));
  world.events.push({ type: 'boltFired', pos });
}

function refreshFlowFields(world: World, dt: number): void {
  world.fieldTimer -= dt;
  if (world.fieldTimer > 0 || world.hunters.length === 0) return;
  world.fieldTimer = CONFIG.hunter.flowFieldRefresh;
  const { ship, terrain } = world;
  const lead = CONFIG.hunter.cutterLead;
  const margin = terrain.cellSize;
  world.cutTarget = {
    x: clamp(ship.pos.x + ship.vel.x * lead, margin, terrain.worldSize - margin),
    y: clamp(ship.pos.y + ship.vel.y * lead, margin, terrain.worldSize - margin),
  };
  world.chaseField.build(ship.pos);
  world.cutField.build(world.cutTarget);
}

function stepHunters(world: World, dt: number): void {
  const ctx = {
    terrain: world.terrain,
    shipPos: world.ship.pos,
    chaseField: world.chaseField,
    cutField: world.cutField,
    cutTarget: world.cutTarget,
    hunters: world.hunters,
    speed: hunterSpeed(world.wave),
    rng: world.rng,
  };
  for (const h of world.hunters) {
    const shot = stepHunter(h, ctx, dt);
    if (shot === null) continue;
    const muzzle = fromAngle(shot, CONFIG.hunter.radius + 0.6);
    world.shells.push(
      createShot(
        { x: h.pos.x + muzzle.x, y: h.pos.y + muzzle.y },
        shot,
        CONFIG.shell.speed,
        CONFIG.shell.life,
      ),
    );
  }
}

function resolveBoltHits(world: World): void {
  const reach = CONFIG.hunter.radius + CONFIG.bolt.radius;
  for (let b = world.bolts.length - 1; b >= 0; b--) {
    const bolt = world.bolts[b]!;
    const i = world.hunters.findIndex(
      (h) => Math.hypot(h.pos.x - bolt.pos.x, h.pos.y - bolt.pos.y) < reach,
    );
    if (i < 0) continue;
    const [dead] = world.hunters.splice(i, 1);
    world.bolts.splice(b, 1);
    world.score += CONFIG.waves.killScore * world.wave;
    world.events.push({ type: 'hunterDestroyed', pos: { ...dead!.pos } });
  }
}

/** Shells and Hunter bodies hurt the Ship; Hunter bodies also physically block it unless bursting. */
function resolveShipContacts(world: World): void {
  const ship = world.ship;
  const shellReach = CONFIG.ship.radius + CONFIG.shell.radius;
  for (let s = world.shells.length - 1; s >= 0; s--) {
    const shell = world.shells[s]!;
    if (Math.hypot(shell.pos.x - ship.pos.x, shell.pos.y - ship.pos.y) >= shellReach) continue;
    if (!canBeHit(ship)) continue;
    world.shells.splice(s, 1);
    damageShip(world);
  }

  if (isBursting(ship)) return;
  const bodyReach = CONFIG.ship.radius + CONFIG.hunter.radius;
  for (const h of world.hunters) {
    const dx = ship.pos.x - h.pos.x;
    const dy = ship.pos.y - h.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= bodyReach || d < 1e-6) continue;
    const nx = dx / d;
    const ny = dy / d;
    ship.pos = { x: ship.pos.x + nx * (bodyReach - d), y: ship.pos.y + ny * (bodyReach - d) };
    const into = ship.vel.x * nx + ship.vel.y * ny;
    if (into < 0) ship.vel = { x: ship.vel.x - nx * into, y: ship.vel.y - ny * into };
    if (canBeHit(ship)) damageShip(world);
  }
}

function damageShip(world: World): void {
  const ship = world.ship;
  ship.hull--;
  ship.invulnerableTime = CONFIG.ship.hitInvulnerability;
  world.events.push({ type: 'shipHit', pos: { ...ship.pos } });
  if (ship.hull <= 0) {
    world.over = true;
    world.events.push({ type: 'shipDestroyed', pos: { ...ship.pos } });
  }
}

function advanceWaves(world: World, dt: number): void {
  if (world.lull > 0) {
    world.lull = Math.max(0, world.lull - dt);
    if (world.lull === 0) startWave(world);
    return;
  }
  if (world.hunters.length === 0) {
    world.events.push({ type: 'waveCleared', wave: world.wave });
    world.ship.charges = CONFIG.ship.burstCharges;
    world.lull = CONFIG.waves.lull;
    if (world.city) {
      const { terrain } = world;
      world.pendingChange = planChange(
        world.city,
        (id) => terrain.hasBlock(id),
        world.wave + 1,
        world.rng,
      );
    }
  }
}

/** Applies the announced change. A Block never Rises onto the Ship; it stays down this Wave instead. */
function applyPendingChange(world: World): void {
  const change = world.pendingChange;
  if (!change) return;
  world.pendingChange = null;
  const { terrain, ship } = world;
  const clearance = CONFIG.ship.radius + 0.5;
  for (const p of change.sink) terrain.lower(p.id);
  const rise = change.rise.filter((p) => {
    const nearestX = Math.max(
      p.x * terrain.cellSize,
      Math.min(ship.pos.x, (p.x + p.w) * terrain.cellSize),
    );
    const nearestY = Math.max(
      p.y * terrain.cellSize,
      Math.min(ship.pos.y, (p.y + p.h) * terrain.cellSize),
    );
    return Math.hypot(nearestX - ship.pos.x, nearestY - ship.pos.y) > clearance;
  });
  for (const p of rise) terrain.raise(p);
  world.events.push({ type: 'terrainChanged', change: { rise, sink: change.sink } });
}

function startWave(world: World): void {
  applyPendingChange(world);
  world.wave++;
  const count = waveSize(world.wave);
  const points = spawnPoints(world.terrain, world.ship.pos, count, world.rng);
  points.forEach((p, i) => {
    // Interleave roles so every Wave has both Chasers and Cutters.
    const f = CONFIG.hunter.cutterFraction;
    const role = Math.floor((i + 1) * f) > Math.floor(i * f) ? 'cutter' : 'chaser';
    world.hunters.push(createHunter(world.nextId++, role, p, world.rng));
  });
  world.fieldTimer = 0;
  world.events.push({ type: 'waveStarted', wave: world.wave });
}
