import { useEffect, useState } from 'react';

function greeting(): string {
  const h = new Date().getHours();
  if (h >= 4 && h < 12) return 'good morning';
  if (h >= 12 && h < 18) return 'good afternoon';
  if (h >= 18 && h < 23) return 'good evening';
  return 'up late, rest soon';
}

/**
 * The header's time-of-day greeting, kept honest over time. [v0.0.25 fix] It
 * used to be computed only when the app happened to re-render, so a phone left
 * playing overnight could still say "good evening" past midnight. It refreshes
 * on a one-minute cadence (setting the same string is a no-op, so this only
 * re-renders the few times a day it changes) and the moment the tab returns
 * to the foreground.
 */
export function useGreeting(): string {
  const [text, setText] = useState(greeting);
  useEffect(() => {
    const refresh = () => setText(greeting());
    const id = window.setInterval(refresh, 60000);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return text;
}

/** Whether the browser reports a network connection. The app is fully
 *  offline-capable, so this only drives a reassurance badge. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}
