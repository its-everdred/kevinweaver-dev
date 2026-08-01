import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure logic only. Anything needing a DOM or a canvas belongs in Playwright —
    // the sim/ and data/ modules are written DOM-free precisely so they can be
    // tested here without a browser.
    environment: 'node',
    include: ['{lib,sim,scripts}/**/*.{test,spec}.{ts,mts}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**', 'docs/**'],
  },
})
