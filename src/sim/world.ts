import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { type Vec2, clamp, distance, fromAngle } from '../core/vec2';
import type { Controls } from './controls';
import { FlowField } from './flowfield';
import {
  type KillCredit,
  type Multiplier,
  type ShotStyle,
  creditKill,
  drainHeat,
  multiplierValue,
  newMultiplier,
  shotStyle,
  stepMomentum,
} from './multiplier';
import {
  type Hunter,
  type HunterAction,
  type HunterKind,
  createArtillery,
  createBerserker,
  createJuggernaut,
  createSniper,
  createTank,
  endLunge,
  hunterRadius,
  hunterScoreMultiplier,
  stepHunter,
} from './hunters';
import { type Ship, canBeHit, createShip, isBursting, stepShip } from './ship';
import { type Shot, createShot, stepShots } from './shots';
import {
  type CityPlan,
  type LayoutName,
  type TerrainChange,
  generateCity,
  planChange,
} from './city';
import { Terrain } from './terrain';
import { type EnemyDensity, spawnPoints, tankSpeed, waveMix, waveTotal } from './waves';
import { type Pulse, homeBolts, pulseReaches, shotgunBlast, stepPulses } from './weapons';

/** Things that happened during a step, for presentation layers to react to. Never read by the sim. */
export type SimEvent =
  | { type: 'boltFired'; pos: Vec2 }
  | { type: 'pulseFired'; pos: Vec2 }
  /** A Pulse reached a Hunter; `angle` is the direction from the Ship to it. */
  | { type: 'pulseHit'; pos: Vec2; angle: number }
  | { type: 'burstBounced'; pos: Vec2 }
  | {
      type: 'hunterDestroyed';
      pos: Vec2;
      kind: HunterKind;
      points: number;
      /** The Multiplier this kill scored at. */
      multiplier: number;
      /** Null for a kill the player didn't make, which heats nothing: an Artillery blast. */
      credit: KillCredit | null;
    }
  | { type: 'sniperFired'; from: Vec2; to: Vec2 }
  | { type: 'salvoFired'; from: Vec2 }
  | { type: 'impact'; pos: Vec2 }
  | { type: 'shipHit'; pos: Vec2 }
  | { type: 'shipDestroyed'; pos: Vec2 }
  | { type: 'burstStarted'; pos: Vec2 }
  | { type: 'waveStarted'; wave: number; juggernauts: number }
  | { type: 'hunterHit'; pos: Vec2; id: number }
  | { type: 'waveCleared'; wave: number }
  | { type: 'terrainChanged'; change: TerrainChange };

/** An Artillery shell in flight. Its arc is presentation only; the sim knows when and where it lands. */
export interface Impact {
  from: Vec2;
  pos: Vec2;
  /** Seconds until it lands. */
  time: number;
  /** Total flight time, for drawing the arc and the closing warning circle. */
  flight: number;
}

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
  pulses: Pulse[];
  shells: Shot[];
  impacts: Impact[];
  /** Hunters the current Wave started with. */
  waveStrength: number;
  /** Scales how many of each Hunter type every Wave sends. */
  readonly density: EnemyDensity;
  multiplier: Multiplier;
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

/**
 * @param terrain Fixed terrain to use instead of generating a city; it then never changes.
 * @param firstWave Wave the Run opens on, with the city already grown to match. For testing.
 * @param layout City layout; chosen at random from the seed if omitted.
 * @param density Scales how many of each Hunter type every Wave sends.
 */
