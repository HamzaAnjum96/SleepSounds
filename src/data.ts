import type { Preset, Sound, SoundState } from './types';

// ── WAV generation helpers ─────────────────────────────────────────────────

const SR = 24000;
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
  for (let i = 0; i < f32.length; i++)
    i16[i] = Math.max(-32767, Math.min(32767, f32[i] * scale));
  return makeWav(i16, SR);
}

function normalizeForLoop(buf: Float32Array): void {
  removeDc(buf);
  applyLoopBlend(buf, Math.floor(SR * LOOP_BLEND_S));
  applyEdgeFade(buf, Math.floor(SR * EDGE_FADE_S));
  softClip(buf, 1.45);
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
    const a = Math.sqrt(1 - t);
    const b = Math.sqrt(t);
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
  // Rustling leaves with gentle breeze variation
  const buf = pinkNoise();
  lp1(buf, 2400);
  for (let i = 0; i < N; i++) {
    const breeze = 0.70 + 0.30 * Math.abs(Math.sin((2 * Math.PI * 0.044 * i) / SR + 0.4));
    buf[i] *= breeze;
  }
  return gen(buf, 0.58);
}

function genStream(): string {
  // Babbling brook: bright bandpassed noise with multi-rate gurgle variation
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
  return gen(buf, 0.60);
}

function genThunder(): string {
  // Rolling thunder with occasional distant lightning crack / bolt moments
  const r1 = brownNoise();
  lp1(r1, 90); lp1(r1, 70); lp1(r1, 55); lp1(r1, 40);

  const r2 = brownNoise();
  lp1(r2, 130); lp1(r2, 100); lp1(r2, 80);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const env1 = 0.55 + 0.45 * Math.abs(Math.sin((2 * Math.PI * 0.072 * i) / SR));
    const env2 = 0.72 + 0.28 * Math.sin((2 * Math.PI * 0.041 * i) / SR + 1.8);
    mix[i] = (r1[i] * 0.58 + r2[i] * 0.42) * env1 * env2;
  }

  const bolts = new Float32Array(N);
  let pos = Math.floor(SR * (2.5 + Math.random() * 2));
  while (pos < N) {
    const crackLen = Math.floor(SR * (0.012 + Math.random() * 0.04));
    const crackAmp = 0.26 + Math.random() * 0.30;
    for (let i = 0; i < crackLen && pos + i < N; i++) {
      const t = i / Math.max(1, crackLen - 1);
      const env = Math.exp(-8 * t);
      bolts[pos + i] += (Math.random() * 2 - 1) * crackAmp * env;
    }

    const tailStart = pos + Math.floor(SR * (0.02 + Math.random() * 0.08));
    const tailLen = Math.floor(SR * (0.35 + Math.random() * 0.8));
    const tailFreq = 58 + Math.random() * 40;
    for (let i = 0; i < tailLen && tailStart + i < N; i++) {
      const p = i / tailLen;
      const env = Math.exp(-3.2 * p);
      bolts[tailStart + i] += Math.sin(2 * Math.PI * tailFreq * (i / SR)) * env * (0.12 + Math.random() * 0.12);
    }
    pos += Math.floor(SR * (4.8 + Math.random() * 7.5));
  }
  hp1(bolts, 220);
  lp1(bolts, 3200);
  for (let i = 0; i < N; i++) mix[i] += bolts[i] * 0.50;
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
  const buf = brownNoise();
  return gen(buf, 0.65);
}

