/**
 * A single calm snackbar, shown above the mini player. Used for forgiveness on
 * destructive actions (stopping a mix, deleting a saved one): a quiet line plus
 * an optional action like "undo". One at a time; the App owns the timing and
 * auto-dismiss. Status is announced separately via the live region, so this is
 * aria-hidden to avoid double-speaking.
 */

interface ToastProps {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

export default function Toast({ message, actionLabel, onAction, onDismiss }: ToastProps) {
  return (
    <div className="toast" role="status">
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
