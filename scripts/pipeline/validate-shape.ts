import type { DecodedBundle } from '../../lib/bundle/codec.ts'
import type { EncodedBundle } from './encode.ts'
import type { PipelineState } from './state.ts'
import type { Finding } from './validate-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { add, sum } from './validate-types.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { countFiles, dayEnd, monthCount, readChunk, readSlice } from './validate-format.ts'
export function validateShape(
  bundle: EncodedBundle,
  files: ReadonlyMap<string, string>,
  decoded: DecodedBundle | undefined,
  chunks: readonly string[],
  slices: readonly string[],
  findings: Finding[]
): void {
  const { manifest } = bundle
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
export function validateRegression(
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
  if (repos.some((repo) => !['ok', 'stale', 'gone'].includes(repo.status)))
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
