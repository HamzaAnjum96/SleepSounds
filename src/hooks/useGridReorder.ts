import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';

// [0.1.0] Grid drag-reorder: hold a card to lift it, drag to a new slot, let
// go to drop. Pointer-events based (one code path for touch, mouse and pen),
// with the interaction details that make it feel native rather than a demo:
//
// - Long-press (350 ms) lifts; moving >10 px first cancels the lift, so
//   scrolling and tapping behave exactly as before.
// - While lifted, native touch scrolling is suppressed (passive:false
//   touchmove) and the accidental click that would toggle the sound on
//   release is swallowed (one-shot capture-phase click listener).
// - Neighbours glide out of the way (slot-shift transforms over the rects
//   cached at lift, so no layout thrash), the lifted card follows the
//   pointer, and dragging near the top/bottom of the scroll container
//   auto-scrolls it.
// - Escape (or pointercancel) cancels and everything glides home; on drop the
//   card glides into its slot, then the real order commits and the inline
//   transforms are cleared with transitions suppressed for one frame, so the
//   handoff from "transformed old DOM" to "clean new DOM" is invisible.
// - Screen-reader users hear pick-up / position / drop announcements; the
//   keyboard path lives on each card's grip button (see SoundCard).
//
// The hook owns only DOM concerns. The order itself lives with the caller,
// which gets one onCommit(dragId, anchorId, side) when a drag lands.

interface GridReorderArgs {
  /** The grid whose direct [data-sound-id] descendants are reorderable. */
  gridRef: RefObject<HTMLElement | null>;
  /** The scrolling ancestor, for auto-scroll while dragging. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Commit a finished drag: place dragId before/after anchorId. */
  onCommit: (dragId: string, anchorId: string, side: 'before' | 'after') => void;
  /** Called when a card lifts (close popovers, haptic — caller's choice). */
  onLift?: (id: string) => void;
  /** Live-region announcer. */
  announce: (msg: string) => void;
  /** Display name for announcements. */
  getLabel: (id: string) => string;
  /** Disabled entirely (e.g. while a modal is open). */
  enabled?: boolean;
}

interface DragState {
  id: string;
  el: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  startScroll: number;
  /** Visible card ids in DOM order at lift, and their content-space rects. */
  ids: string[];
  rects: { x: number; y: number; w: number; h: number }[];
  /** Grid geometry at lift: row centre-lines and column centres (content
   *  space), so the drop cell is picked row-band-first, then column. */
  rowYs: number[];
  colXs: number[];
  fromIndex: number;
  /** Current insertion slot in the without-dragged list (0..n-1). */
  slot: number;
  lifted: boolean;
  raf: number;
  lastClientX: number;
  lastClientY: number;
  /** Fractional auto-scroll accumulator (lets the ramp start truly gentle). */
  scrollAcc: number;
}

const LIFT_MS = 350;
const PRE_LIFT_SLOP = 10;
const SETTLE_MS = 190;