export function createWorld(
  seed: number,
  terrain?: Terrain,
  firstWave = 1,
  layout?: LayoutName,
  density: EnemyDensity = {},
): World {
  const rng = new Rng(seed);
  const city = terrain ? null : generateCity(rng, layout);
  const t = terrain ?? new Terrain(CONFIG.arena.cells, CONFIG.arena.cellSize);
  if (city) {
    for (let wave = 1; wave <= firstWave; wave++) {
      const change = planChange(city, (id) => t.hasBlock(id), wave, rng);
      for (const p of change.sink) t.lower(p.id);
      for (const p of change.rise) t.raise(p);
    }
  }
  const ship = city
    ? createShip({ x: city.spawn.x * t.cellSize, y: city.spawn.y * t.cellSize }, city.spawnHeading)
    : createShip(t.center, -Math.PI / 2);
  return {
    seed,
    rng,
    terrain: t,
    city,
    pendingChange: null,
    ship,
    hunters: [],
    bolts: [],
    pulses: [],
    shells: [],
    impacts: [],
    waveStrength: 0,
    density,
    multiplier: newMultiplier(),
    wave: firstWave - 1,
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
  if (shipStep.bounced) world.events.push({ type: 'burstBounced', pos: { ...world.ship.pos } });
  if (shipStep.fired !== null) fireWeapon(world, shipStep.fired);
  stepMomentum(world.multiplier, world.ship, dt);
  if (world.lull === 0) drainHeat(world.multiplier, dt);

  refreshFlowFields(world, dt);
  stepHunters(world, dt);
  homeBolts(
    world.bolts,
    world.hunters.map((h) => h.pos),
    dt,
  );
  stepShots(world.bolts, world.terrain, dt);
  stepPulses(world.pulses, world.ship, dt);
  stepShots(world.shells, world.terrain, dt);
  stepImpacts(world, dt);
  resolveBoltHits(world);
  resolvePulseHits(world);
  resolveShipContacts(world);
  advanceWaves(world, dt);
}

function fireWeapon(world: World, angle: number): void {
  const { ship } = world;
  if (ship.weapon === 'shotgun') {
    world.pulses.push(...shotgunBlast(ship, shotStyle(ship, world.multiplier)));
    world.events.push({ type: 'pulseFired', pos: { ...ship.pos } });
    return;
  }
  const muzzle = fromAngle(angle, CONFIG.ship.radius + 0.6);
  const pos = { x: ship.pos.x + muzzle.x, y: ship.pos.y + muzzle.y };
  world.bolts.push({
    ...createShot(pos, angle, CONFIG.cannon.speed, CONFIG.cannon.life),
    style: shotStyle(ship, world.multiplier),
  });
  world.events.push({ type: 'boltFired', pos });
}

function refreshFlowFields(world: World, dt: number): void {
  world.fieldTimer -= dt;
  if (world.fieldTimer > 0 || world.hunters.length === 0) return;
  world.fieldTimer = CONFIG.hunters.flowFieldRefresh;
  const { ship, terrain } = world;
  const lead = CONFIG.tank.cutterLead;
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
    ship: world.ship,
    chaseField: world.chaseField,
    cutField: world.cutField,
    cutTarget: world.cutTarget,
    hunters: world.hunters,
    tankSpeed: tankSpeed(world.wave),
    rng: world.rng,
  };
  for (const h of world.hunters) {
    const action = stepHunter(h, ctx, dt);
    if (action) performAction(world, h, action);
  }
}

function performAction(world: World, h: Hunter, action: HunterAction): void {
  switch (action.type) {
    case 'shell': {
      const muzzle = fromAngle(action.angle, CONFIG.tank.radius + 0.6);
      world.shells.push(
        createShot(
          { x: h.pos.x + muzzle.x, y: h.pos.y + muzzle.y },
          action.angle,
          CONFIG.shell.speed,
          CONFIG.shell.life,
        ),
      );
      break;
    }
    case 'snipe':
      resolveSnipe(world, h.pos, action.dir);
      break;
    case 'spray': {
      const { speed, life, radius } = CONFIG.juggernaut.spray;
      for (const angle of action.angles) {
        const muzzle = fromAngle(angle, CONFIG.juggernaut.radius + 0.8);
        world.shells.push(
          createShot({ x: h.pos.x + muzzle.x, y: h.pos.y + muzzle.y }, angle, speed, life, radius),
        );
      }
      break;
    }
    case 'salvo': {
      const cfg = CONFIG.artillery;
      action.targets.forEach((pos, i) => {
        const flight = cfg.flightTime + i * cfg.salvoStagger;
        world.impacts.push({ from: { ...h.pos }, pos, time: flight, flight });
      });
      world.events.push({ type: 'salvoFired', from: { ...h.pos } });
      break;
    }
  }
}

