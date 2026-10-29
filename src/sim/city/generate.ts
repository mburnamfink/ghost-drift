import { CONFIG } from '../../config';
import type { Rng } from '../../core/rng';
import type { LayoutSpec } from './layouts';
import { carveFootprint, pickFootprint } from './footprints';
import type { Arch, CityPlan, Plot, Rect } from './plan';
import { partsOf } from '../terrain';
import { type Shape, contains, unionDistance } from './shapes';

/**
 * Builds a city from a layout (ADR-0006). The whole Arena is cut into Plots by Streets and Alleys;
 * each Plot is then trimmed to the largest rectangle clear of the layout's open ground and inside its
 * boundary. Ground beyond the boundary, and any pocket cut off from the spawn, becomes the Edge: tall
 * Blocks that stand all Run. Plots near the Edge Rise sooner and stand taller, so the city thickens
 * toward it.
 */
export function buildCity(spec: LayoutSpec, rng: Rng, cells: number): CityPlan {
  const c = CONFIG.city;
  const n = cells;
  const at = (x: number, y: number) => y * n + x;

  const edgeDistance = new Float32Array(n * n);
  const inside = new Uint8Array(n * n);
  const open = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = at(x, y);
      edgeDistance[i] = unionDistance(spec.boundary, x + 0.5, y + 0.5);
      const interior = x > 0 && y > 0 && x < n - 1 && y < n - 1;
      inside[i] = interior && edgeDistance[i]! <= 0 ? 1 : 0;
      open[i] = inside[i] && spec.open.some((s) => contains(s, x + 0.5, y + 0.5)) ? 1 : 0;
    }
  }
  const buildable = (x: number, y: number) => inside[at(x, y)] === 1 && open[at(x, y)] === 0;

  const lots = subdivide(rng, n)
    .map((r) => largestRect(r, buildable))
    .filter(
      (r): r is Rect =>
        r !== null && r.w >= c.minTrimmedPlot && r.h >= c.minTrimmedPlot && r.w * r.h >= 6,
    );

  const covered = new Uint8Array(n * n);
  for (const r of lots) forCells(r, (x, y) => (covered[at(x, y)] = 1));
  const reached = floodFrom(spec, n, (x, y) => inside[at(x, y)] === 1 && covered[at(x, y)] === 0);
  const edge = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) edge[i] = inside[i] === 0 || (!covered[i] && !reached[i]) ? 1 : 0;
  // A Plot with no reachable road beside it would wall off nothing but itself; fold it into the Edge.
  const reachable = lots.filter((r) => {
    let touches = false;
    forRing(r, n, (x, y) => (touches ||= reached[at(x, y)] === 1));
    if (!touches) forCells(r, (x, y) => (edge[at(x, y)] = 1));
    return touches;
  });

  const plots: Plot[] = [];
  let nextId = 1;
  for (const r of reachable) {
    if (rng.next() < c.emptyPlotChance) continue;
    // Faces open ground across at most a Street.
    let frontage = false;
    const reach = c.street + 1;
    forCells({ x: r.x - reach, y: r.y - reach, w: r.w + 2 * reach, h: r.h + 2 * reach }, (x, y) => {
      if (x >= 0 && y >= 0 && x < n && y < n) frontage ||= open[at(x, y)] === 1;
    });
    const d = edgeDistance[at(r.x + (r.w >> 1), r.y + (r.h >> 1))]!;
    const nearEdge = Math.min(1, Math.max(0, 1 + d / c.edgeBand));
    const size = Math.min(1, (r.w * r.h) / (c.maxPlotCells * c.maxPlotCells));
    const parts = carveFootprint(rng, r, pickFootprint(rng, spec.footprints, r, frontage));
    plots.push({
      ...r,
      ...(parts ? { parts } : {}),
      id: nextId++,
      kind: 'building',
      height:
        c.minBlockHeight +
        (c.maxBlockHeight - c.minBlockHeight) * (0.5 * size + 0.5 * rng.next()) +
        c.edgeExtraHeight * nearEdge,
      priority:
        r.w *
        r.h *
        rng.range(0.6, 1.4) *
        (frontage ? c.frontagePriority : 1) *
        (1 + c.edgePriority * nearEdge),
    });
  }

  keepRoadsConnected(plots, spec, n, (x, y) => edge[at(x, y)] === 1);
  const arch = pickArch(
    rng,
    plots,
    n,
    (x, y) => inside[at(x, y)] === 1 && edge[at(x, y)] === 0,
    (x, y) => open[at(x, y)] === 1,
  );

  for (const r of coverWithRects(edge, n, (x, y) => (edgeDistance[at(x, y)]! < 6 ? 4 : 10))) {
    const depth = Math.max(0, edgeDistance[at(r.x + (r.w >> 1), r.y + (r.h >> 1))]!);
    const [lo, hi] = c.edgeHeight;
    plots.push({
      ...r,
      id: nextId++,
      kind: 'edge',
      height: Math.min(hi, rng.range(lo, lo + 6) + depth * 0.6),
      priority: 0,
    });
  }

  for (const r of plazaObstacles(rng, spec, n, (x, y) => open[at(x, y)] === 1)) {
    const [lo, hi] = c.plazaObstacleHeight;
    plots.push({
      ...r,
      id: nextId++,
      kind: 'plaza',
      height: rng.range(lo, hi),
      priority: rng.next(),
    });
  }

  return {
    layout: spec.name,
    plots,
    arch,
    spawn: spec.spawn,
    spawnHeading: spec.spawnHeading,
  };
}