export function useGridReorder({
  gridRef, scrollRef, onCommit, onLift, announce, getLabel, enabled = true,
}: GridReorderArgs): void {
  const drag = useRef<DragState | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const press = useRef<{ x: number; y: number; el: HTMLElement; id: string; pointerId: number } | null>(null);

  const clearTransforms = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.querySelectorAll<HTMLElement>('[data-sound-id]').forEach((el) => {
      el.style.transform = '';
      el.classList.remove('drag-lift');
    });
    grid.classList.remove('dragging');
    grid.classList.remove('drag-drop');
  }, [gridRef]);

  /** The display cell the lifted CARD (not the finger) is over. [0.1.2] The
   *  card's visual centre claims a cell, Voronoi-style: rows first (bands
   *  split midway between row centre-lines), then the column whose centre is
   *  nearest — so the boundaries sit in the gaps between cards, exactly where
   *  the eye expects. The previous row-major score (y·K + x) ignored x the
   *  moment the probe crossed a row's centre-line — hovering the bottom half
   *  of ANY card targeted past its whole row — and probing with the raw
   *  pointer instead of the card added the grab-point offset on top. Both
   *  biased drops right and down ("favours the right, worse on a lower
   *  line"). Claiming the covered cell means: where the box sits is where it
   *  lands. */
  const slotAt = useCallback((d: DragState, contentX: number, contentY: number): number => {
    const band = (v: number, centers: number[]): number => {
      for (let i = 0; i < centers.length - 1; i++) {
        if (v < (centers[i] + centers[i + 1]) / 2) return i;
      }
      return centers.length - 1;
    };
    const row = band(contentY, d.rowYs);
    const col = band(contentX, d.colXs);
    return Math.min(d.rects.length - 1, row * d.colXs.length + col);
  }, []);

  /** Shift every non-dragged card toward its slot in the current arrangement. */
  const applyShifts = useCallback((d: DragState) => {
    const grid = gridRef.current;
    if (!grid) return;
    const els = grid.querySelectorAll<HTMLElement>('[data-sound-id]');
    els.forEach((el) => {
      const id = el.dataset.soundId!;
      const i = d.ids.indexOf(id);
      if (i < 0 || id === d.id) return;
      // Index in the without-dragged list…
      const j = i < d.fromIndex ? i : i - 1;
      // …becomes this display index once the dragged card occupies `slot`.
      const display = j >= d.slot ? j + 1 : j;
      const from = d.rects[i];
      const to = d.rects[display];
      el.style.transform = to === from ? '' : `translate(${to.x - from.x}px, ${to.y - from.y}px)`;
    });
  }, [gridRef]);

  const positionLifted = useCallback((d: DragState) => {
    const scroll = scrollRef.current;
    const scrollDelta = (scroll ? scroll.scrollTop : 0) - d.startScroll;
    const dx = d.lastClientX - d.startX;
    const dy = d.lastClientY - d.startY + scrollDelta;
    d.el.style.transform = `translate(${dx}px, ${dy}px) scale(1.045)`;
  }, [scrollRef]);

  const finish = useCallback((commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cancelAnimationFrame(d.raf);
    const grid = gridRef.current;

    const land = () => {
      // [0.1.4] The handoff from "old DOM + transforms" to "new DOM, no
      // transforms" must be ATOMIC. It used to schedule the React commit
      // asynchronously and clear the transforms immediately — on a slower
      // device a paint slipped in between, so every card (dropped and
      // displaced alike) snapped back to the OLD layout for a frame or two
      // and then moved into place again after the drop. flushSync commits the
      // reorder synchronously, the transforms come off in the same JS turn
      // under drag-settle, and the browser paints exactly once: the visual
      // layout never changes across the swap.
      if (grid) grid.classList.add('drag-settle');
      if (commit && d.slot !== d.fromIndex) {
        const without = d.ids.filter((id) => id !== d.id);
        const anchor = d.slot < without.length ? without[d.slot] : without[without.length - 1];
        const side: 'before' | 'after' = d.slot < without.length ? 'before' : 'after';
        flushSync(() => onCommit(d.id, anchor, side));
        announce(`${getLabel(d.id)} moved to position ${d.slot + 1} of ${d.ids.length}`);
      } else {
        announce(commit ? `${getLabel(d.id)} kept its place` : 'reorder cancelled');
      }
      if (grid) {
        clearTransforms();
        requestAnimationFrame(() => grid.classList.remove('drag-settle'));
      }
    };

    if (commit && d.lifted) {
      // Glide the card into its slot, then land. Inserting at `slot` in the
      // without-dragged list puts the card at display index `slot` overall,
      // and display rects are the original slot geometry.
      // [0.1.3] The displaced cards do NOT glide here: once the finger lifts,
      // they snap to their final cells (drag-drop suppresses their transition
      // while keeping the dropped card's landing glide) — a shift still
      // mid-glide at release used to finish as a visible side-wipe after the
      // move.
      const to = d.rects[d.slot];
      const from = d.rects[d.fromIndex];
      grid?.classList.add('drag-drop');
      applyShifts(d); // ensure every displaced card is AT its final cell, instantly
      d.el.classList.remove('drag-lift');
      d.el.classList.add('drag-landing');
      d.el.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px)`;
      window.setTimeout(() => {
        d.el.classList.remove('drag-landing');
        land();
      }, SETTLE_MS);
    } else {
      // Cancel: everything glides home.
      d.el.classList.remove('drag-lift');
      d.el.classList.add('drag-landing');
      d.el.style.transform = '';
      const els = gridRef.current?.querySelectorAll<HTMLElement>('[data-sound-id]');
      els?.forEach((el) => { if (el !== d.el) el.style.transform = ''; });
      window.setTimeout(() => {
        d.el.classList.remove('drag-landing');
        if (grid) {
          grid.classList.add('drag-settle');
          clearTransforms();
          requestAnimationFrame(() => grid.classList.remove('drag-settle'));
        }
        announce('reorder cancelled');
      }, SETTLE_MS);
    }
  }, [gridRef, onCommit, announce, getLabel, clearTransforms]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || !enabled) return;

    const cancelPress = () => {
      window.clearTimeout(pressTimer.current);
      press.current = null;
    };

    const lift = () => {
      const p = press.current;
      const scroll = scrollRef.current;
      if (!p || !gridRef.current) return;
      press.current = null;
      // Let the caller settle the layout FIRST (App closes an open inline
      // editor with flushSync): everything below is measured geometry, and
      // measuring before a pending relayout left every rect stale by the
      // editor's height — cards then wiped to positions from the wrong layout.
      onLift?.(p.id);
      const els = [...gridRef.current.querySelectorAll<HTMLElement>('[data-sound-id]')];
      const scrollTop = scroll ? scroll.scrollTop : 0;
      const ids = els.map((el) => el.dataset.soundId!);
      const rects = els.map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top + scrollTop, w: r.width, h: r.height };
      });
      const fromIndex = ids.indexOf(p.id);
      if (fromIndex < 0) return;
      // Grid geometry: cluster the card centres into row centre-lines and
      // column centres (tolerance: half a card), for the cell-claim targeting.
      const cluster = (vals: number[], tol: number): number[] => {
        const sorted = [...vals].sort((a, b) => a - b);
        const out: number[] = [];
        let group: number[] = [];
        for (const v of sorted) {
          if (group.length && v - group[0] > tol) {
            out.push(group.reduce((s, x) => s + x, 0) / group.length);
            group = [];
          }
          group.push(v);
        }
        if (group.length) out.push(group.reduce((s, x) => s + x, 0) / group.length);
        return out;
      };
      const rowYs = cluster(rects.map((r) => r.y + r.h / 2), rects[0].h * 0.5);
      const colXs = cluster(rects.map((r) => r.x + r.w / 2), rects[0].w * 0.5);
      const d: DragState = {
        id: p.id, el: p.el, pointerId: p.pointerId,
        startX: p.x, startY: p.y, startScroll: scrollTop,
        ids, rects, rowYs, colXs, fromIndex, slot: fromIndex, lifted: true,
        raf: 0, lastClientX: p.x, lastClientY: p.y, scrollAcc: 0,
      };
      drag.current = d;
      try { p.el.setPointerCapture(p.pointerId); } catch { /* gone */ }
      p.el.classList.add('drag-lift');
      gridRef.current.classList.add('dragging');
      positionLifted(d);
      announce(`picked up ${getLabel(p.id)}, position ${fromIndex + 1} of ${ids.length}. drag to move, release to drop.`);
      // Auto-scroll loop while dragging near the container edges.
      const step = () => {
        const dd = drag.current;
        if (!dd) return;
        const sc = scrollRef.current;
        if (sc) {
          // [0.1.2] Ramped auto-scroll: speed rises QUADRATICALLY from zero at
          // the zone edge, so dropping on a card that happens to sit near the
          // bottom of a small screen barely drifts, while pushing to the very
          // edge still travels fast. The old linear ramp (68 px zone, ~12 px
          // per frame near the edge) scrolled the target away under a
          // stationary finger. Fractional speeds accumulate so "gentle" is
          // really gentle.
          const r = sc.getBoundingClientRect();
          const margin = 44;
          const maxV = 13; // px/frame at (or past) the very edge
          let v = 0;
          if (dd.lastClientY < r.top + margin) {
            const depth = Math.min(1, (r.top + margin - dd.lastClientY) / margin);
            v = -maxV * depth * depth;
          } else if (dd.lastClientY > r.bottom - margin) {
            const depth = Math.min(1, (dd.lastClientY - (r.bottom - margin)) / margin);
            v = maxV * depth * depth;
          }
          if (v !== 0) {
            dd.scrollAcc += v;
            const whole = Math.trunc(dd.scrollAcc);
            if (whole !== 0) {
              dd.scrollAcc -= whole;
              sc.scrollTop += whole;
              positionLifted(dd);
              retarget(dd);
            }
          }
        }
        dd.raf = requestAnimationFrame(step);
      };
      d.raf = requestAnimationFrame(step);
    };

    const retarget = (d: DragState) => {
      const scroll = scrollRef.current;
      const scrollTop = scroll ? scroll.scrollTop : 0;
      // Probe with the lifted card's VISUAL centre, not the finger — a card
      // grabbed by its corner still lands on the cell it visibly covers.
      const from = d.rects[d.fromIndex];
      const probeX = from.x + from.w / 2 + (d.lastClientX - d.startX);
      const probeY = from.y + from.h / 2 + (d.lastClientY + scrollTop - (d.startY + d.startScroll));
      const slot = slotAt(d, probeX, probeY);
      if (slot !== d.slot) {
        d.slot = slot;
        applyShifts(d);
        announce(`position ${slot + 1} of ${d.ids.length}`);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (drag.current || !e.isPrimary) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, .card-grip')) return; // sliders keep their gesture
      const el = target.closest<HTMLElement>('[data-sound-id]');
      if (!el || !grid.contains(el)) return;
      press.current = { x: e.clientX, y: e.clientY, el, id: el.dataset.soundId!, pointerId: e.pointerId };
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(lift, LIFT_MS);
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = press.current;
      if (p && !drag.current) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > PRE_LIFT_SLOP) cancelPress();
        return;
      }
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      d.lastClientX = e.clientX;
      d.lastClientY = e.clientY;
      positionLifted(d);
      retarget(d);
    };

    const onPointerUp = (e: PointerEvent) => {
      cancelPress();
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      suppressNextClick();
      finish(true);
    };

    const onPointerCancel = (e: PointerEvent) => {
      cancelPress();
      const d = drag.current;
      if (!d || e.pointerId !== d.pointerId) return;
      finish(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag.current) { suppressNextClick(); finish(false); }
    };

    // While lifted: no native touch scrolling, no long-press context menu.
    const onTouchMove = (e: TouchEvent) => { if (drag.current) e.preventDefault(); };
    const onContextMenu = (e: Event) => { if (drag.current || press.current) e.preventDefault(); };

    const suppressNextClick = () => {
      const swallow = (ce: Event) => { ce.stopPropagation(); ce.preventDefault(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      // If no click follows (touch cancel paths), drop the trap on the next tick.
      window.setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 350);
    };

    grid.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('contextmenu', onContextMenu);
    return () => {
      cancelPress();
      if (drag.current) finish(false);
      grid.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('touchmove', onTouchMove);
      grid.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gridRef, scrollRef, enabled, announce, getLabel, onLift, finish, slotAt, applyShifts, positionLifted]);
}
