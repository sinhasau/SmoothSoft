import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#faf9f5',
        ink: '#1a1a1a',
      },
    },
  },
  plugins: [],
};

export default config;
