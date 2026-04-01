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

function genForest(params?: Record<string, number>): string {
  const { leaves = 0.7, twigs: twigsParam = 0.35, breeze = 0.5 } = params ?? {};
  const leavesMix = 0.5 + leaves * 0.5;
  const twigAmpScale = twigsParam * 2.0;
  const twigGapScale = 1.5 - twigsParam;
  const breezeFreq = 0.024 + breeze * 0.04;
  // Forest canopy: leafy broadband bed + twig flicks + distant bird-like highs
  const buf = pinkNoise();
  hp1(buf, 120);
  lp1(buf, 2200);
  for (let i = 0; i < N; i++) {
    const breezeEnv = 0.70 + 0.30 * Math.abs(Math.sin((2 * Math.PI * breezeFreq * i) / SR + 0.4));
    buf[i] *= breezeEnv;
  }
  const twigsBuf = new Float32Array(N);
  let twigPos = Math.floor(SR * 0.2);
  while (twigPos < N) {
    const len = Math.floor(SR * rand(0.004, 0.018));
    for (let i = 0; i < len && twigPos + i < N; i++) {
      const env = Math.exp(-7.5 * (i / len));
      twigsBuf[twigPos + i] += (Math.random() * 2 - 1) * env * rand(0.04, 0.14) * twigAmpScale;
    }
    twigPos += Math.floor(SR * rand(0.11 * twigGapScale, 0.55 * twigGapScale));
  }
  hp1(twigsBuf, 1400);
  lp1(twigsBuf, 5400);

  const canopy = new Float32Array(N);
  for (let i = 0; i < N; i++) canopy[i] = buf[i] * leavesMix + twigsBuf[i] * (1 - leavesMix);
  return gen(canopy, 0.58);
}

function genWhite(params?: Record<string, number>): string {
  const { brightness = 0.55, depth = 0.5, texture = 0.4 } = params ?? {};
  const bodyLp = 4000 + brightness * 9200;
  const bodyHp = 30 + (1 - depth) * 120;
  const airMix = 0.08 + texture * 0.2;
  const shimmerDepth = 0.06 + texture * 0.16;
  // Softer white noise: band-limited and gently animated to reduce hiss fatigue.
  const body = whiteNoise();
  hp1(body, bodyHp);
  lp1(body, bodyLp);

  const air = whiteNoise();
  hp1(air, 2400);
  lp1(air, 10800);

  const drift = smoothRandomLfo(0.9, 1.1, 1.2, 3.8);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const shimmer = 1 - shimmerDepth + shimmerDepth * Math.sin((2 * Math.PI * 0.065 * i) / SR);
    mix[i] = body[i] * (1 - airMix) * drift[i] + air[i] * airMix * shimmer;
  }
  return gen(mix, 0.62);
}

function genBrown(params?: Record<string, number>): string {
  const { depth = 0.7, rumble = 0.4, smoothness = 0.5 } = params ?? {};
  const alpha = 0.994 + depth * 0.005;
  const rumbleLpCut = 80 + rumble * 400;
  const rumbleMix = rumble * 0.3;
  const smoothLp = 200 + (1 - smoothness) * 2000;
  const buf = new Float32Array(N);
  let last = 0;
  for (let i = 0; i < N; i++) {
    last = alpha * last + (1 - alpha) * (Math.random() * 2 - 1);
    buf[i] = last;
  }
  // Second LP pass for rumble emphasis
  const rumbleBuf = new Float32Array(buf);
  lp1(rumbleBuf, rumbleLpCut);
  for (let i = 0; i < N; i++) buf[i] = buf[i] * (1 - rumbleMix) + rumbleBuf[i] * rumbleMix;
  // Smoothness LP
  lp1(buf, smoothLp);
  return gen(buf, 0.65);
}

function genFan(params?: Record<string, number>): string {
  const { speed = 0.5, hum: humParam = 0.4, airflow: airflowParam = 0.6 } = params ?? {};
  const flutterFreq = 12 + speed * 12;
  const airflowHp = 150 + speed * 100;
  const humLpCut = 80 + humParam * 80;
  const humMix = 0.15 + humParam * 0.2;
  const airflowMix = 0.5 + airflowParam * 0.5;

  const airflowBuf = pinkNoise();
  hp1(airflowBuf, airflowHp);
  lp1(airflowBuf, 2200);

  const humBuf = brownNoise();
  lp1(humBuf, humLpCut); lp1(humBuf, humLpCut);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const flutter = 0.88 + 0.12 * Math.sin((2 * Math.PI * flutterFreq * i) / SR);
    mix[i] = airflowBuf[i] * airflowMix * flutter + humBuf[i] * humMix;
  }
  return gen(mix, 0.65);
}

function genPink(params?: Record<string, number>): string {
  const { warmth: warmthParam = 0.6, focus = 0.45, air = 0.4 } = params ?? {};
  const warmthMix = 0.05 + warmthParam * 0.16;
  const pinkHp = 20 + (1 - warmthParam) * 36;
  const textureBpCenter = 1600 + focus * 1200;
  const textureMix = 0.02 + focus * 0.06;
  const pinkLp = 4000 + air * 4400;
  // Smoother pink profile: trim subsonic rumble + tame top edge + add warm bed.
  const pink = pinkNoise();
  hp1(pink, pinkHp);
  lp1(pink, pinkLp);

  const warmthBuf = brownNoise();
  hp1(warmthBuf, 24);
  lp1(warmthBuf, 420);

  const texture = whiteNoise();
  bp2(texture, textureBpCenter, 0.9);
  lp1(texture, 4200);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = pink[i] * (1 - warmthMix - textureMix) + warmthBuf[i] * warmthMix + texture[i] * textureMix;
  }
  return gen(mix, 0.64);
}

function genRain(params?: Record<string, number>): string {
  const { intensity = 0.65, heaviness = 0.5, surface = 0.5 } = params ?? {};
  const gapScale = 0.3 + (1 - intensity) * 1.4;
  const bedHp = 200 + (1 - heaviness) * 200;
  const bedLp = 2800 + (1 - heaviness) * 5600;
  const bubbleChance = 0.22 + surface * 0.4;
  const pingChance = 0.35 + surface * 0.4;
  // Rain: diffuse bed + clustered impacts + tonal bubble-like micro-events
  const bed = pinkNoise();
  hp1(bed, bedHp);
  lp1(bed, bedLp);
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
      const amp = Math.exp(rand(-4.8, -1.6));
      const riseN = Math.max(2, Math.floor(SR * 0.001));
      for (let i = 0; i < len && pos + i < N; i++) {
        const riseGain = Math.min(1, i / riseN);
        const env = Math.exp(-8 * (i / Math.max(1, len))) * riseGain;
        impacts[pos + i] += (Math.random() * 2 - 1) * amp * env;
      }
      if (chance(pingChance)) {
        const pingF  = rand(700, 1800);
        const pingLen = Math.floor(SR * rand(0.003, 0.008));
        const pingAmp = amp * rand(0.25, 0.45);
        for (let i = 0; i < pingLen && pos + i < N; i++) {
          const riseGain = Math.min(1, i / 2);
          impacts[pos + i] += Math.sin(2 * Math.PI * pingF * (i / SR))
            * Math.exp(-14 * (i / pingLen)) * pingAmp * riseGain;
        }
      }
      if (chance(bubbleChance)) {
        const bLen = Math.floor(SR * rand(0.01, 0.022));
        const f0 = rand(650, 1700);
        const f1 = f0 * rand(0.75, 0.92);
        const bAmp = rand(0.015, 0.055);
        let bPh = 0;
        for (let i = 0; i < bLen && pos + i < N; i++) {
          const p = i / Math.max(1, bLen - 1);
          const env = Math.exp(-5.5 * p);
          const f = f0 + (f1 - f0) * p;
          bPh += (2 * Math.PI * f) / SR;
          bubbles[pos + i] += Math.sin(bPh) * env * bAmp;
        }
      }
      pos += Math.floor(SR * rand(0.002, 0.018));
    }
    pos += Math.floor(SR * rand(0.03 * gapScale, 0.25 * gapScale));
  }
  hp1(impacts, 1400); lp1(impacts, 9000);
  hp1(bubbles, 420); lp1(bubbles, 4200);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = bed[i] * 0.50 + impacts[i] * 0.28 + bubbles[i] * 0.22;
  return gen(mix, 0.7);
}

