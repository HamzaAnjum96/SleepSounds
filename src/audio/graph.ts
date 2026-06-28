// The shared Web Audio graph. Every source — live worklets and the rendered WAV
// loops — feeds one AudioContext through a single master bus, so the whole mix
// is gain-staged together: a gentle compressor keeps stacked broadband layers
// from spitting at the ears when they coincide, a quiet high-shelf takes the
// edge off the top, and a fast brick limiter is a safety ceiling against
// clipping. The chain is tuned to be ~loudness-neutral on a single sound; it
// only does real work when several layers pile up.

/** Decibels → linear gain. */
export const dbToGain = (db: number): number => Math.pow(10, db / 20);

let ctx: AudioContext | null = null;

/** The one AudioContext for the whole engine (worklets + WAV loops). */
export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export interface MasterBus {
  /** Every layer connects here. */
  input: GainNode;
  compressor: DynamicsCompressorNode;
  shelf: BiquadFilterNode;
  limiter: DynamicsCompressorNode;
  /** Post-limiter tap for a headroom/clip meter (and test verification). */
  analyser: AnalyserNode;
}

let bus: MasterBus | null = null;

/** Lazily build (once) the master chain: input → compressor → high-shelf →
 *  limiter → destination. */
export function getMasterBus(): MasterBus {
  if (bus) return bus;
  const c = getAudioContext();

  const input = new GainNode(c, { gain: 1 });

  // Gentle glue: high threshold + low ratio so a single sound barely touches it,
  // but a busy stack is eased down instead of summing into harshness. Sleep
  // audio must never pump, hence the soft knee and unhurried release.
  const compressor = new DynamicsCompressorNode(c, {
    threshold: -20,
    knee: 14,
    ratio: 1.8,
    attack: 0.02,
    release: 0.3,
  });

  // Quiet tilt off the very top — sharpness drives listening fatigue more than
  // level does, so a small high-shelf cut calms layered brightness.
  const shelf = new BiquadFilterNode(c, {
    type: 'highshelf',
    frequency: 4500,
    gain: -1.5,
  });

  // Safety ceiling: high ratio, fast attack — catches transient peaks near 0
  // dBFS so the summed mix can't clip, without colouring the body.
  const limiter = new DynamicsCompressorNode(c, {
    threshold: -1.5,
    knee: 0,
    ratio: 20,
    attack: 0.003,
    release: 0.1,
  });

  const analyser = new AnalyserNode(c, { fftSize: 256, smoothingTimeConstant: 0.6 });

  input.connect(compressor);
  compressor.connect(shelf);
  shelf.connect(limiter);
  limiter.connect(analyser);
  analyser.connect(c.destination);

  bus = { input, compressor, shelf, limiter, analyser };
  // Diagnostic hook for the audio-health meter and tests (reads the analyser).
  (globalThis as unknown as { __driftMasterPeak?: () => number }).__driftMasterPeak = masterPeak;
  return bus;
}

export interface LayerBus {
  /** The source connects here. */
  input: GainNode;
  lp: BiquadFilterNode;
  shelf: BiquadFilterNode;
  /** Masking trim lives here, kept separate from the user's volume. */
  output: GainNode;
}

/** A per-layer processing bus: lowpass → high-shelf → trim → master. Starts
 *  transparent (full-range, 0 dB); the mixer darkens / shelves / trims it only
 *  when broadband layers crowd each other. */
export function createLayerBus(): LayerBus {
  const c = getAudioContext();
  const input = new GainNode(c, { gain: 1 });
  const lp = new BiquadFilterNode(c, { type: 'lowpass', frequency: 20000, Q: 0.707 });
  const shelf = new BiquadFilterNode(c, { type: 'highshelf', frequency: 5000, gain: 0 });
  const output = new GainNode(c, { gain: 1 });
  input.connect(lp);
  lp.connect(shelf);
  shelf.connect(output);
  output.connect(getMasterBus().input);
  return { input, lp, shelf, output };
}

/** Ease a layer bus toward a shaping target (no clicks). */
export function applyLayerShaping(
  c: AudioContext,
  bus: LayerBus,
  s: { gainDb: number; lpHz: number; shelfDb: number },
): void {
  const t = c.currentTime;
  bus.lp.frequency.setTargetAtTime(Math.max(500, Math.min(20000, s.lpHz)), t, 0.2);
  bus.shelf.gain.setTargetAtTime(s.shelfDb, t, 0.2);
  bus.output.gain.setTargetAtTime(dbToGain(s.gainDb), t, 0.2);
}

/** Resume the shared context (call from a user gesture / on play). */
export async function resumeAudio(): Promise<void> {
  try { await getAudioContext().resume(); } catch { /* not yet allowed */ }
}

/** Current peak sample magnitude (0..~1) at the master output — a cheap meter
 *  for the UI and for confirming audio is actually flowing. 0 if the bus hasn't
 *  been built yet. */
export function masterPeak(): number {
  if (!bus) return 0;
  const buf = new Float32Array(bus.analyser.fftSize);
  bus.analyser.getFloatTimeDomainData(buf);
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = Math.abs(buf[i]);
    if (x > peak) peak = x;
  }
  return peak;
}
