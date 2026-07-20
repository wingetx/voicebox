import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        vb: {
          50: "#fbf3e6",
          100: "#f5e3c4",
          200: "#ebc890",
          300: "#dea85e",
          400: "#cf8a3c",
          500: "#b8722a",
          600: "#9c5c20",
          700: "#7d481c",
          800: "#5f371a",
          900: "#482a16",
          950: "#2a180d",
        },
        ink: {
          50: "#f8f3ec",
          100: "#eee5da",
          200: "#ddd0c2",
          300: "#bfae9f",
          400: "#9c877a",
          500: "#7a6559",
          600: "#55443b",
          700: "#3d302a",
          800: "#2b211c",
          900: "#1c1512",
          950: "#140f0c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out",
        "slide-up": "slideUp 0.5s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(184, 114, 42, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(184, 114, 42, 0.6)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
