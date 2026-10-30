import * as THREE from 'three';
import { CONFIG } from '../config';
import { type Pulse, pulseLifetime, pulseRadius } from '../sim/weapons';
import { PALETTE } from './palette';

const HEIGHT = 0.8;
/** Band thickness as a fraction of the Pulse's radius. */
const BAND = 0.35;

/** Draws each Shotgun Pulse as a flat, glowing arc band that expands, holds, then fades out. */
export class PulsesView {
  readonly group = new THREE.Group();
  private readonly pool: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly geometry = new THREE.RingGeometry(
    1 - BAND,
    1,
    32,
    1,
    -CONFIG.shotgun.halfAngle,
    CONFIG.shotgun.halfAngle * 2,
  ).rotateX(-Math.PI / 2);

  update(pulses: readonly Pulse[]): void {
    while (this.pool.length < pulses.length) {
      const mesh = new THREE.Mesh(
        this.geometry,
        new THREE.MeshBasicMaterial({
          color: PALETTE.bolt,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    this.pool.forEach((mesh, i) => {
      const p = pulses[i];
      mesh.visible = p !== undefined;
      if (!p) return;
      mesh.position.set(p.origin.x, HEIGHT, p.origin.y);
      mesh.rotation.y = -p.heading;
      mesh.scale.setScalar(Math.max(0.5, pulseRadius(p)));
      mesh.material.opacity = 1 - 0.85 * (p.age / pulseLifetime()) ** 2;
    });
  }
}
