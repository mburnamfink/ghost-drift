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
  root: THREE.Group;
  /** Yaws to the Hunter's aim, relative to its hull. */
  turret: THREE.Group;
  body: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);

/** Silhouettes differ by type so each threat reads at a glance: wide tank, tall sniper, squat mortar. */
const SHAPES: Record<
  HunterKind,
  { body: THREE.BufferGeometry; bodyY: number; turretY: number; parts: () => THREE.Object3D[] }
> = {
  tank: {
    body: box(3.4, 1.3, 2.6),
    bodyY: 0.75,
    turretY: 1.85,
    parts: () => {
      const barrel = new THREE.Mesh(box(2, 0.3, 0.3), hunterTurretMaterial);
      barrel.position.x = 1.4;
      return [new THREE.Mesh(box(1.5, 0.9, 1.5), hunterTurretMaterial), barrel];
    },
  },
  sniper: {
    body: box(1.6, 2.8, 1.6),
    bodyY: 1.4,
    turretY: 3.1,
    parts: () => {
      const barrel = new THREE.Mesh(box(3.6, 0.22, 0.22), hunterTurretMaterial);
      barrel.position.x = 1.9;
      return [new THREE.Mesh(box(1, 0.6, 1), hunterTurretMaterial), barrel];
    },
  },
  berserker: {
    body: spearhead(),
    bodyY: 0.8,
    turretY: 1.2,
    parts: () => [],
  },
  artillery: {
    body: box(4.2, 1.1, 3.6),
    bodyY: 0.6,
    turretY: 1.3,
    parts: () => {
      // A fat tube pitched up toward +X, the direction the turret faces.
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.65, 0.75, 2.8, 8).translate(0, 1.2, 0),
        hunterTurretMaterial,
      );
      tube.rotation.z = -0.65;
      return [new THREE.Mesh(box(2, 0.8, 2), hunterTurretMaterial), tube];
    },
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
  // Berserkers glow while winding up, so each needs its own material.
  const material = kind === 'berserker' ? hunterBodyMaterial.clone() : hunterBodyMaterial;
  const body = new THREE.Mesh(shape.body, material);
  body.position.y = shape.bodyY;
  const turret = new THREE.Group();
  turret.position.y = shape.turretY;
  const parts = shape.parts();
  if (parts.length > 0) turret.add(...parts);
  const root = new THREE.Group();
  root.add(body, turret);
  return { root, turret, body };
}

/** Where Sniper lasers and tracers start. */
export const SNIPER_MUZZLE_HEIGHT = SHAPES.sniper.turretY;
