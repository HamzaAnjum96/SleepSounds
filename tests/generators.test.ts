import { describe, it, expect, beforeAll } from 'vitest';
import { SOUND_LIBRARY, regenerateSound } from '../src/data';

// The WAV generators call Blob + URL.createObjectURL; stub them for Node so we
// can read the bytes back and check each sound actually produces valid audio.
const store = new Map<string, Uint8Array>();

beforeAll(() => {
  let n = 0;
  class FakeBlob {
    bytes: Uint8Array;
    constructor(parts: unknown[]) {
      const p = parts[0] as ArrayBuffer | { buffer?: ArrayBuffer };
      const ab = p instanceof ArrayBuffer ? p : (p.buffer as ArrayBuffer);
      this.bytes = new Uint8Array(ab);
    }
  }
  (globalThis as unknown as { Blob: unknown }).Blob = FakeBlob;
  (globalThis as unknown as { URL: unknown }).URL = {
    createObjectURL: (b: FakeBlob) => { const k = `blob:${n++}`; store.set(k, b.bytes); return k; },
    revokeObjectURL: () => {},
  };
});

/** Decode the mono 16-bit PCM samples from a generated WAV blob url. */
function samples(url: string): Float32Array {
  const bytes = store.get(url)!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = (bytes.byteLength - 44) / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(44 + i * 2, true) / 32768;
  return out;
}

/** Order-sensitive checksum over the samples, to catch any non-determinism. */
function checksum(url: string): number {
  const s = samples(url);
  let acc = 0;
  for (let i = 0; i < s.length; i++) acc += s[i] * ((i % 101) + 1);
  return acc;
}

// Every library sound has a procedural WAV generator (the worklet sounds use
// theirs as the fallback loop), so all of them render through regenerateSound.
const wavSounds = SOUND_LIBRARY.filter((s) => regenerateSound(s.id, {}) !== null);

describe('WAV generators', () => {
  it('cover every sound in the library', () => {
    expect(wavSounds.length).toBe(SOUND_LIBRARY.length);
  });

  // Determinism is a property of the seeded PRNG, so a representative sample
  // (event-driven + noise-bed + worklet-fallback sounds) is enough.
  it.each(['rain', 'fire', 'ocean', 'night', 'white-noise'])(
    '%s renders identical audio for the same inputs',
    (id) => {
      expect(checksum(regenerateSound(id, {})!)).toBe(checksum(regenerateSound(id, {})!));
    },
  );

  for (const sound of wavSounds) {
    it(`${sound.id} produces valid, audible, non-clipping audio`, () => {
      const url = regenerateSound(sound.id, {})!;
      const s = samples(url);
      expect(s.length, 'has samples').toBeGreaterThan(1000);

      let peak = 0;
      let sumSq = 0;
      let nan = false;
      for (let i = 0; i < s.length; i++) {
        const v = s[i];
        if (Number.isNaN(v)) { nan = true; break; }
        const a = Math.abs(v);
        if (a > peak) peak = a;
        sumSq += v * v;
      }
      const rms = Math.sqrt(sumSq / s.length);

      expect(nan, 'no NaN samples').toBe(false);
      expect(peak, 'not silent').toBeGreaterThan(0.05);
      expect(peak, 'not hard-clipped').toBeLessThanOrEqual(1.0);
      expect(rms, 'has real energy').toBeGreaterThan(0.01);
    });
  }
});
