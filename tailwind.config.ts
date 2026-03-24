import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: '#050b1f',
        deepBlue: '#0d1a3b',
        cardBlue: '#111f45',
        accent: '#6da8ff',
        accentSoft: '#89b8ff',
      },
      boxShadow: {
        card: '0 10px 30px rgba(2, 9, 30, 0.35)',
      },
      backgroundImage: {
        'hero-gradient': 'radial-gradient(circle at top, #1a2d62 0%, #050b1f 50%, #030611 100%)',
      },
      animation: {
        pulseSoft: 'pulseSoft 3.5s ease-in-out infinite',
      },
      keyframes: {
        pulseSoft: {
          '0%, 100%': { opacity: '0.95' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
