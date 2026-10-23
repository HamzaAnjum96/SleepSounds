import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Drift mode holds a screen wake lock so the bedside display stays softly lit.
// Browsers release every screen wake lock whenever the page is hidden (screen
// off, app switch), and it is up to the page to ask again when it returns. The
// bridge used to keep the released sentinel and treat it as still held, so the
// lock was never re-acquired after the first trip to the background. These
// tests replay that cycle through a mocked Wake Lock API.

class MockSentinel extends EventTarget {
  released = false;
  async release() {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

class MockDocument extends EventTarget {
  hidden = false;
  /** What the browser does on hiding: drop the locks, then announce it. */
  hide(locks: MockSentinel[]) {
    this.hidden = true;
    for (const lock of locks) void lock.release();
    this.dispatchEvent(new Event('visibilitychange'));
  }
  show() {
    this.hidden = false;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const granted: MockSentinel[] = [];
const doc = new MockDocument();
let bridge: typeof import('../src/platform/webBridge')['webBridge'];

/** Let the bridge's async acquire settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));
const held = () => granted.filter((s) => !s.released);

beforeAll(async () => {
  vi.stubGlobal('document', doc);
  vi.stubGlobal('navigator', {
    wakeLock: {
      request: async () => {
        const s = new MockSentinel();
        granted.push(s);
        return s;
      },
    },
  });
  ({ webBridge: bridge } = await import('../src/platform/webBridge'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('screen wake lock', () => {
  it('is re-acquired when the page returns from the background', async () => {
    await bridge.requestWakeLock();
    expect(held()).toHaveLength(1);

    doc.hide(held());
    await settle();
    expect(held(), 'the browser dropped the lock while hidden').toHaveLength(0);

    doc.show();
    await settle();
    expect(held(), 'a fresh lock is held again on return').toHaveLength(1);

    // ...and on every later return, not just the first.
    doc.hide(held());
    doc.show();
    await settle();
    expect(held()).toHaveLength(1);
  });

  it('is released on exit and not re-acquired afterwards', async () => {
    await bridge.releaseWakeLock();
    expect(held()).toHaveLength(0);

    doc.hide(held());
    doc.show();
    await settle();
    expect(held(), 'leaving drift mode lets the screen sleep again').toHaveLength(0);
  });
});
