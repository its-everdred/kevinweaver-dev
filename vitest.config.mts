import react from '@vitejs/plugin-react'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

// Three projects, one runner. Filename routes the file:
//   *.test.ts  -> node    (pure logic, no DOM)
//   *.test.tsx -> dom     (jsdom + Testing Library, synchronous components only)
//   *.browser.test.ts -> canvas (real Chromium, real CanvasRenderingContext2D)
// End-to-end specs are *.spec.ts under e2e/ and belong to Playwright, not Vitest.
const IGNORED = ['**/node_modules/**', '**/.git/**', '**/.next/**', 'e2e/**']

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: [...IGNORED, '**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./test/setup.dom.ts'],
          include: ['**/*.test.tsx'],
          exclude: IGNORED,
        },
      },
      {
        extends: true,
        test: {
          name: 'canvas',
          include: ['**/*.browser.test.ts'],
          exclude: IGNORED,
          browser: {
            enabled: true,
            headless: true,
            // Browser mode writes PNGs into __screenshots__ on failure. Image
            // bytes only ever come from the pinned visual-regression container.
            screenshotFailures: false,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // Explicit include so an untested module in a gated directory scores 0%
      // rather than being omitted from the report entirely.
      include: ['lib/viz/sim/**/*.ts', 'lib/bundle/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        'lib/viz/sim/**': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        'lib/bundle/{schema,codec,frontcode}.ts': {
          statements: 100,
          branches: 95,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
})
