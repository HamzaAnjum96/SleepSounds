/** How a sound is produced. Worklet sounds run a live AudioWorklet generator
 *  with a WAV loop as fallback; wav sounds are a procedural WAV loop. Both keep
 *  generation lazy (the closures run on first play). The mixer plays either via
 *  one factory, so the UI never needs to know which is which. */
export type SoundSource =
  | { mode: 'worklet'; module: string; processor: string; params: Record<string, number>; fallback: () => string }
  | { mode: 'wav'; make: () => string };

export interface Sound {
  id: string;
  name: string;
  category: string;
  source: SoundSource;
}

export interface SoundState {
  enabled: boolean;
  volume: number;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: string;
  state: Record<string, SoundState>;
  masterVolume?: number;
}
