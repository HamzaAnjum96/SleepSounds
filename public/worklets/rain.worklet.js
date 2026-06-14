// rain.worklet.js — event-based rainfall generator
//
// Rain is not a static hiss; the ear identifies it from many small arrivals
// over a quiet bed. This processor builds four coupled layers entirely off
// the main thread (per the procedural-rain literature: equalised-noise bed +
// chirped/modal/noisy drop atoms):
//
//   bed       a soft, airy filtered-noise curtain (far-field rainfall)
//   movement  slow density/brightness drift so the shower stays alive
//   events    three drop families — solid hits, leaf hits, water chirps —
//             scheduled as independent Poisson processes across near/mid/far
//   master    sub-bass trim + gentle soft-clip so overlapping drops never clip
//
// Controls (k-rate): intensity (rate + bed level), heaviness (drop weight +
// bed darkness), surface (hard↔soft: solid vs leaf vs water + resonance).

const SR = sampleRate;
const TWO_PI = Math.PI * 2;

// ── Biquad (RBJ cookbook), Direct Form I ──────────────────────────────
class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  bandpass(f, q) {
    const w = TWO_PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    const a0 = 1 + al;
    this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0;
    this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
  }
  highpass(f, q) {
    const w = TWO_PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    const a0 = 1 + al;
    this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = (1 + c) / 2 / a0;
    this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
  }
  lowpass(f, q) {
    const w = TWO_PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q);
    const a0 = 1 + al;
    this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = (1 - c) / 2 / a0;
    this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// A single raindrop voice: a short band-passed noise burst, an optional modal
// ring (solid drops) or descending chirp (water drops), enveloped and panned.
class Drop {
  constructor() {
    this.active = false;
    this.bp = new Biquad();
    this.env = 0; this.decay = 0; this.attack = 0; this.peak = 0; this.attacking = false;
    this.panL = 0.7; this.panR = 0.7;
    // modal ring (solid)
    this.ring = false; this.rPhase = 0; this.rInc = 0; this.rEnv = 0; this.rDecay = 0; this.rAmt = 0;
    // chirp (water)
    this.chirp = false; this.cPhase = 0; this.cFreq = 0; this.cTarget = 0; this.cGlide = 0;
    this.cEnv = 0; this.cDecay = 0; this.cAmt = 0;
  }
  trigger(opt) {
    this.bp.bandpass(opt.freq, opt.q);
    // reset filter memory so the burst starts clean
    this.bp.x1 = this.bp.x2 = this.bp.y1 = this.bp.y2 = 0;
    this.env = 0; this.attacking = true;
    this.attack = 1 / Math.max(1, opt.attackS * SR);
    this.decay = Math.exp(-1 / Math.max(1, opt.decayS * SR));
    this.peak = opt.peak;
    const p = opt.pan;
    this.panL = Math.cos((p + 1) * Math.PI / 4);
    this.panR = Math.sin((p + 1) * Math.PI / 4);

    this.ring = !!opt.ringFreq;
    if (this.ring) {
      this.rPhase = 0; this.rInc = TWO_PI * opt.ringFreq / SR;
      this.rEnv = opt.ringAmt; this.rDecay = Math.exp(-1 / Math.max(1, opt.ringDecayS * SR));
      this.rAmt = 1;
    }
    this.chirp = !!opt.chirpFrom;
    if (this.chirp) {
      this.cPhase = 0; this.cFreq = opt.chirpFrom; this.cTarget = opt.chirpTo;
      this.cGlide = Math.exp(-1 / Math.max(1, opt.chirpGlideS * SR));
      this.cEnv = opt.chirpAmt; this.cDecay = Math.exp(-1 / Math.max(1, opt.chirpDecayS * SR));
    }
    this.active = true;
  }
  // Returns mono sample; caller applies pan.
  sample(noise) {
    let v = this.bp.process(noise);
    if (this.attacking) {
      this.env += this.attack;
      if (this.env >= 1) { this.env = 1; this.attacking = false; }
    } else {
      this.env *= this.decay;
    }
    let out = v * this.env * this.peak;
    if (this.ring) {
      out += Math.sin(this.rPhase) * this.rEnv;
      this.rPhase += this.rInc; if (this.rPhase > TWO_PI) this.rPhase -= TWO_PI;
      this.rEnv *= this.rDecay;
    }
    if (this.chirp) {
      out += Math.sin(this.cPhase) * this.cEnv;
      this.cPhase += TWO_PI * this.cFreq / SR; if (this.cPhase > TWO_PI) this.cPhase -= TWO_PI;
      this.cFreq = this.cTarget + (this.cFreq - this.cTarget) * this.cGlide;
      this.cEnv *= this.cDecay;
    }
    if (!this.attacking && this.env < 0.0004 && this.rEnv < 0.0004 && this.cEnv < 0.0004) {
      this.active = false;
    }
    return out;
  }
}

class RainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'intensity', defaultValue: 0.65, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'heaviness', defaultValue: 0.50, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'surface',   defaultValue: 0.50, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // swell: depth of a very slow rise-and-fall in intensity (the shower
      // picking up, then easing). 0 = steady; mild by default.
      { name: 'swell',     defaultValue: 0.15, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'running',   defaultValue: 1,    minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.seed = 0x9e37 ^ 0x1234;
    // bed filters (independent L/R for width)
    this.bedHP_L = new Biquad(); this.bedHP_R = new Biquad();
    this.bedLP_L = new Biquad(); this.bedLP_R = new Biquad();
    this.bedHP_L.highpass(280, 0.6); this.bedHP_R.highpass(280, 0.6);
    this.bedLP_L.lowpass(11000, 0.5); this.bedLP_R.lowpass(11000, 0.5);
    // pink state (Paul Kellet economy) per channel
    this.pk = [new Float32Array(3), new Float32Array(3)];
    // master sub-trim
    this.masterHP_L = new Biquad(); this.masterHP_R = new Biquad();
    this.masterHP_L.highpass(42, 0.6); this.masterHP_R.highpass(42, 0.6);

    // voice pool
    this.voices = [];
    for (let i = 0; i < 80; i++) this.voices.push(new Drop());

    // schedulers (samples until next event) per lane
    this.nextNear = 0; this.nextMid = 0; this.nextFar = 0;

    // movement modulators
    this.lfoSlow = Math.random() * TWO_PI;
    this.lfoFast = Math.random() * TWO_PI;
    // very slow intensity swell (the shower waxing and waning); ~90s period
    this.swellPhase = Math.random() * TWO_PI;

    this.level = 0; // running fade
  }

  rnd() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  // exponential inter-arrival (Poisson) given rate in events/sec
  nextGap(rate) { return Math.max(1, Math.floor(-Math.log(Math.max(1e-6, this.rnd())) / Math.max(0.01, rate) * SR)); }

  pink(ch) {
    const s = this.pk[ch];
    const white = this.rnd() * 2 - 1;
    s[0] = 0.99765 * s[0] + white * 0.0990460;
    s[1] = 0.96300 * s[1] + white * 0.2965164;
    s[2] = 0.57000 * s[2] + white * 1.0526913;
    return (s[0] + s[1] + s[2] + white * 0.1848) * 0.18;
  }

  spawn(lane, intensity, heaviness, surface) {
    let v = null;
    for (let i = 0; i < this.voices.length; i++) if (!this.voices[i].active) { v = this.voices[i]; break; }
    if (!v) return;

    // Family mix. Solid taps dominate; leaves are common; water "plips" stay
    // rare — too many tonal events reads as artificial. Higher surface = softer.
    const r = this.rnd();
    let kind;
    if (r < 0.5 - surface * 0.3) kind = 'solid';
    else if (r < 0.9 - surface * 0.05) kind = 'leaf';
    else kind = 'water';

    // near drops are louder, lower (heavier), and wider; far drops quiet/narrow.
    const laneGain = lane === 0 ? 1.0 : lane === 1 ? 0.5 : 0.26;
    const lanePan = lane === 0 ? (this.rnd() * 2 - 1) * 0.92
      : lane === 1 ? (this.rnd() * 2 - 1) * 0.55
        : (this.rnd() * 2 - 1) * 0.28;
    const heavy = 0.6 + heaviness * 0.8;

    // Low Q throughout: a raindrop is a broadband *tick*, not a tuned beep.
    // High Q on a short noise burst rings tonally — the "laser" artefact.
    if (kind === 'solid') {
      const f = (1900 + this.rnd() * 2600) / heavy;
      this.takeAndTrigger(v, {
        freq: f, q: 1.1 + this.rnd() * 1.3,
        attackS: 0.0012, decayS: (0.006 + this.rnd() * 0.016) * heavy,
        peak: 0.06 * laneGain, pan: lanePan,
        // a faint, very short click only occasionally; never a sustained ping
        ringFreq: this.rnd() < 0.1 ? (900 + this.rnd() * 1400) / heavy : 0,
        ringAmt: 0.003 * laneGain, ringDecayS: 0.01 + this.rnd() * 0.015,
      });
    } else if (kind === 'leaf') {
      const f = (1200 + this.rnd() * 2200) / heavy;
      this.takeAndTrigger(v, {
        freq: f, q: 0.8 + this.rnd() * 1.2,
        attackS: 0.002, decayS: (0.012 + this.rnd() * 0.03) * heavy,
        peak: 0.04 * laneGain, pan: lanePan,
      });
    } else {
      // water plip: a low, soft noisy burst with a faint short resonance —
      // NO descending glide (that is what read as a sci-fi laser).
      const f = (650 + this.rnd() * 850) / heavy;
      this.takeAndTrigger(v, {
        freq: f, q: 1.4 + this.rnd() * 1.2,
        attackS: 0.002, decayS: (0.018 + this.rnd() * 0.035) * heavy,
        peak: 0.038 * laneGain, pan: lanePan,
        ringFreq: f * (1 + this.rnd() * 0.25),
        ringAmt: 0.005 * laneGain, ringDecayS: 0.015 + this.rnd() * 0.018,
      });
    }
  }

  takeAndTrigger(v, opt) { v.trigger(opt); }

  process(_inputs, outputs, params) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    const n = L.length;

    const intensity = params.intensity[0];
    const heaviness = params.heaviness[0];
    const surface = params.surface[0];
    const swell = params.swell[0];
    const running = params.running[0];

    // Silent + faded out: emit zeros cheaply.
    if (running < 0.5 && this.level < 0.0008) {
      L.fill(0); if (R !== L) R.fill(0);
      return true;
    }

    // Slow swell: advance once per block and fold into the working intensity,
    // so the drop rates and bed level breathe up and down together. Depth is
    // gentle even near full swell so it reads as weather, not a volume pump.
    this.swellPhase += (TWO_PI / (90 * SR)) * n;
    if (this.swellPhase > TWO_PI) this.swellPhase -= TWO_PI;
    const swellMod = 1 + swell * 0.85 * Math.sin(this.swellPhase);
    const effIntensity = Math.min(1, Math.max(0, intensity * swellMod));

    // lane rates (events/sec), scaled by the swelled intensity
    const k = 0.2 + effIntensity * 1.25;
    const nearRate = 6 * k, midRate = 26 * k, farRate = 78 * k;

    const lfoSlowInc = TWO_PI * 0.06 / SR;
    const lfoFastInc = TWO_PI * 0.5 / SR;
    const levelTarget = running > 0.5 ? 1 : 0;
    const levelCoef = Math.exp(-1 / (0.05 * SR)); // ~50ms fade

    for (let i = 0; i < n; i++) {
      // schedule events
      if (--this.nextNear <= 0) { this.spawn(0, intensity, heaviness, surface); this.nextNear = this.nextGap(nearRate); }
      if (--this.nextMid <= 0) { this.spawn(1, intensity, heaviness, surface); this.nextMid = this.nextGap(midRate); }
      if (--this.nextFar <= 0) { this.spawn(2, intensity, heaviness, surface); this.nextFar = this.nextGap(farRate); }

      // movement modulation
      this.lfoSlow += lfoSlowInc; if (this.lfoSlow > TWO_PI) this.lfoSlow -= TWO_PI;
      this.lfoFast += lfoFastInc; if (this.lfoFast > TWO_PI) this.lfoFast -= TWO_PI;
      const density = 0.82 + 0.18 * Math.sin(this.lfoSlow) + 0.05 * Math.sin(this.lfoFast);

      // bed
      const bedGain = (0.5 + effIntensity * 0.5) * (0.85 - heaviness * 0.15) * 0.4 * density;
      let bedL = this.bedLP_L.process(this.bedHP_L.process(this.pink(0))) * bedGain;
      let bedR = this.bedLP_R.process(this.bedHP_R.process(this.pink(1))) * bedGain;

      // events
      let evL = 0, evR = 0;
      const noise = this.rnd() * 2 - 1;
      for (let vIdx = 0; vIdx < this.voices.length; vIdx++) {
        const v = this.voices[vIdx];
        if (!v.active) continue;
        const s = v.sample(noise);
        evL += s * v.panL; evR += s * v.panR;
      }

      let sl = this.masterHP_L.process(bedL + evL);
      let sr = this.masterHP_R.process(bedR + evR);

      // running fade
      this.level = levelTarget + (this.level - levelTarget) * levelCoef;
      sl *= this.level; sr *= this.level;

      // soft clip
      L[i] = Math.tanh(sl * 1.05);
      if (R !== L) R[i] = Math.tanh(sr * 1.05);
    }
    return true;
  }
}

registerProcessor('rain-gen', RainProcessor);
