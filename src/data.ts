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
  const { crickets: cricketParam = 0.5, depth = 0.5, rustling = 0.4 } = params ?? {};
  // Night insects: stridulation model — noise through narrow resonators, not pure sines.
  const buf = new Float32Array(N);

  const cricketAmpScale = 0.5 + cricketParam;
  const cricketRateScale = 0.7 + cricketParam * 0.6;
  const katyAmpScale = 0.3 + rustling * 1.4;

  const crickets = [
    { freq: 4200, q: 22, rate: 2.1, amp: 0.24, toothRate: 42, burstDuty: 0.13 },
    { freq: 4480, q: 18, rate: 1.85, amp: 0.20, toothRate: 38, burstDuty: 0.11 },
    { freq: 3980, q: 25, rate: 2.05, amp: 0.17, toothRate: 45, burstDuty: 0.14 },
    { freq: 4720, q: 20, rate: 1.65, amp: 0.13, toothRate: 35, burstDuty: 0.10 },
    { freq: 5100, q: 16, rate: 2.3, amp: 0.09, toothRate: 50, burstDuty: 0.09 },
  ];

  for (const c of crickets) {
    const noise = whiteNoise();
    const resonated = new Float32Array(N);
    for (let i = 0; i < N; i++) resonated[i] = noise[i];
    bp2(resonated, c.freq, c.q);
    bp2(resonated, c.freq * rand(0.995, 1.005), c.q * 0.7);

    const rateDrift = smoothRandomLfo(0.82, 1.18, 1.5, 6.0);
    const ampDrift = smoothRandomLfo(0.6, 1.0, 3.0, 10.0);
    const silenceLfo = smoothRandomLfo(0.0, 1.0, 4.0, 12.0);

    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const effectiveRate = c.rate * rateDrift[i] * cricketRateScale;
      const cycle = (t * effectiveRate) % 1;

      let env = 0;
      if (cycle < c.burstDuty) {
        env = Math.sin((cycle / c.burstDuty) * Math.PI);
      } else if (cycle >= 0.32 && cycle < 0.32 + c.burstDuty * 0.7) {
        env = Math.sin(((cycle - 0.32) / (c.burstDuty * 0.7)) * Math.PI) * 0.55;
      }

      if (env > 0) {
        const toothPhase = (t * c.toothRate * effectiveRate) % 1;
        const toothMod = 0.6 + 0.4 * Math.sin(toothPhase * 2 * Math.PI);
        env *= toothMod;
      }

      const silenceGate = silenceLfo[i] > 0.25 ? 1.0 : silenceLfo[i] / 0.25;
      buf[i] += resonated[i] * env * c.amp * ampDrift[i] * silenceGate * cricketAmpScale;
    }
  }

  // Katydid-like background
  const katydid = whiteNoise();
  bp2(katydid, 2800, 12);
  const katyEnv = smoothRandomLfo(0.0, 0.06, 2.0, 8.0);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const buzzCycle = (t * 0.8) % 1;
    const gate = buzzCycle < 0.45 ? Math.sin((buzzCycle / 0.45) * Math.PI) ** 0.5 : 0;
    buf[i] += katydid[i] * gate * katyEnv[i] * katyAmpScale;
  }

  // Dark ambient bed — barely audible, scaled by depth
  const amb = brownNoise();
  lp1(amb, 180 + depth * 160); lp1(amb, 140);
  const ambMix = 0.02 + depth * 0.08;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = buf[i] + amb[i] * ambMix;
  return gen(mix, 0.52);
}

