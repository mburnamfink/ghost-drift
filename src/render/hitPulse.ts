import * as THREE from 'three';
import { PALETTE } from './palette';

/** The ring on the ground: how far it spreads, and in how many seconds it is gone. */
const RING = { radius: 13, seconds: 0.45, width: 0.7 };
/** Seconds the grid takes to settle after a hit; far longer than the ring, so it carries on. */
const SETTLE_SECONDS = 1.25;
/** Ages past this draw nothing, so a fresh grid starts quiet. */
const IDLE_AGE = 1e3;

/** Shared with the grid's material, so it lights up from the same hit at the same moment. */
export interface HitUniforms {
  uHitPos: THREE.IUniform<THREE.Vector2>;
  uHitAge: THREE.IUniform<number>;
}

const RING_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A thin ring, white-hot at its leading edge and fading to clear inside, like a Pulse's front. */
const RING_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uOpacity;
  varying vec2 vLocal;
  void main() {
    float behind = uRadius - length(vLocal);
    if (behind < -0.3 || behind > uWidth * 3.0) discard;
    float edge = exp(-behind * behind * 6.0);
    float wake = behind > 0.0 ? exp(-behind / uWidth) : 0.0;
    float glow = clamp(edge + 0.6 * wake, 0.0, 1.0) * uOpacity;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.6 * edge), glow);
  }
`;

/**
 * The grid's lines, lit by a hit. Every line flashes at once; then a circular front races out from
 * the hit along the lines, outrunning the ring by far, like a surge through circuitry.
 */
export const GRID_VERTEX = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec2 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

export const GRID_FRAGMENT = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uPulseColor;
  uniform vec2 uHitPos;
  uniform float uHitAge;
  varying vec2 vWorld;
  void main() {
    float dist = distance(vWorld, uHitPos);
    float front = uHitAge * 130.0;
    float past = front - dist;
    // A sharp leading edge with a short glowing wake behind it.
    float surge = past >= 0.0 ? exp(-past / 7.0) : exp(-past * past * 0.5);
    surge *= exp(-uHitAge * 2.5) * exp(-dist / 120.0);
    float flash = 0.7 * exp(-uHitAge * 6.0);
    float lit = clamp(surge * 2.5 + flash, 0.0, 2.5);
    gl_FragColor = vec4(uColor + uPulseColor * lit, 1.0);
    #include <fog_fragment>
  }
`;

/** A cyan ring thrown out across the ground when the Ship loses Hull, and the grid surging with it. */
export class HitPulse {
  readonly group = new THREE.Group();
  readonly uniforms: HitUniforms = {
    uHitPos: { value: new THREE.Vector2() },
    uHitAge: { value: IDLE_AGE },
  };
  private readonly ringUniforms = {
    uColor: { value: new THREE.Color(PALETTE.ship) },
    uRadius: { value: 0 },
    uWidth: { value: RING.width },
    uOpacity: { value: 0 },
  };
  private readonly ring: THREE.Mesh;

  constructor() {
    const size = (RING.radius + RING.width * 3) * 2;
    this.ring = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        uniforms: this.ringUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  trigger(x: number, y: number): void {
    this.uniforms.uHitPos.value.set(x, y);
    this.uniforms.uHitAge.value = 0;
    // Just above the grid, so the lines don't flicker through it.
    this.ring.position.set(x, 0.06, y);
    this.ring.visible = true;
  }

  update(dt: number): void {
    const age = this.uniforms.uHitAge;
    if (age.value >= SETTLE_SECONDS) {
      age.value = IDLE_AGE;
      return;
    }
    age.value += dt;
    const t = age.value / RING.seconds;
    this.ring.visible = t < 1;
    if (!this.ring.visible) return;
    this.ringUniforms.uRadius.value = RING.radius * (1 - (1 - t) ** 3);
    this.ringUniforms.uOpacity.value = (1 - t) ** 2;
  }

  clear(): void {
    this.uniforms.uHitAge.value = IDLE_AGE;
    this.ring.visible = false;
  }
}