function genOcean(params?: Record<string, number>): string {
  const { waveSize = 0.55, foam = 0.5, depth = 0.5 } = params ?? {};
  const waveMin = 5 + waveSize * 5;
  const waveMax = 10 + waveSize * 10;
  const surfLp = 1200 + foam * 1600;
  const surfMix = 0.2 + foam * 0.36;
  const baseLp = 240 + depth * 240;
  const baseMix = 0.4 + depth * 0.44;
  // Ocean shoreline: undertow body + cresting surf that blooms on each wave
  const base = brownNoise();
  lp1(base, baseLp); lp1(base, baseLp * 0.75);

  const surf = pinkNoise();
  hp1(surf, 220);
  lp1(surf, surfLp);

  const waveEnvBuf = new Float32Array(N);
  let wPos = 0;
  while (wPos < N) {
    const period = Math.floor(SR * rand(waveMin, waveMax));
    const wAmp   = rand(0.45, 1.0);
    for (let i = 0; i < period && wPos + i < N; i++) {
      const p = i / period;
      let env: number;
      if (p < 0.38) env = Math.pow(p / 0.38, 1.6) * wAmp;
      else if (p < 0.52) env = wAmp;
      else env = Math.pow((1 - p) / 0.48, 0.75) * wAmp;
      waveEnvBuf[wPos + i] += env;
    }
    wPos += period;
  }

  // Smooth the wave envelope at loop boundaries to prevent audible seam
  const envBlend = Math.floor(SR * 2.0);
  for (let i = 0; i < envBlend && i < N; i++) {
    const t = i / envBlend;
    const fade = 0.5 - 0.5 * Math.cos(Math.PI * t);
    waveEnvBuf[i] *= fade;
    waveEnvBuf[N - 1 - i] *= fade;
  }

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const wEnv  = Math.min(1, waveEnvBuf[i]);
    const wBase = 0.24 + 0.76 * wEnv;
    const wSurf = 0.08 + 0.92 * Math.pow(wEnv, 1.8);
    mix[i] = base[i] * wBase * baseMix + surf[i] * wSurf * surfMix;
  }
  return gen(mix, 0.72);
}

function genWind(params?: Record<string, number>): string {
  const { gusts = 0.5, whistle = 0.3, tone = 0.5 } = params ?? {};
  const gustDepth = 0.2 + gusts * 0.6;
  const whistleMixLevel = whistle * 0.28;
  const bodyLp = 600 + tone * 800;
  // Wind: gust-driven turbulence with drifting resonant edge tones
  const buf = pinkNoise();
  hp1(buf, 90);
  lp1(buf, bodyLp + 400); lp1(buf, bodyLp);
  const drift = smoothRandomLfo(0.84, 1.14, 1.8, 5.2);
  for (let i = 0; i < N; i++) {
    const g1 = (1 - gustDepth) + gustDepth * Math.abs(Math.sin((2 * Math.PI * 0.038 * i) / SR));
    const g2 = 0.72 + 0.28 * Math.sin((2 * Math.PI * 0.11 * i) / SR + 1.3);
    const g3 = 0.88 + 0.12 * Math.sin((2 * Math.PI * 0.23 * i) / SR + 0.6);
    buf[i] *= g1 * g2 * g3 * drift[i];
  }
  const whistleStrips = [
    { fc: 360,  q: 4.0 },
    { fc: 620,  q: 4.5 },
    { fc: 960,  q: 4.2 },
    { fc: 1380, q: 5.0 },
  ];
  const whistleBuf = new Float32Array(N);
  for (const s of whistleStrips) {
    const stripNoise = whiteNoise();
    bp2(stripNoise, s.fc, s.q);
    const stripLfo = smoothRandomLfo(0.0, 1.0, 1.4, 5.5);
    for (let i = 0; i < N; i++) whistleBuf[i] += stripNoise[i] * stripLfo[i] * 0.25;
  }
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] * (1 - whistleMixLevel) + whistleBuf[i] * whistleMixLevel;
  return gen(mix, 0.68);
}