function genFireplace(): string {
  // Low fire roar
  const base = brownNoise();
  lp1(base, 400); lp1(base, 300);

  // Random crackles with shaped transients (softer attack than digital clicks)
  const crackles = new Float32Array(N);
  let pos = Math.floor(SR * 0.08);
  while (pos < N) {
    const len = Math.floor(SR * (0.02 + Math.random() * 0.09));
    const amp = 0.15 + Math.random() * 0.45;
    const attack = Math.max(4, Math.floor(len * 0.22));
    for (let i = 0; i < len && pos + i < N; i++) {
      const rise = i < attack ? (i / attack) : 1;
      const decay = Math.exp(-(i - attack) / (SR * 0.015));
      const env = i < attack ? rise : decay;
      crackles[pos + i] += (Math.random() * 2 - 1) * amp * env;
    }
    pos += Math.floor(SR * (0.05 + Math.random() * 0.22));
  }
  hp1(crackles, 500);
  lp1(crackles, 3000);

  const mix = new Float32Array(N);
  const drift = smoothRandomLfo(0.82, 1.16, 0.7, 2.2);
  for (let i = 0; i < N; i++) mix[i] = base[i] * 0.58 + crackles[i] * 0.42 * drift[i];
  return gen(mix, 0.68);
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
  // Crickets: slower, less-fatiguing stridulation with irregular spacing
  const buf = new Float32Array(N);
  // [carrier Hz, chirps/sec, phase offset, amplitude]
  const crickets = [
    [4200, 2.1, 0.00, 0.22],
    [4460, 1.9, 0.13, 0.18],
    [4010, 2.0, 0.27, 0.16],
    [4680, 1.7, 0.54, 0.12],
  ] as const;
  for (const [freq, rate, phase0, amp] of crickets) {
    const rateDrift = smoothRandomLfo(0.86, 1.14, 1.8, 5.6);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const cycle = (t * rate * rateDrift[i] + phase0) % 1;
      let env = 0;
      if (cycle < 0.12) {
        env = Math.sin((cycle / 0.12) * Math.PI);
      } else if (cycle >= 0.30 && cycle < 0.39) {
        env = Math.sin(((cycle - 0.30) / 0.09) * Math.PI) * 0.65;
      }
      buf[i] += Math.sin(2 * Math.PI * freq * t) * env * amp;
    }
  }
  const amb = pinkNoise();
  lp1(amb, 350);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * 0.80 + amb[i] * 0.20;
  return gen(mix, 0.52);
}

function genBirdsong(): string {
  // Event-based motifs with per-note glides and gaps to avoid robotic repetition
  const buf = new Float32Array(N);
  const species = [
    { minF: 1700, maxF: 2600, minGap: 0.35, maxGap: 1.4, amp: 0.10, motifMin: 2, motifMax: 5 },
    { minF: 2400, maxF: 3900, minGap: 0.45, maxGap: 1.8, amp: 0.09, motifMin: 1, motifMax: 3 },
    { minF: 1200, maxF: 1900, minGap: 0.8, maxGap: 2.4, amp: 0.08, motifMin: 2, motifMax: 4 },
  ] as const;

  for (const g of species) {
    let pos = Math.floor(SR * Math.random() * 0.5);
    while (pos < N) {
      const motifCount = Math.floor(rand(g.motifMin, g.motifMax + 1));
      for (let m = 0; m < motifCount && pos < N; m++) {
        const len = Math.floor(SR * rand(0.04, 0.11));
        const f0 = rand(g.minF, g.maxF);
        const f1 = f0 * rand(0.82, 1.18);
        const vibRate = rand(6, 11);
        const vibDepth = rand(0.004, 0.012);
        const phase = rand(0, Math.PI * 2);
        for (let i = 0; i < len && pos + i < N; i++) {
          const t = i / SR;
          const p = i / len;
          const env = (Math.sin(p * Math.PI) ** 0.9) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 17 * t));
          const glide = f0 + (f1 - f0) * p;
          const f = glide * (1 + vibDepth * Math.sin(2 * Math.PI * vibRate * t + phase));
          buf[pos + i] += env * g.amp * (
            0.72 * Math.sin(2 * Math.PI * f * t + phase) +
            0.18 * Math.sin(2 * Math.PI * 2.04 * f * t + phase * 0.63) +
            0.06 * Math.sin(2 * Math.PI * 2.97 * f * t + phase * 1.4)
          );
        }
        pos += Math.floor(SR * rand(0.03, 0.18));
      }
      pos += Math.floor(SR * (g.minGap + Math.random() * (g.maxGap - g.minGap)));
    }
  }
  softClip(buf, 1.8);
  hp1(buf, 900);
  lp1(buf, 6000);
  return gen(buf, 0.54);
}

