import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CONFIG } from '../config';
import type { HunterKind } from '../sim/hunters';
import { PALETTE } from './palette';

/** All models face local +X, matching Heading 0 in the simulation (ADR-0002). */

export function createShipModel(): { root: THREE.Group; material: THREE.MeshStandardMaterial } {
  const material = new THREE.MeshStandardMaterial({
    color: PALETTE.ship,
    emissive: PALETTE.ship,
    emissiveIntensity: 0.35,
    flatShading: true,
  });
  const r = CONFIG.ship.radius;
  // A three-sided cone turned so its tip points along +X with one ridge on top and a flat belly.
  const hullGeometry = new THREE.ConeGeometry(r * 1.1, r * 3, 3)
    .rotateZ(-Math.PI / 2)
    .rotateX(-Math.PI / 2)
    .scale(1, 0.45, 1);
  const hull = new THREE.Mesh(hullGeometry, material);

  const engineMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.bolt });
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, r * 1.4), engineMaterial);
  engine.position.x = -r * 1.4;

  const root = new THREE.Group();
  root.add(hull, engine);
  root.rotation.order = 'YXZ';
  return { root, material };
}

const hunterBodyMaterial = new THREE.MeshStandardMaterial({
  color: PALETTE.hunter,
  emissive: PALETTE.hunter,
  emissiveIntensity: 0.25,
  flatShading: true,
});
const hunterTurretMaterial = new THREE.MeshStandardMaterial({
  color: PALETTE.hunterTurret,
  flatShading: true,
});

export interface HunterModel {
  kind: HunterKind;
  root: THREE.Group;
  /** Yaws to the Hunter's aim, relative to its hull. */
  turret: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Artillery only: the mortar, which recoils, and the glow at its mouth that builds while reloading. */
  mortar?: THREE.Group;
  glow?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Juggernaut only: glows at its three barrel tips, sharing one material, lit during the wind-up. */
  muzzles?: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
  /** Juggernaut only: a bar of remaining armour, placed above it and turned to face the camera. */
  healthBar?: { group: THREE.Group; fill: THREE.Mesh };
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const turretMesh = (g: THREE.BufferGeometry) => new THREE.Mesh(g, hunterTurretMaterial);
const merge = (parts: THREE.BufferGeometry[]) =>
  mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));

/** A three-sided cone lying along +X with a ridge on top and a flat belly, like the Ship's hull. */
const wedge = (radius: number, length: number, height: number) =>
  new THREE.ConeGeometry(radius, length, 3)
    .rotateZ(-Math.PI / 2)
    .rotateX(-Math.PI / 2)
    .scale(1, height, 1);

/** Yaw of each Juggernaut barrel from the turret's facing, splayed to suggest the Spray. */
const JUGGERNAUT_BARRELS = [-0.3, 0, 0.3];
/** Each barrel pivots this far ahead of the turret's centre and is this long. */
const JUGGERNAUT_BARREL = { pivot: 1, length: 2.4 };

/** Artillery mortar: tilt toward +X from vertical, and the height of its pivot on the turret. */
export const MORTAR_MOUNT = { pitch: 0.6, y: 0.3 };

/** Sniper rifle mount: shoulder height, and the muzzle's offset ahead and to the right of centre. */
const SNIPER_SHOULDER = 3.3;
const SNIPER_MUZZLE_AHEAD = 4.6;
const SNIPER_MUZZLE_RIGHT = 0.65;

/**
 * Silhouettes differ by type so each threat reads at a glance, all in the Berserker's faceted style:
 * a low wedge Tank, a spindly Sniper, a squat splayed Artillery piece.
 */
const SHAPES: Record<
  HunterKind,
  { body: THREE.BufferGeometry; bodyY: number; turretY: number; parts: () => THREE.Object3D[] }
> = {
  tank: {
    body: merge([
      wedge(2.1, 4.2, 0.5),
      // Side pods, like treads swept forward.
      ...[1, -1].map((side) => box(2.6, 0.6, 0.7).translate(-0.5, -0.2, side * 1.35)),
    ]),
    bodyY: 0.75,
    turretY: 1.35,
    parts: () => {
      const barrel = turretMesh(box(1.4, 0.4, 0.4));
      barrel.position.set(1.2, 0.05, 0);
      return [turretMesh(wedge(0.85, 1.9, 0.6)), barrel];
    },
  },
  sniper: {
    body: merge([
      // Torso: an inverted four-sided wedge, broad at the shoulders.
      new THREE.ConeGeometry(0.7, 1.9, 4).rotateX(Math.PI).translate(0, 2.55, 0),
      new THREE.OctahedronGeometry(0.35).translate(0, 3.75, 0),
      // Tripod legs, splayed.
      ...[0, 1, 2].map((i) =>
        new THREE.ConeGeometry(0.13, 2.4, 4)
          .translate(0, -1.2, 0)
          .rotateZ(0.6)
          .rotateY((i * Math.PI * 2) / 3 + Math.PI / 3)
          .translate(0, 2.1, 0),
      ),
    ]),
    bodyY: 0,
    turretY: SNIPER_SHOULDER,
    parts: () => {
      const z = SNIPER_MUZZLE_RIGHT;
      const length = SNIPER_MUZZLE_AHEAD + 0.9;
      const barrel = turretMesh(box(length, 0.16, 0.16));
      barrel.position.set(SNIPER_MUZZLE_AHEAD - length / 2, 0, z);
      const scope = turretMesh(box(1, 0.26, 0.22));
      scope.position.set(0.6, 0.26, z);
      const stock = turretMesh(box(1, 0.4, 0.28));
      stock.position.set(-0.7, -0.1, z);
      return [barrel, scope, stock];
    },
  },
  berserker: {
    body: spearhead(),
    bodyY: 0.8,
    turretY: 1.2,
    parts: () => [],
  },
  juggernaut: {
    body: merge([
      new THREE.CylinderGeometry(2.6, 3.1, 1.5, 6),
      // A plough of armour at the front.
      wedge(2.3, 2.6, 0.7).translate(2.3, -0.1, 0),
    ]),
    bodyY: 0.85,
    turretY: 1.9,
    parts: () => {
      const plates = [1, -1].map((side) => {
        const plate = turretMesh(box(4.6, 1.3, 0.5));
        plate.position.set(-0.2, -0.95, side * 3);
        plate.rotation.x = side * 0.25;
        return plate;
      });
      const barrels = JUGGERNAUT_BARRELS.map((angle) => {
        const { pivot, length } = JUGGERNAUT_BARREL;
        const barrel = turretMesh(box(length, 0.5, 0.5).translate(length / 2, 0, 0));
        barrel.position.x = pivot;
        barrel.rotation.y = -angle;
        return barrel;
      });
      return [turretMesh(new THREE.CylinderGeometry(1.5, 1.9, 1, 6)), ...barrels, ...plates];
    },
  },
  artillery: {
    body: merge([
      new THREE.CylinderGeometry(1.7, 2.2, 0.9, 6),
      // Stabilizer legs planted at the corners.
      ...[0, 1, 2, 3].map((i) =>
        new THREE.ConeGeometry(0.4, 2.6, 4)
          .rotateZ(-Math.PI / 2)
          .scale(1, 0.6, 1)
          .rotateZ(-0.35)
          .translate(1.9, -0.3, 0)
          .rotateY(Math.PI / 4 + (i * Math.PI) / 2),
      ),
    ]),
    bodyY: 0.6,
    turretY: 1.05,
    parts: () => [turretMesh(new THREE.CylinderGeometry(0.9, 1.3, 0.7, 6))],
  },
};

