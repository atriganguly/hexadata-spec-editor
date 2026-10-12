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
        
        // Liquid Glass Theme Extensions (macOS 27 Golden Gate)
        'glass-surface': 'rgba(18, 30, 54, 0.65)',
        'glass-surface-light': 'rgba(255, 255, 255, 0.08)',
        'glass-border': 'rgba(255, 255, 255, 0.15)',
        'glass-border-subtle': 'rgba(255, 255, 255, 0.08)',
        'glass-highlight': 'rgba(255, 255, 255, 0.25)',
        'glass-dock': 'rgba(13, 19, 31, 0.72)',
      },
      fontFamily: {
        'display': ['"Space Grotesk"', 'sans-serif'],
        'body': ['"Inter Tight"', 'sans-serif'],
        'mono': ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'glass-dock': '0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 0 15px rgba(255, 255, 255, 0.05)',
        'glass-card': '0 10px 30px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
        'glass-button': '0 4px 12px rgba(0, 155, 182, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        'paper-a4': '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 1px rgba(0, 0, 0, 0.3)',
        'glow-cyan': '0 0 20px rgba(0, 155, 182, 0.4)',
      },
      backdropBlur: {
        '3xl': '64px',
        '4xl': '80px',
      },
      animation: {
        'pulse-glow': 'pulseGlow 3s infinite ease-in-out',
        'float-gentle': 'floatGentle 6s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.8', transform: 'scale(1.03)' },
        },
        floatGentle: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [],
}