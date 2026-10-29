import { IDLE_INPUT, type FrameInput, type InputSource } from './input';
import { PAD, type PadState, choosePad } from './padLayout';

const STICK_DEADZONE = 0.15;
const TRIGGER_THRESHOLD = 0.2;

export class GamepadInput implements InputSource {
  private previous = new Set<number>();

  /** Name of the pad in use, or null. Browsers hide pads until a button is pressed on the page. */
  get description(): string | null {
    return this.pad()?.id ?? null;
  }

  poll(): FrameInput {
    const pad = this.pad();
    if (!pad) {
      this.previous.clear();
      return IDLE_INPUT;
    }
    const value = (i: number) => pad.buttons[i]?.value ?? 0;
    const down = new Set<number>();
    pad.buttons.forEach((b, i) => {
      if (b.pressed) down.add(i);
    });
    const tapped = (...ids: number[]) => ids.some((i) => down.has(i) && !this.previous.has(i));
    const held = (...ids: number[]) => ids.some((i) => down.has(i));
    this.previous = down;

    return {
      steer: deadzone(pad.axes[PAD.steerAxis] ?? 0),
      thrust: value(PAD.rt),
      slide: value(PAD.lt) > TRIGGER_THRESHOLD,
      fire: held(PAD.rb, PAD.x),
      burst: tapped(PAD.a, PAD.lb),
      confirm: tapped(PAD.a, PAD.menu),
      pause: tapped(PAD.menu),
    };
  }

  private pad(): PadState | null {
    return choosePad(navigator.getGamepads?.() ?? []);
  }
}

function deadzone(v: number): number {
  const mag = Math.abs(v);
  return mag < STICK_DEADZONE ? 0 : (Math.sign(v) * (mag - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}
