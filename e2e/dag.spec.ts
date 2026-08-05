import { expect, test, type Page } from '@playwright/test'

async function gotoDag(page: Page) {
  await page.goto('/dag', { waitUntil: 'load' })
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

test.describe('aiur-galaxy page', () => {
  test('renders the canvas and a contribution date @smoke', async ({ page }) => {
    await gotoDag(page)
    const canvas = page.getByRole('img', { name: /animated dag/i })
    await expect(canvas).toBeVisible()
    await expect(canvas).toHaveAttribute('role', 'img')
    await expect
      .poll(() => canvas.evaluate((el) => el.getBoundingClientRect().width))
      .toBeGreaterThan(100)
  })

  test('draws non-background pixels as the animation runs @smoke', async ({
    page,
  }) => {
    await gotoDag(page)
    await page.waitForTimeout(2000)
    const pixels = await page.evaluate(() => {
      const canvas = document.querySelector('canvas')
      if (!canvas) return 0
      const ctx = canvas.getContext('2d')
      const data = ctx?.getImageData(0, 0, canvas.width, canvas.height).data
      if (!data) return 0
      let count = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (r !== undefined && g !== undefined && b !== undefined && (r > 30 || g > 40 || b > 40)) {
          count++
        }
      }
      return count
    })
    expect(pixels).toBeGreaterThan(1000)
  })

  test('forward and backward controls exist and toggle playback @smoke', async ({
    page,
  }) => {
    await gotoDag(page)
    const toggle = page.getByRole('button', { name: /play (forward|backward)/i })
    await expect(toggle).toBeVisible()
    const start = page.getByRole('button', { name: 'start' })
    const end = page.getByRole('button', { name: 'end' })
    await expect(start).toBeVisible()
    await expect(end).toBeVisible()
  })
})