function genCafe(): string {
  // Distant café murmur: bandpassed pink noise with conversational ebb and flow
  const base = pinkNoise();
  hp1(base, 200);
  lp1(base, 1100); lp1(base, 850);
  const mix = new Float32Array(N);
  let p1 = 0, p2 = 0.7, p3 = 1.3;
  for (let i = 0; i < N; i++) {
    p1 += (2 * Math.PI * 0.31) / SR;
    p2 += (2 * Math.PI * 0.52) / SR;
    p3 += (2 * Math.PI * 0.17) / SR;
    const activity = 0.62 + 0.22 * Math.sin(p1) + 0.10 * Math.sin(p2) + 0.06 * Math.abs(Math.sin(p3));
    mix[i] = base[i] * activity;
  }
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
  // Tumbling dryer: low mechanical hum with rhythmic thump at ~0.85 Hz
  const hum = pinkNoise();
  hp1(hum, 65); lp1(hum, 280); lp1(hum, 210);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const cycle = ((i / SR) * 0.85) % 1;
    const thump = cycle < 0.16 ? Math.sin((cycle / 0.16) * Math.PI) * 0.55 : 0;
    mix[i] = hum[i] * (0.70 + thump);
  }
  return gen(mix, 0.65);
}

function genTrain(): string {
  // Train cabin with recurring "clack-clack" rail joints and low rolling drone
  const drone = pinkNoise();
  hp1(drone, 70); lp1(drone, 680); lp1(drone, 480);
  const pulses = new Float32Array(N);
  const pulseShape = (phase: number) => Math.sin(phase * Math.PI) ** 2.3;
  let next = Math.floor(SR * 0.2);
  while (next < N) {
    const interval = Math.floor(SR * rand(0.44, 0.76));
    const lenA = Math.floor(SR * rand(0.018, 0.035));
    const lenB = Math.floor(SR * rand(0.012, 0.027));
    const offsetB = Math.floor(SR * rand(0.05, 0.12));
    for (let i = 0; i < lenA && next + i < N; i++) {
      pulses[next + i] += pulseShape(i / lenA) * rand(0.24, 0.48);
    }
    for (let i = 0; i < lenB && next + offsetB + i < N; i++) {
      pulses[next + offsetB + i] += pulseShape(i / lenB) * rand(0.15, 0.32);
    }
    next += interval;
  }
  hp1(pulses, 120);
  lp1(pulses, 1600);
  const mix = new Float32Array(N);
  const sway = smoothRandomLfo(0.84, 1.16, 1.2, 4.0);
  for (let i = 0; i < N; i++) {
    const wheel = 0.88 + 0.12 * Math.sin((2 * Math.PI * 8.7 * i) / SR);
    mix[i] = drone[i] * 0.62 * sway[i] * wheel + pulses[i] * 0.38;
  }
  return gen(mix, 0.68);
}

function genWaterfall(): string {
  // Waterfall: dense broad-spectrum water noise with smooth pressure surges
  const low = brownNoise();
  hp1(low, 120);
  lp1(low, 1000); lp1(low, 760);

  const spray = whiteNoise();
  hp1(spray, 1200);
  lp1(spray, 5200); lp1(spray, 3800);

  const mix = new Float32Array(N);
  const flow = smoothRandomLfo(0.82, 1.18, 0.7, 2.1);
  for (let i = 0; i < N; i++) {
    const plunge = 0.70 + 0.30 * Math.sin((2 * Math.PI * 0.13 * i) / SR + 0.5);
    mix[i] = low[i] * 0.62 * flow[i] + spray[i] * 0.38 * plunge;
  }
  return gen(mix, 0.66);
}

