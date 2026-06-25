/**
 * The persistent player bar. Appears at the bottom of the shell whenever a
 * mix is active: play/pause with the sleep-timer ring, what's playing, the
 * countdown at a glance, and the way into the now-playing sheet.
 */

import { forwardRef } from 'react';

const RING_R = 21;
const RING_C = 2 * Math.PI * RING_R;

interface MiniPlayerProps {
  title: string;
  subtitle: string;
  isPlaying: boolean;
  /** Remaining fraction of the sleep timer, or null when no timer is set. */
  timerFrac: number | null;
  onTogglePlay: () => void;
  onOpen: () => void;
}

const MiniPlayer = forwardRef<HTMLDivElement, MiniPlayerProps>(function MiniPlayer({
  title,
  subtitle,
  isPlaying,
  timerFrac,
  onTogglePlay,
  onOpen,
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
          <svg className="mp-ring" viewBox="0 0 46 46" aria-hidden="true">
            <circle
              cx="23" cy="23" r={RING_R}
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
        className="mp-expand"
        onClick={onOpen}
        aria-label="Open now playing"
        tabIndex={-1}
      >
        <span className="material-symbols-rounded">keyboard_arrow_up</span>
      </button>
    </div>
  );
});

export default MiniPlayer;
