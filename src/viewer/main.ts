import * as THREE from 'three';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { CONFIG } from '../config';
import type { HunterKind } from '../sim/hunters/types';
import { type HunterModel, MORTAR_MOUNT, createHunterModel } from '../render/models';
import { PALETTE } from '../render/palette';
import { MORTAR_RECOIL, SHIP_HOVER_HEIGHT } from '../render/renderer';
import { ShipModel } from '../render/shipModel';

/**
 * Dev-only page for inspecting the craft models: open /viewer.html under `npm run dev`. Saving a
 * model file reloads the page; the controls and camera are kept in localStorage across reloads.
 *
 * The poses below mirror how GameRenderer drives each model; keep them in step when that changes.
 */

const KINDS: readonly HunterKind[] = ['tank', 'berserker', 'sniper', 'artillery', 'juggernaut'];
type CraftId = 'ship' | HunterKind;
const CRAFT_IDS: readonly CraftId[] = ['ship', ...KINDS];
const LINEUP_SPACING = 12;
const STORAGE_KEY = 'ghost-drift:viewer';

const state = {
  craft: 'all' as 'all' | CraftId,
  turntable: false,
  hitbox: true,
  grid: true,
  wireframe: false,
  shipSpeed: 0.5,
  shipGlow: 1,
  shipBurst: false,
  shipBank: 0,
  aim: 0,
  sweep: false,
  berserkerPhase: 'chase' as 'chase' | 'windup' | 'lunge',
  artilleryReadiness: 1,
  juggernautCharge: 0,
  juggernautArmor: 1,
};
type ViewState = typeof state;

const saved = load();
if (saved?.state) Object.assign(state, saved.state);

const app = document.querySelector<HTMLElement>('#app')!;
const readout = document.querySelector<HTMLElement>('#readout')!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.style.position = 'fixed';
labels.domElement.style.inset = '0';
labels.domElement.style.pointerEvents = 'none';
app.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x10131c, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(0.4, 1, 0.25);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.addEventListener('end', save);

// One grid square is one city cell.
const { cells, cellSize } = CONFIG.arena;
const span = 20 * cellSize;
const grid = new THREE.GridHelper(span, span / cellSize, PALETTE.grid, PALETTE.grid);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(span, span).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: PALETTE.ground }),
);
ground.position.y = -0.01;
const forward = new THREE.ArrowHelper(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0.02, 0),
  cellSize * 2,
  0xffffff,
  0.8,
  0.5,
);
scene.add(ground, grid, forward);

interface Craft {
  id: CraftId;
  holder: THREE.Group;
  model: THREE.Object3D;
  ring: THREE.Mesh;
  label: CSS2DObject;
  pose(dt: number, time: number): void;
}

const ringMaterial = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

function craft(id: CraftId, model: THREE.Object3D, pose: Craft['pose']): Craft {
  const radius = id === 'ship' ? CONFIG.ship.radius : CONFIG[id].radius;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius - 0.04, radius + 0.04, 96).rotateX(-Math.PI / 2),
    ringMaterial,
  );
  ring.position.y = 0.02;
  const div = document.createElement('div');
  div.className = 'craft-label';
  div.textContent = id.toUpperCase();
  const label = new CSS2DObject(div);
  label.position.set(radius + 1.5, 0, 0);
  const holder = new THREE.Group();
  holder.add(model, ring, label);
  scene.add(holder);
  return { id, holder, model, ring, label, pose };
}

const shipModel = new ShipModel();
const crafts: Craft[] = [
  craft('ship', shipModel.root, (dt) => {
    const root = shipModel.root;
    root.position.y = SHIP_HOVER_HEIGHT;
    root.rotation.x = state.shipBank;
    root.scale.set(state.shipBurst ? 1.6 : 1, state.shipBurst ? 0.7 : 1, state.shipBurst ? 0.7 : 1);
    shipModel.update(
      { bursting: state.shipBurst, glow: state.shipGlow, speed: state.shipSpeed },
      dt,
    );
  }),
  ...KINDS.map((kind) => hunterCraft(kind)),
];

let mortarRecoil = 0;
let juggernautFlash = 0;
const fire = {
  'fire mortar': () => (mortarRecoil = MORTAR_RECOIL.seconds),
  'hit juggernaut': () => (juggernautFlash = 0.1),
};

function hunterCraft(kind: HunterKind): Craft {
  const model = createHunterModel(kind);
  const c = craft(kind, model.root, (dt, time) => {
    model.turret.rotation.y = -(state.sweep ? Math.sin(time * 0.8) * Math.PI : state.aim);
    if (kind === 'berserker') poseBerserker(model, time);
    if (kind === 'artillery') poseArtillery(model, dt, time);
    if (kind === 'juggernaut') poseJuggernaut(model, dt, time);
  });
  if (model.healthBar) c.holder.add(model.healthBar.group);
  return c;
}

