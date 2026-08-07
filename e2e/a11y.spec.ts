import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { decodeGrid, decodeManifest } from '../lib/bundle/codec'
import { level } from '../lib/viz/tokens/level'

// The visualization transport is a page-level singleton; these tests share it,
// so running them in parallel races pause/resume state between workers.
test.describe.configure({ mode: 'serial' })

/**
 * Accessibility gate (KW-029).
 *
 * axe-core is consumed directly (the Executor's 2026-08-02 ruling: the
 * `@axe-core/playwright` wrapper is absent from the frozen manifests). The
 * pinned source of the installed `axe-core@4.12.1` is injected into the page
 * and `axe.run` is called for the WCAG tag scan and the explicit structure-rule
 * scan. The WCAG half is tag-driven so a future axe release adds coverage
 * automatically; the structure half is rule-pinned because `region`,
 * `page-has-heading-one`, `landmark-one-main` and `heading-order` are all
 * `best-practice` (never run under `.withTags(WCAG_TAGS)`).
 *
 * `wcag22aa` is included so Axe 4.12's `target-size` (WCAG 2.2 SC 2.5.8) is
 * part of the conformance claim (Executor requirement).
 */

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
/** Measured: all four are `best-practice`, so the tag scan never runs them. */
const STRUCTURE_RULES = [
  'region',
  'page-has-heading-one',
  'landmark-one-main',
  'heading-order',
] as const
const SESSION_KEY = 'kw.boot.v1'

const AXE_SOURCE = readFileSync(
  join(process.cwd(), 'node_modules/axe-core/axe.js'),
  'utf8'
)

interface AxeRuleResult {
  readonly id: string
  readonly impact?: string
  readonly nodes: readonly unknown[]
}
interface AxeResults {
  readonly passes: readonly AxeRuleResult[]
  readonly violations: readonly AxeRuleResult[]
  readonly incomplete: readonly AxeRuleResult[]
  readonly inapplicable: readonly AxeRuleResult[]
}

declare global {
  interface Window {
    axe?: {
      run(context: unknown, options: unknown): Promise<AxeResults>
    }
  }
}

async function injectAxe(page: Page): Promise<void> {
  await page.evaluate((source) => {
    if (document.getElementById('__kw-axe')) return
    const script = document.createElement('script')
    script.id = '__kw-axe'
    script.textContent = source
    document.documentElement.appendChild(script)
  }, AXE_SOURCE)
}

async function runAxe(
  page: Page,
  runOnly: { readonly type: 'tag' | 'rule'; readonly values: readonly string[] }
): Promise<AxeResults> {
  await injectAxe(page)
  return page.evaluate(
    (options) => window.axe!.run(document, { runOnly: options }),
    runOnly
  )
}

/** Decodes the committed compact payload with the repository decoders (KW-012). */
async function readPayload(page: Page) {
  const [m, g] = await Promise.all([
    page.request.get('/data/v1/manifest.json'),
    page.request.get('/data/v1/grid.json'),
  ])
  expect(m.ok(), 'manifest.json must be committed by KW-028').toBeTruthy()
  expect(g.ok(), 'grid.json must be committed by KW-028').toBeTruthy()
  return {
    manifest: decodeManifest(await m.text()),
    grid: decodeGrid(await g.text()),
  }
}

/** The grid walks forward from `start` (the axis flip is the trap — never index 0 as windowEnd). */
function addDaysIso(iso: string, offset: number): string {
  const [y, mo, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, (d ?? 1) + offset))
    .toISOString()
    .slice(0, 10)
}

