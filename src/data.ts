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
  for (let i = 0; i < f32.length; i++)
    i16[i] = Math.max(-32767, Math.min(32767, f32[i] * scale));
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
  const bubbles = new Float32Array(N);
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.008, 0.024));
    const f = rand(700, 1800);
    const amp = rand(0.02, 0.1);
    const f1 = f * rand(0.72, 0.94);
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / Math.max(1, len - 1);
      const env = Math.exp(-7 * p);
      const ff = f + (f1 - f) * p;
      bubbles[pos + i] += Math.sin(2 * Math.PI * ff * (i / SR)) * env * amp;
    }
    pos += Math.floor(SR * rand(0.02, 0.09));
  }
  hp1(bubbles, 350);
  lp1(bubbles, 2200);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * 0.86 + bubbles[i] * 0.14;
  return gen(mix, 0.60);
}

function genThunder(): string {
  // Thunder: two physically distinct sounds kept in separate buffers so they
  // can be filtered at very different frequencies:
  //   - cracks: short broadband transient (midrange, heard only on close strikes)
  //   - rumbles: deep multi-reflection rolling decay (sub-300Hz)
  //   - base:  near-subsonic atmospheric pressure (always present)

  const base = brownNoise();
  lp1(base, 45); lp1(base, 35); lp1(base, 28);
  const weatherLfo = smoothRandomLfo(0.20, 1.0, 3.0, 9.0);

  const cracks  = new Float32Array(N); // bright broadband transients
  const rumbles = new Float32Array(N); // deep rolling body

  let pos = Math.floor(SR * rand(1.0, 3.5));
  while (pos < N) {
    const distance  = rand(0.12, 1.0);
    const strikeAmp = rand(0.50, 1.0);

    // Crack: close strikes only — broadband, very fast decay, stays bright
    if (distance < 0.55) {
      const crackLen = Math.floor(SR * rand(0.004, 0.013));
      const crackAmp = strikeAmp * (1.0 - distance * 1.8) * rand(0.65, 1.0);
      for (let i = 0; i < crackLen && pos + i < N; i++) {
        const env = Math.exp(-24 * i / Math.max(1, crackLen));
        cracks[pos + i] += (Math.random() * 2 - 1) * env * crackAmp;
      }
    }

    // Rolling rumble: 4–7 staggered reflections, each lower/longer/quieter
    const numRef = Math.floor(rand(4, 8));
    for (let r = 0; r < numRef; r++) {
      const delay = Math.floor(SR * (distance * 0.10 + r * rand(0.08, 0.35)));
      // Longer lengths = more "rolling" — key to realistic thunder
      const rumbleLen = Math.floor(SR * rand(1.4, 5.0) * (1.0 + distance * 1.3));
      const rumbleF   = rand(20, 58) * Math.exp(-r * 0.08);
      const rumbleAmp = strikeAmp * Math.exp(-r * 0.44) * rand(0.55, 1.0);
      const start = pos + delay;
      // riseW grows per-reflection: distant echoes build more slowly
      const riseW = 0.05 + r * 0.035 + distance * 0.08;
      for (let i = 0; i < rumbleLen && start + i < N; i++) {
        const p = i / rumbleLen;
        const env = p < riseW
          ? (p / riseW) ** 0.7
          : Math.exp(-1.9 * (p - riseW));
        const sig = (Math.random() * 2 - 1) * 0.65
                  + Math.sin(2 * Math.PI * rumbleF * (i / SR)) * 0.35;
        rumbles[start + i] += sig * env * rumbleAmp;
      }
    }

    pos += Math.floor(SR * rand(4.0, 11.0));
  }

  // Keep crack at midrange — DO NOT deeply LP-filter it or it loses its crack character
  hp1(cracks, 180); lp1(cracks, 2200);

  // Rumble goes very deep
  lp1(rumbles, 280); lp1(rumbles, 190); lp1(rumbles, 130);
  hp1(rumbles, 14);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = base[i] * 0.42 * weatherLfo[i]
           + rumbles[i] * 0.48
           + cracks[i] * 0.10;
  }
  return gen(mix, 0.82);
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

  // Snap crackles: 0.5–3ms, bright and fast — the "spit" of resin/wood cells bursting
  let sPos = Math.floor(SR * 0.04);
  while (sPos < N) {
    const sLen = Math.floor(SR * rand(0.0005, 0.0028));
    const sAmp = rand(0.22, 0.88);
    for (let i = 0; i < sLen && sPos + i < N; i++) {
      crackles[sPos + i] += (Math.random() * 2 - 1) * Math.exp(-35 * i / Math.max(1, sLen)) * sAmp;
    }
    sPos += Math.floor(SR * rand(0.18, 1.40));
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
    mix[i] = roar[i] * 0.52 * breath[i]
           + turb[i] * 0.33 * turbDrift[i]
           + crackles[i] * 0.10
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
  // Night insects: stridulation model — event-based chirp PAIRS (the natural "chirp-chirp"
  // double burst crickets produce), not a phase loop which creates audible periodicity.
  const buf = new Float32Array(N);

  const crickets = [
    { freq: 4200, q: 22, amp: 0.24, toothRate: 42, minGap: 0.32, maxGap: 0.80 },
    { freq: 4480, q: 18, amp: 0.20, toothRate: 38, minGap: 0.38, maxGap: 0.95 },
    { freq: 3980, q: 25, amp: 0.17, toothRate: 45, minGap: 0.28, maxGap: 0.75 },
    { freq: 4720, q: 20, amp: 0.13, toothRate: 35, minGap: 0.42, maxGap: 1.10 },
    { freq: 5100, q: 16, amp: 0.09, toothRate: 50, minGap: 0.35, maxGap: 0.90 },
  ];

  for (const c of crickets) {
    // Narrowband resonated noise — stridulation wing resonance
    const noise = whiteNoise();
    const resonated = new Float32Array(N);
    for (let i = 0; i < N; i++) resonated[i] = noise[i];
    bp2(resonated, c.freq, c.q);
    bp2(resonated, c.freq * rand(0.995, 1.005), c.q * 0.7);

    const ampDrift = smoothRandomLfo(0.60, 1.0, 3.0, 10.0);
    const silenceLfo = smoothRandomLfo(0.0, 1.0, 4.0, 14.0);

    // Event-based: place individual chirp-pair events with random gaps
    let ePos = Math.floor(SR * rand(0.05, 0.50));
    while (ePos < N) {
      // Silence periods — genuine quiet gaps in the chorus
      if (silenceLfo[Math.min(ePos, N - 1)] < 0.22 && chance(0.72)) {
        ePos += Math.floor(SR * rand(0.4, 1.8));
        continue;
      }
      const ampVal = c.amp * ampDrift[Math.min(ePos, N - 1)];

      // First chirp: slightly longer/louder
      const c1Len = Math.floor(SR * rand(0.028, 0.055));
      for (let i = 0; i < c1Len && ePos + i < N; i++) {
        const p = i / c1Len;
        const env = Math.sin(p * Math.PI);
        const toothMod = 0.60 + 0.40 * Math.sin((i * c.toothRate / SR) * 2 * Math.PI);
        buf[ePos + i] += resonated[ePos + i] * env * toothMod * ampVal;
      }

      // Brief intra-pair gap (the natural pause between the two chirps)
      const innerGap = Math.floor(SR * rand(0.010, 0.022));

      // Second chirp: shorter and quieter (natural pair asymmetry)
      const c2Start = ePos + c1Len + innerGap;
      const c2Len = Math.floor(SR * rand(0.018, 0.042));
      for (let i = 0; i < c2Len && c2Start + i < N; i++) {
        const p = i / c2Len;
        const env = Math.sin(p * Math.PI) * 0.62;
        const toothMod = 0.60 + 0.40 * Math.sin((i * c.toothRate / SR) * 2 * Math.PI);
        buf[c2Start + i] += resonated[c2Start + i] * env * toothMod * ampVal;
      }

      // Random gap to next pair — varied ±range to avoid metronomic feel
      ePos += c1Len + innerGap + c2Len + Math.floor(SR * rand(c.minGap, c.maxGap));
    }
  }

  // Katydid-like background: slower raspy buzz at lower pitch — event-based too
  const katydid = whiteNoise();
  bp2(katydid, 2800, 12);
  const katyEnv = smoothRandomLfo(0.0, 0.06, 2.0, 8.0);
  let kPos = Math.floor(SR * rand(0.2, 1.2));
  while (kPos < N) {
    const kLen = Math.floor(SR * rand(0.28, 0.55));
    const kAmpVal = katyEnv[Math.min(kPos, N - 1)];
    for (let i = 0; i < kLen && kPos + i < N; i++) {
      const p = i / kLen;
      buf[kPos + i] += katydid[kPos + i] * (Math.sin(p * Math.PI) ** 0.5) * kAmpVal;
    }
    kPos += kLen + Math.floor(SR * rand(0.8, 2.8));
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
  const activityLfo = smoothRandomLfo(0.0, 1.0, 8.0, 20.0);

  // Render one note into buf at given position
  function renderNote(pos: number, f0: number, f1: number, len: number, amp: number): void {
    const vibRate = rand(6, 12);
    const vibDepth = rand(0.003, 0.012);
    const tremuloRate = rand(12, 24);
    const phase = rand(0, Math.PI * 2);
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / SR;
      const p = i / len;
      const env = (Math.sin(p * Math.PI) ** 0.85) * (0.86 + 0.14 * Math.sin(2 * Math.PI * tremuloRate * t));
      const glide = f0 + (f1 - f0) * p;
      const f = glide * (1 + vibDepth * Math.sin(2 * Math.PI * vibRate * t + phase));
      const noisyEdge = (Math.random() * 2 - 1) * (Math.exp(-6 * p) * 0.13 + Math.exp(-6 * (1 - p)) * 0.07);
      buf[pos + i] += env * amp * (
        0.70 * Math.sin(2 * Math.PI * f * t + phase) +
        0.18 * Math.sin(2 * Math.PI * 2.04 * f * t + phase * 0.63) +
        0.06 * Math.sin(2 * Math.PI * 2.97 * f * t + phase * 1.4) +
        noisyEdge
      );
    }
  }

  const species = [
    { baseF: 1400, amp: 0.10, callTypes: ['A', 'B'] as const, minGap: 3.5, maxGap: 8.0 },
    { baseF: 2100, amp: 0.09, callTypes: ['C', 'E'] as const, minGap: 4.0, maxGap: 9.0 },
    { baseF:  950, amp: 0.08, callTypes: ['D', 'A'] as const, minGap: 5.0, maxGap: 11.0 },
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

  hp1(buf, 650);
  lp1(buf, 7000);
  // No softClip — gen() normalises anyway and clip was causing aliasing harshness
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
    // Tighter interval variance so rhythm feels consistent, not randomly clicky
    const interval = Math.floor(SR * rand(0.50, 0.68));
    const lenA = Math.floor(SR * rand(0.025, 0.045)); // slightly longer = softer
    const lenB = Math.floor(SR * rand(0.016, 0.032));
    const offsetB = Math.floor(SR * rand(0.06, 0.14));
    for (let i = 0; i < lenA && next + i < N; i++) {
      pulses[next + i] += pulseShape(i / lenA) * rand(0.18, 0.36); // quieter
    }
    for (let i = 0; i < lenB && next + offsetB + i < N; i++) {
      pulses[next + offsetB + i] += pulseShape(i / lenB) * rand(0.10, 0.24);
    }
    next += interval;
  }
  // Only the low resonator — removing the 1240Hz bp which caused clicking
  bp2(pulses, 420, 1.2);
  lp1(pulses, 520); // hard cap on pulse frequency content

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
        const pitchDropAmt = rand(0.10, 0.32); // per-pulse variation
        for (let i = 0; i < len && eventPos + i < N; i++) {
          const t = i / SR;
          const frac = i / len;
          const envShape = rand(1.3, 2.0);
          const env = (Math.sin(frac * Math.PI) ** envShape)
                    * Math.exp(-rand(0.28, 0.65) * frac)
                    * activity;
          const pitchDrop = 1 - pitchDropAmt * frac;
          const tone = freq * pitchDrop;
          const sac  = freq * sacRatio * pitchDrop;
          // Fundamental + vocal-sac resonance + 2nd harmonic + sub-bass + onset noise
          croaks[eventPos + i] += (
            0.52 * Math.sin(2 * Math.PI * tone * t) +
            0.20 * Math.sin(2 * Math.PI * sac  * t + 0.4) +
            0.12 * Math.sin(2 * Math.PI * tone * 2.0 * t + 0.65) +
            sp.sub * Math.sin(2 * Math.PI * tone * 0.5 * t + 0.2) +
            (Math.random() * 2 - 1) * sp.nz * Math.exp(-12 * frac)
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
    const len = Math.floor(SR * rand(0.002, 0.01));
    const amp = rand(0.09, 0.30);
    const hitF = rand(1400, 5200);
    for (let i = 0; i < len && pos + i < N; i++) {
      const t = i / SR;
      const env = Math.exp(-9 * (i / len));
      ping[pos + i] += Math.sin(2 * Math.PI * hitF * t) * env * amp;
    }
    const panelModes = Array.from({ length: 8 }, (_, idx) => rand(180, 260) * (1 + idx * rand(0.32, 0.56)) * rand(0.96, 1.05));
    const ringLen = Math.floor(SR * rand(0.06, 0.24));
    for (let i = 0; i < ringLen && pos + i < N; i++) {
      const t = i / SR;
      let s = 0;
      for (let m = 0; m < panelModes.length; m++) {
        const decay = 2.5 + m * 0.45;
        s += Math.sin(2 * Math.PI * panelModes[m] * t + m * 0.7) * Math.exp(-(i / ringLen) * decay) * rand(0.08, 0.22);
      }
      reson[pos + i] += s * amp * 0.45;
    }
    pos += Math.floor(SR * rand(0.005, 0.028));
  }

  hp1(ping, 900);
  lp1(ping, 7600);
  hp1(reson, 90);
  lp1(reson, 2400);

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.84, 1.2, 0.9, 3.2);
  for (let i = 0; i < N; i++) {
    mix[i] = bed[i] * 0.60 * gust[i] + ping[i] * 0.27 + reson[i] * 0.13;
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
      // Use pre-filtered chest noise (not raw white) — avoids click artifacts
      const thump = chestNoise[c + i] * 1.40;
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
      const thump = chestNoise[c + s2Off + i] * 1.40;
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
  const bubbles = new Float32Array(N);
  let pos = Math.floor(SR * 0.35);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.018, 0.07));
    const f0 = rand(120, 260);
    const f1 = f0 * rand(1.2, 1.8);
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / len;
      const env = Math.sin(Math.min(1, p) * Math.PI) ** 1.8;
      const f = f0 + (f1 - f0) * p;
      bubbles[pos + i] += Math.sin(2 * Math.PI * f * (i / SR)) * env * rand(0.03, 0.09);
    }
    pos += Math.floor(SR * rand(0.45, 1.45));
  }
  hp1(bubbles, 70);
  lp1(bubbles, 700);
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
  hp1(bed, 260);
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
      const amp = rand(0.02, 0.11);
      for (let i = 0; i < len && pos + i < N; i++) {
        const env = Math.exp(-8 * (i / Math.max(1, len)));
        impacts[pos + i] += (Math.random() * 2 - 1) * amp * env;
      }
      if (chance(0.42)) {
        const bLen = Math.floor(SR * rand(0.01, 0.022));
        const f0 = rand(650, 1700);
        const f1 = f0 * rand(0.75, 0.92);
        const bAmp = rand(0.015, 0.055);
        for (let i = 0; i < bLen && pos + i < N; i++) {
          const p = i / Math.max(1, bLen - 1);
          const env = Math.exp(-5.5 * p);
          const f = f0 + (f1 - f0) * p;
          bubbles[pos + i] += Math.sin(2 * Math.PI * f * (i / SR)) * env * bAmp;
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

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const phase = (2 * Math.PI * 0.085 * i) / SR;
    const crest = Math.max(0, Math.sin(phase - Math.PI / 2));
    const waveEnv = 0.24 + 0.76 * Math.pow(0.5 + 0.5 * Math.sin(phase - Math.PI / 2), 1.7);
    const surfEnv = 0.08 + 0.92 * Math.pow(crest, 2.4);
    const washback = 0.68 + 0.32 * Math.sin((2 * Math.PI * 0.17 * i) / SR + 0.7);
    mix[i] = base[i] * waveEnv * 0.62 * washback + surf[i] * surfEnv * 0.38;
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
  const whistle = whiteNoise();
  const baseFreqLfo = smoothRandomLfo(320, 1200, 0.8, 2.8);
  for (let i = 0; i < N; i++) {
    const env = Math.max(0, Math.sin((2 * Math.PI * 0.11 * i) / SR + 1.2)) ** 2;
    whistle[i] *= env * 0.16;
  }
  bp2(whistle, 540, 3.2);
  bp2(whistle, 1240, 5.4);
  for (let i = 0; i < N; i++) {
    whistle[i] *= 0.75 + 0.25 * Math.sin((2 * Math.PI * baseFreqLfo[i] * i) / (SR * 980));
  }
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * 0.88 + whistle[i] * 0.12;
  return gen(mix, 0.68);
}

// ── Sound library ──────────────────────────────────────────────────────────

export const SOUND_LIBRARY: Sound[] = [
  // ── First 4 fixed (per user) ─────────────────────────────────────────────
  { id: 'rain',        name: 'Rain',            category: 'Nature', url: genRain() },
  { id: 'ocean',       name: 'Ocean',           category: 'Nature', url: genOcean() },
  { id: 'wind',        name: 'Wind',            category: 'Nature', url: genWind() },
  { id: 'forest',      name: 'Forest',          category: 'Nature', url: genForest() },
  // ── Nature events / evening ──────────────────────────────────────────────
  { id: 'thunder',     name: 'Thunder',         category: 'Nature', url: genThunder() },
  { id: 'night',       name: 'Night Insects',   category: 'Nature', url: genNight() },
  { id: 'birdsong',    name: 'Birdsong',        category: 'Nature', url: genBirdsong() },
  // ── Water sounds (separated so stream/waterfall aren't adjacent) ─────────
  { id: 'stream',      name: 'Stream',          category: 'Nature', url: genStream() },
  { id: 'frogs',       name: 'Frogs',           category: 'Nature', url: genFrogs() },
  { id: 'waterfall',   name: 'Waterfall',       category: 'Nature', url: genWaterfall() },
  { id: 'underwater',  name: 'Underwater',      category: 'Nature', url: genUnderwater() },
  // ── Rain variants (rain on surfaces — grouped together but far from main Rain) ─
  { id: 'tent-rain',   name: 'Tent Rain',       category: 'Nature', url: genTentRain() },
  { id: 'tin-roof-rain', name: 'Rain on Tin Roof', category: 'Nature', url: genTinRoofRain() },
  // ── Cozy / interior ──────────────────────────────────────────────────────
  { id: 'fireplace',   name: 'Fireplace',       category: 'Cozy',   url: genFireplace() },
  { id: 'dryer',       name: 'Dryer',           category: 'Cozy',   url: genDryer() },
  { id: 'cafe',        name: 'Café',            category: 'Cozy',   url: genCafe() },
  { id: 'shower',      name: 'Shower',          category: 'Cozy',   url: genShower() },
  // ── Noise / mechanical ───────────────────────────────────────────────────
  { id: 'white-noise', name: 'White Noise',     category: 'Noise',  url: genWhite() },
  { id: 'pink-noise',  name: 'Pink Noise',      category: 'Noise',  url: genPink() },
  { id: 'brown-noise', name: 'Brown Noise',     category: 'Noise',  url: genBrown() },
  { id: 'space',       name: 'Deep Space',      category: 'Noise',  url: genSpace() },
  { id: 'heartbeat',   name: 'Heartbeat',       category: 'Noise',  url: genHeartbeat() },
  { id: 'fan',         name: 'Fan',             category: 'Noise',  url: genFan() },
  { id: 'airplane',    name: 'Airplane',        category: 'Noise',  url: genAirplane() },
  { id: 'train',       name: 'Train',           category: 'Noise',  url: genTrain() },
  // Dryer moved to Cozy above — Train ends the list, far from Dryer
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