function genTrain(params?: Record<string, number>): string {
  const { speed: speedParam = 0.5, rumble: rumbleParam = 0.5, clatter = 0.35 } = params ?? {};
  // Train cabin: filtered drone + rail-joint pulses + subtle rattles
  const drone = pinkNoise();
  hp1(drone, 70); lp1(drone, 680); lp1(drone, 480);

  const pulses = new Float32Array(N);
  const pulseShape = (phase: number) => Math.sin(phase * Math.PI) ** 3.8;
  const intervalScale = 1.4 - speedParam * 0.8;
  let next = Math.floor(SR * 0.2);
  while (next < N) {
    const interval = Math.floor(SR * rand(0.50 * intervalScale, 0.68 * intervalScale));
    const lenA = Math.floor(SR * rand(0.025, 0.045));
    const lenB = Math.floor(SR * rand(0.016, 0.032));
    const offsetB = Math.floor(SR * rand(0.06, 0.14));
    for (let i = 0; i < lenA && next + i < N; i++) {
      pulses[next + i] += pulseShape(i / lenA) * rand(0.18, 0.36);
    }
    for (let i = 0; i < lenB && next + offsetB + i < N; i++) {
      pulses[next + offsetB + i] += pulseShape(i / lenB) * rand(0.10, 0.24);
    }
    next += interval;
  }
  bp2(pulses, 420, 1.2);
  lp1(pulses, 520);

  const rattles = new Float32Array(N);
  let rPos = Math.floor(SR * 0.15);
  while (rPos < N) {
    const len = Math.floor(SR * rand(0.006, 0.03));
    for (let i = 0; i < len && rPos + i < N; i++) {
      const env = Math.exp(-5 * (i / len));
      rattles[rPos + i] += (Math.random() * 2 - 1) * env * rand(0.03, 0.09) * (0.5 + clatter);
    }
    rPos += Math.floor(SR * rand(0.14, 0.65));
  }
  hp1(rattles, 800);
  lp1(rattles, 3500);

  const mix = new Float32Array(N);
  const sway = smoothRandomLfo(0.84, 1.16, 1.2, 4.0);
  const rumbleMix = 0.45 + rumbleParam * 0.35;
  for (let i = 0; i < N; i++) {
    const wheel = 0.92 + 0.08 * Math.sin((2 * Math.PI * 3.4 * i) / SR);
    mix[i] = drone[i] * rumbleMix * sway[i] * wheel + pulses[i] * 0.26 + rattles[i] * 0.12;
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
  // Waterfall: dense broad-spectrum water noise with pressure surges and impact detail
  const low = brownNoise();
  hp1(low, 120);
  lp1(low, 1000 + power * 200); lp1(low, 760);

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
    pos += Math.floor(SR * rand(0.01, 0.065) / (0.4 + power * 0.6));
  }
  hp1(impacts, 900);
  lp1(impacts, 7000);
  const mix = new Float32Array(N);
  const flow = smoothRandomLfo(0.82, 1.18, 0.7, 2.1);
  const sprayMix = 0.22 + mist * 0.24;
  const distLp = 2000 + (1 - distance) * 6000;
  for (let i = 0; i < N; i++) {
    const plunge = 0.70 + 0.30 * Math.sin((2 * Math.PI * 0.13 * i) / SR + 0.5);
    mix[i] = low[i] * 0.56 * flow[i] + spray[i] * sprayMix * plunge + impacts[i] * 0.10;
  }
  lp1(mix, distLp);
  return gen(mix, 0.66);
}

function genTentRain(params?: Record<string, number>): string {
  const { intensity = 0.6, fabric = 0.5, wind: windParam = 0.3 } = params ?? {};
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
      const modeBase = 620 + fabric * 200;
      const modes = [rand(modeBase, modeBase + 360), rand(modeBase + 360, modeBase + 1030), rand(modeBase + 1030, modeBase + 1780)];
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
      pos += Math.floor(SR * rand(0.01, 0.07) / (intensity + 0.3));
    }
    pos += Math.floor(SR * rand(0.04, 0.3));
  }
  hp1(taps, 450);
  lp1(taps, 5200);

  const windBed = brownNoise();
  lp1(windBed, 300);

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.75, 1.25, 1.3, 4.0);
  for (let i = 0; i < N; i++) mix[i] = bed[i] * 0.50 * gust[i] + taps[i] * 0.34 + windBed[i] * windParam * 0.16;
  return gen(mix, 0.64);
}

function genTinRoofRain(params?: Record<string, number>): string {
  const { intensity = 0.6, metallic = 0.5, gutters = 0.4 } = params ?? {};
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
    const hitF = rand(1400 + metallic * 1000, 5200 + metallic * 1500);
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
    pos += Math.floor(SR * rand(0.005, 0.028) / (intensity + 0.3));
  }

  hp1(ping, 900);
  lp1(ping, 7600);
  hp1(reson, 90);
  lp1(reson, 2400);

  // Gutter runoff
  const gutterBuf = brownNoise();
  lp1(gutterBuf, 300 + gutters * 400);
  const gutterLfo = smoothRandomLfo(0.7, 1.1, 2.0, 6.0);
  for (let i = 0; i < N; i++) gutterBuf[i] *= gutterLfo[i];

  const mix = new Float32Array(N);
  const gust = smoothRandomLfo(0.84, 1.2, 0.9, 3.2);
  for (let i = 0; i < N; i++) {
    mix[i] = bed[i] * 0.48 * gust[i] + ping[i] * 0.27 + reson[i] * 0.13 + gutterBuf[i] * gutters * 0.12;
  }
  return gen(mix, 0.70);
}

