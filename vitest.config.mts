import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Pure logic only. Anything needing a DOM or a canvas belongs in Playwright —
    // the sim/ and data/ modules are written DOM-free precisely so they can be
    // tested here without a browser.
    environment: 'node',
    // `test/` is included deliberately. KW-012 put its roundtrip suite at
    // test/bundle/roundtrip.test.ts, which the original glob silently skipped —
    // 9.7 KB of assertions that read as coverage while never executing.
    include: ['{lib,sim,scripts,test}/**/*.{test,spec}.{ts,mts}'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**', 'docs/**'],
  },
})
