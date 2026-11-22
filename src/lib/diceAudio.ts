// Procedural Web Audio API tabletop dice foley engine
// Synthesizes distinct felt thumps, walnut rail knocks, and crisp acrylic die-on-die clacks
// with stereo panning, master dynamics compression, and zero per-impact buffer allocation.

export type ImpactSurface = "felt" | "wood" | "die";

class DiceAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private whiteNoiseBuffer: AudioBuffer | null = null;
  private softNoiseBuffer: AudioBuffer | null = null;
  private muted = false;

  private lastSurfaceTime: Record<ImpactSurface, number> = {
    felt: 0,
    wood: 0,
    die: 0,
  };
  private recentVoiceTimestamps: number[] = [];

  public setMuted(muted: boolean) {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        const ctx = new AudioCtx();
        this.ctx = ctx;

        // Warm master bus with gentle glue compression so 8d6 cascades never clip or sound harsh
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.knee.value = 18;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.002;
        compressor.release.value = 0.09;

        const warmth = ctx.createBiquadFilter();
        warmth.type = "lowshelf";
        warmth.frequency.value = 240;
        warmth.gain.value = 2.5;

        const master = ctx.createGain();
        master.gain.value = 0.92;

        compressor.connect(warmth);
        warmth.connect(master);
        master.connect(ctx.destination);

        this.compressor = compressor;
        this.masterGain = master;
        this.buildNoiseBuffers(ctx);
      } catch {
        return null;
      }
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private buildNoiseBuffers(ctx: AudioContext) {
    // 1. Short crisp impulse burst (35ms) for sharp transients
    const crispLen = Math.floor(ctx.sampleRate * 0.035);
    const crispBuf = ctx.createBuffer(1, crispLen, ctx.sampleRate);
    const crispData = crispBuf.getChannelData(0);
    for (let i = 0; i < crispLen; i++) {
      const env = Math.pow(1 - i / crispLen, 2.4);
      crispData[i] = (Math.random() * 2 - 1) * env;
    }
    this.whiteNoiseBuffer = crispBuf;

    // 2. Longer brushed/pink-ish noise (120ms) for felt thuds, pickups, and tosses
    const softLen = Math.floor(ctx.sampleRate * 0.12);
    const softBuf = ctx.createBuffer(1, softLen, ctx.sampleRate);
    const softData = softBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < softLen; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      const pink = (b0 + b1 + b2 + white * 0.18) * 1.4;
      const env = Math.pow(1 - i / softLen, 1.5);
      softData[i] = Math.max(-1, Math.min(1, pink * env));
    }
    this.softNoiseBuffer = softBuf;
  }

  private connectToBus(ctx: AudioContext, node: AudioNode, pan = 0) {
    const dest = this.compressor || this.masterGain || ctx.destination;
    if (typeof ctx.createStereoPanner === "function" && Math.abs(pan) > 0.02) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.7, Math.min(0.7, pan));
      node.connect(panner);
      panner.connect(dest);
    } else {
      node.connect(dest);
    }
  }

  public unlock() {
    this.ensureContext();
  }

  /**
   * Subtle soft felt lift & finger tap when picking up a die.
   */
  public playPickup(pan = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.softNoiseBuffer) return;

    const t = ctx.currentTime;

    // Soft brushed felt lift
    const src = ctx.createBufferSource();
    src.buffer = this.softNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(520, t);
    filter.frequency.exponentialRampToValueAtTime(920, t + 0.055);
    filter.Q.value = 1.1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.055, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.065);

    src.connect(filter);
    filter.connect(gain);
    this.connectToBus(ctx, gain, pan);
    src.start(t);
    src.stop(t + 0.07);
  }

  /**
   * Subtle airy hand-toss cue scaled gently by number of dice thrown.
   */
  public playThrow(diceCount: number, pan = 0) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.softNoiseBuffer) return;

    const t = ctx.currentTime;
    const weight = Math.min(1, 0.35 + diceCount * 0.08);

    const src = ctx.createBufferSource();
    src.buffer = this.softNoiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(340, t);
    filter.frequency.exponentialRampToValueAtTime(760, t + 0.07);
    filter.Q.value = 0.85;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.06 * weight, t + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);

    src.connect(filter);
    filter.connect(gain);
    this.connectToBus(ctx, gain, pan);
    src.start(t);
    src.stop(t + 0.105);
  }

  /**
   * Velocity-scaled, physically differentiated tabletop impact sound.
   * pan: -1 (left rail) to +1 (right rail).
   */
  public playImpact(
    speed: number,
    surface: ImpactSurface = "felt",
    pan = 0
  ) {
    if (this.muted) return;
    const minSpeed = surface === "die" ? 0.55 : surface === "wood" ? 0.65 : 0.72;
    if (speed < minSpeed) return;

    const nowMs = performance.now();
    const minGap = surface === "die" ? 18 : surface === "wood" ? 28 : 26;
    if (nowMs - this.lastSurfaceTime[surface] < minGap) return;

    // Soft polyphony limiter: max 8 impacts in any 100ms window so big handfuls stay clean
    this.recentVoiceTimestamps = this.recentVoiceTimestamps.filter(
      (ts) => nowMs - ts < 100
    );
    if (this.recentVoiceTimestamps.length >= 8) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    this.lastSurfaceTime[surface] = nowMs;
    this.recentVoiceTimestamps.push(nowMs);

    const t = ctx.currentTime;
    // Non-linear velocity curve so light rolls are soft and hard throws punch cleanly
    const norm = Math.min(1, Math.max(0, (speed - minSpeed) / 11));
    const intensity = Math.pow(norm, 0.78);
    const jitter = 0.92 + Math.random() * 0.16;

    if (surface === "felt") {
      this.triggerFeltThump(ctx, t, intensity, jitter, pan);
    } else if (surface === "wood") {
      this.triggerWoodKnock(ctx, t, intensity, jitter, pan);
    } else {
      this.triggerDieClack(ctx, t, intensity, jitter, pan);
    }
  }

  /**
   * Muffled, warm resin-on-baize-over-wood thud.
   */
  private triggerFeltThump(
    ctx: AudioContext,
    t: number,
    intensity: number,
    jitter: number,
    pan: number
  ) {
    // 1. Warm tabletop sub-body resonance (wood tray underneath felt)
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const startFreq = (142 + Math.random() * 34) * jitter;
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(startFreq * 0.48, t + 0.042);

    const bodyVol = (0.04 + 0.15 * intensity);
    oscGain.gain.setValueAtTime(0.0001, t);
    oscGain.gain.linearRampToValueAtTime(bodyVol, t + 0.003);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.052);

    osc.connect(oscGain);
    this.connectToBus(ctx, oscGain, pan);
    osc.start(t);
    osc.stop(t + 0.058);

    // 2. Soft low-passed baize impact pat (no harsh high click)
    if (this.softNoiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.softNoiseBuffer;

      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 480 + intensity * 420;
      lpf.Q.value = 0.7;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, t);
      nGain.gain.linearRampToValueAtTime(0.03 + 0.095 * intensity, t + 0.0025);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.036);

      noise.connect(lpf);
      lpf.connect(nGain);
      this.connectToBus(ctx, nGain, pan);
      noise.start(t);
      noise.stop(t + 0.042);
    }
  }

  /**
   * Solid walnut hardwood rail knock with dual wooden modal resonances.
   */
  private triggerWoodKnock(
    ctx: AudioContext,
    t: number,
    intensity: number,
    jitter: number,
    pan: number
  ) {
    // 1. Primary walnut rail resonance (~390Hz) + secondary harmonic (~860Hz)
    const freqs = [385 * jitter, 870 * jitter];
    const gains = [0.125 * (0.25 + 0.75 * intensity), 0.055 * intensity];
    const decays = [0.042, 0.024];

    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 0 ? "sine" : "triangle";
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 0.78, t + decays[idx]);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gains[idx], t + 0.0018);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decays[idx]);

      osc.connect(g);
      this.connectToBus(ctx, g, pan);
      osc.start(t);
      osc.stop(t + decays[idx] + 0.006);
    });

    // 2. Woody knock transient
    if (this.whiteNoiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;

      const bpf = ctx.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.value = (1050 + intensity * 450) * jitter;
      bpf.Q.value = 1.8;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, t);
      nGain.gain.linearRampToValueAtTime(0.04 + 0.1 * intensity, t + 0.0015);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);

      noise.connect(bpf);
      bpf.connect(nGain);
      this.connectToBus(ctx, nGain, pan);
      noise.start(t);
      noise.stop(t + 0.028);
    }
  }

  /**
   * Crisp, ultra-short acrylic/resin polyhedral die-on-die clack.
   */
  private triggerDieClack(
    ctx: AudioContext,
    t: number,
    intensity: number,
    jitter: number,
    pan: number
  ) {
    // Two tight inharmonic resin partials (very short decay = realistic plastic/resin click, not beep)
    const p1 = (2180 + Math.random() * 420) * jitter;
    const p2 = p1 * (1.58 + Math.random() * 0.14);

    [
      { freq: p1, vol: 0.085 * (0.3 + 0.7 * intensity), dur: 0.016 },
      { freq: p2, vol: 0.045 * intensity, dur: 0.011 },
    ].forEach(({ freq, vol, dur }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.84, t + dur);

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

      osc.connect(g);
      this.connectToBus(ctx, g, pan);
      osc.start(t);
      osc.stop(t + dur + 0.004);
    });

    // Tight bright acrylic impulse snap
    if (this.whiteNoiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.whiteNoiseBuffer;

      const bpf = ctx.createBiquadFilter();
      bpf.type = "bandpass";
      bpf.frequency.value = (3400 + Math.random() * 700) * jitter;
      bpf.Q.value = 2.6;

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.0001, t);
      nGain.gain.linearRampToValueAtTime(0.045 + 0.11 * intensity, t + 0.001);
      nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.014);

      noise.connect(bpf);
      bpf.connect(nGain);
      this.connectToBus(ctx, nGain, pan);
      noise.start(t);
      noise.stop(t + 0.018);
    }
  }

  /**
   * Subtle, warm brass chime when landing a Natural 20.
   */
  public playNat20Chime() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notes = [587.33, 880.0]; // D5 -> A5 warm open fifth
    notes.forEach((freq, idx) => {
      const start = t + idx * 0.055;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);

      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.042, start + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.34);

      osc.connect(g);
      this.connectToBus(ctx, g, 0);
      osc.start(start);
      osc.stop(start + 0.36);
    });
  }
}

export const diceAudio = new DiceAudioEngine();