function genFire(): string {
  // Fire: deep turbulent roar + flame body + hiss + ember + whoosh +
  //       crackle bursts + spit crackles + pops + log shifts

  // ── 1. Deep roar body: brown rumble + pink mid-roar, independently modulated ──
  const roar = brownNoise();
  hp1(roar, 40);
  lp1(roar, 600);

  const body = pinkNoise();
  hp1(body, 100);
  lp1(body, 1200);

  // Irregular "breathing" — two uncorrelated slow LFOs compound-modulate the flame.
  const breathA = smoothRandomLfo(0.55, 1.0, 2.0, 6.0);
  const breathB = smoothRandomLfo(0.60, 1.0, 1.5, 4.5);

  // ── 2. Flame hiss: high-pass sizzle that rises with flame intensity.
  // LP at 6000 Hz (not 9000) keeps the sizzle warm rather than sharp white. ──
  const hiss = whiteNoise();
  hp1(hiss, 2000);
  lp1(hiss, 4500);

  // ── 3. Ember sizzle: warm high-freq texture, fading in/out independently.
  // HP lowered to 3500 Hz and LP to 7500 Hz so it blends as a sizzle rather
  // than adding harsh white noise energy near Nyquist. ──
  const ember = whiteNoise();
  hp1(ember, 3500);
  lp1(ember, 7500);
  const emberLfo = smoothRandomLfo(0.0, 1.0, 2.0, 7.0);

  // ── 4. Whoosh: mid-freq air-rush that swells with each breath peak.
  // When the flame flares, air is drawn in and creates a soft roaring rush
  // in the 300–1200 Hz band — distinct from the tonal body and high hiss.
  const whoosh = pinkNoise();
  hp1(whoosh, 320);
  lp1(whoosh, 1200);
  lp1(whoosh, 900); // double-pole for steeper roll-off above 1 kHz

  // ── 5. Clustered crackle bursts ──
  const crackles = new Float32Array(N);
  let pos = Math.floor(SR * 0.15);
  while (pos < N) {
    const burstDur = Math.floor(SR * rand(0.05, 0.30));
    const burstEnd = Math.min(N, pos + burstDur);
    const burstIntensity = rand(0.08, 0.28);
    let cPos = pos;
    while (cPos < burstEnd) {
      const len = Math.floor(SR * rand(0.001, 0.008));
      const amp = burstIntensity * rand(0.3, 1.0);
      for (let i = 0; i < len && cPos + i < N; i++) {
        const env = Math.exp(-12 * (i / Math.max(1, len)));
        crackles[cPos + i] += (Math.random() * 2 - 1) * amp * env;
      }
      // Resin ping: ~30% of crackles get a brief tonal ring (wood-fiber snap).
      // 180–520 Hz matches the resonant range of burning wood and dry bark.
      if (chance(0.30)) {
        const pingF   = rand(180, 520);
        const pingLen = Math.floor(SR * rand(0.004, 0.014));
        const pingAmp = amp * rand(0.20, 0.40);
        let ph = 0;
        for (let i = 0; i < pingLen && cPos + i < N; i++) {
          ph += (2 * Math.PI * pingF) / SR;
          crackles[cPos + i] += Math.sin(ph)
            * Math.exp(-9 * (i / Math.max(1, pingLen))) * pingAmp;
        }
      }
      cPos += Math.floor(SR * rand(0.003, 0.04));
    }
    pos = burstEnd + Math.floor(SR * rand(0.3, 1.8));
  }
  hp1(crackles, 800);
  lp1(crackles, 7000);

  // ── 6. Spit crackles: sparse individual snaps scattered between bursts.
  // Fire never fully stops crackling — these fill the gaps between burst clusters
  // so the texture remains alive even during quiet moments.
  const spits = new Float32Array(N);
  let spitPos = Math.floor(SR * rand(0.1, 0.4));
  while (spitPos < N) {
    const len = Math.floor(SR * rand(0.0008, 0.004));
    const amp = rand(0.04, 0.18);
    for (let i = 0; i < len && spitPos + i < N; i++) {
      spits[spitPos + i] += (Math.random() * 2 - 1)
        * amp * Math.exp(-15 * (i / Math.max(1, len)));
    }
    spitPos += Math.floor(SR * rand(0.08, 0.6));
  }
  hp1(spits, 1200);
  lp1(spits, 8000);

  // ── 7. Pops: infrequent, louder, low-frequency thuds ──
  const pops = new Float32Array(N);
  let popPos = Math.floor(SR * rand(1.0, 3.0));
  while (popPos < N) {
    const len = Math.floor(SR * rand(0.008, 0.025));
    const amp = rand(0.15, 0.40);
    const f0 = rand(80, 250);
    let ph = 0;
    for (let i = 0; i < len && popPos + i < N; i++) {
      const env = Math.exp(-6 * (i / Math.max(1, len)));
      ph += (2 * Math.PI * f0) / SR;
      pops[popPos + i] += (Math.sin(ph) * 0.6 + (Math.random() * 2 - 1) * 0.4)
                          * env * amp;
    }
    popPos += Math.floor(SR * rand(1.5, 6.0));
  }
  // 2400 Hz ceiling keeps pop presence without sounding tinny
  lp1(pops, 2400);

  // ── 8. Log shifts: 3–6 deep low-frequency rumble events per loop.
  // Occasional settling of logs — single slow-attack impulses in the 40–90 Hz
  // range, much lower and longer than pops, giving the fire physical weight.
  const logShifts = new Float32Array(N);
  const numShifts = Math.floor(rand(3, 7));
  for (let k = 0; k < numShifts; k++) {
    const shiftPos = Math.floor(rand(SR * 1.0, N - SR * 2.0));
    const len      = Math.floor(SR * rand(0.15, 0.50));
    const amp      = rand(0.12, 0.35);
    const f0       = rand(40, 90);
    let ph = 0;
    for (let i = 0; i < len && shiftPos + i < N; i++) {
      const p   = i / len;
      // Slow attack, long tail — sounds like a log settling rather than a pop
      const env = Math.pow(p < 0.1 ? p / 0.1 : (1 - p) / 0.9, 0.6);
      ph += (2 * Math.PI * f0) / SR;
      logShifts[shiftPos + i] +=
        (Math.sin(ph) * 0.5 + (Math.random() * 2 - 1) * 0.5) * env * amp;
    }
  }
  hp1(logShifts, 25);
  lp1(logShifts, 280);

  // ── Mix ──
  // Crackles and pops are the dominant character; roar/body are background texture.
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const breath = breathA[i] * breathB[i]; // compound modulation
    mix[i] =
      roar[i]       * 0.18 * breathA[i] +
      body[i]       * 0.16 * breath +
      hiss[i]       * 0.025 * breath +
      ember[i]      * 0.012 * emberLfo[i] +
      whoosh[i]     * 0.035 * breath +
      crackles[i]   * 0.30 +
      spits[i]      * 0.12 +
      pops[i]       * 0.14 +
      logShifts[i]  * 0.04;
  }
  return gen(mix, 0.64);
}

function genBirdsong(): string {
  // Birdsong: varied bird calls without ambience bed.

  // ── 1. Bird calls: short melodic chirps at varied pitches ──
  const calls = new Float32Array(N);
  let callPos = Math.floor(SR * rand(0.3, 1.2));
  while (callPos < N) {
    // Each bird call is a series of 2–6 chirps
    const numChirps = Math.floor(rand(2, 7));
    const baseFreq = rand(1800, 4200);
    const chirpGap = rand(0.06, 0.14);
    const callAmp = rand(0.08, 0.25);

    let chirpPos = callPos;
    for (let c = 0; c < numChirps && chirpPos < N; c++) {
      const chirpLen = Math.floor(SR * rand(0.03, 0.09));
      const freq = baseFreq * rand(0.85, 1.25);
      const freqEnd = freq * rand(0.7, 1.4); // pitch glide
      let ph = 0;
      for (let i = 0; i < chirpLen && chirpPos + i < N; i++) {
        const p = i / chirpLen;
        // Bell-shaped envelope: smooth attack and decay
        const env = Math.sin(Math.PI * p) * callAmp;
        const f = freq + (freqEnd - freq) * p;
        ph += (2 * Math.PI * f) / SR;
        calls[chirpPos + i] += Math.sin(ph) * env;
      }
      chirpPos += Math.floor(SR * (chirpLen / SR + chirpGap));
    }

    // Gap between bird calls: 0.8–4.0 seconds
    callPos = chirpPos + Math.floor(SR * rand(0.8, 4.0));
  }
  hp1(calls, 1200);
  lp1(calls, 8000);

  // ── 2. Trills: rapid warbling sequences ──
  const trills = new Float32Array(N);
  let trillPos = Math.floor(SR * rand(1.5, 4.0));
  while (trillPos < N) {
    const trillLen = Math.floor(SR * rand(0.3, 0.8));
    const trillFreq = rand(2400, 5000);
    const trillRate = rand(18, 35); // warble rate in Hz
    const trillAmp = rand(0.06, 0.16);
    let ph = 0;
    for (let i = 0; i < trillLen && trillPos + i < N; i++) {
      const p = i / trillLen;
      // Fade in/out envelope
      const env = Math.sin(Math.PI * p) * trillAmp;
      // Frequency modulation for warble effect
      const fMod = trillFreq + Math.sin(2 * Math.PI * trillRate * (i / SR)) * trillFreq * 0.15;
      ph += (2 * Math.PI * fMod) / SR;
      trills[trillPos + i] += Math.sin(ph) * env;
    }
    trillPos += trillLen + Math.floor(SR * rand(2.5, 8.0));
  }
  hp1(trills, 1800);
  lp1(trills, 9000);

  // ── 3. Distant soft peeps: very quiet background birds ──
  const peeps = new Float32Array(N);
  let peepPos = Math.floor(SR * rand(0.5, 2.0));
  while (peepPos < N) {
    const peepLen = Math.floor(SR * rand(0.015, 0.04));
    const peepFreq = rand(3000, 6000);
    const peepAmp = rand(0.02, 0.06);
    let ph = 0;
    for (let i = 0; i < peepLen && peepPos + i < N; i++) {
      const p = i / peepLen;
      const env = Math.sin(Math.PI * p) * peepAmp;
      ph += (2 * Math.PI * peepFreq) / SR;
      peeps[peepPos + i] += Math.sin(ph) * env;
    }
    peepPos += Math.floor(SR * rand(0.3, 1.8));
  }
  lp1(peeps, 7000);

  // ── Mix ──
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = calls[i] * 0.55 + trills[i] * 0.30 + peeps[i] * 0.15;
  }
  return gen(mix, 0.62);
}

