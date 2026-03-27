class FireSynthProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // ── Core behaviour ────────────────────────────────────────────────
      { name: 'intensity',    defaultValue: 0.39,    minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'dryness',     defaultValue: 0.47,    minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'wind',        defaultValue: 0.5,     minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'size',        defaultValue: 1.0,     minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'distance',    defaultValue: 0.54,    minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'crackleBias', defaultValue: 1.0,     minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'running',     defaultValue: 1,       minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      // ── Roar / thunder background ─────────────────────────────────────
      { name: 'bodyVol',     defaultValue: 1.4,     minValue: 0,       maxValue: 2,      automationRate: 'k-rate' },
      { name: 'bodyLp',      defaultValue: 0.007,   minValue: 0.001,   maxValue: 0.05,   automationRate: 'k-rate' },
      { name: 'roarMean',    defaultValue: 0.81,    minValue: 0,       maxValue: 1,      automationRate: 'k-rate' },
      { name: 'roarSpeed',   defaultValue: 0.00005, minValue: 0.000005,maxValue: 0.0002, automationRate: 'k-rate' },
      { name: 'roarSigma',   defaultValue: 0.0015,  minValue: 0,       maxValue: 0.005,  automationRate: 'k-rate' },
      // ── Mix levels ───────────────────────────────────────────────────
      { name: 'crackleBase', defaultValue: 13.5,    minValue: 0,       maxValue: 15,     automationRate: 'k-rate' },
      { name: 'crackleVol',  defaultValue: 5.4,     minValue: 0,       maxValue: 6,      automationRate: 'k-rate' },
      { name: 'popVol',      defaultValue: 1.35,    minValue: 0,       maxValue: 3,      automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.energy = 0.54;      // ≈ OU mean for intensity 0.39
    this.turbulence = 0.6;   // ≈ OU mean for wind 0.5
    this.stress = 0.58;      // ≈ OU mean for dryness 0.47
    this.embers = 0.34;      // ≈ OU mean for intensity 0.39

    this.lpBody = 0;
    this.hpBody = 0;
    this.roarEnv = 0.81;     // start at roarMean

    this.crackleEvents = [];
    this.popEvents = [];

    this.prevL = 0;
    this.prevR = 0;

    this.randState = 22222;
  }

  rnd() {
    this.randState = (1664525 * this.randState + 1013904223) >>> 0;
    return this.randState / 4294967296;
  }

  randn() {
    const u = Math.max(1e-9, this.rnd());
    const v = this.rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  ou(current, mean, reversion, sigma) {
    return current + reversion * (mean - current) + sigma * this.randn();
  }

  triggerCrackle(intensity, crackleBias) {
    const life = Math.floor(sampleRate * (0.004 + this.rnd() * 0.015));
    const amp = (0.02 + 0.08 * this.rnd() * this.rnd()) * (0.55 + 0.45 * intensity) * (0.5 + 0.8 * crackleBias);
    const tone = 1200 + this.rnd() * 4200;
    const q = 1.2 + this.rnd() * 4.0;
    this.crackleEvents.push({ age: 0, life, amp, tone, q, z1: 0, z2: 0 });
    this.stress = Math.max(0, this.stress - (0.08 + 0.12 * this.rnd()));
    this.embers = Math.min(1.2, this.embers + 0.08 + 0.12 * this.rnd());
  }

  triggerPop(intensity) {
    const life = Math.floor(sampleRate * (0.018 + this.rnd() * 0.05));
    const amp = (0.05 + 0.08 * this.rnd()) * (0.65 + 0.35 * intensity);
    this.popEvents.push({ age: 0, life, amp });
    this.stress = Math.max(0, this.stress - (0.2 + 0.15 * this.rnd()));
    this.embers = Math.min(1.2, this.embers + 0.16 + 0.2 * this.rnd());
  }

  renderCrackles() {
    let out = 0;
    for (let i = this.crackleEvents.length - 1; i >= 0; i--) {
      const ev = this.crackleEvents[i];
      const p = ev.age / ev.life;
      if (p >= 1) {
        this.crackleEvents.splice(i, 1);
        continue;
      }
      const env = Math.exp(-7.5 * p);
      const n = (this.rnd() * 2 - 1) * ev.amp * env;
      const omega = 2 * Math.PI * ev.tone / sampleRate;
      const alpha = Math.sin(omega) / (2 * ev.q);
      const b0 = alpha;
      const b1 = 0;
      const b2 = -alpha;
      const a0 = 1 + alpha;
      const a1 = -2 * Math.cos(omega);
      const a2 = 1 - alpha;
      const y = (b0 / a0) * n + ev.z1;
      ev.z1 = (b1 / a0) * n - (a1 / a0) * y + ev.z2;
      ev.z2 = (b2 / a0) * n - (a2 / a0) * y;
      out += y;
      ev.age++;
    }
    return out;
  }

  renderPops() {
    let out = 0;
    for (let i = this.popEvents.length - 1; i >= 0; i--) {
      const ev = this.popEvents[i];
      const p = ev.age / ev.life;
      if (p >= 1) {
        this.popEvents.splice(i, 1);
        continue;
      }
      const env = Math.exp(-12 * p); // sharp snap envelope
      // Pure noise burst — no tonal components that create bubble character
      const burst = this.rnd() * 2 - 1;
      out += burst * ev.amp * env;
      ev.age++;
    }
    return out;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;

    const running     = parameters.running[0]     ?? 1;
    const intensity   = parameters.intensity[0]   ?? 0.39;
    const dryness     = parameters.dryness[0]     ?? 0.47;
    const wind        = parameters.wind[0]         ?? 0.5;
    const size        = parameters.size[0]         ?? 1.0;
    const distance    = parameters.distance[0]     ?? 0.54;
    const crackleBias = parameters.crackleBias[0]  ?? 1.0;

    const bodyVol     = parameters.bodyVol[0]      ?? 1.4;
    const bodyLp      = parameters.bodyLp[0]       ?? 0.007;
    const roarMean    = parameters.roarMean[0]     ?? 0.81;
    const roarSpeed   = parameters.roarSpeed[0]    ?? 0.00005;
    const roarSigma   = parameters.roarSigma[0]    ?? 0.0015;

    const crackleBase = parameters.crackleBase[0]  ?? 13.5;
    const crackleVol  = parameters.crackleVol[0]   ?? 5.4;
    const popVol      = parameters.popVol[0]        ?? 1.35;

    for (let i = 0; i < left.length; i++) {
      this.energy     = this.ou(this.energy,     0.25 + 0.75 * intensity, 0.00055, 0.0028);
      this.turbulence = this.ou(this.turbulence, 0.2  + 0.8  * wind,      0.0018,  0.01);
      this.stress     = this.ou(this.stress,     0.18 + 0.85 * dryness,   0.0009,  0.0035);
      this.embers     = this.ou(this.embers,     0.14 + 0.5  * intensity, 0.0005,  0.0016);

      const crackleRate = crackleBase + 20 * this.energy + 28 * this.stress + 8 * this.embers + 9 * crackleBias;
      const popRate = Math.max(0, -0.6 + 3.6 * this.stress + 1.2 * this.energy);
      if (this.rnd() < crackleRate / sampleRate) this.triggerCrackle(intensity, crackleBias);
      if (this.rnd() < popRate / sampleRate) this.triggerPop(intensity);

      const n = this.rnd() * 2 - 1;
      this.lpBody  += bodyLp * (n - this.lpBody);
      this.roarEnv  = this.ou(this.roarEnv, roarMean, roarSpeed, roarSigma);
      const body    = this.lpBody * Math.max(0, this.roarEnv);

      const crackles = this.renderCrackles();
      const pops     = this.renderPops();

      const emberRate = Math.max(0, (this.embers - 0.15) * 14);
      const ember = this.rnd() < emberRate / sampleRate ? (this.rnd() * 2 - 1) * (0.01 + 0.02 * this.embers) : 0;

      let mix = body * bodyVol + crackles * crackleVol + pops * popVol + ember;

      const nearness = 1 - distance;
      const lp = 0.018 + 0.04 * nearness;
      this.prevL += lp * (mix - this.prevL);
      mix = this.prevL;

      const sat = 1.2 + size * 1.1;
      mix = Math.tanh(mix * sat) / Math.tanh(sat);

      const active = running > 0.01 ? 1 : 0;
      const panJitter = (this.rnd() * 2 - 1) * 0.11;
      const l = mix * (1 - panJitter) * active;
      const r = mix * (1 + panJitter) * active;

      this.prevR += 0.02 * (r - this.prevR);
      left[i]  = l;
      right[i] = this.prevR;
    }

    return true;
  }
}

registerProcessor('fire-synth', FireSynthProcessor);
