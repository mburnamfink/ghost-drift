import * as THREE from 'three';
import type { Terrain } from '../sim/terrain';
import { PALETTE } from './palette';

const WALL_HEIGHT = 14;
const WALL_THICKNESS = 2;
/** Opacity of a ghosted face; low enough to see the Ship through, high enough to read the shape. */
const GHOST_FACE_OPACITY = 0.1;
/** Per-second rate at which faces fade out and back in. */
const FADE_RATE = 10;
/** Sideways offsets of the sight lines to the Ship, so a Block that hides only part of it still ghosts. */
const SIGHT_OFFSETS = [0, -1.6, 1.6];

interface Occluder {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  edges: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  /** 0 = solid, 1 = fully ghosted. */
  ghost: number;
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
  private readonly occluderMeshes: THREE.Mesh[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly hit = new Set<THREE.Object3D>();

  constructor(terrain: Terrain) {
    const size = terrain.worldSize;
    const half = size / 2;
    const cell = terrain.cellSize;

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
    );
    ground.position.set(half, 0, half);
    const grid = new THREE.GridHelper(size, terrain.cells, PALETTE.grid, PALETTE.grid);
    grid.position.set(half, 0.02, half);
    this.group.add(ground, grid);

    const low = new THREE.Color(PALETTE.blockLow);
    const high = new THREE.Color(PALETTE.blockHigh);
    const maxHeight = Math.max(1, ...terrain.blocks.map((b) => b.height));
    for (const b of terrain.blocks) {
      const color = new THREE.Color().lerpColors(low, high, b.height / maxHeight);
      // A small inset keeps neighbouring faces from z-fighting with the grid lines.
      this.addOccluder(
        (b.x + b.w / 2) * cell,
        (b.y + b.h / 2) * cell,
        b.w * cell - 0.1,
        b.height,
        b.h * cell - 0.1,
        color,
      );
    }

    const wall = new THREE.Color(PALETTE.wall);
    const t = WALL_THICKNESS;
    this.addOccluder(half, -t / 2, size + t * 2, WALL_HEIGHT, t, wall, true);
    this.addOccluder(half, size + t / 2, size + t * 2, WALL_HEIGHT, t, wall, true);
    this.addOccluder(-t / 2, half, t, WALL_HEIGHT, size, wall, true);
    this.addOccluder(size + t / 2, half, t, WALL_HEIGHT, size, wall, true);
  }

  /** Ghosts whatever stands between `eye` and `target`; call once per frame after moving the camera. */
  updateOcclusion(eye: THREE.Vector3, target: THREE.Vector3, frameTime: number): void {
    this.hit.clear();
    const toTarget = new THREE.Vector3().subVectors(target, eye);
    const side = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize();
    for (const offset of SIGHT_OFFSETS) {
      const aim = target.clone().addScaledVector(side, offset);
      const dir = aim.sub(eye);
      const far = dir.length();
      this.raycaster.set(eye, dir.normalize());
      this.raycaster.far = far;
      for (const h of this.raycaster.intersectObjects(this.occluderMeshes, false))
        this.hit.add(h.object);
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
  ): void {
    const material = new THREE.MeshStandardMaterial({
      color,
      flatShading: true,
      roughness: 0.9,
      // Always transparent so ghosting only changes opacity, never the render pass.
      transparent: true,
      ...(emissive ? { emissive: color, emissiveIntensity: 0.6 } : {}),
    });
    const mesh = new THREE.Mesh(unitBox, material);
    const edges = new THREE.LineSegments(
      unitEdges,
      new THREE.LineBasicMaterial({ color: PALETTE.ghostEdge, transparent: true, opacity: 0 }),
    );
    edges.visible = false;
    for (const obj of [mesh, edges]) {
      obj.position.set(x, 0, z);
      obj.scale.set(w, h, d);
    }
    this.group.add(mesh, edges);
    this.occluders.push({ mesh, edges, ghost: 0 });
    this.occluderMeshes.push(mesh);
  }
}
