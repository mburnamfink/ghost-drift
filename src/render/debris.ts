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

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: number;
  life: number;
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

  /** Throws `count` fragments outward in all directions from a point on the ground. */
  burst(x: number, z: number, color: number, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.emit({
        x,
        y: 1 + Math.random(),
        z,
        vx: Math.cos(a) * s,
        vy: 6 + Math.random() * 12,
        vz: Math.sin(a) * s,
        color,
        life: 0.5 + Math.random() * 0.6,
        size: 0.3 + Math.random() * 0.6,
      });
    }
  }

  emit(p: ParticleSpec): void {
    if (this.particles.length >= CAPACITY) return;
    this.particles.push({
      pos: new THREE.Vector3(p.x, p.y, p.z),
      vel: new THREE.Vector3(p.vx, p.vy, p.vz),
      color: new THREE.Color(p.color),
      life: p.life,
      maxLife: p.life,
      size: p.size,
    });
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
