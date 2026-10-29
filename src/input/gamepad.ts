import { IDLE_INPUT, type FrameInput, type InputSource } from './input';
import { PAD, type PadState, choosePad } from './padLayout';

const STICK_DEADZONE = 0.15;
const TRIGGER_THRESHOLD = 0.2;

type PadList = () => readonly (PadState | null)[];

const browserPads: PadList = () => navigator.getGamepads?.() ?? [];

export class GamepadInput implements InputSource {
  private previous = new Set<number>();

  constructor(private readonly pads: PadList = browserPads) {}

  /** Name of the pad in use, or null. Browsers hide pads until a button is pressed on the page. */
  get description(): string | null {
    return choosePad(this.pads())?.id ?? null;
  }

  poll(): FrameInput {
    const pad = choosePad(this.pads());
    if (!pad) {
      this.previous.clear();
      return IDLE_INPUT;
    }
    const value = (i: number) => pad.buttons[i]?.value ?? 0;
    const down = new Set<number>();
    pad.buttons.forEach((b, i) => {
      if (b.pressed) down.add(i);
    });
    const previous = this.previous;
    this.previous = down;
    const tapped = (...ids: number[]) => ids.some((i) => down.has(i) && !previous.has(i));
    const held = (...ids: number[]) => ids.some((i) => down.has(i));

    return {
      steer: deadzone(pad.axes[PAD.steerAxis] ?? 0),
      thrust: value(PAD.rt),
      slide: value(PAD.lt) > TRIGGER_THRESHOLD,
      fire: held(PAD.rb, PAD.x),
      burst: tapped(PAD.a, PAD.lb),
      swap: tapped(PAD.y),
      confirm: tapped(PAD.a, PAD.menu),
      pause: tapped(PAD.menu),
      back: tapped(PAD.b),
    };
  }
}

function deadzone(v: number): number {
  const mag = Math.abs(v);
  return mag < STICK_DEADZONE ? 0 : (Math.sign(v) * (mag - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}
