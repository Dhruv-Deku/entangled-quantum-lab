/**
 * Ambient music that follows the state: a soft pad where each basis state
 * with weight is a note of a pentatonic scale, as loud as its amplitude. A
 * superposition is a chord, a sure state a single held tone, and every gate
 * glides the chord to its next shape. Slow tremolo and a long echo keep it
 * calm. Pure Web Audio; silent until switched on.
 */

const SCALE = [0, 2, 4, 7, 9];
const BASE = 220;
const VOICES = 6;

const freqOf = (k: number) => BASE * Math.pow(2, (SCALE[k % 5] + 12 * Math.floor(k / 5)) / 12);

export class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: { osc: OscillatorNode; sub: OscillatorNode; gain: GainNode }[] = [];
  on = false;

  start(): void {
    if (this.on) return;
    try {
      this.ctx ??= new AudioContext();
      const a = this.ctx;
      if (a.state === 'suspended') void a.resume();
      this.master = a.createGain();
      this.master.gain.value = 0;
      this.master.gain.setTargetAtTime(0.07, a.currentTime, 1.5);
      // a long, soft echo
      const delay = a.createDelay(2);
      delay.delayTime.value = 0.42;
      const fb = a.createGain();
      fb.gain.value = 0.38;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      this.master.connect(lp);
      lp.connect(a.destination);
      lp.connect(delay);
      delay.connect(fb).connect(delay);
      delay.connect(a.destination);
      // a slow tremolo
      const lfo = a.createOscillator();
      lfo.frequency.value = 0.13;
      const depth = a.createGain();
      depth.gain.value = 0.02;
      lfo.connect(depth).connect(this.master.gain);
      lfo.start();
      for (let i = 0; i < VOICES; i++) {
        const osc = a.createOscillator(), sub = a.createOscillator(), gain = a.createGain();
        osc.type = 'sine';
        sub.type = 'triangle';
        sub.detune.value = 4;
        gain.gain.value = 0;
        osc.connect(gain);
        sub.connect(gain);
        gain.connect(this.master);
        osc.start();
        sub.start();
        this.voices.push({ osc, sub, gain });
      }
      this.on = true;
    } catch {
      this.on = false;
    }
  }

  stop(): void {
    if (!this.on || !this.ctx || !this.master) return;
    const a = this.ctx, m = this.master;
    m.gain.cancelScheduledValues(a.currentTime);
    m.gain.setTargetAtTime(0, a.currentTime, 0.4);
    const voices = this.voices;
    setTimeout(() => {
      for (const v of voices) {
        v.osc.stop();
        v.sub.stop();
      }
      m.disconnect();
    }, 2500);
    this.voices = [];
    this.on = false;
  }

  /** Glide the chord to these probabilities (one per basis state). */
  set(probs: ArrayLike<number>): void {
    if (!this.on || !this.ctx) return;
    const a = this.ctx;
    const top = Array.from(probs, (p, k) => ({ p, k })).filter((x) => x.p > 0.005).sort((x, y) => y.p - x.p).slice(0, VOICES);
    this.voices.forEach((v, i) => {
      const n = top[i];
      const f = n ? freqOf(n.k) : freqOf(0);
      v.osc.frequency.setTargetAtTime(f, a.currentTime, 0.25);
      v.sub.frequency.setTargetAtTime(f / 2, a.currentTime, 0.25);
      v.gain.gain.setTargetAtTime(n ? 0.5 * Math.sqrt(n.p) : 0, a.currentTime, 0.6);
    });
  }
}
