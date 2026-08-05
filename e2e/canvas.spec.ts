import { test, expect, type Page } from '@playwright/test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DWELL_TICKS } from '../lib/viz/driver'
import { CAPS } from '../lib/viz/render/budget'
import { encodeBundle, dayIndex, type BundleInput } from '../lib/bundle/codec'
import { BAND_LOWER_BOUNDS } from '../lib/viz/tokens/level'
import type {
  Actor,
  BundleMeta,
  RepoRecord,
  SortableEvent,
} from '../lib/bundle/schema'

// Deterministic fixture rendered by this suite. Frozen on purpose: it is the
// only payload these baselines may ever be compared against (KW-028's daily
// regeneration would invalidate the live bundle within a day).
const SEED = 1
const EPOCH = new Date('2026-06-01T00:00:00.000Z')
const WINDOW_START = '2024-06-01'
const WINDOW_END = '2026-06-01'
const DAY_COUNT = dayIndex(WINDOW_START, WINDOW_END) + 1 // 731
const TICKS = [0, DWELL_TICKS, DWELL_TICKS + 3600, DWELL_TICKS + 12000] as const
const SNAPSHOT_DIR = join(__dirname, '__screenshots__')
const MAX_BASELINES = 8
const SURFACES = ['overview', 'ribbon'] as const
type SurfaceId = (typeof SURFACES)[number]

const ACTORS: readonly Actor[] = [
  { id: 0, login: 'its-everdred', kind: 'human' },
  { id: 1, login: 'its-applekid', kind: 'agent' },
]

// Repos are dense-id and name-ascending (encodeBundle throws otherwise).
// charlie's `to` is 2025-01-01 (day 214): its 90-day dwell tail ends on day
// 304, before the earliest seeked cursor day (310), so the sim's tail-inclusive
// ghost classification and the DEC-010 `date > to` reading agree at every tick.
const REPOS: readonly RepoRecord[] = [
  {
    id: 0, ghId: 101, name: 'its-everdred/alpha', short: 'alpha', actor: 0,
    vol: 240, stars: 3, from: '2024-06-01', to: '2026-06-01',
    private: false, ext: ['ts'], status: 'ok',
  },
  {
    id: 1, ghId: 102, name: 'its-everdred/bravo', short: 'bravo', actor: 1,
    vol: 120, stars: 0, from: '2025-01-01', to: '2026-06-01',
    private: false, ext: ['css', 'ts'], status: 'ok',
  },
  {
    id: 2, ghId: 103, name: 'its-everdred/charlie', short: 'charlie', actor: 0,
    vol: 60, stars: 31, from: '2024-06-01', to: '2025-01-01',
    private: false, ext: ['md'], status: 'gone',
  },
]

// Every series comes from a pure integer generator: no Math.random, no
// Date.now, no hand-written array of 731 numbers.
const humanSeries = Array.from(
  { length: DAY_COUNT },
  (_, i) => (i * 37 + 11) % 23
)
const agentSeries = Array.from(
  { length: DAY_COUNT },
  (_, i) => (i * 13 + 5) % 17
)
const privateSeries = Array.from({ length: 25 }, (_, i) => (i * 7 + 3) % 9)

const META: BundleMeta = {
  v: 1,
  generatedAt: '2026-06-01T00:00:00Z', // frozen; matches the faked clock
  commit: '0'.repeat(40),
  days: [WINDOW_END, WINDOW_START],
  refs: 'all',
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  dayCount: DAY_COUNT,
  repoCount: REPOS.length,
  repoCountDefinition: 'ownerPublicNonFork',
  actors: ACTORS,
  degraded: [],
}

function buildEvents(): SortableEvent[] {
  const paths = [
    'src/main.ts',
    'src/util.ts',
    'README.md',
    'docs/guide.md',
    'package.json',
  ] as const
  const events: SortableEvent[] = []
  const push = (day: number, repoId: number): void => {
    const repo = REPOS[repoId]!
    events.push({
      day,
      repo: repoId,
      repoName: repo.name,
      sha: `sha-${day}-${repoId}`,
      path: paths[(day + repoId * 5) % paths.length]!,
      actor: repo.actor,
    })
  }
  // The event span must be fully covered: newest day 0 and oldest day 730.
  push(0, 0)
  push(DAY_COUNT - 1, 2)
  for (let i = 0; i < 398; i++) {
    const day = (i * 151 + 3) % DAY_COUNT
    push(day, (i + day) % 3)
  }
  return events
}

const FIXTURE: BundleInput = {
  meta: META,
  repos: REPOS,
  grid: {
    start: WINDOW_START,
    dayCount: DAY_COUNT,
    human: humanSeries,
    agent: agentSeries,
    privateMonthly: privateSeries,
    privateStart: '2024-06',
    bands: [...BAND_LOWER_BOUNDS], // KW-007 owns the band ladder; never inlined
  },
  events: buildEvents(),
}
const ENCODED = encodeBundle(FIXTURE)