function genStream(params?: Record<string, number>): string {
  const { flow: flowParam = 0.6, sparkle = 0.45, depth = 0.5 } = params ?? {};
  // Babbling brook: deep rumbling bed + irregular gurgle + bright sparkle + occasional plops
  // Deep water-over-rocks bed using brownNoise
  const deepBed = brownNoise();
  hp1(deepBed, 60);
  lp1(deepBed, 600);

  // Mid-band gurgle using pinkNoise with aggressive LFO for irregular flow
  const gurgle = pinkNoise();
  hp1(gurgle, 300);
  lp1(gurgle, 1800);
  const gurgleLfo = smoothRandomLfo(0.3, 1.0, 0.4, 1.8);
  for (let i = 0; i < N; i++) gurgle[i] *= gurgleLfo[i];

  // Bright sparkle / ripple layer
  const rippleHp = 800 + sparkle * 800;
  const ripples = whiteNoise();
  hp1(ripples, rippleHp);
  lp1(ripples, 7600);
  const rippleLfo = smoothRandomLfo(0.5 + flowParam * 0.3, 1.0 + flowParam * 0.4, 0.5, 2.4);
  for (let i = 0; i < N; i++) ripples[i] *= Math.pow(Math.max(0, rippleLfo[i]), 1.4);

  // Occasional plop events: brief resonant tones (200-600 Hz) like water hitting a pool
  const plops = new Float32Array(N);
  let plopPos = Math.floor(SR * rand(0.1, 0.6));
  while (plopPos < N) {
    const plopF = rand(200, 600);
    const plopLen = Math.floor(SR * rand(0.012, 0.035));
    const plopAmp = rand(0.04, 0.12);
    for (let i = 0; i < plopLen && plopPos + i < N; i++) {
      const p = i / Math.max(1, plopLen - 1);
      const env = Math.exp(-9 * p) * Math.min(1, i / 3);
      plops[plopPos + i] += Math.sin(2 * Math.PI * plopF * (i / SR)) * env * plopAmp;
    }
    plopPos += Math.floor(SR * rand(0.4, 2.2) / (0.3 + flowParam * 0.7));
  }
  hp1(plops, 150); lp1(plops, 900);

  const depthMix = 0.18 + depth * 0.14;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = deepBed[i] * depthMix + gurgle[i] * 0.35 + ripples[i] * 0.25 + plops[i] * 0.15;
  }
  return gen(mix, 0.66);
}

function genThunder(params?: Record<string, number>): string {
  const { stormIntensity = 0.5, rumble = 0.6, distance = 0.4 } = params ?? {};
  const boomGapMin = 2 + (1 - stormIntensity) * 4;
  const boomGapMax = 6 + (1 - stormIntensity) * 8;
  const rollMix = 0.5 + rumble * 0.48;
  const masterLp = 1200 + (1 - distance) * 6000;
  const hissMix = 0.06 + (1 - distance) * 0.08;
  // Distant thunder roll with occasional low booms.
  const roll = brownNoise();
  hp1(roll, 24);
  lp1(roll, 420);

  const hiss = pinkNoise();
  hp1(hiss, 1800);
  lp1(hiss, 5200);

  const booms = new Float32Array(N);
  let pos = Math.floor(SR * rand(1.5, 4.5));
  while (pos < N) {
    const len = Math.floor(SR * rand(0.7, 2.2));
    const amp = rand(0.12, 0.34);
    const f0 = rand(36, 95);
    let ph = 0;
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / Math.max(1, len - 1);
      const env = Math.exp(-4.6 * p);
      const f = f0 * (1 - p * 0.35);
      ph += (2 * Math.PI * f) / SR;
      booms[pos + i] += Math.sin(ph) * env * amp;
    }
    pos += Math.floor(SR * rand(boomGapMin, boomGapMax));
  }
  hp1(booms, 24);
  lp1(booms, 240);

  const swell = smoothRandomLfo(0.64, 1.26, 1.4, 6.2);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = roll[i] * rollMix * swell[i] + hiss[i] * hissMix + booms[i] * 0.16;
  }
  lp1(mix, masterLp);
  return gen(mix, 0.7);
}

function genNight(params?: Record<string, number>): string {
  const { crickets = 0.5, depth = 0.5, rustling = 0.4 } = params ?? {};
  const chirpGapScale = 1.5 - crickets;
  const chirpAmpScale = 0.7 + crickets * 0.6;
  const bedHp = 80 + (1 - depth) * 60;
  const bedMix = 0.75 + depth * 0.3;
  const rustlingDepth = 0.1 + rustling * 0.3;
  // Calm night ambience: low rustle + sparse insect chirps.
  const bed = pinkNoise();
  hp1(bed, bedHp);
  lp1(bed, 2600);

  const rustleLfo = smoothRandomLfo(1 - rustlingDepth, 1 + rustlingDepth, 1.0, 4.0);

  const chirps = new Float32Array(N);
  let pos = Math.floor(SR * rand(0.2, 0.9));
  while (pos < N) {
    const len = Math.floor(SR * rand(0.035, 0.11));
    const f0 = rand(2600, 4200);
    const amp = rand(0.012, 0.045) * chirpAmpScale;
    let ph = 0;
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / Math.max(1, len - 1);
      const env = Math.sin(Math.PI * p);
      ph += (2 * Math.PI * (f0 + 120 * Math.sin(2 * Math.PI * p * 3))) / SR;
      chirps[pos + i] += Math.sin(ph) * env * amp;
    }
    pos += Math.floor(SR * rand(0.4 * chirpGapScale, 1.9 * chirpGapScale));
  }
  lp1(chirps, 6200);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = bed[i] * bedMix * rustleLfo[i] + chirps[i] * (1 - bedMix);
  return gen(mix, 0.6);
}

