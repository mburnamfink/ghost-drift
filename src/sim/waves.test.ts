import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Rng } from '../core/rng';
import { terrainFromRows } from './terrain';
import { spawnPoints, waveMix, waveTotal } from './waves';

describe('waveMix with enemy densities', () => {
  it('scales each type by its density and leaves the rest alone', () => {
    const normal = waveMix(10);
    const custom = waveMix(10, { tanks: 2, snipers: 0 });
    expect(custom.tanks).toBe(normal.tanks * 2);
    expect(custom.snipers).toBe(0);
    expect(custom.berserkers).toBe(normal.berserkers);
  });

  it('always sends at least one Hunter', () => {
    const none = { tanks: 0, berserkers: 0, snipers: 0, artillery: 0, juggernauts: 0 };
    expect(waveTotal(waveMix(5, none))).toBe(1);
  });
});

describe('spawnPoints', () => {
  it('puts the roomy points on open ground well clear of any Block', () => {
    // Pillars every 4 cells leave only a few wide clearings.
    const rows = Array.from({ length: 64 }, (_, y) =>
      Array.from({ length: 64 }, (_, x) =>
        x % 4 === 0 && y % 4 === 0 && !(x > 36 && y > 36) ? '#' : '.',
      ).join(''),
    );
    const terrain = terrainFromRows(rows);
    const clear = CONFIG.juggernaut.spawnClearance;
    for (let seed = 1; seed <= 10; seed++) {
      const [roomy] = spawnPoints(terrain, { x: 20, y: 20 }, 5, new Rng(seed), 1);
      const cx = terrain.cellOf(roomy!.x);
      const cy = terrain.cellOf(roomy!.y);
      for (let dy = 1 - clear; dy < clear; dy++)
        for (let dx = 1 - clear; dx < clear; dx++)
          expect(terrain.isSolid(cx + dx, cy + dy)).toBe(false);
    }
  });
});