test.describe('axe', () => {
  test('no WCAG A/AA violations on / @a11y', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const results = await runAxe(page, { type: 'tag', values: WCAG_TAGS })
    await testInfo.attach('axe-wcag', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    })
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2)
    ).toEqual([])
    expect(
      results.passes.length,
      'a scan that inspected nothing is not a pass'
    ).toBeGreaterThan(0)
  })

  test('page structure rules pass @a11y', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const results = await runAxe(page, {
      type: 'rule',
      values: STRUCTURE_RULES,
    })
    await testInfo.attach('axe-structure', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    })
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2)
    ).toEqual([])
    const seen = new Set(
      [...results.passes, ...results.inapplicable].map((rule) => rule.id)
    )
    for (const id of STRUCTURE_RULES)
      expect(seen, `${id} did not run`).toContain(id)
    expect(results.incomplete).toEqual([])
  })
})

test('canvas exposes a name and a real text equivalent @a11y', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  const { manifest, grid } = await readPayload(page)

  // All three canvases carry distinct, non-empty accessible names. The galaxy
  // universe is lazy (KW-025), so scroll it into the viewport to trigger the load.
  await page.evaluate(() => {
    const graph = document.querySelector('.kw-graph')
    if (graph) graph.scrollIntoView({ block: 'center' })
  })
  const ribbon = page.getByRole('img', { name: /contribution grid/i })
  const galaxies = page.getByRole('img', { name: /repository map/i })
  for (const canvas of [ribbon, galaxies]) {
    await expect(canvas).toBeVisible()
    expect(await canvas.evaluate((el) => el.tagName)).toBe('CANVAS')
  }
  const names = await Promise.all(
    [ribbon, galaxies].map((canvas) =>
      canvas.getAttribute('aria-label')
    )
  )
  expect(names.every((name) => Boolean(name && name.trim().length > 0))).toBe(
    true
  )
  expect(new Set(names).size).toBe(2)

  // DEC-011 table: exactly one canonical table (Executor preflight: "a count
  // proving exactly one table"), with one cell per day; every date/count/level
  // is payload-accurate.
  await expect(page.getByTestId('contribution-table')).toHaveCount(1)
  const table = page.getByTestId('contribution-table')
  await expect(table.locator('caption')).toContainText(/contributions by day/i)
  const cells = await table.locator('td[data-day]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      day: node.getAttribute('data-day'),
      count: Number(node.getAttribute('data-count')),
      level: Number(node.getAttribute('data-level')),
    }))
  )
  expect(cells).toHaveLength(manifest.dayCount)
  const mismatches: string[] = []
  for (let i = 0; i < grid.dayCount; i += 1) {
    const date = addDaysIso(grid.start, i)
    const count = (grid.human[i] ?? 0) + (grid.agent[i] ?? 0)
    const expectedLevel = level(count)
    const cell = cells[i]
    if (
      !cell ||
      cell.day !== date ||
      cell.count !== count ||
      cell.level !== expectedLevel
    ) {
      mismatches.push(
        `${date}: expected count ${count} level ${expectedLevel}, got ${JSON.stringify(
          cell
        )}`
      )
    }
  }
  expect(mismatches, mismatches.join('\n')).toEqual([])

  // Server-rendered with zero client JavaScript: the raw HTML carries exactly
  // one `data-day=` per day — the canonical server component, not a hydrated
  // or duplicated copy (Executor preflight: "the exact SSR cell count").
  const html = await (await page.request.get('/')).text()
  expect(html.match(/data-day=/g) ?? []).toHaveLength(manifest.dayCount)
})

test('reduced motion halts the simulation @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/?viz-test=1')
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.evaluate(() => Boolean(window.__viz))).toBe(true)
  await page.clock.runFor(3000)
  const before = await page.evaluate(() => window.__viz!.inspect())
  await page.clock.runFor(5000)
  expect(await page.evaluate(() => window.__viz!.inspect())).toEqual(before)
})