function genTrain(params?: Record<string, number>): string {
  const { speed = 0.5, rumble: rumbleParam = 0.5, clatter = 0.35 } = params ?? {};
  const clickGapScale = 1.5 - speed;
  const rumbleMix = 0.35 + rumbleParam * 0.44;
  const clickLp = 3000 + clatter * 4000;
  const clickAmpScale = 0.7 + clatter * 0.6;
  // Distant train cabin: wheel rhythm + broad mechanical rumble.
  const rumble = brownNoise();
  hp1(rumble, 40);
  lp1(rumble, 460);

  const carriage = pinkNoise();
  hp1(carriage, 180);
  lp1(carriage, 1900);

  const clicks = new Float32Array(N);
  let pos = Math.floor(SR * 0.25);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.003, 0.012));
    const amp = rand(0.025, 0.085) * clickAmpScale;
    for (let i = 0; i < len && pos + i < N; i++) {
      clicks[pos + i] += (Math.random() * 2 - 1) * amp * Math.exp(-10 * (i / len));
    }
    pos += Math.floor(SR * rand(0.18 * clickGapScale, 0.62 * clickGapScale));
  }
  hp1(clicks, 1200);
  lp1(clicks, clickLp);

  const sway = smoothRandomLfo(0.78, 1.18, 0.8, 3.8);
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = rumble[i] * rumbleMix * sway[i] + carriage[i] * 0.33 + clicks[i] * 0.1;
  }
  return gen(mix, 0.68);
}

// ── Sound regeneration ────────────────────────────────────────────────────

const generatorMap: Record<string, (params?: Record<string, number>) => string> = {
  rain: genRain,
  stream: genStream,
  ocean: genOcean,
  wind: genWind,
  thunder: genThunder,
  forest: genForest,
  'white-noise': genWhite,
  'pink-noise': genPink,
  'brown-noise': genBrown,
  train: genTrain,
  fan: genFan,
  night: genNight,
  waterfall: genWaterfall,
  'tent-rain': genTentRain,
  'tin-roof-rain': genTinRoofRain,
  underwater: genUnderwater,
  shower: genShower,
  frogs: genFrogs,
  cafe: genCafe,
  airplane: genAirplane,
  dryer: genDryer,
  space: genSpace,
  heartbeat: genHeartbeat,
};

/** Regenerate a sound's WAV blob URL with the given tuning parameters. */
export function regenerateSound(soundId: string, params: Record<string, number>): string | null {
  const generator = generatorMap[soundId];
  if (!generator) return null;
  return generator(params);
}

function genWaterfall(params?: Record<string, number>): string {
  const { power = 0.6, mist = 0.4, distance = 0.3 } = params ?? {};
  // Powerful roaring waterfall: massive bass foundation + mid-roar + high spray + impact thuds

  // Bass layer 1: very deep rumble
  const bass1 = brownNoise();
  hp1(bass1, 20);
  lp1(bass1, 120);

  // Bass layer 2: broader low-mid foundation
  const bass2 = brownNoise();
  hp1(bass2, 40);
  lp1(bass2, 400);

  // Mid roar: heavily modulated pinkNoise
  const midRoar = pinkNoise();
  hp1(midRoar, 200);
  lp1(midRoar, 2000);
  const roarLfo = smoothRandomLfo(0.55, 1.0, 0.6, 2.5);
  for (let i = 0; i < N; i++) midRoar[i] *= roarLfo[i];

  // High spray: bandpassed white noise for mist and froth
  const spray = whiteNoise();
  hp1(spray, 3000);
  lp1(spray, 8000);

  // Impact events: water hitting rocks - short brown noise bursts 10-30ms
  const impacts = new Float32Array(N);
  let impPos = Math.floor(SR * rand(0.05, 0.3));
  while (impPos < N) {
    const impLen = Math.floor(SR * rand(0.010, 0.030));
    const impAmp = rand(0.3, 1.0) * (0.5 + power * 0.5);
    for (let i = 0; i < impLen && impPos + i < N; i++) {
      const env = Math.exp(-12 * (i / Math.max(1, impLen)));
      impacts[impPos + i] += (Math.random() * 2 - 1) * impAmp * env;
    }
    impPos += Math.floor(SR * rand(0.06, 0.35) / (0.4 + power * 0.6));
  }
  hp1(impacts, 30); lp1(impacts, 300);

  const bassBuf = new Float32Array(N);
  for (let i = 0; i < N; i++) bassBuf[i] = bass1[i] * 0.5 + bass2[i] * 0.5;

  const distLp = 2000 + (1 - distance) * 8000;
  const mistLevel = 0.12 + mist * 0.16;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = bassBuf[i] * 0.35 + midRoar[i] * 0.30 + spray[i] * mistLevel + impacts[i] * 0.15;
  }
  lp1(mix, distLp);
  return gen(mix, 0.68);
}

function genTentRain(params?: Record<string, number>): string {
  const { intensity = 0.6, fabric = 0.5, wind = 0.3 } = params ?? {};
  const bed = pinkNoise();
  hp1(bed, 300);
  lp1(bed, 3000 + fabric * 2000);
  const bedLfo = smoothRandomLfo(0.7, 1.2, 1.0, 3.0);

  const impactsBuf = new Float32Array(N);
  let pos = Math.floor(SR * 0.01);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.003, 0.012));
    const amp = Math.exp(rand(-4.5, -1.8));
    for (let i = 0; i < len && pos + i < N; i++) {
      const env = Math.exp(-10 * (i / Math.max(1, len)));
      impactsBuf[pos + i] += (Math.random() * 2 - 1) * amp * env;
    }
    pos += Math.floor(SR * rand(0.02, 0.15) / (intensity + 0.3));
  }
  hp1(impactsBuf, 800);
  lp1(impactsBuf, 4000 + fabric * 3000);
  bp2(impactsBuf, 1200 + fabric * 800, 2 + fabric * 3);

  const windBed = brownNoise();
  lp1(windBed, 400);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = bed[i] * 0.25 * bedLfo[i] + impactsBuf[i] * 0.50 + windBed[i] * wind * 0.15;
  }
  return gen(mix, 0.62);
}

