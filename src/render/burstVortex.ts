import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { CONFIG } from '../config';
import type { Vec2 } from '../core/vec2';
import { PALETTE } from './palette';

const HEIGHT = 1.5;
/** Radius at the mouth and at the throat. */
const MOUTH = 6;
const THROAT = 1.4;
/** The mouth opens this far behind where the Burst began, so the Ship starts inside it. */
const BEHIND = 3;
/** The throat lies this far past where a straight Burst would end. */
const AHEAD = 12;
const LENGTH = BEHIND + CONFIG.ship.burstSpeed * CONFIG.ship.burstDuration + AHEAD;
const SPOKES = 28;
const SPOKE_POINTS = 32;
const RINGS = 14;
const RING_POINTS = 48;
/** Radians a spoke twists from mouth to throat, and radians per second the whole tunnel spins. */
const SWIRL = { twist: 2.6, spin: 0.9 };
/** Rings flowing toward the throat, in tunnel lengths per second. */
const FLOW = 0.35;
/** How fast the vortex appears when a Burst starts and fades once it ends, per second. */
const FADE = { in: 14, out: 3 };
/** Distance the Ship moves before the tunnel's axis records another point. */
const PATH_STEP = 0.5;
const LINE_PIXELS = 3;

/**
 * A swirling wireframe wormhole the Ship dives through on a Burst. It stays where the Burst began
 * and its axis follows the path the Ship actually flies, so it bends with turns and bounces, then
 * runs on ahead of the nose to a narrow throat. The walls follow a gravity well's shape: 1/radius
 * grows evenly along the axis.
 */
export class BurstVortex {
  readonly group = new THREE.Group();
  private readonly geometry = new LineSegmentsGeometry();
  private readonly material = new LineMaterial({
    linewidth: LINE_PIXELS,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly color = new THREE.Color(PALETTE.burstVortex);
  /** The axis so far: the mouth, the Burst's start, then where the Ship has been. */
  private path: Vec2[] = [];
  /** Direction the axis runs on past the last recorded point. */
  private ahead: Vec2 = { x: 1, y: 0 };
  private wasBursting = false;
  private strength = 0;
  private time = 0;

  constructor() {
    const vertices = SPOKES * (SPOKE_POINTS - 1) * 2 + RINGS * RING_POINTS * 2;
    this.positions = new Float32Array(vertices * 3);
    this.colors = new Float32Array(vertices * 3);
    this.geometry.setPositions(this.positions);
    this.geometry.setColors(this.colors);
    const lines = new LineSegments2(this.geometry, this.material);
    lines.frustumCulled = false;
    this.group.add(lines);
    this.group.visible = false;
  }

  setResolution(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  update(pos: Vec2, heading: number, bursting: boolean, dt: number): void {
    if (bursting && !this.wasBursting) this.begin(pos, heading);
    this.wasBursting = bursting;
    if (bursting) this.record(pos, heading);
    this.strength = bursting
      ? Math.min(1, this.strength + FADE.in * dt)
      : Math.max(0, this.strength - FADE.out * dt);
    this.group.visible = this.strength > 0;
    if (!this.group.visible) return;
    this.time += dt;
    this.rebuild();
  }

  clear(): void {
    this.strength = 0;
    this.wasBursting = false;
    this.path = [];
    this.group.visible = false;
  }

  private begin(pos: Vec2, heading: number): void {
    const dir = { x: Math.cos(heading), y: Math.sin(heading) };
    this.path = [{ x: pos.x - dir.x * BEHIND, y: pos.y - dir.y * BEHIND }, { ...pos }];
    this.ahead = dir;
    this.time = 0;
  }

  private record(pos: Vec2, heading: number): void {
    this.ahead = { x: Math.cos(heading), y: Math.sin(heading) };
    const last = this.path[this.path.length - 1]!;
    if (Math.hypot(pos.x - last.x, pos.y - last.y) > PATH_STEP) this.path.push({ ...pos });
  }

  /** Point and unit tangent `a` units along the axis, past its end running straight on. */
  private axis(a: number): { p: Vec2; t: Vec2 } {
    let run = 0;
    for (let i = 0; i + 1 < this.path.length; i++) {
      const p = this.path[i]!;
      const q = this.path[i + 1]!;
      const seg = Math.hypot(q.x - p.x, q.y - p.y);
      if (seg < 1e-6) continue;
      if (a <= run + seg) {
        const f = (a - run) / seg;
        const t = { x: (q.x - p.x) / seg, y: (q.y - p.y) / seg };
        return { p: { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f }, t };
      }
      run += seg;
    }
    const end = this.path[this.path.length - 1]!;
    const t = this.ahead;
    return { p: { x: end.x + t.x * (a - run), y: end.y + t.y * (a - run) }, t };
  }

  private rebuild(): void {
    let v = 0;
    const spin = this.time * SWIRL.spin;
    // `s` runs 0 at the mouth to 1 at the throat.
    const put = (s: number, angle: number) => {
      const { p, t } = this.axis(s * LENGTH);
      const r = 1 / (1 / MOUTH + (1 / THROAT - 1 / MOUTH) * s);
      const across = r * Math.cos(angle);
      this.positions.set(
        [p.x - t.y * across, HEIGHT + r * Math.sin(angle), p.y + t.x * across],
        v * 3,
      );
      // Faint at the mouth and the throat, brightest between.
      const fade = Math.sin(Math.PI * s) * this.strength;
      this.colors.set([this.color.r * fade, this.color.g * fade, this.color.b * fade], v * 3);
      v++;
    };
    for (let i = 0; i < SPOKES; i++) {
      const base = (i / SPOKES) * Math.PI * 2 + spin;
      for (let j = 0; j + 1 < SPOKE_POINTS; j++) {
        for (const k of [j, j + 1]) {
          const s = k / (SPOKE_POINTS - 1);
          put(s, base + SWIRL.twist * s);
        }
      }
    }
    for (let i = 0; i < RINGS; i++) {
      const s = (i / RINGS + this.time * FLOW) % 1;
      for (let j = 0; j < RING_POINTS; j++) {
        for (const k of [j, j + 1]) put(s, (k / RING_POINTS) * Math.PI * 2);
      }
    }
    // Written in place: setPositions would reallocate the GPU buffers every frame.
    const start = this.geometry.attributes.instanceStart as THREE.InterleavedBufferAttribute;
    const colorStart = this.geometry.attributes
      .instanceColorStart as THREE.InterleavedBufferAttribute;
    start.data.array.set(this.positions);
    start.data.needsUpdate = true;
    colorStart.data.array.set(this.colors);
    colorStart.data.needsUpdate = true;
  }
}
