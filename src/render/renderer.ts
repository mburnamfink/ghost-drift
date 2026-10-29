import * as THREE from 'three';
import { CONFIG, SHIP_TOP_SPEED } from '../config';
import { clamp, wrapAngle } from '../core/vec2';
import type { Artillery, Berserker, Juggernaut } from '../sim/hunters';
import { isBursting, speedOf } from '../sim/ship';
import type { Shot } from '../sim/shots';
import type { SimEvent, World } from '../sim/world';
import { Afterimages } from './afterimages';
import { Debris } from './debris';
import { type HunterModel, MORTAR_MOUNT, createHunterModel, createShipModel } from './models';
import { PALETTE } from './palette';
import { PulsesView } from './pulsesView';
import { TerrainView } from './terrainView';
import { TitleScene } from './titleScene';
import { ThreatsView } from './threatsView';

const SHOT_CAPACITY = 512;

/** A threat outside the view, as a screen-space angle from the centre (0 = right, π/2 = up). */
export interface ScreenThreat {
  angle: number;
  kind: 'sniper' | 'artillery';
}
const CAMERA = {
  distance: 14,
  height: 9,
  lookAhead: 16,
  /** How quickly the camera swings round behind the Heading; lower is lazier. */
  yawFollow: 6,
  baseFov: 68,
  speedFov: 16,
  burstFov: 10,
};
const SHIP_HOVER_HEIGHT = 0.9;
const SHIP_BANK = {
  /** Roll in radians per radian-per-second of turn; full steering banks about 30 degrees. */
  perTurnRate: 0.2,
  max: 0.7,
  /** How quickly the roll follows the turn; higher is snappier. */
  response: 10,
};
/**
 * The Ship leaves afterimages above `from` of top speed, faint at first and full strength at top
 * speed. Below the ~65% a full-lock turn at full thrust holds, so hard cornering still trails.
 */
const SHIP_BLUR = { from: 0.5, minStrength: 0.35 };
const HIT_FLASH_SECONDS = 0.1;
const HEALTH_BAR_HEIGHT = 7;
/** How far, and for how long, an Artillery mortar kicks back when it fires. */
const MORTAR_RECOIL = { distance: 0.8, seconds: 0.35 };
const SPARK = {
  /** Sparks per second at top speed. */
  rate: 140,
  minSpeed: 4,
};

/**
 * Draws a World. Reads simulation state every frame and never writes to it (ADR-0002).
 * Simulation (x, y) maps to scene (x, 0, y); a sim angle θ maps to rotation.y = -θ.
 */
