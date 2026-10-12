/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-cyan': '#009bb6',
        'brand-blue': '#046aa7',
        'brand-black': '#121E36',
        'brand-white': '#F8FAFC',
        'brand-grey': '#A3B1C6',
        'brand-link': '#040F49',
      },
      fontFamily: {
        'display': ['"Space Grotesk"', 'sans-serif'],
        'body': ['"Inter Tight"', 'sans-serif'],
        'mono': ['"JetBrains Mono"', 'monospace'],
      }
    },
  },
  plugins: [],
}