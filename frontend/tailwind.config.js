/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      colors: {
        canvas: '#F9FAFB',     // Soft, non-glare off-white background
        surface: '#FFFFFF',    // Pure white for floating cards
        intelText: '#111827',   // Dark charcoal for high contrast readability
      },
      boxShadow: {
        // This gives our cards that "weightless, floating" look
        'floating': '0 10px 30px -10px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
        'hovering': '0 20px 40px -15px rgba(0, 0, 0, 0.08)',
      }
    },
  },
  plugins: [],
}