function genFrogs(): string {
  // Frog chorus: pulse-train ribbits with low formants and slight pitch drops
  const croaks = new Float32Array(N);
  const frogs = [
    { fMin: 110, fMax: 150, minGap: 1.1, maxGap: 2.5, amp: 0.30, pulsesMin: 3, pulsesMax: 6 },
    { fMin: 140, fMax: 190, minGap: 0.8, maxGap: 2.0, amp: 0.24, pulsesMin: 2, pulsesMax: 5 },
    { fMin: 90, fMax: 130, minGap: 1.5, maxGap: 3.0, amp: 0.20, pulsesMin: 2, pulsesMax: 4 },
  ] as const;
  for (const frog of frogs) {
    let pos = Math.floor(SR * Math.random() * 1.2);
    while (pos < N) {
      const pulses = Math.floor(rand(frog.pulsesMin, frog.pulsesMax + 1));
      const baseFreq = rand(frog.fMin, frog.fMax);
      let eventPos = pos;
      for (let pIdx = 0; pIdx < pulses && eventPos < N; pIdx++) {
        const len = Math.floor(SR * rand(0.05, 0.11));
        const pulseGap = Math.floor(SR * rand(0.025, 0.06));
        const freq = baseFreq * rand(0.95, 1.07);
        for (let i = 0; i < len && eventPos + i < N; i++) {
          const t = i / SR;
          const frac = i / len;
          const env = (Math.sin(frac * Math.PI) ** 1.6) * Math.exp(-0.45 * frac);
          const pitchDrop = 1 - 0.22 * frac;
          const tone = freq * pitchDrop;
          croaks[eventPos + i] += (
            0.76 * Math.sin(2 * Math.PI * tone * t) +
            0.16 * Math.sin(2 * Math.PI * 2.0 * tone * t + 0.65) +
            0.07 * Math.sin(2 * Math.PI * 3.1 * tone * t + 1.2)
          ) * env * frog.amp;
        }
        eventPos += len + pulseGap;
      }
      pos += Math.floor(SR * (frog.minGap + Math.random() * (frog.maxGap - frog.minGap)));
    }
  }
  const amb = pinkNoise();
  lp1(amb, 1200);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = croaks[i] * 0.88 + amb[i] * 0.12;
  hp1(mix, 55);
  lp1(mix, 2600);
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
  let pos = Math.floor(SR * 0.03);
  while (pos < N) {
    const len = Math.floor(SR * (0.004 + Math.random() * 0.01));
    const amp = 0.08 + Math.random() * 0.18;
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / Math.max(1, len - 1);
      const env = Math.exp(-8 * t);
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
  // Rain on tent fabric: papery taps over soft low rain bed
  const bed = pinkNoise();
  hp1(bed, 240);
  lp1(bed, 2600);

  const taps = new Float32Array(N);
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    const len = Math.floor(SR * (0.006 + Math.random() * 0.018));
    const amp = 0.12 + Math.random() * 0.26;
    const tone = 900 + Math.random() * 1500;
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / SR;
      const env = Math.exp(-i / (SR * 0.012));
      taps[pos + i] += Math.sin(2 * Math.PI * tone * t) * env * amp;
    }
    pos += Math.floor(SR * (0.02 + Math.random() * 0.09));
  }
  hp1(taps, 450);
  lp1(taps, 4200);

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.82, 1.18, 1.3, 4.0);
  for (let i = 0; i < N; i++) mix[i] = bed[i] * 0.72 * gust[i] + taps[i] * 0.28;
  return gen(mix, 0.64);
}

function genTinRoofRain(): string {
  // Corrugated tin roof rain: bright ping layer + resonant panel ring over soft rain bed
  const bed = pinkNoise();
  hp1(bed, 200);
  lp1(bed, 3000);

  const ping = new Float32Array(N);
  const reson = new Float32Array(N);
  let pos = Math.floor(SR * 0.04);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.003, 0.012));
    const amp = rand(0.12, 0.34);
    const hitF = rand(1300, 3600);
    const ringF = rand(250, 920);
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / SR;
      const env = Math.exp(-9 * (i / len));
      ping[pos + i] += Math.sin(2 * Math.PI * hitF * t) * env * amp;
    }
    const ringLen = Math.floor(SR * rand(0.04, 0.18));
    for (let i = 0; i < ringLen && pos + i < N; i++) {
      const t = i / SR;
      const env = Math.exp(-4.8 * (i / ringLen));
      reson[pos + i] += (
        Math.sin(2 * Math.PI * ringF * t) * 0.72 +
        Math.sin(2 * Math.PI * ringF * 1.97 * t + 0.4) * 0.18
      ) * env * amp * 0.42;
    }
    pos += Math.floor(SR * rand(0.008, 0.03));
  }

  hp1(ping, 700);
  lp1(ping, 5800);
  hp1(reson, 120);
  lp1(reson, 1800);

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.84, 1.2, 0.9, 3.2);
  for (let i = 0; i < N; i++) {
    mix[i] = bed[i] * 0.60 * gust[i] + ping[i] * 0.27 + reson[i] * 0.13;
  }
  return gen(mix, 0.70);
}

