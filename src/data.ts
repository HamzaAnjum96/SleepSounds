import type { Preset, Sound, SoundState } from './types';

// ── WAV generation helpers ─────────────────────────────────────────────────

const SR = 32000;
const SECS = 32;
const N = SR * SECS;
const EDGE_FADE_S = 0.02;
const LOOP_BLEND_S = 1.2;

function makeWav(i16: Int16Array, sr: number): string {
  const dataLen = i16.byteLength;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const s = (o: number, t: string) =>
    [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); s(8, 'WAVE');
  s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, dataLen, true);
  new Int16Array(buf, 44).set(i16);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function gen(f32: Float32Array, gain = 0.7): string {
  normalizeForLoop(f32);
  let max = 0;
  for (let i = 0; i < f32.length; i++) max = Math.max(max, Math.abs(f32[i]));
  const scale = max > 0 ? (gain * 32767) / max : 32767;
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const dither = (Math.random() - 0.5) + (Math.random() - 0.5);
    i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * scale + dither)));
  }
  return makeWav(i16, SR);
}

function normalizeForLoop(buf: Float32Array): void {
  removeDc(buf);
  applyLoopBlend(buf, Math.floor(SR * LOOP_BLEND_S));
  applyEdgeFade(buf, Math.floor(SR * EDGE_FADE_S));
  softClip(buf, 1.12);
}

function lp1(buf: Float32Array, fc: number): void {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let y = 0;
  for (let i = 0; i < buf.length; i++) { y = a * y + (1 - a) * buf[i]; buf[i] = y; }
}

function hp1(buf: Float32Array, fc: number): void {
  const a = Math.exp((-2 * Math.PI * fc) / SR);
  let x0 = 0, y0 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x1 = buf[i]; y0 = a * (y0 + x1 - x0); x0 = x1; buf[i] = y0;
  }
}

// 2nd-order Butterworth LP (12 dB/oct) — steeper rolloff for transient events
function lp2(buf: Float32Array, fc: number): void {
  const w0 = (2 * Math.PI * Math.min(fc, SR * 0.49)) / SR;
  const cosW = Math.cos(w0);
  const alpha = Math.sin(w0) / 1.4142; // Q = 1/√2
  const b0 = (1 - cosW) / 2, b1 = 1 - cosW, b2 = (1 - cosW) / 2;
  const a0 = 1 + alpha, a1 = -2 * cosW, a2 = 1 - alpha;
  const nb0 = b0/a0, nb1 = b1/a0, nb2 = b2/a0, na1 = a1/a0, na2 = a2/a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = nb0*x0 + nb1*x1 + nb2*x2 - na1*y1 - na2*y2;
    buf[i] = y0; x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
}

function bp2(buf: Float32Array, fc: number, q: number): void {
  const w0 = (2 * Math.PI * fc) / SR;
  const alpha = Math.sin(w0) / (2 * Math.max(0.05, q));
  const cos = Math.cos(w0);
  const b0 = alpha;
  const b1 = 0;
  const b2 = -alpha;
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  const nb0 = b0 / a0;
  const nb1 = b1 / a0;
  const nb2 = b2 / a0;
  const na1 = a1 / a0;
  const na2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x0 = buf[i];
    const y0 = nb0 * x0 + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    buf[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
}

function removeDc(buf: Float32Array): void {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  const dc = sum / buf.length;
  for (let i = 0; i < buf.length; i++) buf[i] -= dc;
}

function applyEdgeFade(buf: Float32Array, fadeSamples: number): void {
  const n = Math.max(1, Math.min(fadeSamples, Math.floor(buf.length / 2)));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const w = 0.5 - 0.5 * Math.cos(Math.PI * t);
    buf[i] *= w;
    buf[buf.length - 1 - i] *= w;
  }
}

function applyLoopBlend(buf: Float32Array, blendSamples: number): void {
  const n = Math.max(1, Math.min(blendSamples, Math.floor(buf.length / 3)));
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Cosine equal-power crossfade: a² + b² = cos² + sin² = 1 (constant power).
    // Unlike the previous sqrt curves (which have slope -0.5 at t=0), the cosine
    // curves have zero slope at t=0, giving C¹ continuity at the blend boundary
    // and eliminating the gain-rate kink that produced subtle amplitude modulation
    // artefacts at the loop start/end edges.
    const a = Math.cos(0.5 * Math.PI * t);  // 1 → 0, zero slope at t=0
    const b = Math.sin(0.5 * Math.PI * t);  // 0 → 1, zero slope at t=0
    const s = buf[i];
    const e = buf[buf.length - n + i];
    const blended = s * a + e * b;
    buf[i] = blended;
    buf[buf.length - n + i] = blended;
  }
}

function softClip(buf: Float32Array, drive: number): void {
  const inv = 1 / Math.tanh(drive);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = Math.tanh(buf[i] * drive) * inv;
  }
}

function smoothRandomLfo(min: number, max: number, minHoldS: number, maxHoldS: number): Float32Array {
  const out = new Float32Array(N);
  let idx = 0;
  let prev = min + Math.random() * (max - min);
  while (idx < N) {
    const hold = Math.floor((minHoldS + Math.random() * (maxHoldS - minHoldS)) * SR);
    const seg = Math.max(1, Math.min(hold, N - idx));
    const next = min + Math.random() * (max - min);
    for (let i = 0; i < seg; i++) {
      const t = i / seg;
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * t);
      out[idx + i] = prev + (next - prev) * eased;
    }
    prev = next;
    idx += seg;
  }
  return out;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function chance(p: number): boolean {
  return Math.random() < p;
}

function whiteNoise(): Float32Array {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = Math.random() * 2 - 1;
  return buf;
}

function brownNoise(): Float32Array {
  const buf = new Float32Array(N);
  let last = 0;
  for (let i = 0; i < N; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    buf[i] = last;
  }
  return buf;
}

function pinkNoise(): Float32Array {
  const buf = new Float32Array(N);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    buf[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
    b6=w*0.115926;
  }
  return buf;
}

// ── Sound generators ───────────────────────────────────────────────────────

function genForest(): string {
  // Forest canopy: leafy broadband bed + twig flicks + distant bird-like highs
  const buf = pinkNoise();
  hp1(buf, 120);
  lp1(buf, 2200);
  for (let i = 0; i < N; i++) {
    const breeze = 0.70 + 0.30 * Math.abs(Math.sin((2 * Math.PI * 0.044 * i) / SR + 0.4));
    buf[i] *= breeze;
  }
  const twigs = new Float32Array(N);
  let twigPos = Math.floor(SR * 0.2);
  while (twigPos < N) {
    const len = Math.floor(SR * rand(0.004, 0.018));
    for (let i = 0; i < len && twigPos + i < N; i++) {
      const env = Math.exp(-7.5 * (i / len));
      twigs[twigPos + i] += (Math.random() * 2 - 1) * env * rand(0.04, 0.14);
    }
    twigPos += Math.floor(SR * rand(0.11, 0.55));
  }
  hp1(twigs, 1400);
  lp1(twigs, 5400);

  const canopy = new Float32Array(N);
  for (let i = 0; i < N; i++) canopy[i] = buf[i] * 0.86 + twigs[i] * 0.14;
  return gen(canopy, 0.58);
}

