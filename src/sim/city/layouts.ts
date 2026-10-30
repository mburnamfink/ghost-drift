import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { FootprintWeights } from './footprints';
import type { Rect } from './plan';
import { type Circle, type Shape, unionDistance } from './shapes';

export const LAYOUT_NAMES = [
  'grid',
  'circuit',
  'districts',
  'hub',
  'raceway',
  'downtown',
  'towers',
] as const;
export type LayoutName = (typeof LAYOUT_NAMES)[number];

/** A layout's recipe for a city, in cell units. The generator fills everything else with Plots. */
export interface LayoutSpec {
  name: LayoutName;
  /** Ground no Plot may cover: Avenues, loops and Plazas. */
  open: Shape[];
  /** Where Plaza obstacles may stand. Each should lie within `open`. */
  plazas: Shape[];
  /** The city is the union of these circles; beyond it stands the Edge. */
  boundary: Circle[];
  spawn: Vec2;
  spawnHeading: number;
  /** How often each building outline appears. */
  footprints: FootprintWeights;
  /** Roads whose buildings stand all Run, so the Layout's shape reads from the first Wave. */
  lined: Shape[];
  /** Overrides how often, and how wide, gates break the walls along lined roads. */
  liningGates?: { gateSpacing: number; gate: number };
  /** Replaces the default cut of the Arena into lots by Streets and Alleys. */
  lots?: Rect[];
  /** If set, buildings stand only inside these areas; everywhere else is open ground. */
  buildOnly?: Shape[];
  /** Rules for the buildings around a point, in cells; defaults apply where it returns nothing. */
  zone?: (x: number, y: number) => Zone | undefined;
}

/** How one part of a city builds, overriding the defaults for Plots there. */
export interface Zone {
  /** Multiplies building heights. */
  heightScale?: number;
  /** Chance a Plot here stays open ground instead of a building. */
  emptyChance?: number;
  /** Buildings here Rise in the first Wave and never Sink. */
  permanent?: boolean;
  /** Heights drawn from this range instead of the usual ones, ignoring `heightScale`. */
  heightRange?: readonly [number, number];
  /** Lots here are split by Alleys into buildings no wider than this many cells: towers. */
  maxPlotCells?: number;
}

/**
 * Grid is square towers and blocks; Circuit and Hub favor chamfers that read as curves;
 * Districts is a cramped old town of bays and crosses.
 */
const FOOTPRINTS: Record<LayoutName, FootprintWeights> = {
  grid: { rect: 8, L: 1, U: 1 },
  circuit: { rect: 3, L: 2, stepped: 3, T: 1 },
  districts: { rect: 2, L: 2, T: 2, U: 2, cross: 2, Z: 1 },
  hub: { rect: 3, L: 2, stepped: 2, T: 1, cross: 1 },
  raceway: { rect: 4, L: 2, stepped: 2, T: 1 },
  downtown: { rect: 3, L: 2, T: 2, U: 1, cross: 1 },
  towers: { rect: 2, cross: 2, L: 2, T: 2, stepped: 1 },
};

export const LAYOUTS: Record<LayoutName, (rng: Rng, cells: number) => LayoutSpec> = {
  grid,
  circuit,
  districts,
  hub,
  raceway,
  downtown,
  towers,
};

const TAU = Math.PI * 2;

/** Shrinks a circle until it stays a cell clear of the Arena wall. */
function fit(c: Circle, cells: number): Circle {
  const room = Math.min(c.x, c.y, cells - c.x, cells - c.y) - 1;
  return { ...c, r: Math.max(2, Math.min(c.r, room)) };
}

/** A central circle with overlapping lobes around it: a scalloped outline of several arcs. */
function arcBoundary(rng: Rng, cells: number): Circle[] {
  const half = cells / 2;
  const circles = [{ x: half, y: half, r: half * rng.range(0.62, 0.72) }];
  const lobes = 3 + rng.int(3);
  const start = rng.range(0, TAU);
  for (let i = 0; i < lobes; i++) {
    const a = start + (i * TAU) / lobes + rng.range(-0.4, 0.4);
    const offset = half * rng.range(0.2, 0.4);
    circles.push({
      x: half + Math.cos(a) * offset,
      y: half + Math.sin(a) * offset,
      r: half * rng.range(0.5, 0.75),
    });
  }
  return circles.map((c) => fit(c, cells));
}

