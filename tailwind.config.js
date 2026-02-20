/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        "primary": "#ff003c",
        "party-purple": "#1a0033",
        "party-black": "#08000d",
        "accent-red": "#ff003c",
        "vibrant-pink": "#ff00a0",
        "neon-glow": "#ff2d55",
        "night-black": "#05010a",
        "night-panel": "#110221",
      },
      fontFamily: {
        "display": ["Plus Jakarta Sans", "sans-serif"],
        "party": ["Bungee", "cursive"]
      },
      borderRadius: {
        "DEFAULT": "1rem",
        "lg": "2rem",
        "xl": "3rem",
        "full": "9999px"
      },
    },
  },
  plugins: [],
}
