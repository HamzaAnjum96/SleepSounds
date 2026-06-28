// rain.worklet.js — event-based rainfall generator
//
// Rain is not a static hiss; the ear identifies it from many small arrivals
// over a quiet, *moving* bed. This processor builds the shower entirely off
// the main thread, following the procedural-rain / sound-texture literature
// (multi-band equalised-noise bed + clustered impacts + surface-aware atoms +
// short early reflections):
//
//   bed       a multi-band, decorrelated noise curtain. Four sub-beds (body,
//             texture, detail, air) each drift on their own slow random walk,
//             so the spectrum breathes instead of sitting as one flat hiss.
//   events    drop atoms — solid hits, leaf hits, water plips — scheduled with
//             a two-level (cluster + background) stochastic model so the rain
//             clumps and lulls the way real showers do, rather than ticking
//             like a uniform Poisson clock.
//   surface   crossfades atom character and brightness from hard/open ground
//             through foliage to wet/sheltered, and steers reflection amount.
//   space     a short multi-tap early-reflection bus on the event signal gives
//             the drops a sense of placement without a heavy reverb.
//   master    sub-bass trim + gentle soft-clip so overlapping drops never clip.
//
// Controls (k-rate): intensity (rate + bed level), heaviness (drop weight +
// bed darkness), surface (hard↔soft: atom family/brightness + reflectivity),
// swell (depth of a very slow rise-and-fall in intensity).

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

// Multi-band bed: four parallel band-pass slices of a pink-noise source, each
// with its own slowly random-walking gain. Splitting the curtain into bands
// that drift independently is what moves the bed away from "one flat hiss" —
// the sound-texture literature points at exactly this subband-envelope
// movement as the cue that reads as natural rain.
// Low Q across the board: narrow band-passed noise rings metallically (a
// "tin roof" tone). These are gentle tilts on a broadly pink curtain, not
// resonators — the `tone` control then trims the top so the bed can sit dark
// and soft or open and airy.
const BED_BANDS = [
  { f: 430,  q: 0.45, base: 1.00, depth: 0.22 }, // low body — weight, not rumble
  { f: 1400, q: 0.50, base: 0.95, depth: 0.34 }, // mid texture — the curtain
  { f: 4200, q: 0.55, base: 0.55, depth: 0.42 }, // high detail — pitter-patter
  { f: 8200, q: 0.60, base: 0.20, depth: 0.45 }, // air/spray — used sparingly
];

class RainProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      // A few macro controls; some fold several inner behaviours together (see
      // the derived values in process()), to keep the editor uncluttered.
      { name: 'intensity', defaultValue: 0.65, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'heaviness', defaultValue: 0.50, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // surface: hard/bright (0) → soft/muffled (1). Steers the drop character
      // and the bed's colour together (a soft surface dulls both).
      { name: 'surface',   defaultValue: 0.50, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // bed: level of the continuous noise curtain under the drops. Full by
      // default; lower it to let the drops sit over near-silence (or to keep
      // the bed from clashing with another broadband layer, e.g. a fan).
      { name: 'bed',       defaultValue: 1.00, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // drops: prominence of the droplet *hits* against the bed.
      { name: 'drops',     defaultValue: 0.25, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // movement: how alive vs steady the shower is — folds the slow swell and
      // the drop clustering into one control.
      { name: 'movement',  defaultValue: 0.40, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // space: sense of room — early reflections plus stereo width together.
      { name: 'space',     defaultValue: 0.30, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // metallic: an *intentional* tin-roof/window ring on the solid drops. 0
      // keeps the natural, de-tinned default (rain on soft ground); raising it
      // makes solid hits ring brighter, longer, louder and more often, for the
      // report's "rain on tin / on a window" surfaces. Deliberately opt-in so the
      // metallic edge never leaks into the other variants.
      { name: 'metallic',  defaultValue: 0,    minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'running',   defaultValue: 1,    minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.seed = 0x9e37 ^ 0x1234;

    // pink state (Paul Kellet economy) per channel
    this.pk = [new Float32Array(3), new Float32Array(3)];

    // multi-band bed: a filter + drifting-gain state per band, per channel
    this.bed = [[], []];
    for (let ch = 0; ch < 2; ch++) {
      for (let b = 0; b < BED_BANDS.length; b++) {
        const filt = new Biquad();
        filt.bandpass(BED_BANDS[b].f, BED_BANDS[b].q);
        this.bed[ch].push({ filt, g: 1, gt: 1 });
      }
    }
    this.mult = new Float32Array(BED_BANDS.length);
    // per-sample smoothing toward each band's gain target (~0.4 s)
    this.bedSmooth = Math.exp(-1 / (0.4 * SR));

    // master sub-trim
    this.masterHP_L = new Biquad(); this.masterHP_R = new Biquad();
    this.masterHP_L.highpass(42, 0.6); this.masterHP_R.highpass(42, 0.6);
    // master tone: a gentle 2-pole lowpass over the whole shower (bed + drops +
    // reflections). Dark by default — this is the decisive cut that stops the
    // colored bandpass-noise skirts reading as a tinny hiss — and opens up with
    // metallic for the bright tin/window surfaces. Cutoff is set per block.
    this.masterLP_L = new Biquad(); this.masterLP_R = new Biquad();
    this.masterLPcut = 0;

    // voice pool
    this.voices = [];
    for (let i = 0; i < 96; i++) this.voices.push(new Drop());

    // ── two-level event scheduler ────────────────────────────────────
    // background: a steady stochastic drizzle per lane (keeps light rain alive
    // and heavy rain from ever turning into pure static)
    this.nextNear = 0; this.nextMid = 0; this.nextFar = 0;
    // clusters: occasional bursts of nearby drops — the clumps real rain has
    this.nextCluster = 0;
    this.emitters = [];
    for (let i = 0; i < 8; i++) this.emitters.push({ active: false, lane: 1, remaining: 0, gap: 0, gMin: 0, gMax: 0 });

    // ── short early reflections on the event bus (placement, not reverb) ──
    this.rbLen = Math.ceil(0.14 * SR) + 4;
    this.rbL = new Float32Array(this.rbLen);
    this.rbR = new Float32Array(this.rbLen);
    this.rbPos = 0;
    this.dL = 0; this.dR = 0; // damping one-pole state
    this.evLpL = 0; this.evLpR = 0; // metallic-driven brightness ceiling on drops
    const mk = (s, g) => ({ d: Math.max(1, Math.round(s * SR)), g });
    // a small spray of taps out to ~90 ms gives an audible sense of enclosure
    // when `space` is up; slightly different delays L vs R decorrelate them.
    this.tapsL = [mk(0.0110, 0.55), mk(0.0190, 0.42), mk(0.0310, 0.32), mk(0.0470, 0.24), mk(0.0660, 0.17), mk(0.0890, 0.11)];
    this.tapsR = [mk(0.0131, 0.55), mk(0.0173, 0.42), mk(0.0291, 0.32), mk(0.0512, 0.24), mk(0.0631, 0.17), mk(0.0930, 0.11)];

    // movement modulators
    this.lfoSlow = Math.random() * TWO_PI;
    this.lfoFast = Math.random() * TWO_PI;
    // very slow intensity swell (the shower waxing and waning); ~90s period
    this.swellPhase = Math.random() * TWO_PI;

    this.level = 0; // running fade
    this.metallic = 0; // tin-roof ring amount, set per block from the param
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

  // Begin a cluster: claim a free emitter slot and load it with a short burst
  // of drops for the given lane. Within-cluster gaps are short and right-skewed
  // so the clump sounds organic rather than evenly metered.
  startCluster(intensity, heaviness, patter) {
    let e = null;
    for (let i = 0; i < this.emitters.length; i++) if (!this.emitters[i].active) { e = this.emitters[i]; break; }
    if (!e) return;
    // clumps land mostly in the near/mid field where the ear notices them
    const r = this.rnd();
    e.lane = r < 0.35 ? 0 : r < 0.85 ? 1 : 2;
    e.remaining = 2 + Math.floor(this.rnd() * (2 + intensity * 6 + heaviness * 2 + patter * 6)); // 2..~16
    e.gMin = Math.floor(0.006 * SR);
    e.gMax = Math.floor(0.040 * SR);
    e.gap = Math.floor(0.002 * SR);
    e.active = true;
  }

  spawn(lane, intensity, heaviness, surface) {
    let v = null;
    for (let i = 0; i < this.voices.length; i++) if (!this.voices[i].active) { v = this.voices[i]; break; }
    if (!v) return;

    // Family mix. Solid taps dominate on hard ground; as the surface softens
    // (foliage, wet), leaves and water "plips" take over. Too many tonal events
    // reads as artificial, so water stays the minority everywhere.
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
    // soft surfaces sit darker and ring a touch longer (leaves, puddles damp
    // the top end); hard surfaces are brighter and snappier.
    const bright = 1.12 - surface * 0.34;
    const tail = 1 + surface * 0.45;

    // Brightness axis. This is the whole fix for "everything sounds like tin":
    // a raindrop on soft ground is a low, dull *pock*, not a bright tick in the
    // 2–4 kHz glass/metal register. By default (`metallic` = 0) the drops sit
    // LOW and broad; only as `metallic` climbs do their centres rise, their Q
    // tighten and their rings come up — so the sharp, ringing surface is opt-in
    // (Tin Roof / Window) and never the baseline.
    const m = this.metallic;
    const metalBright = 0.5 + m * 0.85;   // 0.5 dull → 1.35 bright/metallic
    // Low Q throughout: a short noise burst at high Q rings tonally (the "beep").
    if (kind === 'solid') {
      // Default centre ~430–1100 Hz (a soft tap); only metallic lifts it into
      // the bright tin register. Q stays broad until metallic tightens it.
      const f = (900 + this.rnd() * 1100) / heavy * bright * metalBright;
      const ringBase = (600 + this.rnd() * 700) / heavy;
      const ringHi = 2400 + this.rnd() * 2600;
      // Tonal "ting" ring. A per-drop random pitch is exactly what reads as wind
      // chimes, so it must NOT dominate a tin roof: a hard-hammered tin roof is
      // bright broadband *drumming*, while a tuned ting only suits sparse drops on
      // glass. So the ring peaks at moderate metallic (≈ At a Window) and fades
      // out as metallic climbs — at full Tin Roof it is nearly gone and the
      // broadband brightness carries the metal. `ting` is 1.0 exactly at
      // metallic 0.30, so the At a Window character is left unchanged.
      const ting = m < 0.30 ? 0.3 + 0.7 * (m / 0.30) : Math.max(0, 1 - (m - 0.30) / 0.50);
      this.takeAndTrigger(v, {
        freq: f, q: 0.5 + this.rnd() * 0.4 + m * 0.9,
        attackS: 0.0016, decayS: (0.006 + this.rnd() * 0.016) * heavy * tail,
        peak: 0.11 * laneGain, pan: lanePan,
        ringFreq: this.rnd() < (0.02 + m * 0.55) * ting ? ringBase + (ringHi - ringBase) * m : 0,
        ringAmt: (0.0008 + m * 0.022) * ting * laneGain, ringDecayS: 0.01 + this.rnd() * 0.012 + m * 0.07 * ting,
      });
    } else if (kind === 'leaf') {
      // Foliage damps the top hard — keep leaf hits dull regardless of metallic.
      const f = (650 + this.rnd() * 1000) / heavy * bright * (0.72 + m * 0.4);
      this.takeAndTrigger(v, {
        freq: f, q: 0.5 + this.rnd() * 0.4,
        attackS: 0.0024, decayS: (0.012 + this.rnd() * 0.03) * heavy * tail,
        peak: 0.07 * laneGain, pan: lanePan,
      });
    } else {
      // water plip: a low, soft noisy burst. The old high Q (1.4–2.6) rang as a
      // tonal "plip" that read as glass — keep it broad by default and only let
      // it resonate with metallic.
      const f = (560 + this.rnd() * 760) / heavy;
      this.takeAndTrigger(v, {
        freq: f, q: 0.7 + this.rnd() * 0.5 + m * 1.4,
        attackS: 0.0024, decayS: (0.018 + this.rnd() * 0.035) * heavy * tail,
        peak: (0.055 + surface * 0.02) * laneGain, pan: lanePan,
        ringFreq: f * (1 + this.rnd() * 0.25),
        ringAmt: (0.0012 + m * 0.005 + surface * 0.002) * laneGain, ringDecayS: 0.015 + this.rnd() * 0.018,
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
    const bed = params.bed[0];
    const drops = params.drops[0];
    const movement = params.movement[0];
    const space = params.space[0];
    const running = params.running[0];
    const metallic = params.metallic[0];
    this.metallic = metallic; // also stash for spawn()

    // Derived (folded) controls — one macro slider drives each pair:
    //  movement → slow swell + drop clustering
    //  surface  → bed colour (soft surface dulls the curtain too)
    //  space    → stereo width (alongside the early reflections below)
    const swell = movement * 0.4;
    const patter = 0.25 + movement * 0.6;
    const tone = Math.max(0, 0.75 - surface * 0.6);
    const width = 0.62 + space * 0.5;

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

    // background lane rates (events/sec), scaled by the swelled intensity. The
    // far lane carries the fine, quiet curtain; clusters add the near clumps.
    // Floor is low so intensity≈0 reads as a light drizzle, not a wall of bed.
    const k = 0.08 + effIntensity * 1.4;
    const nearRate = 1.6 * k, midRate = 8 * k, farRate = 42 * k;
    // patter steers how often clumps land and (in startCluster) how big they are
    const clusterRate = (0.18 + effIntensity * 0.8) * (0.3 + patter * 1.7);
    // drops sets how forward the surface hits sit against the bed. For the
    // surface variants (Roof / Window / Tin) the hits are the *subject* and push
    // well past the bed. For open-air rain the drops are a super-muted soft
    // patter — rain landing on soft ground or a tent canvas — so the floor is
    // low: at small `drops` the (already dull, de-tinned) hits sit well *under*
    // the bed rather than even with it.
    const dropGain = 0.5 + drops * 3.0;

    // per-band bed gains for this block: heaviness darkens (more body, less
    // air); intensity opens the top a little. Folds in each band's base level.
    // tone tilts the curtain: darker settings lift the body a touch and pull
    // the top down (away from the metallic edge); brighter settings open it up.
    const toneHi = 0.20 + tone * 1.25;       // high/air-band scale
    const toneLo = 1.12 - tone * 0.22;        // gentle low lift when dark
    // Sparkle: the 4 kHz "pitter-patter" and 8 kHz air bands are the colored,
    // metallic-leaning part of the curtain. They sit well down by default (a
    // soft, dark wash) and only open up with metallic — this, more than the
    // drops, is what made the whole shower read as rain on tin.
    const sparkle = 0.42 + metallic * 0.72;
    this.mult[0] = (0.80 + heaviness * 0.70) * BED_BANDS[0].base * toneLo;
    this.mult[1] = 1.00 * BED_BANDS[1].base;
    this.mult[2] = (1.10 - heaviness * 0.55) * (0.70 + intensity * 0.45) * BED_BANDS[2].base * toneHi * sparkle;
    this.mult[3] = (0.90 - heaviness * 0.65) * (0.45 + intensity * 0.65) * BED_BANDS[3].base * toneHi * sparkle;
    // Bed scales hard with intensity so it nearly clears out at intensity 0,
    // letting the discrete drops carry the low end of the range. The `bed`
    // control trims the whole curtain on top of that (1 = full, 0 = drops only).
    const bedMaster = (0.12 + effIntensity * 0.55) * 0.25 * bed;

    // advance each band's drifting gain target one bounded random-walk step
    for (let ch = 0; ch < 2; ch++) {
      for (let b = 0; b < BED_BANDS.length; b++) {
        const st = this.bed[ch][b], depth = BED_BANDS[b].depth;
        st.gt += (this.rnd() * 2 - 1) * 0.08;
        if (st.gt > 1 + depth) st.gt = 1 + depth;
        else if (st.gt < 1 - depth) st.gt = 1 - depth;
      }
    }

    // Brightness ceiling on the drop bus: a one-pole lowpass that sits low by
    // default (~2.4 kHz — soft rain on the ground) and opens toward ~9 kHz as
    // metallic rises (the bright, sharp top of a tin roof). This is the hard
    // guarantee that the default never reads as tin even if a stray bright atom
    // slips through.
    const evCut = 2600 + this.metallic * 6500;
    const evLpA = Math.exp(-TWO_PI * evCut / SR);

    // master lowpass cutoff: dark (~2.5 kHz) by default, wide open with metallic.
    // Recompute coefficients only when it moves enough to matter.
    const lpCut = 3800 + metallic * 8200;
    if (Math.abs(lpCut - this.masterLPcut) > 1) {
      this.masterLPcut = lpCut;
      this.masterLP_L.lowpass(lpCut, 0.707); this.masterLP_R.lowpass(lpCut, 0.707);
    }

    // space sets the early-reflection amount; surface tilts it (a sheltered /
    // foliage scene reflects a little more than open ground).
    const reflectGain = space * (0.95 + surface * 0.5);
    // width as a mid/side blend on the final stereo image
    const widthAmt = width;

    const lfoSlowInc = TWO_PI * 0.06 / SR;
    const lfoFastInc = TWO_PI * 0.5 / SR;
    const levelTarget = running > 0.5 ? 1 : 0;
    const levelCoef = Math.exp(-1 / (0.05 * SR)); // ~50ms fade

    for (let i = 0; i < n; i++) {
      // ── schedule events ──────────────────────────────────────────
      // background drizzle
      if (--this.nextNear <= 0) { this.spawn(0, intensity, heaviness, surface); this.nextNear = this.nextGap(nearRate); }
      if (--this.nextMid <= 0) { this.spawn(1, intensity, heaviness, surface); this.nextMid = this.nextGap(midRate); }
      if (--this.nextFar <= 0) { this.spawn(2, intensity, heaviness, surface); this.nextFar = this.nextGap(farRate); }
      // cluster onsets, then emit each active cluster's queued drops
      if (--this.nextCluster <= 0) { this.startCluster(intensity, heaviness, patter); this.nextCluster = this.nextGap(clusterRate); }
      for (let e = 0; e < this.emitters.length; e++) {
        const em = this.emitters[e];
        if (!em.active) continue;
        if (--em.gap <= 0) {
          this.spawn(em.lane, intensity, heaviness, surface);
          if (--em.remaining <= 0) { em.active = false; }
          else {
            // right-skewed gap: mostly tight, occasionally a longer pause
            const u = this.rnd();
            em.gap = em.gMin + Math.floor((em.gMax - em.gMin) * u * u * (1 + u));
          }
        }
      }

      // movement modulation
      this.lfoSlow += lfoSlowInc; if (this.lfoSlow > TWO_PI) this.lfoSlow -= TWO_PI;
      this.lfoFast += lfoFastInc; if (this.lfoFast > TWO_PI) this.lfoFast -= TWO_PI;
      const density = 0.82 + 0.18 * Math.sin(this.lfoSlow) + 0.05 * Math.sin(this.lfoFast);

      // ── multi-band bed ───────────────────────────────────────────
      const pink0 = this.pink(0), pink1 = this.pink(1);
      let bedL = 0, bedR = 0;
      for (let b = 0; b < BED_BANDS.length; b++) {
        const sl = this.bed[0][b], sr = this.bed[1][b];
        sl.g = sl.gt + (sl.g - sl.gt) * this.bedSmooth;
        sr.g = sr.gt + (sr.g - sr.gt) * this.bedSmooth;
        bedL += sl.filt.process(pink0) * sl.g * this.mult[b];
        bedR += sr.filt.process(pink1) * sr.g * this.mult[b];
      }
      const bg = bedMaster * density;
      bedL *= bg; bedR *= bg;

      // ── events ───────────────────────────────────────────────────
      let evL = 0, evR = 0;
      const noise = this.rnd() * 2 - 1;
      for (let vIdx = 0; vIdx < this.voices.length; vIdx++) {
        const v = this.voices[vIdx];
        if (!v.active) continue;
        const s = v.sample(noise);
        evL += s * v.panL; evR += s * v.panR;
      }
      // push the surface hits forward (and into the reflections below) by drops
      evL *= dropGain; evR *= dropGain;

      // brightness ceiling — dull by default, opens with metallic
      this.evLpL = evL + (this.evLpL - evL) * evLpA;
      this.evLpR = evR + (this.evLpR - evR) * evLpA;
      evL = this.evLpL; evR = this.evLpR;

      // ── early reflections (event bus only → drops feel placed) ───
      this.rbL[this.rbPos] = evL; this.rbR[this.rbPos] = evR;
      let rL = 0, rR = 0;
      for (let t = 0; t < this.tapsL.length; t++) {
        const tl = this.tapsL[t]; let il = this.rbPos - tl.d; if (il < 0) il += this.rbLen;
        rL += this.rbL[il] * tl.g;
        const tr = this.tapsR[t]; let ir = this.rbPos - tr.d; if (ir < 0) ir += this.rbLen;
        rR += this.rbR[ir] * tr.g;
      }
      // gentle high-frequency damping on the reflections (low coef = more
      // transient passes through, so the tail stays present rather than smeared)
      this.dL = rL + (this.dL - rL) * 0.3;
      this.dR = rR + (this.dR - rR) * 0.3;
      evL += this.dL * reflectGain;
      evR += this.dR * reflectGain;
      this.rbPos++; if (this.rbPos >= this.rbLen) this.rbPos = 0;

      // stereo width as a mid/side blend on the summed shower
      let sumL = bedL + evL, sumR = bedR + evR;
      const mid = (sumL + sumR) * 0.5, side = (sumL - sumR) * 0.5 * widthAmt;
      let outL = this.masterLP_L.process(this.masterHP_L.process(mid + side));
      let outR = this.masterLP_R.process(this.masterHP_R.process(mid - side));

      // running fade
      this.level = levelTarget + (this.level - levelTarget) * levelCoef;
      outL *= this.level; outR *= this.level;

      // soft clip
      L[i] = Math.tanh(outL * 1.05);
      if (R !== L) R[i] = Math.tanh(outR * 1.05);
    }
    return true;
  }
}

registerProcessor('rain-gen', RainProcessor);