/**
 * A regular lattice of square blocks, Streets between them and an Avenue every few blocks, around a
 * square central Plaza with a few parks. Most blocks hold four square buildings; some hold one tall
 * tower, alone or set back on its block. Buildings grow taller toward the center.
 */
function grid(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const { avenue, street, alley } = CONFIG.city;
  const block = 10 + 2 * rng.int(2);
  const avenueEvery = 2 + rng.int(2);

  /** Block starts along one axis, a block centered on the Arena, and where its Avenues run. */
  const axis = () => {
    const phase = rng.int(avenueEvery);
    const road = (k: number) => (((k + phase) % avenueEvery) + avenueEvery) % avenueEvery === 0;
    const blocks = [mid - block / 2];
    const avenues: number[] = [];
    for (let k = 0, at = mid + block / 2; at < cells - 1; k++) {
      if (road(k)) avenues.push(at);
      at += road(k) ? avenue : street;
      blocks.push(at);
      at += block;
    }
    for (let k = -1, at = mid - block / 2; at > 1; k--) {
      at -= road(k) ? avenue : street;
      if (road(k)) avenues.push(at);
      at -= block;
      blocks.unshift(at);
    }
    return { blocks, avenues };
  };
  const columns = axis();
  const rows = axis();

  const plaza: Shape = {
    kind: 'rect',
    x: mid - block / 2 - street,
    y: mid - block / 2 - street,
    w: block + 2 * street,
    h: block + 2 * street,
  };
  const open: Shape[] = [plaza];
  for (const x of columns.avenues) open.push({ kind: 'rect', x, y: 0, w: avenue, h: cells });
  for (const y of rows.avenues) open.push({ kind: 'rect', x: 0, y, w: cells, h: avenue });

  const center = (bx: number, by: number) => Math.hypot(bx + block / 2 - mid, by + block / 2 - mid);
  const blocks = rows.blocks.flatMap((by) => columns.blocks.map((bx) => ({ bx, by })));
  const parkable = blocks.filter(({ bx, by }) => {
    const d = center(bx, by);
    return d > block * 1.2 && d < half * 0.6;
  });
  const parks: Shape[] = [];
  for (let i = 2 + rng.int(2); i > 0 && parkable.length > 0; i--) {
    const [{ bx, by }] = parkable.splice(rng.int(parkable.length), 1) as [(typeof blocks)[number]];
    parks.push({ kind: 'rect', x: bx, y: by, w: block, h: block });
  }
  open.push(...parks);

  const lots: Rect[] = [];
  const quad = (block - alley) / 2;
  for (const { bx, by } of blocks) {
    if (center(bx, by) < 1 || parks.some((p) => p.kind === 'rect' && p.x === bx && p.y === by))
      continue;
    const roll = rng.next();
    if (roll < 0.12) {
      lots.push({ x: bx, y: by, w: block, h: block });
    } else if (roll < 0.22) {
      lots.push({ x: bx + 2, y: by + 2, w: block - 4, h: block - 4 });
    } else {
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const)
        lots.push({ x: bx + dx * (quad + alley), y: by + dy * (quad + alley), w: quad, h: quad });
    }
  }

  return {
    name: 'grid',
    footprints: FOOTPRINTS.grid,
    lined: [],
    lots: lots.map((r) => clip(r, cells)).filter((r) => r.w > 0 && r.h > 0),
    open,
    plazas: [plaza, ...parks],
    boundary: arcBoundary(rng, cells),
    spawn: { x: mid, y: mid },
    spawnHeading: -Math.PI / 2,
    zone: (x, y) => ({
      emptyChance: 0.04,
      heightScale: 0.8 + 1.4 * Math.max(0, 1 - Math.hypot(x - mid, y - mid) / (half * 0.8)),
    }),
  };
}

