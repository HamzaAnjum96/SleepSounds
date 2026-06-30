import { describe, it, expect } from 'vitest';
import { windDownFade } from '../src/hooks/useSleepTimer';

// The sleep-timer wind-down: full level until the final 90 seconds, then easing
// toward zero. The key regression this guards: a timer extended *out of* the fade
// window must return to full level (1), not stay stuck at its faded-down value.
describe('windDownFade', () => {
  it('is full level with no timer', () => {
    expect(windDownFade(null)).toBe(1);
  });

  it('is full level well outside the fade window', () => {
    expect(windDownFade(3600)).toBe(1);
    expect(windDownFade(91)).toBe(1);
  });

  it('restores full level when a timer is extended back out of the fade', () => {
    // 30s left (mid-fade, well under 1) → tap "+30m" → 1830s left.
    expect(windDownFade(30)).toBeLessThan(0.5);
    expect(windDownFade(30 + 1800)).toBe(1); // the bug: previously stayed faded
  });

  it('eases down across the final window', () => {
    expect(windDownFade(90)).toBeCloseTo(1, 5); // edge of the window = full
    expect(windDownFade(45)).toBeCloseTo(Math.pow(0.5, 1.4), 5);
    expect(windDownFade(0)).toBe(0);
  });

  it('never returns a negative gain', () => {
    expect(windDownFade(-5)).toBe(0);
  });
});