function genStream(): string {
  // Babbling brook: turbulent flow + dense bubble pings with downward glides
  const buf = whiteNoise();
  hp1(buf, 420);
  lp1(buf, 4500); lp1(buf, 3200);
  const drift = smoothRandomLfo(0.7, 1.05, 1.2, 3.8);
  for (let i = 0; i < N; i++) {
    const g1 = 0.76 + 0.24 * Math.sin((2 * Math.PI * 0.30 * i) / SR);
    const g2 = 0.88 + 0.12 * Math.sin((2 * Math.PI * 1.3  * i) / SR + 0.8);
    const g3 = 0.93 + 0.07 * Math.sin((2 * Math.PI * 3.1  * i) / SR + 1.5);
    buf[i] *= g1 * g2 * g3 * drift[i];
  }
  // Bubbles: each is a damped noise burst resonating at its own unique frequency,
  // determined by the bubble's radius (small bubbles → high pitch, large → low).
  // Previously a single bp2 was applied to the entire accumulated bubble buffer,
  // which forced every bubble to ring at the same pitch — a single-frequency tonal
  // artefact that made the stream sound robotic.  Now each grain gets its own bp2
  // call with an independently drawn centre frequency, matching the physical model.
  const bubbles = new Float32Array(N);
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    const len    = Math.floor(SR * rand(0.006, 0.018));
    const amp    = rand(0.02, 0.10);
    const riseN2 = Math.max(2, Math.floor(SR * 0.0008));
    const bFreq  = rand(600, 1600);   // unique resonance per bubble
    const bQ     = rand(4, 9);
    const grain  = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const riseGain = Math.min(1, i / riseN2);
      grain[i] = (Math.random() * 2 - 1) * Math.exp(-8 * (i / len)) * amp * riseGain;
    }
    bp2(grain, bFreq, bQ);
    for (let i = 0; i < len && pos + i < N; i++) bubbles[pos + i] += grain[i];
    pos += Math.floor(SR * rand(0.02, 0.09));
  }
  lp2(bubbles, 2000);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * 0.86 + bubbles[i] * 0.14;
  return gen(mix, 0.60);
}

function genThunder(): string {
  // Thunder: near-subsonic atmospheric base + event-based strikes with multi-reflection rumble.
  // Each strike spawns 3–6 staggered reflections (off terrain/clouds), each lower and slower
  // than the last — this is what makes thunder "roll" rather than just go "boom".

  // Atmospheric base: near-inaudible subsonic pressure, always present
  const base = brownNoise();
  lp1(base, 45); lp1(base, 35); lp1(base, 28);
  const weatherLfo = smoothRandomLfo(0.25, 1.0, 3.0, 9.0); // weather changes slowly

  // Strike events
  const strikes = new Float32Array(N);
  let pos = Math.floor(SR * rand(1.8, 3.5));
  while (pos < N) {
    const strikeAmp = rand(0.45, 0.95);
    const distance = rand(0.15, 1.0); // 0=close, 1=very distant

    // Initial crack: only for close strikes, ultra-fast broadband transient
    if (distance < 0.5) {
      const crackLen = Math.floor(SR * rand(0.003, 0.011));
      const crackAmp = strikeAmp * (1 - distance * 2.0) * rand(0.6, 1.0);
      for (let i = 0; i < crackLen && pos + i < N; i++) {
        const env = Math.exp(-28 * i / Math.max(1, crackLen));
        strikes[pos + i] += (Math.random() * 2 - 1) * env * crackAmp;
      }
    }

    // Multi-reflection rumble: 3–6 echoes staggered in time
    const numRef = Math.floor(rand(3, 7));
    for (let r = 0; r < numRef; r++) {
      const delay = Math.floor(SR * (distance * 0.08 + r * rand(0.07, 0.28)));
      const rumbleLen = Math.floor(SR * rand(0.6, 2.8) * (1.0 + distance * 0.8));
      // Each reflection: lower pitch, longer tail, quieter
      const rumbleF = rand(28, 68) * Math.exp(-r * 0.09);
      const rumbleAmp = strikeAmp * Math.exp(-r * 0.52) * rand(0.55, 1.0);
      const start = pos + delay;
      for (let i = 0; i < rumbleLen && start + i < N; i++) {
        const p = i / rumbleLen;
        // Fast rise (~10% of duration), long exponential decay
        const riseW = 0.10 + distance * 0.12;
        const env = p < riseW
          ? p / riseW
          : Math.exp(-2.8 * (p - riseW));
        // 60% noise + 40% tonal — the tonal part gives the "bass note" quality
        const sig = (Math.random() * 2 - 1) * 0.60
                  + Math.sin(2 * Math.PI * rumbleF * (i / SR)) * 0.40;
        strikes[start + i] += sig * env * rumbleAmp;
      }
    }

    pos += Math.floor(SR * rand(5.0, 14.0));
  }

  // Filter strikes: thunder lives below ~300Hz
  lp1(strikes, 300); lp1(strikes, 220); lp1(strikes, 160);
  hp1(strikes, 16);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = base[i] * 0.55 * weatherLfo[i] + strikes[i] * 0.45;
  }
  return gen(mix, 0.78);
}

function genSpace(): string {
  // Two-layer deep drone with slow independent modulations
  const r1 = brownNoise();
  lp1(r1, 80); lp1(r1, 60); lp1(r1, 50);

  const r2 = brownNoise();
  lp1(r2, 200); lp1(r2, 160);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const m1 = 0.62 + 0.38 * Math.sin((2 * Math.PI * 0.037 * i) / SR);
    const m2 = 0.78 + 0.22 * Math.sin((2 * Math.PI * 0.016 * i) / SR + 1.1);
    mix[i] = r1[i] * 0.65 * m1 + r2[i] * 0.35 * m2;
  }
  return gen(mix, 0.62);
}

function genWhite(): string {
  const buf = whiteNoise();
  for (let i = 0; i < N; i++) buf[i] *= 0.5;
  return gen(buf, 0.65);
}

function genBrown(): string {
  // Leaky-integrator brown noise with α = 0.998, giving a −3 dB cutoff of ≈ 10 Hz
  // instead of the ≈ 100 Hz cutoff from the brownNoise() helper (α ≈ 0.98).
  // With the higher α the spectrum rolls off at −6 dB/oct from 10 Hz upward —
  // a near-true 1/f² (red-noise) density throughout the audible range — which
  // produces a significantly deeper, more subsonic rumble than the helper alone.
  // The brownNoise() helper keeps its original coefficient so other generators
  // (thunder base, fireplace roar, heartbeat chest) that use it in a mix are
  // not affected.
  const buf = new Float32Array(N);
  let last = 0;
  for (let i = 0; i < N; i++) {
    last = 0.998 * last + 0.002 * (Math.random() * 2 - 1);
    buf[i] = last;
  }
  return gen(buf, 0.65);
}

