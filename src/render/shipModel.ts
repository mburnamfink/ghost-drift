import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { CONFIG } from '../config';
import { glowTexture } from './flashes';
import { merge } from './models';
import { PALETTE } from './palette';

const R = CONFIG.ship.radius;
/** Edges between faces meeting more sharply than this, in degrees, are traced in light. */
const EDGE_ANGLE = 20;
const EDGE_PIXELS = 2;
/** The fins' glowing trailing edges are drawn this thick. */
const EXHAUST_PIXELS = 6;
/** The fuselage's tail corners, where each fin's root ends, in units of R. */
const TAIL = { x: -1.15, halfWidth: 0.36, height: 0.42 };
/** Where the fuselage's ridge ends: the tail is cut back to it in a V between the corners. */
const NOTCH_X = -0.7;
/** Height above the plate of the swallowtail's glowing bottom edges, in units of R. */
const BOTTOM_LIFT = 0.04;
const NOSE_X = 1.9;
/** How far each fin leans out from upright. */
const FIN_CANT = 0.6;
/**
 * A fin's outline in its own frame, (x forward from the tail corner, up the fin) in units of R.
 * Its root runs along the fuselage's base; the leading edge is cranked; the last edge, from the
 * tip down to the tail corner, is the exhaust.
 */
const FIN_OUTLINE: [number, number][] = [
  [1.9, 0],
  [0.95, 0.45],
  [0.35, 1.0],
  [0.08, 1.0],
  [0, 0],
];
/** Exhaust sheet length idling and at top speed, and during a Burst. */
const PLUME = { idle: 0.5, top: 3, burst: 5.5 };

/** What the Ship is doing, as far as its looks go. */
export interface ShipLook {
  bursting: boolean;
  /** Brightness of the edges and engines, 0 to 1. */
  glow: number;
  /** Speed as a fraction of top speed. */
  speed: number;
}

/** `aAlong` runs 0 at the fin's edge to 1 at the sheet's end, which trails `uLength` behind. */
const PLUME_VERTEX = /* glsl */ `
  attribute float aAlong;
  uniform float uLength;
  varying float vAlong;
  void main() {
    vAlong = aAlong;
    vec3 p = position + vec3(-aAlong * uLength, 0.0, 0.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

/** Hot at the edge, fading to clear behind, with a fast flicker. */
const PLUME_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying float vAlong;
  void main() {
    float fade = pow(1.0 - vAlong, 2.2);
    float flicker = 0.85 + 0.15 * sin(vAlong * 18.0 - uTime * 60.0);
    gl_FragColor = vec4(mix(uColor, vec3(1.0), fade * fade), fade * flicker * uOpacity);
  }
`;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x * R, y * R, z * R);

/**
 * A flat sheet cut to `outline`, given as (x, z) points in units of R, lying in the ground plane.
 * A sheet rather than a slab, so its outline is traced once instead of on two faces.
 */
function sheet(outline: [number, number][]): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * R, z * R)));
  return new THREE.ShapeGeometry(shape).rotateX(Math.PI / 2);
}

/** The flat bottom: a cranked delta in front, a sawtooth trailing edge behind. */
function plate(): THREE.BufferGeometry {
  // Nose to tail along +z; mirrored for the other side.
  const half: [number, number][] = [
    [1.9, 0],
    [0.35, 0.45],
    [-0.65, 1.35],
    [-1.35, 1.02],
    [-1.0, 0.7],
    [-1.65, 0.36],
    [-1.25, 0],
  ];
  const mirrored = half
    .slice(1, -1)
    .reverse()
    .map(([x, z]): [number, number] => [x, -z]);
  return sheet([...half, ...mirrored]);
}

/**
 * The fuselage: a long triangular pyramid on the plate, its tail cut in to a V. The V is concave,
 * so each side is its own convex half.
 */
const fuselage = (side: -1 | 1) =>
  new ConvexGeometry([
    v(NOSE_X, 0, 0),
    v(NOTCH_X, TAIL.height, 0),
    v(NOTCH_X, 0, 0),
    v(TAIL.x, 0, side * TAIL.halfWidth),
  ]);

/** Turn from straight ahead to along the fuselage's base edge, so a fin's root lies on it. */
const FIN_YAW = Math.atan2(TAIL.halfWidth, NOSE_X - TAIL.x);

/** Maps a fin's own frame onto the fuselage's tail corner on `side`, leaning out. */
const finFrame = (side: -1 | 1) =>
  new THREE.Matrix4()
    .makeTranslation(TAIL.x * R, 0, side * TAIL.halfWidth * R)
    .multiply(new THREE.Matrix4().makeRotationY(side * FIN_YAW))
    .multiply(new THREE.Matrix4().makeRotationX(side * FIN_CANT));

/** A fin's outline points in the Ship's frame. */
const finPoints = (side: -1 | 1) =>
  FIN_OUTLINE.map(([x, h]) => new THREE.Vector3(x * R, h * R, 0).applyMatrix4(finFrame(side)));

function fin(side: -1 | 1): THREE.BufferGeometry {
  return sheet(FIN_OUTLINE)
    .rotateX(-Math.PI / 2)
    .applyMatrix4(finFrame(side));
}

type Edge = readonly [THREE.Vector3, THREE.Vector3];

