// Web Worker entry for procedural WAV rendering. A sound's first play (and
// every variant/slider retune) renders 32 s of audio — a synchronous 100 ms–3 s
// DSP block depending on the device. On the main thread that froze the UI
// mid-tap (even the card's loading spinner couldn't animate), so the render
// runs here instead. Blob URLs minted inside a dedicated worker belong to the
// same origin's blob store, so the main thread's <audio> elements can play
// them directly — only the URL string crosses the boundary.
import { regenerateSound } from './generators';

interface RenderRequest {
  seq: number;
  soundId: string;
  params: Record<string, number>;
}

self.onmessage = (e: MessageEvent<RenderRequest>) => {
  const { seq, soundId, params } = e.data;
  try {
    const url = regenerateSound(soundId, params);
    self.postMessage({ seq, url });
  } catch (err) {
    self.postMessage({ seq, error: String(err) });
  }
};
