import type { Vec2 } from '../core/vec2';
import type { SimEvent } from '../sim/world';

/** Beyond this distance from the Ship a sound is silent. */
const HEARING = 110;

/**
 * Sound effects, synthesized with Web Audio so there are no assets to load. Browsers keep audio
 * suspended until a key or pointer press on the page; gamepad presses do not count, so a
 * pad-only player hears nothing until they touch the keyboard or mouse once.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor() {
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('keydown', unlock);
    window.addEventListener('pointerdown', unlock);
  }

  handleEvents(events: readonly SimEvent[], listener: Vec2): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const near = (pos: Vec2) =>
      Math.max(0, 1 - Math.hypot(pos.x - listener.x, pos.y - listener.y) / HEARING);
    for (const e of events) {
      switch (e.type) {
        case 'boltFired':
          this.cannon(e.volley, e.side * 0.2);
          break;
        case 'boltStruck':
          this.strike(near(e.pos));
          break;
        case 'hunterDestroyed':
          this.boom(near(e.pos) * (e.kind === 'juggernaut' ? 1.4 : 0.8), e.kind === 'juggernaut');
          break;
        case 'shipDestroyed':
          this.boom(1.6, true);
          break;
        default:
          break;
      }
    }
  }

  private ensure(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    // Rapid fire and stacked explosions would otherwise clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 8;
    master.connect(limiter).connect(ctx.destination);
    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.out = master;
    this.noise = noise;
  }

  /** A heavy gun: a low thump with a sharp crack on top and a short mechanical tail. */
  private cannon(volley: boolean, pan: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.out!);
    const pitch = 1 + (Math.random() - 0.5) * 0.1;
    const level = volley ? 1 : 0.8;

    const thump = ctx.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(150 * pitch, t);
    thump.frequency.exponentialRampToValueAtTime(42 * pitch, t + 0.14);
    thump.connect(envelope(ctx, t, 0.9 * level, 0.002, 0.2)).connect(panner);
    thump.start(t);
    thump.stop(t + 0.25);

    const crack = this.noiseSource(t, 0.08);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(2600 * pitch, t);
    band.frequency.exponentialRampToValueAtTime(700, t + 0.07);
    band.Q.value = 0.8;
    crack
      .connect(band)
      .connect(envelope(ctx, t, 0.55 * level, 0.001, 0.07))
      .connect(panner);

    const tail = this.noiseSource(t + 0.02, 0.22);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 500;
    tail
      .connect(low)
      .connect(envelope(ctx, t + 0.02, 0.3 * level, 0.005, 0.2))
      .connect(panner);
  }

  /** A Bolt slapping into a Block. */
  private strike(level: number): void {
    if (level <= 0) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = this.noiseSource(t, 0.1);
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1200;
    src
      .connect(high)
      .connect(envelope(ctx, t, 0.35 * level, 0.001, 0.08))
      .connect(this.out!);
  }

  /** A rolling explosion; `heavy` lowers and lengthens it. */
  private boom(level: number, heavy: boolean): void {
    if (level <= 0) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const length = heavy ? 1.2 : 0.5;
    const src = this.noiseSource(t, length);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.setValueAtTime(heavy ? 1400 : 2000, t);
    low.frequency.exponentialRampToValueAtTime(heavy ? 120 : 250, t + length);
    src
      .connect(low)
      .connect(envelope(ctx, t, 0.7 * level, 0.003, length))
      .connect(this.out!);

    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(heavy ? 90 : 120, t);
    sub.frequency.exponentialRampToValueAtTime(heavy ? 28 : 45, t + length * 0.7);
    sub.connect(envelope(ctx, t, 0.8 * level, 0.003, length * 0.7)).connect(this.out!);
    sub.start(t);
    sub.stop(t + length);
  }

  private noiseSource(at: number, seconds: number): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.start(at, Math.random() * 0.5, seconds);
    return src;
  }
}

/** A gain that attacks to `peak` and decays away over `decay` seconds. */
function envelope(
  ctx: AudioContext,
  at: number,
  peak: number,
  attack: number,
  decay: number,
): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  return g;
}
