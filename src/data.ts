import type { Sound } from './types';

// Generate white or brown noise as a looping WAV blob URL
function noiseUrl(type: 'white' | 'brown'): string {
  const sampleRate = 22050;
  const seconds = 15;
  const numSamples = sampleRate * seconds;
  const pcm = new Int16Array(numSamples);

  if (type === 'white') {
    for (let i = 0; i < numSamples; i++) {
      pcm[i] = ((Math.random() * 2 - 1) * 0.5) * 32767;
    }
  } else {
    // Pink-ish brown noise (Paul Kellett's method)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < numSamples; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      const out = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
      pcm[i] = Math.min(1, Math.max(-1, out)) * 16383;
    }
  }

  const dataSize = pcm.byteLength;
  const wav = new ArrayBuffer(44 + dataSize);
  const v = new DataView(wav);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  const u32 = (o: number, n: number) => v.setUint32(o, n, true);
  const u16 = (o: number, n: number) => v.setUint16(o, n, true);

  str(0, 'RIFF'); u32(4, 36 + dataSize); str(8, 'WAVE');
  str(12, 'fmt '); u32(16, 16); u16(20, 1); u16(22, 1);
  u32(24, sampleRate); u32(28, sampleRate * 2); u16(32, 2); u16(34, 16);
  str(36, 'data'); u32(40, dataSize);
  new Int16Array(wav, 44).set(pcm);

  return URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
}

export const SOUND_LIBRARY: Sound[] = [
  {
    id: 'rain',
    name: 'Rain',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/2393/2393-preview.mp3',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/1196/1196-preview.mp3',
  },
  {
    id: 'wind',
    name: 'Wind',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/1166/1166-preview.mp3',
  },
  {
    id: 'forest',
    name: 'Forest',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/2480/2480-preview.mp3',
  },
  {
    id: 'fireplace',
    name: 'Fireplace',
    category: 'Cozy',
    url: 'https://assets.mixkit.co/active_storage/sfx/2535/2535-preview.mp3',
  },
  {
    id: 'white-noise',
    name: 'White Noise',
    category: 'Noise',
    url: noiseUrl('white'),
  },
  {
    id: 'brown-noise',
    name: 'Brown Noise',
    category: 'Noise',
    url: noiseUrl('brown'),
  },
  {
    id: 'night',
    name: 'Night',
    category: 'Nature',
    url: 'https://assets.mixkit.co/active_storage/sfx/2348/2348-preview.mp3',
  },
];

export const PRESET_STORAGE_KEY = 'sleep-mixer-presets-v1';
