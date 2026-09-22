/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Same brand palette as the LCL website (logo navy + green).
        navy: {
          50: "#eef1f6",
          100: "#d4dbe8",
          200: "#a7b6cf",
          300: "#7488ad",
          400: "#4a6088",
          500: "#2f456b",
          600: "#22344f",
          700: "#1a283d",
          800: "#14213d",
          900: "#0c1626",
          950: "#070d18",
        },
        brand: {
          50: "#eef8ef",
          100: "#d6eed9",
          200: "#aedcb3",
          300: "#7cc486",
          400: "#54ad60",
          500: "#3fa34d",
          600: "#2f8a3d",
          700: "#276f32",
          800: "#22592b",
          900: "#1d4925",
        },
      },
      fontFamily: {
        // Inter Tight for UI, Space Grotesk for display — see the note in
        // app/layout.js for why it's two families and not one.
        sans: ["var(--font-sans)", "var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["var(--font-heading)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        // Layered "premium" elevation — a tight contact shadow + a soft
        // ambient one. Reads as depth without looking heavy.
        card: "0 1px 2px rgba(13,28,51,0.05), 0 2px 8px -2px rgba(13,28,51,0.09)",
        lift: "0 4px 12px -2px rgba(13,28,51,0.10), 0 12px 32px -8px rgba(13,28,51,0.14)",
        soft: "0 10px 40px -12px rgba(13, 28, 51, 0.18)",
        "btn-brand": "0 1px 2px rgba(13,28,51,0.10), 0 3px 10px -2px rgba(63,163,77,0.35)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
