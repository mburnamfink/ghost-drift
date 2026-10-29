import { CONFIG } from './config';
import { FixedStep } from './core/loop';
import { GamepadInput } from './input/gamepad';
import { type FrameInput, mergeInputs } from './input/input';
import { KeyboardInput } from './input/keyboard';
import { GameRenderer } from './render/renderer';
import { NO_CONTROLS } from './sim/controls';
import { type World, createWorld, stepWorld } from './sim/world';
import type { LayoutName } from './sim/city';
import { Hud, type LastEnemies, type Screen } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Autopilot } from './ai/autopilot';
import { distance } from './core/vec2';

type Phase = 'title' | 'playing' | 'paused' | 'over';

/** Debug overrides, all optional; set from URL parameters. */
export interface GameOptions {
  /** Fixed seed for every Run instead of a random one. */
  seed?: number;
  /** Top-down camera. */
  overhead?: boolean;
  firstWave?: number;
  /** Force a city layout instead of picking one at random. */
  layout?: LayoutName;
  /** Draw every Block as a plain box. */
  plainBlocks?: boolean;
  /** The game plays itself, restarting after each death. Only pause is read from the player. */
  demo?: boolean;
}

const BEST_SCORE_KEY = 'quantum-breach.best';
/** Ignore confirm briefly after death so a held fire/burst button doesn't skip the score screen. */
const OVER_INPUT_DELAY = 1;
/**
 * With this many Hunters or fewer left, and at least one of the Wave already destroyed, the HUD
 * counts them and points to the nearest.
 */
const LAST_ENEMIES_SHOWN = 3;
/** Seconds the score screen shows in demo mode before the next Run starts. */
const DEMO_RESTART = 4;

/** Owns the phase state machine and wires input, simulation, rendering and HUD together. */
export class Game {
  private readonly keyboard = new KeyboardInput();
  private readonly gamepad = new GamepadInput();
  private readonly renderer: GameRenderer;
  private readonly hud: Hud;
  private readonly loop = new FixedStep(1 / CONFIG.sim.stepHz, CONFIG.sim.maxFrameTime);
  private readonly minimap: Minimap;
  private readonly autopilot: Autopilot | null;
  private world: World;
  private phase: Phase = 'title';
  private overTime = 0;
  private best = loadBest();
  private lastFrame = 0;

  constructor(
    container: HTMLElement,
    private readonly options: GameOptions = {},
  ) {
    this.renderer = new GameRenderer(
      container,
      options.overhead ?? false,
      !(options.plainBlocks ?? false),
    );
    this.hud = new Hud(container);
    this.minimap = new Minimap(container);
    this.autopilot = options.demo ? new Autopilot() : null;
    this.world = this.newWorld();
    if (this.autopilot) {
      this.phase = 'playing';
      this.hud.showDemoBadge();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.phase = 'paused';
    });
  }

  start(): void {
    requestAnimationFrame((t) => {
      this.lastFrame = t;
      this.frame(t);
    });
  }

  private frame(now: number): void {
    const frameTime = Math.min((now - this.lastFrame) / 1000, CONFIG.sim.maxFrameTime);
    this.lastFrame = now;
    const input = mergeInputs(this.keyboard.poll(), this.gamepad.poll());

    const wasPlaying = this.phase === 'playing';
    this.updatePhase(input, frameTime);
    if (this.phase === 'playing' || this.phase === 'over') {
      // A both confirms and Bursts, so the press that starts a Run must not also spend a Charge.
      const runInput = this.autopilot
        ? this.autopilot.controls(this.world, frameTime)
        : wasPlaying
          ? input
          : { ...input, burst: false };
      this.loop.advance(frameTime, (dt, first) => {
        const controls = this.phase === 'playing' ? runInput : NO_CONTROLS;
        // Edge-triggered actions apply once per frame, not once per step.
        stepWorld(this.world, first ? controls : { ...controls, burst: false, swap: false }, dt);
      });
    }
    if (this.world.over && this.phase === 'playing') this.enterOver();

    this.renderer.handleEvents(this.world.events);
    this.hud.handleEvents(this.world.events);
    this.world.events.length = 0;
    this.renderer.render(this.world, this.phase === 'paused' ? 0 : frameTime);
    this.hud.update(
      this.world,
      this.screen(),
      frameTime,
      this.renderer.offscreenThreats(this.world),
      this.lastEnemies(),
    );
    this.minimap.update(this.world, this.renderer.viewYaw, this.phase === 'playing');

    requestAnimationFrame((t) => this.frame(t));
  }

  private updatePhase(input: FrameInput, frameTime: number): void {
    switch (this.phase) {
      case 'title':
        if (input.confirm) this.phase = 'playing';
        break;
      case 'playing':
        if (input.pause) this.phase = 'paused';
        break;
      case 'paused':
        if (input.pause) {
          this.phase = 'playing';
          this.loop.reset();
        }
        break;
      case 'over': {
        this.overTime += frameTime;
        const restart = this.autopilot
          ? this.overTime > DEMO_RESTART
          : input.confirm && this.overTime > OVER_INPUT_DELAY;
        if (restart) {
          this.world = this.newWorld();
          this.loop.reset();
          this.phase = 'playing';
        }
        break;
      }
    }
  }

  private lastEnemies(): LastEnemies | null {
    const { hunters, ship, lull, waveStrength } = this.world;
    const someKilled = hunters.length < waveStrength;
    if (lull > 0 || !someKilled || hunters.length === 0 || hunters.length > LAST_ENEMIES_SHOWN) {
      return null;
    }
    let nearest = hunters[0]!;
    for (const h of hunters) {
      if (distance(h.pos, ship.pos) < distance(nearest.pos, ship.pos)) nearest = h;
    }
    return {
      count: hunters.length,
      bearing: this.renderer.bearingFromShip(this.world, nearest.pos),
    };
  }

  private enterOver(): void {
    this.phase = 'over';
    this.overTime = 0;
    if (!this.autopilot && this.world.score > this.best) {
      this.best = this.world.score;
      saveBest(this.best);
    }
  }

  private newWorld(): World {
    const { seed, firstWave, layout } = this.options;
    const world = createWorld(
      seed ?? Math.floor(Math.random() * 2 ** 31),
      undefined,
      firstWave ?? 1,
      layout,
    );
    this.renderer.setWorld(world);
    this.autopilot?.reset(world);
    return world;
  }

  private screen(): Screen {
    const pad = this.gamepad.description;
    switch (this.phase) {
      case 'title':
        return { kind: 'title', pad };
      case 'paused':
        return { kind: 'paused', pad };
      case 'over':
        return {
          kind: 'over',
          pad,
          score: this.world.score,
          wave: this.world.wave,
          best: this.best,
        };
      case 'playing':
        return { kind: 'none' };
    }
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the best score is a convenience.
  }
}
