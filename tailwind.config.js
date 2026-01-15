/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,html}",
  ],
  theme: {
    extend: {
      colors: {
        // Netflix-inspired colors
        'sw-red': 'var(--sw-accent, #E50914)',
        'sw-dark': '#141414',
        'sw-gray': '#808080',
        'sw-light-gray': '#B3B3B3',
      },
    },
  },
  plugins: [],
}