/** A sniper shot is instant: it travels until it meets terrain and hits the Ship if it crosses it. */
function resolveSnipe(world: World, from: Vec2, dir: Vec2): void {
  const { ship, terrain } = world;
  const range = terrain.castRay(from, dir, CONFIG.sniper.maxRange * 1.5);
  const rx = ship.pos.x - from.x;
  const ry = ship.pos.y - from.y;
  const along = rx * dir.x + ry * dir.y;
  const across = Math.abs(rx * dir.y - ry * dir.x);
  const crosses =
    along > 0 && along < range && across < CONFIG.ship.radius + CONFIG.sniper.shotWidth;
  if (crosses && canBeHit(ship)) damageShip(world);
  world.events.push({
    type: 'sniperFired',
    from: { ...from },
    to: { x: from.x + dir.x * range, y: from.y + dir.y * range },
  });
}

/** Lands Artillery shells. Blasts hit the Ship and every Hunter in range, including the Artillery. */
function stepImpacts(world: World, dt: number): void {
  const blast = CONFIG.artillery.blastRadius;
  for (let i = world.impacts.length - 1; i >= 0; i--) {
    const impact = world.impacts[i]!;
    impact.time -= dt;
    if (impact.time > 0) continue;
    world.impacts.splice(i, 1);
    world.events.push({ type: 'impact', pos: impact.pos });
    const { ship } = world;
    if (distance(ship.pos, impact.pos) < blast + CONFIG.ship.radius && canBeHit(ship)) {
      damageShip(world);
    }
    for (let j = world.hunters.length - 1; j >= 0; j--) {
      const h = world.hunters[j]!;
      if (distance(h.pos, impact.pos) < blast + hunterRadius(h.kind)) {
        damageHunter(world, j, CONFIG.juggernaut.blastDamage, null);
      }
    }
  }
}

function resolveBoltHits(world: World): void {
  for (let b = world.bolts.length - 1; b >= 0; b--) {
    const bolt = world.bolts[b]!;
    const i = world.hunters.findIndex(
      (h) => distance(h.pos, bolt.pos) < hunterRadius(h.kind) + CONFIG.cannon.radius,
    );
    if (i < 0) continue;
    world.bolts.splice(b, 1);
    damageHunter(world, i, 1, bolt.style ?? null);
  }
}

function resolvePulseHits(world: World): void {
  for (const p of world.pulses) {
    for (let i = world.hunters.length - 1; i >= 0; i--) {
      const h = world.hunters[i]!;
      if (p.hit.includes(h.id)) continue;
      if (!pulseReaches(p, h.pos, hunterRadius(h.kind), world.terrain)) continue;
      p.hit.push(h.id);
      const angle = Math.atan2(h.pos.y - p.origin.y, h.pos.x - p.origin.x);
      world.events.push({ type: 'pulseHit', pos: { ...h.pos }, angle });
      const { knockback } = CONFIG.shotgun;
      h.vel = {
        x: h.vel.x + Math.cos(angle) * knockback,
        y: h.vel.y + Math.sin(angle) * knockback,
      };
      damageHunter(world, i, CONFIG.juggernaut.pulseDamage, p.style);
    }
  }
}

/**
 * Only Juggernauts are armored; `amount` matters to nothing else, which dies to any hit. `style` is
 * how the player's shot was fired, or null for damage the player didn't deal.
 */
function damageHunter(world: World, index: number, amount: number, style: ShotStyle | null): void {
  const h = world.hunters[index];
  if (!h) return;
  if (h.kind === 'juggernaut') {
    h.hp -= amount;
    if (h.hp > 0) {
      world.events.push({ type: 'hunterHit', pos: { ...h.pos }, id: h.id });
      return;
    }
  }
  destroyHunter(world, index, style);
}

