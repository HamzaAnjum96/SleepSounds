// thunder.worklet.js — event-based thunder generator
//
// Thunder must not be a looped roar. It reads as thunder only when it is a
// sparse SEQUENCE of related events over near-silence. Following the
// signal-based browser thunder model (Fineberg et al.), each strike is built
// from four submodels sharing one random seed so it feels like one physical
// event:
//
//   clap        1–4 short broadband cracks (62% of strikes are 1–2 claps)
//   rumble      a long body that sweeps its bandwidth downward (~6–9 s)
//   afterimage  a low-mid width layer that undulates (~8–14 s)
//   deepener    a sub-bass tail, felt more than heard (~12–18 s)
//
// Controls (k-rate): stormIntensity (how often events arrive), rumble
// (body/deep weight), distance (brightness loss + longer tail + width).

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

// Piecewise-linear envelope driven sample by sample.
class Env {
  constructor() { this.v = 0; this.q = []; this.step = 0; this.left = 0; this.tgt = 0; }
  clear(v) { this.q.length = 0; this.v = v; this.step = 0; this.left = 0; this.tgt = v; }
  to(value, seconds) { this.q.push([value, Math.max(1, Math.floor(seconds * SR))]); }
  next() {
    if (this.left <= 0) {
      if (this.q.length) { const seg = this.q.shift(); this.step = (seg[0] - this.v) / seg[1]; this.left = seg[1]; this.tgt = seg[0]; }
      else { this.step = 0; }
    }
    if (this.left > 0) { this.v += this.step; this.left--; if (this.left <= 0) this.v = this.tgt; }
    return this.v;
  }
}

class Clap {
  constructor() { this.active = false; this.a = new Biquad(); this.b = new Biquad();
    this.env = 0; this.decay = 0; this.attacking = false; this.attack = 0; this.peak = 0;
    this.panL = 0.7; this.panR = 0.7; this.lp = new Biquad(); }
  trigger(f, q, peak, decayS, pan, lpHz) {
    this.a.bandpass(f, q); this.b.bandpass(f * 0.5, q);
    this.lp.lowpass(lpHz, 0.7);
    this.a.x1 = this.a.x2 = this.a.y1 = this.a.y2 = 0;
    this.b.x1 = this.b.x2 = this.b.y1 = this.b.y2 = 0;
    this.env = 0; this.attacking = true; this.attack = 1 / Math.max(1, 0.002 * SR);
    this.decay = Math.exp(-1 / Math.max(1, decayS * SR)); this.peak = peak;
    this.panL = Math.cos((pan + 1) * Math.PI / 4); this.panR = Math.sin((pan + 1) * Math.PI / 4);
    this.active = true;
  }
  sample(noise) {
    let v = this.a.process(noise) + this.b.process(noise);
    v = this.lp.process(v);
    if (this.attacking) { this.env += this.attack; if (this.env >= 1) { this.env = 1; this.attacking = false; } }
    else { this.env *= this.decay; }
    if (!this.attacking && this.env < 0.0004) this.active = false;
    return v * this.env * this.peak;
  }
}

class ThunderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'stormIntensity', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rumble',         defaultValue: 0.6, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'distance',       defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'running',        defaultValue: 1,   minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.seed = 0x51ed ^ 0x7777;
    this.claps = []; for (let i = 0; i < 10; i++) this.claps.push(new Clap());

    // long layers
    this.rumbleEnv = new Env(); this.rumbleLP = new Biquad(); this.rumbleHP = new Biquad();
    this.rumbleHP.highpass(170, 0.7); this.rumbleSweepFrom = 1000; this.rumbleSweep = 1000; this.rumbleSweepCoef = 1;
    this.afterEnv = new Env(); this.afterBP = new Biquad(); this.afterBP.bandpass(333, 4); this.afterLfo = 0;
    this.deepEnv = new Env(); this.deepLP = new Biquad(); this.deepHP = new Biquad();
    this.deepLP.lowpass(70, 0.7); this.deepHP.highpass(30, 0.7);

    this.eventPanL = 0.7; this.eventPanR = 0.7;
    this.nextEvent = Math.floor((1.5 + Math.random() * 3) * SR);
    this.pendingClaps = []; // { at, f, q, peak, decayS, pan, lpHz }
    this.elapsed = 0;       // running sample counter for clap scheduling
    this.level = 0;
    // Faint continuous far-rumble bed, so a storm never falls fully silent
    // between strikes (the old version went minutes between events).
    this.bedLP = new Biquad(); this.bedLP.lowpass(110, 0.6);
    this.bedHP = new Biquad(); this.bedHP.highpass(34, 0.6);
    this.bedSwell = 0;
  }

  rnd() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }

  scheduleEvent(stormIntensity, rumbleAmt, distance) {
    // 62% of flashes are 1–2 claps; the rest 3–4.
    const claps = this.rnd() < 0.62 ? (1 + (this.rnd() < 0.5 ? 0 : 1)) : (3 + (this.rnd() < 0.5 ? 0 : 1));
    const pan = (this.rnd() * 2 - 1) * (0.25 + distance * 0.55);
    this.eventPanL = Math.cos((pan + 1) * Math.PI / 4);
    this.eventPanR = Math.sin((pan + 1) * Math.PI / 4);
    const near = 1 - distance;               // 1 = overhead, 0 = far
    const bright = 0.45 + near * 0.55;
    const lpHz = 1200 + near * 6000;

    // Claps arrive as a short sequence (offsets 30–250 ms), not all at once,
    // which is what makes a multi-clap strike read as rolling thunder.
    let offset = 0;
    for (let i = 0; i < claps; i++) {
      const f = (120 + this.rnd() * 1300) * (0.5 + near * 0.5);
      const decayS = 0.03 + Math.pow(this.rnd(), 2) * 0.22;
      const peak = (0.5 + this.rnd() * 0.4) * bright * (i === 0 ? 1 : 0.7);
      this.pendingClaps.push({
        at: this.elapsed + Math.floor(offset * SR),
        f, q: 6 + this.rnd() * 3, peak, decayS,
        pan: pan + (this.rnd() * 2 - 1) * 0.1, lpHz,
      });
      offset += 0.03 + this.rnd() * 0.22;
    }

    const tail = 1 + distance * 1.4; // distance lengthens the tail

    // rumble body
    this.rumbleSweepFrom = 1000; this.rumbleSweep = 1000;
    const rumbleLen = (6 + this.rnd() * 3) * tail;
    this.rumbleSweepCoef = Math.exp(Math.log(140 / 1000) / Math.max(1, rumbleLen * SR));
    const rPeak = (0.5 + rumbleAmt * 0.5);
    this.rumbleEnv.clear(0);
    this.rumbleEnv.to(rPeak, 0.05);
    this.rumbleEnv.to(rPeak * 0.4, 0.5);
    this.rumbleEnv.to(rPeak * 0.85, 0.35);
    this.rumbleEnv.to(rPeak * 0.1, rumbleLen * 0.6);
    this.rumbleEnv.to(0, rumbleLen * 0.4);

    // afterimage width
    const afterLen = (8 + this.rnd() * 6) * (0.8 + distance * 0.6);
    this.afterEnv.clear(0);
    this.afterEnv.to(0.0, 0.4);
    this.afterEnv.to(0.45 * (0.6 + distance * 0.6), 1.2);
    this.afterEnv.to(0.2, afterLen * 0.5);
    this.afterEnv.to(0, afterLen * 0.5);

    // deepener tail
    const deepLen = (12 + this.rnd() * 6) * tail;
    const dPeak = 0.6 + rumbleAmt * 0.5;
    this.deepEnv.clear(0);
    this.deepEnv.to(dPeak, 0.3);
    this.deepEnv.to(dPeak * 0.55, 2.0);
    this.deepEnv.to(dPeak * 0.9, 1.0);
    this.deepEnv.to(0, deepLen);

    // next event gap: an active storm rolls, it doesn't strike once a minute.
    // ~6-22s at the default intensity, down to ~3-9s at full, with the long
    // rumble/deepener tails overlapping into near-continuous thunder.
    const meanGap = (26 - stormIntensity * 20) * (0.5 + this.rnd() * 1.0);
    this.nextEvent = Math.floor(Math.max(3, meanGap) * SR);
  }

  process(_inputs, outputs, params) {
    const out = outputs[0]; const L = out[0], R = out[1] || out[0]; const n = L.length;
    const stormIntensity = params.stormIntensity[0];
    const rumbleAmt = params.rumble[0];
    const distance = params.distance[0];
    const running = params.running[0];

    const levelTarget = running > 0.5 ? 1 : 0;
    const levelCoef = Math.exp(-1 / (0.08 * SR));
    const afterInc = TWO_PI * 0.15 / SR;

    for (let i = 0; i < n; i++) {
      this.elapsed++;
      if (running > 0.5 && --this.nextEvent <= 0) this.scheduleEvent(stormIntensity, rumbleAmt, distance);

      // fire any claps whose scheduled time has arrived
      if (this.pendingClaps.length) {
        for (let p = this.pendingClaps.length - 1; p >= 0; p--) {
          if (this.pendingClaps[p].at <= this.elapsed) {
            const pc = this.pendingClaps[p];
            let v = null;
            for (let j = 0; j < this.claps.length; j++) if (!this.claps[j].active) { v = this.claps[j]; break; }
            if (v) v.trigger(pc.f, pc.q, pc.peak, pc.decayS, pc.pan, pc.lpHz);
            this.pendingClaps.splice(p, 1);
          }
        }
      }

      const noise = this.rnd() * 2 - 1;

      // claps (each carries its own pan)
      let clL = 0, clR = 0;
      for (let j = 0; j < this.claps.length; j++) {
        const c = this.claps[j]; if (!c.active) continue;
        const s = c.sample(noise); clL += s * c.panL; clR += s * c.panR;
      }

      // rumble
      this.rumbleSweep *= this.rumbleSweepCoef; if (this.rumbleSweep < 140) this.rumbleSweep = 140;
      this.rumbleLP.lowpass(this.rumbleSweep, 0.7);
      const rg = this.rumbleEnv.next();
      let rum = rg > 0.0001 ? this.rumbleHP.process(this.rumbleLP.process(noise)) * rg : 0;

      // afterimage
      this.afterLfo += afterInc; if (this.afterLfo > TWO_PI) this.afterLfo -= TWO_PI;
      const ag = this.afterEnv.next() * (0.7 + 0.3 * Math.sin(this.afterLfo));
      let aft = ag > 0.0001 ? this.afterBP.process(noise) * ag : 0;

      // deepener
      const dg = this.deepEnv.next();
      let dep = dg > 0.0001 ? this.deepHP.process(this.deepLP.process(noise)) * dg * 1.4 : 0;

      // faint distant-rumble bed: a slow random swell of low noise, always
      // present so the storm keeps a living floor between strikes.
      this.bedSwell += (Math.abs(this.rnd() - this.rnd()) - this.bedSwell) * 0.000004;
      const bedG = (0.018 + stormIntensity * 0.03) * (0.4 + rumbleAmt * 0.7) * (0.5 + this.bedSwell * 2.0);
      const bed = this.bedHP.process(this.bedLP.process(noise)) * bedG;

      // mix: claps keep their own pan; bodies get a slight event-wide width.
      const body = rum + aft + bed;
      let sl = clL + body * (0.55 + this.eventPanL * 0.45) + dep;
      let sr = clR + body * (0.55 + this.eventPanR * 0.45) + dep;

      this.level = levelTarget + (this.level - levelTarget) * levelCoef;
      sl *= this.level; sr *= this.level;

      L[i] = Math.tanh(sl);
      if (R !== L) R[i] = Math.tanh(sr);
    }
    return true;
  }
}

registerProcessor('thunder-gen', ThunderProcessor);
