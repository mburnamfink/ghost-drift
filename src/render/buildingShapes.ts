import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/rng';

/**
 * How a Block is drawn. Every style stays within the Block's footprint and height, so the shape is
 * decoration only: the simulation still treats the Block as a solid box (ADR-0003).
 */
export type BuildingStyle = 'box' | 'taper' | 'slant' | 'setback' | 'fractured';

const STYLE_WEIGHTS: [BuildingStyle, number][] = [
  ['box', 2],
  ['taper', 2],
  ['slant', 2],
  ['setback', 2],
  ['fractured', 2],
];

/** Gap between the slabs of a fractured Block, in world units. */
const FRACTURE_GAP = 0.3;

interface Footprint {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/**
 * Geometry for a Block `w` by `d` wide and `h` tall, centred on x/z with its base at y = 0. The style
 * comes from `seed`, so a Block looks the same every time it Rises.
 */
export function buildingGeometry(
  w: number,
  h: number,
  d: number,
  seed: number,
  varied: boolean,
  /** Only styles that keep one solid mass: for the wings of a compound building. */
  simpleOnly = false,
): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const base = { x0: -w / 2, z0: -d / 2, x1: w / 2, z1: d / 2 };
  const style = varied ? pickStyle(rng, simpleOnly ? 0 : Math.min(w, d)) : 'box';
  switch (style) {
    case 'box':
      return prism(base, 0, base, [h, h, h, h]);
    case 'taper':
      return prism(base, 0, inset(base, rng.range(0.4, 0.75)), [h, h, h, h]);
    case 'slant':
      return prism(base, 0, base, slantedTop(rng, h));
    case 'setback':
      return setback(rng, base, h);
    case 'fractured':
      return fractured(rng, base, h);
  }
}

function pickStyle(rng: Rng, narrowSide: number): BuildingStyle {
  // Thin Blocks read as clutter when split or stepped.
  const options = narrowSide < 6 ? STYLE_WEIGHTS.slice(0, 3) : STYLE_WEIGHTS;
  let roll = rng.next() * options.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [style, weight] of options) {
    roll -= weight;
    if (roll < 0) return style;
  }
  return 'box';
}

/** A top whose corners sit at different heights, with at least one at full height. */
function slantedTop(rng: Rng, h: number): [number, number, number, number] {
  const top = [0, 1, 2, 3].map(() => h * rng.range(0.4, 1)) as [number, number, number, number];
  top[rng.int(4)] = h;
  return top;
}

/** Two or three stacked tiers, each narrower than the one below and pushed toward a random side. */
function setback(rng: Rng, base: Footprint, h: number): THREE.BufferGeometry {
  const tiers = 2 + rng.int(2);
  const parts: THREE.BufferGeometry[] = [];
  let floor = base;
  let y = 0;
  for (let i = 0; i < tiers; i++) {
    const top = i === tiers - 1 ? h : h * rng.range(0.4, 0.6) * (1 + i * 0.5);
    parts.push(prism(floor, y, floor, [top, top, top, top]));
    const shrink = rng.range(0.55, 0.75);
    const w = (floor.x1 - floor.x0) * shrink;
    const d = (floor.z1 - floor.z0) * shrink;
    const x0 = floor.x0 + (floor.x1 - floor.x0 - w) * rng.next();
    const z0 = floor.z0 + (floor.z1 - floor.z0 - d) * rng.next();
    floor = { x0, z0, x1: x0 + w, z1: z0 + d };
    y = top;
  }
  return mergeGeometries(parts);
}

/** Two or three slabs of different heights split along the long side, some tapered or slanted. */
function fractured(rng: Rng, base: Footprint, h: number): THREE.BufferGeometry {
  const slabs = 2 + rng.int(2);
  const alongX = base.x1 - base.x0 >= base.z1 - base.z0;
  const [start, end] = alongX ? [base.x0, base.x1] : [base.z0, base.z1];
  const cuts = [start];
  for (let i = 1; i < slabs; i++) {
    cuts.push(start + ((end - start) * (i + rng.range(-0.25, 0.25))) / slabs);
  }
  cuts.push(end);
  const tallest = rng.int(slabs);
  const parts = cuts.slice(0, -1).map((a, i) => {
    const b = cuts[i + 1]!;
    const lo = i === 0 ? a : a + FRACTURE_GAP / 2;
    const hi = i === slabs - 1 ? b : b - FRACTURE_GAP / 2;
    const slab = alongX ? { ...base, x0: lo, x1: hi } : { ...base, z0: lo, z1: hi };
    const top = i === tallest ? h : h * rng.range(0.45, 0.85);
    const roll = rng.next();
    if (roll < 0.3) return prism(slab, 0, inset(slab, rng.range(0.6, 0.85)), [top, top, top, top]);
    if (roll < 0.6) return prism(slab, 0, slab, slantedTop(rng, top));
    return prism(slab, 0, slab, [top, top, top, top]);
  });
  return mergeGeometries(parts);
}

function inset(f: Footprint, scale: number): Footprint {
  const cx = (f.x0 + f.x1) / 2;
  const cz = (f.z0 + f.z1) / 2;
  const hw = ((f.x1 - f.x0) / 2) * scale;
  const hd = ((f.z1 - f.z0) / 2) * scale;
  return { x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd };
}

/**
 * A four-sided solid from footprint `bottom` at height `y0` up to `top`, whose corners, in the order
 * (x0,z0), (x1,z0), (x1,z1), (x0,z1), sit at `heights`. Sides and top only: the base is never seen.
 * Non-indexed, so normals come out flat.
 */
function prism(
  bottom: Footprint,
  y0: number,
  top: Footprint,
  heights: [number, number, number, number],
): THREE.BufferGeometry {
  const b = [
    [bottom.x0, y0, bottom.z0],
    [bottom.x1, y0, bottom.z0],
    [bottom.x1, y0, bottom.z1],
    [bottom.x0, y0, bottom.z1],
  ];
  const t = [
    [top.x0, heights[0], top.z0],
    [top.x1, heights[1], top.z0],
    [top.x1, heights[2], top.z1],
    [top.x0, heights[3], top.z1],
  ];
  const tris: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push(b[i]!, t[j]!, b[j]!, b[i]!, t[i]!, t[j]!);
  }
  tris.push(t[0]!, t[2]!, t[1]!, t[0]!, t[3]!, t[2]!);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Geometry for a compound building: each part is a wing of its own height and simple style, merged
 * into one piece centred on the bounding rectangle. Sizes are in world units; `inset` shrinks each
 * wing so neighbouring faces never z-fight.
 */
export function compoundGeometry(
  parts: readonly { x: number; z: number; w: number; d: number }[],
  h: number,
  seed: number,
  varied: boolean,
  inset: number,
): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const tallest = rng.int(parts.length);
  return mergeGeometries(
    parts.map((p, i) => {
      const height = !varied || i === tallest ? h : h * rng.range(0.6, 1);
      return buildingGeometry(
        p.w - inset,
        height,
        p.d - inset,
        seed + i + 1,
        varied,
        true,
      ).translate(p.x, 0, p.z);
    }),
  );
}
