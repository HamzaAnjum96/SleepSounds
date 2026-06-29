import { describe, it, expect, beforeAll } from 'vitest';

// The keep-alive <audio> element is also the element Android/Chrome builds the
// media notification from and the one the OS pauses on audio-focus loss. So its
// pause/play is our cross-platform transport signal: an unsolicited pause (we
// still want it playing) means another app took focus or the user hit the
// notification's pause button → pause the mix; an unsolicited play means an OS
// auto-resume we must push back down. These tests replay both.

const instances: MockAudio[] = [];

class MockAudio extends EventTarget {
  loop = false;
  preload = '';
  paused = true;
  pauseCount = 0;
  playCount = 0;
  constructor(public src: string) { super(); instances.push(this); }
  setAttribute() { /* playsinline */ }
  play() { this.paused = false; this.playCount++; return Promise.resolve(); }
  pause() { this.paused = true; this.pauseCount++; }
}

let bg: typeof import('../src/lib/backgroundAudio');

beforeAll(async () => {
  const g = globalThis as unknown as { Audio: unknown; Blob: unknown };
  g.Audio = MockAudio;
  g.Blob = class { constructor(_p?: unknown) { /* noop */ } };
  // Patch the blob helpers onto the real URL (don't replace it — `new URL()` is
  // used by the module loader).
  (URL as unknown as { createObjectURL: unknown }).createObjectURL = () => 'blob:keepalive';
  (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};
  bg = await import('../src/lib/backgroundAudio');
});

describe('keep-alive transport', () => {
  it('an OS pause of the keep-alive pauses the mix', () => {
    let pauses = 0;
    bg.setKeepAliveInterruptionHandler(() => { pauses++; });

    bg.setKeepAlive(true); // we intend it playing
    const el = instances[instances.length - 1];
    expect(el.playCount).toBeGreaterThan(0);

    // Another app takes focus / notification pause → the OS pauses our element.
    el.dispatchEvent(new Event('pause'));
    expect(pauses, 'unsolicited pause paused the mix').toBe(1);
  });

  it('suppresses an OS auto-resume while we want it stopped', () => {
    const el = instances[instances.length - 1];
    bg.setKeepAlive(false); // we now intend it stopped
    const before = el.pauseCount;

    // The OS tries to auto-resume the keep-alive after the interruption ends.
    el.dispatchEvent(new Event('play'));
    expect(el.pauseCount, 'auto-resume pushed back down').toBe(before + 1);
  });

  it('does not treat our own pause as an interruption', () => {
    let pauses = 0;
    bg.setKeepAliveInterruptionHandler(() => { pauses++; });
    const el = instances[instances.length - 1];

    bg.setKeepAlive(false); // intend stopped, then the element fires pause
    el.dispatchEvent(new Event('pause'));
    expect(pauses, 'our own pause is not an interruption').toBe(0);
  });
});
