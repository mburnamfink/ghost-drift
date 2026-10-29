import { IDLE_INPUT, type FrameInput, type InputSource } from './input';
import { type PadState, choosePad, layoutFor, readTrigger } from './padLayout';

const STICK_DEADZONE = 0.15;
const TRIGGER_THRESHOLD = 0.2;

export class GamepadInput implements InputSource {
  private previous = new Set<number>();
  private touchedAxes = new Set<number>();
  private activeId: string | null = null;

  /** Description of the pad in use, or null. Browsers hide pads until a button is pressed on the page. */
  get description(): string | null {
    const pad = this.pad();
    return pad ? `${pad.id} · ${layoutFor(pad).name}` : null;
  }

  poll(): FrameInput {
    const pad = this.pad();
    if (!pad) {
      this.previous.clear();
      return IDLE_INPUT;
    }
    if (pad.id !== this.activeId) {
      this.activeId = pad.id;
      this.previous.clear();
      this.touchedAxes.clear();
    }
    const layout = layoutFor(pad);
    const down = new Set<number>();
    pad.buttons.forEach((b, i) => {
      if (b.pressed) down.add(i);
    });
    const tapped = (...ids: number[]) => ids.some((i) => down.has(i) && !this.previous.has(i));
    const held = (...ids: number[]) => ids.some((i) => down.has(i));
    this.previous = down;

    return {
      steer: deadzone(pad.axes[layout.steerAxis] ?? 0),
      thrust: readTrigger(pad, layout.thrust, this.touchedAxes),
      slide: readTrigger(pad, layout.slide, this.touchedAxes) > TRIGGER_THRESHOLD,
      fire: held(layout.rb, layout.x),
      burst: tapped(layout.a, layout.lb),
      confirm: tapped(layout.a, layout.menu),
      pause: tapped(layout.menu),
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
