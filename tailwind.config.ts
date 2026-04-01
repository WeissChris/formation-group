import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Formation warm grey palette
        fg: {
          bg:      "#F0EEEB",
          card:    "#ECEAE7",
          border:  "#C5C0BB",
          muted:   "#5A5550",    // was #A09A94 — much darker for readability
          heading: "#1E1C1A",    // was #8A8580 — near black for headings
          dark:    "#292929",
          darker:  "#1a1a1a",
        },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      fontSize: {
        "2xs": "0.65rem",
      },
      letterSpacing: {
        architectural: "0.12em",
      },
    },
  },
  plugins: [],
};
export default config;
