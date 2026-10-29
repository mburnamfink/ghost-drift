import { CONFIG, SHIP_TOP_SPEED } from '../config';
import type { ScreenThreat } from '../render/renderer';
import { speedOf } from '../sim/ship';
import { tankSpeed } from '../sim/waves';
import type { SimEvent, World } from '../sim/world';

export type Screen =
  | { kind: 'none' }
  | { kind: 'title'; pad: string | null }
  | { kind: 'paused'; pad: string | null }
  | { kind: 'over'; pad: string | null; score: number; wave: number; best: number };

const BANNER_SECONDS = 2;
/** A Sniper whose aim point is this close to the Ship counts as targeting it. */
const TARGETED_DISTANCE = 10;

/** DOM overlay: always-on readouts plus title, pause and game-over screens. */
export class Hud {
  private readonly root: HTMLElement;
  private readonly score: HTMLElement;
  private readonly wave: HTMLElement;
  private readonly hull: HTMLElement;
  private readonly charges: HTMLElement;
  private readonly speedFill: HTMLElement;
  private readonly speedMarker: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly threats: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly locked: HTMLElement;
  private bannerTime = 0;
  private lastScreen = '';

  constructor(container: HTMLElement) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-top-left"><div class="hud-score"></div><div class="hud-wave"></div></div>
      <div class="hud-top-right">
        <div class="hud-row"><span class="hud-label">HULL</span><span class="hud-hull"></span></div>
        <div class="hud-row"><span class="hud-label">BURST</span><span class="hud-charges"></span></div>
      </div>
      <div class="hud-speed"><div class="hud-speed-fill"></div><div class="hud-speed-marker"></div><span class="hud-label">SPEED</span></div>
      <div class="hud-banner"></div>
      <div class="hud-vignette"></div>
      <div class="hud-locked">◢ LOCKED ◣</div>
      <div class="hud-threats"></div>
      <div class="hud-screen"></div>`;
    container.appendChild(this.root);
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.score = q('.hud-score');
    this.wave = q('.hud-wave');
    this.hull = q('.hud-hull');
    this.charges = q('.hud-charges');
    this.speedFill = q('.hud-speed-fill');
    this.speedMarker = q('.hud-speed-marker');
    this.banner = q('.hud-banner');
    this.screen = q('.hud-screen');
    this.threats = q('.hud-threats');
    this.vignette = q('.hud-vignette');
    this.locked = q('.hud-locked');
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'waveStarted') this.showBanner(`WAVE ${e.wave}`);
      if (e.type === 'waveCleared') this.showBanner('WAVE CLEARED · BURST RECHARGED');
    }
  }

  update(world: World, screen: Screen, frameTime: number, threats: readonly ScreenThreat[]): void {
    this.updateThreats(screen.kind === 'none' ? threats : []);
    this.updateTargeting(world, screen.kind === 'none');
    const { ship } = world;
    this.score.textContent = world.score.toString().padStart(6, '0');
    this.wave.textContent = world.wave > 0 ? `WAVE ${world.wave}` : '';
    this.hull.textContent = pips(ship.hull, CONFIG.ship.hull, '■', '□');
    this.charges.textContent = pips(ship.charges, CONFIG.ship.burstCharges, '◆', '◇');

    const speed = Math.min(1, speedOf(ship) / SHIP_TOP_SPEED);
    const danger = tankSpeed(Math.max(1, world.wave)) / SHIP_TOP_SPEED;
    this.speedFill.style.width = `${speed * 100}%`;
    this.speedFill.classList.toggle('danger', speed < danger);
    this.speedMarker.style.left = `${danger * 100}%`;

    this.bannerTime = Math.max(0, this.bannerTime - frameTime);
    this.banner.style.opacity =
      this.bannerTime > 0 ? String(Math.min(1, this.bannerTime * 2)) : '0';

    const key = JSON.stringify(screen);
    if (key !== this.lastScreen) {
      this.lastScreen = key;
      this.screen.innerHTML = renderScreen(screen);
      this.screen.style.display = screen.kind === 'none' ? 'none' : 'flex';
    }
  }

  /**
   * A red vignette that deepens as a Sniper aimed at the Ship charges, and a LOCKED warning once
   * one locks. A Sniper counts as aimed at the Ship while its aim point is near it.
   */
  private updateTargeting(world: World, playing: boolean): void {
    let level = 0;
    let locked = false;
    for (const h of world.hunters) {
      if (h.kind !== 'sniper' || !h.charge) continue;
      const t = h.charge.target;
      if (Math.hypot(t.x - world.ship.pos.x, t.y - world.ship.pos.y) > TARGETED_DISTANCE) continue;
      locked ||= h.charge.locked;
      level = Math.max(level, h.charge.locked ? 1 : h.charge.time / CONFIG.sniper.chargeTime);
    }
    if (!playing) level = 0;
    this.vignette.style.opacity = String(level);
    this.locked.style.display = playing && locked ? 'block' : 'none';
  }

  /** Arrows pinned to the screen edge, pointing toward threats outside the view. */
  private updateThreats(threats: readonly ScreenThreat[]): void {
    while (this.threats.children.length < threats.length)
      this.threats.appendChild(el('div', 'hud-threat'));
    Array.from(this.threats.children).forEach((node, i) => {
      const marker = node as HTMLElement;
      const t = threats[i];
      marker.style.display = t ? 'block' : 'none';
      if (!t) return;
      const cos = Math.cos(t.angle);
      const sin = Math.sin(t.angle);
      // Scale the direction out to whichever screen edge it reaches first.
      const reach = Math.min(
        0.46 / Math.max(Math.abs(cos), 1e-6),
        0.42 / Math.max(Math.abs(sin), 1e-6),
      );
      marker.style.left = `${50 + cos * reach * 100}%`;
      marker.style.top = `${50 - sin * reach * 100}%`;
      marker.style.transform = `translate(-50%, -50%) rotate(${-t.angle}rad)`;
      marker.className = `hud-threat ${t.kind}`;
    });
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.bannerTime = BANNER_SECONDS;
  }
}

function renderScreen(screen: Screen): string {
  if (screen.kind === 'none') return '';
  const gamepad = screen.pad !== null;
  const confirm = gamepad ? 'A' : 'ENTER';
  const device = gamepad
    ? `Controller: ${escapeHtml(screen.pad ?? '')}`
    : 'Keyboard · press any controller button to use a gamepad';
  switch (screen.kind) {
    case 'title':
      return `
        <h1>QUANTUM BREACH</h1>
        <p class="tagline">Speed is armor. Stop and they box you in.</p>
        <p class="prompt">Press ${confirm} to start</p>
        ${controlsTable(gamepad)}
        <p class="device">${device}</p>`;
    case 'paused':
      return `<h1>PAUSED</h1><p class="prompt">Press ${gamepad ? 'MENU' : 'ESC'} to resume</p>${controlsTable(gamepad)}`;
    case 'over':
      return `
        <h1>DESTROYED</h1>
        <p class="stat">Score ${screen.score} · Wave ${screen.wave}</p>
        <p class="stat">Best ${screen.best}</p>
        <p class="prompt">Press ${confirm} to retry</p>`;
  }
}

function controlsTable(gamepad: boolean): string {
  const rows = gamepad
    ? [
        ['Steer', 'Left stick'],
        ['Thrust', 'RT'],
        ['Powerslide', 'LT'],
        ['Fire', 'RB / X'],
        ['Burst', 'A / LB'],
        ['Pause', 'Menu'],
      ]
    : [
        ['Steer', 'A D / ← →'],
        ['Thrust', 'W / ↑'],
        ['Powerslide', 'Shift'],
        ['Fire', 'Space'],
        ['Burst', 'E'],
        ['Pause', 'Esc'],
      ];
  return `<table class="controls">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
}

const pips = (n: number, max: number, on: string, off: string) =>
  on.repeat(Math.max(0, n)) + off.repeat(Math.max(0, max - n));

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
