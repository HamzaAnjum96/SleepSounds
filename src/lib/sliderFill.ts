/**
 * Inline background for a `.drift-slider` range input: fills the track up to
 * `value` with the accent color, leaving the remainder on the neutral track.
 * Shared by every slider in the app (master volume, per-sound volume, the
 * sound editor params) so the fill treatment stays identical everywhere.
 *
 * The fill color comes from `--fill`, which resolves to the card's category
 * accent inside a sound card and to the global accent everywhere else
 * (see `.drift-slider` in index.css).
 */
export function sliderFill(value: number, min = 0, max = 1) {
  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  return {
    background: `linear-gradient(to right, var(--fill) 0%, var(--fill) ${pct}%, var(--track) ${pct}%)`,
  };
}