export class GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA.baseFov, 1, 0.1, 600);
  private readonly ship = createShipModel();
  private readonly hunters = new Map<number, HunterModel>();
  /** Per Artillery piece: last seen cooldown, to spot firing, and seconds of recoil left. */
  private readonly mortars = new Map<number, { cooldown: number; recoil: number }>();
  private readonly bolts: THREE.InstancedMesh;
  /** Tank shells drawn as a solid core inside a faint halo. */
  private readonly shellLayers: THREE.InstancedMesh[];
  /** Juggernaut Spray Shells: the same look, larger. */
  private readonly sprayLayers: THREE.InstancedMesh[];
  /** Seconds of hit flash left, per Juggernaut. */
  private readonly hitFlash = new Map<number, number>();
  private readonly pulses = new PulsesView();
  private readonly debris = new Debris();
  private readonly afterimages = new Afterimages();
  private readonly dummy = new THREE.Object3D();
  private readonly threats = new ThreatsView();
  private terrain: TerrainView | null = null;
  private title: TitleScene | null = null;
  private sparkBudget = 0;
  private cameraYaw = 0;
  private lastHeading = 0;
  private shake = 0;
  private elapsed = 0;

  /**
   * @param overhead Fixed top-down view of the whole Arena, for inspecting layouts.
   * @param variedBlocks Draw Blocks in assorted shapes instead of plain boxes.
   */
  constructor(
    container: HTMLElement,
    private readonly overhead = false,
    private readonly variedBlocks = true,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 60, 230);
    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x10131c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun);

    this.bolts = shotMesh(new THREE.BoxGeometry(1.6, 0.25, 0.25), PALETTE.bolt);
    this.shellLayers = [
      shotMesh(new THREE.IcosahedronGeometry(0.45, 0), PALETTE.tankShell),
      shotMesh(new THREE.IcosahedronGeometry(0.8, 1), PALETTE.tankShell, 0.2),
    ];
    this.sprayLayers = [
      shotMesh(new THREE.IcosahedronGeometry(0.75, 0), PALETTE.tankShell),
      shotMesh(new THREE.IcosahedronGeometry(1.2, 1), PALETTE.tankShell, 0.2),
    ];
    this.scene.add(
      this.ship.root,
      this.bolts,
      ...this.shellLayers,
      ...this.sprayLayers,
      this.pulses.group,
      this.debris.mesh,
      this.threats.group,
      this.afterimages.group,
    );

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Rebuilds static scenery for a new World and snaps the camera behind the Ship. */
  setWorld(world: World): void {
    if (this.terrain) {
      this.scene.remove(this.terrain.group);
      this.terrain.dispose();
    }
    this.terrain = new TerrainView(world.terrain, this.variedBlocks, world.city?.arch ?? null);
    this.scene.add(this.terrain.group);
    for (const [id, model] of this.hunters) this.removeHunter(id, model);
    this.debris.clear();
    this.afterimages.clear();
    this.threats.clear();
    this.cameraYaw = world.ship.heading;
    this.lastHeading = world.ship.heading;
  }

  handleEvents(events: readonly SimEvent[]): void {
    this.threats.handleEvents(events);
    for (const e of events) {
      switch (e.type) {
        case 'hunterDestroyed': {
          const big = e.kind === 'juggernaut';
          this.debris.burst(e.pos.x, e.pos.y, PALETTE.hunter, big ? 90 : 28, big ? 26 : 18);
          this.shake = Math.max(this.shake, big ? 1 : 0.35);
          break;
        }
        case 'hunterHit':
          this.debris.burst(e.pos.x, e.pos.y, PALETTE.spark, 6, 10);
          this.hitFlash.set(e.id, HIT_FLASH_SECONDS);
          break;
        case 'shipHit':
          this.debris.burst(e.pos.x, e.pos.y, PALETTE.ship, 12, 10);
          this.shake = Math.max(this.shake, 0.8);
          break;
        case 'shipDestroyed':
          this.debris.burst(e.pos.x, e.pos.y, PALETTE.ship, 60, 26);
          this.shake = 1.5;
          break;
        case 'impact':
          this.debris.burst(e.pos.x, e.pos.y, PALETTE.impactZone, 40, 22);
          this.shake = Math.max(this.shake, this.shakeAtDistance(e.pos, 1.2));
          break;
        case 'pulseFired':
          this.shake = Math.max(this.shake, 0.2);
          break;
        case 'sniperFired':
          this.shake = Math.max(this.shake, 0.5);
          break;
        case 'salvoFired':
          this.debris.burst(e.from.x, e.from.y, PALETTE.shell, 8, 6);
          break;
        case 'terrainChanged':
          this.terrain?.applyChange(e.change);
          break;
        case 'burstBounced':
          this.debris.burst(e.pos.x, e.pos.y, PALETTE.spark, 24, 16);
          this.shake = Math.max(this.shake, 0.6);
          break;
        case 'burstStarted':
          this.shake = Math.max(this.shake, 0.3);
          break;
        default:
          break;
      }
    }
  }

  render(world: World, frameTime: number): void {
    this.elapsed += frameTime;
    this.syncShip(world, frameTime);
    this.syncHunters(world, frameTime);
    syncShots(this.bolts, world.bolts, this.dummy, true);
    this.pulses.update(world.pulses);
    const shells = world.shells.filter((s) => s.radius === undefined);
    const sprays = world.shells.filter((s) => s.radius !== undefined);
    for (const layer of this.shellLayers) syncShots(layer, shells, this.dummy, true);
    for (const layer of this.sprayLayers) syncShots(layer, sprays, this.dummy, true);
    this.debris.update(frameTime);
    this.afterimages.update(frameTime);
    this.threats.update(world, frameTime);
    this.terrain?.update(world.pendingChange, frameTime);
    this.updateCamera(world, frameTime);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Directions, in screen space from the screen centre, of active threats the camera cannot see:
   * charging Snipers and incoming Artillery impacts. Call after `render` so the camera is current.
   */
  offscreenThreats(world: World): ScreenThreat[] {
    const out: ScreenThreat[] = [];
    const consider = (x: number, y: number, kind: ScreenThreat['kind']) => {
      const world3 = new THREE.Vector3(x, 1, y);
      const ndc = world3.clone().project(this.camera);
      const view = world3.applyMatrix4(this.camera.matrixWorldInverse);
      const inFront = view.z < 0;
      if (inFront && Math.abs(ndc.x) <= 0.95 && Math.abs(ndc.y) <= 0.95) return;
      // Camera-space x/y point the right way from the screen centre whether in front or behind.
      out.push({ angle: Math.atan2(view.y, view.x), kind });
    };
    for (const h of world.hunters)
      if (h.kind === 'sniper' && h.charge) consider(h.pos.x, h.pos.y, 'sniper');
    for (const i of world.impacts) consider(i.pos.x, i.pos.y, 'artillery');
    return out;
  }

  /** Glows and shudders while winding up; stretches and blurs while lunging. */
  private styleBerserker(h: Berserker, model: HunterModel, frameTime: number): void {
    const material = model.body.material;
    if (h.phase === 'windup') {
      material.emissiveIntensity = 0.6 + 0.4 * Math.sin(this.elapsed * 60);
      model.root.position.x += (Math.random() - 0.5) * 0.3;
      model.root.position.z += (Math.random() - 0.5) * 0.3;
    } else {
      material.emissiveIntensity = h.phase === 'lunge' ? 1 : 0.25;
    }
    model.root.scale.set(h.phase === 'lunge' ? 1.4 : 1, 1, h.phase === 'lunge' ? 0.8 : 1);
    if (h.phase === 'lunge')
      this.afterimages.emit(h.id, model.root, PALETTE.berserkerBlur, frameTime);
    else this.afterimages.stop(h.id);
  }

  /**
   * The mortar's mouth glows brighter as it reloads and pulses once ready, so a loaded piece reads
   * as a threat; it kicks back along its tube when it fires.
   */
  private styleArtillery(h: Artillery, model: HunterModel, frameTime: number): void {
    const { mortar, glow } = model;
    if (!mortar || !glow) return;
    const state = this.mortars.get(h.id) ?? { cooldown: h.fireCooldown, recoil: 0 };
    // Firing resets the cooldown upward; any rise means a Salvo just left.
    state.recoil =
      h.fireCooldown > state.cooldown
        ? MORTAR_RECOIL.seconds
        : Math.max(0, state.recoil - frameTime);
    state.cooldown = h.fireCooldown;
    this.mortars.set(h.id, state);

    const kick = (MORTAR_RECOIL.distance * state.recoil) / MORTAR_RECOIL.seconds;
    mortar.position.set(
      -Math.sin(MORTAR_MOUNT.pitch) * kick,
      MORTAR_MOUNT.y - Math.cos(MORTAR_MOUNT.pitch) * kick,
      0,
    );
    const readiness = clamp(1 - h.fireCooldown / CONFIG.artillery.cooldown, 0, 1);
    const pulse = h.fireCooldown <= 0 ? 0.25 * Math.sin(this.elapsed * 12) : 0;
    glow.scale.setScalar(0.3 + readiness + pulse);
    glow.material.opacity = 0.15 + 0.85 * readiness * readiness;
  }

  /** Barrel tips glow through the Spray wind-up; a hit flashes the hull; a bar shows armour left. */
  private styleJuggernaut(h: Juggernaut, model: HunterModel, frameTime: number): void {
    const cfg = CONFIG.juggernaut;
    const charge = h.windup > 0 ? 1 - h.windup / cfg.windup : 0;
    for (const muzzle of model.muzzles ?? []) {
      muzzle.visible = charge > 0;
      muzzle.scale.setScalar(0.4 + 1.2 * charge + 0.15 * Math.sin(this.elapsed * 40));
    }

    const flash = Math.max(0, (this.hitFlash.get(h.id) ?? 0) - frameTime);
    this.hitFlash.set(h.id, flash);
    const material = model.body.material;
    material.emissive.setHex(flash > 0 ? 0xffffff : PALETTE.hunter);
    material.emissiveIntensity = flash > 0 ? 0.8 : 0.25;

    const bar = model.healthBar;
    if (!bar) return;
    if (!bar.group.parent) this.scene.add(bar.group);
    bar.group.position.set(h.pos.x, HEALTH_BAR_HEIGHT, h.pos.y);
    bar.group.quaternion.copy(this.camera.quaternion);
    bar.fill.scale.x = Math.max(0.001, h.hp / cfg.hp);
  }

  /** Direction the camera faces, in simulation radians. */
  get viewYaw(): number {
    return this.cameraYaw;
  }

  /**
   * Direction from the Ship to `pos` as seen from behind the camera: 0 = right, π/2 = straight
   * ahead. For pointers that say which way to go, not where something is on screen.
   */
  bearingFromShip(world: World, pos: { x: number; y: number }): number {
    const dx = pos.x - world.ship.pos.x;
    const dy = pos.y - world.ship.pos.y;
    const fx = Math.cos(this.cameraYaw);
    const fy = Math.sin(this.cameraYaw);
    const ahead = dx * fx + dy * fy;
    // Screen right is (-sin, cos) of the camera yaw in simulation coordinates.
    const right = -dx * fy + dy * fx;
    return Math.atan2(ahead, right);
  }

  private shakeAtDistance(pos: { x: number; y: number }, strength: number): number {
    const d = Math.hypot(pos.x - this.camera.position.x, pos.y - this.camera.position.z);
    return strength * Math.max(0, 1 - d / 60);
  }

  private syncShip(world: World, frameTime: number): void {
    const { ship } = world;
    const root = this.ship.root;
    root.visible =
      !world.over && (ship.invulnerableTime <= 0 || Math.floor(this.elapsed * 16) % 2 === 0);
    root.position.set(
      ship.pos.x,
      SHIP_HOVER_HEIGHT + Math.sin(this.elapsed * 6) * 0.08,
      ship.pos.y,
    );
    const turnRate = frameTime > 0 ? wrapAngle(ship.heading - this.lastHeading) / frameTime : 0;
    this.lastHeading = ship.heading;
    root.rotation.y = -ship.heading;
    // Bank into turns: positive roll about the nose axis drops the right side.
    const bank = clamp(turnRate * SHIP_BANK.perTurnRate, -SHIP_BANK.max, SHIP_BANK.max);
    root.rotation.x += (bank - root.rotation.x) * (1 - Math.exp(-SHIP_BANK.response * frameTime));
    const bursting = isBursting(ship);
    this.ship.material.color.setHex(bursting ? PALETTE.shipBurst : PALETTE.ship);
    this.ship.material.emissive.setHex(bursting ? PALETTE.shipBurst : PALETTE.ship);
    root.scale.set(bursting ? 1.6 : 1, bursting ? 0.7 : 1, bursting ? 0.7 : 1);
    if (ship.sliding && !world.over) this.emitSparks(world, frameTime);
    const speedFraction = speedOf(ship) / SHIP_TOP_SPEED;
    if (root.visible && (bursting || speedFraction >= SHIP_BLUR.from)) {
      const ramp = clamp((speedFraction - SHIP_BLUR.from) / (1 - SHIP_BLUR.from), 0, 1);
      const strength = bursting ? 1 : SHIP_BLUR.minStrength + (1 - SHIP_BLUR.minStrength) * ramp;
      const color = bursting ? PALETTE.shipBurst : PALETTE.ship;
      this.afterimages.emit(this.ship, root, color, frameTime, strength);
    } else {
      this.afterimages.stop(this.ship);
    }
  }

  /** Sparks are thrown from the hull's trailing edge and left behind, tracing the line of travel. */
  private emitSparks(world: World, frameTime: number): void {
    const { ship } = world;
    const speed = speedOf(ship);
    if (speed < SPARK.minSpeed) return;
    this.sparkBudget += SPARK.rate * Math.min(1, speed / SHIP_TOP_SPEED) * frameTime;
    const tx = ship.vel.x / speed;
    const ty = ship.vel.y / speed;
    for (; this.sparkBudget >= 1; this.sparkBudget--) {
      const side = (Math.random() - 0.5) * 2;
      this.debris.emit({
        x: ship.pos.x - tx * 1.2 - ty * side,
        y: 0.3,
        z: ship.pos.y - ty * 1.2 + tx * side,
        vx: tx * speed * 0.15 + (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 5,
        vz: ty * speed * 0.15 + (Math.random() - 0.5) * 6,
        color: PALETTE.spark,
        life: 0.35 + Math.random() * 0.45,
        size: 0.15 + Math.random() * 0.2,
      });
    }
  }

  private syncHunters(world: World, frameTime: number): void {
    const alive = new Set<number>();
    for (const h of world.hunters) {
      alive.add(h.id);
      let model = this.hunters.get(h.id);
      if (!model) {
        model = createHunterModel(h.kind);
        this.hunters.set(h.id, model);
        this.scene.add(model.root);
      }
      model.root.position.set(h.pos.x, 0, h.pos.y);
      model.root.rotation.y = -h.heading;
      model.turret.rotation.y = -(h.aim - h.heading);
      if (h.kind === 'berserker') this.styleBerserker(h, model, frameTime);
      if (h.kind === 'artillery') this.styleArtillery(h, model, frameTime);
      if (h.kind === 'juggernaut') this.styleJuggernaut(h, model, frameTime);
    }
    for (const [id, model] of this.hunters) if (!alive.has(id)) this.removeHunter(id, model);
  }

  /** Removes everything drawn for one Hunter, including parts that live outside its model. */
  private removeHunter(id: number, model: HunterModel): void {
    this.afterimages.stop(id);
    this.scene.remove(model.root);
    // The health bar sits in the scene, not the model, so it can face the camera.
    if (model.healthBar) this.scene.remove(model.healthBar.group);
    model.glow?.material.dispose();
    model.muzzles?.[0]?.material.dispose();
    if (model.kind === 'berserker' || model.kind === 'juggernaut') model.body.material.dispose();
    this.hitFlash.delete(id);
    this.mortars.delete(id);
    this.hunters.delete(id);
  }

  private updateCamera(world: World, frameTime: number): void {
    if (this.overhead) {
      const half = world.terrain.worldSize / 2;
      this.camera.position.set(half, world.terrain.worldSize * 1.05, half + 0.01);
      this.camera.lookAt(half, 0, half);
      this.camera.fov = 55;
      this.camera.far = 1000;
      this.camera.updateProjectionMatrix();
      this.scene.fog = null;
      return;
    }
    const { ship } = world;
    const follow = 1 - Math.exp(-CAMERA.yawFollow * frameTime);
    this.cameraYaw += wrapAngle(ship.heading - this.cameraYaw) * follow;
    const fx = Math.cos(this.cameraYaw);
    const fz = Math.sin(this.cameraYaw);

    this.shake = Math.max(0, this.shake - frameTime * 2.5);
    const jitter = () => (Math.random() - 0.5) * this.shake;
    this.camera.position.set(
      ship.pos.x - fx * CAMERA.distance + jitter(),
      CAMERA.height + jitter(),
      ship.pos.y - fz * CAMERA.distance + jitter(),
    );
    this.camera.lookAt(ship.pos.x + fx * CAMERA.lookAhead, 1, ship.pos.y + fz * CAMERA.lookAhead);
    this.terrain?.updateOcclusion(
      this.camera.position,
      new THREE.Vector3(ship.pos.x, SHIP_HOVER_HEIGHT, ship.pos.y),
      frameTime,
    );

    const speedFraction = Math.min(1, speedOf(ship) / SHIP_TOP_SPEED);
    const targetFov =
      CAMERA.baseFov + CAMERA.speedFov * speedFraction + (isBursting(ship) ? CAMERA.burstFov : 0);
    this.camera.fov = THREE.MathUtils.lerp(
      this.camera.fov,
      targetFov,
      1 - Math.exp(-5 * frameTime),
    );
    this.camera.updateProjectionMatrix();
  }

  /** Draws the title screen's live backdrop instead of the World. Built on first use. */
  renderTitle(frameTime: number): void {
    if (!this.title) {
      this.title = new TitleScene();
      this.title.setAspect(this.camera.aspect);
    }
    this.title.update(frameTime);
    this.renderer.render(this.title.scene, this.title.camera);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.title?.setAspect(w / h);
  }
}

/** `glow` makes the layer additive at that opacity, for halos and trails. */
function shotMesh(
  geometry: THREE.BufferGeometry,
  color: number,
  glow?: number,
): THREE.InstancedMesh {
  const material =
    glow === undefined
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: glow,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
  const mesh = new THREE.InstancedMesh(geometry, material, SHOT_CAPACITY);
  mesh.count = 0;
  mesh.frustumCulled = false;
  return mesh;
}

function syncShots(
  mesh: THREE.InstancedMesh,
  shots: readonly Shot[],
  dummy: THREE.Object3D,
  orient: boolean,
) {
  const n = Math.min(shots.length, SHOT_CAPACITY);
  for (let i = 0; i < n; i++) {
    const s = shots[i]!;
    dummy.position.set(s.pos.x, 1, s.pos.y);
    dummy.rotation.set(0, orient ? -Math.atan2(s.vel.y, s.vel.x) : 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.count = n;
  mesh.instanceMatrix.needsUpdate = true;
}