function genUnderwater(params?: Record<string, number>): string {
  const { depth: depthParam = 0.6, bubbles: bubblesParam = 0.4, current = 0.5 } = params ?? {};
  // Deep underwater: low pressure rumble + soft bubble streams
  const depthBuf = brownNoise();
  lp1(depthBuf, 140 + depthParam * 40); lp1(depthBuf, 110); lp1(depthBuf, 85);
  hp1(depthBuf, 20);
  const bubblesBuf = new Float32Array(N);
  let pos = Math.floor(SR * 0.35);
  while (pos < N) {
    const len = Math.floor(SR * rand(0.018, 0.07));
    const f0 = rand(120, 260);
    const f1 = f0 * rand(1.2, 1.8);
    for (let i = 0; i < len && pos + i < N; i++) {
      const p = i / len;
      const env = Math.sin(Math.min(1, p) * Math.PI) ** 1.8;
      const f = f0 + (f1 - f0) * p;
      bubblesBuf[pos + i] += Math.sin(2 * Math.PI * f * (i / SR)) * env * rand(0.03, 0.09);
    }
    pos += Math.floor(SR * rand(0.25, 1.2) / (bubblesParam + 0.3));
  }
  hp1(bubblesBuf, 70);
  lp1(bubblesBuf, 700);
  const currentMix = 0.05 + current * 0.15;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const b1 = 0.68 + 0.32 * Math.sin((2 * Math.PI * 0.28 * i) / SR);
    const b2 = 0.84 + 0.16 * Math.sin((2 * Math.PI * 0.71 * i) / SR + 0.9);
    mix[i] = depthBuf[i] * b1 * b2 * (0.70 + depthParam * 0.26) + bubblesBuf[i] * (0.10 + bubblesParam * 0.14) + depthBuf[i] * currentMix;
  }
  return gen(mix, 0.60);
}

function genShower(params?: Record<string, number>): string {
  const { pressure = 0.6, steam = 0.3, room = 0.5 } = params ?? {};
  // Shower: dense hiss + tiled-room body + sparkling droplets
  const hiss = whiteNoise();
  hp1(hiss, 900 + pressure * 300);
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

  const pressureLfo = smoothRandomLfo(0.86, 1.12, 0.8, 2.2);
  const bodyMix = 0.22 + room * 0.16;
  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    mix[i] = hiss[i] * 0.54 * pressureLfo[i] + body[i] * bodyMix + droplets[i] * 0.16;
  }
  // Room resonance
  if (room > 0.1) {
    const roomRes = new Float32Array(mix);
    bp2(roomRes, 400 + room * 400, 1 + room * 2);
    for (let i = 0; i < N; i++) mix[i] += roomRes[i] * room * 0.12 + (steam > 0.1 ? hiss[i] * steam * 0.06 : 0);
  }
  return gen(mix, 0.66);
}

