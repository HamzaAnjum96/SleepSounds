import { useCallback, useEffect, useState } from 'react';

/**
 * Custom install affordance. Chrome only shows its native install banner once,
 * then suppresses it, so we capture the `beforeinstallprompt` event (stashed on
 * `window.__driftInstall` by the early listener in index.html) and offer our
 * own button whenever the app is installable. iOS Safari has no such event, so
 * there we show a short "Add to Home Screen" hint instead.
 *
 * Dismissal is remembered, and the row never appears once the app is already
 * running installed (standalone display mode).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Win = typeof window & { __driftInstall?: BeforeInstallPromptEvent | null };

const DISMISS_KEY = 'drift-install-dismissed';
/** A dismissal hides the row for this long, not forever — so the prompt comes
 *  back after an uninstall (or a change of heart). */
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (raw === null) return false;
    const at = Number(raw);
    // Legacy value ('1') or garbage: treat as expired so the row can return.
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_FOR_MS;
  } catch { return false; }
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIosSafari() {
  const ua = navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as Mac; disambiguate by touch support.
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const webkit = /WebKit/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return iOS && webkit;
}

interface InstallPromptProps {
  /** App holds the row back until after first playback and after the storage
   *  notice is acknowledged, so prompts never stack and first load stays clear. */
  ready: boolean;
}

export default function InstallPrompt({ ready }: InstallPromptProps) {
  const [dismissed, setDismissed] = useState(dismissedRecently);
  const [installable, setInstallable] = useState(() => Boolean((window as Win).__driftInstall));
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstallable(false); setIos(false); return; }

    const onInstallable = () => setInstallable(true);
    // Once installed, Chrome stops firing beforeinstallprompt, so the row
    // hides naturally — do NOT persist a flag here, or the prompt could never
    // return after an uninstall (localStorage outlives the app).
    const onInstalled = () => {
      setInstallable(false);
      try { localStorage.removeItem(DISMISS_KEY); } catch { /* private mode */ }
    };
    window.addEventListener('drift-installable', onInstallable);
    window.addEventListener('drift-installed', onInstalled);

    // Already captured before mount?
    if ((window as Win).__driftInstall) setInstallable(true);
    // iOS has no beforeinstallprompt; offer the manual hint instead.
    else if (isIosSafari()) setIos(true);

    return () => {
      window.removeEventListener('drift-installable', onInstallable);
      window.removeEventListener('drift-installed', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    const evt = (window as Win).__driftInstall;
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    // The event can only be used once; Chrome re-fires it on a later visit
    // if the user didn't install.
    (window as Win).__driftInstall = null;
    setInstallable(false);
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
  }, []);

  // Hide while recently dismissed, or when there's nothing to offer. A stale
  // legacy flag never suppresses: dismissedRecently() treats it as expired,
  // so the row returns after an uninstall once Chrome fires the event again.
  if (!ready || dismissed || (!installable && !ios)) return null;

  return (
    <div className="install-row" role="region" aria-label="Install drift">
      <span className="material-symbols-rounded install-icon" aria-hidden="true">install_mobile</span>
      {ios ? (
        <span className="install-text">
          add to your home screen: tap <span className="install-kbd material-symbols-rounded">ios_share</span> then “Add to Home Screen”
        </span>
      ) : (
        <span className="install-text">install drift for full-screen, offline nights</span>
      )}
      {installable && (
        <button type="button" className="install-action" onClick={handleInstall}>install</button>
      )}
      <button
        type="button"
        className="install-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss install prompt"
      >✕</button>
    </div>
  );
}
