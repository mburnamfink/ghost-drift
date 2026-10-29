import { describe, expect, it } from 'vitest';
import { type PadState, choosePad } from './padLayout';

const pad = (over: Partial<PadState>): PadState => ({
  id: 'pad',
  mapping: '',
  connected: true,
  timestamp: 0,
  axes: [0, 0, 0, 0, 0, 0],
  buttons: [],
  ...over,
});

const keyboard = pad({ id: 'Corsair K70 Keyboard Mouse (Vendor: 1b1c)', timestamp: 99 });
const unknown = pad({ id: 'HID 413d:553a', timestamp: 50 });
const rawXbox = pad({ id: 'Microsoft Xbox Series S|X Controller (Vendor: 045e Product: 0b12)' });
const standardXbox = pad({ ...rawXbox, mapping: 'standard' });

describe('choosePad', () => {
  it('prefers an Xbox controller over keyboards and unknown HID devices', () => {
    expect(choosePad([unknown, keyboard, rawXbox])).toBe(rawXbox);
  });

  it('prefers a standard-mapped pad', () => {
    expect(choosePad([rawXbox, standardXbox])).toBe(standardXbox);
  });

  it('falls back to any connected device, most recently used first', () => {
    expect(choosePad([unknown, keyboard, null])).toBe(keyboard);
  });

  it('ignores disconnected pads', () => {
    expect(choosePad([{ ...rawXbox, connected: false }])).toBeNull();
  });
});
