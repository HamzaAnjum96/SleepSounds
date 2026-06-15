// One seam for everything platform-specific (screen wake lock, the OS media
// session, opening external links). Web implements it today; a native Android
// bridge can implement the same interface later without touching the React UI.

export interface MediaMeta {
  title: string;
  artist?: string;
  album?: string;
  artwork?: { src: string; sizes?: string; type?: string }[];
}

export interface PlatformBridge {
  readonly isNative: boolean;
  readonly platform: 'web' | 'android' | 'ios';

  /** Hold the screen awake; idempotent, and re-acquired automatically when the
   *  tab returns to the foreground (the OS drops the lock when hidden). */
  requestWakeLock(): Promise<void>;
  releaseWakeLock(): Promise<void>;

  /** Set (or clear, with null) what the OS lock-screen / notification shows. */
  setMediaMetadata(meta: MediaMeta | null): void;

  /** Open the supporter / external link in a new context. */
  openSupport(): void;
}
