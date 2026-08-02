import { createHash } from 'node:crypto'
import { brotliCompressSync, gzipSync } from 'node:zlib'

// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeBundle, decodeDictSlice } from '../../lib/bundle/codec.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { FIRST_BYTE_BROTLI_BUDGET_BYTES, MAX_DICT_SLICE_GZIP_BYTES, chunkFileName, dictFileName } from '../../lib/bundle/schema.ts'
import type { EncodedBundle } from './encode.ts'
import type { PipelineState } from './state.ts'

export type Severity = 'error' | 'warn'
export interface Finding {
  code: string
  severity: Severity
  message: string
}
export interface ValidationResult {
  ok: boolean
  findings: readonly Finding[]
  firstByteBrotliBytes: number
  maxDictSliceGzipBytes: number
  chunkCount: number
  eventCount: number
}
interface ChunkColumns {
  b: number
  d: readonly number[]
  r: readonly number[]
  p: readonly number[]
  a: readonly number[]
}

/** Validates every pre-promotion Scheme D invariant and reports measured budgets. */
export function validateBundle(
  bundle: EncodedBundle,
  prev: PipelineState | null
): ValidationResult {
  const findings: Finding[] = []
  const files = new Map(
    bundle.files.map((file) => [
      file.path,
      new TextDecoder().decode(file.bytes),
    ])
  )
  const decoded = decode(files, findings)
  const chunks = numbered(files, bundle.manifest.chunks, chunkFileName)
  const slices = numbered(files, bundle.manifest.chunks, dictFileName)
  const firstByteBrotliBytes = brotliCompressSync(
    Buffer.from(firstByte(files))
  ).byteLength
  const maxDictSliceGzipBytes = Math.max(
    0,
    ...slices.map((slice) => gzipSync(slice).byteLength)
  )
  validateJson(files, findings)
  validateIntegrity(bundle.manifest.integrity, files, findings)
  validateBundleShape(bundle, files, decoded, chunks, slices, findings)
  validateRegression(bundle, prev, decoded?.repos ?? [], findings)
  if (maxDictSliceGzipBytes > MAX_DICT_SLICE_GZIP_BYTES)
    add(
      findings,
      'E_DICT_GUARD',
      'A dictionary slice exceeds 12,288 gzip bytes.'
    )
  if (firstByteBrotliBytes > FIRST_BYTE_BROTLI_BUDGET_BYTES)
    add(
      findings,
      'E_FIRST_BYTE',
      'The first-byte payload exceeds 12,288 brotli bytes.'
    )
  if (!bundle.samlCanary.ok || bundle.manifest.degraded.includes('calendar'))
    add(findings, 'E_SAML', 'SAML canary or calendar availability failed.')
  return {
    ok: findings.length === 0,
    findings,
    firstByteBrotliBytes,
    maxDictSliceGzipBytes,
    chunkCount: bundle.manifest.chunks,
    eventCount: bundle.manifest.events,
  }
}

function decode(files: ReadonlyMap<string, string>, findings: Finding[]) {
  try {
    return decodeBundle(files)
  } catch (error: unknown) {
    add(
      findings,
      'E_ROUNDTRIP',
      error instanceof Error ? error.message : 'Bundle decode failed'
    )
    return undefined
  }
}

function validateBundleShape(
  bundle: EncodedBundle,
  files: ReadonlyMap<string, string>,
  decoded: ReturnType<typeof decodeBundle> | undefined,
  chunks: readonly string[],
  slices: readonly string[],
  findings: Finding[]
): void {
  const manifest = bundle.manifest
  const grid = decoded?.grid
  const repos = decoded?.repos ?? []
  if (
    repos.length < 40 ||
    manifest.events < 40_000 ||
    sum(grid?.human) + sum(grid?.agent) <= 0
  )
    add(findings, 'E_EMPTY', 'Bundle is below the non-empty corpus floor.')
  if (
    !grid ||
    grid.human.length !== grid.agent.length ||
    grid.dayCount !== manifest.dayCount ||
    dayEnd(manifest.windowStart, manifest.dayCount) !== manifest.windowEnd
  )
    add(findings, 'E_GRID_LEN', 'Grid lengths or window bounds are invalid.')
  if (
    grid &&
    grid.privateMonthly.length !==
      monthCount(manifest.windowStart, manifest.windowEnd)
  )
    add(findings, 'E_GRID_MONTHS', 'Private aggregate month count is invalid.')
  if (
    countFiles(files, /^events\/ee-\d+\.json$/) !== manifest.chunks ||
    countFiles(files, /^paths\/pd-\d+\.json$/) !== manifest.chunks ||
    chunks.some(
      (text) => (readChunk(text)?.d.length ?? Infinity) > manifest.chunkSize
    )
  )
    add(findings, 'E_CHUNK_COUNT', 'Chunk count or chunk size is invalid.')
  validateColumns(chunks, slices, repos.length, findings)
  if (bundle.combinedTotal !== sum(grid?.human) + sum(grid?.agent))
    add(findings, 'E_REGRESSION', 'Combined total does not match the grid.')
}

