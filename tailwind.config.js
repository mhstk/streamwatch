/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        'sw-bg': '#161210',
        'sw-surface': '#1e1a17',
        'sw-elevated': '#2a2320',
        'sw-accent': '#B91C1C',
        'sw-accent-hover': '#dc2626',
        'sw-accent-dark': '#991B1B',
        'sw-text': '#f0ece8',
        'sw-text-secondary': '#a39e99',
        'sw-text-muted': '#6b6560',
        'sw-border': '#2c2420',
        'sw-border-soft': 'rgba(44, 36, 32, 0.4)',
        // Keep old token as alias during migration
        'sw-red': '#B91C1C',
        'sw-dark': '#161210',
      },
      fontFamily: {
        'heading': ['"Plus Jakarta Sans"', 'sans-serif'],
        'body': ['"Inter"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
