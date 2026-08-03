import { test, expect, type Page } from '@playwright/test'

/**
 * Proves the canvas island is lazy: no chunk outside the set the document for
 * `/` declares is fetched while the instrument region is out of view, and
 * scrolling it into view fetches at least one chunk that was never declared.
 *
 * Deliberately name-free. Turbopack chunk basenames are content hashes, so the
 * only stable way to say "the island chunk" is "a chunk the document did not
 * declare". That definition also survives a bundler change.
 */

const CHUNK_PATH_RE = /^\/_next\/static\/chunks\/.+\.js$/
const HTML_ASSET_RE = /\/_next\/static\/chunks\/[^"'\\\s)]+?\.js/g

/** KW-020's once-per-session guard. Set before load so the overlay never mounts. */
const BOOT_SESSION_KEY = 'kw.boot.v1'

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

test('no undeclared chunk is fetched while the instrument region is out of view', async ({
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

  const undeclared = [...requested].filter((p) => !declared.has(p))
  expect(
    undeclared,
    `undeclared chunks fetched before intersection: ${undeclared.join(', ')}`
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
  expect(
    arrived.length,
    'intersecting the instrument region fetched no new chunk: the island is either eagerly ' +
      'bundled into the first load or is not mounted behind an IntersectionObserver'
  ).toBeGreaterThan(0)
  for (const p of arrived) expect(declared.has(p)).toBe(false)
})