function genFrogs(params?: Record<string, number>): string {
  const { chorus: chorusParam = 0.5, pitch: pitchParam = 0.5, swamp = 0.4 } = params ?? {};
  // Frog chorus: 4 species spanning bass→treble with vocal-sac resonance
  const croaks = new Float32Array(N);
  const chorusLfo = smoothRandomLfo(0.2, 1.0, 5.0, 14.0);

  const pitchScale = 0.8 + pitchParam * 0.4;
  const chorusScale = 0.5 + chorusParam;

  const species = [
    { fMin: 100, fMax: 165, sacR: 1.88, sub: 0.12, nz: 0.15,
      minGap: 2.0, maxGap: 5.0, amp: 0.26, pMin: 2, pMax: 4 },
    { fMin: 580, fMax: 950, sacR: 1.65, sub: 0.06, nz: 0.22,
      minGap: 0.8, maxGap: 2.5, amp: 0.18, pMin: 3, pMax: 6 },
    { fMin: 1600, fMax: 2400, sacR: 1.48, sub: 0.02, nz: 0.28,
      minGap: 0.5, maxGap: 1.6, amp: 0.14, pMin: 2, pMax: 4 },
    { fMin: 2700, fMax: 3300, sacR: 1.35, sub: 0.0, nz: 0.32,
      minGap: 1.2, maxGap: 3.0, amp: 0.10, pMin: 1, pMax: 2 },
  ];

  for (const sp of species) {
    const sacRatio = sp.sacR * rand(0.94, 1.06);
    let pos = Math.floor(SR * Math.random() * 2.0);
    while (pos < N) {
      const activity = chorusLfo[Math.min(pos, N - 1)];
      if (activity < 0.3 && chance(0.65)) {
        pos += Math.floor(SR * rand(2.0, 5.0));
        continue;
      }
      const pulseCount = Math.floor(rand(sp.pMin, sp.pMax + 1));
      const baseFreq = rand(sp.fMin * pitchScale, sp.fMax * pitchScale);
      let eventPos = pos;
      for (let pIdx = 0; pIdx < pulseCount && eventPos < N; pIdx++) {
        const len = Math.floor(SR * rand(0.04, 0.14));
        const pulseGap = Math.floor(SR * rand(0.022, 0.065));
        const freq = baseFreq * rand(0.93, 1.07);
        const pitchDropAmt = rand(0.10, 0.32);
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
      pos += Math.floor(SR * (sp.minGap + Math.random() * (sp.maxGap - sp.minGap)) * gapMod / chorusScale);
    }
  }

  // Dark ambient — barely audible, no hiss
  const amb = brownNoise();
  lp1(amb, 260); lp1(amb, 180);

  const mix = new Float32Array(N);
  const swampMix = 0.04 + swamp * 0.10;
  for (let i = 0; i < N; i++) mix[i] = croaks[i] * 0.92 + amb[i] * swampMix;
  hp1(mix, 45);
  lp1(mix, 4800);
  return gen(mix, 0.58);
}

function genCafe(params?: Record<string, number>): string {
  const { crowd = 0.6, clinks: clinksParam = 0.3, warmth = 0.5 } = params ?? {};
  // Distant café murmur: bandpassed pink noise with conversational ebb and flow
  const base = pinkNoise();
  hp1(base, 200 + warmth * 60);
  lp1(base, 1100 - warmth * 200); lp1(base, 850);

  const clinksBuf = new Float32Array(N);
  let cPos = Math.floor(SR * rand(0.3, 1.0));
  while (cPos < N) {
    const cFreq = rand(3000, 6000);
    const cLen = Math.floor(SR * rand(0.008, 0.025));
    const cAmp = rand(0.04, 0.12);
    for (let i = 0; i < cLen && cPos + i < N; i++) {
      const env = Math.exp(-15 * (i / Math.max(1, cLen)));
      clinksBuf[cPos + i] += Math.sin(2 * Math.PI * cFreq * (i / SR)) * env * cAmp;
    }
    cPos += Math.floor(SR * rand(0.8, 3.5) / (clinksParam + 0.2));
  }
  hp1(clinksBuf, 2000);
  lp1(clinksBuf, 8000);

  const mix = new Float32Array(N);
  let p1 = 0, p2 = 0.7, p3 = 1.3;
  const crowdMix = 0.5 + crowd * 0.5;
  for (let i = 0; i < N; i++) {
    p1 += (2 * Math.PI * 0.31) / SR;
    p2 += (2 * Math.PI * 0.52) / SR;
    p3 += (2 * Math.PI * 0.17) / SR;
    const activity = 0.62 + 0.22 * Math.sin(p1) + 0.10 * Math.sin(p2) + 0.06 * Math.abs(Math.sin(p3));
    mix[i] = base[i] * activity * crowdMix + clinksBuf[i] * (0.04 + clinksParam * 0.08);
  }
  return gen(mix, 0.60);
}

function genAirplane(params?: Record<string, number>): string {
  const { altitude = 0.5, cabin = 0.6, turbulence = 0.3 } = params ?? {};
  // Cabin drone: steady filtered airflow + deep engine fundamental
  const air = pinkNoise();
  hp1(air, 160);
  lp1(air, 850 + cabin * 200); lp1(air, 680);

  const engine = brownNoise();
  lp1(engine, 58 + altitude * 20); lp1(engine, 48);

  const turbBuf = brownNoise();
  const turbLfo = smoothRandomLfo(0.0, 1.0, 1.5, 6.0);
  hp1(turbBuf, 20);
  lp1(turbBuf, 180);
  for (let i = 0; i < N; i++) turbBuf[i] *= turbLfo[i];

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const flutter = 0.97 + 0.03 * Math.sin((2 * Math.PI * 11.3 * i) / SR);
    mix[i] = air[i] * 0.68 * flutter + engine[i] * 0.32 + turbBuf[i] * turbulence * 0.10;
  }
  return gen(mix, 0.68);
}

