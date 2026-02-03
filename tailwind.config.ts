import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#FFFCF9",
        surface: "#FFFFFF",
        coral: {
          DEFAULT: "#E8705F",
          light: "#FFF1EE",
          dark: "#D6604F",
        },
        ink: "#1A1A1A",
        stone: "#7A7A7A",
        line: "#F0EEEB",
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
        stik: "0 20px 60px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0,0,0,0.04)",
        "coral-sm": "0 4px 16px rgba(232, 112, 95, 0.25)",
        "coral-lg": "0 8px 24px rgba(232, 112, 95, 0.35)",
      },
    },
  },
  plugins: [],
};

export default config;
