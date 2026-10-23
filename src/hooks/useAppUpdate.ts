import { useEffect, useState } from 'react';
import { version } from '../../package.json';

/** Ask the controlling service worker which build it serves (null if there is
 *  no worker, or it doesn't answer within two seconds). */
function serviceWorkerVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl) { resolve(null); return; }
    const ch = new MessageChannel();
    const t = window.setTimeout(() => resolve(null), 2000);
    ch.port1.onmessage = (e) => { window.clearTimeout(t); resolve(e.data as string); };
    ctrl.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  });
}

/**
 * Silent auto-update. The active service worker reports its build version; if
 * it differs from the running app, this session is behind. The app is small
 * and fully cached, so it simply refreshes into the new version — but only at
 * a safe moment: foreground, online, and only while `idle` (no mix loaded), so
 * an update can never cut off a mix or reload behind a locked screen. At most
 * once per session (sessionStorage), so a stale offline shell can never loop.
 */
export function useAppUpdate(idle: boolean): void {
  const [updatePending, setUpdatePending] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    const check = async () => {
      const v = await serviceWorkerVersion();
      if (!cancelled && v && v !== version) setUpdatePending(true);
    };
    void check();
    const onChange = () => { void check(); };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => { cancelled = true; navigator.serviceWorker.removeEventListener('controllerchange', onChange); };
  }, []);

  useEffect(() => {
    if (!updatePending) return;
    const tryReload = () => {
      if (!idle) return;
      if (!navigator.onLine) return;
      if (document.visibilityState !== 'visible') return;
      try {
        if (sessionStorage.getItem('drift-reloaded')) return;
        sessionStorage.setItem('drift-reloaded', '1');
      } catch { return; } // can't remember having tried: don't risk a loop
      window.location.reload();
    };
    tryReload();
    document.addEventListener('visibilitychange', tryReload);
    return () => document.removeEventListener('visibilitychange', tryReload);
  }, [updatePending, idle]);
}
