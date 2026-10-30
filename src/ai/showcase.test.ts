import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { stepWorld } from '../sim/world';
import { ShowcasePilot, createShowcaseWorld, showcaseDuration } from './showcase';

const DT = 1 / CONFIG.sim.stepHz;

function play() {
  const world = createShowcaseWorld();
  const pilot = new ShowcasePilot();
  const kinds = new Set<string>();
  let hits = 0;
  let cleared = 0;
  while (world.time < showcaseDuration() && !world.over) {
    stepWorld(world, pilot.controls(world), DT);
    for (const e of world.events) {
      if (e.type === 'shipHit') hits++;
      if (e.type === 'waveCleared') cleared++;
      if (e.type === 'hunterDestroyed') kinds.add(e.kind);
    }
    world.events.length = 0;
  }
  return { world, hits, cleared, kinds };
}

describe('Showcase', () => {
  it('plays the same Run every time', () => {
    expect(play().world.score).toBe(play().world.score);
  });

  it('survives untouched, clears Waves and destroys every kind of Hunter', () => {
    const { world, hits, cleared, kinds } = play();
    expect(world.over).toBe(false);
    expect(hits).toBe(0);
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect([...kinds].sort()).toEqual(['artillery', 'berserker', 'juggernaut', 'sniper', 'tank']);
  });
});
