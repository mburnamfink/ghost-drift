/** The subset of the browser Gamepad interface the game reads; lets selection logic be tested without a browser. */
export interface PadState {
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly timestamp: number;
  readonly axes: readonly number[];
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

/**
 * Button and axis indices of the W3C "standard" gamepad mapping. Chrome on Linux delivers an Xbox
 * Series controller in this order even when it reports `mapping` as empty, so it is used for every pad.
 */
export const PAD = {
  steerAxis: 0,
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  view: 8,
  menu: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  /** The left stick's vertical axis: negative is up. */
  stickYAxis: 1,
} as const;

const XBOX_ID = /xbox|x-box|xinput|045e/i;

export const isXboxLike = (pad: PadState): boolean => XBOX_ID.test(pad.id);

/**
 * Chooses which connected pad drives the game. Keyboards and mice can register as joysticks on
 * Linux, so recognized controllers beat unknown devices; ties go to the most recently used.
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
