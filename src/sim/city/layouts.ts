import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/vec2';
import type { FootprintWeights } from './footprints';
import type { Circle, Shape } from './shapes';

export const LAYOUT_NAMES = ['grid', 'circuit', 'districts', 'hub'] as const;
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
}

/**
 * Grid keeps clean walls along its speed lanes; Circuit and Hub favour chamfers that read as curves;
 * Districts is a cramped old town of bays and crosses.
 */
const FOOTPRINTS: Record<LayoutName, FootprintWeights> = {
  grid: { rect: 5, L: 3, T: 1, Z: 1 },
  circuit: { rect: 3, L: 2, stepped: 3, T: 1 },
  districts: { rect: 2, L: 2, T: 2, U: 2, cross: 2, Z: 1 },
  hub: { rect: 3, L: 2, stepped: 2, T: 1, cross: 1 },
};

export const LAYOUTS: Record<LayoutName, (rng: Rng, cells: number) => LayoutSpec> = {
  grid,
  circuit,
  districts,
  hub,
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
  const open: Shape[] = [{ kind: 'ring', x: mid, y: mid, rx, ry, width: avenue + 1 }, core];
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
  const centres: (Vec2 & { r: number })[] = [];
  for (let attempt = 0; attempt < 500 && centres.length < count; attempt++) {
    const a = rng.range(0, TAU);
    const d = half * 0.55 * Math.sqrt(rng.next());
    const p = { x: mid + Math.cos(a) * d, y: mid + Math.sin(a) * d };
    if (centres.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 22)) continue;
    centres.push({ ...p, r: centres.length === 0 ? rng.range(9, 12) : rng.range(5, 8) });
  }

  const plazas: Shape[] = centres.map((c) =>
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
  const boundary: Circle[] = centres.map((c) =>
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
  while (joined.length < centres.length) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const i of joined) {
      centres.forEach((c, j) => {
        if (joined.includes(j)) return;
        const d = Math.hypot(c.x - centres[i]!.x, c.y - centres[i]!.y);
        if (d < bestD) [bestD, best] = [d, [i, j]];
      });
    }
    const [i, j] = best!;
    link(centres[i]!, centres[j]!);
    used.add(`${Math.min(i, j)},${Math.max(i, j)}`);
    joined.push(j);
  }
  if (centres.length >= 3) {
    let extra: [number, number] | null = null;
    let extraD = Infinity;
    for (let i = 0; i < centres.length; i++)
      for (let j = i + 1; j < centres.length; j++) {
        const d = Math.hypot(centres[i]!.x - centres[j]!.x, centres[i]!.y - centres[j]!.y);
        if (!used.has(`${i},${j}`) && d < extraD) [extraD, extra] = [d, [i, j]];
      }
    if (extra) link(centres[extra[0]]!, centres[extra[1]]!);
  }

  return {
    name: 'districts',
    footprints: FOOTPRINTS.districts,
    open,
    plazas,
    boundary,
    spawn: { x: centres[0]!.x, y: centres[0]!.y },
    spawnHeading: -Math.PI / 2,
  };
}

/** A central Plaza with Avenues radiating out, crossed by ring roads. */
function hub(rng: Rng, cells: number): LayoutSpec {
  const mid = cells / 2;
  const half = cells / 2;
  const avenue = CONFIG.city.avenue;
  const plaza: Shape = { kind: 'disc', x: mid, y: mid, r: rng.range(9, 11) };
  const open: Shape[] = [plaza];
  const spokes = 6 + rng.int(3);
  const start = rng.range(0, TAU);
  for (let i = 0; i < spokes; i++) {
    const a = start + (i * TAU) / spokes + rng.range(-0.15, 0.15);
    open.push({
      kind: 'capsule',
      ax: mid,
      ay: mid,
      bx: mid + Math.cos(a) * half,
      by: mid + Math.sin(a) * half,
      width: avenue,
    });
  }
  for (const f of [0.45, 0.75]) {
    const r = half * f;
    open.push({ kind: 'ring', x: mid, y: mid, rx: r, ry: r, width: 3 });
  }
  return {
    name: 'hub',
    footprints: FOOTPRINTS.hub,
    open,
    plazas: [plaza],
    boundary: arcBoundary(rng, cells),
    spawn: { x: mid, y: mid },
    spawnHeading: -Math.PI / 2,
  };
}
