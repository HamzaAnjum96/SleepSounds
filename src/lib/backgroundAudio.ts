/**
 * Background-audio plumbing for iOS and Android.
 *
 * Web Audio (our worklet sounds) gets suspended in the background on iOS and
 * doesn't reliably show a lock-screen/notification player on its own. Two
 * standard measures fix that:
 *
 *  1. `navigator.audioSession.type = 'playback'` (iOS 16.4+) declares this as
 *     media playback, so audio continues when the tab is backgrounded or the
 *     screen locks, and the transport controls appear. (No-op elsewhere.)
 *
 *  2. A looping near-silent `<audio>` element kept playing while a mix is
 *     active. A real media element guarantees the Now Playing notification
 *     shows (even for worklet-only mixes) and helps the OS keep audio alive in
 *     the background. It must first start inside a user gesture, so call
 *     `primeBackgroundAudio()` from the play handlers.
 *
 *     Chrome on Android only surfaces the media notification for playback it
 *     considers *audible* and at least ~5 seconds long, so true digital
 *     silence in a 1s loop (the old approach) was ignored and worklet-only
 *     mixes lost their lock-screen player. The keep-alive is therefore 15
 *     seconds of noise at ≈-62 dBFS: imperceptible in practice, but enough
 *     signal energy for Chrome to count it as playing audio.
 */

let silent: HTMLAudioElement | null = null;

/** Build a 15-second mono WAV at the noise floor (≈-62 dBFS) as a blob URL. */
function silentWavUrl(): string {
  const sr = 8000;
  const n = sr * 15;
  const bytes = 44 + n * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, bytes - 8, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  // Smoothed noise floor: a one-pole low-pass keeps it a dull murmur with no
  // high-frequency hiss, peaking around ±30 of 32767 (≈-60 dBFS).
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = 0.92 * y + 0.08 * (Math.random() * 2 - 1);
    v.setInt16(44 + i * 2, Math.round(y * 72), true);
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function ensureSilent(): HTMLAudioElement {
  if (silent) return silent;
  const el = new Audio(silentWavUrl());
  el.loop = true;
  el.preload = 'auto';
  el.setAttribute('playsinline', '');
  silent = el;
  return el;
}

/** Declare media-playback so iOS keeps audio alive in the background. */
export function setAudioSessionPlayback() {
  try {
    const ns = navigator as Navigator & { audioSession?: { type: string } };
    if (ns.audioSession) ns.audioSession.type = 'playback';
  } catch { /* unsupported */ }
}

/** Play/pause the silent keep-alive element in sync with the mix. */
export function setKeepAlive(active: boolean) {
  const el = ensureSilent();
  if (active) void el.play().catch(() => { /* will retry on next gesture */ });
  else el.pause();
}

/** Call from a user gesture that starts playback: sets the audio session and
 *  starts the silent keep-alive (unlocking it on iOS within the gesture). */
export function primeBackgroundAudio() {
  setAudioSessionPlayback();
  setKeepAlive(true);
}
