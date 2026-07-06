// starlight — DSP helpers for the procedural WAV sound generators.
// Noise sources, one-pole/biquad filters, loop-conditioning, and WAV encoding.
// These are the shared building blocks the per-sound generators compose.

// ── WAV generation helpers ─────────────────────────────────────────────────

const SR = 32000;
const SECS = 32;
const N = SR * SECS;
const EDGE_FADE_S = 0.02;
const LOOP_BLEND_S = 1.2;

// Seeded PRNG (mulberry32) so each generator render is deterministic: seed once
// before a render and it reproduces exactly (consistent across reloads, and
// snapshot-testable). All randomness in the generators routes through random().
let rngState = 0x9e3779b9;
function seedRandom(seed: number): void {
  rngState = (seed >>> 0) || 0x9e3779b9;
}
function random(): number {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
/** Stable string → uint32 seed (FNV-1a), so a sound id (+params) maps to a
 *  fixed seed. */
function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
    const dither = (random() - 0.5) + (random() - 0.5);
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

// ── Stereo rendering ────────────────────────────────────────────────────────
// Broad ambient layers read as far more real when they carry width and movement
// across the image rather than collapsing to the centre. These helpers let a
// generator build a decorrelated stereo bed plus panned events and encode a
// 2-channel WAV, while keeping the same loop-conditioning and seeded determinism.

export interface StereoBuf { left: Float32Array; right: Float32Array; }

function makeWavStereo(left16: Int16Array, right16: Int16Array, sr: number): string {
  const frames = Math.min(left16.length, right16.length);
  const dataLen = frames * 4; // 2 channels * 16-bit
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true); s(8, 'WAVE');
  s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true);
  v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < frames; i++, o += 4) {
    v.setInt16(o, left16[i], true);
    v.setInt16(o + 2, right16[i], true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

/** Loop-condition each channel, then encode a stereo WAV at a shared peak scale
 *  (so the L/R balance the generator built is preserved). */
function genStereo(left: Float32Array, right: Float32Array, gain = 0.7): string {
  normalizeForLoop(left);
  normalizeForLoop(right);
  let peak = 0;
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  const scale = peak > 0 ? (gain * 32767) / peak : 32767;
  const left16 = new Int16Array(left.length);
  const right16 = new Int16Array(right.length);
  for (let i = 0; i < left.length; i++) {
    const d = (random() - 0.5) + (random() - 0.5);
    left16[i] = Math.max(-32768, Math.min(32767, Math.round(left[i] * scale + d)));
    right16[i] = Math.max(-32768, Math.min(32767, Math.round(right[i] * scale + d)));
  }
  return makeWavStereo(left16, right16, SR);
}

/** Widen a mono buffer into a decorrelated stereo pair WITHOUT colouring it.
 *
 *  The low/mid band is kept *shared* between the channels (a common mono centre),
 *  and only the high band is spread by shifting it in opposite directions (left
 *  back, right forward). This matters: a full-band opposite shift drives the
 *  interaural correlation to ~0 on steady noise, which the ear hears as *two
 *  separate uncorrelated sources* on either side rather than one wide source.
 *  Real diffuse fields stay correlated at low frequencies (long wavelengths) and
 *  decorrelate only up high, and that low-frequency correlation is exactly the
 *  cue the binaural system uses to fuse a single image. So: bass-mono / treble-
 *  wide — spacious but coherent.
 *
 *  Each channel is (shared lows) + (its own flat-shifted highs). Lows and highs
 *  are complementary bands, so there's no within-channel comb (the "dry + delayed
 *  copy" flange that sounds like a jet engine). The image stays centred
 *  (symmetric shift) and wrap-around keeps the loop seam intact. Use this only on
 *  broadband/noisy beds; tonal sounds should be panned instead. */
function decorrelateMono(buf: Float32Array, delayMs = 14, splitHz = 800): StereoBuf {
  const len = buf.length;
  // Shared low/mid band (the fused centre).
  const low = new Float32Array(buf);
  lp1(low, splitHz);
  // Complementary high band, spread across the channels.
  const high = new Float32Array(len);
  for (let i = 0; i < len; i++) high[i] = buf[i] - low[i];
  const d = Math.max(1, Math.floor((delayMs / 1000) * SR));
  const left = new Float32Array(len);
  const right = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    left[i] = low[i] + high[(i - d + len) % len];
    right[i] = low[i] + high[(i + d) % len];
  }
  return { left, right };
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
  const first = min + random() * (max - min);
  let idx = 0;
  let prev = first;
  while (idx < N) {
    const hold = Math.floor((minHoldS + random() * (maxHoldS - minHoldS)) * SR);
    const seg = Math.max(1, Math.min(hold, N - idx));
    // Loop-closed: the final segment eases back to the starting value, so the
    // modulation is continuous across the loop seam instead of drifting to a
    // random level and snapping back when the buffer repeats.
    const next = idx + seg >= N ? first : min + random() * (max - min);
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
  return min + random() * (max - min);
}

/** Snap a frequency to a whole number of cycles per loop, so sinusoidal
 *  components stay phase-continuous across the loop seam. */
function lockFreq(f: number): number {
  return Math.max(1, Math.round(f * SECS)) / SECS;
}

function chance(p: number): boolean {
  return random() < p;
}

function whiteNoise(): Float32Array {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = random() * 2 - 1;
  return buf;
}

function brownNoise(): Float32Array {
  const buf = new Float32Array(N);
  let last = 0;
  for (let i = 0; i < N; i++) {
    last = (last + 0.02 * (random() * 2 - 1)) / 1.02;
    buf[i] = last;
  }
  return buf;
}

function pinkNoise(): Float32Array {
  const buf = new Float32Array(N);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < N; i++) {
    const w = random() * 2 - 1;
    b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
    b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
    b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
    buf[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
    b6=w*0.115926;
  }
  return buf;
}

export {
  SR, N, gen, genStereo, decorrelateMono,
  lp1, hp1, bp2, smoothRandomLfo, rand, lockFreq, chance, whiteNoise, brownNoise, pinkNoise,
  random, seedRandom, hashSeed,
};
