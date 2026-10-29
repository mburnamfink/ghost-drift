import { describe, expect, it } from 'vitest';
import {
  type PadState,
  STANDARD_LAYOUT,
  XPAD_RAW_LAYOUT,
  choosePad,
  layoutFor,
  readTrigger,
} from './padLayout';

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

describe('layoutFor', () => {
  it('uses the raw xpad layout for an unrecognised Xbox controller', () => {
    expect(layoutFor(rawXbox)).toBe(XPAD_RAW_LAYOUT);
    expect(layoutFor(standardXbox)).toBe(STANDARD_LAYOUT);
  });
});

describe('readTrigger', () => {
  const axis = { kind: 'axis', index: 5 } as const;

  it('treats an untouched raw trigger axis at 0 as released', () => {
    expect(readTrigger(pad({ axes: [0, 0, 0, 0, 0, 0] }), axis, new Set())).toBe(0);
  });

  it('maps a raw trigger axis from [-1, 1] to [0, 1] once touched', () => {
    const touched = new Set<number>();
    expect(readTrigger(pad({ axes: [0, 0, 0, 0, 0, -1] }), axis, touched)).toBe(0);
    expect(readTrigger(pad({ axes: [0, 0, 0, 0, 0, 0] }), axis, touched)).toBe(0.5);
    expect(readTrigger(pad({ axes: [0, 0, 0, 0, 0, 1] }), axis, touched)).toBe(1);
  });

  it('reads standard triggers from button values', () => {
    const p = pad({
      buttons: Array.from({ length: 8 }, (_, i) => ({
        pressed: i === 7,
        value: i === 7 ? 0.8 : 0,
      })),
    });
    expect(readTrigger(p, { kind: 'button', index: 7 }, new Set())).toBe(0.8);
  });
});
