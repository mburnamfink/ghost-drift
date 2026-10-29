import * as THREE from 'three';
import type { TerrainChange } from '../sim/city';
import type { Block, Terrain } from '../sim/terrain';
import { CONFIG } from '../config';
import { buildingGeometry } from './buildingShapes';
import { PALETTE } from './palette';

const WALL_HEIGHT = 14;
const WALL_THICKNESS = 2;
/** Opacity of a ghosted face; low enough to see the Ship through, high enough to read the shape. */
const GHOST_FACE_OPACITY = 0.1;
/** Per-second rate at which faces fade out and back in. */
const FADE_RATE = 10;
/** Sideways offsets of the sight lines to the Ship, so a Block that hides only part of it still ghosts. */
const SIGHT_OFFSETS = [0, -1.6, 1.6];
/** Seconds a Block takes to slide fully up out of, or down into, the floor. */
const MOVE_SECONDS = 0.7;
/** Pulses per second of the outlines warning of a coming Rise or Sink. */
const TELEGRAPH_PULSE = 2.5;

interface Occluder {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** 0 = solid, 1 = fully ghosted. */
  ghost: number;
  height: number;
  /** 0 = fully sunk, 1 = fully risen. */
  raised: number;
  /** Direction of travel: 1 rising, -1 sinking, 0 still. */
  moving: number;
  /** True if the geometry belongs to this occluder alone and must be disposed with it. */
  ownsGeometry: boolean;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
const unitEdges = new THREE.EdgesGeometry(unitBox);

/**
 * Static Arena scenery: ground, grid, Blocks and wall. Any Block or wall section between the
 * camera and the Ship fades to a wireframe so the Ship is never hidden.
 */
export class TerrainView {
  readonly group = new THREE.Group();
  private readonly occluders: Occluder[] = [];
  private readonly blocks = new Map<number, Occluder>();
  private readonly telegraphs = new THREE.Group();
  private telegraphFor: TerrainChange | null = null;
  private time = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hit = new Set<THREE.Object3D>();

  private readonly cellSize: number;
  private readonly maxHeight: number;

  /** @param varied Draw Blocks in assorted shapes instead of plain boxes. */
  constructor(
    terrain: Terrain,
    private readonly varied = true,
  ) {
    const size = terrain.worldSize;
    const half = size / 2;
    this.cellSize = terrain.cellSize;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
    );
    ground.position.set(half, 0, half);
    const grid = new THREE.GridHelper(size, terrain.cells, PALETTE.grid, PALETTE.grid);
    grid.position.set(half, 0.02, half);
    this.group.add(ground, grid);

    this.maxHeight = CONFIG.city.maxBlockHeight;
    for (const b of terrain.blocks) this.addBlock(b, 1);

    const wall = new THREE.Color(PALETTE.wall);
    const t = WALL_THICKNESS;
    this.addOccluder(half, -t / 2, size + t * 2, WALL_HEIGHT, t, wall, true);
    this.addOccluder(half, size + t / 2, size + t * 2, WALL_HEIGHT, t, wall, true);
    this.addOccluder(-t / 2, half, t, WALL_HEIGHT, size, wall, true);
    this.addOccluder(size + t / 2, half, t, WALL_HEIGHT, size, wall, true);
    this.group.add(this.telegraphs);
  }

  /** Starts the slide for Blocks that just Rose or Sank in the simulation. */
  applyChange(change: TerrainChange): void {
    for (const p of change.sink) {
      const o = this.blocks.get(p.id);
      if (o) o.moving = -1;
    }
    for (const p of change.rise) {
      const existing = this.blocks.get(p.id);
      if (existing) existing.moving = 1;
      else this.addBlock(p, 0).moving = 1;
    }
  }