/**
 * The glowing edges: each fin's trailing edge from its tip down to the tail corner, then the
 * swallowtail's bottom edge in along the plate to the notch, so together they zigzag across the back.
 */
function exhaustEdges(): Edge[] {
  return ([-1, 1] as const).flatMap((side): Edge[] => {
    const p = finPoints(side);
    const corner = p[p.length - 1]!;
    // Lifted off the plate so the exhaust sheet trailing over it doesn't flicker against it.
    const lift = new THREE.Vector3(0, BOTTOM_LIFT * R, 0);
    return [
      [p[p.length - 2]!, corner],
      [corner.clone().add(lift), v(NOTCH_X, BOTTOM_LIFT, 0)],
    ];
  });
}

/** A sheet of exhaust trailing straight back from a glowing edge. */
function plumeGeometry([a, b]: Edge): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry().setFromPoints([a, b, b, a]);
  geometry.setAttribute('aAlong', new THREE.Float32BufferAttribute([0, 0, 1, 1], 1));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

/**
 * The Ship: a flat cranked-delta plate with a sawtooth trailing edge, a triangular fuselage along
 * it, and two fins leaning out whose trailing edges glow as the engines. Its edges are traced in
 * cyan light.
 */
export class ShipModel {
  readonly root = new THREE.Group();
  private readonly hullMaterial = new THREE.MeshStandardMaterial({
    color: PALETTE.shipHull,
    metalness: 0.5,
    roughness: 0.45,
    flatShading: true,
    side: THREE.DoubleSide,
    // Pushed back so the traced edges win the depth test.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  private readonly edgeMaterial = new LineMaterial({
    color: PALETTE.ship,
    linewidth: EDGE_PIXELS,
  });
  private readonly exhaustMaterial = new LineMaterial({
    color: PALETTE.ship,
    linewidth: EXHAUST_PIXELS,
  });
  private readonly glows: THREE.Sprite[] = [];
  private readonly plumeUniforms = {
    uColor: { value: new THREE.Color(PALETTE.ship) },
    uOpacity: { value: 1 },
    uTime: { value: 0 },
    uLength: { value: PLUME.idle },
  };

  constructor() {
    // The fuselage has no UVs, so the parts merge on positions and normals alone.
    const parts = [plate(), fuselage(-1), fuselage(1), fin(-1), fin(1)];
    for (const part of parts) part.deleteAttribute('uv');
    const hullGeometry = merge(parts);
    const hull = new THREE.Mesh(hullGeometry, this.hullMaterial);
    // Afterimages trace only the glowing edges: a glowing copy of the hull would light up the
    // fuselage's hidden inner faces.
    hull.userData.noAfterimage = true;
    const edges = new LineSegments2(
      new LineSegmentsGeometry().fromEdgesGeometry(
        new THREE.EdgesGeometry(hullGeometry, EDGE_ANGLE),
      ),
      this.edgeMaterial,
    );
    this.root.add(hull, edges);

    const glowMap = glowTexture();
    const plumeMaterial = new THREE.ShaderMaterial({
      vertexShader: PLUME_VERTEX,
      fragmentShader: PLUME_FRAGMENT,
      uniforms: this.plumeUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    for (const edge of exhaustEdges()) {
      const [a, b] = edge;
      const line = new LineSegments2(
        new LineSegmentsGeometry().setPositions([a.x, a.y, a.z, b.x, b.y, b.z]),
        this.exhaustMaterial,
      );
      const plume = new THREE.Mesh(plumeGeometry(edge), plumeMaterial);
      plume.userData.noAfterimage = true;
      this.root.add(line, plume);
      for (const f of [0.25, 0.75]) {
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowMap,
            color: PALETTE.ship,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        glow.position.lerpVectors(a, b, f);
        this.glows.push(glow);
        this.root.add(glow);
      }
    }
    this.root.rotation.order = 'YXZ';
  }

  setResolution(width: number, height: number): void {
    this.edgeMaterial.resolution.set(width, height);
    this.exhaustMaterial.resolution.set(width, height);
  }

  update(look: ShipLook, dt: number): void {
    const light = look.bursting ? PALETTE.shipBurst : PALETTE.ship;
    const glow = look.bursting ? 1 : look.glow;
    this.edgeMaterial.color.setHex(light).multiplyScalar(0.35 + 0.65 * glow);
    this.exhaustMaterial.color.setHex(light).lerp(new THREE.Color(0xffffff), 0.4 * glow);
    this.hullMaterial.emissive.setHex(light);
    this.hullMaterial.emissiveIntensity = look.bursting ? 0.5 : 0.04;

    const target = look.bursting ? PLUME.burst : PLUME.idle + (PLUME.top - PLUME.idle) * look.speed;
    const u = this.plumeUniforms;
    u.uLength.value += (target - u.uLength.value) * (1 - Math.exp(-10 * dt));
    u.uTime.value += dt;
    u.uColor.value.setHex(light);
    u.uOpacity.value = 0.45 + 0.55 * glow;
    for (const sprite of this.glows) {
      sprite.material.color.setHex(light);
      sprite.material.opacity = 0.4 + 0.6 * glow;
      sprite.scale.setScalar(R * (0.55 + 0.3 * look.speed + (look.bursting ? 0.5 : 0)));
    }
  }
}
