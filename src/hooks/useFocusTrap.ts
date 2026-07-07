import { useEffect, type RefObject } from 'react';

// [v0.0.12 a11y] Keep keyboard focus inside an open modal dialog. Both the
// now-playing sheet and drift mode are `aria-modal="true"` and already move
// focus in on open / restore it on close, but neither stopped Tab from walking
// out into the shell behind them — a real trap for keyboard and screen-reader
// users. This hook adds only the containment; the focus-in/restore each modal
// already does is left untouched.

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * While `active`, contain Tab / Shift+Tab focus within `containerRef`. Wrapping
 * from the last focusable to the first (and back), and pulling focus in if it
 * has somehow landed outside. Inert while `active` is false, so a closed modal
 * costs nothing.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const el = containerRef.current;
      if (!el) return;
      // Only elements actually rendered (offsetParent is null for display:none)
      // are reachable, so a hidden control never becomes a dead tab stop.
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (focusable.length === 0) {
        // Nothing to land on: keep focus off the shell behind the modal.
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;
      if (!el.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, containerRef]);
}