/**
 * Removes a Hunter and scores it at the Multiplier before this kill, whatever destroyed it. Only
 * the player's own kills heat the Multiplier.
 */
function destroyHunter(world: World, index: number, style: ShotStyle | null): void {
  const [dead] = world.hunters.splice(index, 1);
  if (!dead) return;
  const multiplier = multiplierValue(world.multiplier);
  const points = Math.round(
    CONFIG.waves.killScore *
      hunterScoreMultiplier(dead.kind) *
      Math.max(1, world.wave) *
      multiplier,
  );
  world.score += points;
  world.events.push({
    type: 'hunterDestroyed',
    pos: { ...dead.pos },
    kind: dead.kind,
    points,
    multiplier,
    credit: style ? creditKill(world.multiplier, style, world.time) : null,
  });
}

/** Shells and Hunter bodies hurt the Ship; Hunter bodies also physically block it unless bursting. */
function resolveShipContacts(world: World): void {
  const ship = world.ship;
  for (let s = world.shells.length - 1; s >= 0; s--) {
    const shell = world.shells[s]!;
    const reach = CONFIG.ship.radius + (shell.radius ?? CONFIG.shell.radius);
    if (Math.hypot(shell.pos.x - ship.pos.x, shell.pos.y - ship.pos.y) >= reach) continue;
    if (!canBeHit(ship)) continue;
    world.shells.splice(s, 1);
    damageShip(world);
  }

  if (isBursting(ship)) return;
  for (const h of world.hunters) {
    const bodyReach = CONFIG.ship.radius + hunterRadius(h.kind);
    const dx = ship.pos.x - h.pos.x;
    const dy = ship.pos.y - h.pos.y;
    const d = Math.hypot(dx, dy);
    if (d >= bodyReach || d < 1e-6) continue;
    const nx = dx / d;
    const ny = dy / d;
    ship.pos = { x: ship.pos.x + nx * (bodyReach - d), y: ship.pos.y + ny * (bodyReach - d) };
    const into = ship.vel.x * nx + ship.vel.y * ny;
    if (into < 0) ship.vel = { x: ship.vel.x - nx * into, y: ship.vel.y - ny * into };
    if (h.kind === 'berserker' && h.phase === 'lunge') endLunge(h);
    if (canBeHit(ship)) damageShip(world);
  }
}

function damageShip(world: World): void {
  const ship = world.ship;
  world.multiplier.momentum = 0;
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
  const mix = waveMix(world.wave, world.density);
  const { terrain, rng } = world;
  const points = spawnPoints(terrain, world.ship.pos, waveTotal(mix), rng, mix.juggernauts);
  const specials = mix.juggernauts + mix.snipers + mix.artillery + mix.berserkers;
  points.forEach((p, i) => {
    const id = world.nextId++;
    if (i < mix.juggernauts) {
      world.hunters.push(createJuggernaut(id, p, rng));
    } else if (i < mix.juggernauts + mix.snipers) {
      world.hunters.push(createSniper(id, p, terrain, rng));
    } else if (i < mix.juggernauts + mix.snipers + mix.artillery) {
      world.hunters.push(createArtillery(id, p, terrain, rng));
    } else if (i < specials) {
      world.hunters.push(createBerserker(id, p, rng));
    } else {
      // Interleave roles so every Wave has both Chasers and Cutters.
      const t = i - specials;
      const f = CONFIG.tank.cutterFraction;
      const role = Math.floor((t + 1) * f) > Math.floor(t * f) ? 'cutter' : 'chaser';
      world.hunters.push(createTank(id, role, p, rng));
    }
  });
  world.waveStrength = world.hunters.length;
  world.fieldTimer = 0;
  world.events.push({ type: 'waveStarted', wave: world.wave, juggernauts: mix.juggernauts });
}
