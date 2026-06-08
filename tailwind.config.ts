import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9eaff",
          200: "#bcd9ff",
          300: "#8ebfff",
          400: "#599cff",
          500: "#3478ff",
          600: "#1f59f0",
          700: "#1846c7",
          800: "#163ba0",
          900: "#16357f",
        },
      },
    },
  },
  plugins: [],
};

export default config;
