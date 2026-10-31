import * as THREE from 'three';
import type { Vec2 } from '../core/vec2';
import type { Shot } from '../sim/shots';
import { PALETTE } from './palette';

const CAPACITY = 64;
const HEIGHT = 1;
/** Core half-width, and half-length when seen side on; head-on it shrinks to a round glow. */
const CORE = { width: 1.6, length: 3 };
const TAIL = { length: 11, width: 1.1, points: 34 };
/** Distance a Bolt moves before its tail records another point. */
const TAIL_STEP = 0.35;

const VERTEX = /* glsl */ `
  attribute vec2 aCoord;
  varying vec2 vCoord;
  void main() {
    vCoord = aCoord;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A white-hot center fading through cyan to clear, like the Shotgun's front. */
const CORE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vCoord;
  void main() {
    float d2 = dot(vCoord, vCoord);
    float hot = exp(-d2 * 10.0);
    float halo = exp(-d2 * 3.0) * (1.0 - smoothstep(0.75, 1.0, sqrt(d2)));
    float alpha = clamp(hot + 0.7 * halo, 0.0, 1.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), hot), alpha);
  }
`;

/** `vCoord.x` runs 0 at the Bolt to 1 at the tail's end; `vCoord.y` runs -1 to 1 across it. */
const TAIL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vCoord;
  void main() {
    float across = 1.0 - vCoord.y * vCoord.y;
    float fade = pow(1.0 - vCoord.x, 1.6);
    float shimmer = 0.75 + 0.25 * sin(vCoord.x * 26.0 - uTime * 45.0);
    float alpha = across * fade * shimmer * 0.75;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), fade * fade * across), alpha);
  }
`;

function glowMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader,
    uniforms: { uColor: { value: new THREE.Color(PALETTE.ship) }, ...uniforms },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** A triangle soup rebuilt every frame, drawn up to however many vertices were written. */
class Soup {
  readonly geometry = new THREE.BufferGeometry();
  private readonly pos: Float32Array;
  private readonly coord: Float32Array;
  private count = 0;

  constructor(vertices: number) {
    this.pos = new Float32Array(vertices * 3);
    this.coord = new Float32Array(vertices * 2);
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage),
    );
    this.geometry.setAttribute(
      'aCoord',
      new THREE.BufferAttribute(this.coord, 2).setUsage(THREE.DynamicDrawUsage),
    );
  }

  reset(): void {
    this.count = 0;
  }

  /** Two triangles over corners given in order round the quad. */
  quad(p: THREE.Vector3[], c: [number, number][]): void {
    for (const i of [0, 1, 2, 0, 2, 3]) {
      if (this.count * 3 >= this.pos.length) return;
      this.pos.set([p[i]!.x, p[i]!.y, p[i]!.z], this.count * 3);
      this.coord.set(c[i]!, this.count * 2);
      this.count++;
    }
  }

  commit(): void {
    this.geometry.setDrawRange(0, this.count);
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.aCoord!.needsUpdate = true;
  }
}

/** Draws Cannon Bolts as soft plasma glows trailing tapered, shimmering tails. */
export class BoltsView {
  readonly group = new THREE.Group();
  private readonly cores = new Soup(CAPACITY * 6);
  private readonly tails = new Soup(CAPACITY * TAIL.points * 6);
  private readonly tailTime = { value: 0 };
  /** Recent positions of each Bolt in flight, newest last. */
  private trails = new Map<Shot, Vec2[]>();

  constructor() {
    for (const [soup, material] of [
      [this.tails, glowMaterial(TAIL_FRAGMENT, { uTime: this.tailTime })],
      [this.cores, glowMaterial(CORE_FRAGMENT, {})],
    ] as const) {
      const mesh = new THREE.Mesh(soup.geometry, material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  update(bolts: readonly Shot[], camera: THREE.Vector3, dt: number): void {
    this.tailTime.value += dt;
    const trails = new Map<Shot, Vec2[]>();
    this.cores.reset();
    this.tails.reset();
    for (const b of bolts.slice(0, CAPACITY)) {
      const trail = this.trails.get(b) ?? [];
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(b.pos.x - last.x, b.pos.y - last.y) > TAIL_STEP) {
        trail.push({ ...b.pos });
        if (trail.length > TAIL.points) trail.shift();
      }
      trails.set(b, trail);
      this.addTail(b.pos, trail, camera);
      this.addCore(b, camera);
    }
    this.trails = trails;
    this.cores.commit();
    this.tails.commit();
  }

  clear(): void {
    this.trails.clear();
    this.update([], new THREE.Vector3(), 0);
  }

  private addCore(b: Shot, camera: THREE.Vector3): void {
    const center = new THREE.Vector3(b.pos.x, HEIGHT, b.pos.y);
    const toCam = camera.clone().sub(center).normalize();
    const flight = new THREE.Vector3(b.vel.x, 0, b.vel.y).normalize();
    // Flight as the camera sees it: full length side on, nothing head-on.
    const along = flight.addScaledVector(toCam, -flight.dot(toCam));
    const seen = along.length();
    if (seen > 1e-3) along.divideScalar(seen);
    else along.set(1, 0, 0).addScaledVector(toCam, -toCam.x).normalize();
    const across = new THREE.Vector3().crossVectors(toCam, along);
    const half = CORE.width + (CORE.length - CORE.width) * seen;
    const corner = (u: number, v: number) =>
      center
        .clone()
        .addScaledVector(along, u * half)
        .addScaledVector(across, v * CORE.width);
    this.cores.quad(
      [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)],
      [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ],
    );
  }

  /** A ribbon from the Bolt back along its trail, cut off at the tail's length. */
  private addTail(head: Vec2, trail: readonly Vec2[], camera: THREE.Vector3): void {
    const points: { p: Vec2; t: number }[] = [{ p: head, t: 0 }];
    let run = 0;
    for (let i = trail.length - 1; i >= 0 && run < TAIL.length; i--) {
      const a = points[points.length - 1]!.p;
      const b = trail[i]!;
      const step = Math.hypot(b.x - a.x, b.y - a.y);
      if (step < 1e-4) continue;
      const take = Math.min(step, TAIL.length - run);
      const f = take / step;
      run += take;
      points.push({
        p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        t: run / TAIL.length,
      });
    }
    if (points.length < 2) return;
    const edges = points.map(({ p, t }, i) => {
      const prev = points[Math.max(0, i - 1)]!.p;
      const next = points[Math.min(points.length - 1, i + 1)]!.p;
      const at = new THREE.Vector3(p.x, HEIGHT, p.y);
      const dir = new THREE.Vector3(prev.x - next.x, 0, prev.y - next.y).normalize();
      const side = new THREE.Vector3()
        .crossVectors(dir, camera.clone().sub(at))
        .normalize()
        .multiplyScalar(TAIL.width * (1 - 0.7 * t));
      return { left: at.clone().add(side), right: at.clone().sub(side), t };
    });
    for (let i = 0; i + 1 < edges.length; i++) {
      const a = edges[i]!;
      const b = edges[i + 1]!;
      this.tails.quad(
        [a.left, b.left, b.right, a.right],
        [
          [a.t, -1],
          [b.t, -1],
          [b.t, 1],
          [a.t, 1],
        ],
      );
    }
  }
}
