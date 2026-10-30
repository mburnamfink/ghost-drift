/**
 * Drafts the attract loop's showcase script (`SHOWCASE.moves` in src/ai/showcase.ts) by beam search:
 * from the script's opening beat, it tries each beat in a small menu against the real simulation,
 * keeps the most promising runs, and repeats until the run is long enough. Runs score for points,
 * Powerslide kills and Shotgun hits, and lose heavily for hits taken and time spent slow.
 *
 *   npm run showcase:search
 *   SHOWCASE_SECONDS=36 WIDTH=16 PULSE_BONUS=12000 npm run showcase:search
 *
 * It prints the beats ready to paste over `moves`, then replays them from scratch to confirm they
 * play out exactly as searched. End the pasted script with a beat or two of coasting so the last
 * banner can show.
 */
import { expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import {
  type Move,
  SHOWCASE,
  type Showcase,
  ShowcasePilot,
  createShowcaseWorld,
} from '../src/ai/showcase';
import { type World, stepWorld } from '../src/sim/world';

const env = import.meta.env;
const SECONDS = Number(env.SHOWCASE_SECONDS ?? 34);
const WIDTH = Number(env.WIDTH ?? 12);
const BEAT = Number(env.BEAT ?? 1.2);
const PULSE_BONUS = Number(env.PULSE_BONUS ?? 8000);
const SLIDE_KILL_BONUS = 4000;
const HIT_PENALTY = 40000;
/** Per second spent below `SLOW_SPEED` while a Wave is live. */
const SLOW_PENALTY = 3000;
const SLOW_SPEED = 15;
/** Slides only start above this speed, and at most two in a row, so the Ship never spins idly. */
const SLIDE_MIN_SPEED = 20;
const DT = 1 / CONFIG.sim.stepHz;
/** Matches the slack ShowcasePilot gives beat boundaries. */
const BOUNDARY_SLACK = 1e-6;

interface Run {
  world: World;
  pilot: ShowcasePilot;
  /** The script `pilot` flies; beats are appended to it as the run grows. */
  script: { moves: Move[] };
  end: number;
  value: number;
  hits: number;
  kills: number;
  slideKills: number;
  pulseHits: number;
}

/** Deep copy that keeps prototypes and shared references, so a copied pilot still sees its World. */
function clone<T>(value: T, seen = new Map<unknown, unknown>()): T {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (ArrayBuffer.isView(value)) {
    const copy = (value as unknown as Int32Array).slice();
    seen.set(value, copy);
    return copy as T;
  }
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [k, v] of value) copy.set(clone(k, seen), clone(v, seen));
    return copy as T;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const v of value) copy.add(clone(v, seen));
    return copy as T;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const v of value) copy.push(clone(v, seen));
    return copy as T;
  }
  const copy = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
  seen.set(value, copy);
  for (const [k, v] of Object.entries(value)) copy[k] = clone(v, seen);
  return copy as T;
}

function menu(run: Run): Move[] {
  const { ship, hunters } = run.world;
  const heading = Math.round((ship.heading * 180) / Math.PI / 15) * 15;
  const speed = Math.hypot(ship.vel.x, ship.vel.y);
  const chained = run.script.moves.slice(-2).filter((m) => m.slide).length === 2;
  const out: Move[] = [];
  for (const weapon of ['cannon', 'shotgun'] as const) {
    out.push({ for: BEAT, thrust: 1, aim: 'hunt', fire: true, weapon });
    if (speed > SLIDE_MIN_SPEED && !chained)
      out.push({ for: BEAT, slide: true, aim: 'nearest', fire: true, weapon });
  }
  for (const turn of [-60, -30, 0, 30, 60])
    out.push({ for: BEAT, thrust: 1, aim: heading + turn, fire: true, weapon: 'cannon' });
  if (hunters.some((h) => h.kind === 'juggernaut'))
    out.push({
      for: BEAT,
      thrust: 1,
      aim: 'hunt',
      target: 'juggernaut',
      fire: true,
      weapon: 'shotgun',
    });
  if (ship.charges > 0) out.push({ for: 0.6, thrust: 1, aim: 'nearest', burst: true, fire: true });
  return out;
}

