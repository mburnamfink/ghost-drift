import * as THREE from 'three';
import { CONFIG } from '../config';
import type { Sniper } from '../sim/hunters';
import type { Impact, SimEvent, World } from '../sim/world';
import { SNIPER_MUZZLE_HEIGHT } from './models';
import { PALETTE } from './palette';

const TRACER_SECONDS = 0.3;
/** Locked lasers flash this many times per second. */
const LOCK_FLASH_HZ = 12;
/** Ground reticle radius at the start of a charge; it closes to the Ship's hit radius at the lock. */
const RETICLE_START_RADIUS = 7;
const RETICLE_LOCK_RADIUS = CONFIG.ship.radius + CONFIG.sniper.shotWidth;
/** Peak height of an Artillery shell's arc. */
const ARC_HEIGHT = 35;

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
  private readonly sights = new Map<number, SniperSight>();
  private tracers: { beam: Beam; flash: THREE.Sprite; life: number }[] = [];
  private readonly impacts = new Map<Impact, ImpactVisual>();
  private readonly shellGeometry = new THREE.IcosahedronGeometry(0.8, 0);
  private readonly shellMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.shell });
  private time = 0;

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'sniperFired') continue;
      const beam = createBeam(PALETTE.tracer);
      placeBeam(
        beam,
        new THREE.Vector3(e.from.x, SNIPER_MUZZLE_HEIGHT, e.from.y),
        new THREE.Vector3(e.to.x, 1, e.to.y),
        0.6,
      );
      const flash = createGlint(PALETTE.laserLocked);
      flash.position.set(e.from.x, SNIPER_MUZZLE_HEIGHT, e.from.y);
      flash.scale.setScalar(14);
      this.group.add(beam.group, flash);
      this.tracers.push({ beam, flash, life: TRACER_SECONDS });
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
    for (const t of this.tracers) this.removeTracer(t);
    this.tracers = [];
    for (const sight of this.sights.values()) this.removeSight(sight);
    this.sights.clear();
  }

  /**
   * A charging Sniper shows a beam that thickens and brightens, a scope glint visible from across
   * the city, and a reticle on the ground closing on its aim point. Once locked, all three flash.
   */
  private updateLasers(world: World): void {
    const flashOn = Math.floor(this.time * LOCK_FLASH_HZ) % 2 === 0;
    const active = new Set<number>();
    for (const h of world.hunters) {
      if (h.kind !== 'sniper' || !h.charge) continue;
      active.add(h.id);
      let sight = this.sights.get(h.id);
      if (!sight) {
        sight = createSight();
        this.sights.set(h.id, sight);
        this.group.add(sight.root);
      }
      const progress = Math.min(1, h.charge.time / CONFIG.sniper.chargeTime);
      const locked = h.charge.locked;
      const color = locked && flashOn ? PALETTE.laserLocked : PALETTE.laser;
      const [from, to] = laserEnds(h, world);
      placeBeam(sight.beam, from, to, locked ? 0.4 : 0.06 + 0.22 * progress);
      setBeamStyle(sight.beam, color, locked ? 1 : 0.35 + 0.55 * progress);

      sight.glint.position.copy(from);
      sight.glint.scale.setScalar(
        (locked ? 10 : 3 + 6 * progress) * (0.85 + 0.15 * Math.sin(this.time * 30)),
      );
      sight.glint.material.color.setHex(color);

      const radius = locked
        ? RETICLE_LOCK_RADIUS
        : THREE.MathUtils.lerp(RETICLE_START_RADIUS, RETICLE_LOCK_RADIUS, progress);
      sight.reticle.position.set(h.charge.target.x, 0.12, h.charge.target.y);
      sight.reticle.scale.setScalar(radius);
      sight.reticle.rotation.y = this.time * (locked ? 0 : 2.5);
      sight.reticleMaterial.color.setHex(color);
      sight.reticleMaterial.opacity = locked ? 1 : 0.5 + 0.5 * progress;
    }
    for (const [id, sight] of this.sights) {
      if (active.has(id)) continue;
      this.removeSight(sight);
      this.sights.delete(id);
    }
  }

  private updateTracers(frameTime: number): void {
    this.tracers = this.tracers.filter((t) => {
      t.life -= frameTime;
      const fade = Math.max(0, t.life / TRACER_SECONDS);
      setBeamStyle(t.beam, PALETTE.tracer, fade);
      t.flash.material.opacity = fade;
      if (t.life > 0) return true;
      this.removeTracer(t);
      return false;
    });
  }

  private removeTracer(t: { beam: Beam; flash: THREE.Sprite }): void {
    this.group.remove(t.beam.group, t.flash);
    disposeBeam(t.beam);
    t.flash.material.dispose();
  }

  private removeSight(sight: SniperSight): void {
    this.group.remove(sight.root);
    disposeBeam(sight.beam);
    sight.glint.material.dispose();
    sight.reticleMaterial.dispose();
    sight.reticle.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
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

interface Beam {
  group: THREE.Group;
  core: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
}

interface SniperSight {
  root: THREE.Group;
  beam: Beam;
  glint: THREE.Sprite;
  reticle: THREE.Group;
  reticleMaterial: THREE.MeshBasicMaterial;
}

const unitBeam = new THREE.BoxGeometry(1, 1, 1);
const additive = (color: number) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    // Unfogged so a Sniper across the city still reads as a threat.
    fog: false,
  });