function genTinRoofRain(params?: Record<string, number>): string {
  const { intensity = 0.6, metallic = 0.5, gutters = 0.4 } = params ?? {};
  const bed = pinkNoise();
  hp1(bed, 200);
  lp1(bed, 4000);

  const pings = new Float32Array(N);
  let pos = Math.floor(SR * 0.01);
  while (pos < N) {
    const pingF = rand(2000 + metallic * 2000, 4000 + metallic * 3000);
    const pingLen = Math.floor(SR * rand(0.005, 0.020));
    const pingAmp = rand(0.06, 0.20) * (0.5 + metallic);
    for (let i = 0; i < pingLen && pos + i < N; i++) {
      const env = Math.exp(-20 * (i / Math.max(1, pingLen)));
      pings[pos + i] += Math.sin(2 * Math.PI * pingF * (i / SR)) * env * pingAmp;
    }
    pos += Math.floor(SR * rand(0.01, 0.1) / (intensity + 0.3));
  }

  const gutterBuf = new Float32Array(N);
  const gBrown = brownNoise();
  const gPink = pinkNoise();
  for (let i = 0; i < N; i++) gutterBuf[i] = gBrown[i] * 0.5 + gPink[i] * 0.5;
  hp1(gutterBuf, 100);
  lp1(gutterBuf, 600 + gutters * 600);
  const gutterLfo = smoothRandomLfo(0.7, 1.1, 2.0, 6.0);
  for (let i = 0; i < N; i++) gutterBuf[i] *= gutterLfo[i];

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = bed[i] * 0.20 + pings[i] * 0.55 + gutterBuf[i] * gutters * 0.35;
  }
  return gen(mix, 0.64);
}

function genUnderwater(params?: Record<string, number>): string {
  const { depth = 0.6, bubbles = 0.4, current = 0.5 } = params ?? {};

  // Deep drone: very quiet atmospheric foundation (replaces loud noise beds)
  const deepDrone = brownNoise();
  lp1(deepDrone, 80);
  lp1(deepDrone, 80);

  const currentBuf = pinkNoise();
  hp1(currentBuf, 60);
  lp1(currentBuf, 400 + (1 - depth) * 800);
  const currentLfo = smoothRandomLfo(0.6, 1.2, 2.0, 6.0);
  const currentMix = 0.05 + current * 0.20;
  for (let i = 0; i < N; i++) currentBuf[i] *= currentLfo[i];

  const bubblesBuf = new Float32Array(N);
  let pos = Math.floor(SR * 0.05);
  while (pos < N) {
    // Sometimes emit a cluster of 2-5 quick bubbles
    const clusterSize = Math.random() < 0.3 ? Math.floor(rand(2, 5)) : 1;
    let clusterPos = pos;
    for (let c = 0; c < clusterSize; c++) {
      const bFreq = rand(120, 1200);
      const bLen = Math.floor(SR * rand(0.008, 0.030));
      const bAmp = rand(0.06, 0.20);
      let ph = 0;
      for (let i = 0; i < bLen && clusterPos + i < N; i++) {
        const p = i / Math.max(1, bLen);
        const env = Math.sin(Math.PI * p);
        const f = bFreq + bFreq * 0.3 * p; // pitch rise
        ph += (2 * Math.PI * f) / SR;
        bubblesBuf[clusterPos + i] += Math.sin(ph) * env * bAmp;
      }
      clusterPos += Math.floor(SR * rand(0.01, 0.05));
    }
    pos += Math.floor(SR * rand(0.05, 0.4) / (bubbles + 0.2));
  }
  hp1(bubblesBuf, 150);
  lp1(bubblesBuf, 2000);

  const finalLp = 800 + (1 - depth) * 3000;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = deepDrone[i] * 0.10 + currentBuf[i] * currentMix + bubblesBuf[i] * 0.70;
  }
  lp1(mix, finalLp);
  return gen(mix, 0.6);
}

function genShower(params?: Record<string, number>): string {
  const { pressure = 0.6, steam = 0.3, room = 0.5 } = params ?? {};
  // Primary spray: bandpassed white noise for realistic water spray character
  const spray = whiteNoise();
  hp1(spray, 1200);
  lp1(spray, 8000);
  const sprayLfo = smoothRandomLfo(0.85, 1.1, 0.8, 2.5);
  for (let i = 0; i < N; i++) spray[i] *= sprayLfo[i];

  // Second spray layer: body of water sound at lower band
  const spray2 = whiteNoise();
  hp1(spray2, 400);
  lp1(spray2, 3000);
  const spray2Lfo = smoothRandomLfo(0.8, 1.15, 1.0, 3.0);
  for (let i = 0; i < N; i++) spray2[i] *= spray2Lfo[i];

  // Minimal body: just a touch of pink for low-end foundation
  const bodyBuf = pinkNoise();
  hp1(bodyBuf, 100);
  lp1(bodyBuf, 2000 + pressure * 1000);

  const steamBuf = whiteNoise();
  hp1(steamBuf, 4000 + steam * 2000);
  lp1(steamBuf, 12000);

  const preMix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    preMix[i] = spray[i] * 0.50 + spray2[i] * 0.25 + bodyBuf[i] * 0.10 + steamBuf[i] * (0.05 + steam * 0.1);
  }
  // Room resonance (increased factor)
  const roomRes = new Float32Array(preMix);
  bp2(roomRes, 400 + room * 400, 1 + room * 2);
  for (let i = 0; i < N; i++) preMix[i] += roomRes[i] * room * 0.30;
  return gen(preMix, 0.65);
}

function genFrogs(params?: Record<string, number>): string {
  const { chorus = 0.5, pitch = 0.5, swamp = 0.4 } = params ?? {};
  const swampBed = pinkNoise();
  hp1(swampBed, 80);
  lp1(swampBed, 1800);
  const swampMix = 0.08 + swamp * 0.15;

  // Deep croaks
  const deepBuf = new Float32Array(N);
  let pos = Math.floor(SR * rand(0.1, 0.5));
  while (pos < N) {
    const f0 = rand(180 + pitch * 80, 350 + pitch * 100);
    const dur = Math.floor(SR * rand(0.08, 0.200));
    const amp = rand(0.06, 0.14);
    const amRate = rand(8, 15);
    let ph = 0;
    for (let i = 0; i < dur && pos + i < N; i++) {
      const p = i / dur;
      const env = Math.sin(Math.PI * p) * amp;
      const am = 0.5 + 0.5 * Math.sin(2 * Math.PI * amRate * (i / SR));
      ph += (2 * Math.PI * f0) / SR;
      deepBuf[pos + i] += Math.sin(ph) * env * am;
    }
    pos += Math.floor(SR * rand(0.3, 2.0) / (chorus + 0.3));
  }
  hp1(deepBuf, 100);
  lp1(deepBuf, 600);

  // Mid ribbits
  const midBuf = new Float32Array(N);
  pos = Math.floor(SR * rand(0.2, 0.6));
  while (pos < N) {
    const f0 = rand(400 + pitch * 200, 800 + pitch * 300);
    const dur = Math.floor(SR * rand(0.04, 0.100));
    const amp = rand(0.04, 0.10);
    let ph = 0;
    for (let i = 0; i < dur && pos + i < N; i++) {
      const p = i / dur;
      const env = Math.sin(Math.PI * p) * amp;
      const bend = 1 + 0.2 * Math.sin(Math.PI * p); // pitch bend up then down
      ph += (2 * Math.PI * f0 * bend) / SR;
      midBuf[pos + i] += Math.sin(ph) * env;
    }
    pos += Math.floor(SR * rand(0.2, 1.5) / (chorus + 0.3));
  }
  hp1(midBuf, 300);
  lp1(midBuf, 1400);

  // High peepers
  const highBuf = new Float32Array(N);
  pos = Math.floor(SR * rand(0.05, 0.3));
  while (pos < N) {
    const f0 = rand(1500 + pitch * 500, 2800 + pitch * 500);
    const dur = Math.floor(SR * rand(0.015, 0.040));
    const amp = rand(0.03, 0.08);
    let ph = 0;
    for (let i = 0; i < dur && pos + i < N; i++) {
      const p = i / dur;
      const env = Math.sin(Math.PI * p) * amp;
      ph += (2 * Math.PI * f0) / SR;
      highBuf[pos + i] += Math.sin(ph) * env;
    }
    pos += Math.floor(SR * rand(0.1, 0.8) / (chorus + 0.3));
  }
  lp1(highBuf, 5000);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = swampBed[i] * swampMix + deepBuf[i] * 0.40 + midBuf[i] * 0.28 + highBuf[i] * 0.24;
  }
  return gen(mix, 0.6);
}