function poseBerserker(model: HunterModel, time: number): void {
  const phase = state.berserkerPhase;
  const material = model.body.material;
  model.root.position.set(0, 0, 0);
  if (phase === 'windup') {
    material.emissiveIntensity = 0.6 + 0.4 * Math.sin(time * 60);
    model.root.position.x = (Math.random() - 0.5) * 0.3;
    model.root.position.z = (Math.random() - 0.5) * 0.3;
  } else {
    material.emissiveIntensity = phase === 'lunge' ? 1 : 0.25;
  }
  model.root.scale.set(phase === 'lunge' ? 1.4 : 1, 1, phase === 'lunge' ? 0.8 : 1);
}

function poseArtillery(model: HunterModel, dt: number, time: number): void {
  const { mortar, glow } = model;
  if (!mortar || !glow) return;
  mortarRecoil = Math.max(0, mortarRecoil - dt);
  const kick = (MORTAR_RECOIL.distance * mortarRecoil) / MORTAR_RECOIL.seconds;
  mortar.position.set(
    -Math.sin(MORTAR_MOUNT.pitch) * kick,
    MORTAR_MOUNT.y - Math.cos(MORTAR_MOUNT.pitch) * kick,
    0,
  );
  const readiness = state.artilleryReadiness;
  const pulse = readiness >= 1 ? 0.25 * Math.sin(time * 12) : 0;
  glow.scale.setScalar(0.3 + readiness + pulse);
  glow.material.opacity = 0.15 + 0.85 * readiness * readiness;
}

function poseJuggernaut(model: HunterModel, dt: number, time: number): void {
  const charge = state.juggernautCharge;
  for (const muzzle of model.muzzles ?? []) {
    muzzle.visible = charge > 0;
    muzzle.scale.setScalar(0.4 + 1.2 * charge + 0.15 * Math.sin(time * 40));
  }
  juggernautFlash = Math.max(0, juggernautFlash - dt);
  const material = model.body.material;
  material.emissive.setHex(juggernautFlash > 0 ? 0xffffff : PALETTE.hunter);
  material.emissiveIntensity = juggernautFlash > 0 ? 0.8 : 0.25;
  const bar = model.healthBar;
  if (!bar) return;
  bar.group.position.set(0, 7, 0);
  // Face the camera from inside a holder that may be turning.
  bar.group.parent?.getWorldQuaternion(bar.group.quaternion).invert().multiply(camera.quaternion);
  bar.fill.scale.x = Math.max(0.001, state.juggernautArmor);
}

/** The camera looks at the shown craft from ahead, slightly to their left, and above. */
const FRAME_DIRECTION = new THREE.Vector3(1, 0.75, -0.45).normalize();

/** Fits the shown craft to the view. */
function frame(): void {
  const bounds = new THREE.Box3();
  for (const c of crafts) if (c.holder.visible) bounds.expandByObject(c.holder);
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const distance = (sphere.radius * 1.2) / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2));
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(FRAME_DIRECTION, distance);
  save();
}

function layout(): void {
  const shown = crafts.filter((c) => state.craft === 'all' || c.id === state.craft);
  for (const c of crafts) c.holder.visible = shown.includes(c);
  shown.forEach((c, i) => {
    c.holder.position.set(0, 0, ((shown.length - 1) / 2 - i) * LINEUP_SPACING);
  });
  for (const c of crafts) {
    c.label.visible = c.holder.visible;
    c.ring.visible = state.hitbox;
    c.model.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial)
        o.material.wireframe = state.wireframe;
    });
  }
  grid.visible = ground.visible = state.grid;
}