function genFireplace(): string {
  // 5 distinct layers: roar (breathing) + turbulence + snaps + pops + hiss.
  // Key fix: fire "breathes" with huge amplitude swings (28%–165%), not a gentle drift.

  // Roar: deep filtered brown noise, very heavily breathing
  const roar = brownNoise();
  lp1(roar, 420); lp1(roar, 310); lp1(roar, 220);
  const breath = smoothRandomLfo(0.28, 1.65, 0.35, 1.4);

  // Turbulence: combustion mid-range (the warm "whoosh" body)
  const turb = pinkNoise();
  hp1(turb, 300); lp1(turb, 920);
  const turbDrift = smoothRandomLfo(0.50, 1.50, 0.25, 0.90);

  // Hot-air hiss: very quiet, high-frequency
  const hiss = whiteNoise();
  hp1(hiss, 2400); lp1(hiss, 6500);
  const hissDrift = smoothRandomLfo(0.40, 1.10, 1.2, 3.5);

  const crackles = new Float32Array(N);

  // Snap crackles: power-law amplitude distribution — most are barely audible,
  // occasional ones are 3–4× louder, grouped in small bursts.
  let sPos = Math.floor(SR * 0.04);
  while (sPos < N) {
    // Burst or single: 25% chance of a cluster of 2–4 rapid snaps
    const isBurst = chance(0.22);
    const burstCount = isBurst ? Math.floor(rand(2, 5)) : 1;
    for (let b = 0; b < burstCount; b++) {
      const sLen = Math.floor(SR * rand(0.0005, 0.0028));
      // Power-law: 90% quiet (0.02–0.14), 10% loud pop (0.38–0.95)
      const sAmp = chance(0.10) ? rand(0.38, 0.95) : rand(0.02, 0.14);
      for (let i = 0; i < sLen && sPos + i < N; i++) {
        crackles[sPos + i] += (Math.random() * 2 - 1) * Math.exp(-35 * i / Math.max(1, sLen)) * sAmp;
      }
      if (b < burstCount - 1) sPos += Math.floor(SR * rand(0.003, 0.012));
    }
    sPos += Math.floor(SR * rand(0.10, 0.85));
  }

  // Log pops: 15–60ms, lower-freq resonant body — the "pop" of trapped moisture
  let pPos = Math.floor(SR * rand(0.4, 1.2));
  while (pPos < N) {
    const pLen = Math.floor(SR * rand(0.015, 0.058));
    const pAmp = rand(0.12, 0.52);
    const popF = rand(145, 490);
    for (let i = 0; i < pLen && pPos + i < N; i++) {
      const p = i / pLen;
      const env = Math.exp(-7.0 * p);
      crackles[pPos + i] += (
        Math.sin(2 * Math.PI * popF * (i / SR)) * 0.45 +
        (Math.random() * 2 - 1) * 0.55
      ) * env * pAmp;
    }
    pPos += Math.floor(SR * rand(0.28, 1.65));
  }

  hp1(crackles, 180); lp1(crackles, 5200);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = roar[i] * 0.45 * breath[i]
           + turb[i] * 0.30 * turbDrift[i]
           + crackles[i] * 0.20
           + hiss[i] * 0.05 * hissDrift[i];
  }
  return gen(mix, 0.66);
}

function genFan(): string {
  const airflow = pinkNoise();
  hp1(airflow, 200);
  lp1(airflow, 2200);

  const hum = brownNoise();
  lp1(hum, 120); lp1(hum, 120);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const flutter = 0.88 + 0.12 * Math.sin((2 * Math.PI * 18 * i) / SR);
    mix[i] = airflow[i] * 0.75 * flutter + hum[i] * 0.25;
  }
  return gen(mix, 0.65);
}

function genNight(): string {
  // Night insects: stridulation model — noise through narrow resonators, not pure sines.
  // Each cricket is white noise band-passed at its wing resonance frequency,
  // gated by an irregular chirp envelope with per-tooth amplitude variation.
  const buf = new Float32Array(N);

  const crickets = [
    { freq: 4200, q: 22, rate: 2.1, amp: 0.24, toothRate: 42, burstDuty: 0.13 },
    { freq: 4480, q: 18, rate: 1.85, amp: 0.20, toothRate: 38, burstDuty: 0.11 },
    { freq: 3980, q: 25, rate: 2.05, amp: 0.17, toothRate: 45, burstDuty: 0.14 },
    { freq: 4720, q: 20, rate: 1.65, amp: 0.13, toothRate: 35, burstDuty: 0.10 },
    { freq: 5100, q: 16, rate: 2.3, amp: 0.09, toothRate: 50, burstDuty: 0.09 },
  ];

  for (const c of crickets) {
    // Generate narrowband noise via resonant filter (stridulation resonance)
    const noise = whiteNoise();
    const resonated = new Float32Array(N);
    for (let i = 0; i < N; i++) resonated[i] = noise[i];
    bp2(resonated, c.freq, c.q);
    // Second pass for sharper resonance
    bp2(resonated, c.freq * rand(0.995, 1.005), c.q * 0.7);

    const rateDrift = smoothRandomLfo(0.82, 1.18, 1.5, 6.0);
    const ampDrift = smoothRandomLfo(0.6, 1.0, 3.0, 10.0);
    // Occasional silence periods (cricket pauses)
    const silenceLfo = smoothRandomLfo(0.0, 1.0, 4.0, 12.0);

    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const effectiveRate = c.rate * rateDrift[i];
      const cycle = (t * effectiveRate) % 1;

      // Two chirp bursts per cycle with slight asymmetry
      let env = 0;
      if (cycle < c.burstDuty) {
        env = Math.sin((cycle / c.burstDuty) * Math.PI);
      } else if (cycle >= 0.32 && cycle < 0.32 + c.burstDuty * 0.7) {
        env = Math.sin(((cycle - 0.32) / (c.burstDuty * 0.7)) * Math.PI) * 0.55;
      }

      // Stridulation tooth texture: rapid amplitude modulation at tooth-strike rate
      // This creates the characteristic "zz-zz" texture instead of a smooth tone
      if (env > 0) {
        const toothPhase = (t * c.toothRate * effectiveRate) % 1;
        const toothMod = 0.6 + 0.4 * Math.sin(toothPhase * 2 * Math.PI);
        env *= toothMod;
      }

      // Apply silence periods
      const silenceGate = silenceLfo[i] > 0.25 ? 1.0 : silenceLfo[i] / 0.25;
      buf[i] += resonated[i] * env * c.amp * ampDrift[i] * silenceGate;
    }
  }

  // Katydid-like background: slower, lower-pitched raspy buzz (different species)
  const katydid = whiteNoise();
  bp2(katydid, 2800, 12);
  const katyEnv = smoothRandomLfo(0.0, 0.06, 2.0, 8.0);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const buzzCycle = (t * 0.8) % 1;
    const gate = buzzCycle < 0.45 ? Math.sin((buzzCycle / 0.45) * Math.PI) ** 0.5 : 0;
    buf[i] += katydid[i] * gate * katyEnv[i];
  }

  return gen(buf, 0.52);
}

