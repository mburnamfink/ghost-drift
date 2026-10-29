import type { FrameInput } from '../input/input';

export const INITIALS_LENGTH = 3;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Arcade initials entry. Typed letters fill slots in turn; on a pad, up and down cycle the
 * current slot's letter and left and right move between slots. Back clears the slot before the
 * cursor. Confirm (or right on the last slot) finishes.
 */
export class InitialsEntry {
  readonly letters: string[] = Array<string>(INITIALS_LENGTH).fill('A');
  cursor = 0;
  done = false;

  get initials(): string {
    return this.letters.join('');
  }

  apply(input: Pick<FrameInput, 'typed' | 'nav' | 'back' | 'confirm'>): void {
    if (this.done) return;
    for (const ch of input.typed) {
      this.letters[this.cursor] = ch;
      if (this.cursor < INITIALS_LENGTH - 1) this.cursor++;
    }
    const { nav } = input;
    if (nav.up || nav.down) {
      const i = ALPHABET.indexOf(this.letters[this.cursor]!);
      const step = nav.up ? 1 : -1;
      this.letters[this.cursor] = ALPHABET[(i + step + ALPHABET.length) % ALPHABET.length]!;
    }
    if (nav.left) this.cursor = Math.max(0, this.cursor - 1);
    if (input.back && this.cursor > 0) this.cursor--;
    if (input.confirm || (nav.right && this.cursor === INITIALS_LENGTH - 1)) {
      this.done = true;
      return;
    }
    if (nav.right) this.cursor = Math.min(INITIALS_LENGTH - 1, this.cursor + 1);
  }
}
