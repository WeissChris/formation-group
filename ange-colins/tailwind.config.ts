import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Ange Colins — warm, editorial studio palette
        cream: "#FBF8F4",
        sand: "#F1EAE0",
        clay: "#B08968",       // primary accent — warm bronze/taupe
        "clay-dark": "#8C6A4F",
        ink: "#211C17",        // near-black headings/body
        stone: "#6B635A",      // muted text
        line: "#E3DACE",       // borders
        blush: "#EFE2D9",
      },
      fontFamily: {
        serif: ["var(--font-display)", "Cormorant Garamond", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        wide2: "0.18em",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
