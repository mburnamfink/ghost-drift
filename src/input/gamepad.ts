import { IDLE_INPUT, type FrameInput, type InputSource } from './input';

/** Indices in the W3C "standard" gamepad mapping, which Chrome and Firefox use for Xbox pads. */
const BUTTON = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9 } as const;
const AXIS = { LEFT_X: 0 } as const;
const STICK_DEADZONE = 0.15;
const TRIGGER_THRESHOLD = 0.2;

export class GamepadInput implements InputSource {
  private previous = new Set<number>();

  /** Whether any controller is visible. Browsers hide pads until a button is pressed on the page. */
  get connected(): boolean {
    return this.pad() !== null;
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
      steer: deadzone(pad.axes[AXIS.LEFT_X] ?? 0),
      thrust: value(BUTTON.RT),
      slide: value(BUTTON.LT) > TRIGGER_THRESHOLD,
      fire: held(BUTTON.RB, BUTTON.X),
      burst: tapped(BUTTON.A, BUTTON.LB),
      confirm: tapped(BUTTON.A, BUTTON.MENU),
      pause: tapped(BUTTON.MENU),
    };
  }

  private pad(): Gamepad | null {
    for (const p of navigator.getGamepads?.() ?? []) {
      if (p?.connected && p.mapping === 'standard') return p;
    }
    return null;
  }
}

function deadzone(v: number): number {
  const mag = Math.abs(v);
  return mag < STICK_DEADZONE ? 0 : (Math.sign(v) * (mag - STICK_DEADZONE)) / (1 - STICK_DEADZONE);
}
