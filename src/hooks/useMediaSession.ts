import { useEffect, useRef, useState } from 'react';
import { platform } from '../platform';
import { buildMediaArtwork } from '../lib/mediaArtwork';
import { whenIdle } from '../lib/idle';

interface MediaTransport {
  play: () => void;
  pause: () => void;
  stop: () => void;
}

/**
 * The Media Session API: the lock-screen / notification player on Android and
 * iOS. [v0.0.30 perf] Three narrow effects, so a volume drag — which re-renders
 * the app every tick — never rebuilds the metadata or re-registers the action
 * handlers: the title/artwork update only when they change, playbackState only
 * on play/pause, and the transport handlers register once and call the latest
 * functions through a ref.
 */
export function useMediaSession(title: string, isPlaying: boolean, transport: MediaTransport): void {
  // [v0.0.19 perf] The crescent-moon artwork is a one-off canvas draw plus a
  // synchronous PNG encode (~12 ms, more on a low-end phone) that isn't needed
  // until the first play — so build it on idle after first paint rather than
  // during the first render. Until it lands, the on-brand icon PNGs stand in.
  const [artwork, setArtwork] = useState<string | null>(null);
  useEffect(() => whenIdle(() => setArtwork(buildMediaArtwork(512)), 200), []);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const base = import.meta.env.BASE_URL;
    platform.setMediaMetadata({
      title,
      artist: 'starlight',
      album: 'sleep sounds',
      artwork: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        ...(artwork ? [{ src: artwork, sizes: '512x512', type: 'image/png' }] : []),
      ],
    });
  }, [title, artwork]);

  useEffect(() => {
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);

  const transportRef = useRef(transport);
  transportRef.current = transport;
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const t = transportRef;
    navigator.mediaSession.setActionHandler('play', () => t.current.play());
    navigator.mediaSession.setActionHandler('pause', () => t.current.pause());
    navigator.mediaSession.setActionHandler('stop', () => t.current.stop());
    // A sleep mix has no timeline: keep seek controls off the lock screen.
    try { navigator.mediaSession.setActionHandler('seekbackward', null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekforward',  null); } catch { /* ok */ }
    try { navigator.mediaSession.setActionHandler('seekto',       null); } catch { /* ok */ }
    try {
      (navigator.mediaSession as MediaSession & { setPositionState?: (s: object) => void })
        .setPositionState?.({ duration: Infinity, playbackRate: 1, position: 0 });
    } catch { /* ok */ }
  }, []);
}
