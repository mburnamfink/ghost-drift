import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { HunterKind } from '../sim/hunters';
import { createWorld } from '../sim/world';
import { Terrain } from '../sim/terrain';
import { Afterimages } from './afterimages';
import { createHunterModel, createShipModel, sniperMuzzle } from './models';
import { PALETTE } from './palette';
import { TerrainView } from './terrainView';
import { createBeam, createGlint, placeBeam, setBeamStyle } from './threatsView';

/** City and Wave the backdrop is built from: a Grid city, dense enough to wall the avenues. */
const SEED = 3;
const WAVE = 8;
const BUILDING_SCALE = 1.8;
/** How far ahead of the camera the Ship hovers, and how far it weaves side to side. */
const SHIP_AHEAD = 11;
const WEAVE = 3.2;
const SHELL_SPEED = 30;
/** Seconds between Tank shots. */
const SHOT_INTERVAL = 0.55;
/** Seconds between Sniper shots; the beam tracks the Ship, a step behind, until it fires. */
const SNIPE_INTERVAL = 4.5;

interface Shell {
  mesh: THREE.Group;
  vel: THREE.Vector3;
  life: number;
}

/**
 * The live backdrop behind the title: the camera at the mouth of a real avenue between solid
 * buildings, the Ship hovering and spinning while it weaves through Tank shells and a Sniper's
 * tracking laser. It is staged, not simulated: nothing here can hit anything.
 */