/**
 * Restores to a full rectangle any shaped building whose cut-out would be sealed off: a corner cut
 * against the Edge or another wall can enclose a pocket the roads never reach.
 */
function keepRoadsConnected(
  buildings: Plot[],
  spec: LayoutSpec,
  cells: number,
  isEdge: (x: number, y: number) => boolean,
): void {
  const solid = new Uint8Array(cells * cells);
  for (const p of buildings)
    for (const r of partsOf(p)) forCells(r, (x, y) => (solid[y * cells + x] = 1));
  const reached = floodFrom(spec, cells, (x, y) => !isEdge(x, y) && solid[y * cells + x] === 0);
  for (const p of buildings) {
    if (!p.parts) continue;
    let sealed = false;
    forCells(p, (x, y) => (sealed ||= solid[y * cells + x] === 0 && reached[y * cells + x] === 0));
    if (sealed) delete p.parts;
  }
}

/**
 * Picks the best pair of buildings facing each other across a clear road for the city's one Arch,
 * favouring wide spans and spans over Avenues and Plazas. Both become full-height rectangular towers.
 */
function pickArch(
  rng: Rng,
  buildings: Plot[],
  cells: number,
  ground: (x: number, y: number) => boolean,
  open: (x: number, y: number) => boolean,
): Arch | null {
  const cfg = CONFIG.city.arch;
  const occupied = new Uint8Array(cells * cells);
  for (const p of buildings) forCells(p, (x, y) => (occupied[y * cells + x] = 1));

  let best: { arch: Omit<Arch, 'top'>; score: number } | null = null;
  const consider = (a: Plot, b: Plot, axis: 'x' | 'y') => {
    const [aEnd, bStart] = axis === 'x' ? [a.x + a.w, b.x] : [a.y + a.h, b.y];
    const gap = bStart - aEnd;
    if (gap < cfg.minGap || gap > cfg.maxGap) return;
    const [lo, hi] =
      axis === 'x'
        ? [Math.max(a.y, b.y), Math.min(a.y + a.h, b.y + b.h)]
        : [Math.max(a.x, b.x), Math.min(a.x + a.w, b.x + b.w)];
    if (hi - lo < cfg.minOverlap) return;
    const width = Math.min(cfg.maxWidth, hi - lo);
    const from = lo + Math.floor((hi - lo - width) / 2);
    const span =
      axis === 'x'
        ? { x: aEnd, y: from, w: gap, h: width }
        : { x: from, y: aEnd, w: width, h: gap };
    let clear = true;
    let overOpen = false;
    forCells(span, (x, y) => {
      clear &&= ground(x, y) && occupied[y * cells + x] === 0;
      overOpen ||= open(x, y);
    });
    if (!clear) return;
    const score = gap + (overOpen ? 4 : 0) + rng.next() * 2;
    if (!best || score > best.score) best = { arch: { a: a.id, b: b.id, axis, span }, score };
  };
  for (const a of buildings)
    for (const b of buildings) {
      if (a === b) continue;
      consider(a, b, 'x');
      consider(a, b, 'y');
    }
  if (!best) return null;
  const { arch } = best as { arch: Omit<Arch, 'top'> };
  const towers = buildings.filter((p) => p.id === arch.a || p.id === arch.b);
  for (const t of towers) {
    delete t.parts;
    t.height = Math.max(t.height, cfg.towerHeight);
  }
  return { ...arch, top: Math.min(...towers.map((t) => t.height)) * 0.75 };
}

