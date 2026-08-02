import { defineConfig, devices } from '@playwright/test'

const PORT = 3000
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`
const remoteOrigin = process.env.BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['blob']]
    : [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
    // Snapshot follow-up owns the sanctioned update guard, root snapshotPathTemplate,
    // and exact threshold, maxDiffPixels, animations, caret, and scale settings.
    toHaveScreenshot: { stylePath: './e2e/screenshot.css' },
  },
  webServer: remoteOrigin
    ? undefined
    : {
        command: `npm run start -- --port ${PORT} --hostname 127.0.0.1`,
        url: LOCAL_ORIGIN,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // webServer.env applies only at start. Local hook builds need
        // NEXT_PUBLIC_TEST_HOOKS=1 npm run build.
        env: {
          NEXT_PUBLIC_TEST_HOOKS: '1',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },
  use: {
    baseURL: remoteOrigin ?? LOCAL_ORIGIN,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
    timezoneId: 'UTC',
    locale: 'en-US',
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'desktop-1x',
      testIgnore: [/smoke\.spec\.ts/, /canvas\.spec\.ts/],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'desktop-2x',
      testMatch: /canvas\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile-1x',
      testIgnore: [/smoke\.spec\.ts/, /canvas\.spec\.ts/],
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
    },
    {
      name: 'reduced-motion',
      testMatch: /a11y\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        contextOptions: { reducedMotion: 'reduce' },
      },
    },
  ],
})