/** A bright core inside a wider, fainter glow; both unit boxes stretched between two points. */
function createBeam(color: number): Beam {
  const core = new THREE.Mesh(unitBeam, additive(color));
  const glow = new THREE.Mesh(unitBeam, additive(color));
  const group = new THREE.Group();
  group.add(core, glow);
  return { group, core, glow };
}

function placeBeam(beam: Beam, from: THREE.Vector3, to: THREE.Vector3, thickness: number): void {
  const dir = new THREE.Vector3().subVectors(to, from);
  const length = dir.length();
  beam.group.position.copy(from).addScaledVector(dir, 0.5);
  beam.group.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize());
  beam.core.scale.set(length, thickness, thickness);
  beam.glow.scale.set(length, thickness * 3.5, thickness * 3.5);
}

function disposeBeam(beam: Beam): void {
  beam.core.material.dispose();
  beam.glow.material.dispose();
}

function setBeamStyle(beam: Beam, color: number, opacity: number): void {
  beam.core.material.color.setHex(color);
  beam.glow.material.color.setHex(color);
  beam.core.material.opacity = opacity;
  beam.glow.material.opacity = opacity * 0.3;
}

let glintTexture: THREE.CanvasTexture | null = null;

/** A four-pointed lens flare, drawn once and shared. */
function glintMap(): THREE.CanvasTexture {
  if (glintTexture) return glintTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const c = size / 2;
  const halo = g.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.15, 'rgba(255,255,255,0.8)');
  halo.addColorStop(0.4, 'rgba(255,255,255,0.15)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(c, 0);
  g.lineTo(c + 3, c - 3);
  g.lineTo(size, c);
  g.lineTo(c + 3, c + 3);
  g.lineTo(c, size);
  g.lineTo(c - 3, c + 3);
  g.lineTo(0, c);
  g.lineTo(c - 3, c - 3);
  g.closePath();
  g.fill();
  glintTexture = new THREE.CanvasTexture(canvas);
  return glintTexture;
}

function createGlint(color: number): THREE.Sprite {
  return new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glintMap(),
      color,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }),
  );
}

/** A unit-radius ring with four inward ticks, laid flat; scaled to the reticle radius. */
function createReticle(material: THREE.MeshBasicMaterial): THREE.Group {
  const reticle = new THREE.Group();
  reticle.add(new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), material));
  for (let i = 0; i < 4; i++) {
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.1).rotateX(-Math.PI / 2), material);
    const a = (i * Math.PI) / 2;
    tick.position.set(Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72);
    tick.rotation.y = -a;
    reticle.add(tick);
  }
  return reticle;
}

function createSight(): SniperSight {
  const beam = createBeam(PALETTE.laser);
  const glint = createGlint(PALETTE.laser);
  const reticleMaterial = additive(PALETTE.laser);
  reticleMaterial.side = THREE.DoubleSide;
  const reticle = createReticle(reticleMaterial);
  const root = new THREE.Group();
  root.add(beam.group, glint, reticle);
  return { root, beam, glint, reticle, reticleMaterial };
}
