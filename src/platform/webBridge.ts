import type { MediaMeta, PlatformBridge } from './PlatformBridge';
import { logger } from '../utils/logger';

const SUPPORT_URL = 'https://github.com/HamzaAnjum96/SleepSounds';

interface WakeLockSentinel extends EventTarget {
  readonly released: boolean;
  release: () => Promise<void>;
}
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
};

/** The browser implementation of the platform seam. */
class WebBridge implements PlatformBridge {
  readonly isNative = false;
  readonly platform = 'web' as const;

  private sentinel: WakeLockSentinel | null = null;
  private requesting = false;
  private wantLock = false;
  private onVisible: (() => void) | null = null;

  private async acquire(): Promise<void> {
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock || document.hidden || this.requesting) return;
    if (this.sentinel && !this.sentinel.released) return;
    this.requesting = true;
    try {
      const sentinel = await nav.wakeLock.request('screen');
      // The browser drops the lock whenever the page is hidden. Forget it then,
      // so the next return to the foreground asks for a fresh one instead of
      // mistaking the released sentinel for a lock still held.
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
      if (this.wantLock) this.sentinel = sentinel;
      else void sentinel.release().catch(() => {});
    } catch (err) {
      // Best-effort: low battery / unsupported just means no lock. Carry on.
      logger.debug('wake lock unavailable:', err);
    } finally {
      this.requesting = false;
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