/** Clips a rectangle to the cells inside the Arena wall. */
function clip(r: Rect, cells: number): Rect {
  const x = Math.max(1, r.x);
  const y = Math.max(1, r.y);
  return {
    x,
    y,
    w: Math.min(cells - 1, r.x + r.w) - x,
    h: Math.min(cells - 1, r.y + r.h) - y,
  };
}

/** A wide loop around a dense core, with spurs out to side Plazas. */
function circuit(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const rx = half * rng.range(0.5, 0.6);
  const ry = half * rng.range(0.5, 0.6);
  const core: Shape = { kind: 'disc', x: mid, y: mid, r: 5 };
  const loop: Shape = { kind: 'ring', x: mid, y: mid, rx, ry, width: avenue + 2 };
  const open: Shape[] = [loop, core];
  const plazas: Shape[] = [core];
  const boundary: Circle[] = [fit({ x: mid, y: mid, r: Math.max(rx, ry) + 9 }, cells)];

  // Streets across the core, so it can be cut through as well as lapped.
  const cross = rng.range(0, TAU);
  for (const a of [cross, cross + Math.PI / 2]) {
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    open.push({
      kind: 'capsule',
      ax: mid - dx * rx,
      ay: mid - dy * ry,
      bx: mid + dx * rx,
      by: mid + dy * ry,
      width: 3,
    });
  }

  const spurs = 3 + rng.int(2);
  const start = rng.range(0, TAU);
  for (let i = 0; i < spurs; i++) {
    const a = start + (i * TAU) / spurs + rng.range(-0.3, 0.3);
    const r = rng.range(5, 8);
    const reach = 10 + r;
    const margin = r + 3;
    const x = Math.min(cells - margin, Math.max(margin, mid + Math.cos(a) * (rx + reach)));
    const y = Math.min(cells - margin, Math.max(margin, mid + Math.sin(a) * (ry + reach)));
    const plaza: Shape = { kind: 'disc', x, y, r };
    open.push(plaza, {
      kind: 'capsule',
      ax: mid + Math.cos(a) * rx,
      ay: mid + Math.sin(a) * ry,
      bx: x,
      by: y,
      width: avenue,
    });
    plazas.push(plaza);
    boundary.push(fit({ x, y, r: r + 8 }, cells));
  }
  return {
    name: 'circuit',
    footprints: FOOTPRINTS.circuit,
    lined: [loop],
    open,
    plazas,
    boundary,
    spawn: { x: mid + rx, y: mid },
    spawnHeading: Math.PI / 2,
  };
}

