import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeGrid } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readBundleHash } from './encode-hash.ts'
import type { CalendarBundle } from './calendar.ts'
import type { ExtractionPrior } from './extract.ts'
import type { PipelineState } from './state.ts'

/**
 * @description Trusted contribution arrays recovered from a public generation.
 */
export interface PriorGrid {
  start: string
  e: readonly number[]
  a: readonly number[]
  p: readonly number[]
}

/**
 * @description Reads the prior public grid only when it matches persisted state.
 * @param target Public generation directory.
 * @param previous Previously persisted state.
 * @returns The trusted grid, or undefined when no matching generation exists.
 */
export async function readPriorGrid(
  target: string | undefined,
  previous: PipelineState | null
): Promise<PriorGrid | undefined> {
  if (!previous?.bundleHash || !target) return undefined
  try {
    if ((await readBundleHash(target)) !== previous.bundleHash) return undefined
    const grid = decodeGrid(await readFile(join(target, 'grid.json'), 'utf8'))
    return {
      start: grid.start,
      e: grid.human,
      a: grid.agent,
      p: grid.privateMonthly,
    }
  } catch (error) {
    if (isMissing(error)) return undefined
    throw error
  }
}

/**
 * @description Rehydrates calendar data from an already measured public grid.
 * @param grid Trusted prior grid.
 * @returns Calendar data marked as degraded.
 */
export function calendarFromGrid(grid: PriorGrid): CalendarBundle {
  const end = dayAt(grid.start, grid.e.length - 1)
  return {
    source: 'github-graphql',
    generatedAt: '',
    windowStart: grid.start,
    windowEnd: end,
    dayCount: grid.e.length,
    canary: emptyCanary(),
    actors: [
      actor('its-everdred', grid.start, grid.e),
      actor('its-applekid', grid.start, grid.a),
    ],
    combined: grid.e.map((e, index) => ({
      date: dayAt(grid.start, index),
      e,
      a: grid.a[index] ?? 0,
    })),
    combinedTotalNaive: total(grid.e) + total(grid.a),
    combinedTotalDeduplicated: null,
    degraded: ['calendar'],
  }
}

/**
 * @description Reuses only a measured private aggregate after a transient failure.
 * @param grid Trusted prior grid.
 * @returns The degraded private aggregate.
 */
export function privateFromGrid(grid: PriorGrid): {
  p: number[]
  degraded: string[]
} {
  return { p: [...grid.p], degraded: ['private'] }
}

/**
 * @description Creates clone-cache recovery metadata without inventing events.
 * @param state Prior pipeline state.
 * @returns Extraction recovery metadata.
 */
export function extractionPriors(
  state: PipelineState | null
): ExtractionPrior[] {
  return Object.entries(state?.repos ?? {}).map(([n, repo]) => ({
    n,
    consecutiveFailures: repo.consecutiveFailures,
    lastOk: repo.lastOk,
    heads: { ...repo.heads },
  }))
}

/**
 * @description Produces the union of current discovery and retained state names.
 * @param discovered Current discovered names.
 * @param state Prior pipeline state.
 * @returns Canonically ordered names for extraction.
 */
export function extractionNames(
  discovered: readonly string[],
  state: PipelineState | null
): string[] {
  return [
    ...new Set([...discovered, ...Object.keys(state?.repos ?? {})]),
  ].sort()
}

function actor(
  login: 'its-everdred' | 'its-applekid',
  start: string,
  values: readonly number[]
) {
  const yearTotals: Record<string, number> = {}
  const days = values.map((count, index) => ({
    date: dayAt(start, index),
    count,
  }))
  days.forEach((day) => {
    const year = day.date.slice(0, 4)
    yearTotals[year] = (yearTotals[year] ?? 0) + day.count
  })
  return { login, yearTotals, days }
}

function dayAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function emptyCanary() {
  return {
    ok: false,
    probeRepository: 'ethereum-optimism/actions',
    sawRepository: false,
    sawOrgContribution: false,
    window: null,
    checkedAt: '',
    detail: 'recovered calendar',
  }
}

function total(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0)
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
