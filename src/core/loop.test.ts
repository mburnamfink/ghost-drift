import { describe, expect, it } from 'vitest';
import { FixedStep } from './loop';

// Step sizes are powers of two so the arithmetic is exact.
describe('FixedStep', () => {
  it('carries leftover time into the next frame', () => {
    const loop = new FixedStep(0.25, 10);
    let steps = 0;
    loop.advance(0.625, () => steps++);
    expect(steps).toBe(2);
    loop.advance(0.125, () => steps++);
    expect(steps).toBe(3);
  });

  it('flags only the first step of a frame', () => {
    const loop = new FixedStep(0.25, 10);
    const firsts: boolean[] = [];
    loop.advance(0.75, (_, first) => firsts.push(first));
    expect(firsts).toEqual([true, false, false]);
  });

  it('drops time beyond the frame cap', () => {
    const loop = new FixedStep(0.25, 1.25);
    let steps = 0;
    loop.advance(10, () => steps++);
    expect(steps).toBe(5);
  });
});
