import type { HunterKind } from '../sim/hunters';
import type { Plot } from '../sim/city';
import type { World } from '../sim/world';
import { partsOf } from '../sim/terrain';
import { PALETTE } from '../render/palette';

/** Diameter on screen, in CSS pixels. */
const SIZE = 170;
/** World units from the Ship to the rim. */
const RANGE = 120;
const DOT = 3.5;

const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

const HUNTER_COLORS: Record<HunterKind, string> = {
  tank: css(PALETTE.hunter),
  berserker: css(PALETTE.berserkerBlur),
  sniper: css(PALETTE.laser),
  artillery: css(PALETTE.shell),
  juggernaut: css(PALETTE.tankShell),
};

/**
 * A heading-up radar: up is the way the camera faces, so a blip to the right means turn right.
 * Hunters beyond range sit on the rim in their direction.
 */
export class Minimap {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  /** The city drawn at one pixel per cell, redrawn only when Blocks Rise or Sink. */
  private readonly city = document.createElement('canvas');
  private cityVersion = -1;
  private cityTerrain: World['terrain'] | null = null;

  constructor(container: HTMLElement) {
    this.canvas.className = 'minimap';
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.height = Math.round(SIZE * dpr);
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);
  }

  update(world: World, viewYaw: number, visible: boolean): void {
    this.canvas.style.display = visible ? '' : 'none';
    if (!visible) return;
    this.drawCity(world);

    const ctx = this.ctx;
    const px = this.canvas.width;
    const half = px / 2;
    const scale = half / RANGE;
    const fx = Math.cos(viewYaw);
    const fy = Math.sin(viewYaw);
    const { x: sx, y: sy } = world.ship.pos;
    // World to screen: right of the view is screen +x, ahead is screen -y.
    const toScreen = (x: number, y: number) => {
      const dx = x - sx;
      const dy = y - sy;
      return { x: half + scale * (-fy * dx + fx * dy), y: half - scale * (fx * dx + fy * dy) };
    };

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 1, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(5, 10, 20, 0.75)';
    ctx.fillRect(0, 0, px, px);

    const a = -scale * fy;
    const b = -scale * fx;
    const c = scale * fx;
    const d = -scale * fy;
    ctx.setTransform(a, b, c, d, half - (a * sx + c * sy), half - (b * sx + d * sy));
    ctx.imageSmoothingEnabled = false;
    const size = world.terrain.worldSize;
    ctx.drawImage(this.city, 0, 0, size, size);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const dpr = px / SIZE;
    for (const h of world.hunters) {
      let p = toScreen(h.pos.x, h.pos.y);
      const off = Math.hypot(p.x - half, p.y - half);
      const rim = half - DOT * dpr - 1;
      if (off > rim)
        p = { x: half + ((p.x - half) * rim) / off, y: half + ((p.y - half) * rim) / off };
      ctx.fillStyle = HUNTER_COLORS[h.kind];
      ctx.beginPath();
      ctx.arc(p.x, p.y, DOT * dpr * (h.kind === 'juggernaut' ? 1.8 : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = css(PALETTE.ship);
    ctx.beginPath();
    ctx.moveTo(half, half - 7 * dpr);
    ctx.lineTo(half + 5 * dpr, half + 5 * dpr);
    ctx.lineTo(half - 5 * dpr, half + 5 * dpr);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(216, 246, 255, 0.5)';
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(half, half, half - dpr, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawCity(world: World): void {
    const t = world.terrain;
    if (t === this.cityTerrain && t.version === this.cityVersion) return;
    this.cityTerrain = t;
    this.cityVersion = t.version;
    this.city.width = this.city.height = t.cells;
    const ctx = this.city.getContext('2d')!;
    ctx.fillStyle = css(PALETTE.edge);
    ctx.fillRect(0, 0, t.cells, t.cells);
    ctx.clearRect(1, 1, t.cells - 2, t.cells - 2);
    for (const b of t.blocks) {
      ctx.fillStyle = (b as Partial<Plot>).kind === 'edge' ? css(PALETTE.edge) : '#4a6a96';
      for (const r of partsOf(b)) ctx.fillRect(r.x, r.y, r.w, r.h);
    }
  }
}
