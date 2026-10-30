import { CONFIG, SHIP_TOP_SPEED } from '../config';
import type { ScreenThreat } from '../render/renderer';
import { speedOf } from '../sim/ship';
import { tankSpeed } from '../sim/waves';
import { type KillCredit, multiplierValue } from '../sim/multiplier';
import type { SimEvent, World } from '../sim/world';
import { LEGENDS, LEGEND_SECONDS, PREMISE, legendRank } from './copy';
import { headingSvg, initialsSvg, splashSvg } from './splash';
import { ROSTER, ROSTER_LAYOUT, ROSTER_STEP } from '../render/rosterScene';
import type { ScoreEntry } from '../scores/highScores';
import type { MenuView } from './menu';

/** Shown when only a few Hunters are left in a live Wave. */
export interface LastEnemies {
  count: number;
  /** Direction to the nearest, from the Ship as the camera sees it: 0 = right, π/2 = ahead. */
  bearing: number;
}

export type Screen =
  | { kind: 'none' }
  | {
      kind: 'title';
      pad: string | null;
      scores: readonly ScoreEntry[];
      menu: MenuView;
      /** The attract loop is showing the high-score table instead of the menu. */
      attract: boolean;
    }
  /** The attract loop's roll call of Hunters, drawn by the renderer; the HUD adds the labels. */
  | { kind: 'roster' }
  | { kind: 'paused'; pad: string | null }
  | {
      kind: 'over';
      pad: string | null;
      score: number;
      wave: number;
      message: string;
      /** False for custom games, which never enter the high-score table. */
      ranked: boolean;
      scores: readonly ScoreEntry[];
      /** Row of the table to highlight: where this Run just landed. */
      highlight: number | null;
      /** Initials being entered, while the Run waits to join the table. */
      entry: { letters: string[]; cursor: number; rank: number } | null;
    };

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
  private readonly weapon: HTMLElement;
  private readonly speedFill: HTMLElement;
  private readonly speedMarker: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly threats: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly multiplier: HTMLElement;
  private readonly multiplierValue: HTMLElement;
  private readonly multiplierFill: HTMLElement;
  private readonly callouts: HTMLElement;
  private readonly remaining: HTMLElement;
  private readonly remainingArrow: HTMLElement;
  private shownMultiplier = 1;
  private readonly locked: HTMLElement;
  private bannerTime = 0;
  private lastScreen = '';
  private readonly demoBadge: HTMLElement;
  private titleTime = 0;
  /** Which legend the title opens on, so repeat visits don't always start the same. */
  private readonly legendStart = Math.floor(Math.random() * LEGENDS.length);

  constructor(container: HTMLElement) {
    this.root = el('div', 'hud');
    this.root.innerHTML = `
      <div class="hud-top-left"><div class="hud-score"></div><div class="hud-wave"></div></div>
      <div class="hud-top-right">
        <div class="hud-row"><span class="hud-label">HULL</span><span class="hud-hull"></span></div>
        <div class="hud-row"><span class="hud-label">BURST</span><span class="hud-charges"></span></div>
        <div class="hud-row"><span class="hud-label">GUN</span><span class="hud-weapon"></span></div>
      </div>
      <div class="hud-speed"><div class="hud-speed-fill"></div><div class="hud-speed-marker"></div><span class="hud-label">SPEED</span></div>
      <div class="hud-banner"></div>
      <div class="hud-vignette"></div>
      <div class="hud-callouts"></div>
      <div class="hud-multiplier"><div class="hud-multiplier-value"></div><div class="hud-multiplier-clock"><div class="hud-multiplier-fill"></div></div></div>
      <div class="hud-remaining"></div>
      <div class="hud-remaining-arrow">
        <svg viewBox="0 0 40 56"><polygon points="20,0 40,24 27,24 27,56 13,56 13,24 0,24" fill="#ff4a1c"/></svg>
      </div>
      <div class="hud-locked">◢ LOCKED ◣</div>
      <div class="hud-threats"></div>
      <div class="hud-screen"></div>`;
    container.appendChild(this.root);
    const q = (s: string) => this.root.querySelector<HTMLElement>(s)!;
    this.score = q('.hud-score');
    this.wave = q('.hud-wave');
    this.hull = q('.hud-hull');
    this.charges = q('.hud-charges');
    this.weapon = q('.hud-weapon');
    this.speedFill = q('.hud-speed-fill');
    this.speedMarker = q('.hud-speed-marker');
    this.banner = q('.hud-banner');
    this.screen = q('.hud-screen');
    this.threats = q('.hud-threats');
    this.vignette = q('.hud-vignette');
    this.multiplier = q('.hud-multiplier');
    this.multiplierValue = q('.hud-multiplier-value');
    this.multiplierFill = q('.hud-multiplier-fill');
    this.callouts = q('.hud-callouts');
    this.remaining = q('.hud-remaining');
    this.remainingArrow = q('.hud-remaining-arrow');
    this.locked = q('.hud-locked');
    this.demoBadge = this.root.appendChild(el('div', 'hud-demo'));
    this.demoBadge.textContent = 'UNCONFIRMED FOOTAGE';
    this.setDemoBadge(false);
  }

  /** Marks the screen as the game playing itself. */
  /** Marks the screen as the game playing itself. */
  setDemoBadge(on: boolean): void {
    this.demoBadge.style.display = on ? '' : 'none';
  }

  handleEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'waveStarted') {
        this.showBanner(
          e.juggernauts > 0
            ? `WAVE ${e.wave} · HEAVY METAL INBOUND`
            : e.wave === 1
              ? 'WAVE 1 · HOLD ARCADIA'
              : `WAVE ${e.wave} · THEY'RE STILL COMING`,
        );
      }
      if (e.type === 'waveCleared') this.showBanner('WAVE CLEARED · BURST RECHARGED');
      if (e.type === 'hunterDestroyed') this.showCallout(e.credit);
    }
  }

  update(
    world: World,
    screen: Screen,
    frameTime: number,
    threats: readonly ScreenThreat[],
    lastEnemies: LastEnemies | null,
  ): void {
    this.updateMultiplier(world, screen.kind === 'none');
    this.updateRemaining(screen.kind === 'none' ? lastEnemies : null);
    this.updateThreats(screen.kind === 'none' ? threats : []);
    this.updateTargeting(world, screen.kind === 'none');
    const { ship } = world;
    this.score.textContent = world.score.toString().padStart(6, '0');
    const layout = world.city ? world.city.layout.toUpperCase() : '';
    this.wave.textContent = world.wave > 0 ? `WAVE ${world.wave} · ${layout}` : layout;
    this.hull.textContent = pips(ship.hull, CONFIG.ship.hull, '■', '□');
    this.charges.textContent = pips(ship.charges, CONFIG.ship.burstCharges, '◆', '◇');
    this.weapon.textContent = ship.weapon.toUpperCase();
    // The Shotgun's readout dims while it reloads, like the hull's glow.
    const reloading = ship.weapon === 'shotgun' && ship.fireCooldown > 0;
    this.weapon.style.opacity = reloading ? '0.4' : '';

    const speed = Math.min(1, speedOf(ship) / SHIP_TOP_SPEED);
    const danger = tankSpeed(Math.max(1, world.wave)) / SHIP_TOP_SPEED;
    this.speedFill.style.width = `${speed * 100}%`;
    this.speedFill.classList.toggle('danger', speed < danger);
    this.speedMarker.style.left = `${danger * 100}%`;

    this.bannerTime = Math.max(0, this.bannerTime - frameTime);
    this.banner.style.opacity =
      this.bannerTime > 0 ? String(Math.min(1, this.bannerTime * 2)) : '0';

    // The attract flag only toggles a class; it must not rebuild the screen.
    const key = JSON.stringify(screen.kind === 'title' ? { ...screen, attract: false } : screen);
    if (key !== this.lastScreen) {
      this.lastScreen = key;
      this.screen.innerHTML = renderScreen(screen);
      this.screen.style.display = screen.kind === 'none' ? 'none' : 'flex';
      this.screen.dataset.kind = screen.kind;
      this.root.dataset.screen = screen.kind;
    }
    this.updateLegend(screen, frameTime);
  }

  /** Cycles the title screen's legend line, fading each one in. */
  private updateLegend(screen: Screen, frameTime: number): void {
    if (screen.kind !== 'title') {
      this.titleTime = 0;
      this.screen.classList.remove('show-scores');
      return;
    }
    this.titleTime += frameTime;
    this.screen.dataset.page = screen.menu.page;
    this.screen.classList.toggle(
      'show-scores',
      screen.attract && screen.menu.page === 'main' && screen.scores.length > 0,
    );
    const index = (this.legendStart + Math.floor(this.titleTime / LEGEND_SECONDS)) % LEGENDS.length;
    const line = this.screen.querySelector<HTMLElement>('.tagline');
    const text = LEGENDS[index]!;
    if (!line || line.textContent === text) return;
    line.textContent = text;
    line.classList.remove('fade-in');
    void line.offsetWidth;
    line.classList.add('fade-in');
  }

  /**
   * The Multiplier above the speed bar, over a bar of the heat left in the current step: it drains
   * as heat burns off and, once empty, the number drops to the one below with the bar full again.
   * The number pops on each rise, and both run hotter in color as the Multiplier climbs.
   */
  private updateMultiplier(world: World, playing: boolean): void {
    const { heat } = world.multiplier;
    const value = multiplierValue(world.multiplier);
    const shown = playing && heat > 0;
    this.multiplier.style.display = shown ? '' : 'none';
    if (!shown) {
      this.shownMultiplier = 1;
      return;
    }
    const color = heatColor(value);
    this.multiplierFill.style.width = `${(heat - Math.floor(heat)) * 100}%`;
    this.multiplierFill.style.color = color;
    this.multiplierValue.style.color = color;
    this.multiplierValue.textContent = `GHOST ×${value}`;
    if (value === this.shownMultiplier) return;
    const rose = value > this.shownMultiplier;
    this.shownMultiplier = value;
    // Restart the pop animation on every rise.
    this.multiplier.classList.remove('pop');
    void this.multiplier.offsetWidth;
    if (rose) this.multiplier.classList.add('pop');
  }

  /**
   * Counts the last Hunters and pins an arrow to the screen edge on the side of the nearest,
   * pointing at it: right edge means turn right, bottom means it is behind.
   */
  private updateRemaining(last: LastEnemies | null): void {
    this.remaining.style.display = last ? 'block' : 'none';
    this.remainingArrow.style.display = last ? 'block' : 'none';
    if (!last) return;
    this.remaining.textContent = `${last.count} ${last.count === 1 ? 'ENEMY' : 'ENEMIES'} REMAINING`;
    const { x, y } = edgePoint(last.bearing, 0.44, 0.4);
    this.remainingArrow.style.left = `${x}%`;
    this.remainingArrow.style.top = `${y}%`;
    // The arrow glyph points up; bearings measure counter-clockwise from the right.
    this.remainingArrow.style.transform = `translate(-50%, -50%) rotate(${Math.PI / 2 - last.bearing}rad)`;
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
      const { x, y } = edgePoint(t.angle, 0.46, 0.42);
      marker.style.left = `${x}%`;
      marker.style.top = `${y}%`;
      marker.style.transform = `translate(-50%, -50%) rotate(${-t.angle}rad)`;
      marker.className = `hud-threat ${t.kind}`;
    });
  }

  /** Says why a kill heated the Multiplier, rising and fading above the meter. */
  private showCallout(credit: KillCredit | null): void {
    const line = el('div', credit ? 'hud-callout' : 'hud-callout friendly');
    line.textContent = credit ? calloutText(credit) : 'FRIENDLY FIRE';
    line.addEventListener('animationend', () => line.remove());
    this.callouts.prepend(line);
    while (this.callouts.children.length > MAX_CALLOUTS) this.callouts.lastElementChild!.remove();
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.bannerTime = BANNER_SECONDS;
  }
}

