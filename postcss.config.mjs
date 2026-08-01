/** Tailwind v4 has import handling and vendor prefixing built in — no autoprefixer,
 *  no postcss-import. Adding either back will double-process the cascade. */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
