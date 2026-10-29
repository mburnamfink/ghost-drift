/** The subset of the browser Gamepad interface the game reads; lets mapping logic be tested without a browser. */
export interface PadState {
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly timestamp: number;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

type Trigger = { kind: 'button'; index: number } | { kind: 'axis'; index: number };

export interface PadLayout {
  name: string;
  steerAxis: number;
  thrust: Trigger;
  slide: Trigger;
  a: number;
  x: number;
  lb: number;
  rb: number;
  menu: number;
}

/** W3C "standard" mapping, reported by browsers that recognise the controller. */
export const STANDARD_LAYOUT: PadLayout = {
  name: 'standard',
  steerAxis: 0,
  thrust: { kind: 'button', index: 7 },
  slide: { kind: 'button', index: 6 },
  a: 0,
  x: 2,
  lb: 4,
  rb: 5,
  menu: 9,
};

/**
 * Raw Linux xpad order, which Chrome and Firefox pass through when they don't recognise an Xbox
 * controller model: buttons follow evdev key codes (A B X Y LB RB View Menu Guide LS RS) and the
 * triggers are axes 2 and 5 resting at -1.
 */
export const XPAD_RAW_LAYOUT: PadLayout = {
  name: 'xpad (raw Linux)',
  steerAxis: 0,
  thrust: { kind: 'axis', index: 5 },
  slide: { kind: 'axis', index: 2 },
  a: 0,
  x: 2,
  lb: 4,
  rb: 5,
  menu: 7,
};

const XBOX_ID = /xbox|x-box|xinput|045e/i;

export const isXboxLike = (pad: PadState): boolean => XBOX_ID.test(pad.id);

export function layoutFor(pad: PadState): PadLayout {
  if (pad.mapping === 'standard') return STANDARD_LAYOUT;
  return isXboxLike(pad) ? XPAD_RAW_LAYOUT : STANDARD_LAYOUT;
}

/**
 * Chooses which connected pad drives the game. Keyboards and mice can register as joysticks on
 * Linux, so recognised controllers beat unknown devices; ties go to the most recently used.
 */
export function choosePad(pads: readonly (PadState | null)[]): PadState | null {
  const rank = (p: PadState) => (p.mapping === 'standard' ? 2 : 0) + (isXboxLike(p) ? 1 : 0);
  let best: PadState | null = null;
  for (const p of pads) {
    if (!p?.connected) continue;
    if (!best || rank(p) > rank(best) || (rank(p) === rank(best) && p.timestamp > best.timestamp)) {
      best = p;
    }
  }
  return best;
}

/**
 * Trigger pull in [0, 1]. Linux reports an untouched raw trigger axis as 0, which would read as
 * half-pulled, so an axis counts only once it has been seen away from 0.
 */
export function readTrigger(pad: PadState, trigger: Trigger, touchedAxes: Set<number>): number {
  if (trigger.kind === 'button') return pad.buttons[trigger.index]?.value ?? 0;
  const v = pad.axes[trigger.index] ?? -1;
  if (v !== 0) touchedAxes.add(trigger.index);
  if (!touchedAxes.has(trigger.index)) return 0;
  return Math.min(1, Math.max(0, (v + 1) / 2));
}
