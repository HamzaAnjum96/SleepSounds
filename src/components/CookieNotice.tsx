import { useState } from 'react';

/**
 * One-time storage notice. drift away sets no tracking or advertising cookies;
 * it only keeps your mixes and settings in localStorage, and serves everything
 * (fonts and icons included) from its own files. This is an honest transparency
 * note (not a consent gate, since there is nothing non-essential to opt out
 * of), shown once and remembered.
 */

const KEY = 'drift-cookie-ack';

export default function CookieNotice() {
  const [ack, setAck] = useState(() => {
    try { return localStorage.getItem(KEY) !== null; }
    catch { return true; } // storage unavailable: don't nag
  });

  if (ack) return null;

  const dismiss = () => {
    setAck(true);
    try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ }
  };

  return (
    <div className="cookie-notice" role="region" aria-label="Storage notice">
      <p className="cookie-text">
        drift away keeps your mixes and settings on this device (like cookies).
        Nothing leaves it. No tracking, no ads, no servers.
      </p>
      <div className="cookie-actions">
        <a
          className="cookie-link"
          href={`${import.meta.env.BASE_URL}privacy.html`}
          target="_blank"
          rel="noopener noreferrer"
        >privacy</a>
        <button type="button" className="cookie-ok" onClick={dismiss}>Got it</button>
      </div>
    </div>
  );
}