function genCafe(params?: Record<string, number>): string {
  const { crowd = 0.6, clinks = 0.3, warmth = 0.5 } = params ?? {};
  const murmurPink = pinkNoise();
  const murmurBrown = brownNoise();
  const murmur = new Float32Array(N);
  for (let i = 0; i < N; i++) murmur[i] = murmurPink[i] * 0.6 + murmurBrown[i] * 0.4;
  hp1(murmur, 100 + warmth * 100);
  lp1(murmur, 800 + (1 - warmth) * 1200);
  const murmurLfo = smoothRandomLfo(0.5, 1.2, 0.6, 2.5);
  for (let i = 0; i < N; i++) murmur[i] *= murmurLfo[i];

  const clinksBuf = new Float32Array(N);
  let pos = Math.floor(SR * rand(0.3, 1.0));
  while (pos < N) {
    const cFreq = rand(3000, 6000);
    const cLen = Math.floor(SR * rand(0.010, 0.030));
    const cAmp = rand(0.02, 0.06);
    for (let i = 0; i < cLen && pos + i < N; i++) {
      const env = Math.exp(-15 * (i / Math.max(1, cLen)));
      clinksBuf[pos + i] += Math.sin(2 * Math.PI * cFreq * (i / SR)) * env * cAmp;
    }
    pos += Math.floor(SR * rand(0.5, 3.0) / (clinks + 0.2));
  }
  hp1(clinksBuf, 2000);
  lp1(clinksBuf, 8000);

  const bgHum = brownNoise();
  lp1(bgHum, 200);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = murmur[i] * (0.4 + crowd * 0.4) + clinksBuf[i] * (0.05 + clinks * 0.1) + bgHum[i] * 0.1;
  }
  return gen(mix, 0.58);
}

function genAirplane(params?: Record<string, number>): string {
  const { altitude = 0.5, cabin = 0.6, turbulence = 0.3 } = params ?? {};
  const drone = brownNoise();
  hp1(drone, 40 + altitude * 40);
  lp1(drone, 300 + altitude * 200);

  const drone2 = pinkNoise();
  hp1(drone2, 80);
  lp1(drone2, 600 + altitude * 400);
  bp2(drone2, 120 + altitude * 80, 2);

  const cabinNoise = pinkNoise();
  hp1(cabinNoise, 200);
  lp1(cabinNoise, 3000 + cabin * 2000);

  const turbBuf = brownNoise();
  const turbLfo = smoothRandomLfo(0.0, 1.0, 2.0, 8.0);
  hp1(turbBuf, 20);
  lp1(turbBuf, 200);
  for (let i = 0; i < N; i++) turbBuf[i] *= turbLfo[i];

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = drone[i] * 0.35 + drone2[i] * 0.2 + cabinNoise[i] * (0.2 + cabin * 0.2) + turbBuf[i] * turbulence * 0.15;
  }
  return gen(mix, 0.66);
}

function genDryer(params?: Record<string, number>): string {
  const { speed = 0.5, hum = 0.5, tumble = 0.4 } = params ?? {};
  const humLp = 80 + hum * 60;
  const humBuf = brownNoise();
  lp1(humBuf, humLp);
  lp1(humBuf, humLp);

  const airflowBuf = pinkNoise();
  hp1(airflowBuf, 150 + speed * 100);
  lp1(airflowBuf, 2000 + speed * 1000);
  const flutterFreq = 8 + speed * 8;
  const flutterDepth = 0.1 + speed * 0.15;
  for (let i = 0; i < N; i++) {
    airflowBuf[i] *= 1 - flutterDepth + flutterDepth * Math.sin((2 * Math.PI * flutterFreq * i) / SR);
  }

  const tumbleBuf = new Float32Array(N);
  let pos = Math.floor(SR * 0.1);
  while (pos < N) {
    const tLen = Math.floor(SR * rand(0.020, 0.060));
    const tAmp = rand(0.04, 0.12) * tumble;
    for (let i = 0; i < tLen && pos + i < N; i++) {
      const env = Math.exp(-6 * (i / Math.max(1, tLen)));
      tumbleBuf[pos + i] += (Math.random() * 2 - 1) * tAmp * env;
    }
    lp1(tumbleBuf, 200 + tumble * 200);
    pos += Math.floor(SR * rand(0.3, 1.0) / (speed + 0.3));
  }

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = humBuf[i] * (0.15 + hum * 0.2) + airflowBuf[i] * 0.5 + tumbleBuf[i] * (0.1 + tumble * 0.2);
  }
  return gen(mix, 0.62);
}

function genSpace(params?: Record<string, number>): string {
  const { void: voidParam = 0.6, cosmic = 0.4, pulse = 0.3 } = params ?? {};
  const voidBuf = brownNoise();
  lp1(voidBuf, 60 + voidParam * 40);
  lp1(voidBuf, 60 + voidParam * 40);

  const shimmer1 = whiteNoise();
  bp2(shimmer1, 2000 + cosmic * 3000, 8 + cosmic * 8);

  const shimmer2 = whiteNoise();
  bp2(shimmer2, 4000 + cosmic * 2000, 6 + cosmic * 6);

  const pulseLfo = smoothRandomLfo(0.2, 1.0, 4 + pulse * 8, 8 + pulse * 16);
  const driftLfo = smoothRandomLfo(0.7, 1.1, 3.0, 10.0);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = (voidBuf[i] * (0.3 + voidParam * 0.3) +
              shimmer1[i] * 0.1 * (0.5 + cosmic) * driftLfo[i] +
              shimmer2[i] * 0.06 * (0.5 + cosmic) * driftLfo[i]) * pulseLfo[i];
  }
  return gen(mix, 0.55);
}

