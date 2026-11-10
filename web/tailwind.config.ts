import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Inter"', '"Sarabun"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
        print: ['"Sarabun"', "sans-serif"],
      },
      colors: {
        // โทนหลักของระบบ (Teal)
        brand: {
          50: "#f0fdfa", 100: "#ccfbf1", 200: "#99f6e4", 300: "#5eead4", 400: "#2dd4bf",
          500: "#0d9488", 600: "#0f766e", 700: "#115e59", 800: "#134e4a", 900: "#042f2e",
        },
        ink: { DEFAULT: "#0f172a", bg: "#F8FAFC", dark: "#0B0F17" },
      },
    },
  },
  plugins: [],
};
export default config;