function genBirdsong(): string {
  // Specific call archetypes instead of random glides — each type maps to a
  // recognisable real-bird pattern. Long silences (minGap 3.5–9s) so it feels
  // like morning birds, not a constant soundtrack.
  //
  // Call types:
  //   A — Single ascending whistle (warbler/canary)
  //   B — Two-note "fee-BEE" (down then up, chickadee-like)
  //   C — Rapid 3–5 note trill at same pitch (wren)
  //   D — Three descending steps (thrush/dove)
  //   E — Short sharp "chip" contact call

  const buf = new Float32Array(N);
  // Activity LFO: creates genuine quiet periods of 10–20s
  // Activity LFO minimum raised to 0.25 so the skip condition (activity < 0.25) is
  // never satisfied: all call positions are rendered, only amplitude varies.  The old
  // min of 0.0 with 8–20 s hold times frequently kept activity below 0.25 for the
  // entire 32 s loop, causing 80 % of positions to be skipped and producing silence.
  const activityLfo = smoothRandomLfo(0.25, 1.0, 4.0, 12.0);

  // Render one note — phase accumulator so gliding pitch stays clean.
  // sin(2π·f(t)·t) is WRONG for a glide: as t grows the phase term f(t)·t
  // creates a chirp artefact that sounds like R2-D2. ph += 2π·f/SR is correct.
  // Waveshaper (tanh) adds warm odd harmonics without FM robotic artefacts.
  function renderNote(pos: number, f0: number, f1: number, len: number, amp: number): void {
    const vibRate   = rand(5, 10);
    const vibDepth  = rand(0.003, 0.010);
    const drive     = rand(1.3, 2.4);
    const invTanh   = 1 / Math.tanh(drive);
    const breathAmt = rand(0.14, 0.24);
    const riseN     = Math.max(2, Math.floor(SR * 0.003));
    let ph = rand(0, Math.PI * 2);
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / SR;
      const p = i / len;
      const riseGain = Math.min(1, i / riseN);
      const env = (Math.sin(p * Math.PI) ** 0.80) * riseGain;
      const glide = f0 + (f1 - f0) * p;
      const f = glide * (1 + vibDepth * Math.sin(2 * Math.PI * vibRate * t));
      ph += (2 * Math.PI * f) / SR;
      const tonal = Math.tanh(drive * Math.sin(ph)) * invTanh;
      const breath = (Math.random() * 2 - 1) * breathAmt * Math.exp(-4 * p);
      buf[pos + i] += env * amp * ((1 - breathAmt) * tonal + breath);
    }
  }

  const species = [
    { baseF: 2100, amp: 0.10, callTypes: ['A', 'B'] as const, minGap: 3.5, maxGap: 8.0 },
    { baseF: 3200, amp: 0.09, callTypes: ['C', 'E'] as const, minGap: 4.0, maxGap: 9.0 },
    { baseF: 1500, amp: 0.08, callTypes: ['D', 'A'] as const, minGap: 5.0, maxGap: 11.0 },
  ];

  for (const sp of species) {
    let pos = Math.floor(SR * rand(0.5, 3.0));
    while (pos < N) {
      const activity = activityLfo[Math.min(pos, N - 1)];
      if (activity < 0.25 && chance(0.80)) {
        pos += Math.floor(SR * rand(3.0, 8.0));
        continue;
      }
      const callType = sp.callTypes[Math.floor(Math.random() * sp.callTypes.length)];
      // ±18% pitch variation per call so same species sounds like small variation
      const pitchScale = rand(0.88, 1.15);
      const bf = sp.baseF * pitchScale;
      const amp = sp.amp * (0.75 + 0.5 * activity);

      if (callType === 'A') {
        // Single ascending whistle: ~110ms, rises ~20%
        const len = Math.floor(SR * rand(0.085, 0.130));
        renderNote(pos, bf * rand(0.90, 0.96), bf * rand(1.14, 1.22), len, amp);
        pos += len;

      } else if (callType === 'B') {
        // Two-note "fee-BEE": note1 falls, gap, note2 rises higher
        const len1 = Math.floor(SR * rand(0.055, 0.080));
        const len2 = Math.floor(SR * rand(0.055, 0.085));
        const gap  = Math.floor(SR * rand(0.032, 0.055));
        renderNote(pos, bf * rand(1.05, 1.12), bf * rand(0.88, 0.95), len1, amp);
        renderNote(pos + len1 + gap, bf * rand(0.82, 0.90), bf * rand(1.06, 1.16), len2, amp * 1.1);
        pos += len1 + gap + len2;

      } else if (callType === 'C') {
        // Rapid trill: 3–5 short same-pitch notes, quick gaps
        const noteCount = Math.floor(rand(3, 6));
        const noteLen = Math.floor(SR * rand(0.025, 0.042));
        const noteGap = Math.floor(SR * rand(0.010, 0.020));
        for (let n = 0; n < noteCount && pos < N; n++) {
          renderNote(pos, bf * rand(0.97, 1.03), bf * rand(0.98, 1.04), noteLen, amp);
          pos += noteLen + noteGap;
        }

      } else if (callType === 'D') {
        // Three descending steps: three notes each ~10% lower
        const stepLen = Math.floor(SR * rand(0.045, 0.065));
        const stepGap = Math.floor(SR * rand(0.022, 0.038));
        for (let n = 0; n < 3 && pos < N; n++) {
          const stepF = bf * Math.pow(0.88, n) * rand(0.97, 1.03);
          renderNote(pos, stepF * rand(1.01, 1.05), stepF * rand(0.95, 0.99), stepLen, amp);
          pos += stepLen + stepGap;
        }

      } else {
        // E — chip call: very short, flat or slight fall
        const len = Math.floor(SR * rand(0.020, 0.038));
        renderNote(pos, bf * rand(0.98, 1.02), bf * rand(0.92, 0.98), len, amp * 0.8);
        pos += len;
      }

      // Long inter-call gap — birds are sporadic, not constant
      pos += Math.floor(SR * rand(sp.minGap, sp.maxGap));
    }
  }

  hp1(buf, 900);
  lp1(buf, 7000);
  // No softClip — gen() normalises anyway and clip was causing aliasing harshness
  return gen(buf, 0.54);
}

function genCafe(): string {
  // 4 independent bandpass voices simulating conversation groups at different distances,
  // plus discrete events (cup clinks, chair scrapes) for dimensionality.
  const voiceDefs = [
    { fc: 310,  q: 1.5, amp: 0.26 }, // close deep voice
    { fc: 540,  q: 1.8, amp: 0.20 }, // nearby mid
    { fc: 820,  q: 2.2, amp: 0.16 }, // distant mid
    { fc: 1150, q: 2.8, amp: 0.10 }, // far, brighter
  ];
  const mix = new Float32Array(N);

  for (const v of voiceDefs) {
    const noise = pinkNoise();
    bp2(noise, v.fc, v.q);
    const actLfo = smoothRandomLfo(0.0, 1.0, 1.5, 6.0);
    for (let i = 0; i < N; i++) mix[i] += noise[i] * v.amp * (0.30 + 0.70 * actLfo[i]);
  }

  // Discrete events: cup clinks + occasional chair scrapes
  let ePos = Math.floor(SR * rand(0.8, 3.5));
  while (ePos < N) {
    if (chance(0.65)) {
      // Cup/glass clink: high resonant sine ping with fast decay
      const clinkF   = rand(1800, 4400);
      const clinkLen = Math.floor(SR * rand(0.06, 0.20));
      const clinkAmp = rand(0.05, 0.16);
      const riseN    = Math.max(2, Math.floor(SR * 0.001));
      for (let i = 0; i < clinkLen && ePos + i < N; i++) {
        const riseGain = Math.min(1, i / riseN);
        mix[ePos + i] += Math.sin(2 * Math.PI * clinkF * (i / SR))
          * Math.exp(-5 * (i / clinkLen)) * clinkAmp * riseGain;
      }
    } else {
      // Chair scrape: short broadband burst, filtered low
      const scrapeLen = Math.floor(SR * rand(0.04, 0.12));
      const scrapeAmp = rand(0.04, 0.10);
      for (let i = 0; i < scrapeLen && ePos + i < N; i++) {
        mix[ePos + i] += (Math.random() * 2 - 1) * Math.exp(-4 * (i / scrapeLen)) * scrapeAmp;
      }
    }
    ePos += Math.floor(SR * rand(1.8, 7.5));
  }

  hp1(mix, 180);
  lp2(mix, 1300);
  return gen(mix, 0.60);
}

function genAirplane(): string {
  // Cabin drone: steady filtered airflow + deep engine fundamental
  const air = pinkNoise();
  hp1(air, 160);
  lp1(air, 850); lp1(air, 680);

  const engine = brownNoise();
  lp1(engine, 58); lp1(engine, 48);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const flutter = 0.97 + 0.03 * Math.sin((2 * Math.PI * 11.3 * i) / SR);
    mix[i] = air[i] * 0.68 * flutter + engine[i] * 0.32;
  }
  return gen(mix, 0.68);
}

function genPink(): string {
  const buf = pinkNoise();
  return gen(buf, 0.65);
}