/** Structural resolver. `section.kw-instr` is KW-005's; the canvases are KW-025's. */
function surface(page: Page, id: SurfaceId) {
  return page.locator('section.kw-instr canvas').nth(SURFACES.indexOf(id))
}

async function waitForHarness(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await page.evaluate(() => Boolean(window.__viz))) return
    await page.waitForTimeout(100) // real Node-side delay; the page clock is paused
  }
  throw new Error('window.__viz never appeared: the instrument runtime did not boot')
}

/**
 * goto + frozen clock + fixture + harness ready. Every test starts here.
 * The clock is installed before navigation and advanced in bounded increments;
 * the lazy idle-gated harness is awaited with Node-side polling because
 * `waitForFunction` polls through rAF, which the paused clock never fires.
 */
async function boot(page: Page): Promise<void> {
  await page.clock.install({ time: EPOCH })
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort())
  await page.route('**/data/v1/**', async (route) => {
    const key = new URL(route.request().url()).pathname.replace(/^\/data\/v1\//, '')
    const body = ENCODED.files.get(key)
    if (body === undefined) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', body })
  })
  await page.goto(`/?viz-test=1&seed=${SEED}`, { waitUntil: 'domcontentloaded' })
  for (let i = 0; i < 10; i++) await page.clock.runFor(200)
  await waitForHarness(page)
  // The lazy gource island is gated behind IntersectionObserver + rIC; make
  // sure it has been observed and mounted before any canvas is screenshotted.
  const lower = page.locator('.kw-lower')
  if ((await lower.count()) > 0) {
    try {
      await lower.scrollIntoViewIfNeeded()
    } catch {
      /* the layout may already satisfy it */
    }
  }
  for (let i = 0; i < 10; i++) await page.clock.runFor(200)
  await waitForHarness(page)
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.__viz!.pause())
  await page.evaluate(() => window.__viz!.setQuality('high'))
}

function repoByShort(short: string): RepoRecord {
  const repo = REPOS.find((candidate) => candidate.short === short)
  if (repo === undefined) {
    throw new Error(`fixture has no repository named ${short}`)
  }
  return repo
}

test('canvas inventory: three role=img canvases in comp order', async ({
  page,
}) => {
  await boot(page)
  const canvases = page.locator('section.kw-instr canvas')
  await expect(canvases).toHaveCount(3)
  for (let index = 0; index < 3; index++) {
    const canvas = canvases.nth(index)
    await expect(canvas).toHaveAttribute('role', 'img')
    const label = (await canvas.getAttribute('aria-label')) ?? ''
    expect(label.trim().length).toBeGreaterThan(0)
  }
  // Order-independent shape discriminator: overview shorter than the ribbon.
  const heights: number[] = []
  for (const id of SURFACES) {
    const box = await surface(page, id).boundingBox()
    if (box === null) throw new Error(`surface ${id} has no bounding box`)
    heights.push(box.height)
  }
  expect(
    heights[0]! < heights[1]!,
    `canvas order changed — KW-025 reordered the instrument panes (heights ${heights.join(', ')}); regenerate baselines`
  ).toBe(true)
})