/** Several Plazas of different sizes joined by Avenues, with the city hugging them. */
function districts(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const count = 3 + rng.int(3);
  const centers: (Vec2 & { r: number })[] = [];
  for (let attempt = 0; attempt < 500 && centers.length < count; attempt++) {
    const a = rng.range(0, TAU);
    const d = half * 0.55 * Math.sqrt(rng.next());
    const p = { x: mid + Math.cos(a) * d, y: mid + Math.sin(a) * d };
    if (centers.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 22)) continue;
    centers.push({ ...p, r: centers.length === 0 ? rng.range(9, 12) : rng.range(5, 8) });
  }

  const plazas: Shape[] = centers.map((c) =>
    rng.next() < 0.5
      ? { kind: 'disc', x: c.x, y: c.y, r: c.r }
      : {
          kind: 'rect',
          x: Math.round(c.x - c.r),
          y: Math.round(c.y - c.r),
          w: Math.round(c.r * 2),
          h: Math.round(c.r * 2),
        },
  );
  const open: Shape[] = [...plazas];
  const boundary: Circle[] = centers.map((c) =>
    fit({ x: c.x, y: c.y, r: c.r + rng.range(13, 18) }, cells),
  );

  const link = (a: Vec2, b: Vec2) => {
    open.push({ kind: 'capsule', ax: a.x, ay: a.y, bx: b.x, by: b.y, width: avenue });
    // Keep the city around the whole Avenue, not just its ends.
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    for (let t = 0; t <= length; t += 8) {
      const f = t / (length || 1);
      boundary.push(fit({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, r: 10 }, cells));
    }
  };
  // Prim's minimum spanning tree joins every Plaza; one extra link adds a loop to circle around.
  const joined = [0];
  const used = new Set<string>();
  while (joined.length < centers.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of joined) {
      centers.forEach((c, j) => {
        if (joined.includes(j)) return;
        const d = Math.hypot(c.x - centers[i]!.x, c.y - centers[i]!.y);
        if (d < bestD) [bestD, best] = [d, [i, j]];
      });
    }
    const [i, j] = best!;
    link(centers[i]!, centers[j]!);
    used.add(`${Math.min(i, j)},${Math.max(i, j)}`);
    joined.push(j);
  }
  if (centers.length >= 3) {
    let extra: [number, number] | null = null;
    let extraD = Infinity;
    for (let i = 0; i < centers.length; i++)
      for (let j = i + 1; j < centers.length; j++) {
        const d = Math.hypot(centers[i]!.x - centers[j]!.x, centers[i]!.y - centers[j]!.y);
        if (!used.has(`${i},${j}`) && d < extraD) [extraD, extra] = [d, [i, j]];
      }
    if (extra) link(centers[extra[0]]!, centers[extra[1]]!);
  }

  return {
    name: 'districts',
    footprints: FOOTPRINTS.districts,
    lined: [],
    open,
    plazas,
    boundary,
    spawn: { x: centers[0]!.x, y: centers[0]!.y },
    spawnHeading: -Math.PI / 2,
    // Smaller buildings, so the old town reads as clusters to thread rather than long walls.
    zone: () => ({ maxPlotCells: 7 }),
  };
}

/**
 * A central Plaza with walled Avenues radiating out to Plazas of their own, crossed by two ring roads
 * broken into arcs. Spokes vary in angle and length, so the city's outline is a lopsided star.
 */
function hub(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const plaza: Shape = { kind: 'disc', x: mid, y: mid, r: rng.range(9, 11) };
  const open: Shape[] = [plaza];
  const plazas: Shape[] = [plaza];
  const spokes: Shape[] = [];
  const boundary: Circle[] = [fit({ x: mid, y: mid, r: half * 0.42 }, cells)];
  /** Keeps the city around a road, not just its ends. */
  const follow = (x: number, y: number) => boundary.push(fit({ x, y, r: 10 }, cells));

  const count = 5 + rng.int(3);
  const start = rng.range(0, TAU);
  for (let i = 0; i < count; i++) {
    const a = start + ((i + rng.range(-0.3, 0.3)) * TAU) / count;
    const r = rng.range(5, 8);
    const margin = r + 3;
    const length = half * rng.range(0.55, 0.85);
    const x = Math.min(cells - margin, Math.max(margin, mid + Math.cos(a) * length));
    const y = Math.min(cells - margin, Math.max(margin, mid + Math.sin(a) * length));
    const end: Shape = { kind: 'disc', x, y, r };
    spokes.push({ kind: 'capsule', ax: mid, ay: mid, bx: x, by: y, width: avenue + 1 });
    open.push(end);
    plazas.push(end);
    boundary.push(fit({ x, y, r: r + 8 }, cells));
    const reach = Math.hypot(x - mid, y - mid);
    for (let t = 0; t < reach; t += 8)
      follow(mid + ((x - mid) * t) / reach, mid + ((y - mid) * t) / reach);
  }

  for (const f of [0.36, 0.62]) {
    const radius = half * f;
    const arcs = 2 + rng.int(2);
    const offset = rng.range(0, TAU);
    for (let j = 0; j < arcs; j++) {
      const gap = rng.range(0.5, 1.1);
      const from = offset + (j * TAU) / arcs + gap / 2;
      const sweep = TAU / arcs - gap;
      open.push({
        kind: 'ring',
        x: mid,
        y: mid,
        rx: radius,
        ry: radius,
        width: avenue,
        from,
        sweep,
      });
      for (let t = 0; t <= sweep * radius; t += 8)
        follow(
          mid + Math.cos(from + t / radius) * radius,
          mid + Math.sin(from + t / radius) * radius,
        );
    }
  }

  return {
    name: 'hub',
    footprints: FOOTPRINTS.hub,
    lined: spokes,
    // Wide, frequent gates: the spokes read as walled, but the ship can peel off them at speed.
    liningGates: { gateSpacing: 8, gate: 3 },
    open: [...spokes, ...open],
    plazas,
    boundary,
    spawn: { x: mid, y: mid },
    spawnHeading: -Math.PI / 2,
  };
}

