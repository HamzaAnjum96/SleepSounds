import { describe, it, expect, beforeAll } from 'vitest';

// Drives the audio-focus / interruption guard in src/audio/graph.ts. iOS flips
// the AudioContext to a non-standard 'interrupted' state when another app takes
// audio focus, then auto-resumes it when that app finishes — which a sleep mixer
// must not do. We mock AudioContext so we can replay that cycle (Chromium e2e
// can't reach the 'interrupted' state) and assert: interrupt → pause, and an OS
// auto-resume while paused → suspended straight back down.

class MockAudioContext extends EventTarget {
  state = 'running';
  suspendCalls = 0;
  resumeCalls = 0;
  async suspend() { this.suspendCalls++; this.setState('suspended'); }
  async resume() { this.resumeCalls++; this.setState('running'); }
  setState(s: string) { this.state = s; this.dispatchEvent(new Event('statechange')); }
}

let ctx: MockAudioContext;
let graph: typeof import('../src/audio/graph');

beforeAll(async () => {
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  graph = await import('../src/audio/graph');
  ctx = graph.getAudioContext() as unknown as MockAudioContext;
});

describe('audio interruption guard', () => {
  it('pauses the mix when another app interrupts, and does not auto-resume', () => {
    let interruptions = 0;
    graph.setAudioInterruptionHandler(() => { interruptions++; });

    // Playing: intent is running.
    graph.setAudioIntent(true);

    // Another app takes audio focus → iOS marks the context interrupted.
    ctx.setState('interrupted');
    expect(interruptions, 'interruption paused the mix').toBe(1);

    // The other app finishes and iOS auto-resumes the context. We are still
    // paused (intent was cleared by the interruption), so the guard re-suspends.
    const before = ctx.suspendCalls;
    ctx.setState('running');
    expect(ctx.suspendCalls, 'OS auto-resume was pushed back down').toBe(before + 1);
  });

  it('a real user resume (intent running) is left alone', () => {
    // The user taps play: resumeAudio sets intent and resumes the context.
    const before = ctx.suspendCalls;
    void graph.resumeAudio();
    // resume() dispatched statechange → running with intent running, so the guard
    // must NOT suspend it.
    expect(ctx.suspendCalls, 'user resume not fought').toBe(before);
    expect(ctx.state).toBe('running');
  });

  it('does not fire an interruption when already paused', () => {
    let interruptions = 0;
    graph.setAudioInterruptionHandler(() => { interruptions++; });
    graph.setAudioIntent(false); // paused

    ctx.setState('interrupted');
    expect(interruptions, 'no redundant pause while already paused').toBe(0);

    // And the following auto-resume is still suspended (stay paused).
    const before = ctx.suspendCalls;
    ctx.setState('running');
    expect(ctx.suspendCalls).toBe(before + 1);
  });
});
