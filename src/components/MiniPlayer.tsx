/**
 * The persistent player bar. Appears at the bottom of the shell whenever a
 * mix is active: play/pause with the sleep-timer ring, what's playing, the
 * countdown at a glance, and the way into the now-playing sheet.
 */

import { forwardRef, memo } from 'react';

// The timer ring is drawn just outside the 44px play disc: a 52px box (the
// button plus the 4px inset in .mp-ring), stroked at r=24 so it clears the
// disc's edge without touching it.
const RING_BOX = 52;
const RING_R = 24;
const RING_C = 2 * Math.PI * RING_R;

interface MiniPlayerProps {
  title: string;
  subtitle: string;
  isPlaying: boolean;
  /** Remaining fraction of the sleep timer, or null when no timer is set. */
  timerFrac: number | null;
  onTogglePlay: () => void;
  onOpen: () => void;
  /** Save the current mix — the discoverable entry point, so saving doesn't
   *  hide one layer deep in the sheet. */
  onSave: () => void;
}

const MiniPlayer = forwardRef<HTMLDivElement, MiniPlayerProps>(function MiniPlayer({
  title,
  subtitle,
  isPlaying,
  timerFrac,
  onTogglePlay,
  onOpen,
  onSave,
}, ref) {
  return (
    <div className="mini-player" ref={ref}>
      <div className="mp-play-wrap">
        <button
          type="button"
          className={`mp-play${isPlaying ? ' playing' : ''}`}
          onClick={onTogglePlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          <span className="material-symbols-rounded">
            {isPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>
        {timerFrac !== null && (
          <svg className="mp-ring" viewBox={`0 0 ${RING_BOX} ${RING_BOX}`} aria-hidden="true">
            <circle
              cx={RING_BOX / 2} cy={RING_BOX / 2} r={RING_R}
              fill="none"
              stroke="var(--warm)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - timerFrac)}
            />
          </svg>
        )}
      </div>

      <button
        type="button"
        className="mp-body"
        onClick={onOpen}
        aria-label="Open now playing"
      >
        <span className="mp-title">{title}</span>
        <span className="mp-subtitle">{subtitle}</span>
      </button>

      <button
        type="button"
        className="mp-save"
        onClick={onSave}
        aria-label="Save this mix"
      >
        <span className="material-symbols-rounded">bookmark_add</span>
      </button>

      {/* A second, larger tap area for the same action as .mp-body, and the
          visual cue that the bar opens upward. It carried its own "Open now
          playing" label, so a screen reader announced the one action twice;
          it is out of the tab order already, so hide it from the a11y tree
          entirely and let .mp-body be the single announced control. */}
      <button
        type="button"
        className="mp-expand"
        onClick={onOpen}
        tabIndex={-1}
        aria-hidden="true"
      >
        <span className="material-symbols-rounded">keyboard_arrow_up</span>
      </button>
    </div>
  );
});

// [v0.0.35 perf] memo so the player bar skips re-render when App re-renders for
// something it doesn't show — a volume drag, a library toggle. All props are
// primitives or (from App) constant-identity handlers, so the shallow compare is
// exactly right; a timer tick still updates it (subtitle / ring change).
export default memo(MiniPlayer);
