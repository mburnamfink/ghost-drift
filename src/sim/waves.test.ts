import { describe, expect, it } from 'vitest';
import { waveMix, waveTotal } from './waves';

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