function genDryer(): string {
  // Tumbling dryer: low mechanical hum with soft, jittered thumps
  const hum = pinkNoise();
  hp1(hum, 65); lp1(hum, 280); lp1(hum, 210);

  // Event-based thumps with timing jitter — breaks the train-like metronomic feel
  const thumps = new Float32Array(N);
  const baseInterval = 1 / 0.85; // ~1.18s base drum rotation period
  let pos = Math.floor(SR * rand(0.1, 0.5));
  while (pos < N) {
    const thumpLen = Math.floor(SR * rand(0.04, 0.10));
    const amp = rand(0.18, 0.38);
    const f = rand(52, 88); // low drum resonance
    for (let i = 0; i < thumpLen && pos + i < N; i++) {
      const p = i / thumpLen;
      // Soft fabric-against-drum envelope — no sharp transient
      const env = Math.sin(p * Math.PI) ** 1.6;
      thumps[pos + i] += Math.sin(2 * Math.PI * f * (i / SR)) * env * amp;
    }
    // Jitter: ±20% timing variation so it never locks in as a train rhythm
    const jitter = rand(0.80, 1.20);
    pos += Math.floor(SR * baseInterval * jitter);
  }
  lp1(thumps, 200); lp1(thumps, 160);

  const mix = new Float32Array(N);
  const motorDrift = smoothRandomLfo(0.92, 1.08, 1.5, 5.0);
  for (let i = 0; i < N; i++) {
    mix[i] = hum[i] * 0.72 * motorDrift[i] + thumps[i] * 0.28;
  }
  return gen(mix, 0.65);
}

function genTrain(): string {
  // Train cabin: filtered drone + rail-joint pulses + subtle rattles
  const drone = pinkNoise();
  hp1(drone, 70); lp1(drone, 680); lp1(drone, 480);

  const pulses = new Float32Array(N);
  // Softer pulse shape — higher exponent = rounder, less click
  const pulseShape = (phase: number) => Math.sin(phase * Math.PI) ** 3.8;
  let next = Math.floor(SR * 0.2);
  while (next < N) {
    const interval = Math.floor(SR * rand(0.50, 0.68));
    const lenA = Math.floor(SR * rand(0.025, 0.045));
    const lenB = Math.floor(SR * rand(0.016, 0.032));
    const offsetB = Math.floor(SR * rand(0.06, 0.14));
    // Metallic noise kernel mixed with the tonal shape — turns click into muffled clunk
    const noiseAmpA = rand(0.06, 0.14);
    for (let i = 0; i < lenA && next + i < N; i++) {
      const s = pulseShape(i / lenA);
      pulses[next + i] += s * rand(0.18, 0.36) + (Math.random() * 2 - 1) * s * noiseAmpA;
    }
    const noiseAmpB = rand(0.04, 0.10);
    for (let i = 0; i < lenB && next + offsetB + i < N; i++) {
      const s = pulseShape(i / lenB);
      pulses[next + offsetB + i] += s * rand(0.10, 0.24) + (Math.random() * 2 - 1) * s * noiseAmpB;
    }
    next += interval;
  }
  bp2(pulses, 420, 1.2);
  lp2(pulses, 480); // steeper rolloff than lp1 chain — kills the spectral edge click

  const rattles = new Float32Array(N);
  let rPos = Math.floor(SR * 0.15);
  while (rPos < N) {
    const len = Math.floor(SR * rand(0.006, 0.03));
    for (let i = 0; i < len && rPos + i < N; i++) {
      const env = Math.exp(-5 * (i / len));
      rattles[rPos + i] += (Math.random() * 2 - 1) * env * rand(0.03, 0.09);
    }
    rPos += Math.floor(SR * rand(0.14, 0.65));
  }
  hp1(rattles, 800);
  lp1(rattles, 3500); // lower ceiling on rattles too

  const mix = new Float32Array(N);
  const sway = smoothRandomLfo(0.84, 1.16, 1.2, 4.0);
  for (let i = 0; i < N; i++) {
    // Slower wheel modulation — 8.7Hz was too fast/obvious
    const wheel = 0.92 + 0.08 * Math.sin((2 * Math.PI * 3.4 * i) / SR);
    mix[i] = drone[i] * 0.62 * sway[i] * wheel + pulses[i] * 0.26 + rattles[i] * 0.12;
  }
  return gen(mix, 0.68);
}

function genWaterfall(): string {
  // Waterfall: dense broad-spectrum water noise with pressure surges and impact detail
  const low = brownNoise();
  hp1(low, 120);
  lp1(low, 1000); lp1(low, 760);

  const spray = whiteNoise();
  hp1(spray, 1200);
  lp1(spray, 5200); lp1(spray, 3800);

  const impacts = new Float32Array(N);
  let pos = Math.floor(SR * 0.04);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.004, 0.016));
    for (let i = 0; i < len && pos + i < N; i++) {
      const env = Math.exp(-6.5 * (i / len));
      impacts[pos + i] += (Math.random() * 2 - 1) * env * rand(0.03, 0.1);
    }
    pos += Math.floor(SR * rand(0.01, 0.065));
  }
  hp1(impacts, 900);
  lp1(impacts, 7000);
  const mix = new Float32Array(N);
  const flow = smoothRandomLfo(0.82, 1.18, 0.7, 2.1);
  for (let i = 0; i < N; i++) {
    const plunge = 0.70 + 0.30 * Math.sin((2 * Math.PI * 0.13 * i) / SR + 0.5);
    mix[i] = low[i] * 0.56 * flow[i] + spray[i] * 0.34 * plunge + impacts[i] * 0.10;
  }
  return gen(mix, 0.66);
}