/**
 * Broad highways to race: a figure-eight at the center inside a sharp-cornered polygon loop, joined
 * by connectors, with Plazas at the crossing and the corners. Walls line every highway.
 */
function raceway(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const width = CONFIG.city.avenue + 2;
  const highways: Shape[] = [];
  const plazas: Shape[] = [];
  const boundary: Circle[] = [];

  // Figure-eight: two rings meeting at the center, on a random axis.
  const axis = rng.range(0, Math.PI);
  const r8 = half * rng.range(0.22, 0.26);
  const lobes = [1, -1].map((side) => ({
    x: mid + Math.cos(axis) * r8 * side,
    y: mid + Math.sin(axis) * r8 * side,
  }));
  for (const c of lobes) highways.push({ kind: 'ring', x: c.x, y: c.y, rx: r8, ry: r8, width });
  plazas.push({ kind: 'disc', x: mid, y: mid, r: 10 });

  // Sharp-cornered outer loop: a triangle to a hexagon.
  const sides = 3 + rng.int(4);
  const radius = half * 0.68;
  const turn = rng.range(0, TAU);
  const corners = Array.from({ length: sides }, (_, i) => ({
    x: mid + Math.cos(turn + (i * TAU) / sides) * radius,
    y: mid + Math.sin(turn + (i * TAU) / sides) * radius,
  }));
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % sides]!;
    highways.push({ kind: 'capsule', ax: a.x, ay: a.y, bx: b.x, by: b.y, width });
    plazas.push({ kind: 'disc', x: a.x, y: a.y, r: 8 });
    boundary.push(fit({ x: a.x, y: a.y, r: 13 }, cells));
  });

  // Connectors from each lobe's far side out to the nearest corner.
  for (const lobe of lobes) {
    const outward = Math.atan2(lobe.y - mid, lobe.x - mid);
    const from = { x: lobe.x + Math.cos(outward) * r8, y: lobe.y + Math.sin(outward) * r8 };
    const to = corners.reduce((best, c) =>
      Math.hypot(c.x - from.x, c.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y)
        ? c
        : best,
    );
    highways.push({ kind: 'capsule', ax: from.x, ay: from.y, bx: to.x, by: to.y, width });
  }
  boundary.push(fit({ x: mid, y: mid, r: radius + 7 }, cells));

  return {
    name: 'raceway',
    footprints: FOOTPRINTS.raceway,
    open: [...highways, ...plazas],
    lined: highways,
    // Short wall segments with wide gaps: the highways stay readable but can be left at speed.
    liningGates: { gateSpacing: 7, gate: 3 },
    plazas,
    boundary,
    spawn: { x: mid, y: mid },
    spawnHeading: axis + Math.PI / 2,
  };
}

/**
 * A dense downtown of skyscrapers standing anywhere from the city's center out to its outline, where
 * part of it merges into the Edge and the open suburbs wrap around the rest in a U. A ring road
 * skirts it, two streets cross it, boulevards run out through low, half-empty suburbs, and parks
 * dot the open ground.
 */
