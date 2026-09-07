/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#14213D',
          soft: '#2B3350',
        },
        paper: {
          DEFAULT: '#EEF0EE',
          raised: '#FFFFFF',
        },
        slate: {
          DEFAULT: '#5B6670',
          line: '#D8DCD8',
        },
        amber: {
          DEFAULT: '#D98E2B',
          bg: '#FBEEDA',
        },
        teal: {
          DEFAULT: '#1F7A6C',
          bg: '#E1F0EC',
        },
        rust: {
          DEFAULT: '#B23A2F',
          bg: '#F8E4E1',
        },
        text: '#20242B',
      },
      fontFamily: {
        sans: ['"Public Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '3px',
        lg: '4px',
      },
    },
  },
  plugins: [],
};
