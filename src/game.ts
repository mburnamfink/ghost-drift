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
import { GAME_OVER_MESSAGES } from './ui/copy';
import { insertScore, loadScores, rankFor, saveScores } from './scores/highScores';
import { InitialsEntry } from './scores/initials';
import { type CustomSettings, Menu, densityOf, isStandard } from './ui/menu';
import type { EnemyDensity } from './sim/waves';
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
  private autopilot: Autopilot | null = null;
  private readonly menu = new Menu();
  /** Seconds since the last menu input, for the attract loop. */
  private titleIdle = 0;
  /** How the current Run was set up, so Retry plays it again. */
  private run: RunSettings;
  private world: World;
  private phase: Phase = 'title';
  private overTime = 0;
  private overMessage = GAME_OVER_MESSAGES[0]!;
  private scores = loadScores();
  /** Initials being entered for a Run that made the table, or null. */
  private entry: InitialsEntry | null = null;
  /** Where the last finished Run landed in the table, to highlight it. */
  private entryRank: number | null = null;
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
    this.run = this.standardRun();
    this.world = this.newWorld();
    if (options.demo) this.startDemo();
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
    if (this.phase === 'title') this.renderer.renderTitle(frameTime);
    else this.renderer.render(this.world, this.phase === 'paused' ? 0 : frameTime);
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
      case 'title': {
        const touched =
          input.confirm || input.back || Object.values(input.nav).some((pushed) => pushed);
        this.titleIdle = touched ? 0 : this.titleIdle + frameTime;
        const action = this.menu.apply(input);
        if (action?.type === 'play') this.startRun(this.standardRun());
        if (action?.type === 'custom') this.startRun(customRun(action.settings));
        if (action?.type === 'demo') this.startDemo();
        break;
      }
      case 'playing':
        // Like an arcade attract mode, any button ends the demo.
        if (this.autopilot && (input.confirm || input.back || input.pause)) this.quitToTitle();
        else if (input.pause) this.phase = 'paused';
        break;
      case 'paused':
        if (input.pause) {
          this.phase = 'playing';
          this.loop.reset();
        } else if (input.back) {
          this.quitToTitle();
        }
        break;
      case 'over': {
        this.overTime += frameTime;
        if (this.entry) {
          // The press that finishes the initials must not also restart.
          if (this.overTime > OVER_INPUT_DELAY) this.updateEntry(input);
          break;
        }
        if (this.autopilot && (input.confirm || input.back || input.pause)) {
          this.quitToTitle();
          break;
        }
        const restart = this.autopilot
          ? this.overTime > DEMO_RESTART
          : input.confirm && this.overTime > OVER_INPUT_DELAY;
        if (restart) {
          this.world = this.newWorld();
          this.loop.reset();
          this.phase = 'playing';
        } else if (input.back && this.overTime > OVER_INPUT_DELAY) {
          this.quitToTitle();
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

  /** Abandons the Run, or the demo, for the main menu. Only finished Runs enter the table. */
  private quitToTitle(): void {
    this.autopilot = null;
    this.hud.setDemoBadge(false);
    this.run = this.standardRun();
    this.world = this.newWorld();
    this.loop.reset();
    this.titleIdle = 0;
    this.menu.home();
    this.phase = 'title';
  }

  private startRun(run: RunSettings): void {
    this.run = run;
    this.world = this.newWorld();
    this.loop.reset();
    this.phase = 'playing';
  }

  private startDemo(): void {
    this.autopilot = new Autopilot();
    this.hud.setDemoBadge(true);
    this.startRun(this.standardRun());
  }

  /** A normal Run, with any debug overrides from the URL. */
  private standardRun(): RunSettings {
    const { firstWave, layout } = this.options;
    return {
      firstWave: firstWave ?? 1,
      ...(layout ? { layout } : {}),
      density: {},
      ranked: true,
    };
  }

  private enterOver(): void {
    this.phase = 'over';
    this.overTime = 0;
    this.overMessage = GAME_OVER_MESSAGES[Math.floor(Math.random() * GAME_OVER_MESSAGES.length)]!;
    this.entryRank = null;
    const qualifies =
      !this.autopilot && this.run.ranked && rankFor(this.scores, this.world.score) !== null;
    this.entry = qualifies ? new InitialsEntry() : null;
  }

  private updateEntry(input: FrameInput): void {
    const entry = this.entry!;
    entry.apply(input);
    if (!entry.done) return;
    const { score, wave } = this.world;
    const result = insertScore(this.scores, { initials: entry.initials, score, wave });
    if (result) {
      this.scores = result.table;
      this.entryRank = result.rank;
      saveScores(this.scores);
    }
    this.entry = null;
    this.overTime = 0;
  }

  private newWorld(): World {
    const { firstWave, layout, density } = this.run;
    const world = createWorld(
      this.options.seed ?? Math.floor(Math.random() * 2 ** 31),
      undefined,
      firstWave,
      layout,
      density,
    );
    this.renderer.setWorld(world);
    this.autopilot?.reset(world);
    return world;
  }

  private screen(): Screen {
    const pad = this.gamepad.description;
    switch (this.phase) {
      case 'title':
        return {
          kind: 'title',
          pad,
          scores: this.scores,
          menu: this.menu.view(),
          attract: isAttract(this.titleIdle),
        };
      case 'paused':
        return { kind: 'paused', pad };
      case 'over':
        return {
          kind: 'over',
          pad,
          score: this.world.score,
          wave: this.world.wave,
          message: this.overMessage,
          ranked: this.run.ranked,
          scores: this.scores,
          highlight: this.entryRank,
          entry: this.entry && {
            letters: [...this.entry.letters],
            cursor: this.entry.cursor,
            rank: rankFor(this.scores, this.world.score) ?? 0,
          },
        };
      case 'playing':
        return { kind: 'none' };
    }
  }
}

/** How a Run is set up. */
interface RunSettings {
  firstWave: number;
  layout?: LayoutName;
  density: EnemyDensity;
  /** Whether its score may enter the high-score table. */
  ranked: boolean;
}

function customRun(settings: CustomSettings): RunSettings {
  return {
    firstWave: settings.wave,
    ...(settings.layout === 'random' ? {} : { layout: settings.layout }),
    density: densityOf(settings),
    ranked: isStandard(settings),
  };
}

/**
 * After this long without input the title alternates with the high-score table, like an arcade
 * cabinet, so it never covers the menu while someone is using it.
 */
const ATTRACT_IDLE = 12;
const ATTRACT_SCORES = 7;
const ATTRACT_TITLE = 12;

const isAttract = (idle: number): boolean =>
  idle > ATTRACT_IDLE && (idle - ATTRACT_IDLE) % (ATTRACT_SCORES + ATTRACT_TITLE) < ATTRACT_SCORES;
