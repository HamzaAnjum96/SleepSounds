class FireSynthProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'intensity', defaultValue: 0.62, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'dryness', defaultValue: 0.55, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'wind', defaultValue: 0.22, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'size', defaultValue: 0.45, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'distance', defaultValue: 0.2, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'crackleBias', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'running', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.energy = 0.62;
    this.turbulence = 0.35;
    this.stress = 0.4;
    this.embers = 0.2;

    this.lpBody = 0;
    this.hpBody = 0;
    this.lpHiss = 0;

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
    const life = Math.floor(sampleRate * (0.025 + this.rnd() * 0.09));
    const amp = (0.05 + 0.08 * this.rnd()) * (0.65 + 0.35 * intensity);
    const f1 = 180 + this.rnd() * 380;
    const f2 = f1 * (1.9 + this.rnd() * 0.7);
    this.popEvents.push({ age: 0, life, amp, f1, f2, phase1: this.rnd() * Math.PI * 2, phase2: this.rnd() * Math.PI * 2 });
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
      const env = Math.exp(-5 * p);
      const f1 = ev.f1 * (1 - 0.35 * p);
      const f2 = ev.f2 * (1 - 0.2 * p);
      ev.phase1 += (2 * Math.PI * f1) / sampleRate;
      ev.phase2 += (2 * Math.PI * f2) / sampleRate;
      const burst = 0.65 * Math.sin(ev.phase1) + 0.35 * Math.sin(ev.phase2) + 0.22 * (this.rnd() * 2 - 1);
      out += burst * ev.amp * env;
      ev.age++;
    }
    return out;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;

    const running = parameters.running[0] || 0;
    const intensity = parameters.intensity[0] || 0.6;
    const dryness = parameters.dryness[0] || 0.5;
    const wind = parameters.wind[0] || 0.2;
    const size = parameters.size[0] || 0.45;
    const distance = parameters.distance[0] || 0.2;
    const crackleBias = parameters.crackleBias[0] || 0.5;

    for (let i = 0; i < left.length; i++) {
      this.energy = this.ou(this.energy, 0.25 + 0.75 * intensity, 0.00055, 0.0028);
      this.turbulence = this.ou(this.turbulence, 0.2 + 0.8 * wind, 0.0018, 0.01);
      this.stress = this.ou(this.stress, 0.18 + 0.85 * dryness, 0.0009, 0.0035);
      this.embers = this.ou(this.embers, 0.14 + 0.5 * intensity, 0.0005, 0.0016);

      const crackleRate = 0.5 + 16 * this.energy + 24 * this.stress + 7 * this.embers + 8 * crackleBias;
      const popRate = Math.max(0, -0.6 + 3.6 * this.stress + 1.2 * this.energy);
      if (this.rnd() < crackleRate / sampleRate) this.triggerCrackle(intensity, crackleBias);
      if (this.rnd() < popRate / sampleRate) this.triggerPop(intensity);

      const n = this.rnd() * 2 - 1;
      this.lpBody += 0.022 * (n - this.lpBody); // ~155 Hz cutoff — audible low-mid roar
      this.hpBody = n - this.lpBody;
      const body = this.lpBody * (0.7 + 0.4 * this.energy); // roar breathes with flame energy

      const hissNoise = this.rnd() * 2 - 1;
      const hissGate = Math.max(0, 0.25 + 0.85 * this.turbulence + 0.2 * this.randn());
      this.lpHiss += 0.06 * (hissNoise - this.lpHiss);
      const hiss = (hissNoise - this.lpHiss) * hissGate * (0.03 + 0.08 * this.turbulence * this.energy);

      const crackles = this.renderCrackles();
      const pops = this.renderPops();

      const emberRate = Math.max(0, (this.embers - 0.15) * 14);
      const ember = this.rnd() < emberRate / sampleRate ? (this.rnd() * 2 - 1) * (0.01 + 0.02 * this.embers) : 0;

      let mix = body * 0.65 + hiss * 0.06 + crackles * 2.0 + pops * 1.2 + ember;

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
      left[i] = l;
      right[i] = this.prevR;
    }

    return true;
  }
}

registerProcessor('fire-synth', FireSynthProcessor);
