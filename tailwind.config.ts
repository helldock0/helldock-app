import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic surface tokens
        bg: '#0F0F12',
        surface: '#1B1B1F',
        'surface-2': '#2C2C32',
        'surface-3': '#35353C',
        line: '#2F2F36',
        'line-strong': '#3C3C44',

        // Text
        fg: '#F5F5F7',
        muted: '#8A8A93',
        'muted-2': '#6B7280',

        // Brand
        gold: '#FFD700',
        'gold-hover': '#FFC107',
        'gold-dim': '#B89400',
        crimson: '#DC143C',
        'crimson-dim': '#8B0E27',
        'win-green': '#34D399',
      },
      fontFamily: {
        sans: ['var(--font-fira-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-fira-code)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Tighter modular scale for data-dense dashboards
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      boxShadow: {
        card: '0 1px 0 0 rgba(255,255,255,0.02) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        'gold-glow': '0 0 0 1px rgba(255,215,0,0.25), 0 8px 32px -12px rgba(255,215,0,0.25)',
      },
    },
  },
  plugins: [],
}
export default config
