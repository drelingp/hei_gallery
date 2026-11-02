import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Cormorant Garamond', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        bone: '#f6f2ec',
        ink: '#1a1a1a',
        gold: '#b08a3e',
        stone: '#2a2622',
      },
    },
  },
  plugins: [],
};

export default config;