function genFrogs(): string {
  // Frog chorus: 4 species spanning bass→treble for a real pond soundscape.
  // Bullfrogs (deep), tree frogs (mid), chorus frogs (high), peepers (very high).
  // Shared chorus activity creates natural swells and silences.
  const croaks = new Float32Array(N);
  const chorusLfo = smoothRandomLfo(0.2, 1.0, 5.0, 14.0);

  const species = [
    // Bullfrog: deep "jug-o-rum", slow and dramatic
    { fMin: 100, fMax: 165, sacR: 1.88, sub: 0.12, nz: 0.15,
      minGap: 2.0, maxGap: 5.0, amp: 0.26, pMin: 2, pMax: 4 },
    // Tree frog: mid "ribbit", moderately paced
    { fMin: 580, fMax: 950, sacR: 1.65, sub: 0.06, nz: 0.22,
      minGap: 0.8, maxGap: 2.5, amp: 0.18, pMin: 3, pMax: 6 },
    // Chorus frog: higher, faster, raspy
    { fMin: 1600, fMax: 2400, sacR: 1.48, sub: 0.02, nz: 0.28,
      minGap: 0.5, maxGap: 1.6, amp: 0.14, pMin: 2, pMax: 4 },
    // Spring peeper: high pitched, short single calls
    { fMin: 2700, fMax: 3300, sacR: 1.35, sub: 0.0, nz: 0.32,
      minGap: 1.2, maxGap: 3.0, amp: 0.10, pMin: 1, pMax: 2 },
  ];

  for (const sp of species) {
    const sacRatio = sp.sacR * rand(0.94, 1.06); // per-frog variation
    let pos = Math.floor(SR * Math.random() * 2.0);
    while (pos < N) {
      const activity = chorusLfo[Math.min(pos, N - 1)];
      if (activity < 0.3 && chance(0.65)) {
        pos += Math.floor(SR * rand(2.0, 5.0));
        continue;
      }
      const pulseCount = Math.floor(rand(sp.pMin, sp.pMax + 1));
      const baseFreq = rand(sp.fMin, sp.fMax);
      let eventPos = pos;
      for (let pIdx = 0; pIdx < pulseCount && eventPos < N; pIdx++) {
        const len = Math.floor(SR * rand(0.04, 0.14));
        const pulseGap = Math.floor(SR * rand(0.022, 0.065));
        const freq = baseFreq * rand(0.93, 1.07);
        // Phase accumulators: sin(2π·freq·t) is WRONG when freq changes —
        // the product freq·t creates a chirp/laser sweep. Integrate instead.
        const pitchDropAmt = rand(0.03, 0.10);
        const flutterRate  = rand(10, 22);   // was 18–38 Hz: double that with abs(sin) → 36–76 Hz electronic buzz
        const flutterDepth = rand(0.10, 0.22);
        const riseN = Math.max(2, Math.floor(SR * 0.002));
        const decayAmt = rand(0.28, 0.65);
        const envShape = rand(1.3, 2.0);
        let phTone = rand(0, Math.PI * 2);
        let phSac  = rand(0, Math.PI * 2);
        let ph2h   = rand(0, Math.PI * 2);
        let phSub  = rand(0, Math.PI * 2);
        for (let i = 0; i < len && eventPos + i < N; i++) {
          const t = i / SR;
          const frac = i / len;
          const riseGain = Math.min(1, i / riseN);
          const env = (Math.sin(frac * Math.PI) ** envShape)
                    * Math.exp(-decayAmt * frac)
                    * activity * riseGain;
          const pitchNow = freq * (1 - pitchDropAmt * frac);
          phTone += (2 * Math.PI * pitchNow) / SR;
          phSac  += (2 * Math.PI * pitchNow * sacRatio) / SR;
          ph2h   += (2 * Math.PI * pitchNow * 2.0) / SR;
          phSub  += (2 * Math.PI * pitchNow * 0.5) / SR;
          // Regular sine flutter: 1 ± depth, centred at 1.0.  The previous
          // Math.abs(sin) doubled the effective modulation frequency (rectified
          // sine) producing 36–76 Hz electronic buzz.
          const flutter = 1.0 + flutterDepth * Math.sin(2 * Math.PI * flutterRate * t);
          // Onset attack noise (exponential burst at start of each pulse)
          const onsetNoise   = (Math.random() * 2 - 1) * sp.nz * 1.2 * Math.exp(-8 * frac);
          // Sustained breath noise: adds organic texture throughout the call body
          // instead of a pure-sine sustain which sounds electronic.
          const sustainNoise = (Math.random() * 2 - 1) * sp.nz * 0.30;
          croaks[eventPos + i] += (
            0.52 * Math.sin(phTone) * flutter +
            0.20 * Math.sin(phSac  + 0.4) +
            0.07 * Math.sin(ph2h   + 0.65) * flutter +   // reduced from 0.12: 2× harmonic was adding electronic brightness
            sp.sub * Math.sin(phSub + 0.2) +
            onsetNoise + sustainNoise
          ) * env * sp.amp;
        }
        eventPos += len + pulseGap;
      }
      const gapMod = 1.0 + (1.0 - activity) * 1.8;
      pos += Math.floor(SR * (sp.minGap + Math.random() * (sp.maxGap - sp.minGap)) * gapMod);
    }
  }

  // Dark ambient — barely audible, no hiss
  const amb = brownNoise();
  lp1(amb, 260); lp1(amb, 180);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = croaks[i] * 0.92 + amb[i] * 0.08;
  hp1(mix, 45);
  lp1(mix, 4800);
  return gen(mix, 0.58);
}

function genShower(): string {
  // Shower: dense hiss + tiled-room body + sparkling droplets
  const hiss = whiteNoise();
  hp1(hiss, 900);
  lp1(hiss, 7600);

  const body = pinkNoise();
  hp1(body, 180);
  lp1(body, 1800);

  const droplets = new Float32Array(N);
  const riseN = Math.max(2, Math.floor(SR * 0.001));
  let pos = Math.floor(SR * 0.03);
  while (pos < N) {
    const len = Math.floor(SR * (0.004 + Math.random() * 0.01));
    const amp = 0.08 + Math.random() * 0.18;
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / Math.max(1, len - 1);
      const riseGain = Math.min(1, i / riseN);
      const env = Math.exp(-8 * t) * riseGain;
      droplets[pos + i] += (Math.random() * 2 - 1) * amp * env;
    }
    pos += Math.floor(SR * (0.01 + Math.random() * 0.028));
  }
  hp1(droplets, 1200);
  lp1(droplets, 5200);

  const mix = new Float32Array(N);
  const pressure = smoothRandomLfo(0.86, 1.12, 0.8, 2.2);
  for (let i = 0; i < N; i++) {
    mix[i] = hiss[i] * 0.54 * pressure[i] + body[i] * 0.30 + droplets[i] * 0.16;
  }
  return gen(mix, 0.66);
}

function genTentRain(): string {
  // Rain on tent fabric: clustered tap bursts exciting short modal resonances
  const bed = pinkNoise();
  hp1(bed, 240);
  lp1(bed, 3000);

  const taps = new Float32Array(N);
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    const cluster = Math.floor(SR * rand(0.07, 0.3));
    const clusterEnd = Math.min(N, pos + cluster);
    while (pos < clusterEnd) {
      const amp = rand(0.08, 0.24);
      const modes = [rand(620, 980), rand(980, 1650), rand(1650, 2400)];
      const decays = [rand(0.007, 0.012), rand(0.006, 0.011), rand(0.004, 0.008)];
      const len = Math.floor(SR * rand(0.008, 0.022));
      for (let i = 0; i < len && pos + i < N; i++) {
        const t = i / SR;
        let s = 0;
        for (let m = 0; m < modes.length; m++) {
          s += Math.sin(2 * Math.PI * modes[m] * t + m * 0.6) * Math.exp(-i / (SR * decays[m])) * (1 / (m + 1));
        }
        taps[pos + i] += s * amp;
      }
      pos += Math.floor(SR * rand(0.01, 0.07));
    }
    pos += Math.floor(SR * rand(0.04, 0.3));
  }
  hp1(taps, 450);
  lp1(taps, 5200);

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.75, 1.25, 1.3, 4.0);
  for (let i = 0; i < N; i++) mix[i] = bed[i] * 0.66 * gust[i] + taps[i] * 0.34;
  return gen(mix, 0.64);
}

