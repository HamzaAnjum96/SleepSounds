// thunder.worklet.js — event-based thunder generator
//
// Thunder is not a single bang. A lightning channel is kilometres long, so the
// sound from its near and far segments arrives over several seconds, bending
// and reflecting off cloud and terrain — that staggered arrival is the *roll*.
// This generator models a strike as a swarm of overlapping low-frequency
// "swells" spread over time (the roll), an optional sharp fluttering crack only
// when the storm is close, and a long sub-bass tail felt more than heard.
//
//   roll        4–13 overlapping band-limited noise swells, front-loaded, each
//               lower and softer than the last (air absorption) — the rumble
//   crack       a sharp, bright, *tearing* transient (rapid AM) — close strikes
//               only; a distant storm has no crack at all, just roll
//   deepener    one long sub-bass swell under the roll
//   reverb      a synthesised rolling tail (damped feedback combs) — no samples
//   bed         a faint continuous far-rumble floor between strikes
//
// Timing is two-level: a slow "activity" walk plus clustering, so strikes come
// as a quick flurry then a long lull rather than on a metronome. The first
// strike is held back and softened, and the level eases in — a sleep app must
// never open with a bang.
//
// Controls (k-rate): stormIntensity (how active the storm is), rumble (low-end
// weight + length), distance (near↔far: crack vs pure roll, brightness, tail),
// crack (how sharp the strike snaps when it is close).

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
  reset() { this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  process(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; }
}

// One band-limited noise swell: a filtered-noise burst with a soft attack and a
// long decay, panned. Used for the roll, the deepener, and (with a fast attack
// + flutter) the sharp crack. Flutter is a rapid amplitude tear that turns a
// plain burst into the ripping sound of a close strike.
class Voice {
  constructor() { this.active = false; this.f = new Biquad();
    this.env = 0; this.atk = 0; this.dec = 0; this.attacking = false; this.peak = 0;
    this.panL = 0.7; this.panR = 0.7; this.fl = 0; }
  trigger(o) {
    if (o.type === 'highpass') this.f.highpass(o.freq, o.q);
    else if (o.type === 'bandpass') this.f.bandpass(o.freq, o.q);
    else this.f.lowpass(o.freq, o.q);
    this.f.reset();
    this.env = 0; this.attacking = true;
    this.atk = 1 / Math.max(1, o.attackS * SR);
    this.dec = Math.exp(-1 / Math.max(1, o.decayS * SR));
    this.peak = o.peak;
    this.panL = Math.cos((o.pan + 1) * Math.PI / 4);
    this.panR = Math.sin((o.pan + 1) * Math.PI / 4);
    this.fl = o.flutter || 0;
    this.active = true;
  }
  sample(noise, flN) {
    const v = this.f.process(noise);
    if (this.attacking) { this.env += this.atk; if (this.env >= 1) { this.env = 1; this.attacking = false; } }
    else { this.env *= this.dec; }
    let amp = this.env * this.peak;
    if (this.fl > 0) amp *= (1 - this.fl) + this.fl * (0.5 + 0.5 * flN); // tearing
    if (!this.attacking && this.env < 0.0003) this.active = false;
    return v * amp;
  }
}

// ── Rolling reverb (procedural, no impulse-response files) ──────────────
class Comb {
  constructor(ms) { this.buf = new Float32Array(Math.max(2, Math.round(ms / 1000 * SR))); this.i = 0; this.damp = 0; }
  process(x, fb, dampCoef) {
    const y = this.buf[this.i];
    this.damp = y * (1 - dampCoef) + this.damp * dampCoef;
    this.buf[this.i] = x + this.damp * fb;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}
class Allpass {
  constructor(ms, g) { this.buf = new Float32Array(Math.max(2, Math.round(ms / 1000 * SR))); this.i = 0; this.g = g; }
  process(x) {
    const b = this.buf[this.i];
    const y = b - x * this.g;
    this.buf[this.i] = x + b * this.g;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}

class ThunderProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'stormIntensity', defaultValue: 0.4,  minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rumble',         defaultValue: 0.55, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'distance',       defaultValue: 0.7,  minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'crack',          defaultValue: 0.3,  minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'running',        defaultValue: 1,    minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.seed = 0x51ed ^ 0x7777;

