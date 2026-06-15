import type { MediaMeta, PlatformBridge } from './PlatformBridge';
import { logger } from '../utils/logger';

const SUPPORT_URL = 'https://github.com/HamzaAnjum96/SleepSounds';

interface WakeLockSentinel { release: () => Promise<void>; }
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
};

/** The browser implementation of the platform seam. */
class WebBridge implements PlatformBridge {
  readonly isNative = false;
  readonly platform = 'web' as const;

  private sentinel: WakeLockSentinel | null = null;
  private wantLock = false;
  private onVisible: (() => void) | null = null;

  private async acquire(): Promise<void> {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock || this.sentinel || document.hidden) return;
    try {
      this.sentinel = await nav.wakeLock.request('screen');
      if (!this.wantLock) { void this.sentinel.release().catch(() => {}); this.sentinel = null; }
    } catch (err) {
      // Best-effort: low battery / unsupported just means no lock. Carry on.
      logger.debug('wake lock unavailable:', err);
    }
  }

  async requestWakeLock(): Promise<void> {
    this.wantLock = true;
    if (!this.onVisible) {
      this.onVisible = () => { if (this.wantLock && !document.hidden) void this.acquire(); };
      document.addEventListener('visibilitychange', this.onVisible);
    }
    await this.acquire();
  }

  async releaseWakeLock(): Promise<void> {
    this.wantLock = false;
    if (this.onVisible) { document.removeEventListener('visibilitychange', this.onVisible); this.onVisible = null; }
    const s = this.sentinel;
    this.sentinel = null;
    await s?.release().catch(() => {});
  }

  setMediaMetadata(meta: MediaMeta | null): void {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = meta ? new MediaMetadata(meta) : null;
    } catch (err) {
      logger.debug('media metadata failed:', err);
    }
  }

  openSupport(): void {
    window.open(SUPPORT_URL, '_blank', 'noopener,noreferrer');
  }
}

export const webBridge: PlatformBridge = new WebBridge();