test('a pause control exists and stops the animation @a11y', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/?viz-test=1')
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.evaluate(() => Boolean(window.__viz))).toBe(true)
  const control = page.getByRole('button', {
    name: /^(pause|resume) playback$/i,
  })
  await expect(control).toBeVisible()
  await page.clock.runFor(2000)
  const moving = await page.evaluate(() => window.__viz!.inspect())
  await page.clock.runFor(2000)
  // Negative control: without it, a driver that never starts would pass.
  expect(await page.evaluate(() => window.__viz!.inspect())).not.toEqual(moving)
  await control.focus()
  await expect(control).toBeFocused()
  await page.keyboard.press('Enter')
  // The toggle must register (label flips to Resume) before the clock advances;
  // otherwise a stale snapshot can re-enter the playing state during runFor.
  await expect(control).toHaveAccessibleName(/resume playback/i)
  await expect
    .poll(() => page.evaluate(() => window.__viz!.inspect().playing))
    .toBe(false)
  await page.clock.runFor(1000)
  const paused = await page.evaluate(() => window.__viz!.inspect())
  await page.clock.runFor(5000)
  // The simulation state must freeze after pause. `drawCalls` is a live
  // diagnostic counter that keeps accumulating while surfaces repaint, so it
  // is excluded from the frozen-state comparison.
  const freeze = <T extends object>(info: T): Omit<T, 'drawCalls'> => {
    const rest = { ...info } as Omit<T, 'drawCalls'>
    delete (rest as Record<string, unknown>).drawCalls
    return rest
  }
  const frozen = await page.evaluate(() => {
    const info = window.__viz!.inspect()
    const rest = { ...info } as Omit<typeof info, 'drawCalls'>
    delete (rest as Record<string, unknown>).drawCalls
    return rest
  })
  expect(frozen).toEqual(freeze(paused))
})

test('the bypass link is the first tab stop and is visible when focused @a11y', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const skip = page.getByRole('link', { name: /skip/i })
  await page.keyboard.press('Tab')
  await expect(skip).toBeFocused()
  await expect(skip).toHaveAttribute('href', '#arc')
  const box = await skip.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(40)
  expect(box!.height).toBeGreaterThan(12)
})

test('boot overlay dialog semantics @a11y', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  // The committed payload is a hard prerequisite, so the dialog is required.
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAccessibleName(/cold start/i)
  const skip = page.getByRole('button', { name: /skip/i })
  await expect(skip).toBeFocused()
  // Let every boot line reveal and its kw-logIn animation settle before axe
  // samples, so no mid-opacity text is measured against a blended color.
  await page.clock.runFor(5_000)
  const results = await runAxe(page, { type: 'tag', values: WCAG_TAGS })
  await testInfo.attach('axe-boot', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  })
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2)
  ).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})

test('reduced motion suppresses the boot overlay entirely @a11y', async ({
  browser,
}) => {
  const collectDataRequests = async (
    context: Awaited<ReturnType<Browser['newContext']>>
  ) => {
    const requests: string[] = []
    const page = await context.newPage()
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (path.startsWith('/data/v1/')) requests.push(path)
    })
    await page.goto('/')
    // `networkidle` is unreliable here (the payload loader keeps sockets alive),
    // so settle on the boot decision instead: the overlay either mounts (seen or
    // non-reduced path) or is suppressed entirely. Give the decision time to run
    // and then assert the dialog never appears.
    await page.waitForLoadState('domcontentloaded')
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    return requests
  }

  // Reduced motion: the overlay returns at its matchMedia check, before fetch.
  const reduceContext = await browser.newContext({ reducedMotion: 'reduce' })
  const reduceRequests = await collectDataRequests(reduceContext)

  // Baseline: the overlay suppressed by an already-seen session, so only the
  // instrument loader legitimately requests /data/v1/*.
  const baselineContext = await browser.newContext()
  await baselineContext.addInitScript((key) => {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      /* storage unavailable */
    }
  }, SESSION_KEY)
  const baselineRequests = await collectDataRequests(baselineContext)

  // Differential proof: reduced motion adds no /data/v1/ request beyond the
  // loader baseline — the overlay path never ran.
  expect(reduceRequests).toEqual(baselineRequests)
  await reduceContext.close()
  await baselineContext.close()
})
