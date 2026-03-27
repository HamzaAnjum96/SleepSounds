class BirdsongProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'running',      defaultValue: 1,     minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      // ── Ambience ──────────────────────────────────────────────────────
      { name: 'bedVol',       defaultValue: 0.35,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'bedTone',      defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'bedBreath',    defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      // ── Calls ─────────────────────────────────────────────────────────
      { name: 'callRate',     defaultValue: 2.0,   minValue: 0.1,  maxValue: 8,    automationRate: 'k-rate' },
      { name: 'callPitch',    defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'callVol',      defaultValue: 0.55,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'callVariety',  defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      // ── Trills ────────────────────────────────────────────────────────
      { name: 'trillRate',    defaultValue: 0.30,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'trillPitch',   defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'trillVol',     defaultValue: 0.30,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'trillSpeed',   defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      // ── Peeps ─────────────────────────────────────────────────────────
      { name: 'peepRate',     defaultValue: 0.50,  minValue: 0,    maxValue: 1,    automationRate: 'k-rate' },
      { name: 'peepVol',      defaultValue: 0.15,  minValue: 0,    maxValue: 0.5,  automationRate: 'k-rate' },
      // ── Master ────────────────────────────────────────────────────────
      { name: 'gain',         defaultValue: 0.62,  minValue: 0,    maxValue: 2,    automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    // ── Pink noise state (Voss-McCartney approximation, 8 octaves) ──
    this.pinkRows = new Float32Array(8);
    this.pinkRunning = 0;
    this.pinkIndex = 0;
    for (let i = 0; i < 8; i++) {
      const v = (this._rnd() * 2 - 1) / 8;
      this.pinkRows[i] = v;
      this.pinkRunning += v;
    }

    // ── Bed filter state ──
    this.bedLpY = 0;
    this.bedHpY = 0;
    this.bedHpPrev = 0;

    // ── Bed LFO (breathing) ──
    this.lfoVal = 0.85;
    this.lfoTarget = 0.85;
    this.lfoHoldRemain = Math.floor(sampleRate * 3.0);
    this.lfoSpeed = 0;

    // ── Active events ──
    this.calls = [];   // chirp-sequence events
    this.trills = [];  // trill events
    this.peeps = [];   // peep events

    // ── Call scheduling ──
    this.callCooldown = Math.floor(sampleRate * 1.5);

    // ── Trill scheduling ──
    this.trillCooldown = Math.floor(sampleRate * 4.0);

    // ── Peep scheduling ──
    this.peepCooldown = Math.floor(sampleRate * 0.8);

    // ── Output smoothing ──
    this.prevL = 0;
    this.prevR = 0;

    // ── RNG state ──
    this.randState = 31415;
  }

  _rnd() {
    this.randState = (1664525 * this.randState + 1013904223) >>> 0;
    return this.randState / 4294967296;
  }

  _rand(lo, hi) {
    return lo + this._rnd() * (hi - lo);
  }

  // ── Pink noise generator (per-sample) ──
  pinkSample() {
    this.pinkIndex++;
    let numChanged = 0;
    let idx = this.pinkIndex;
    while (idx & 1) {
      const row = numChanged & 7;
      if (row < 8) {
        this.pinkRunning -= this.pinkRows[row];
        const newVal = (this._rnd() * 2 - 1) / 8;
        this.pinkRows[row] = newVal;
        this.pinkRunning += newVal;
      }
      numChanged++;
      idx >>= 1;
    }
    return this.pinkRunning + (this._rnd() * 2 - 1) / 8;
  }

  // ── Trigger a bird call (sequence of chirps) ──
  triggerCall(callPitch, callVariety) {
    const numChirps = Math.floor(this._rand(2, 7));
    // Map callPitch 0–1 to base frequency range
    const baseFreq = 1800 + callPitch * 2400; // 1800–4200 Hz
    const spread = 0.15 + callVariety * 0.25;  // pitch variety
    const chirpGap = Math.floor(sampleRate * this._rand(0.06, 0.14));
    const callAmp = this._rand(0.08, 0.25);

    const chirps = [];
    let offset = 0;
    for (let c = 0; c < numChirps; c++) {
      const chirpLen = Math.floor(sampleRate * this._rand(0.03, 0.09));
      const freq = baseFreq * this._rand(1 - spread, 1 + spread);
      const freqEnd = freq * this._rand(0.7, 1.4);
      chirps.push({ offset, len: chirpLen, freq, freqEnd, amp: callAmp, phase: 0 });
      offset += chirpLen + chirpGap;
    }

    this.calls.push({ age: 0, totalLen: offset, chirps });
  }

  // ── Trigger a trill ──
  triggerTrill(trillPitch, trillSpeed) {
    const len = Math.floor(sampleRate * this._rand(0.3, 0.8));
    const freq = 2400 + trillPitch * 2600; // 2400–5000 Hz
    const warbleRate = 18 + trillSpeed * 17; // 18–35 Hz
    const amp = this._rand(0.06, 0.16);

    this.trills.push({ age: 0, len, freq, warbleRate, amp, phase: 0 });
  }

  // ── Trigger a peep ──
  triggerPeep() {
    const len = Math.floor(sampleRate * this._rand(0.015, 0.04));
    const freq = this._rand(3000, 6000);
    const amp = this._rand(0.02, 0.06);

    this.peeps.push({ age: 0, len, freq, amp, phase: 0 });
  }

  // ── Render active calls ──
  renderCalls() {
    let out = 0;
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const call = this.calls[i];
      if (call.age >= call.totalLen) {
        this.calls.splice(i, 1);
        continue;
      }
      for (const chirp of call.chirps) {
        const local = call.age - chirp.offset;
        if (local < 0 || local >= chirp.len) continue;
        const p = local / chirp.len;
        const env = Math.sin(Math.PI * p) * chirp.amp;
        const f = chirp.freq + (chirp.freqEnd - chirp.freq) * p;
        chirp.phase += (2 * Math.PI * f) / sampleRate;
        out += Math.sin(chirp.phase) * env;
      }
      call.age++;
    }
    return out;
  }

  // ── Render active trills ──
  renderTrills() {
    let out = 0;
    for (let i = this.trills.length - 1; i >= 0; i--) {
      const tr = this.trills[i];
      if (tr.age >= tr.len) {
        this.trills.splice(i, 1);
        continue;
      }
      const p = tr.age / tr.len;
      const env = Math.sin(Math.PI * p) * tr.amp;
      const fMod = tr.freq + Math.sin(2 * Math.PI * tr.warbleRate * (tr.age / sampleRate)) * tr.freq * 0.15;
      tr.phase += (2 * Math.PI * fMod) / sampleRate;
      out += Math.sin(tr.phase) * env;
      tr.age++;
    }
    return out;
  }

  // ── Render active peeps ──
  renderPeeps() {
    let out = 0;
    for (let i = this.peeps.length - 1; i >= 0; i--) {
      const pp = this.peeps[i];
      if (pp.age >= pp.len) {
        this.peeps.splice(i, 1);
        continue;
      }
      const p = pp.age / pp.len;
      const env = Math.sin(Math.PI * p) * pp.amp;
      pp.phase += (2 * Math.PI * pp.freq) / sampleRate;
      out += Math.sin(pp.phase) * env;
      pp.age++;
    }
    return out;
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0];
    const left = output[0];
    const right = output[1] || left;

    const running     = parameters.running[0]     ?? 1;
    const bedVol      = parameters.bedVol[0]       ?? 0.35;
    const bedTone     = parameters.bedTone[0]      ?? 0.50;
    const bedBreath   = parameters.bedBreath[0]    ?? 0.50;
    const callRate    = parameters.callRate[0]     ?? 2.0;
    const callPitch   = parameters.callPitch[0]    ?? 0.50;
    const callVol     = parameters.callVol[0]      ?? 0.55;
    const callVariety = parameters.callVariety[0]  ?? 0.50;
    const trillRate   = parameters.trillRate[0]    ?? 0.30;
    const trillPitch  = parameters.trillPitch[0]   ?? 0.50;
    const trillVol    = parameters.trillVol[0]     ?? 0.30;
    const trillSpeed  = parameters.trillSpeed[0]   ?? 0.50;
    const peepRate    = parameters.peepRate[0]     ?? 0.50;
    const peepVol     = parameters.peepVol[0]      ?? 0.15;
    const gain        = parameters.gain[0]         ?? 0.62;

    // Derive filter coefficients from bedTone (0 = dark/muffled, 1 = bright/open)
    const lpFreq = 800 + bedTone * 3200;   // LP cutoff: 800–4000 Hz
    const hpFreq = 80 + (1 - bedTone) * 200; // HP cutoff: 80–280 Hz
    const lpA = Math.exp((-2 * Math.PI * lpFreq) / sampleRate);
    const hpA = Math.exp((-2 * Math.PI * hpFreq) / sampleRate);

    // Call trigger probability per sample: callRate calls per ~5 seconds
    const callProb = callRate / (sampleRate * 5);
    // Trill: trillRate maps 0–1 to roughly 0.5–4 trills per 10 sec
    const trillProb = (0.5 + trillRate * 3.5) / (sampleRate * 10);
    // Peep: peepRate maps 0–1 to roughly 1–12 peeps per second
    const peepProb = (1 + peepRate * 11) / sampleRate;

    for (let i = 0; i < left.length; i++) {
      // ── Ambient bed: filtered pink noise with breathing LFO ──
      const pink = this.pinkSample();

      // LP filter
      this.bedLpY = lpA * this.bedLpY + (1 - lpA) * pink;
      // HP filter (DC removal + warmth control)
      const hpIn = this.bedLpY;
      this.bedHpY = hpA * (this.bedHpY + hpIn - this.bedHpPrev);
      this.bedHpPrev = hpIn;

      // Breathing LFO
      this.lfoHoldRemain--;
      if (this.lfoHoldRemain <= 0) {
        const breathMin = 0.7 + (1 - bedBreath) * 0.2;
        const breathMax = 0.85 + bedBreath * 0.15;
        this.lfoTarget = this._rand(breathMin, breathMax);
        this.lfoHoldRemain = Math.floor(sampleRate * this._rand(2.5, 6.0));
        this.lfoSpeed = 1.0 / (sampleRate * this._rand(0.8, 2.0));
      }
      this.lfoVal += (this.lfoTarget - this.lfoVal) * this.lfoSpeed;

      const bed = this.bedHpY * this.lfoVal * bedVol;

      // ── Trigger calls ──
      this.callCooldown--;
      if (this.callCooldown <= 0 && this._rnd() < callProb) {
        this.triggerCall(callPitch, callVariety);
        this.callCooldown = Math.floor(sampleRate * this._rand(0.8, 4.0));
      }

      // ── Trigger trills ──
      this.trillCooldown--;
      if (this.trillCooldown <= 0 && this._rnd() < trillProb) {
        this.triggerTrill(trillPitch, trillSpeed);
        this.trillCooldown = Math.floor(sampleRate * this._rand(2.5, 8.0));
      }

      // ── Trigger peeps ──
      this.peepCooldown--;
      if (this.peepCooldown <= 0 && this._rnd() < peepProb) {
        this.triggerPeep();
        this.peepCooldown = Math.floor(sampleRate * this._rand(0.3, 1.8));
      }

      // ── Render layers ──
      const callSig  = this.renderCalls()  * callVol;
      const trillSig = this.renderTrills() * trillVol;
      const peepSig  = this.renderPeeps()  * peepVol;

      // ── Mix ──
      let mix = bed + callSig + trillSig + peepSig;

      // Soft clip
      const sat = 1.12;
      mix = Math.tanh(mix * sat) / Math.tanh(sat);

      mix *= gain;

      const active = running > 0.01 ? 1 : 0;
      // Gentle stereo spread — subtle pan jitter for natural feel
      const panJitter = (this._rnd() * 2 - 1) * 0.08;
      const l = mix * (1 - panJitter) * active;
      const r = mix * (1 + panJitter) * active;

      // Smooth output to avoid clicks
      this.prevL += 0.03 * (l - this.prevL);
      this.prevR += 0.03 * (r - this.prevR);

      left[i]  = this.prevL;
      right[i] = this.prevR;
    }

    return true;
  }
}

registerProcessor('birdsong-synth', BirdsongProcessor);
