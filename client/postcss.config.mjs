// Used by Next. The Vite build gets its own inline PostCSS setup in vite.config.mjs
// because it already runs Tailwind through @tailwindcss/vite.
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
