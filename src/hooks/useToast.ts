import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const TOAST_MS = 5000;

/**
 * The app's single forgiving snackbar. Destructive actions (stopping a mix,
 * deleting a saved one) leave an "undo" here for a few seconds — forgiving in
 * the dark. One toast at a time; a new one replaces the old.
 *
 * Undo is this app's whole forgiveness mechanism, so the fuse can be held:
 * while focus or the pointer is inside the toast, it won't expire mid-reach (a
 * keyboard or screen-reader user is the person least able to race a timer).
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // The id of the toast currently on screen, so a hold/release from a toast
  // that has already been replaced can never dismiss its successor.
  const currentId = useRef(0);

  const arm = useCallback((id: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setToast((t) => (t?.id === id ? null : t)),
      TOAST_MS,
    );
  }, []);

  const showToast = useCallback((message: string, actionLabel?: string, onAction?: () => void) => {
    const id = ++currentId.current;
    setToast({ id, message, actionLabel, onAction });
    arm(id);
  }, [arm]);

  const dismissToast = useCallback(() => {
    window.clearTimeout(timer.current);
    setToast(null);
  }, []);

  const holdToast = useCallback(() => window.clearTimeout(timer.current), []);
  const releaseToast = useCallback(() => arm(currentId.current), [arm]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, showToast, dismissToast, holdToast, releaseToast };
}
