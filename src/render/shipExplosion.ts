import * as THREE from 'three';
import type { Debris } from './debris';
import { PALETTE } from './palette';

/** Seconds from the Ship's destruction until the explosion has burned out. */
export const SHIP_EXPLOSION_SECONDS = 1.6;

const HEIGHT = 1;
const FLASH = { seconds: 0.35, radius: 9 };
const FIREBALL = { seconds: 1.1, radius: 5.5 };
const SHOCKWAVE = { seconds: 0.9, radius: 34 };
/** A second, smaller blast as the wreck breaks up. */
const SECONDARY_AT = 0.32;
const LIGHT_INTENSITY = 900;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;

function glowMaterial(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * The Ship blowing apart on game over: a white flash, a cyan fireball, a shockwave across the
 * ground, a light that throws the blast onto nearby Blocks, and hull fragments thrown into the air.
 */
export class ShipExplosion {
  readonly group = new THREE.Group();
  private readonly flash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 2),
    glowMaterial(PALETTE.shipBurst),
  );
  private readonly fireball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 2),
    glowMaterial(PALETTE.ship),
  );
  private readonly shockwave = new THREE.Mesh(
    new THREE.RingGeometry(0.88, 1, 64).rotateX(-Math.PI / 2),
    glowMaterial(PALETTE.bolt),
  );
  // Always in the scene, dark when idle: adding a light later would recompile every material.
  private readonly light = new THREE.PointLight(PALETTE.ship, 0, 70, 1.6);
  private age = Infinity;
  private x = 0;
  private z = 0;
  private secondaryDone = true;

  constructor(private readonly debris: Debris) {
    this.group.add(this.flash, this.fireball, this.shockwave, this.light);
    this.group.visible = false;
  }

  trigger(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.age = 0;
    this.secondaryDone = false;
    this.group.visible = true;
    this.flash.position.set(x, HEIGHT, z);
    this.fireball.position.set(x, HEIGHT, z);
    this.shockwave.position.set(x, 0.15, z);
    this.light.position.set(x, 4, z);
    this.throwFragments(1);
  }

  update(dt: number): void {
    if (this.age > SHIP_EXPLOSION_SECONDS) return;
    this.age += dt;
    const t = this.age;
    if (!this.secondaryDone && t >= SECONDARY_AT) {
      this.secondaryDone = true;
      this.throwFragments(0.5);
    }

    const f = Math.min(1, t / FLASH.seconds);
    this.flash.scale.setScalar(Math.max(0.01, easeOut(f) * FLASH.radius));
    this.flash.material.opacity = (1 - f) ** 2;

    const b = Math.min(1, t / FIREBALL.seconds);
    this.fireball.scale.setScalar(Math.max(0.01, (0.4 + 0.6 * easeOut(b)) * FIREBALL.radius));
    this.fireball.position.y = HEIGHT + b * 2.5;
    this.fireball.material.opacity = 0.75 * (1 - b) ** 1.5;

    const s = Math.min(1, t / SHOCKWAVE.seconds);
    this.shockwave.scale.setScalar(Math.max(0.01, easeOut(s) * SHOCKWAVE.radius));
    this.shockwave.material.opacity = (1 - s) ** 1.5;

    const secondary = t >= SECONDARY_AT ? Math.exp(-(t - SECONDARY_AT) * 8) * 0.5 : 0;
    this.light.intensity = LIGHT_INTENSITY * (Math.exp(-t * 5) + secondary);

    if (this.age > SHIP_EXPLOSION_SECONDS) this.clear();
  }

  clear(): void {
    this.age = Infinity;
    this.secondaryDone = true;
    this.group.visible = false;
    this.light.intensity = 0;
  }

  private throwFragments(strength: number): void {
    const n = (count: number) => Math.round(count * strength);
    this.spray(n(36), PALETTE.ship, 30, [0.6, 1.3], [0.9, 1.8]);
    this.spray(n(90), PALETTE.shipBurst, 48, [0.15, 0.35], [0.3, 0.8]);
    this.spray(n(40), PALETTE.bolt, 20, [0.3, 0.6], [0.6, 1.4]);
  }

  private spray(
    count: number,
    color: number,
    speed: number,
    size: [number, number],
    life: [number, number],
  ): void {
    const between = ([lo, hi]: [number, number]) => lo + Math.random() * (hi - lo);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random() * 0.75);
      this.debris.emit({
        x: this.x,
        y: HEIGHT + Math.random(),
        z: this.z,
        vx: Math.cos(a) * s,
        vy: 8 + Math.random() * 22,
        vz: Math.sin(a) * s,
        color,
        life: between(life),
        size: between(size),
      });
    }
  }
}
