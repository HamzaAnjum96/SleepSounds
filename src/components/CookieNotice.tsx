/**
 * One-time storage notice. starlight sets no tracking or advertising cookies;
 * it only keeps your mixes and settings in localStorage, and serves everything
 * (fonts and icons included) from its own files. This is an honest transparency
 * note (not a consent gate, since there is nothing non-essential to opt out
 * of). It is held back until after the first sound plays — first load stays
 * clear so the path to sound is uninterrupted — then shown once and remembered.
 * App owns the show/ack timing so it never stacks with the install prompt.
 */

interface CookieNoticeProps {
  show: boolean;
  onDismiss: () => void;
}

export default function CookieNotice({ show, onDismiss }: CookieNoticeProps) {
  if (!show) return null;

  return (
    <div className="cookie-notice" role="region" aria-label="Storage notice">
      <p className="cookie-text">
        starlight keeps your mixes and settings on this device (like cookies).
        Nothing leaves it. No tracking, no ads, no servers.
      </p>
      <div className="cookie-actions">
        <a
          className="cookie-link"
          href={`${import.meta.env.BASE_URL}privacy.html`}
          target="_blank"
          rel="noopener noreferrer"
        >privacy</a>
        <button type="button" className="cookie-ok" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  );
}
