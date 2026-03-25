import type { Preset, Sound, SoundState } from './types';

// ── WAV generation helpers ─────────────────────────────────────────────────

const SR = 22050;
const SECS = 30;
const N = SR * SECS;

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
  let max = 0;
  for (let i = 0; i < f32.length; i++) max = Math.max(max, Math.abs(f32[i]));
  const scale = max > 0 ? (gain * 32767) / max : 32767;
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++)
    i16[i] = Math.max(-32767, Math.min(32767, f32[i] * scale));
  return makeWav(i16, SR);
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
  const buf = pinkNoise();
  lp1(buf, 1800);
  return gen(buf, 0.55);
}

function genStream(): string {
  const buf = whiteNoise();
  hp1(buf, 350);
  lp1(buf, 3500);
  for (let i = 0; i < N; i++)
    buf[i] *= 0.82 + 0.18 * Math.sin((2 * Math.PI * 0.28 * i) / SR);
  return gen(buf, 0.55);
}

function genThunder(): string {
  // Continuous deep rolling rumble — two filtered brown-noise layers blended
  const r1 = brownNoise();
  lp1(r1, 90); lp1(r1, 70); lp1(r1, 55); lp1(r1, 40);

  const r2 = brownNoise();
  lp1(r2, 130); lp1(r2, 100); lp1(r2, 80);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    // Slow undulating intensity — ominous ebb and flow over ~8–14 second cycles
    const env1 = 0.55 + 0.45 * Math.abs(Math.sin((2 * Math.PI * 0.072 * i) / SR));
    const env2 = 0.72 + 0.28 * Math.sin((2 * Math.PI * 0.041 * i) / SR + 1.8);
    mix[i] = (r1[i] * 0.58 + r2[i] * 0.42) * env1 * env2;
  }
  return gen(mix, 0.78);
}

function genSpace(): string {
  const buf = brownNoise();
  lp1(buf, 80); lp1(buf, 60); lp1(buf, 50);
  for (let i = 0; i < N; i++)
    buf[i] *= 0.7 + 0.3 * Math.sin((2 * Math.PI * 0.05 * i) / SR);
  return gen(buf, 0.6);
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

  // Random crackles and pops
  const crackles = new Float32Array(N);
  let pos = Math.floor(SR * 0.08);
  while (pos < N) {
    const len = Math.floor(SR * (0.015 + Math.random() * 0.07));
    const amp = 0.4 + Math.random() * 0.6;
    for (let i = 0; i < len && pos + i < N; i++) {
      crackles[pos + i] = (Math.random() * 2 - 1) * amp * Math.exp(-i / (SR * 0.012));
    }
    pos += Math.floor(SR * (0.04 + Math.random() * 0.25));
  }
  lp1(crackles, 4000);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = base[i] * 0.55 + crackles[i] * 0.45;
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
  // Crickets: rhythmic bursts of high-freq noise (~3.8 chirps/sec)
  const chirps = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const phase = ((i / SR) * 3.8) % 1;
    // Two-pulse chirp pattern (each pulse ~15% of cycle)
    const p1 = phase < 0.15 ? Math.sin((phase / 0.15) * Math.PI) : 0;
    const p2 = phase >= 0.22 && phase < 0.37 ? Math.sin(((phase - 0.22) / 0.15) * Math.PI) : 0;
    chirps[i] = (Math.random() * 2 - 1) * (p1 + p2 * 0.8);
  }
  hp1(chirps, 2600);
  lp1(chirps, 5500);

  // Soft background ambience
  const amb = pinkNoise();
  lp1(amb, 500);

  const mix = new Float32Array(N);
  for (let i = 0; i < N; i++) mix[i] = chirps[i] * 0.82 + amb[i] * 0.1;
  return gen(mix, 0.58);
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
  for (let i = 0; i < N; i++) {
    const g1 = 0.48 + 0.52 * Math.abs(Math.sin((2 * Math.PI * 0.038 * i) / SR));
    const g2 = 0.72 + 0.28 * Math.sin((2 * Math.PI * 0.11 * i) / SR + 1.3);
    const g3 = 0.88 + 0.12 * Math.sin((2 * Math.PI * 0.23 * i) / SR + 0.6);
    buf[i] *= g1 * g2 * g3;
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
  { id: 'night',       name: 'Night',       category: 'Nature', url: genNight() },
  { id: 'fireplace',   name: 'Fireplace',   category: 'Cozy',   url: genFireplace() },
  { id: 'white-noise', name: 'White Noise', category: 'Noise',  url: genWhite() },
  { id: 'brown-noise', name: 'Brown Noise', category: 'Noise',  url: genBrown() },
  { id: 'space',       name: 'Deep Space',  category: 'Noise',  url: genSpace() },
  { id: 'fan',         name: 'Fan',         category: 'Noise',  url: genFan() },
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
];