const gui = new GUI({ title: 'Craft viewer' });
const view = gui.addFolder('View');
view.add(state, 'craft', ['all', ...CRAFT_IDS]).onFinishChange(() => {
  layout();
  if (saved?.camera) {
    camera.position.fromArray(saved.camera.position);
    controls.target.fromArray(saved.camera.target);
  } else {
    frame();
  }
  frame();
});
view.add({ frame }, 'frame').name('frame camera');
view.add(state, 'turntable');
view.add(state, 'hitbox').name('hitbox ring');
view.add(state, 'grid').name('grid (1 cell)');
view.add(state, 'wireframe');
const shipFolder = gui.addFolder('Ship');
shipFolder.add(state, 'shipSpeed', 0, 1, 0.01).name('speed');
shipFolder.add(state, 'shipGlow', 0, 1, 0.01).name('glow');
shipFolder.add(state, 'shipBurst').name('burst');
shipFolder.add(state, 'shipBank', -0.7, 0.7, 0.01).name('bank');
const exportFolder = gui.addFolder('Export shown craft');
exportFolder.add({ obj: exportObj }, 'obj').name('OBJ (Blockbench)');
exportFolder.add({ glb: exportGlb }, 'glb').name('glTF .glb');
const hunterFolder = gui.addFolder('Hunters');
hunterFolder.add(state, 'aim', -Math.PI, Math.PI, 0.01).name('turret aim');
hunterFolder.add(state, 'sweep').name('sweep turret');
hunterFolder.add(state, 'berserkerPhase', ['chase', 'windup', 'lunge']).name('berserker');
hunterFolder.add(state, 'artilleryReadiness', 0, 1, 0.01).name('mortar reload');
hunterFolder.add(fire, 'fire mortar');
hunterFolder.add(state, 'juggernautCharge', 0, 1, 0.01).name('spray wind-up');
hunterFolder.add(state, 'juggernautArmor', 0, 1, 0.01).name('juggernaut armor');
hunterFolder.add(fire, 'hit juggernaut');
gui.onChange(() => {
  layout();
  if (saved?.camera) {
    camera.position.fromArray(saved.camera.position);
    controls.target.fromArray(saved.camera.target);
  } else {
    frame();
  }
  save();
});
layout();
if (saved?.camera) {
  camera.position.fromArray(saved.camera.position);
  controls.target.fromArray(saved.camera.target);
} else {
  frame();
}

const size = new THREE.Vector3();
const box = new THREE.Box3();
function describe(c: Craft): string {
  box.setFromObject(c.model).getSize(size);
  const radius = c.id === 'ship' ? CONFIG.ship.radius : CONFIG[c.id].radius;
  const f = (n: number) => n.toFixed(2);
  return [
    c.id.toUpperCase(),
    `length ${f(size.x)}  width ${f(size.z)}  height ${f(size.y)}`,
    `hitbox radius ${f(radius)}  (cell ${cellSize}, arena ${cells} cells)`,
  ].join('\n');
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  shipModel.setResolution(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const timer = new THREE.Timer();
let time = 0;
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.1);
  time += dt;
  for (const c of crafts) {
    if (!c.holder.visible) continue;
    c.pose(dt, time);
    c.holder.rotation.y = state.turntable ? -time * 0.5 : 0;
  }
  const single = crafts.find((c) => c.id === state.craft);
  readout.textContent = single ? describe(single) : 'All craft face +X (arrow). Drag to orbit.';
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

interface Saved {
  state: Partial<ViewState>;
  camera: { position: number[]; target: number[] };
}

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(): void {
  const data: Saved = {
    state,
    camera: { position: camera.position.toArray(), target: controls.target.toArray() },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Private windows can refuse storage; the viewer works without it.
  }
}

/**
 * The shown craft, freshly built so no pose leaks in, in their lineup places. Only the solid
 * surfaces are kept: glows, plumes, traced edges and overlays are drawn by shaders that don't
 * survive export.
 */
function exportable(): THREE.Group {
  const group = new THREE.Group();
  for (const c of crafts) {
    if (!c.holder.visible) continue;
    const model = freshModel(c.id);
    model.name = c.id;
    model.position.copy(c.holder.position);
    group.add(model);
  }
  const drop: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.type === 'Group') return;
    const solid = o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial;
    if (!solid) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  return group;
}

/** Part names are what a model loaded back into the game would be wired up by. */
function freshModel(id: CraftId): THREE.Object3D {
  if (id === 'ship') {
    const root = new ShipModel().root;
    const hull = root.children.find(
      (o) => o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial,
    );
    if (hull) hull.name = 'hull';
    return root;
  }
  const model = createHunterModel(id);
  model.body.name = 'body';
  model.turret.name = 'turret';
  model.turret.children.forEach((part, i) => (part.name ||= `turret-part-${i}`));
  if (model.mortar) model.mortar.name = 'mortar';
  return model.root;
}

function exportName(): string {
  return state.craft === 'all' ? 'craft-lineup' : state.craft;
}

function exportObj(): void {
  download(new OBJExporter().parse(exportable()), `${exportName()}.obj`, 'text/plain');
}

async function exportGlb(): Promise<void> {
  const glb = await new GLTFExporter().parseAsync(exportable(), { binary: true });
  download(glb as ArrayBuffer, `${exportName()}.glb`, 'model/gltf-binary');
}

function download(data: string | ArrayBuffer, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
