import * as THREE from 'three';

const CAPACITY = 600;
const GRAVITY = 30;

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
  size: number;
}

/** Cosmetic flying fragments for explosions and hits. Lives entirely in the render layer. */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private readonly dummy = new THREE.Object3D();

  constructor() {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
      CAPACITY,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  burst(x: number, z: number, color: number, count: number, speed: number): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count && this.particles.length < CAPACITY; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const maxLife = 0.5 + Math.random() * 0.6;
      this.particles.push({
        pos: new THREE.Vector3(x, 1 + Math.random(), z),
        vel: new THREE.Vector3(Math.cos(a) * s, 6 + Math.random() * 12, Math.sin(a) * s),
        color: c,
        life: maxLife,
        maxLife,
        size: 0.3 + Math.random() * 0.6,
      });
    }
  }

  update(dt: number): void {
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    this.particles.forEach((p, i) => {
      p.vel.y -= GRAVITY * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.pos.y = Math.max(0.1, p.pos.y);
      this.dummy.position.copy(p.pos);
      this.dummy.rotation.set(p.life * 7, p.life * 5, 0);
      this.dummy.scale.setScalar(p.size * (p.life / p.maxLife));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    });
    this.mesh.count = this.particles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.particles = [];
    this.mesh.count = 0;
  }
}