function genTinRoofRain(): string {
  // Corrugated tin roof rain: impacts exciting a lightweight modal panel bank
  const bed = pinkNoise();
  hp1(bed, 200);
  lp1(bed, 3600);

  const ping = new Float32Array(N);
  const reson = new Float32Array(N);
  let pos = Math.floor(SR * 0.04);
  while (pos < N) {
    // Longer pings (15–50 ms) with slower decay so they register as pitched taps
    const len = Math.floor(SR * rand(0.015, 0.050));
    const amp = rand(0.09, 0.30);
    const hitF = rand(1400, 5200);
    const riseN = Math.max(2, Math.floor(SR * 0.001));
    // Inharmonic partials (ratios 1, 2.27, 3.73) give metallic "tin" character
    const h2 = hitF * 2.27;
    const h3 = hitF * 3.73;
    let ph1 = 0, ph2 = 0, ph3 = 0;
    for (let i = 0; i < len && pos + i < N; i++) {
      ph1 += (2 * Math.PI * hitF) / SR;
      ph2 += (2 * Math.PI * h2)   / SR;
      ph3 += (2 * Math.PI * h3)   / SR;
      // Slower decay (factor 4 vs old 9) so ping lasts long enough to sound metallic
      const env = Math.exp(-4 * (i / len)) * Math.min(1, i / riseN);
      ping[pos + i] += (
        0.60 * Math.sin(ph1) +
        0.28 * Math.sin(ph2) +
        0.12 * Math.sin(ph3)
      ) * env * amp;
    }
    // Panel modes spanning 400–4000 Hz (report: 14–22 modes, Q 8–40, decay 80–350 ms).
    // Two clusters: low-mid (400–900 Hz, "thud bloom") + high-mid (1–4 kHz, "tink ring").
    const baseLo = rand(380, 580);
    const baseHi = rand(900, 1400);
    const panelModes = [
      ...Array.from({ length: 7 }, (_, idx) => baseLo * (1 + idx * rand(0.34, 0.58)) * rand(0.97, 1.03)),
      ...Array.from({ length: 7 }, (_, idx) => baseHi * (1 + idx * rand(0.28, 0.50)) * rand(0.97, 1.03)),
    ];
    const ringLen = Math.floor(SR * rand(0.10, 0.35));
    for (let i = 0; i < ringLen && pos + i < N; i++) {
      const t = i / SR;
      let s = 0;
      for (let m = 0; m < panelModes.length; m++) {
        // Higher modes damp faster (shorter decay) — physically motivated
        const decay = 1.8 + m * 0.22;
        s += Math.sin(2 * Math.PI * panelModes[m] * t + m * 0.7) * Math.exp(-(i / ringLen) * decay) * rand(0.06, 0.18);
      }
      reson[pos + i] += s * amp * 0.50 * Math.min(1, i / riseN);
    }
    pos += Math.floor(SR * rand(0.005, 0.028));
  }

  hp1(ping, 900);
  lp1(ping, 9000);
  hp1(reson, 200);
  lp1(reson, 3500);

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.84, 1.2, 0.9, 3.2);
  for (let i = 0; i < N; i++) {
    // Increase reson share (0.13 → 0.22) and trim bed to compensate
    mix[i] = bed[i] * 0.51 * gust[i] + ping[i] * 0.27 + reson[i] * 0.22;
  }
  return gen(mix, 0.70);
}

function genHeartbeat(): string {
  // Realistic lub-dub with heart rate variability (HRV) and thumpy resonance.
  // Key fixes: ±12% beat-to-beat timing variation, each beat is 40% tonal + 60%
  // filtered noise (a real heartbeat sounds like a thump, not a sine wave).
  const beat = new Float32Array(N);
  const bpm = rand(58, 70);
  const baseInterval = SR * (60 / bpm);
  const hrvLfo = smoothRandomLfo(0.88, 1.12, 4.0, 11.0); // slow HRV drift

  // Per-beat chest body resonance: small brown noise burst filtered low
  const chestNoise = brownNoise();
  lp1(chestNoise, 160); lp1(chestNoise, 120);

  let c = Math.floor(SR * 0.4);
  while (c < N) {
    const amp1 = rand(0.58, 0.82);

    // S1 (lub): louder, lower, longer — mitral valve snap excites chest cavity
    const s1Len = Math.floor(SR * rand(0.072, 0.100));
    const s1F = rand(55, 75);
    for (let i = 0; i < s1Len && c + i < N; i++) {
      const p = i / s1Len;
      // Fast rise (8% of duration), then exponential decay
      const env = p < 0.08 ? (p / 0.08) ** 0.6 : Math.exp(-5.2 * (p - 0.08));
      // Inharmonic ratio (1.72×) makes it feel like a resonant cavity, not a sine
      const tonal = Math.sin(2 * Math.PI * s1F * (i / SR)) * 0.40
                  + Math.sin(2 * Math.PI * s1F * 1.72 * (i / SR)) * 0.20;
      const thump = chestNoise[c + i] * 1.50; // filtered low — no click
      beat[c + i] += (tonal + thump) * env * amp1;
    }

    // Chest resonance tail after S1
    const chestLen = Math.floor(SR * 0.038);
    for (let i = 0; i < chestLen && c + i < N; i++) {
      const env = Math.exp(-6.0 * i / chestLen);
      beat[c + i] += chestNoise[c + i] * env * amp1 * 0.18;
    }

    // S2 (dub): quieter, shorter, slightly higher — aortic valve closure
    const s2Off = Math.floor(SR * rand(0.14, 0.22));
    const s2Len = Math.floor(SR * rand(0.042, 0.065));
    const s2F = rand(70, 92);
    const amp2 = amp1 * rand(0.48, 0.68);
    for (let i = 0; i < s2Len && c + s2Off + i < N; i++) {
      const p = i / s2Len;
      const env = p < 0.08 ? (p / 0.08) ** 0.6 : Math.exp(-6.5 * (p - 0.08));
      const tonal = Math.sin(2 * Math.PI * s2F * (i / SR)) * 0.42
                  + Math.sin(2 * Math.PI * s2F * 1.68 * (i / SR)) * 0.18;
      const thump = (Math.random() * 2 - 1) * 0.40;
      beat[c + s2Off + i] += (tonal + thump) * env * amp2;
    }

    // Advance by interval with per-beat HRV
    c += Math.floor(baseInterval * hrvLfo[Math.min(c, N - 1)]);
  }

  // Warm body sound: blood flow and muscle
  const body = brownNoise();
  lp1(body, 95); lp1(body, 72);
  const breathing = smoothRandomLfo(0.72, 1.0, 1.8, 4.5);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = beat[i] * 0.82 + body[i] * 0.18 * breathing[i];
  }
  lp1(mix, 260);
  hp1(mix, 20);
  return gen(mix, 0.57);
}

function genUnderwater(): string {
  // Deep underwater: low pressure rumble + soft bubble streams
  const depth = brownNoise();
  lp1(depth, 140); lp1(depth, 110); lp1(depth, 85);
  hp1(depth, 20);
  // Underwater bubbles: damped noise bursts with rise ramp, filtered to resonant ring
  const bubbles = new Float32Array(N);
  let pos = Math.floor(SR * 0.35);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.015, 0.055));
    const amp = rand(0.03, 0.09);
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / len;
      const riseGain = Math.min(1, i / 3);
      bubbles[pos + i] += (Math.random() * 2 - 1) * Math.exp(-6 * p) * amp * riseGain;
    }
    pos += Math.floor(SR * rand(0.45, 1.45));
  }
  hp1(bubbles, 70);
  bp2(bubbles, rand(140, 260), rand(4, 8)); // resonant ring at bubble frequency
  lp2(bubbles, 650);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const b1 = 0.68 + 0.32 * Math.sin((2 * Math.PI * 0.28 * i) / SR);
    const b2 = 0.84 + 0.16 * Math.sin((2 * Math.PI * 0.71 * i) / SR + 0.9);
    mix[i] = depth[i] * b1 * b2 * 0.86 + bubbles[i] * 0.14;
  }
  return gen(mix, 0.60);
}

