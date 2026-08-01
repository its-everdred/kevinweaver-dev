import { brotliCompressSync, gzipSync } from 'node:zlib'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { chunkFileName, dictFileName } from '../../lib/bundle/schema.ts'
// prettier-ignore
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { decodeBundle, decodeChunk, decodeDictSlice } from '../../lib/bundle/codec.ts'
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

/** Validates a fully encoded Scheme D bundle before it can be promoted. */
export function validateBundle(
  bundle: EncodedBundle,
  prev: PipelineState | null
): ValidationResult {
  const findings: Finding[] = []
  const fileMap = new Map(
    bundle.files.map((file) => [
      file.path,
      Buffer.from(file.bytes).toString('utf8').trimEnd(),
    ])
  )
  const manifest = bundle.manifest
  let decoded
  try {
    decoded = decodeBundle(fileMap)
  } catch (error: unknown) {
    add(
      findings,
      'E_ROUNDTRIP',
      error instanceof Error ? error.message : 'Bundle decode failed'
    )
  }
  const repos = decoded?.repos ?? []
  const grid = decoded?.grid
  const chunks = chunkTexts(fileMap, manifest.chunks, 'events', chunkFileName)
  const slices = chunkTexts(fileMap, manifest.chunks, 'paths', dictFileName)
  const eventFileCount = countFiles(fileMap, /^events\/ee-\d+\.json$/)
  const pathFileCount = countFiles(fileMap, /^paths\/pd-\d+\.json$/)
  const firstByteBrotliBytes = brotliSize(firstByteFiles(fileMap))
  const maxDictSliceGzipBytes = Math.max(
    0,
    ...slices.map((slice) => gzipSync(slice).byteLength)
  )
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
    eventFileCount !== manifest.chunks ||
    pathFileCount !== manifest.chunks ||
    chunks.length !== manifest.chunks ||
    chunks.some((text) => {
      const chunk = decodeSafely(text, decodeChunk)
      return chunk === undefined || chunk.d.length > manifest.chunkSize
    })
  )
    add(findings, 'E_CHUNK_COUNT', 'Chunk count or chunk size is invalid.')
  let dictionaryLength = 0
  let previousLast = -1
  chunks.forEach((text, index) => {
    const chunk = decodeSafely(text, decodeChunk)
    const slice = decodeSafely(slices[index] ?? '', decodeDictSlice)
    if (!chunk || !slice) {
      add(findings, 'E_JSON', `Invalid JSON resource at chunk ${index}.`)
      return
    }
    dictionaryLength += slice.paths.length
    if (
      chunk.d.length !== chunk.r.length ||
      chunk.d.length !== chunk.p.length ||
      chunk.d.length !== chunk.a.length
    )
      add(findings, 'E_COLUMNS', `Chunk ${index} columns differ in length.`)
    if (chunk.d.some((delta) => delta < 0))
      add(findings, 'E_DELTA', `Chunk ${index} has a negative day delta.`)
    if (chunk.p.some((path) => path >= dictionaryLength))
      add(
        findings,
        'E_PATH_RANGE',
        `Chunk ${index} references an unavailable path.`
      )
    if (
      chunk.r.some((repo) => repo >= repos.length) ||
      chunk.a.some((actor) => actor !== 0 && actor !== 1)
    )
      add(
        findings,
        'E_REPO_RANGE',
        `Chunk ${index} has an invalid repository or actor.`
      )
    const last = chunk.b + sum(chunk.d)
    if (chunk.b < previousLast)
      add(findings, 'E_CHUNK_BASE', `Chunk ${index} is not monotonic.`)
    previousLast = last
  })
  if (maxDictSliceGzipBytes > 12_288)
    add(
      findings,
      'E_DICT_GUARD',
      'A dictionary slice exceeds 12,288 gzip bytes.'
    )
  if (firstByteBrotliBytes > 12_288)
    add(
      findings,
      'E_FIRST_BYTE',
      'The first-byte payload exceeds 12,288 brotli bytes.'
    )
  if (
    prev &&
    ((typeof prev.events === 'number' && manifest.events < prev.events * 0.9) ||
      (typeof prev.combinedTotal === 'number' &&
        bundle.combinedTotal < prev.combinedTotal))
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
  if (!bundle.samlCanary.ok || manifest.degraded.includes('calendar'))
    add(findings, 'E_SAML', 'SAML canary or calendar availability failed.')
  return {
    ok: findings.length === 0,
    findings,
    firstByteBrotliBytes,
    maxDictSliceGzipBytes,
    chunkCount: manifest.chunks,
    eventCount: manifest.events,
  }
}

function add(findings: Finding[], code: string, message: string): void {
  findings.push({ code, severity: 'error', message })
}
function sum(values: readonly number[] | undefined): number {
  return values?.reduce((total, value) => total + value, 0) ?? 0
}
function chunkTexts(
  map: ReadonlyMap<string, string>,
  count: number,
  folder: string,
  name: (index: number) => string
): string[] {
  return Array.from(
    { length: count },
    (_, index) => map.get(name(index)) ?? `{ "missing": "${folder}" }`
  )
}
function countFiles(map: ReadonlyMap<string, string>, pattern: RegExp): number {
  return [...map.keys()].filter((path) => pattern.test(path)).length
}
function decodeSafely<T>(
  text: string,
  decoder: (text: string) => T
): T | undefined {
  try {
    return decoder(text)
  } catch {
    return undefined
  }
}
function firstByteFiles(map: ReadonlyMap<string, string>): Buffer {
  return Buffer.from(
    [
      'manifest.json',
      'repos.json',
      'grid.json',
      'events/ee-00.json',
      'paths/pd-00.json',
    ]
      .map((name) => map.get(name) ?? '')
      .join('')
  )
}
function brotliSize(bytes: Buffer): number {
  return brotliCompressSync(bytes).byteLength
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
