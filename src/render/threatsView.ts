import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Sniper } from '../sim/hunters';
import type { Impact, SimEvent, World } from '../sim/world';
import { SNIPER_MUZZLE_HEIGHT } from './models';
import { PALETTE } from './palette';

const TRACER_SECONDS = 0.15;
/** Locked lasers flash this many times per second. */
const LOCK_FLASH_HZ = 12;
/** Peak height of an Artillery shell's arc. */
const ARC_HEIGHT = 35;
const MAX_LASERS = 16;

interface ImpactVisual {
  zone: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  fill: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  shell: THREE.Mesh;
}

/**
 * Warnings and weapon effects for Snipers and Artillery: charging and locked lasers, shot
 * tracers, Artillery shells in flight and the ground circles that close as they come down.
 */
export class ThreatsView {
  readonly group = new THREE.Group();
  private readonly charging = laserLines(PALETTE.laser, 0.55);
  private readonly locked = laserLines(PALETTE.laserLocked, 1);
  private readonly tracers = laserLines(PALETTE.tracer, 1);
  private tracerLife: { from: THREE.Vector3; to: THREE.Vector3; life: number }[] = [];
  private readonly impacts = new Map<Impact, ImpactVisual>();
  private readonly shellGeometry = new THREE.IcosahedronGeometry(0.8, 0);
  private readonly shellMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.shell });
  private time = 0;

  constructor() {
    this.group.add(this.charging, this.locked, this.tracers);
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'sniperFired') continue;
      this.tracerLife.push({
        from: new THREE.Vector3(e.from.x, SNIPER_MUZZLE_HEIGHT, e.from.y),
        to: new THREE.Vector3(e.to.x, 1, e.to.y),
        life: TRACER_SECONDS,
      });
    }
  }

  update(world: World, frameTime: number): void {
    this.time += frameTime;
    this.updateLasers(world);
    this.updateTracers(frameTime);
    this.updateImpacts(world);
  }

  clear(): void {
    for (const v of this.impacts.values()) this.removeImpact(v);
    this.impacts.clear();
    this.tracerLife = [];
  }

  private updateLasers(world: World): void {
    const charging: THREE.Vector3[] = [];
    const locked: THREE.Vector3[] = [];
    const flashOn = Math.floor(this.time * LOCK_FLASH_HZ) % 2 === 0;
    for (const h of world.hunters) {
      if (h.kind !== 'sniper' || !h.charge) continue;
      const [from, to] = laserEnds(h, world);
      if (!h.charge.locked) charging.push(from, to);
      else if (flashOn) locked.push(from, to);
    }
    setSegments(this.charging, charging);
    setSegments(this.locked, locked);
  }

  private updateTracers(frameTime: number): void {
    this.tracerLife = this.tracerLife.filter((t) => (t.life -= frameTime) > 0);
    setSegments(
      this.tracers,
      this.tracerLife.flatMap((t) => [t.from, t.to]),
    );
  }

  private updateImpacts(world: World): void {
    const live = new Set(world.impacts);
    for (const [impact, v] of this.impacts) {
      if (live.has(impact)) continue;
      this.removeImpact(v);
      this.impacts.delete(impact);
    }
    const blast = CONFIG.artillery.blastRadius;
    for (const impact of world.impacts) {
      let v = this.impacts.get(impact);
      if (!v) {
        v = this.createImpact(impact);
        this.impacts.set(impact, v);
      }
      const progress = 1 - impact.time / impact.flight;
      v.fill.scale.setScalar(Math.max(0.01, progress * blast));
      v.fill.material.opacity = 0.15 + 0.35 * progress;
      v.zone.material.opacity =
        0.5 + 0.5 * Math.abs(Math.sin(this.time * Math.PI * (2 + 6 * progress)));
      v.shell.position.set(
        THREE.MathUtils.lerp(impact.from.x, impact.pos.x, progress),
        2 + 4 * ARC_HEIGHT * progress * (1 - progress),
        THREE.MathUtils.lerp(impact.from.y, impact.pos.y, progress),
      );
    }
  }

  private createImpact(impact: Impact): ImpactVisual {
    const blast = CONFIG.artillery.blastRadius;
    const zone = new THREE.Mesh(
      new THREE.RingGeometry(blast - 0.5, blast, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE.impactZone,
        transparent: true,
        depthWrite: false,
      }),
    );
    // Unit disc scaled up to the blast radius as the shell falls: when it fills the ring, it lands.
    const fill = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE.impactZone,
        transparent: true,
        depthWrite: false,
      }),
    );
    zone.position.set(impact.pos.x, 0.06, impact.pos.y);
    fill.position.set(impact.pos.x, 0.05, impact.pos.y);
    const shell = new THREE.Mesh(this.shellGeometry, this.shellMaterial);
    this.group.add(zone, fill, shell);
    return { zone, fill, shell };
  }

  private removeImpact(v: ImpactVisual): void {
    this.group.remove(v.zone, v.fill, v.shell);
    v.zone.geometry.dispose();
    v.zone.material.dispose();
    v.fill.geometry.dispose();
    v.fill.material.dispose();
  }
}

/** The laser runs from the muzzle through the aim point until it meets terrain, as the shot will. */
function laserEnds(h: Sniper, world: World): [THREE.Vector3, THREE.Vector3] {
  const target = h.charge!.target;
  const dx = target.x - h.pos.x;
  const dy = target.y - h.pos.y;
  const len = Math.hypot(dx, dy) || 1;
  const dir = { x: dx / len, y: dy / len };
  const range = world.terrain.castRay(h.pos, dir, CONFIG.sniper.maxRange * 1.5);
  return [
    new THREE.Vector3(h.pos.x, SNIPER_MUZZLE_HEIGHT, h.pos.y),
    new THREE.Vector3(h.pos.x + dir.x * range, 1, h.pos.y + dir.y * range),
  ];
}

function laserLines(color: number, opacity: number): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(MAX_LASERS * 2 * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setDrawRange(0, 0);
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  lines.frustumCulled = false;
  return lines;
}

function setSegments(lines: THREE.LineSegments, points: readonly THREE.Vector3[]): void {
  const attr = lines.geometry.getAttribute('position') as THREE.BufferAttribute;
  const n = Math.min(points.length, MAX_LASERS * 2);
  for (let i = 0; i < n; i++) attr.setXYZ(i, points[i]!.x, points[i]!.y, points[i]!.z);
  attr.needsUpdate = true;
  lines.geometry.setDrawRange(0, n);
}
