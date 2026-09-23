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
        // Apple's neutral ladder. This palette is used for nearly all text,
        // borders and muted surfaces across the app, so retargeting it here
        // moves the whole product onto Apple's greys in one place rather
        // than through 200 components. #1d1d1f at the dark end is the
        // system's near-black ink — never pure black, which is reserved
        // for the nav and for true void.
        navy: {
          50: "#f5f5f7",
          100: "#e8e8ed",
          200: "#d2d2d7",
          300: "#b0b0b5",
          400: "#86868b",
          500: "#6e6e73",
          600: "#4a4a4d",
          700: "#333333",
          800: "#1d1d1f",
          900: "#1d1d1f",
          950: "#000000",
        },
        // Action Blue. The single interactive colour — every link, every
        // filled action, every focus signal. 500 is #0066cc exactly; 600
        // is the focus-ring sibling; 400 is the on-dark variant, because
        // Action Blue disappears against a #272729 tile.
        brand: {
          50: "#f0f7ff",
          100: "#dbeeff",
          200: "#b3dcff",
          300: "#66b5ff",
          400: "#2997ff",
          500: "#0066cc",
          600: "#0071e3",
          700: "#0055aa",
          800: "#004488",
          900: "#003366",
        },
      },
      fontFamily: {
        // SF Pro first — on the Macs and iPhones this is used on, these
        // names resolve to the real system faces. --font-sans / --font-heading
        // are the next/font Inter Tight fallbacks for everywhere else.
        sans: ['"SF Pro Text"', "system-ui", "-apple-system", "BlinkMacSystemFont", "var(--font-sans)", "sans-serif"],
        heading: ['"SF Pro Display"', "system-ui", "-apple-system", "BlinkMacSystemFont", "var(--font-heading)", "var(--font-sans)", "sans-serif"],
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
