/**
 * A single calm snackbar, shown above the mini player. Used for forgiveness on
 * destructive actions (stopping a mix, deleting a saved one): a quiet line plus
 * an optional action like "undo". One at a time; the App owns the timing and
 * auto-dismiss.
 *
 * [v0.0.14 a11y] The change itself is already spoken by the app's dedicated
 * live region (e.g. "deleted mix …") or its playback-status region ("stopped"),
 * so the toast is NOT a live region — otherwise a screen reader announced every
 * action twice. It stays a plain container (not aria-hidden, which would hide
 * its own focusable undo button from assistive tech), so the undo action is
 * still reachable; it simply doesn't self-announce.
 */

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Pause the auto-dismiss while the user is inside the toast (focus or
   *  pointer), and restart it when they leave — so "undo" cannot expire
   *  mid-reach. The App owns the timer; these just hold and release it. */
  onHold?: () => void;
  onRelease?: () => void;
}

export default function Toast({ message, actionLabel, onAction, onDismiss, onHold, onRelease }: ToastProps) {
  return (
    <div
      className="toast"
      onFocusCapture={onHold}
      onBlurCapture={onRelease}
      onPointerEnter={onHold}
      onPointerLeave={onRelease}
    >
      <span className="toast-text">{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="toast-action"
          onClick={() => { onAction(); onDismiss(); }}
        >{actionLabel}</button>
      )}
      <button
        type="button"
        className="toast-close"
        onClick={onDismiss}
        aria-label="Dismiss"
      >✕</button>
    </div>
  );
}
