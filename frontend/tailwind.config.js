/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          500: '#22c55e',
          600: '#16a34a',
          900: '#14532d',
        },
        dark: {
          800: '#1e1f29',
          900: '#13141c',
          950: '#0b0c10',
        }
      }
    },
  },
  plugins: [],
}
