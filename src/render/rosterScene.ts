import * as THREE from 'three';
import { CONFIG } from '../config';
import type { HunterKind } from '../sim/hunters';
import { createHunterModel } from './models';
import { PALETTE } from './palette';

/** The attract loop's roll call, weakest first: each Hunter with the points it scores in Wave 1. */
export const ROSTER: readonly { kind: HunterKind; name: string; points: number }[] = (
  ['tank', 'berserker', 'sniper', 'artillery', 'juggernaut'] as const
).map((kind) => ({
  kind,
  name: kind.toUpperCase(),
  points: CONFIG.waves.killScore * CONFIG[kind].scoreMultiplier,
}));

/**
 * Where the roll call sits on screen, as fractions of the viewport, so the HUD can line its labels
 * up with the models: row `i` is centered at `top + i * spacing`.
 */
export const ROSTER_LAYOUT = { top: 0.32, spacing: 0.13, modelX: 0.39 } as const;
/** Seconds between one Hunter's entrance and the next. */
export const ROSTER_STEP = 1.1;
/** Seconds the whole roll call shows, including a hold after the last entrance. */
export const ROSTER_SECONDS = ROSTER_STEP * ROSTER.length + 3.5;

/** Visible height of the orthographic view, in world units. */
const VIEW_HEIGHT = 40;
const POP_TIME = 0.25;
const SPIN = 0.9;
/** Leans each model toward the camera so its top reads. */
const TILT = 0.55;

/** Every Hunter type turning slowly in a column, each popping in on its cue. */
export class RosterScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly rows: { spin: THREE.Group; scale: number }[] = [];
  private time = 0;

  constructor() {
    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x10131c, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.3, 1, 0.6);
    this.scene.add(sun);
    this.camera.position.set(0, 0, 100);

    ROSTER.forEach(({ kind }, i) => {
      const model = createHunterModel(kind);
      // Turn about the model's own middle, and size it by its reach, so tall and flat Hunters both
      // fill their row without spilling into the next.
      const bounds = new THREE.Box3()
        .setFromObject(model.root)
        .getBoundingSphere(new THREE.Sphere());
      model.root.position.sub(bounds.center);
      const spin = new THREE.Group();
      spin.add(model.root);
      const tilt = new THREE.Group();
      tilt.rotation.x = TILT;
      tilt.add(spin);
      tilt.position.y = (0.5 - (ROSTER_LAYOUT.top + i * ROSTER_LAYOUT.spacing)) * VIEW_HEIGHT;
      this.scene.add(tilt);
      // Later rows are a little larger, so the list builds toward the Juggernaut.
      const reach = ROSTER_LAYOUT.spacing * VIEW_HEIGHT * (0.6 + 0.05 * i);
      this.rows.push({ spin, scale: reach / bounds.radius });
    });
    this.setAspect(1);
  }

  setAspect(aspect: number): void {
    const half = VIEW_HEIGHT / 2;
    Object.assign(this.camera, {
      top: half,
      bottom: -half,
      left: -half * aspect,
      right: half * aspect,
    });
    this.camera.updateProjectionMatrix();
    const x = (ROSTER_LAYOUT.modelX - 0.5) * VIEW_HEIGHT * aspect;
    for (const { spin } of this.rows) spin.parent!.position.x = x;
  }

  restart(): void {
    this.time = 0;
  }

  update(frameTime: number): void {
    this.time += frameTime;
    this.rows.forEach(({ spin, scale }, i) => {
      const age = this.time - i * ROSTER_STEP;
      const pop = THREE.MathUtils.clamp(age / POP_TIME, 0, 1);
      // Overshoots a little before settling, like a stamp.
      const s = pop < 1 ? Math.sin(pop * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1;
      spin.visible = age > 0;
      spin.scale.setScalar(scale * Math.max(0.001, s));
      spin.rotation.y = -Math.PI / 2 + Math.max(0, age) * SPIN;
    });
  }
}