function genDryer(params?: Record<string, number>): string {
  const { speed: speedParam = 0.5, hum: humParam = 0.5, tumble: tumbleParam = 0.4 } = params ?? {};
  // Tumbling dryer: low mechanical hum with soft, jittered thumps
  const humBuf = pinkNoise();
  hp1(humBuf, 65); lp1(humBuf, 280 + humParam * 60); lp1(humBuf, 210);

  // Event-based thumps with timing jitter
  const thumps = new Float32Array(N);
  const baseInterval = 1 / (0.85 + speedParam * 0.3);
  let pos = Math.floor(SR * rand(0.1, 0.5));
  while (pos < N) {
    const thumpLen = Math.floor(SR * rand(0.04, 0.10));
    const amp = rand(0.18, 0.38) * (0.5 + tumbleParam);
    const f = rand(52, 88);
    for (let i = 0; i < thumpLen && pos + i < N; i++) {
      const p = i / thumpLen;
      const env = Math.sin(p * Math.PI) ** 1.6;
      thumps[pos + i] += Math.sin(2 * Math.PI * f * (i / SR)) * env * amp;
    }
    const jitter = rand(0.80, 1.20);
    pos += Math.floor(SR * baseInterval * jitter);
  }
  lp1(thumps, 200); lp1(thumps, 160);

  const mix = new Float32Array(N);
  const motorDrift = smoothRandomLfo(0.92, 1.08, 1.5, 5.0);
  for (let i = 0; i < N; i++) {
    mix[i] = humBuf[i] * 0.72 * motorDrift[i] + thumps[i] * 0.28;
  }
  return gen(mix, 0.65);
}

function genSpace(params?: Record<string, number>): string {
  const { void: voidParam = 0.6, cosmic = 0.4, pulse = 0.3 } = params ?? {};
  // Two-layer deep drone with slow independent modulations — NO white noise
  const r1 = brownNoise();
  lp1(r1, 80 + voidParam * 20); lp1(r1, 60); lp1(r1, 50);

  const r2 = brownNoise();
  lp1(r2, 200 + cosmic * 60); lp1(r2, 160);

  const mix = new Float32Array(N);
  const modFreq1 = 0.02 + pulse * 0.04;
  const modFreq2 = 0.01 + pulse * 0.02;
  for (let i = 0; i < N; i++) {
    const m1 = 0.62 + 0.38 * Math.sin((2 * Math.PI * modFreq1 * i) / SR);
    const m2 = 0.78 + 0.22 * Math.sin((2 * Math.PI * modFreq2 * i) / SR + 1.1);
    mix[i] = r1[i] * (0.45 + voidParam * 0.35) * m1 + r2[i] * (0.20 + cosmic * 0.25) * m2;
  }
  return gen(mix, 0.62);
}

function genHeartbeat(params?: Record<string, number>): string {
  const { rate: rateParam = 0.5, chest: chestParam = 0.6, muffle = 0.5 } = params ?? {};
  // Realistic lub-dub with heart rate variability (HRV) and thumpy resonance
  const beat = new Float32Array(N);
  const bpm = 52 + rateParam * 28;
  const baseInterval = SR * (60 / bpm);
  const hrvLfo = smoothRandomLfo(0.88, 1.12, 4.0, 11.0);

  const chestNoise = brownNoise();
  lp1(chestNoise, 160); lp1(chestNoise, 120);

  let c = Math.floor(SR * 0.4);
  while (c < N) {
    const amp1 = rand(0.58, 0.82);

    // S1 (lub): louder, lower, longer — mitral valve snap
    const s1Len = Math.floor(SR * rand(0.072, 0.100));
    const s1F = rand(55, 75) * (0.8 + chestParam * 0.4);
    for (let i = 0; i < s1Len && c + i < N; i++) {
      const p = i / s1Len;
      const env = p < 0.08 ? (p / 0.08) ** 0.6 : Math.exp(-5.2 * (p - 0.08));
      const tonal = Math.sin(2 * Math.PI * s1F * (i / SR)) * 0.40
                  + Math.sin(2 * Math.PI * s1F * 1.72 * (i / SR)) * 0.20;
      const thump = (Math.random() * 2 - 1) * 0.40;
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
    const s2F = rand(70, 92) * (0.8 + chestParam * 0.4);
    const amp2 = amp1 * rand(0.48, 0.68);
    for (let i = 0; i < s2Len && c + s2Off + i < N; i++) {
      const p = i / s2Len;
      const env = p < 0.08 ? (p / 0.08) ** 0.6 : Math.exp(-6.5 * (p - 0.08));
      const tonal = Math.sin(2 * Math.PI * s2F * (i / SR)) * 0.42
                  + Math.sin(2 * Math.PI * s2F * 1.68 * (i / SR)) * 0.18;
      const thump = (Math.random() * 2 - 1) * 0.40;
      beat[c + s2Off + i] += (tonal + thump) * env * amp2;
    }

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
  lp1(mix, 260 - muffle * 80);
  hp1(mix, 20);
  return gen(mix, 0.57);
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
