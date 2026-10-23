import { useEffect, type RefObject } from 'react';

const LEARNED_KEY = 'drift-scenes-explored';

/**
 * Teach a horizontal shelf's scroll: a gentle wink toward its end so it reads
 * as "there's more this way." It used to run on every load, which meant a
 * nightly user got the same lesson re-taught in the dark forever — unprompted
 * motion is the one thing this app should never spend on someone who has
 * already learned. It stops for good the first time they handle the shelf
 * themselves, which is the moment the lesson has landed.
 */
export function useShelfHint(rowRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let learned = false;
    try { learned = localStorage.getItem(LEARNED_KEY) !== null; }
    catch { /* private mode: just re-teach */ }

    // Any deliberate handling of the shelf counts, however brief. Listening for
    // gestures rather than the scroll event keeps the wink's own programmatic
    // scrolling from being mistaken for the user's.
    const remember = () => {
      try { localStorage.setItem(LEARNED_KEY, '1'); } catch { /* private mode */ }
    };
    const opts = { passive: true, once: true } as const;
    row.addEventListener('pointerdown', remember, opts);
    row.addEventListener('wheel', remember, opts);
    row.addEventListener('keydown', remember, opts);
    const dropListeners = () => {
      row.removeEventListener('pointerdown', remember);
      row.removeEventListener('wheel', remember);
      row.removeEventListener('keydown', remember);
    };

    if (learned) return dropListeners;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return dropListeners;
    if (row.scrollWidth <= row.clientWidth + 8) return dropListeners;
    // Suspend scroll-snap during the wink, or proximity-snap yanks the peek
    // straight back before it's seen; restore it after.
    row.style.scrollSnapType = 'none';
    // Peek toward the shelf's own end: scrollLeft runs negative under RTL, so a
    // hard +56 would shove the shelf the wrong way (into its already-visible
    // start edge) and teach nothing.
    const peek56 = getComputedStyle(row).direction === 'rtl' ? -56 : 56;
    const peek = window.setTimeout(() => row.scrollTo({ left: peek56, behavior: 'smooth' }), 900);
    const settle = window.setTimeout(() => row.scrollTo({ left: 0, behavior: 'smooth' }), 1650);
    const restore = window.setTimeout(() => { row.style.scrollSnapType = ''; }, 2250);
    return () => {
      dropListeners();
      window.clearTimeout(peek);
      window.clearTimeout(settle);
      window.clearTimeout(restore);
      row.style.scrollSnapType = '';
    };
  }, [rowRef]);
}
