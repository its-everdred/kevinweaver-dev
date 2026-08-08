import { test, expect, type Page } from '@playwright/test'

/**
 * The event-chunk pump, from the viewer's side.
 *
 * The galaxy's real repositories exist only in the event chunks: `repos.json`
 * names them but a repository with no resident file event owns no files, and a
 * repository with no files is dropped by `buildUniverse` and lit by no star.
 * The one repository that does NOT come from the chunks is `private`, which is
 * synthesized client-side from `grid.json` — part of the first-byte payload
 * that always loads. So a pump that stops early has one unmistakable signature:
 * the disc holds `private` and nothing else, which is exactly what the operator
 * reported from a phone.
 *
 * The pump is 94 chunks fetched one after another (188 requests). On a phone
 * that is 188 chances for the radio to drop a connection, and a single dropped
 * connection used to be terminal: `Loader.loadChunk` could not tell a request
 * that failed from a file that is not there, ended history on both, and
 * `pumpChunks` swallowed the result. This spec drops exactly one chunk request
 * — the cheapest, most faithful model of a phone on a real network — and holds
 * the galaxy to the same content it has on a clean load.
 *
 * Runs on `mobile-1x` as well as `desktop-1x`; see playwright.config.ts.
 */

/** KW-020's once-per-session guard. Set before load so the overlay never mounts. */
const BOOT_SESSION_KEY = 'kw.boot.v1'
/** Every event chunk after the boot chunk arrives through this route. */
const EVENT_CHUNK_GLOB = '**/data/v1/events/ee-*.json'
/**
 * Which event chunk request to drop. Early enough that surviving it proves
 * recovery rather than luck: without recovery the disc keeps 6 chunks of 94.
 */
const DROP_NTH_CHUNK = 6
/**
 * Days sampled across the whole window. The events log renders one day at a
 * time, so the repositories the payload holds are only visible by walking it.
 */
const SAMPLES = 120
/**
 * Distinct real repositories a complete payload puts on screen across those
 * samples. A clean load reaches 12; the boot chunk alone reaches 0, and the
 * failure this spec covers reaches 0. Five is far from both.
 */
const MIN_REAL_REPOS = 5

interface Sweep {
  /** Distinct repository names the events log named, `private` excluded. */
  readonly repos: readonly string[]
  /** Rows naming a file the history can place. */
  readonly placed: number
}

/**
 * The galaxy timeline harness is the page's real clock and overwrites the
 * driver harness the `Window.__viz` global is declared with; cast the shape
 * away for this spec exactly as e2e/canvas.spec.ts does.
 */
type GalaxyHarness = {
  pause(): void
  seekDay(day: number): { readonly total: number }
  inspect(): { readonly total: number }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((key) => {
    try {
      window.sessionStorage.setItem(key, '1')
    } catch {
      /* partitioned storage: KW-020 fails closed and renders nothing */
    }
  }, BOOT_SESSION_KEY)
})

/**
 * Walks the whole window through the test harness and collects what the events
 * log names. The harness is the page's real clock, so this reads the same
 * per-day slices the galaxy draws beams from.
 */
async function sweepRepos(page: Page): Promise<Sweep> {
  await page.goto('/?viz-test=1', { waitUntil: 'domcontentloaded' })
  await page
    .locator('canvas[data-chunk="kw-galaxy-universe"]')
    .scrollIntoViewIfNeeded()
  await page.waitForFunction(() => window.__viz !== undefined, undefined, {
    timeout: 30_000,
  })
  // The pump runs after first paint and publishes when it finishes. Give it a
  // generous window: 94 chunks is a lot of round trips even on a fast link.
  await page.waitForTimeout(8_000)
  return page.evaluate(async (samples) => {
    const viz = window.__viz as unknown as GalaxyHarness | undefined
    if (!viz) throw new Error('galaxy test harness never installed')
    viz.pause()
    const total = viz.inspect().total
    const repos = new Set<string>()
    let placed = 0
    for (let index = 0; index < samples; index += 1) {
      viz.seekDay(Math.floor((index * total) / samples))
      await new Promise((resolve) => setTimeout(resolve, 8))
      for (const row of document.querySelectorAll('#kw-event-log .e')) {
        const name = row.querySelector('.repo')?.textContent?.trim()
        if (name && name !== 'private') repos.add(name)
        if (!row.querySelector('.unplaced')) placed += 1
      }
    }
    return { repos: [...repos], placed }
  }, SAMPLES)
}

test('a load with every chunk intact fills the disc with real repositories', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const sweep = await sweepRepos(page)
  expect(
    sweep.repos.length,
    'the baseline this spec measures the flaky load against'
  ).toBeGreaterThanOrEqual(MIN_REAL_REPOS)
  expect(sweep.placed).toBeGreaterThan(0)
})

test('one dropped event chunk does not reduce the galaxy to the private repo', async ({
  page,
}) => {
  test.setTimeout(120_000)
  let seen = 0
  let dropped: string | null = null
  await page.route(EVENT_CHUNK_GLOB, async (route) => {
    seen += 1
    // Once, and only once: a phone that drops a connection gets a working one
    // back. A route that stayed broken would be testing a missing file, which
    // is a different fault with a different (documented) outcome.
    if (seen === DROP_NTH_CHUNK && dropped === null) {
      dropped = new URL(route.request().url()).pathname
      await route.abort('connectionreset')
      return
    }
    await route.continue()
  })

  const sweep = await sweepRepos(page)

  expect(
    dropped,
    'the spec never dropped a chunk, so it proved nothing'
  ).not.toBeNull()
  expect(
    sweep.repos.length,
    `the pump did not recover from a dropped ${dropped}: the disc holds only ` +
      'the synthesized private repo, which is the reported mobile symptom'
  ).toBeGreaterThanOrEqual(MIN_REAL_REPOS)
  expect(
    sweep.placed,
    'every contribution on screen is a synthesized stand-in: no file event survived'
  ).toBeGreaterThan(0)
})

test('the runtime surfaces how much of the event history is resident', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // A pump that dies partway used to report nothing at all, which is why this
  // shipped: no test could see it and no console said it. The attribute is the
  // pump's only externally visible statement of what it managed to load.
  const resident = page.locator('html')
  await expect(resident).toHaveAttribute('data-kw-chunks', /^\d+\/\d+$/, {
    timeout: 30_000,
  })
  await expect
    .poll(
      async () => {
        const value = (await resident.getAttribute('data-kw-chunks')) ?? '0/1'
        const [loaded, total] = value.split('/').map(Number)
        return loaded === total && (total ?? 0) > 1
      },
      { timeout: 60_000, message: 'the pump never reached the last chunk' }
    )
    .toBe(true)
})