/** Kill callouts shown at once; older ones are dropped. */
const MAX_CALLOUTS = 4;

const calloutText = ({ tags, chain }: KillCredit): string =>
  tags.length === 0
    ? 'KILL'
    : tags.map((t) => (t === 'chain' ? `CHAIN ×${chain}` : t.toUpperCase())).join(' · ');

/** The Multiplier at which its color reaches white-hot; it climbs no further in color past it. */
const WHITE_HOT = 20;

/** Hunter orange at ×2, warming to white-hot yellow at `WHITE_HOT`. */
function heatColor(multiplier: number): string {
  const t = Math.min(1, Math.max(0, (multiplier - 2) / (WHITE_HOT - 2)));
  return `hsl(${18 + 40 * t} 100% ${55 + 22 * t}%)`;
}

function renderScreen(screen: Screen): string {
  if (screen.kind === 'none') return '';
  if (screen.kind === 'roster') return rosterScreen();
  const gamepad = screen.pad !== null;
  const confirm = gamepad ? 'A' : 'ENTER';
  const device = gamepad
    ? `Controller: ${escapeHtml(screen.pad ?? '')}`
    : 'Keyboard · press any controller button to use a gamepad';
  switch (screen.kind) {
    case 'title':
      return titleScreen(screen, gamepad, device);
    case 'paused':
      return `
        ${headingSvg('Paused', 'cool')}
        <p class="prompt">Press ${gamepad ? 'MENU' : 'ESC'} to resume</p>
        <p class="menu-option">${gamepad ? 'B' : 'BACKSPACE'} · Main menu</p>
        ${controlsTable(gamepad)}`;
    case 'over': {
      const heading = headingSvg(screen.message, 'warm');
      const stats = `<p class="stat">Score ${screen.score.toLocaleString()} · Wave ${screen.wave}</p>`;
      if (screen.entry) {
        const how = gamepad
          ? '↑ ↓ letter · ← → move · A done'
          : 'Type your initials · ← → move · ENTER done';
        return `
          ${heading}
          <p class="legend">NEW HIGH SCORE · #${screen.entry.rank + 1}</p>
          ${stats}
          ${initialsSvg(screen.entry.letters, screen.entry.cursor)}
          <p class="entry-help">${how}</p>`;
      }
      return `
        ${heading}
        <p class="legend">YOUR LEGEND: ${legendRank(screen.score)}</p>
        ${screen.ranked ? '' : '<p class="unranked">CUSTOM GAME · NOT RANKED</p>'}
        ${stats}
        ${scoresTable(screen.scores, screen.highlight)}
        <p class="prompt">Press ${confirm} to retry</p>
        <p class="menu-option">${gamepad ? 'B' : 'BACKSPACE'} · Main menu</p>`;
    }
  }
}

