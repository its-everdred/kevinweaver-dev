import { expect, test, type Page, type Request } from '@playwright/test'

const EPOCH = new Date('2026-06-01T00:00:00.000Z')
const PAUSE_AT = new Date('2026-06-01T01:00:00.000Z')
const ORIGIN = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000').origin
const DATA_FALLBACK_PATHS = new Set([
  '/data/v1/manifest.json',
  '/data/v1/grid.json',
])

declare global {
  interface Window {
    __kwFrames?: number
  }
}

function isExpectedDataFallback(url: URL) {
  return url.origin === ORIGIN && DATA_FALLBACK_PATHS.has(url.pathname)
}

function isCheckedSubresource(request: Request) {
  const isExpectedFallback =
    request.resourceType() === 'fetch' &&
    isExpectedDataFallback(new URL(request.url()))
  return !isExpectedFallback
}

async function loadFirstVisit(page: Page) {
  const fallbackResponses = Array.from(DATA_FALLBACK_PATHS, (path) =>
    page.waitForResponse((response) => new URL(response.url()).pathname === path)
  )
  await page.route(isExpectedDataFallback, (route) => route.fulfill({ status: 404 }))
  await page.goto('/', { waitUntil: 'load' })
  await Promise.all(fallbackResponses)
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.locator('main')).toBeVisible()
}

test.describe('smoke', () => {
  test('the home route serves a document with a declared language', async ({
    page,
  }) => {
    const response = await page.goto('/')

    expect(response?.status()).toBe(200)
    await expect(page.locator('html')).toHaveAttribute('lang', /.+/)
  })

  test('no subresource fails to load', async ({ page }) => {
    const broken: string[] = []
    page.on('response', (response) => {
      if (
        isCheckedSubresource(response.request()) &&
        response.status() >= 400
      ) {
        broken.push(`${response.status()} ${response.url()}`)
      }
    })
    page.on('requestfailed', (request) => {
      if (isCheckedSubresource(request)) {
        broken.push(
          `failed ${request.url()} ${request.failure()?.errorText ?? 'unknown error'}`
        )
      }
    })

    await loadFirstVisit(page)

    expect(broken).toEqual([])
  })

  test('the page makes no cross-origin request', async ({ page }) => {
    const external: string[] = []
    page.on('request', (request: Request) => {
      if (
        !request.url().startsWith('data:') &&
        new URL(request.url()).origin !== ORIGIN
      ) {
        external.push(request.url())
      }
    })

    await loadFirstVisit(page)

    expect(external).toEqual([])
  })

  test('fonts settle', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)

    expect(await page.evaluate(() => document.fonts.status)).toBe('loaded')
  })

  test('page.clock drives requestAnimationFrame deterministically', async ({
    browser,
  }) => {
    const countFrames = async () => {
      const context = await browser.newContext()
      const page = await context.newPage()

      await page.clock.install({ time: EPOCH })
      await page.setContent('<main></main>')
      await page.clock.pauseAt(PAUSE_AT)
      const start = await page.evaluate(() => Date.now())
      await page.evaluate(() => {
        window.__kwFrames = 0
        const tick = () => {
          window.__kwFrames = (window.__kwFrames ?? 0) + 1
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.clock.runFor(1000)
      const end = await page.evaluate(() => Date.now())
      const frames = await page.evaluate(() => window.__kwFrames)

      await context.close()

      return { advanced: end - start, frames }
    }

    const first = await countFrames()
    expect(first.advanced).toBe(1000)
    expect(first.frames).toBeGreaterThan(0)

    const second = await countFrames()
    expect(second).toEqual(first)
  })

  test('the skip link is the first tab stop and reveals above the chrome', async ({
    page,
  }) => {
    await loadFirstVisit(page)

    const skip = page.locator('a.skip')
    const clipPath = () => skip.evaluate((el) => getComputedStyle(el).clipPath)
    const box = async () => skip.boundingBox()

    // Expected target, unchanged.
    await expect(skip).toHaveAttribute('href', '#arc')

    // Hidden at rest (negative control): the sr-only clip leaves a ~1x1 box.
    expect(await clipPath()).toBe('inset(50%)')
    const atRest = await box()
    expect(atRest).not.toBeNull()
    expect(atRest?.width).toBeLessThanOrEqual(2)
    expect(atRest?.height).toBeLessThanOrEqual(2)

    // First tab stop lands on the skip link and reveals it as a control.
    await page.keyboard.press('Tab')
    await expect(skip).toBeFocused()
    expect(await clipPath()).toBe('none')
    const focused = await box()
    expect(focused).not.toBeNull()
    expect(focused?.width).toBeGreaterThan(40)
    expect(focused?.height).toBeGreaterThan(12)
    expect(focused?.x).toBeGreaterThanOrEqual(0)
    expect(focused?.y).toBeGreaterThanOrEqual(0)

    // Leaving focus returns the link to its hidden-at-rest state.
    await page.keyboard.press('Tab')
    await expect(skip).not.toBeFocused()
    const after = await box()
    expect(after).not.toBeNull()
    expect(after?.width).toBeLessThanOrEqual(2)
    expect(after?.height).toBeLessThanOrEqual(2)
  })
})
