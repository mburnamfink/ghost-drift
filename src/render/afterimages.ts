import * as THREE from 'three';

/** Afterimages spawned per second while an emitter is active. */
const RATE = 45;
const LIFE = 0.22;
const START_OPACITY = 0.45;
const CAPACITY = 200;

interface Ghost {
  meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[];
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
        if (!(o instanceof THREE.Mesh) || !o.visible) return;
        const ghost = new THREE.Mesh(
          o.geometry as THREE.BufferGeometry,
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
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
