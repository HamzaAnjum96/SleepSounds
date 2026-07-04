// windyforest.worklet.js — wind-through-the-canopy generator
//
// "Forest" used to be a flat rustle. Per the procedural wind literature
// (Verron & Drettakis; Matsuyama et al.) the recognisable sound is air moving
// through trees: several band-limited wind bands whose level follows a slowly
// varying WIND SPEED, with leaf rustle emerging as a CHILD of the gust field
// (rustle swells with the whoosh, not independently), plus rare branch detail
// on stronger gusts. Wind leads; fauna would only decorate, so we keep none.
//
// Controls (k-rate): leaves (rustle density/level), twigs (branch creak +
// whistle detail), breeze (mean wind speed + gustiness).

const SR = sampleRate;
const TWO_PI = Math.PI * 2;

class Biquad {
  constructor() { this.b0 = 1; this.b1 = 0; this.b2 = 0; this.a1 = 0; this.a2 = 0;
    this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  bandpass(f, q) { const w = TWO_PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
    this.b0 = al / a0; this.b1 = 0; this.b2 = -al / a0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0; }
  highpass(f, q) { const w = TWO_PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
    this.b0 = (1 + c) / 2 / a0; this.b1 = -(1 + c) / a0; this.b2 = (1 + c) / 2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0; }
  lowpass(f, q) { const w = TWO_PI * f / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), a0 = 1 + al;
    this.b0 = (1 - c) / 2 / a0; this.b1 = (1 - c) / a0; this.b2 = (1 - c) / 2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - al) / a0; }
  process(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

// Short band-passed noise grain (leaf rustle, branch creak, whistle).
class Grain {
  constructor() { this.active = false; this.bp = new Biquad();
    this.env = 0; this.decay = 0; this.attacking = false; this.attack = 0; this.peak = 0;
    this.panL = 0.7; this.panR = 0.7; }
  trigger(f, q, peak, attackS, decayS, pan) {
    this.bp.bandpass(f, q); this.bp.x1 = this.bp.x2 = this.bp.y1 = this.bp.y2 = 0;
    this.env = 0; this.attacking = true; this.attack = 1 / Math.max(1, attackS * SR);
    this.decay = Math.exp(-1 / Math.max(1, decayS * SR)); this.peak = peak;
    this.panL = Math.cos((pan + 1) * Math.PI / 4); this.panR = Math.sin((pan + 1) * Math.PI / 4);
    this.active = true;
  }
  sample(noise) {
    let v = this.bp.process(noise);
    if (this.attacking) { this.env += this.attack; if (this.env >= 1) { this.env = 1; this.attacking = false; } }
    else { this.env *= this.decay; }
    if (!this.attacking && this.env < 0.0004) this.active = false;
    return v * this.env * this.peak;
  }
}

class WindyForestProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'leaves', defaultValue: 0.70, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'twigs',  defaultValue: 0.35, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'breeze', defaultValue: 0.50, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'running', defaultValue: 1,   minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.seed = 0x1f0e ^ 0xa5a5;
    // four wind bands (body, mid foliage, upper foliage, whistle) per channel.
    const centres = [180, 450, 950, 2200];
    const qs = [0.6, 0.8, 1.0, 3.0];        // whistle band Q eased 4.0 → 3.0
    this.bandGain = [1.05, 0.8, 0.45, 0.3]; // body leads, mids/whistle recede
    this.bandsL = centres.map((f, i) => { const b = new Biquad(); b.bandpass(f, qs[i]); return b; });
    this.bandsR = centres.map((f, i) => { const b = new Biquad(); b.bandpass(f, qs[i]); return b; });

    this.masterHP_L = new Biquad(); this.masterHP_R = new Biquad();
    this.masterHP_L.highpass(30, 0.6); this.masterHP_R.highpass(30, 0.6);
    // A gentle master lowpass tames the top-end sizzle that made the forest
    // read as harsh — the canopy is soft, not bright.
    this.masterLP_L = new Biquad(); this.masterLP_R = new Biquad();
    this.masterLP_L.lowpass(3400, 0.5); this.masterLP_R.lowpass(3400, 0.5);

    this.grains = []; for (let i = 0; i < 96; i++) this.grains.push(new Grain());

    // wind-speed processes (multi-timescale). Start in a *lull*: wsSlow well
    // under the mean (the slow OU climbs it over a few seconds, so the wind
    // arrives instead of slamming in), and wsSmooth above it so the gust
    // detector (ws − wsSmooth) stays quiet until real gusts develop.
    this.wsSlow = 0.15; this.wsMicro = 0; this.wsSmooth = 0.55;
    this.nextLeaf = 0; this.nextBranch = Math.floor(6 * SR);
    this.level = 0;
  }

  rnd() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
  randn() { const u = Math.max(1e-9, this.rnd()), v = this.rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO_PI * v); }
  nextGap(rate) { return Math.max(1, Math.floor(-Math.log(Math.max(1e-6, this.rnd())) / Math.max(0.01, rate) * SR)); }

  freeGrain() { for (let i = 0; i < this.grains.length; i++) if (!this.grains[i].active) return this.grains[i]; return null; }

  spawnLeaf(ws, gust, leaves) {
    const g = this.freeGrain(); if (!g) return;
    // Leaf rustle sits ~900–3200 Hz, not 1500–6000: the old top octave was the
    // harsh, hissy edge. A little softer per grain too.
    const f = 700 + this.rnd() * 1900;
    const pan = (this.rnd() * 2 - 1) * (0.4 + gust * 0.5);
    const peak = (0.010 + (ws * 0.4 + gust * 0.8) * 0.04) * (0.4 + leaves);
    g.trigger(f, 2 + this.rnd() * 4, peak, 0.004, 0.014 + this.rnd() * 0.05, pan);
  }

  spawnBranch(ws, twigs) {
    const g = this.freeGrain(); if (!g) return;
    const pan = (this.rnd() * 2 - 1) * 0.6;
    if (this.rnd() < 0.5 + ws * 0.3) {
      // low creak
      g.trigger(120 + this.rnd() * 380, 5 + this.rnd() * 5, 0.05 * twigs * (0.5 + ws), 0.02, 0.15 + this.rnd() * 0.5, pan);
    } else {
      // aeroacoustic whistle (stronger gusts)
      g.trigger(1500 + this.rnd() * 2000, 8 + this.rnd() * 6, 0.03 * twigs * ws, 0.05, 0.2 + this.rnd() * 0.4, pan);
    }
  }

  process(_inputs, outputs, params) {
    const out = outputs[0]; const L = out[0], R = out[1] || out[0]; const n = L.length;
    const leaves = params.leaves[0];
    const twigs = params.twigs[0];
    const breeze = params.breeze[0];
    const running = params.running[0];

    if (running < 0.5 && this.level < 0.0008) { L.fill(0); if (R !== L) R.fill(0); return true; }

    const mean = 0.25 + breeze * 0.6;
    const thetaSlow = 1 / (8 * SR);   // ~8s
    const thetaMicro = 1 / (0.7 * SR); // ~0.7s
    // OU noise scaled so stationary std stays controlled (std = sigma/sqrt(2·theta)).
    const sigmaSlow = Math.sqrt(2 * thetaSlow) * 0.13;   // slow trend std ≈ 0.13
    const sigmaMicro = Math.sqrt(2 * thetaMicro) * 0.22; // turbulence std ≈ 0.22
    const levelTarget = running > 0.5 ? 1 : 0;
    const levelCoef = Math.exp(-1 / (0.5 * SR)); // ~0.5s gate — was 80ms, an abrupt entrance

    for (let i = 0; i < n; i++) {
      // wind speed: slow OU around the mean + faster micro turbulence
      this.wsSlow += thetaSlow * (mean - this.wsSlow) + sigmaSlow * this.randn();
      this.wsMicro += thetaMicro * (0 - this.wsMicro) + sigmaMicro * this.randn();
      let ws = this.wsSlow + this.wsMicro * (0.25 + breeze * 0.4);
      if (ws < 0.02) ws = 0.02; if (ws > 1.3) ws = 1.3;
      // gust = how much faster than the ~1s running average (the "whoosh")
      this.wsSmooth += (ws - this.wsSmooth) * 0.00002;
      const gust = Math.max(0, ws - this.wsSmooth);

      // leaf rustle as a child of the gust field
      if (--this.nextLeaf <= 0) {
        // Rustle is gust-carried: a low base rate so lulls genuinely rest,
        // with the density living in the gust term — waves of rustle, not a
        // constant static-like spray.
        const rate = (3 + gust * 240 + ws * 12) * (0.3 + leaves);
        this.spawnLeaf(ws, gust, leaves);
        this.nextLeaf = this.nextGap(rate);
      }
      // branch detail: rare, mostly on stronger gusts
      if (--this.nextBranch <= 0) {
        const rate = (0.05 + ws * ws * 0.5 + gust * 1.5) * (0.2 + twigs);
        if (twigs > 0.02) this.spawnBranch(ws, twigs);
        this.nextBranch = this.nextGap(Math.max(0.03, rate));
      }

      // wind bands (independent noise L/R for width)
      const nL = this.rnd() * 2 - 1, nR = this.rnd() * 2 - 1;
      let bedL = 0, bedR = 0;
      for (let b = 0; b < 4; b++) {
        // whistle band only really speaks on strong wind
        const speak = b === 3 ? Math.max(0, ws - 0.55) * 1.6 : ws;
        const g = this.bandGain[b] * speak;
        bedL += this.bandsL[b].process(nL) * g;
        bedR += this.bandsR[b].process(nR) * g;
      }
      bedL *= 0.5; bedR *= 0.5;

      // grains
      const noise = this.rnd() * 2 - 1;
      let gL = 0, gR = 0;
      for (let j = 0; j < this.grains.length; j++) {
        const gr = this.grains[j]; if (!gr.active) continue;
        const s = gr.sample(noise); gL += s * gr.panL; gR += s * gr.panR;
      }

      let sl = this.masterLP_L.process(this.masterHP_L.process(bedL + gL));
      let sr = this.masterLP_R.process(this.masterHP_R.process(bedR + gR));

      this.level = levelTarget + (this.level - levelTarget) * levelCoef;
      sl *= this.level; sr *= this.level;

      L[i] = Math.tanh(sl * 1.1);
      if (R !== L) R[i] = Math.tanh(sr * 1.1);
    }
    return true;
  }
}

registerProcessor('windyforest-gen', WindyForestProcessor);
