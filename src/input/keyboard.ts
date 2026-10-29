import type { FrameInput, InputSource } from './input';

const BINDINGS = {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  thrust: ['KeyW', 'ArrowUp'],
  slide: ['ShiftLeft', 'ShiftRight'],
  fire: ['Space'],
  burst: ['KeyE'],
  swap: ['KeyQ'],
  confirm: ['Enter'],
  pause: ['Escape'],
  back: ['Backspace'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  navLeft: ['ArrowLeft'],
  navRight: ['ArrowRight'],
} as const;

const BOUND = new Set<string>(Object.values(BINDINGS).flat());

export class KeyboardInput implements InputSource {
  private readonly held = new Set<string>();
  /** Keys pressed since the last poll, so taps shorter than a frame still register. */
  private readonly pressed = new Set<string>();

  /** Letters typed since the last poll, for entering initials. */
  private typed = '';

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (!e.repeat && /^Key[A-Z]$/.test(e.code)) this.typed += e.code.slice(3);
      if (!BOUND.has(e.code)) return;
      e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.held.delete(e.code));
    target.addEventListener('blur', () => this.held.clear());
  }

  poll(): FrameInput {
    const held = (codes: readonly string[]) => codes.some((c) => this.held.has(c));
    const tapped = (codes: readonly string[]) => codes.some((c) => this.pressed.has(c));
    const input: FrameInput = {
      steer: (held(BINDINGS.right) ? 1 : 0) - (held(BINDINGS.left) ? 1 : 0),
      thrust: held(BINDINGS.thrust) ? 1 : 0,
      slide: held(BINDINGS.slide),
      fire: held(BINDINGS.fire),
      burst: tapped(BINDINGS.burst),
      swap: tapped(BINDINGS.swap),
      confirm: tapped(BINDINGS.confirm),
      pause: tapped(BINDINGS.pause),
      back: tapped(BINDINGS.back),
      nav: {
        up: tapped(BINDINGS.up),
        down: tapped(BINDINGS.down),
        left: tapped(BINDINGS.navLeft),
        right: tapped(BINDINGS.navRight),
      },
      typed: this.typed,
    };
    this.pressed.clear();
    this.typed = '';
    return input;
  }
}
