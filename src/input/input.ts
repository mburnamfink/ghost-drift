import type { Controls } from '../sim/controls';

/** One frame of player intent. Edge flags are true only on the frame a button went down. */
export interface FrameInput extends Controls {
  /** Confirm on menus: start a Run, retry. */
  confirm: boolean;
  pause: boolean;
  /** Leave the current screen for the one before it, e.g. pause to main menu. */
  back: boolean;
  /** Menu navigation, each true only on the frame the direction was pushed. */
  nav: { up: boolean; down: boolean; left: boolean; right: boolean };
  /** Letters A to Z typed this frame, in order. Empty from devices that cannot type. */
  typed: string;
}

export const NO_NAV: FrameInput['nav'] = { up: false, down: false, left: false, right: false };

export interface InputSource {
  poll(): FrameInput;
}

export const IDLE_INPUT: FrameInput = {
  steer: 0,
  thrust: 0,
  slide: false,
  fire: false,
  burst: false,
  swap: false,
  confirm: false,
  pause: false,
  back: false,
  nav: NO_NAV,
  typed: '',
};

/** Combines devices so either can be used at any time; the stronger analog value wins. */
export function mergeInputs(a: FrameInput, b: FrameInput): FrameInput {
  return {
    steer: Math.abs(a.steer) >= Math.abs(b.steer) ? a.steer : b.steer,
    thrust: Math.max(a.thrust, b.thrust),
    slide: a.slide || b.slide,
    fire: a.fire || b.fire,
    burst: a.burst || b.burst,
    swap: a.swap || b.swap,
    confirm: a.confirm || b.confirm,
    pause: a.pause || b.pause,
    back: a.back || b.back,
    nav: {
      up: a.nav.up || b.nav.up,
      down: a.nav.down || b.nav.down,
      left: a.nav.left || b.nav.left,
      right: a.nav.right || b.nav.right,
    },
    typed: a.typed + b.typed,
  };
}