/** Cuts the Arena into Plot-sized rectangles separated by Streets, then Alleys. */
function subdivide(rng: Rng, cells: number): Rect[] {
  const c = CONFIG.city;
  const out: Rect[] = [];
  const split = (r: Rect) => {
    const road = Math.max(r.w, r.h) > c.streetAbove ? c.street : c.alley;
    const canSplitX = r.w >= 2 * c.minPlotCells + road;
    const canSplitY = r.h >= 2 * c.minPlotCells + road;
    if ((r.w <= c.maxPlotCells && r.h <= c.maxPlotCells) || (!canSplitX && !canSplitY)) {
      out.push(r);
      return;
    }
    const splitX = canSplitX && (r.w >= r.h || !canSplitY);
    const length = splitX ? r.w : r.h;
    const at = c.minPlotCells + rng.int(length - road - 2 * c.minPlotCells + 1);
    if (splitX) {
      split({ x: r.x, y: r.y, w: at, h: r.h });
      split({ x: r.x + at + road, y: r.y, w: r.w - at - road, h: r.h });
    } else {
      split({ x: r.x, y: r.y, w: r.w, h: at });
      split({ x: r.x, y: r.y + at + road, w: r.w, h: r.h - at - road });
    }
  };
  split({ x: 0, y: 0, w: cells, h: cells });
  return out;
}

/** The largest-area rectangle within `r` whose cells are all `ok`, or null. Plots are small. */
function largestRect(r: Rect, ok: (x: number, y: number) => boolean): Rect | null {
  let best: Rect | null = null;
  for (let y0 = r.y; y0 < r.y + r.h; y0++) {
    for (let x0 = r.x; x0 < r.x + r.w; x0++) {
      let maxW = r.x + r.w - x0;
      for (let y1 = y0; y1 < r.y + r.h; y1++) {
        let w = 0;
        while (w < maxW && ok(x0 + w, y1)) w++;
        maxW = w;
        if (maxW === 0) break;
        const h = y1 - y0 + 1;
        if (!best || maxW * h > best.w * best.h) best = { x: x0, y: y0, w: maxW, h };
      }
    }
  }
  return best;
}

/** Cells reachable from the spawn through `passable` ones. */
function floodFrom(
  spec: LayoutSpec,
  cells: number,
  passable: (x: number, y: number) => boolean,
): Uint8Array {
  const seen = new Uint8Array(cells * cells);
  const sx = Math.floor(spec.spawn.x);
  const sy = Math.floor(spec.spawn.y);
  const queue = [sy * cells + sx];
  seen[queue[0]!] = 1;
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % cells;
    const y = (i - x) / cells;
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx < 0 || ny < 0 || nx >= cells || ny >= cells) continue;
      const j = ny * cells + nx;
      if (seen[j] || !passable(nx, ny)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return seen;
}