/** A four-sided ram pointing along +X with two swept side spikes. */
function spearhead(): THREE.BufferGeometry {
  const ram = new THREE.ConeGeometry(1.2, 3.8, 4).rotateZ(-Math.PI / 2).scale(1, 0.6, 1);
  const spike = (side: number) =>
    new THREE.ConeGeometry(0.35, 2, 4)
      .rotateZ(-Math.PI / 2)
      .rotateY(side * 0.5)
      .translate(-0.2, 0, side * 1.1);
  return mergeGeometries([ram, spike(1), spike(-1)].map((g) => g.toNonIndexed()));
}

export function createHunterModel(kind: HunterKind): HunterModel {
  const shape = SHAPES[kind];
  // Berserkers glow while winding up and Juggernauts flash when hit, so each needs its own material.
  const material =
    kind === 'berserker' || kind === 'juggernaut' ? hunterBodyMaterial.clone() : hunterBodyMaterial;
  const body = new THREE.Mesh(shape.body, material);
  body.position.y = shape.bodyY;
  const turret = new THREE.Group();
  turret.position.y = shape.turretY;
  const parts = shape.parts();
  if (parts.length > 0) turret.add(...parts);
  const root = new THREE.Group();
  root.add(body, turret);
  if (kind === 'juggernaut') return { kind, root, turret, body, ...juggernautExtras(turret) };
  if (kind !== 'artillery') return { kind, root, turret, body };

  // A four-sided tapered mortar pitched up toward +X, with a glow at its mouth.
  const mortar = new THREE.Group();
  mortar.rotation.z = -MORTAR_MOUNT.pitch;
  mortar.position.y = MORTAR_MOUNT.y;
  const tube = turretMesh(new THREE.CylinderGeometry(0.55, 0.85, 3, 4).translate(0, 1.5, 0));
  tube.rotation.y = Math.PI / 4;
  const glow = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6),
    new THREE.MeshBasicMaterial({
      color: PALETTE.shell,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.position.y = 3;
  mortar.add(tube, glow);
  turret.add(mortar);
  return { kind, root, turret, body, mortar, glow };
}

function juggernautExtras(turret: THREE.Group): Pick<HunterModel, 'muzzles' | 'healthBar'> {
  const glow = new THREE.MeshBasicMaterial({
    color: PALETTE.tankShell,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const muzzles = JUGGERNAUT_BARRELS.map((angle) => {
    const muzzle = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), glow);
    const { pivot, length } = JUGGERNAUT_BARREL;
    muzzle.position.set(pivot + Math.cos(angle) * length, 0, Math.sin(angle) * length);
    muzzle.visible = false;
    turret.add(muzzle);
    return muzzle;
  });

  const group = new THREE.Group();
  const overlay = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 0.6), overlay(0x000000, 0.6));
  // Anchored at its left end so scaling x shrinks it toward the left.
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 0.4).translate(2.5, 0, 0),
    overlay(PALETTE.shell, 0.95),
  );
  fill.position.set(-2.5, 0, 0.01);
  group.add(back, fill);
  group.renderOrder = 10;
  for (const child of group.children) child.renderOrder = 10;
  return { muzzles, healthBar: { group, fill } };
}

/** Where a Sniper's laser and tracer start: the muzzle of its shoulder rifle, aimed along `angle`. */
export function sniperMuzzle(pos: { x: number; y: number }, angle: number): THREE.Vector3 {
  const fx = Math.cos(angle);
  const fy = Math.sin(angle);
  // A model's local +Z is the simulation's (-sin, cos): the right-hand side of its facing.
  return new THREE.Vector3(
    pos.x + fx * SNIPER_MUZZLE_AHEAD - fy * SNIPER_MUZZLE_RIGHT,
    SNIPER_SHOULDER,
    pos.y + fy * SNIPER_MUZZLE_AHEAD + fx * SNIPER_MUZZLE_RIGHT,
  );
}