test('frame semantics at each tick', async ({ page }) => {
  await boot(page)
  for (const t of TICKS) {
    const info = await page.evaluate((tick) => window.__viz!.seekTick(tick), t)
    expect(info.tick, 'seekTick returns the tick it was asked for').toBe(t)
    expect(info.settled, 'I-D4: screenshots must come from seekTick').toBe(true)
    expect(info.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(info.date >= FIXTURE.meta.windowStart).toBe(true)
    expect(info.date <= FIXTURE.meta.windowEnd).toBe(true)
    // DEC-016: rngState is one 32-bit int, not the viz-runtime 4-tuple.
    expect(Number.isInteger(info.rngState)).toBe(true)
    expect(info.rngState >>> 0).toBe(info.rngState)
    // DEC-010: every listed live repo's [from, to] era contains the cursor date.
    // NOTE: completeness is guarded by filed KW-024 defect #119 (liveRepos is
    // currently always [] on merged main); this relational half becomes
    // meaningful once that fix lands.
    const liveNames = [...info.liveRepos]
    for (let index = 1; index < liveNames.length; index++) {
      expect(liveNames[index]! > liveNames[index - 1]!).toBe(true)
    }
    for (const name of liveNames) {
      const repo = repoByShort(name)
      expect(info.date >= repo.from).toBe(true)
      expect(info.date <= repo.to).toBe(true)
    }
    // DEC-010: ghostRepos counts repos whose era has ended before the cursor.
    const expectedGhost = REPOS.filter((repo) => info.date > repo.to).length
    expect(info.ghostRepos).toBe(expectedGhost)
    // highlightCell is either null or a valid week/weekday cell.
    if (info.highlightCell !== null) {
      expect(Number.isInteger(info.highlightCell.week)).toBe(true)
      expect(info.highlightCell.week).toBeGreaterThanOrEqual(0)
      expect(info.highlightCell.week).toBeLessThanOrEqual(52)
      expect(Number.isInteger(info.highlightCell.weekday)).toBe(true)
      expect(info.highlightCell.weekday).toBeGreaterThanOrEqual(0)
      expect(info.highlightCell.weekday).toBeLessThanOrEqual(6)
    }
    // REQ-010: a renderer spending frames faster fails before a human notices.
    expect(info.drawCalls.total).toBeLessThanOrEqual(CAPS.maxDrawCalls)
    expect(info.drawCalls.total).toBeGreaterThan(0)
    // The setQuality('high') pin: degradation must never move a baseline.
    expect(info.qualityTier).toBe(0)
  }
})

test('dates walk backwards across the rewind', async ({ page }) => {
  await boot(page)
  const dates: string[] = []
  for (const t of TICKS) {
    const info = await page.evaluate((tick) => window.__viz!.seekTick(tick), t)
    dates.push(info.date)
  }
  for (let index = 1; index < dates.length; index++) {
    expect(dates[index]! <= dates[index - 1]!).toBe(true)
  }
  expect(dates[2]! < dates[1]!, 'the rewind must strictly leave the dwell day').toBe(
    true
  )
})

test('baselines match the deterministic fixture frame', async ({ page }) => {
  await boot(page)
  for (let index = 0; index < TICKS.length; index++) {
    const info = await page.evaluate(
      (tick) => window.__viz!.seekTick(tick),
      TICKS[index]!
    )
    // Semantics first: a failure here says what broke, not merely that pixels differ.
    expect(info.settled).toBe(true)
    for (const id of SURFACES) {
      await expect(surface(page, id)).toHaveScreenshot(`${id}-t${index}.png`)
    }
  }
})

test('seek idempotency: seekTick(t) twice is identical (I-D3)', async ({
  page,
}) => {
  await boot(page)
  const a = await page.evaluate((t) => window.__viz!.seekTick(t), TICKS[2]!)
  await page.evaluate((t) => window.__viz!.seekTick(t), TICKS[0]!)
  const b = await page.evaluate((t) => window.__viz!.seekTick(t), TICKS[2]!)
  // Path independence: an intervening seek to another tick must not matter.
  expect(b).toEqual(a)
})

test('double-render canary: same-tick renders are byte-identical', async ({
  page,
}) => {
  await boot(page)
  await page.evaluate((t) => window.__viz!.seekTick(t), TICKS[2]!)
  const first = await surface(page, 'overview').screenshot()
  const second = await surface(page, 'overview').screenshot()
  expect(
    Buffer.compare(first, second),
    'two renders at the same tick differ — if this fails, no other visual ' +
      'result in this suite means anything (KW-024 or KW-022 regression); do ' +
      'not raise a tolerance'
  ).toBe(0)
})

test('backing store honours devicePixelRatio arithmetic', async ({ page }) => {
  await boot(page)
  // desktop-2x runs at deviceScaleFactor 2, so this asserts the arithmetic
  // (css * min(2, dpr)), not the clamp; the dpr-3 clamp is KW-025's own
  // browser-mode Vitest test.
  for (const id of SURFACES) {
    const measured = await surface(page, id).evaluate((el) => {
      const canvas = el as HTMLCanvasElement
      const rect = canvas.getBoundingClientRect()
      return {
        w: canvas.width,
        h: canvas.height,
        cssW: rect.width,
        cssH: rect.height,
        dpr: window.devicePixelRatio,
      }
    })
    expect(measured.w).toBe(Math.round(measured.cssW * Math.min(2, measured.dpr)))
    expect(measured.h).toBe(Math.round(measured.cssH * Math.min(2, measured.dpr)))
  }
})

test('baseline population is exactly twelve real, unLFSd PNGs', async () => {
  const files: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(full)
    }
  }
  if (existsSync(SNAPSHOT_DIR)) walk(SNAPSHOT_DIR)
  // The bound is the shared limit KW-029/KW-030 negotiate against; it must not
  // be an upper bound that accepts zero, so it is asserted exactly.
  expect(files.length).toBe(MAX_BASELINES)
  const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (const file of files) {
    expect(file.endsWith('.png')).toBe(true)
    const head = readFileSync(file).subarray(0, 8)
    expect(
      head.equals(PNG_MAGIC),
      `${file} is a Git LFS pointer, not a real PNG — no LFS on this portfolio site`
    ).toBe(true)
  }
  // No .gitattributes filter may cover the baseline tree.
  const attributesPath = join(process.cwd(), '.gitattributes')
  if (existsSync(attributesPath)) {
    const attributes = readFileSync(attributesPath, 'utf8')
    const lines = attributes.split('\n').filter((line) => line.trim() !== '')
    for (const line of lines) {
      expect(
        line.includes('e2e/__screenshots__'),
        `a .gitattributes filter covers the baselines: ${line.trim()}`
      ).toBe(false)
    }
  }
})
