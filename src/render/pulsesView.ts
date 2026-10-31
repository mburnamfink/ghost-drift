import * as THREE from 'three';
import { CONFIG } from '../config';
import { type Pulse, pulseGrowth, pulseLifetime, pulseReachAt } from '../sim/weapons';
import { PALETTE } from './palette';

const HEIGHT = 0.8;

const VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Mesh units per unit of the Pulse's reach, past the front so its glow can fall off. */
const MARGIN = 1.06;

/**
 * A bright, rippling front along the U that fades to clear behind it. The mesh is scaled so dead
 * ahead is 1; radii here are fractions of the U's reach at each angle, matching `pulseReachAt`.
 */
const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uArmAngle;
  uniform float uSide;
  uniform float uBack;
  varying vec2 vLocal;
  void main() {
    float a = atan(-vLocal.y, vLocal.x);
    float along = cos(a) >= 0.0 ? 1.0 : uBack;
    float reach = along * uSide / length(vec2(uSide * cos(a), along * sin(a)));
    float r = length(vLocal) / reach;
    float ripple = 0.5 * sin(a * 13.0 - uTime * 38.0) + 0.3 * sin(a * 29.0 + uTime * 61.0)
      + 0.2 * sin(a * 7.0 + uTime * 23.0);
    float front = 0.97 + 0.04 * ripple;
    float behind = front - r;
    float glow = behind >= 0.0 ? exp(-behind * 22.0) : exp(behind * 70.0);
    float wake = 0.35 * (1.0 - smoothstep(0.0, 0.55, behind)) * step(0.0, behind);
    float edges = 1.0 - smoothstep(uArmAngle - 0.5, uArmAngle, abs(a));
    float alpha = (glow + wake) * edges * uOpacity;
    vec3 color = mix(uColor, vec3(1.0), clamp(glow * 0.8, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;

/** A flat fan out past the U's front, in the ground plane, with the nose along +x. */
function uGeometry(): THREE.BufferGeometry {
  const { range, armAngle } = CONFIG.shotgun;
  const segments = 96;
  const positions = [0, 0, 0];
  for (let i = 0; i <= segments; i++) {
    const a = -armAngle + (2 * armAngle * i) / segments;
    const r = (MARGIN * pulseReachAt(a)) / range;
    positions.push(Math.cos(a) * r, 0, -Math.sin(a) * r);
  }
  const index: number[] = [];
  for (let i = 1; i <= segments; i++) index.push(0, i, i + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

/** Draws each Shotgun Pulse as a flat U with a glowing, wavy leading edge. */
export class PulsesView {
  readonly group = new THREE.Group();
  private readonly pool: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private readonly geometry = uGeometry();

  update(pulses: readonly Pulse[]): void {
    while (this.pool.length < pulses.length) {
      const mesh = new THREE.Mesh(
        this.geometry,
        new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: FRAGMENT,
          uniforms: {
            uColor: { value: new THREE.Color(PALETTE.bolt) },
            uOpacity: { value: 1 },
            uTime: { value: 0 },
            uArmAngle: { value: CONFIG.shotgun.armAngle },
            uSide: { value: CONFIG.shotgun.sideRange / CONFIG.shotgun.range },
            uBack: { value: CONFIG.shotgun.backRange / CONFIG.shotgun.range },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      this.pool.push(mesh);
      this.group.add(mesh);
    }
    this.pool.forEach((mesh, i) => {
      const p = pulses[i];
      mesh.visible = p !== undefined;
      if (!p) return;
      mesh.position.set(p.origin.x, HEIGHT, p.origin.y);
      mesh.rotation.y = -p.heading;
      mesh.scale.setScalar(Math.max(0.5, pulseGrowth(p) * CONFIG.shotgun.range));
      const u = mesh.material.uniforms;
      u.uTime!.value = p.age;
      u.uOpacity!.value = 1 - (p.age / pulseLifetime()) ** 2;
    });
  }
}
