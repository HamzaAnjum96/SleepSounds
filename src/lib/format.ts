/**
 * Locale-aware number formatting for the numbers the interface actually shows.
 *
 * These are locale-sensitive even with no translation in sight: the digits
 * themselves differ (Arabic-Indic), and so does where the percent sign sits and
 * which side of the number it takes. Hand-built `${Math.round(v * 100)}%`
 * strings bake in one answer for all of them.
 *
 * English output is unchanged everywhere this is actually called: the volume
 * sliders step by 0.01, and all 101 of those values format identically, as do
 * all 100,001 values the sound editor can produce. Across arbitrary ratios the
 * two disagree only at exact half-percent boundaries (0.145, 0.285, 0.565,
 * 0.575), where `0.145 * 100` is really 14.499999999999998 and the old
 * arithmetic rounded down to 14. Intl says 15, which is the correct answer;
 * that divergence is a floating-point bug being dropped, not a change in
 * behaviour.
 *
 * The formatter follows the browser's locale (`undefined`), and is built once
 * rather than per render — these run on every volume tick.
 */
const percentFmt = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 0,
});

/** A 0..1 ratio as a whole-number percentage, e.g. 0.5 -> "50%". */
export function formatPercent(ratio: number): string {
  return percentFmt.format(ratio);
}