function downtown(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const outline = arcBoundary(rng, cells);

  // Walk out from the center to where the outline is, on a random bearing: downtown centers somewhere
  // along the way.
  const bearing = rng.range(0, TAU);
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  let reach = 0;
  while (reach < half && unionDistance(outline, mid + dx * reach, mid + dy * reach) < 0) reach++;
  const along = reach * rng.next();
  const cx = mid + dx * along;
  const cy = mid + dy * along;
  const core = half * rng.range(0.36, 0.44);
  const ring = core + 3;

  const open: Shape[] = [{ kind: 'ring', x: cx, y: cy, rx: ring, ry: ring, width: avenue }];
  const cross = rng.range(0, TAU);
  for (const a of [cross, cross + Math.PI / 2 + rng.range(-0.3, 0.3)]) {
    open.push({
      kind: 'capsule',
      ax: cx - Math.cos(a) * ring,
      ay: cy - Math.sin(a) * ring,
      bx: cx + Math.cos(a) * ring,
      by: cy + Math.sin(a) * ring,
      width: CONFIG.city.street + 1,
    });
  }
  for (const turn of [-0.7, 0, 0.7]) {
    const a = bearing + Math.PI + turn;
    open.push({
      kind: 'capsule',
      ax: cx + Math.cos(a) * ring,
      ay: cy + Math.sin(a) * ring,
      bx: cx + Math.cos(a) * (core + half * 1.4),
      by: cy + Math.sin(a) * (core + half * 1.4),
      width: avenue,
    });
  }

  const parks: Shape[] = [];
  for (let attempt = 0; attempt < 600 && parks.length < 4; attempt++) {
    const r = rng.range(6, 9);
    const x = rng.range(0, cells);
    const y = rng.range(0, cells);
    if (Math.hypot(x - cx, y - cy) < ring + 6) continue;
    if (unionDistance(outline, x, y) > -(r + 3)) continue;
    if (parks.some((p) => p.kind === 'disc' && Math.hypot(p.x - x, p.y - y) < 19)) continue;
    parks.push({ kind: 'disc', x, y, r });
  }
  // The park farthest from downtown, looking back at the skyline.
  const spawnPark = parks.reduce<Shape | undefined>(
    (best, p) =>
      p.kind === 'disc' &&
      (!best ||
        (best.kind === 'disc' &&
          Math.hypot(p.x - cx, p.y - cy) > Math.hypot(best.x - cx, best.y - cy)))
        ? p
        : best,
    undefined,
  );
  const spawn =
    spawnPark?.kind === 'disc'
      ? { x: spawnPark.x, y: spawnPark.y }
      : { x: cx - dx * ring, y: cy - dy * ring };

  return {
    name: 'downtown',
    footprints: FOOTPRINTS.downtown,
    open: [...open, ...parks],
    lined: [],
    plazas: parks,
    boundary: outline,
    spawn,
    spawnHeading: Math.atan2(cy - spawn.y, cx - spawn.x),
    zone: (x, y) =>
      Math.hypot(x - cx, y - cy) < core
        ? { permanent: true, emptyChance: 0, heightRange: [22, 42], maxPlotCells: 4 }
        : { heightScale: 0.55, emptyChance: 0.5 },
  };
}

/** Open ground with four to eight isolated clumps of tall towers, and a field at the center. */
function towers(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const field: Shape = { kind: 'disc', x: mid, y: mid, r: 11 };
  const count = 4 + rng.int(5);
  const clumps: Shape[] = [];
  const centers: Vec2[] = [];
  for (let attempt = 0; attempt < 500 && clumps.length < count; attempt++) {
    const a = rng.range(0, TAU);
    const d = rng.range(half * 0.38, half * 0.66);
    const c = { x: mid + Math.cos(a) * d, y: mid + Math.sin(a) * d };
    if (centers.some((o) => Math.hypot(o.x - c.x, o.y - c.y) < 22)) continue;
    centers.push(c);
    const size = 14 + rng.int(7);
    clumps.push(
      rng.next() < 0.5
        ? { kind: 'disc', x: c.x, y: c.y, r: size / 2 + 1 }
        : {
            kind: 'rect',
            x: Math.round(c.x - size / 2),
            y: Math.round(c.y - size / 2),
            w: size,
            h: size,
          },
    );
  }
  return {
    name: 'towers',
    footprints: FOOTPRINTS.towers,
    open: [field],
    lined: [],
    plazas: [field],
    boundary: arcBoundary(rng, cells),
    spawn: { x: mid, y: mid },
    spawnHeading: -Math.PI / 2,
    buildOnly: clumps,
    zone: () => ({ emptyChance: 0.08, heightRange: [30, 56], maxPlotCells: 3 }),
  };
}
