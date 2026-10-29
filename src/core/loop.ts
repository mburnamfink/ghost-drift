/**
 * Fixed-timestep accumulator: converts variable frame times into whole simulation steps so the
 * simulation behaves identically at any display refresh rate (ADR-0002).
 */
export class FixedStep {
  private accumulator = 0;

  constructor(
    readonly dt: number,
    private readonly maxFrameTime: number,
  ) {}

  /** Runs `step` zero or more times for `frameTime` seconds of real time. */
  advance(frameTime: number, step: (dt: number, first: boolean) => void): void {
    this.accumulator += Math.min(frameTime, this.maxFrameTime);
    let first = true;
    while (this.accumulator >= this.dt) {
      step(this.dt, first);
      first = false;
      this.accumulator -= this.dt;
    }
  }

  reset(): void {
    this.accumulator = 0;
  }
}
