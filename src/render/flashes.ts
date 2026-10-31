import * as THREE from 'three';

const CAPACITY = 48;

interface Flash {
  mesh: THREE.Sprite;
  age: number;
  life: number;
  size: number;
}

/** A soft round glow: white at the center, fading to clear at the rim. */
export function glowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.2)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

/** Brief soft glows that swell and fade: muzzle flashes and impact flares. */
export class Flashes {
  readonly group = new THREE.Group();
  private readonly flashes: Flash[] = [];
  private next = 0;

  constructor() {
    const map = glowTexture();
    for (let i = 0; i < CAPACITY; i++) {
      const mesh = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      this.flashes.push({ mesh, age: 0, life: 0, size: 0 });
    }
  }

  /** Reuses the oldest flash when all are lit. */
  spawn(x: number, y: number, z: number, color: number, size: number, life: number): void {
    const f = this.flashes[this.next]!;
    this.next = (this.next + 1) % CAPACITY;
    f.age = 0;
    f.life = life;
    f.size = size;
    f.mesh.position.set(x, y, z);
    f.mesh.material.color.setHex(color);
    f.mesh.visible = true;
  }

  update(dt: number): void {
    for (const f of this.flashes) {
      if (!f.mesh.visible) continue;
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.mesh.visible = false;
        continue;
      }
      // A sprite spans its scale edge to edge; `size` is a radius.
      f.mesh.scale.setScalar(2 * f.size * (0.5 + 0.5 * Math.sqrt(t)));
      f.mesh.material.opacity = (1 - t) ** 2;
    }
  }

  clear(): void {
    for (const f of this.flashes) f.mesh.visible = false;
  }
}
