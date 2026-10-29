import { describe, expect, it } from 'vitest';
import { GamepadInput } from './gamepad';
import { PAD, type PadState } from './padLayout';

function fakePad() {
  const values = new Array<number>(17).fill(0);
  const axes = [0, 0, 0, 0];
  const snapshot = (): PadState => ({
    id: 'Microsoft Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b12)',
    mapping: 'standard',
    connected: true,
    timestamp: 0,
    axes: [...axes],
    buttons: values.map((v) => ({ pressed: v > 0.5, value: v })),
  });
  return { values, axes, input: new GamepadInput(() => [snapshot()]) };
}

describe('GamepadInput', () => {
  it('reports a button press on the first frame only', () => {
    const { values, input } = fakePad();
    input.poll();
    values[PAD.a] = 1;
    const pressed = input.poll();
    expect(pressed.confirm).toBe(true);
    expect(pressed.burst).toBe(true);
    const held = input.poll();
    expect(held.confirm).toBe(false);
    expect(held.burst).toBe(false);
  });

  it('reads triggers, fire and steering as held values', () => {
    const { values, axes, input } = fakePad();
    values[PAD.rt] = 0.75;
    values[PAD.lt] = 1;
    values[PAD.rb] = 1;
    axes[0] = 1;
    const frame = input.poll();
    expect(frame.thrust).toBe(0.75);
    expect(frame.slide).toBe(true);
    expect(frame.fire).toBe(true);
    expect(frame.steer).toBe(1);
  });

  it('ignores stick drift inside the deadzone', () => {
    const { axes, input } = fakePad();
    axes[0] = 0.1;
    expect(input.poll().steer).toBe(0);
  });
});
