import * as THREE from 'three';
import { CONFIG } from '../config';
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

const hunterBody = new THREE.BoxGeometry(3.4, 1.3, 2.6);
const hunterTurret = new THREE.BoxGeometry(1.5, 0.9, 1.5);
const hunterBarrel = new THREE.BoxGeometry(2, 0.3, 0.3);
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
  turret: THREE.Group;
}

export function createHunterModel(): HunterModel {
  const body = new THREE.Mesh(hunterBody, hunterBodyMaterial);
  body.position.y = 0.75;
  const turret = new THREE.Group();
  turret.position.y = 1.85;
  const dome = new THREE.Mesh(hunterTurret, hunterTurretMaterial);
  const barrel = new THREE.Mesh(hunterBarrel, hunterTurretMaterial);
  barrel.position.x = 1.4;
  turret.add(dome, barrel);
  const root = new THREE.Group();
  root.add(body, turret);
  return { root, turret };
}
