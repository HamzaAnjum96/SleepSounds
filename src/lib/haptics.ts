/**
 * Tiny tactile confirmations for touch devices. Vibration is unsupported on
 * iOS Safari and may be user-disabled elsewhere; this is always best-effort
 * and silently a no-op. Durations stay short: drift confirms, never buzzes.
 */
export function haptic(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no-op */
  }
}
