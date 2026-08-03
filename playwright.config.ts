import { defineConfig, devices } from '@playwright/test'

const PORT = 3000
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`
const remoteOrigin = process.env.BASE_URL

// C-23 / ci-testing verifier C4b. `process.argv.includes('--update-snapshots')` is a
// no-op for three of the four documented spellings (program.js:226): `-u`,
// `--update-snapshots=all` and `--update-snapshots=changed` must all be caught.
const UPDATING = process.argv.some(
  (a) => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='),
)

if (UPDATING && process.env.KW_IN_CONTAINER !== '1') {
  throw new Error(
    'Refusing to write screenshots outside the pinned container.\n' +
      'Exactly one image produces baselines. Run:\n' +
      '  docker run --rm --ipc=host -v "$PWD":/w -w /w -e KW_IN_CONTAINER=1 \\\n' +
      '    mcr.microsoft.com/playwright:v1.62.1-noble \\\n' +
      '    sh -c "npm ci --no-audit --no-fund && npm run build && npx playwright test --project=desktop-2x -u"\n' +
      'or comment /update-snapshots on the pull request.',
  )
}

export default defineConfig({
  testDir: './e2e',

  // KW-031. No OS/arch segment: there is exactly one legal producer of these bytes. The
  // 1.62.1 default partitions by platform through {-snapshotSuffix} (index.js:345 sets
  // snapshotSuffix = process.platform), not through a {platform} token.
  // Do NOT also set expect.toHaveScreenshot.pathTemplate: it wins over this key (1257).
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',

  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['blob']]
    : [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // KW-031, measured — see "The comparison settings". 0.2 is blind to a full
      // aqua->green beam recolour; AA pixels are excluded from the count (6665).
      threshold: 0,
      // Already the default (7562), stated so a future edit has to argue with it.
      // Do NOT add maxDiffPixelRatio: 0.002 — that RAISES the budget from 0 to ~2048 pixels.
      maxDiffPixels: 0,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      stylePath: './e2e/screenshot.css',   // KW-023 owns the file
    },
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