/** Names and points beside the renderer's column of Hunters, each appearing with its model. */
function rosterScreen(): string {
  const rows = ROSTER.map(({ name, points }, i) => {
    const top = (ROSTER_LAYOUT.top + i * ROSTER_LAYOUT.spacing) * 100;
    const delay = i * ROSTER_STEP + 0.15;
    return `<div class="roster-row" style="top: ${top}%; animation-delay: ${delay}s"><span class="name">${name}</span><span class="leader"></span><span class="points">${points} PTS</span></div>`;
  }).join('');
  return `<div class="roster-heading">${headingSvg('The Hunters', 'warm')}</div>${rows}`;
}

/** The title screen: the main menu over the live scene, or the custom-game or help page. */
function titleScreen(
  screen: Extract<Screen, { kind: 'title' }>,
  gamepad: boolean,
  device: string,
): string {
  const { menu } = screen;
  const hint = gamepad
    ? '↑ ↓ select · ← → change · A confirm · B back'
    : '↑ ↓ select · ← → change · ENTER confirm · BACKSPACE back';
  const rows = menu.rows
    .map((row, i) => {
      const on = i === menu.selected;
      const value =
        row.value === undefined
          ? ''
          : `<span class="value">${on ? '◀ ' : ''}${row.value}${on ? ' ▶' : ''}</span>`;
      return `<li class="${on ? 'selected' : ''}"><span class="label">${row.label}</span>${value}</li>`;
    })
    .join('');
  switch (menu.page) {
    case 'main':
      return `
        ${splash()}
        <div class="title-text">
          <p class="tagline"></p>
          <ul class="menu">${rows}</ul>
        </div>
        <div class="title-scores">
          ${headingSvg('High scores', 'cool')}
          ${scoresTable(screen.scores, null)}
        </div>
        <div class="title-controls"><p class="device">${device}</p></div>`;
    case 'custom':
      return `
        <div class="title-panel">
          ${headingSvg('Custom game', 'cool')}
          <ul class="menu settings">${rows}</ul>
          <p class="entry-help">${hint}</p>
          <p class="unranked">Custom games are not ranked unless every setting is left as it is.</p>
        </div>`;
    case 'help':
      return `
        <div class="title-panel">
          ${headingSvg('How to play', 'cool')}
          <p class="premise">${PREMISE}</p>
          ${controlsTable(gamepad)}
          <ul class="menu">${rows}</ul>
          <p class="device">${device}</p>
        </div>`;
  }
}