function genHeartbeat(params?: Record<string, number>): string {
  const { rate = 0.5, chest = 0.6, muffle = 0.5 } = params ?? {};
  const bpm = 52 + rate * 28;
  const beatInterval = Math.floor(SR * 60 / bpm);
  const lubFreq = 40 + chest * 20;
  const dubFreq = 50 + chest * 25;
  const noiseLp = 100 + chest * 80;
  const finalLp = 200 + (1 - muffle) * 600;

  const beats = new Float32Array(N);
  let beatPos = Math.floor(SR * 0.5);
  while (beatPos < N) {
    // Lub
    const lubLen = Math.floor(SR * rand(0.08, 0.12));
    for (let i = 0; i < lubLen && beatPos + i < N; i++) {
      const p = i / lubLen;
      const env = Math.sin(Math.PI * p);
      const noise = (Math.random() * 2 - 1) * 0.3;
      beats[beatPos + i] += (Math.sin(2 * Math.PI * lubFreq * (i / SR)) * 0.7 + noise) * env * 0.25;
    }
    // Dub (offset ~200ms)
    const dubOffset = Math.floor(SR * 0.2);
    const dubLen = Math.floor(SR * rand(0.06, 0.09));
    const dubPos = beatPos + dubOffset;
    for (let i = 0; i < dubLen && dubPos + i < N; i++) {
      const p = i / dubLen;
      const env = Math.sin(Math.PI * p);
      const noise = (Math.random() * 2 - 1) * 0.3;
      beats[dubPos + i] += (Math.sin(2 * Math.PI * dubFreq * (i / SR)) * 0.7 + noise) * env * 0.25 * 0.6;
    }
    // Add brown noise burst for realism at beat position
    const burstLen = Math.floor(SR * 0.15);
    for (let i = 0; i < burstLen && beatPos + i < N; i++) {
      const p = i / burstLen;
      const env = Math.exp(-5 * p);
      beats[beatPos + i] += (Math.random() * 2 - 1) * 0.04 * env;
    }
    // Slight timing jitter
    const jitter = Math.floor(rand(-0.01, 0.01) * beatInterval);
    beatPos += beatInterval + jitter;
  }
  lp1(beats, noiseLp);

  // Gentle bed
  const bed = brownNoise();
  lp1(bed, 80);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = beats[i] + bed[i] * 0.05;
  lp1(mix, finalLp);
  return gen(mix, 0.6);
}

// ── Sound library ──────────────────────────────────────────────────────────

export const SOUND_LIBRARY: Sound[] = [
  // Water
  { id: 'rain',          name: 'Rain',          category: 'Water',    url: genRain() },
  { id: 'stream',        name: 'Stream',        category: 'Water',    url: genStream() },
  { id: 'ocean',         name: 'Ocean',         category: 'Water',    url: genOcean() },
  { id: 'waterfall',     name: 'Waterfall',     category: 'Water',    url: genWaterfall() },
  { id: 'tent-rain',     name: 'Tent Rain',     category: 'Water',    url: genTentRain() },
  { id: 'tin-roof-rain', name: 'Tin Roof Rain', category: 'Water',    url: genTinRoofRain() },
  { id: 'underwater',    name: 'Underwater',    category: 'Water',    url: genUnderwater() },
  { id: 'shower',        name: 'Shower',        category: 'Water',    url: genShower() },
  // Fire
  { id: 'fire',          name: 'Fire',          category: 'Fire',     url: genFire() },
  // Air
  { id: 'wind',          name: 'Wind',          category: 'Air',      url: genWind() },
  { id: 'thunder',       name: 'Thunder',       category: 'Air',      url: genThunder() },
  { id: 'fan',           name: 'Fan',           category: 'Air',      url: genFan() },
  // Earth
  { id: 'forest',        name: 'Forest',        category: 'Earth',    url: genForest() },
  // Noise
  { id: 'white-noise',   name: 'White Noise',   category: 'Noise',    url: genWhite() },
  { id: 'pink-noise',    name: 'Pink Noise',    category: 'Noise',    url: genPink() },
  { id: 'brown-noise',   name: 'Brown Noise',   category: 'Noise',    url: genBrown() },
  { id: 'space',         name: 'Deep Space',    category: 'Noise',    url: genSpace() },
  // Urban
  { id: 'train',         name: 'Train',         category: 'Urban',    url: genTrain() },
  { id: 'airplane',      name: 'Airplane',      category: 'Urban',    url: genAirplane() },
  { id: 'cafe',          name: 'Café',          category: 'Urban',    url: genCafe() },
  { id: 'dryer',         name: 'Dryer',         category: 'Urban',    url: genDryer() },
  // Wildlife
  { id: 'night',         name: 'Night',         category: 'Wildlife', url: genNight() },
  { id: 'birdsong',      name: 'Birdsong',      category: 'Wildlife', url: genBirdsong() },
  { id: 'frogs',         name: 'Frogs',         category: 'Wildlife', url: genFrogs() },
  // Cozy
  { id: 'heartbeat',     name: 'Heartbeat',     category: 'Cozy',    url: genHeartbeat() },
];

export const CATEGORIES = ['All', 'Water', 'Fire', 'Air', 'Earth', 'Noise', 'Urban', 'Wildlife', 'Cozy'] as const;
export type Category = typeof CATEGORIES[number];

export const PRESET_STORAGE_KEY = 'sleep-mixer-presets-v2';

// ── Built-in presets ───────────────────────────────────────────────────────

function builtinState(active: Array<[string, number]>): Record<string, SoundState> {
  const result: Record<string, SoundState> = {};
  for (const s of SOUND_LIBRARY) result[s.id] = { enabled: false, volume: 0.5 };
  for (const [id, vol] of active) result[id] = { enabled: true, volume: vol };
  return result;
}

export const BUILTIN_PRESETS: Preset[] = [
  { id: 'builtin-fan-rain',       name: 'Fan & Rain',     createdAt: '', masterVolume: 0.8,  state: builtinState([['fan', 0.38], ['rain', 0.72]]) },
  { id: 'builtin-windy-forest',   name: 'Windy Forest',   createdAt: '', masterVolume: 0.8,  state: builtinState([['wind', 0.55], ['forest', 0.70]]) },
  { id: 'builtin-campfire-night',  name: 'Campfire Night', createdAt: '', masterVolume: 0.8,  state: builtinState([['fire', 0.68], ['forest', 0.28]]) },
  { id: 'builtin-rainy-train',    name: 'Rainy Train',    createdAt: '', masterVolume: 0.78, state: builtinState([['rain', 0.62], ['train', 0.44], ['thunder', 0.34]]) },
  { id: 'builtin-deep-sleep',     name: 'Deep Sleep',     createdAt: '', masterVolume: 0.7,  state: builtinState([['brown-noise', 0.55], ['heartbeat', 0.40]]) },
  { id: 'builtin-rainforest',     name: 'Rainforest',     createdAt: '', masterVolume: 0.8,  state: builtinState([['rain', 0.45], ['forest', 0.50], ['frogs', 0.35], ['birdsong', 0.25]]) },
  { id: 'builtin-underwater-cave', name: 'Underwater Cave', createdAt: '', masterVolume: 0.75, state: builtinState([['underwater', 0.60], ['space', 0.30]]) },
  { id: 'builtin-cozy-cafe',      name: 'Cozy Café',      createdAt: '', masterVolume: 0.8,  state: builtinState([['cafe', 0.55], ['rain', 0.35]]) },
];