export class TitleScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
  private readonly ship = createShipModel();
  private readonly afterimages = new Afterimages();
  private readonly tanks: THREE.Group[] = [];
  private readonly turrets: THREE.Group[] = [];
  private readonly sniperPos: { x: number; y: number };
  private readonly sniperTurret: THREE.Group;
  private readonly laser = createBeam(PALETTE.laser);
  private readonly flash = createGlint(PALETTE.laserLocked);
  private readonly shells: Shell[] = [];
  private readonly shellCore = new THREE.IcosahedronGeometry(0.45, 0);
  private readonly shellHalo = new THREE.IcosahedronGeometry(0.8, 1);
  private readonly origin: THREE.Vector3;
  private readonly rng = new Rng(11);
  private time = 0;
  private shotTimer = 0;
  private laserAim = new THREE.Vector3();
  private flashTime = 0;

  constructor() {
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 60, 260);
    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x10131c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.4, 1, 0.25);
    this.scene.add(sun);

    const world = createWorld(SEED, undefined, WAVE, 'grid');
    // Taller than in play, so the avenue reads as a canyon from street level.
    const terrain = new Terrain(
      world.terrain.cells,
      world.terrain.cellSize,
      world.terrain.blocks.map((b) => ({ ...b, height: b.height * BUILDING_SCALE })),
    );
    this.scene.add(new TerrainView(terrain, true, null).group);

    const avenue = findAvenue(terrain);
    // Looking down the avenue toward -y in the simulation, which is -z here.
    this.origin = new THREE.Vector3(avenue.x, 0, avenue.y);
    const ahead = (d: number, side = 0) => ({ x: avenue.x + side, y: avenue.y - d });

    const place = (kind: HunterKind, d: number, side: number) => {
      const model = createHunterModel(kind);
      const p = ahead(d, side);
      model.root.position.set(p.x, 0, p.y);
      // Facing +y in the simulation: back up the avenue toward the camera.
      model.root.rotation.y = -Math.PI / 2;
      this.scene.add(model.root);
      return model;
    };
    for (const [d, side] of [
      [52, -4],
      [64, 5],
      [80, -2],
    ] as const) {
      const tank = place('tank', d, side);
      this.tanks.push(tank.root);
      this.turrets.push(tank.turret);
    }
    place('juggernaut', 100, 4);
    this.sniperTurret = place('sniper', 130, -5).turret;
    this.sniperPos = ahead(130, -5);

    this.scene.add(this.ship.root, this.afterimages.group, this.laser.group, this.flash);
    this.flash.visible = false;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(frameTime: number): void {
    this.time += frameTime;
    const t = this.time;
    const o = this.origin;

    this.camera.position.set(o.x + Math.sin(t * 0.3) * 0.6, 4.2 + Math.sin(t * 0.5) * 0.3, o.z);
    this.camera.lookAt(o.x, 4.5, o.z - 60);

    // Weave across the avenue, banking into each turn, while spinning on the spot.
    const sway = Math.sin(t * 1.1) * WEAVE + Math.sin(t * 2.3) * WEAVE * 0.3;
    const swayVel = Math.cos(t * 1.1) * 1.1 * WEAVE + Math.cos(t * 2.3) * 2.3 * WEAVE * 0.3;
    const ship = this.ship.root;
    ship.position.set(o.x + sway, 1.4 + Math.sin(t * 3) * 0.15, o.z - SHIP_AHEAD);
    ship.rotation.set(0, t * 1.4, 0);
    ship.rotateX(THREE.MathUtils.clamp(-swayVel * 0.08, -0.5, 0.5));
    // Spinning while it weaves leaves a trail of turned afterimages, as a Powerslide does.
    this.afterimages.emit(this.ship, ship, PALETTE.ship, frameTime);
    this.afterimages.update(frameTime);

    for (let i = 0; i < this.tanks.length; i++) {
      const tank = this.tanks[i]!;
      tank.position.x += Math.sin(t * 0.7 + i * 2) * 0.03;
      const aim = Math.atan2(ship.position.z - tank.position.z, ship.position.x - tank.position.x);
      this.turrets[i]!.rotation.y = -(aim - Math.PI / 2);
    }

    this.updateShells(frameTime);
    this.updateLaser(frameTime);
  }

  /** Tanks fire at where the Ship is now; by the time a shell arrives it has weaved aside. */
  private updateShells(frameTime: number): void {
    this.shotTimer -= frameTime;
    if (this.shotTimer <= 0) {
      this.shotTimer = SHOT_INTERVAL * this.rng.range(0.6, 1.4);
      const tank = this.tanks[this.rng.int(this.tanks.length)]!;
      const from = tank.position.clone().setY(1.5);
      const to = this.ship.root.position.clone().setY(1.2);
      const vel = to.sub(from).normalize().multiplyScalar(SHELL_SPEED);
      const mesh = new THREE.Group();
      mesh.add(
        new THREE.Mesh(this.shellCore, new THREE.MeshBasicMaterial({ color: PALETTE.tankShell })),
        new THREE.Mesh(
          this.shellHalo,
          new THREE.MeshBasicMaterial({
            color: PALETTE.tankShell,
            transparent: true,
            opacity: 0.2,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        ),
      );
      mesh.position.copy(from);
      this.scene.add(mesh);
      this.shells.push({ mesh, vel, life: 4 });
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]!;
      s.mesh.position.addScaledVector(s.vel, frameTime);
      s.life -= frameTime;
      // Gone once past the Ship, before it can fly through the camera.
      if (s.life > 0 && s.mesh.position.z < this.ship.root.position.z + 3) continue;
      this.scene.remove(s.mesh);
      for (const child of s.mesh.children)
        ((child as THREE.Mesh).material as THREE.Material).dispose();
      this.shells.splice(i, 1);
    }
  }

  /** The Sniper's beam drags after the Ship, thickening, then flashes as it fires and misses. */
  private updateLaser(frameTime: number): void {
    const target = this.ship.root.position;
    this.laserAim.lerp(target, Math.min(1, frameTime * 2.2));
    const phase = (this.time % SNIPE_INTERVAL) / SNIPE_INTERVAL;
    if (phase < frameTime / SNIPE_INTERVAL) this.flashTime = 0.15;
    this.flashTime = Math.max(0, this.flashTime - frameTime);

    const aim = Math.atan2(this.laserAim.z - this.sniperPos.y, this.laserAim.x - this.sniperPos.x);
    // Hunters here face +y, a Heading of π/2.
    this.sniperTurret.rotation.y = -(aim - Math.PI / 2);
    const from = sniperMuzzle(this.sniperPos, aim);
    // Ends just past the Ship rather than running on into the camera.
    const to = this.laserAim
      .clone()
      .addScaledVector(this.laserAim.clone().sub(from).normalize(), 2);
    placeBeam(this.laser, from, to, 0.05 + 0.12 * phase);
    const firing = this.flashTime > 0;
    setBeamStyle(this.laser, firing ? PALETTE.laserLocked : PALETTE.laser, 0.35 + 0.6 * phase);
    this.flash.visible = firing;
    this.flash.position.copy(from);
    this.flash.scale.setScalar(12);
  }
}

/** The avenue's width in cells, and how far down it the scene looks. */
const AVENUE_CELLS = 4;
const AVENUE_LENGTH = 30;

/**
 * Finds the stretch of avenue, heading north (-y), best walled by buildings on both sides, and
 * returns the world position of its southern mouth.
 */
function findAvenue(terrain: Terrain): { x: number; y: number } {
  const n = terrain.cells;
  let best = { x: n / 2, y: n / 2, score: -1 };
  for (let x = 2; x < n - AVENUE_CELLS - 2; x++) {
    for (let y0 = AVENUE_LENGTH + 2; y0 < n - 2; y0 += 2) {
      let score = 0;
      let open = true;
      for (let y = y0; y > y0 - AVENUE_LENGTH && open; y--) {
        for (let k = 0; k < AVENUE_CELLS; k++) open &&= !terrain.isSolid(x + k, y);
        if (terrain.isBlock(x - 1, y)) score++;
        if (terrain.isBlock(x + AVENUE_CELLS, y)) score++;
      }
      if (open && score > best.score) best = { x, y: y0, score };
    }
  }
  return {
    x: (best.x + AVENUE_CELLS / 2) * terrain.cellSize,
    y: best.y * terrain.cellSize,
  };
}
