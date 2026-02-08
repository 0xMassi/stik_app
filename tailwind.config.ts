import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        coral: {
          DEFAULT: "rgb(var(--color-coral) / <alpha-value>)",
          light: "rgb(var(--color-coral-light) / <alpha-value>)",
          dark: "rgb(var(--color-coral-dark) / <alpha-value>)",
        },
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        stone: "rgb(var(--color-stone) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["Monaco", "Consolas", "monospace"],
      },
      borderRadius: {
        DEFAULT: "14px",
        sm: "10px",
        lg: "20px",
        pill: "100px",
      },
      boxShadow: {
        stik: "var(--shadow-stik)",
        "coral-sm": "var(--shadow-coral-sm)",
        "coral-lg": "var(--shadow-coral-lg)",
      },
    },
  },
  plugins: [],
};

export default config;