/** Greedily covers every set cell of `mask` with rectangles no larger than `cap` on a side. */
function coverWithRects(
  mask: Uint8Array,
  cells: number,
  cap: (x: number, y: number) => number,
): Rect[] {
  const done = new Uint8Array(cells * cells);
  const free = (x: number, y: number) => mask[y * cells + x] === 1 && done[y * cells + x] === 0;
  const out: Rect[] = [];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      if (!free(x, y)) continue;
      const limit = cap(x, y);
      let w = 0;
      while (w < limit && x + w < cells && free(x + w, y)) w++;
      let h = 1;
      while (h < limit && y + h < cells) {
        let row = true;
        for (let k = 0; k < w && row; k++) row = free(x + k, y + h);
        if (!row) break;
        h++;
      }
      const r = { x, y, w, h };
      forCells(r, (cx, cy) => (done[cy * cells + cx] = 1));
      out.push(r);
    }
  }
  return out;
}

const OBSTACLE_SHAPES: [number, number][] = [
  [2, 2],
  [3, 3],
  [1, 4],
  [4, 1],
  [2, 5],
  [5, 2],
];

/** Pillars and short walls inside Plazas, clear of the spawn, the Plaza's rim and each other. */
function plazaObstacles(
  rng: Rng,
  spec: LayoutSpec,
  cells: number,
  open: (x: number, y: number) => boolean,
): Rect[] {
  const placed: Rect[] = [];
  const inset = 2;
  const spacing = 3;
  const clearRadius = CONFIG.arena.spawnClearRadius + 1;
  const inPlaza = (s: Shape, r: Rect) => {
    for (let y = r.y - inset; y < r.y + r.h + inset; y++)
      for (let x = r.x - inset; x < r.x + r.w + inset; x++) {
        if (x < 0 || y < 0 || x >= cells || y >= cells) return false;
        if (!open(x, y) || !contains(s, x + 0.5, y + 0.5)) return false;
      }
    return true;
  };
  for (
    let attempt = 0;
    attempt < 400 && placed.length < CONFIG.city.plazaObstacleCandidates;
    attempt++
  ) {
    const plaza = spec.plazas[rng.int(spec.plazas.length)];
    if (!plaza) break;
    const box = bounds(plaza);
    const [w, h] = OBSTACLE_SHAPES[rng.int(OBSTACLE_SHAPES.length)]!;
    const r = {
      x: Math.floor(box.x) + rng.int(Math.max(1, Math.ceil(box.w) - w + 1)),
      y: Math.floor(box.y) + rng.int(Math.max(1, Math.ceil(box.h) - h + 1)),
      w,
      h,
    };
    const nearestX = Math.max(r.x, Math.min(spec.spawn.x, r.x + w));
    const nearestY = Math.max(r.y, Math.min(spec.spawn.y, r.y + h));
    if (Math.hypot(nearestX - spec.spawn.x, nearestY - spec.spawn.y) <= clearRadius) continue;
    if (!inPlaza(plaza, r)) continue;
    if (placed.some((o) => rectsWithin(o, r, spacing))) continue;
    placed.push(r);
  }
  return placed;
}

function bounds(s: Shape): Rect {
  switch (s.kind) {
    case 'rect':
      return s;
    case 'disc':
      return { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
    case 'ring':
      return { x: s.x - s.rx, y: s.y - s.ry, w: s.rx * 2, h: s.ry * 2 };
    case 'capsule':
      return {
        x: Math.min(s.ax, s.bx),
        y: Math.min(s.ay, s.by),
        w: Math.abs(s.bx - s.ax),
        h: Math.abs(s.by - s.ay),
      };
  }
}

const rectsWithin = (a: Rect, b: Rect, gap: number) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

function forCells(r: Rect, f: (x: number, y: number) => void): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) f(x, y);
}

/** Calls `f` for each in-bounds cell bordering `r`, edges only (no corners). */
function forRing(r: Rect, cells: number, f: (x: number, y: number) => void): void {
  const visit = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < cells && y < cells) f(x, y);
  };
  for (let x = r.x; x < r.x + r.w; x++) {
    visit(x, r.y - 1);
    visit(x, r.y + r.h);
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    visit(r.x - 1, y);
    visit(r.x + r.w, y);
  }
}
