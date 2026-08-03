import { test, expect, type Page } from '@playwright/test'

/**
 * Proves the canvas island is lazy: the deferred gource island chunk is not
 * fetched while the instrument region is out of view, and scrolling it into
 * view fetches exactly that island chunk.
 *
 * Deliberately name-free: Turbopack chunk basenames are content hashes, so the
 * only stable identifiers are the content markers KW-025 and KW-024 compile
 * into their deferred modules. Classification is by role, never by chunk name.
 *
 * One documented exception. The e2e build always sets NEXT_PUBLIC_TEST_HOOKS=1
 * (KW-023's e2e.yml job env and playwright.config.ts webServer env), which
 * makes KW-024's driver `void import('./testHarness')` fire at hydration,
 * before the island is in view. The test-harness chunk is therefore a
 * legitimate eager fetch under the test-hooks build; it is not the island and
 * it is excluded from the "nothing undeclared before intersection" check. Any
 * OTHER undeclared chunk fetched early - in particular the island itself - is
 * a laziness regression and fails.
 */

const CHUNK_PATH_RE = /^\/_next\/static\/chunks\/.+\.js$/
const HTML_ASSET_RE = /\/_next\/static\/chunks\/[^"'\\\s)]+?\.js/g

/** KW-020's once-per-session guard. Set before load so the overlay never mounts. */
const BOOT_SESSION_KEY = 'kw.boot.v1'

/**
 * KW-025's GOURCE_CHUNK_MARKER, set as `data-chunk` on the graph canvas
 * (`components/viz/Gource.tsx`) and present verbatim in the island chunk's
 * compiled source. The stable way to say "the island chunk".
 */
const GOURCE_ISLAND_MARKER = 'kw-gource-island'

/**
 * KW-024's `installTestHarness` export name (`lib/viz/testHarness.ts`), present
 * verbatim in the deferred test-harness chunk's compiled source. It also
 * appears in the first-load chunk that hosts the driver's import site, but that
 * chunk is document-declared and never reaches the undeclared check.
 */
const TEST_HARNESS_MARKER = 'installTestHarness'

function trackChunkRequests(page: Page): Set<string> {
  const seen = new Set<string>()
  page.on('request', (r) => {
    const p = new URL(r.url()).pathname
    if (CHUNK_PATH_RE.test(p)) seen.add(p)
  })
  return seen
}

/** Every chunk the served document for `/` names. Works for static or dynamic routes. */
async function declaredChunks(page: Page): Promise<Set<string>> {
  const res = await page.request.get('/')
  expect(res.status()).toBe(200)
  const html = await res.text()
  const declared = new Set([...html.matchAll(HTML_ASSET_RE)].map((m) => m[0]))
  expect(declared.size).toBeGreaterThan(0)
  return declared
}

/**
 * The served source of a chunk, or null when it cannot be fetched. Uses the API
 * request context so inspection never pollutes the browser request tally.
 */
async function chunkSource(page: Page, path: string): Promise<string | null> {
  const res = await page.request.get(path)
  if (!res.ok()) return null
  return res.text()
}

/** The KW-024 test-harness chunk, which the e2e build legitimately fetches at hydration. */
function isTestHarnessChunk(source: string | null): boolean {
  return (
    source !== null &&
    source.includes(TEST_HARNESS_MARKER) &&
    !source.includes(GOURCE_ISLAND_MARKER)
  )
}

/** The deferred gource island chunk, which must never arrive before intersection. */
function isGourceIslandChunk(source: string | null): boolean {
  return source !== null && source.includes(GOURCE_ISLAND_MARKER)
}

/** KW-005 guarantees this id on the instrument region's title element. */
function instrumentRegion(page: Page) {
  return page
    .getByRole('region')
    .filter({ has: page.locator('#region-instrument-title') })
}

async function settle(page: Page) {
  // Belt and braces behind the session key: if KW-020 ever renames the key, the
  // overlay still gets dismissed and this spec still measures what it claims to.
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) {
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
  await page.waitForLoadState('networkidle')
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

test('no deferred island chunk is fetched while the instrument region is out of view', async ({
  page,
}) => {
  const declared = await declaredChunks(page)
  const requested = trackChunkRequests(page)

  // Land below the instrument. `#contact` is KW-005's anchor on the contact
  // region, which sits after the instrument in comp document order.
  await page.goto('/#contact', { waitUntil: 'networkidle' })
  await settle(page)

  // Precondition, asserted rather than assumed. If the instrument is still in
  // the viewport this spec would pass vacuously, so it fails instead.
  await expect(
    instrumentRegion(page),
    'the instrument region must start out of view for this assertion to mean anything; ' +
      'if the page layout changed, fix this spec deliberately rather than deleting it'
  ).not.toBeInViewport()

  // Every chunk fetched before intersection must be declared by the document
  // for `/`, or be KW-024's test harness (see the header note). Anything else
  // arrived early - and if it is the island, that is a laziness regression.
  const undeclared = [...requested].filter((p) => !declared.has(p))
  const unexpected: string[] = []
  for (const path of undeclared) {
    if (!isTestHarnessChunk(await chunkSource(page, path))) unexpected.push(path)
  }
  expect(
    unexpected,
    `undeclared chunks fetched before intersection (other than the KW-024 test harness): ` +
      unexpected.join(', ')
  ).toEqual([])
})

test('scrolling the instrument region into view fetches the deferred island chunk', async ({
  page,
}) => {
  const declared = await declaredChunks(page)
  const requested = trackChunkRequests(page)

  await page.goto('/#contact', { waitUntil: 'networkidle' })
  await settle(page)
  const before = new Set(requested)

  const instrument = instrumentRegion(page)
  await instrument.scrollIntoViewIfNeeded()
  await expect(instrument).toBeInViewport()
  await page.waitForLoadState('networkidle')

  const arrived = [...requested].filter((p) => !before.has(p))
  const islandChunks: string[] = []
  for (const path of arrived) {
    if (isGourceIslandChunk(await chunkSource(page, path))) islandChunks.push(path)
  }
  expect(
    islandChunks.length,
    'intersecting the instrument region did not fetch the deferred gource island chunk: ' +
      'the island is either eagerly bundled into the first load or is not mounted behind ' +
      'an IntersectionObserver'
  ).toBeGreaterThan(0)
  for (const path of islandChunks) expect(declared.has(path)).toBe(false)
})
