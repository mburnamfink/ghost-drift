/** What the player is asking the Ship to do this step, independent of input device. */
export interface Controls {
  /** -1 (left) to 1 (right). */
  steer: number;
  /** 0 to 1. */
  thrust: number;
  slide: boolean;
  fire: boolean;
  /** True only on the step the button went down. */
  burst: boolean;
  /** Switch to the next weapon. True only on the step the button went down. */
  swap: boolean;
}

export const NO_CONTROLS: Controls = {
  steer: 0,
  thrust: 0,
  slide: false,
  fire: false,
  burst: false,
  swap: false,
};
