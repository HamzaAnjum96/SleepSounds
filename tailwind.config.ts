import type { Config } from 'tailwindcss';

/**
 * drift styles itself with the CSS custom-property design system in
 * `src/index.css` (see DESIGN.md). Tailwind is kept only for its base reset
 * (`@tailwind base`); the app uses no utility classes, so the theme is bare.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
