/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{tsx,ts}"],
  theme: {
    extend: {
      colors: {
        reader: {
          bg: "var(--reader-bg)",
          text: "var(--reader-text)",
          accent: "#3b82f6",
        },
      },
      width: {
        reader: "420px",
      },
      height: {
        reader: "700px",
      },
    },
  },
  plugins: [],
};