function genRain(): string {
  // Rain: diffuse bed + clustered impacts + tonal bubble-like micro-events
  const bed = pinkNoise();
  // HP at 180 Hz (not 260) to preserve the 200–250 Hz "moderate" energy band per report
  hp1(bed, 180);
  lp1(bed, 5600);
  const density = smoothRandomLfo(0.65, 1.35, 0.8, 3.2);
  for (let i = 0; i < N; i++) bed[i] *= (0.76 + 0.24 * density[i]);

  const impacts = new Float32Array(N);
  const bubbles = new Float32Array(N);
  let pos = Math.floor(SR * 0.02);
  while (pos < N) {
    const clusterDur = Math.floor(SR * rand(0.08, 0.45));
    const clusterEnd = Math.min(N, pos + clusterDur);
    while (pos < clusterEnd) {
      const len = Math.floor(SR * rand(0.002, 0.009));
      // Log-normal amplitude: many quiet drops, occasional loud ones.
      // exp(uniform(−4.8, −1.6)) spans ~0.008–0.20 with geometric mean ~0.045.
      const amp = Math.exp(rand(-4.8, -1.6));
      // 1ms rise ramp — eliminates instant-on click
      const riseN = Math.max(2, Math.floor(SR * 0.001));
      for (let i = 0; i < len && pos + i < N; i++) {
        const riseGain = Math.min(1, i / riseN);
        const env = Math.exp(-8 * (i / Math.max(1, len))) * riseGain;
        impacts[pos + i] += (Math.random() * 2 - 1) * amp * env;
      }
      // Surface resonance ping: brief tuned ring excited by each drop
      if (chance(0.55)) {
        const pingF  = rand(700, 1800);
        const pingLen = Math.floor(SR * rand(0.003, 0.008));
        const pingAmp = amp * rand(0.25, 0.45);
        for (let i = 0; i < pingLen && pos + i < N; i++) {
          const riseGain = Math.min(1, i / 2);
          impacts[pos + i] += Math.sin(2 * Math.PI * pingF * (i / SR))
            * Math.exp(-14 * (i / pingLen)) * pingAmp * riseGain;
        }
      }
      if (chance(0.42)) {
        const bLen = Math.floor(SR * rand(0.01, 0.022));
        const f0 = rand(650, 1700);
        const f1 = f0 * rand(0.75, 0.92);
        const bAmp = rand(0.015, 0.055);
        // Phase accumulator: ph += 2π·f/SR avoids the sin(2π·f(t)·t) "chirp" artefact
        // where f and t both vary and their product creates an audible laser-sweep tone.
        let bPh = 0;
        for (let i = 0; i < bLen && pos + i < N; i++) {
          const p = i / Math.max(1, bLen - 1);
          const env = Math.exp(-5.5 * p);
          const f = f0 + (f1 - f0) * p;
          bPh += (2 * Math.PI * f) / SR;
          bubbles[pos + i] += Math.sin(bPh) * env * bAmp;
        }
      }
      pos += Math.floor(SR * rand(0.004, 0.03));
    }
    pos += Math.floor(SR * rand(0.03, 0.25));
  }
  hp1(impacts, 1400); lp1(impacts, 9000);
  hp1(bubbles, 420); lp1(bubbles, 4200);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = bed[i] * 0.80 + impacts[i] * 0.12 + bubbles[i] * 0.08;
  return gen(mix, 0.7);
}

function genOcean(): string {
  // Ocean shoreline: undertow body + cresting surf that blooms on each wave
  const base = brownNoise();
  lp1(base, 480); lp1(base, 360);

  const surf = pinkNoise();
  hp1(surf, 220);
  lp1(surf, 2000);

  // Random-interval wave envelope: 7–15s periods, variable amplitude sets.
  // Replaces the fixed 0.085 Hz sine which sounded metronomic.
  const waveEnvBuf = new Float32Array(N);
  let wPos = 0;
  while (wPos < N) {
    const period = Math.floor(SR * rand(7.0, 15.0));
    const wAmp   = rand(0.45, 1.0);
    for (let i = 0; i < period && wPos + i < N; i++) {
      const p = i / period;
      // Gradual swell → sharp crest → long washback
      let env: number;
      if (p < 0.38) env = Math.pow(p / 0.38, 1.6) * wAmp;
      else if (p < 0.52) env = wAmp;
      else env = Math.pow((1 - p) / 0.48, 0.75) * wAmp;
      waveEnvBuf[wPos + i] += env;
    }
    wPos += period;
  }

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const wEnv  = Math.min(1, waveEnvBuf[i]);
    const wBase = 0.24 + 0.76 * wEnv;
    const wSurf = 0.08 + 0.92 * Math.pow(wEnv, 1.8);
    mix[i] = base[i] * wBase * 0.62 + surf[i] * wSurf * 0.38;
  }
  return gen(mix, 0.72);
}

function genWind(): string {
  // Wind: gust-driven turbulence with drifting resonant edge tones
  const buf = pinkNoise();
  hp1(buf, 90);
  lp1(buf, 1400); lp1(buf, 900);
  const drift = smoothRandomLfo(0.84, 1.14, 1.8, 5.2);
  for (let i = 0; i < N; i++) {
    const g1 = 0.48 + 0.52 * Math.abs(Math.sin((2 * Math.PI * 0.038 * i) / SR));
    const g2 = 0.72 + 0.28 * Math.sin((2 * Math.PI * 0.11 * i) / SR + 1.3);
    const g3 = 0.88 + 0.12 * Math.sin((2 * Math.PI * 0.23 * i) / SR + 0.6);
    buf[i] *= g1 * g2 * g3 * drift[i];
  }
  // Multi-strip whistle: 4 narrow bandpass strips that fade in/out independently,
  // simulating wind tone drifting as air speed and angle change.
  const whistleStrips = [
    { fc: 360,  q: 4.0 },
    { fc: 620,  q: 4.5 },
    { fc: 960,  q: 4.2 },
    { fc: 1380, q: 5.0 },
  ];
  const whistleMix = new Float32Array(N);
  for (const s of whistleStrips) {
    const stripNoise = whiteNoise();
    bp2(stripNoise, s.fc, s.q);
    // Each strip has its own slow random fade — creates drifting tone character
    const stripLfo = smoothRandomLfo(0.0, 1.0, 1.4, 5.5);
    for (let i = 0; i < N; i++) whistleMix[i] += stripNoise[i] * stripLfo[i] * 0.25;
  }
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * 0.86 + whistleMix[i] * 0.14;
  return gen(mix, 0.68);
}

// ── Sound library ──────────────────────────────────────────────────────────

export const SOUND_LIBRARY: Sound[] = [
  { id: 'rain',        name: 'Rain',        category: 'Nature', url: genRain() },
  { id: 'ocean',       name: 'Ocean',       category: 'Nature', url: genOcean() },
  { id: 'wind',        name: 'Wind',        category: 'Nature', url: genWind() },
  { id: 'forest',      name: 'Forest',      category: 'Nature', url: genForest() },
  { id: 'white-noise', name: 'White Noise', category: 'Noise',  url: genWhite() },
  { id: 'pink-noise',  name: 'Pink Noise',  category: 'Noise',  url: genPink() },
  { id: 'brown-noise', name: 'Brown Noise', category: 'Noise',  url: genBrown() },
  { id: 'fan',         name: 'Fan',         category: 'Noise',  url: genFan() },
];

export const CATEGORIES = ['All', 'Nature', 'Noise'] as const;
export type Category = typeof CATEGORIES[number];

export const PRESET_STORAGE_KEY = 'sleep-mixer-presets-v1';

// ── Built-in presets ───────────────────────────────────────────────────────

function builtinState(active: Array<[string, number]>): Record<string, SoundState> {
  const result: Record<string, SoundState> = {};
  for (const s of SOUND_LIBRARY) result[s.id] = { enabled: false, volume: 0.5 };
  for (const [id, vol] of active) result[id] = { enabled: true, volume: vol };
  return result;
}

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'builtin-fan-rain',      name: 'Fan & Rain',    createdAt: '', masterVolume: 0.8, state: builtinState([['fan', 0.38], ['rain', 0.72]]) },
  { id: 'builtin-windy-forest',  name: 'Windy Forest',  createdAt: '', masterVolume: 0.8, state: builtinState([['wind', 0.55], ['forest', 0.70]]) },
];
