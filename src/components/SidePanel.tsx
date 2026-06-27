import type { Sound, SoundState } from '../types';
import MixControls from './MixControls';

/**
 * The desktop/tablet stand-in for the now-playing sheet: a persistent control
 * column beside the browse view, so larger screens shape the mix in place
 * instead of through a slide-up overlay. Same MixControls body as the sheet, so
 * the two surfaces never drift apart. When nothing is playing it shows a calm
 * idle line rather than an empty box.
 */

interface SidePanelProps {
  title: string;
  hasPlayer: boolean;
  isPlaying: boolean;
  quiet: boolean;
  onTogglePlay: () => void;
  activeSounds: Sound[];
  soundState: Record<string, SoundState>;
  onSoundVolume: (id: string, v: number) => void;
  onRemoveSound: (id: string) => void;
  masterVolume: number;
  onMasterVolume: (v: number) => void;
  secondsLeft: number | null;
  timerTotal: number | null;
  onTimerSelect: (secs: number) => void;
  onTimerExtend: (secs: number) => void;
  onTimerClear: () => void;
  onClearMix: () => void;
  onDrift: () => void;
  onSave: (name: string) => void;
}

export default function SidePanel({
  title,
  hasPlayer,
  isPlaying,
  quiet,
  onTogglePlay,
  ...controls
}: SidePanelProps) {
  return (
    <aside className={`side-panel${quiet ? ' side-panel-quiet' : ''}`} aria-label="Now playing">
      <div className="side-panel-head">
        <div className="side-panel-head-text">
          <span className="sheet-eyebrow">now playing</span>
          <span className="sheet-title">{hasPlayer ? title : 'nothing playing yet'}</span>
        </div>
        {hasPlayer && (
          <button
            type="button"
            className={`sheet-play${isPlaying ? ' playing' : ''}`}
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            <span className="material-symbols-rounded">{isPlaying ? 'pause' : 'play_arrow'}</span>
          </button>
        )}
      </div>

      <div className="side-panel-scroll">
        {hasPlayer ? (
          <MixControls {...controls} isPlaying={isPlaying} />
        ) : (
          <p className="side-panel-idle">choose a scene, or layer your own mix from the library</p>
        )}
      </div>
    </aside>
  );
}
