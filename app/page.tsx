// app/page.tsx — KW-032 final composition.
// Server Component. No 'use client'. No named exports (see I-1).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { IDENTITY } from '@/content/identity'

import { BootOverlay } from './regions/BootOverlay'
import { CareerLog } from './regions/CareerLog'
import { Contact } from './regions/Contact'
import { Header, type HeaderFreshness } from './regions/Header'
import { Instrument } from './regions/Instrument'
import { ManPage } from './regions/ManPage'
import { TmuxBar } from './regions/TmuxBar'

/** Repo-relative. Next serves public/ at the site root: /data/v1/manifest.json. */
const MANIFEST_PATH = 'public/data/v1/manifest.json'

/** One missed daily run of headroom over DEC-017's `17 6 * * *` schedule. */
const FRESH_WINDOW_MS = 36 * 60 * 60 * 1000

type ManifestFreshnessFields = {
  readonly generatedAt?: unknown
  readonly degraded?: unknown
}

/** Never throws. Returns null when the bundle is not generated yet — the normal
 *  state of a fresh clone and of any branch built before KW-028's first run. */
async function readManifest(): Promise<ManifestFreshnessFields | null> {
  try {
    const raw = await readFile(join(process.cwd(), MANIFEST_PATH), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as ManifestFreshnessFields)
      : null
  } catch {
    return null
  }
}

/** '2026-07-31T06:17:00Z' -> '2026-07-31 06:17:00 UTC'. No Intl, no locale. */
function stampUtc(iso: string): string {
  return `${iso.replace('T', ' ').replace(/(\.\d+)?Z$/, '')} UTC`
}

/** Pure. `builtAtMs` is the prerender clock — this route is static, so it is the
 *  build clock, never a request clock. See I-3 for why the label is bucketed. */
function composeFreshness(
  manifest: ManifestFreshnessFields | null,
  builtAtMs: number
): HeaderFreshness | undefined {
  const generatedAt = manifest?.generatedAt
  if (typeof generatedAt !== 'string') return undefined

  const generatedMs = Date.parse(generatedAt)
  if (Number.isNaN(generatedMs)) return undefined

  const description = `data regenerated ${stampUtc(generatedAt)}`

  // Read into a local first: narrowing `manifest?.degraded` with Array.isArray
  // does NOT narrow the later `manifest.degraded`, and `manifest` is nullable —
  // the short way is a strict-null-checks error.
  const rawDegraded = manifest?.degraded
  const degraded = Array.isArray(rawDegraded)
    ? rawDegraded.filter(
        (s): s is string => typeof s === 'string' && s.length > 0
      )
    : []

  if (degraded.length > 0) {
    return {
      label: 'partial',
      tone: 'static',
      description: `${description}; ${degraded.join(', ')} reused from cache`,
    }
  }

  const age = builtAtMs - generatedMs
  return age < FRESH_WINDOW_MS
    ? { label: 'fresh', tone: 'fresh', description }
    : { label: 'stale', tone: 'stale', description }
}

/** GATE-005 (c): `title` is operator-supplied. Empty means render the name alone. */
function pageHeading(): string {
  const title = IDENTITY.title.trim()
  return title.length > 0 ? `${IDENTITY.name} — ${title}` : IDENTITY.name
}

export default async function Page() {
  // Static prerender: Date.now() is the build clock (I-3), not a re-render hazard —
  // / has no client boundary, no state, and this value is baked into the HTML once.
  // eslint-disable-next-line react-hooks/purity
  const freshness = composeFreshness(await readManifest(), Date.now())

  return (
    <>
      <a className="skip sr-only" href="#arc">
        skip the animation
      </a>
      <Header freshness={freshness} />
      <main className="kw-pad">
        <h1 className="sr-only">{pageHeading()}</h1>
        <Instrument />
        <div className="kw-man-log">
          <ManPage />
          <div className="kw-log-col">
            <CareerLog />
            <Contact />
          </div>
        </div>
      </main>
      <TmuxBar />
      <BootOverlay />
    </>
  )
}