function genHeartbeat(): string {
  // Muffled heartbeat with "lub-dub" pulse pair
  const beat = new Float32Array(N);
  const bpm = 60 + Math.random() * 10;
  const cycle = SR * (60 / bpm);
  for (let c = Math.floor(SR * 0.2); c < N; c += Math.floor(cycle)) {
    const events = [
      { o: 0, a: 0.75, l: Math.floor(SR * 0.09), f: 76 },
      { o: Math.floor(SR * 0.18), a: 0.55, l: Math.floor(SR * 0.07), f: 92 },
    ];
    for (const e of events) {
      const start = c + e.o;
      for (let i = 0; i < e.l && start + i < N; i++) {
        const p = i / e.l;
        const env = Math.sin(Math.min(1, p) * Math.PI) ** 1.5 * Math.exp(-2.1 * p);
        beat[start + i] += Math.sin(2 * Math.PI * e.f * (i / SR)) * env * e.a;
      }
    }
  }
  const body = brownNoise();
  lp1(body, 120); lp1(body, 85);
  const mix = new Float32Array(N);
  const drift = smoothRandomLfo(0.92, 1.08, 2.2, 6.0);
  for (let i = 0; i < N; i++) mix[i] = beat[i] * 0.80 * drift[i] + body[i] * 0.20;
  lp1(mix, 320);
  hp1(mix, 28);
  return gen(mix, 0.57);
}

function genUnderwater(): string {
  // Deep underwater: heavily low-passed brown noise with slow bubbly modulation
  const depth = brownNoise();
  lp1(depth, 140); lp1(depth, 110); lp1(depth, 85);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const b1 = 0.68 + 0.32 * Math.sin((2 * Math.PI * 0.28 * i) / SR);
    const b2 = 0.84 + 0.16 * Math.sin((2 * Math.PI * 0.71 * i) / SR + 0.9);
    mix[i] = depth[i] * b1 * b2;
  }
  return gen(mix, 0.60);
}

function genRain(): string {
  // Rain: dense pink noise bandpassed, gentle slow-swell intensity variation
  const buf = pinkNoise();
  hp1(buf, 280);      // cut sub-bass rumble
  lp1(buf, 4800);     // soften ultrasound
  lp1(buf, 3600);
  // Gentle rainfall intensity swell (~0.06 Hz = 16-second cycle)
  for (let i = 0; i < N; i++) {
    const swell = 0.87 + 0.13 * Math.sin((2 * Math.PI * 0.062 * i) / SR + 0.5);
    buf[i] *= swell;
  }
  return gen(buf, 0.72);
}

function genOcean(): string {
  // Ocean: brown-noise base with slow wave-swell modulation + pink surf layer
  const base = brownNoise();
  lp1(base, 550); lp1(base, 420);

  const surf = pinkNoise();
  hp1(surf, 220);
  lp1(surf, 2200);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // ~0.085 Hz = 11.8-second wave cycle
    const phase = (2 * Math.PI * 0.085 * i) / SR;
    const waveEnv = 0.28 + 0.72 * Math.pow(0.5 + 0.5 * Math.sin(phase - Math.PI / 2), 1.6);
    const surfEnv = 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(phase - Math.PI / 2)), 2);
    mix[i] = base[i] * waveEnv * 0.62 + surf[i] * surfEnv * 0.38;
  }
  return gen(mix, 0.72);
}

function genWind(): string {
  // Wind: pink noise heavily low-passed, multi-rate gust envelope
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
  return gen(buf, 0.68);
}

// ── Sound library ──────────────────────────────────────────────────────────