function extend(parent: Run, move: Move): Run {
  const { world, pilot, script } = clone({
    world: parent.world,
    pilot: parent.pilot,
    script: parent.script,
  });
  script.moves.push(move);
  const run: Run = { ...parent, world, pilot, script, end: parent.end + move.for };
  let slow = 0;
  while (world.time < run.end - BOUNDARY_SLACK && !world.over) {
    stepWorld(world, pilot.controls(world), DT);
    for (const e of world.events) {
      if (e.type === 'shipHit') run.hits++;
      if (e.type === 'pulseHit') run.pulseHits++;
      if (e.type === 'hunterDestroyed') {
        run.kills++;
        if (world.ship.sliding) run.slideKills++;
      }
    }
    world.events.length = 0;
    if (world.lull === 0 && Math.hypot(world.ship.vel.x, world.ship.vel.y) < SLOW_SPEED) slow += DT;
  }
  run.value =
    parent.value +
    (world.score - parent.world.score) +
    (run.pulseHits - parent.pulseHits) * PULSE_BONUS +
    (run.slideKills - parent.slideKills) * SLIDE_KILL_BONUS -
    (run.hits - parent.hits) * HIT_PENALTY -
    slow * SLOW_PENALTY -
    (world.over ? 1e8 : 0);
  return run;
}

function search(base: Showcase): Run {
  const script = { moves: [] as Move[] };
  const start: Run = {
    world: createShowcaseWorld(base),
    pilot: new ShowcasePilot({ ...base, moves: script.moves }),
    script,
    end: 0,
    value: 0,
    hits: 0,
    kills: 0,
    slideKills: 0,
    pulseHits: 0,
  };
  let beam = [extend(start, base.moves[0]!)];
  while (beam[0]!.end < SECONDS) {
    const next = beam.flatMap((run, parent) =>
      menu(run).map((m) => ({ run: extend(run, m), parent })),
    );
    next.sort((a, b) => b.run.value - a.run.value);
    // At most two children per parent, so one lucky run can't crowd out every alternative.
    const children = beam.map(() => 0);
    beam = [];
    for (const { run, parent } of next) {
      if (children[parent]!++ >= 2) continue;
      beam.push(run);
      if (beam.length >= WIDTH) break;
    }
  }
  return beam[0]!;
}

/** Drops gun changes to the gun already in hand and merges repeated beats, for a readable script. */
function tidy(moves: readonly Move[]): Move[] {
  const out: Move[] = [];
  let gun = 'cannon';
  for (const original of moves) {
    const move = { ...original };
    if (move.weapon === gun) delete move.weapon;
    else if (move.weapon) gun = move.weapon;
    const last = out[out.length - 1];
    const alike =
      last && JSON.stringify({ ...last, for: 0 }) === JSON.stringify({ ...move, for: 0 });
    if (alike && !move.burst && !move.weapon) {
      last.for = Math.round((last.for + move.for) * 100) / 100;
      continue;
    }
    out.push(move);
  }
  return out;
}

const KEYS = ['for', 'thrust', 'slide', 'burst', 'aim', 'target', 'weapon', 'fire'] as const;

function format(move: Move): string {
  const value = (v: unknown): string =>
    typeof v === 'string'
      ? `'${v}'`
      : typeof v === 'object' && v !== null
        ? `{ ${Object.entries(v)
            .map(([k, x]) => `${k}: ${String(x)}`)
            .join(', ')} }`
        : String(v);
  const fields = KEYS.filter((k) => move[k] !== undefined).map((k) => `${k}: ${value(move[k])}`);
  return `    { ${fields.join(', ')} },`;
}

function replay(base: Showcase, moves: Move[]): { score: number; hits: number } {
  const showcase = { ...base, moves };
  const world = createShowcaseWorld(showcase);
  const pilot = new ShowcasePilot(showcase);
  const end = moves.reduce((sum, m) => sum + m.for, 0);
  let hits = 0;
  while (world.time < end - BOUNDARY_SLACK && !world.over) {
    stepWorld(world, pilot.controls(world), DT);
    hits += world.events.filter((e) => e.type === 'shipHit').length;
    world.events.length = 0;
  }
  return { score: world.score, hits };
}

it('searches for a showcase script', () => {
  const best = search(SHOWCASE);
  const moves = tidy(best.script.moves);
  const check = replay(SHOWCASE, moves);
  console.log(
    [
      `score ${best.world.score} · kills ${best.kills} · Powerslide kills ${best.slideKills}` +
        ` · Shotgun hits ${best.pulseHits} · hits taken ${best.hits} · hull ${best.world.ship.hull}`,
      `reached Wave ${best.world.wave} · ${best.end.toFixed(1)} s`,
      '',
      ...moves.map(format),
    ].join('\n'),
  );
  expect(check, 'the tidied script must replay exactly as searched').toEqual({
    score: best.world.score,
    hits: best.hits,
  });
}, 0);
