import { expect, test, type Page, type Request } from '@playwright/test'

const EPOCH = new Date('2026-06-01T00:00:00.000Z')
const PAUSE_AT = new Date('2026-06-01T01:00:00.000Z')
const ORIGIN = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000').origin
const DATA_FALLBACK_PATH = /\/data\/v1\/(manifest|grid)\.json$/
const EXPECTED_DATA_FALLBACK_TYPES = new Set([
  'document',
  'fetch',
  'xhr',
  'eventsource',
  'websocket',
])

declare global {
  interface Window {
    __kwFrames?: number
  }
}

function isCheckedSubresource(request: Request) {
  return !EXPECTED_DATA_FALLBACK_TYPES.has(request.resourceType())
}

async function completeExpectedDataFallback(page: Page) {
  await page.route(DATA_FALLBACK_PATH, (route) =>
    route.fulfill({ status: 404 })
  )
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
    await completeExpectedDataFallback(page)
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

    await page.goto('/', { waitUntil: 'networkidle' })

    expect(broken).toEqual([])
  })

  test('the page makes no cross-origin request', async ({ page }) => {
    const external: string[] = []
    await completeExpectedDataFallback(page)
    page.on('request', (request: Request) => {
      if (
        !request.url().startsWith('data:') &&
        new URL(request.url()).origin !== ORIGIN
      ) {
        external.push(request.url())
      }
    })

    await page.goto('/', { waitUntil: 'networkidle' })

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
})
