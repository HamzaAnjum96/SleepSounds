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

export default function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) !== null; }
    catch { return false; }
  });
  const [installable, setInstallable] = useState(() => Boolean((window as Win).__driftInstall));
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) { setInstallable(false); setIos(false); return; }

    const onInstallable = () => setInstallable(true);
    const onInstalled = () => {
      setInstallable(false);
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
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
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  }, []);

  if (dismissed || (!installable && !ios)) return null;

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