export const SOUND_LIBRARY: Sound[] = [
  { id: 'rain',        name: 'Rain',        category: 'Nature', url: genRain() },
  { id: 'ocean',       name: 'Ocean',       category: 'Nature', url: genOcean() },
  { id: 'wind',        name: 'Wind',        category: 'Nature', url: genWind() },
  { id: 'forest',      name: 'Forest',      category: 'Nature', url: genForest() },
  { id: 'thunder',     name: 'Thunder',     category: 'Nature', url: genThunder() },
  { id: 'stream',      name: 'Stream',      category: 'Nature', url: genStream() },
  { id: 'waterfall',   name: 'Waterfall',   category: 'Nature', url: genWaterfall() },
  { id: 'tent-rain',   name: 'Tent Rain',   category: 'Nature', url: genTentRain() },
  { id: 'tin-roof-rain', name: 'Rain on Tin Roof', category: 'Nature', url: genTinRoofRain() },
  { id: 'night',       name: 'Night Insects', category: 'Nature', url: genNight() },
  { id: 'birdsong',    name: 'Birdsong',    category: 'Nature', url: genBirdsong() },
  { id: 'frogs',       name: 'Frogs',       category: 'Nature', url: genFrogs() },
  { id: 'underwater',  name: 'Underwater',  category: 'Nature', url: genUnderwater() },
  { id: 'fireplace',   name: 'Fireplace',   category: 'Cozy',   url: genFireplace() },
  { id: 'cafe',        name: 'Café',        category: 'Cozy',   url: genCafe() },
  { id: 'shower',      name: 'Shower',      category: 'Cozy',   url: genShower() },
  { id: 'white-noise', name: 'White Noise', category: 'Noise',  url: genWhite() },
  { id: 'pink-noise',  name: 'Pink Noise',  category: 'Noise',  url: genPink() },
  { id: 'brown-noise', name: 'Brown Noise', category: 'Noise',  url: genBrown() },
  { id: 'space',       name: 'Deep Space',  category: 'Noise',  url: genSpace() },
  { id: 'heartbeat',   name: 'Heartbeat',   category: 'Noise',  url: genHeartbeat() },
  { id: 'fan',         name: 'Fan',         category: 'Noise',  url: genFan() },
  { id: 'airplane',    name: 'Airplane',    category: 'Noise',  url: genAirplane() },
  { id: 'dryer',       name: 'Dryer',       category: 'Noise',  url: genDryer() },
  { id: 'train',       name: 'Train',       category: 'Noise',  url: genTrain() },
];

export const CATEGORIES = ['All', 'Nature', 'Cozy', 'Noise'] as const;
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
  { id: 'builtin-fan-rain',     name: 'Fan & Rain',   createdAt: '', masterVolume: 0.8, state: builtinState([['fan', 0.38], ['rain', 0.72]]) },
  { id: 'builtin-fan',          name: 'Fan',          createdAt: '', masterVolume: 0.8, state: builtinState([['fan', 0.8]]) },
  { id: 'builtin-rain',         name: 'Rain',         createdAt: '', masterVolume: 0.8, state: builtinState([['rain', 0.75]]) },
  { id: 'builtin-rainy-forest', name: 'Rainy Forest', createdAt: '', masterVolume: 0.8, state: builtinState([['rain', 0.55], ['forest', 0.65], ['thunder', 0.3]]) },
  { id: 'builtin-ocean-night',  name: 'Ocean Night',  createdAt: '', masterVolume: 0.8, state: builtinState([['ocean', 0.65], ['night', 0.55]]) },
  { id: 'builtin-cozy-fire',    name: 'Cozy Fire',    createdAt: '', masterVolume: 0.8, state: builtinState([['fireplace', 0.7], ['brown-noise', 0.25]]) },
  { id: 'builtin-deep-space',   name: 'Deep Space',   createdAt: '', masterVolume: 0.8, state: builtinState([['space', 0.75], ['brown-noise', 0.3]]) },
  { id: 'builtin-tent-night',   name: 'Tent Night',   createdAt: '', masterVolume: 0.8, state: builtinState([['tent-rain', 0.62], ['wind', 0.26], ['night', 0.20]]) },
  { id: 'builtin-shower-focus', name: 'Shower Focus', createdAt: '', masterVolume: 0.8, state: builtinState([['shower', 0.68], ['pink-noise', 0.24]]) },
  { id: 'builtin-heart-rest',   name: 'Heart Rest',   createdAt: '', masterVolume: 0.8, state: builtinState([['heartbeat', 0.62], ['brown-noise', 0.22]]) },
];
