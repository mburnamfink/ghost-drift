import * as THREE from 'three';
import type { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';

/** Afterimages spawned per second while an emitter is active. */
const RATE = 45;
const LIFE = 0.22;
const START_OPACITY = 0.45;
const CAPACITY = 200;

interface Ghost {
  meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | LineMaterial>[];
  life: number;
  opacity: number;
}

/**
 * Motion blur by afterimages: fading, glowing copies of a model left at the positions it passed
 * through. Each moving thing that blurs is an emitter, keyed by any stable value.
 */
export class Afterimages {
  readonly group = new THREE.Group();
  private ghosts: Ghost[] = [];
  private readonly budget = new Map<unknown, number>();

  /**
   * Leaves afterimages of `source` for this frame. Call every frame the emitter should blur.
   * `strength` from 0 to 1 scales how bright they start.
   */
  emit(key: unknown, source: THREE.Object3D, color: number, frameTime: number, strength = 1): void {
    const opacity = START_OPACITY * strength;
    let budget = (this.budget.get(key) ?? 0) + RATE * frameTime;
    if (budget >= 1) source.updateMatrixWorld(true);
    for (; budget >= 1 && this.ghosts.length < CAPACITY; budget--) {
      const meshes: Ghost['meshes'] = [];
      source.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.visible || o.userData.noAfterimage) return;
        const ghost =
          o instanceof LineSegments2 ? lineGhost(o, color, opacity) : meshGhost(o, color, opacity);
        ghost.matrixAutoUpdate = false;
        ghost.matrix.copy(o.matrixWorld);
        meshes.push(ghost);
        this.group.add(ghost);
      });
      this.ghosts.push({ meshes, life: LIFE, opacity });
    }
    this.budget.set(key, Math.min(budget, 1));
  }

  /** Forgets an emitter's spawn budget once it stops blurring. */
  stop(key: unknown): void {
    this.budget.delete(key);
  }

  update(frameTime: number): void {
    this.ghosts = this.ghosts.filter((g) => {
      g.life -= frameTime;
      const alive = g.life > 0;
      for (const m of g.meshes) {
        if (alive) {
          m.material.opacity = g.opacity * (g.life / LIFE);
        } else {
          this.group.remove(m);
          m.material.dispose();
        }
      }
      return alive;
    });
  }

  clear(): void {
    for (const g of this.ghosts) {
      for (const m of g.meshes) {
        this.group.remove(m);
        m.material.dispose();
      }
    }
    this.ghosts = [];
    this.budget.clear();
  }
}

function meshGhost(source: THREE.Mesh, color: number, opacity: number) {
  return new THREE.Mesh(
    source.geometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
}

/**
 * Fat lines are meshes of instanced quads that only their own material can draw; under any other
 * they render as one flat template quad.
 */
function lineGhost(source: LineSegments2, color: number, opacity: number) {
  const material = source.material.clone();
  material.color.setHex(color);
  material.transparent = true;
  material.opacity = opacity;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  return new LineSegments2(source.geometry, material);
}
