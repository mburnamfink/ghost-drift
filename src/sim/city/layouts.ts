import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { FootprintWeights } from './footprints';
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
 * Grid keeps clean walls along its speed lanes; Circuit and Hub favor chamfers that read as curves;
 * Districts is a cramped old town of bays and crosses.
 */
const FOOTPRINTS: Record<LayoutName, FootprintWeights> = {
  grid: { rect: 5, L: 3, T: 1, Z: 1 },
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

/** Avenues running edge to edge in both directions around a square central Plaza. */
function grid(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const avenue = CONFIG.city.avenue;
  const plazaHalf = Math.round(cells * 0.12);
  const plaza: Shape = {
    kind: 'rect',
    x: mid - plazaHalf,
    y: mid - plazaHalf,
    w: plazaHalf * 2,
    h: plazaHalf * 2,
  };
  const lines = (): number[] => {
    const out = [mid - plazaHalf - avenue, mid + plazaHalf];
    for (let at = mid - plazaHalf - avenue; ;) {
      at -= avenue + 13 + rng.int(9);
      if (at < 2) break;
      out.push(at);
    }
    for (let at = mid + plazaHalf; ;) {
      at += avenue + 13 + rng.int(9);
      if (at > cells - avenue - 2) break;
      out.push(at);
    }
    return out;
  };
  const open: Shape[] = [plaza];
  for (const x of lines()) open.push({ kind: 'rect', x, y: 0, w: avenue, h: cells });
  for (const y of lines()) open.push({ kind: 'rect', x: 0, y, w: cells, h: avenue });
  return {
    name: 'grid',
    footprints: FOOTPRINTS.grid,
    lined: [],
    open,
    plazas: [plaza],
    boundary: arcBoundary(rng, cells),
    spawn: { x: mid, y: mid },
    spawnHeading: -Math.PI / 2,
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
  };
}

/** A central Plaza with Avenues radiating out, crossed by ring roads. */
function hub(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const plaza: Shape = { kind: 'disc', x: mid, y: mid, r: rng.range(10, 12) };
  const spokes: Shape[] = [];
  const count = 6 + rng.int(3);
  const start = rng.range(0, TAU);
  for (let i = 0; i < count; i++) {
    const a = start + (i * TAU) / count + rng.range(-0.15, 0.15);
    spokes.push({
      kind: 'capsule',
      ax: mid,
      ay: mid,
      bx: mid + Math.cos(a) * half,
      by: mid + Math.sin(a) * half,
      width: avenue + 1,
    });
  }
  const open: Shape[] = [plaza, ...spokes];
  for (const f of [0.45, 0.75]) {
    const r = half * f;
    open.push({ kind: 'ring', x: mid, y: mid, rx: r, ry: r, width: 3 });
  }
  return {
    name: 'hub',
    footprints: FOOTPRINTS.hub,
    lined: spokes,
    open,
    plazas: [plaza],
    boundary: arcBoundary(rng, cells),
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
    plazas,
    boundary,
    spawn: { x: mid, y: mid },
    spawnHeading: axis + Math.PI / 2,
  };
}

/**
 * A dense downtown of skyscrapers centered on the city's outline, so half of it merges into the
 * Edge and the open suburbs wrap around the rest in a U. A ring road skirts it, boulevards run out
 * through low, half-empty suburbs, and parks dot the open ground.
 */
function downtown(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const outline = arcBoundary(rng, cells);

  // Walk out from the center to where the outline is, on a random bearing: downtown centers there.
  const bearing = rng.range(0, TAU);
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  let reach = 0;
  while (reach < half && unionDistance(outline, mid + dx * reach, mid + dy * reach) < 0) reach++;
  const cx = mid + dx * reach;
  const cy = mid + dy * reach;
  const core = half * rng.range(0.42, 0.5);

  const open: Shape[] = [{ kind: 'ring', x: cx, y: cy, rx: core + 3, ry: core + 3, width: avenue }];
  for (const turn of [-0.7, 0, 0.7]) {
    const a = bearing + Math.PI + turn;
    open.push({
      kind: 'capsule',
      ax: cx + Math.cos(a) * (core + 3),
      ay: cy + Math.sin(a) * (core + 3),
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
    if (Math.hypot(x - cx, y - cy) < core + 12) continue;
    if (unionDistance(outline, x, y) > -(r + 4)) continue;
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
      : { x: mid - dx * 20, y: mid - dy * 20 };

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
