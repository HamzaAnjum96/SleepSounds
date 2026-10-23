type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Run `cb` once the main thread is idle — or after `fallbackMs` where
 *  requestIdleCallback is missing (Safari). Returns a cancel function, so it
 *  drops straight into an effect's cleanup. */
export function whenIdle(cb: () => void, fallbackMs: number): () => void {
  const w = window as IdleWindow;
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb);
    return () => w.cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(cb, fallbackMs);
  return () => window.clearTimeout(t);
}
