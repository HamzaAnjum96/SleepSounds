import type { CSSProperties } from 'react';

/**
 * Inline fill position for a `.drift-slider` range input, as a custom
 * property (`--fill-pct`) that the track pseudo-elements read. The track
 * itself is drawn by `::-webkit-slider-runnable-track` / `::-moz-range-*`
 * in index.css — never on the input's own box, which some mobile browsers
 * size taller than the declared height and turn the fill into a fat bar.
 *
 * The fill color comes from `--fill`, which resolves to the card's category
 * accent inside a sound card and to the global accent everywhere else
 * (see `.drift-slider` in index.css).
 */
export function sliderFill(value: number, min = 0, max = 1): CSSProperties {
  const span = max - min || 1;
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  return { '--fill-pct': `${pct}%` } as CSSProperties;
}