function scoresTable(scores: readonly ScoreEntry[], highlight: number | null): string {
  if (scores.length === 0) return '';
  const rows = scores
    .map(
      (e, i) =>
        `<tr${i === highlight ? ' class="mine"' : ''}><td>${i + 1}</td><td class="initials">${escapeHtml(e.initials)}</td><td>${e.score.toLocaleString()}</td><td>${e.wave > 0 ? `W${e.wave}` : ''}</td></tr>`,
    )
    .join('');
  return `<table class="scores">${rows}</table>`;
}

let splashMarkup: string | null = null;
const splash = (): string => (splashMarkup ??= splashSvg());

function controlsTable(gamepad: boolean): string {
  const rows = gamepad
    ? [
        ['Steer', 'Left stick'],
        ['Thrust', 'RT'],
        ['Powerslide', 'LT'],
        ['Fire', 'RB / X'],
        ['Burst', 'A / LB'],
        ['Switch gun', 'Y'],
        ['Pause', 'Menu'],
        ['Back / main menu', 'B'],
      ]
    : [
        ['Steer', 'A D / ← →'],
        ['Thrust', 'W / ↑'],
        ['Powerslide', 'Shift'],
        ['Fire', 'Space'],
        ['Burst', 'E'],
        ['Switch gun', 'Q'],
        ['Pause', 'Esc'],
        ['Back / main menu', 'Backspace'],
      ];
  return `<table class="controls">${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
}

/**
 * Where a direction from the screen center (0 = right, π/2 = up) meets an inset screen edge, as
 * percentages. `halfWidth` and `halfHeight` are the inset edge's distance from the center.
 */
function edgePoint(angle: number, halfWidth: number, halfHeight: number): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.min(
    halfWidth / Math.max(Math.abs(cos), 1e-6),
    halfHeight / Math.max(Math.abs(sin), 1e-6),
  );
  return { x: 50 + cos * reach * 100, y: 50 - sin * reach * 100 };
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