function validateColumns(
  chunks: readonly string[],
  slices: readonly string[],
  repoCount: number,
  findings: Finding[]
): void {
  let dictionaryLength = 0
  let previousLast = -1
  chunks.forEach((text, index) => {
    const chunk = readChunk(text)
    const slice = readSlice(slices[index] ?? '')
    if (!chunk || !slice) {
      add(findings, 'E_JSON', `Invalid resource at chunk ${index}.`)
      return
    }
    dictionaryLength += slice.paths.length
    if (
      chunk.d.length !== chunk.r.length ||
      chunk.d.length !== chunk.p.length ||
      chunk.d.length !== chunk.a.length
    )
      add(findings, 'E_COLUMNS', `Chunk ${index} columns differ in length.`)
    if (chunk.d.some((value) => value < 0))
      add(findings, 'E_DELTA', `Chunk ${index} has a negative day delta.`)
    if (chunk.d.length > 0 && chunk.d[0] !== 0)
      add(findings, 'E_CHUNK_BASE', `Chunk ${index} base is not its first day.`)
    if (chunk.p.some((value) => value < 0 || value >= dictionaryLength))
      add(
        findings,
        'E_PATH_RANGE',
        `Chunk ${index} references an unavailable path.`
      )
    if (
      chunk.r.some((value) => value < 0 || value >= repoCount) ||
      chunk.a.some((value) => value !== 0 && value !== 1)
    )
      add(
        findings,
        'E_REPO_RANGE',
        `Chunk ${index} has an invalid repository or actor.`
      )
    if (chunk.b < previousLast)
      add(findings, 'E_CHUNK_BASE', `Chunk ${index} is not monotonic.`)
    previousLast = chunk.b + sum(chunk.d)
  })
}

function validateRegression(
  bundle: EncodedBundle,
  prev: PipelineState | null,
  repos: readonly { name: string; status: string; vol: number }[],
  findings: Finding[]
): void {
  if (
    prev &&
    (bundle.manifest.events < (prev.events ?? 0) * 0.9 ||
      bundle.combinedTotal < (prev.combinedTotal ?? 0))
  )
    add(
      findings,
      'E_REGRESSION',
      'The bundle regressed against the prior successful run.'
    )
  if (
    repos.some(
      (repo) =>
        repo.status !== 'ok' &&
        repo.status !== 'stale' &&
        repo.status !== 'gone'
    )
  )
    add(findings, 'E_REPO_STATUS', 'A repository has an invalid status.')
  if (
    prev &&
    repos.some(
      (repo) =>
        repo.status === 'stale' &&
        repo.vol < (prev.repos[repo.name]?.events ?? 0)
    )
  )
    add(findings, 'E_REPO_STATUS', 'A stale repository lost event history.')
}

function numbered(
  files: ReadonlyMap<string, string>,
  count: number,
  name: (index: number) => string
): string[] {
  return Array.from(
    { length: count },
    (_, index) => files.get(name(index)) ?? ''
  )
}
function countFiles(
  files: ReadonlyMap<string, string>,
  pattern: RegExp
): number {
  return [...files.keys()].filter((path) => pattern.test(path)).length
}
function add(findings: Finding[], code: string, message: string): void {
  findings.push({ code, severity: 'error', message })
}
function sum(values: readonly number[] | undefined): number {
  return values?.reduce((total, value) => total + value, 0) ?? 0
}
function readSlice(text: string) {
  try {
    return decodeDictSlice(text)
  } catch {
    return undefined
  }
}
function readChunk(text: string): ChunkColumns | undefined {
  const value = record(text)
  if (!value) return undefined
  const b = integer(value.b)
  const d = numbers(value.d)
  const r = numbers(value.r)
  const p = numbers(value.p)
  const a = numbers(value.a)
  return b === undefined || !d || !r || !p || !a ? undefined : { b, d, r, p, a }
}
function validateJson(
  files: ReadonlyMap<string, string>,
  findings: Finding[]
): void {
  if ([...files.values()].some((text) => !recordOrArray(text)))
    add(findings, 'E_JSON', 'A bundle resource is not valid JSON.')
}

function validateIntegrity(
  integrity: Readonly<Record<string, string>>,
  files: ReadonlyMap<string, string>,
  findings: Finding[]
): void {
  Object.entries(integrity).forEach(([path, expected]) => {
    const text = files.get(path)
    const actual = text
      ? `sha256-${createHash('sha256').update(text).digest('hex')}`
      : undefined
    if (actual !== expected)
      add(findings, 'E_ROUNDTRIP', `Integrity mismatch for ${path}.`)
  })
}
function recordOrArray(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}
function record(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined
}
function numbers(value: unknown): number[] | undefined {
  return Array.isArray(value) &&
    value.every((entry) => integer(entry) !== undefined)
    ? value
    : undefined
}
function firstByte(files: ReadonlyMap<string, string>): string {
  return [
    'manifest.json',
    'repos.json',
    'grid.json',
    'events/ee-00.json',
    'paths/pd-00.json',
  ]
    .map((path) => files.get(path) ?? '')
    .join('')
}
function dayEnd(start: string, count: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + (count - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10)
}
function monthCount(start: string, end: string): number {
  return (
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7)) +
    1
  )
}