    this.voices = []; for (let i = 0; i < 48; i++) this.voices.push(new Voice());
    this.pending = []; // queued voice triggers: { at, type, freq, q, attackS, decayS, peak, pan, flutter }
    this.elapsed = 0;

    // faint continuous far-rumble floor between strikes
    this.bedLP = new Biquad(); this.bedLP.lowpass(95, 0.6);
    this.bedHP = new Biquad(); this.bedHP.highpass(32, 0.6);
    this.bedSwell = 0;

    // flutter noise (smoothed) for the crack tear
    this.flN = 0;

    // two-level timing: a slow storm-activity walk + clustering
    this.activity = 0.3;
    this.firstDone = false;
    // hold the first strike well back, and start soft — never open with a bang
    this.nextEvent = Math.floor((9 + Math.random() * 12) * SR);

    // rolling reverb
    this.combL = [new Comb(67), new Comb(91)];
    this.combR = [new Comb(73), new Comb(97)];
    this.apL = new Allpass(13, 0.5);
    this.apR = new Allpass(11, 0.5);

    this.level = 0;
  }

  rnd() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }

  q(at, o) { o.at = at; this.pending.push(o); }

  scheduleEvent(stormIntensity, rumbleAmt, distance, crack) {
    const first = !this.firstDone; this.firstDone = true;
    const near = 1 - distance;                    // 1 = overhead, 0 = far
    const pan = (this.rnd() * 2 - 1) * (0.2 + distance * 0.5);
    const t0 = this.elapsed;

    // ── crack: a close strike snaps. Three parts make it read as lightning
    // rather than a noise burst — a bright leading SNAP (the "crack"), a short
    // low THUMP for body/punch under it, and a granular TEAR (a dense scatter of
    // tiny clicks that thins out) for the electric rip. Only when close (or the
    // crack control is up), and never on the first strike (soft far roll first).
    const crackChance = first ? 0 : Math.min(0.95, near * 0.7 + crack * 0.6);
    if (this.rnd() < crackChance) {
      const sharp = 0.5 + near * 0.35 + crack * 0.5;            // brightness/energy
      // CLICK — a near-instantaneous broadband tick: the percussive leading edge
      // that makes it read as a *crack* rather than a whoosh of noise.
      this.q(t0, {
        type: 'bandpass', freq: 1800 + this.rnd() * 900, q: 0.5,
        attackS: 0.00015, decayS: 0.004 + this.rnd() * 0.005,
        peak: (0.5 + this.rnd() * 0.3) * sharp, pan: pan, flutter: 0,
      });
      // SNAP — the bright, fast transient right behind the click
      this.q(t0, {
        type: 'highpass', freq: 1700 + sharp * 2800 + this.rnd() * 700, q: 0.7,
        attackS: 0.0002, decayS: 0.01 + this.rnd() * 0.028,
        peak: (0.4 + this.rnd() * 0.24) * sharp, pan: pan, flutter: 0,
      });
      // THUMP — a short low body so the snap has punch, not just hiss
      this.q(t0, {
        type: 'bandpass', freq: 280 + this.rnd() * 240, q: 0.8,
        attackS: 0.0009, decayS: 0.05 + this.rnd() * 0.09,
        peak: (0.3 + this.rnd() * 0.22) * (0.6 + near * 0.5), pan: pan, flutter: 0,
      });
      // TEAR — dense granular crackle thinning out over ~150–300 ms (the rip)
      const tearLen = 0.13 + this.rnd() * 0.16 + crack * 0.12;
      const nClicks = 12 + Math.floor(this.rnd() * (10 + crack * 16));
      let ct = 0.002 + this.rnd() * 0.005;
      for (let k = 0; k < nClicks; k++) {
        const prog = ct / tearLen;
        if (prog > 1) break;
        this.q(t0 + Math.floor(ct * SR), {
          type: 'highpass', freq: 1400 + sharp * 2800 + this.rnd() * 1800, q: 0.6,
          attackS: 0.0002, decayS: 0.0022 + this.rnd() * 0.009,
          peak: (0.1 + this.rnd() * 0.16) * sharp * (1 - prog * 0.7),
          pan: pan + (this.rnd() * 2 - 1) * 0.28, flutter: 0,
        });
        ct += (0.004 + this.rnd() * 0.013) * (1 + prog * 2.2);  // sparser as it thins
      }
    }

    // ── the roll: a handful of distinct SURGES spread over several seconds, not
    // one fading hump. Each surge (1–3 grains around a centre time) is the sound
    // of another stretch of the channel reaching the ear — the rumble climbs,
    // dips, and climbs again. Far storms roll longer with more, lower surges; the
    // first strike is gentle and far.
    const dist = first ? Math.max(distance, 0.85) : distance;
    const fNear = 1 - dist;
    const dur = (3.5 + this.rnd() * 3.5) * (1 + dist * 1.7);
    const weight = (first ? 0.6 : 1) * (0.7 + rumbleAmt * 0.8);
    const numSurges = 2 + Math.floor(this.rnd() * (1 + dist * 3.5));   // 2..~5
    let sc = dur * 0.12 * this.rnd();                                  // first surge near the front
    for (let s = 0; s < numSurges; s++) {
      const sProg = Math.min(1, sc / dur);                            // 0..1 through the roll
      // surges decay overall but each varies a lot, so the roll undulates.
      const surge = weight * (0.45 + 0.6 * (1 - sProg)) * (0.55 + this.rnd() * 0.7);
      const grainsHere = 1 + Math.floor(this.rnd() * 3);
      for (let g = 0; g < grainsHere; g++) {
        const offset = Math.max(0, sc + (this.rnd() * 2 - 1) * 0.5);
        const f = Math.max(70, (235 - 145 * sProg) * (0.6 + this.rnd() * 0.6) * (0.7 + fNear * 0.5));
        this.q(t0 + Math.floor(offset * SR), {
          type: 'lowpass', freq: f, q: 0.7,
          attackS: 0.05 + this.rnd() * 0.18, decayS: 0.35 + this.rnd() * 1.1,
          peak: surge * (0.6 + this.rnd() * 0.5) * 0.55, pan: pan + (this.rnd() * 2 - 1) * 0.32, flutter: 0,
        });
      }
      sc += (0.55 + this.rnd() * 0.9) * (dur / numSurges);            // step to the next surge
    }

    // ── deepener: a single long sub-bass swell under the roll (kept gentle so
    // it underpins rather than smears the surges).
    this.q(t0, {
      type: 'lowpass', freq: 58 + this.rnd() * 26, q: 0.7,
      attackS: 0.25, decayS: (2.5 + this.rnd() * 3.5) * (1 + dist),
      peak: weight * 0.6, pan: pan * 0.4, flutter: 0,
    });

    // ── next event: two-level, clustered, irregular.
    // activity drifts (storm cells wax and wane); high activity → flurries.
    this.activity += (this.rnd() * 2 - 1) * 0.28;
    if (this.activity < 0) this.activity = 0; else if (this.activity > 1) this.activity = 1;
    const active = stormIntensity * (0.35 + this.activity * 0.9);
    let gap;
    if (this.rnd() < 0.3 + active * 0.45) {
      gap = 1.8 + this.rnd() * 5.5;                          // a quick follow-up
    } else {
      gap = (12 + this.rnd() * 46) * (1.2 - stormIntensity * 0.85); // a long lull
    }
    this.nextEvent = Math.floor(Math.max(1.4, gap) * SR);
  }

  process(_inputs, outputs, params) {
    const out = outputs[0]; const L = out[0], R = out[1] || out[0]; const n = L.length;
    const stormIntensity = params.stormIntensity[0];
    const rumbleAmt = params.rumble[0];
    const distance = params.distance[0];
    const crack = params.crack[0];
    const running = params.running[0];

    const levelTarget = running > 0.5 ? 1 : 0;

    // rolling-reverb coefficients (per block): far = longer, darker, wetter.
    const revFb = 0.58 + distance * 0.30;
    const revDamp = 0.35 + distance * 0.35;
    const revWet = 0.12 + distance * 0.4;

    // silent + faded out: emit zeros cheaply.
    if (running < 0.5 && this.level < 0.0006 && this.pending.length === 0) {
      let anyActive = false;
      for (let j = 0; j < this.voices.length; j++) if (this.voices[j].active) { anyActive = true; break; }
      if (!anyActive) { L.fill(0); if (R !== L) R.fill(0); return true; }
    }

    for (let i = 0; i < n; i++) {
      this.elapsed++;
      if (running > 0.5 && --this.nextEvent <= 0) this.scheduleEvent(stormIntensity, rumbleAmt, distance, crack);

      // fire queued voice triggers whose time has arrived
      if (this.pending.length) {
        for (let p = this.pending.length - 1; p >= 0; p--) {
          if (this.pending[p].at <= this.elapsed) {
            const o = this.pending[p];
            let v = null;
            for (let j = 0; j < this.voices.length; j++) if (!this.voices[j].active) { v = this.voices[j]; break; }
            if (v) v.trigger(o);
            this.pending.splice(p, 1);
          }
        }
      }

      const noise = this.rnd() * 2 - 1;
      // smoothed flutter noise (~mid-rate buzz) for the crack tear
      this.flN += 0.22 * ((this.rnd() * 2 - 1) - this.flN);

      // sum active voices (each carries its own pan)
      let vL = 0, vR = 0;
      for (let j = 0; j < this.voices.length; j++) {
        const v = this.voices[j]; if (!v.active) continue;
        const s = v.sample(noise, this.flN);
        vL += s * v.panL; vR += s * v.panR;
      }

      // faint distant-rumble floor: a slow random swell of low noise.
      this.bedSwell += (Math.abs(this.rnd() - this.rnd()) - this.bedSwell) * 0.000004;
      const bedG = (0.014 + stormIntensity * 0.022) * (0.4 + rumbleAmt * 0.7) * (0.5 + this.bedSwell * 2.0);
      const bed = this.bedHP.process(this.bedLP.process(noise)) * bedG;

      // rolling reverb fed by the event voices (not the steady bed).
      const revIn = (vL + vR) * 0.5;
      let wl = (this.combL[0].process(revIn, revFb, revDamp) + this.combL[1].process(revIn, revFb, revDamp)) * 0.5;
      let wr = (this.combR[0].process(revIn, revFb, revDamp) + this.combR[1].process(revIn, revFb, revDamp)) * 0.5;
      wl = this.apL.process(wl); wr = this.apR.process(wr);

      let sl = vL + bed + wl * revWet;
      let sr = vR + bed + wr * revWet;

      // gentle, asymmetric level ramp: ease in slowly (no sudden onset), fall
      // a little faster when stopped.
      const coef = Math.exp(-1 / ((levelTarget > this.level ? 1.4 : 0.3) * SR));
      this.level = levelTarget + (this.level - levelTarget) * coef;
      sl *= this.level; sr *= this.level;

      L[i] = Math.tanh(sl);
      if (R !== L) R[i] = Math.tanh(sr);
    }
    return true;
  }
}

registerProcessor('thunder-gen', ThunderProcessor);