  /** Advances slides and the warning outlines for `pending`, the change announced for the next Wave. */
  update(pending: TerrainChange | null, frameTime: number): void {
    this.time += frameTime;
    const step = frameTime / MOVE_SECONDS;
    for (const [id, o] of this.blocks) {
      if (o.moving === 0) continue;
      o.raised = Math.min(1, Math.max(0, o.raised + o.moving * step));
      o.mesh.position.y = o.edges.position.y = (o.raised - 1) * o.height;
      if (o.raised === 1) o.moving = 0;
      if (o.raised === 0 && o.moving < 0) this.removeBlock(id);
    }

    if (pending !== this.telegraphFor) this.buildTelegraphs(pending);
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * TELEGRAPH_PULSE * Math.PI * 2));
    this.telegraphs.traverse((obj) => {
      if (obj instanceof THREE.LineSegments) obj.material.opacity = pulse;
    });
  }

  private buildTelegraphs(pending: TerrainChange | null): void {
    this.telegraphFor = pending;
    for (const child of [...this.telegraphs.children]) {
      this.telegraphs.remove(child);
      if (child instanceof THREE.LineSegments) child.material.dispose();
    }
    if (!pending) return;
    // Rising Plots get a floor outline; Sinking Blocks get a full outline so they read as going away.
    for (const p of pending.rise) this.telegraphs.add(this.outline(p, 0.15, PALETTE.riseWarning));
    for (const p of pending.sink)
      this.telegraphs.add(this.outline(p, p.height, PALETTE.sinkWarning));
  }

  private outline(b: Block, height: number, color: number): THREE.LineSegments {
    const cell = this.cellSize;
    const lines = new THREE.LineSegments(
      unitEdges,
      new THREE.LineBasicMaterial({ color, transparent: true, depthWrite: false }),
    );
    lines.position.set((b.x + b.w / 2) * cell, 0.02, (b.y + b.h / 2) * cell);
    lines.scale.set(b.w * cell, height, b.h * cell);
    return lines;
  }

  private addBlock(b: Block, raised: number): Occluder {
    const cell = this.cellSize;
    const low = new THREE.Color(PALETTE.blockLow);
    const high = new THREE.Color(PALETTE.blockHigh);
    const color =
      'kind' in b && b.kind === 'edge'
        ? new THREE.Color(PALETTE.edge).multiplyScalar(
            0.8 + 0.4 * Math.min(1, b.height / CONFIG.city.edgeHeight[1]),
          )
        : new THREE.Color().lerpColors(low, high, Math.min(1, b.height / this.maxHeight));
    // A small inset keeps neighbouring faces from z-fighting with the grid lines.
    const w = b.w * cell - 0.1;
    const d = b.h * cell - 0.1;
    const o = this.addOccluder(
      (b.x + b.w / 2) * cell,
      (b.y + b.h / 2) * cell,
      w,
      b.height,
      d,
      color,
      false,
      buildingGeometry(w, b.height, d, b.id * 7919 + 13, this.varied),
    );
    o.raised = raised;
    o.mesh.position.y = o.edges.position.y = (raised - 1) * b.height;
    this.blocks.set(b.id, o);
    return o;
  }

  private removeBlock(id: number): void {
    const o = this.blocks.get(id);
    if (!o) return;
    this.blocks.delete(id);
    this.occluders.splice(this.occluders.indexOf(o), 1);
    this.group.remove(o.mesh, o.edges);
    if (o.ownsGeometry) {
      o.mesh.geometry.dispose();
      o.edges.geometry.dispose();
    }
    o.mesh.material.dispose();
    o.edges.material.dispose();
  }

  /** Ghosts whatever stands between `eye` and `target`; call once per frame after moving the camera. */
  updateOcclusion(eye: THREE.Vector3, target: THREE.Vector3, frameTime: number): void {
    this.hit.clear();
    const toTarget = new THREE.Vector3().subVectors(target, eye);
    const side = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize();
    const meshes = this.occluders.map((o) => o.mesh);
    for (const offset of SIGHT_OFFSETS) {
      const aim = target.clone().addScaledVector(side, offset);
      const dir = aim.sub(eye);
      const far = dir.length();
      this.raycaster.set(eye, dir.normalize());
      this.raycaster.far = far;
      for (const h of this.raycaster.intersectObjects(meshes, false)) this.hit.add(h.object);
    }

    const step = Math.min(1, FADE_RATE * frameTime);
    for (const o of this.occluders) {
      const goal = this.hit.has(o.mesh) ? 1 : 0;
      if (o.ghost === goal) continue;
      o.ghost += Math.sign(goal - o.ghost) * Math.min(step, Math.abs(goal - o.ghost));
      o.mesh.material.opacity = 1 - (1 - GHOST_FACE_OPACITY) * o.ghost;
      o.mesh.material.depthWrite = o.ghost < 0.5;
      o.edges.material.opacity = o.ghost;
      o.edges.visible = o.ghost > 0;
    }
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        if (obj.geometry !== unitBox && obj.geometry !== unitEdges) obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }

  private addOccluder(
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: THREE.Color,
    emissive = false,
    /** Full-size geometry; if omitted, a unit box is scaled to w × h × d. */
    geometry?: THREE.BufferGeometry,
  ): Occluder {
    const material = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.9,
      // Always transparent so ghosting only changes opacity, never the render pass.
      transparent: true,
      ...(emissive ? { emissive: color, emissiveIntensity: 0.6 } : {}),
    });
    const mesh = new THREE.Mesh(geometry ?? unitBox, material);
    const edges = new THREE.LineSegments(
      geometry ? new THREE.EdgesGeometry(geometry) : unitEdges,
      new THREE.LineBasicMaterial({ color: PALETTE.ghostEdge, transparent: true, opacity: 0 }),
    );
    edges.visible = false;
    for (const obj of [mesh, edges]) {
      obj.position.set(x, 0, z);
      if (!geometry) obj.scale.set(w, h, d);
    }
    this.group.add(mesh, edges);
    const occluder = {
      mesh,
      edges,
      ghost: 0,
      height: h,
      raised: 1,
      moving: 0,
      ownsGeometry: geometry !== undefined,
    };
    this.occluders.push(occluder);
    return occluder;
  }
}
