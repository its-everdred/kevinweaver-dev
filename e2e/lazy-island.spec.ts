import { test, expect, type Page } from '@playwright/test'

/**
 * Proves the galaxy universe chunk loads only where the instrument mounts it.
 *
 * The instrument region is the first region on the home page, so its galaxy
 * island is in view at load and the chunk is fetched promptly. On routes that
 * do not mount the instrument, the galaxy chunk must never be
 * fetched. Classification is by role (chunk content markers), never by chunk
 * name, because Turbopack chunk basenames are content hashes.
 *
 * One documented exception. The e2e build always sets NEXT_PUBLIC_TEST_HOOKS=1
 * (KW-023's e2e.yml job env and playwright.config.ts webServer env), which
 * makes KW-024's driver `void import('./testHarness')` fire at hydration.
 * The test-harness chunk is therefore a legitimate fetch everywhere the driver
 * hydrates; it is not the island and it is excluded from the "galaxy chunk on
 * the wrong route" checks.
 */

const CHUNK_PATH_RE = /^\/_next\/static\/chunks\/.+\.js$/
const HTML_ASSET_RE = /\/_next\/static\/chunks\/[^"'\\\s)]+?\.js/g

/** KW-020's once-per-session guard. Set before load so the overlay never mounts. */
const BOOT_SESSION_KEY = 'kw.boot.v1'

/**
 * The galaxy chunk marker, set as `data-chunk` on the graph canvas
 * (`components/viz/GalaxyUniverse.tsx`) and present verbatim in the island chunk's
 * compiled source. The stable way to say "the island chunk".
 */
const GALAXY_ISLAND_MARKER = 'kw-galaxy-universe'

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

/** The served source of a chunk, or null when it cannot be fetched. */
async function chunkSource(page: Page, path: string): Promise<string | null> {
  const res = await page.request.get(path)
  if (!res.ok()) return null
  return res.text()
}

/** The deferred galaxy island chunk. */
function isGalaxyChunk(source: string | null): boolean {
  return source !== null && source.includes(GALAXY_ISLAND_MARKER)
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

test('the galaxy island chunk loads on the home page where the instrument is in view', async ({
  page,
}) => {
  const declared = await declaredChunks(page)
  const requested = trackChunkRequests(page)

  await page.goto('/', { waitUntil: 'networkidle' })
  await settle(page)

  // The instrument is the first region and the galaxy island mounts in view,
  // so its chunk must have arrived as part of the load.
  const arrived = [...requested].filter((p) => !declared.has(p))
  const islandChunks: string[] = []
  for (const path of arrived) {
    if (isGalaxyChunk(await chunkSource(page, path))) islandChunks.push(path)
  }
  expect(
    islandChunks.length,
    'the home page must fetch the galaxy island chunk: the island is not ' +
      'mounted behind the IntersectionObserver or is bundled into first load'
  ).toBeGreaterThan(0)
})

test('the galaxy island chunk is never fetched on a page without the instrument', async ({
  page,
}) => {
  const declared = await declaredChunks(page)
  const requested = trackChunkRequests(page)

  await page.goto('/kevinweaver.1', { waitUntil: 'networkidle' })
  await settle(page)

  const arrived = [...requested].filter((p) => !declared.has(p))
  const islandChunks: string[] = []
  for (const path of arrived) {
    if (isGalaxyChunk(await chunkSource(page, path))) islandChunks.push(path)
  }
  expect(
    islandChunks,
    'a page that does not mount the instrument must not fetch the galaxy island chunk'
  ).toEqual([])
})
