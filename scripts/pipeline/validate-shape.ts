import type { DecodedBundle } from '../../lib/bundle/codec.ts'
import type { EncodedBundle } from './encode.ts'
import type { PipelineState } from './state.ts'
import type { Finding, ValidationResources } from './validate-types.ts'
import type { RepoInput } from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BAND_LOWER_BOUNDS } from '../../lib/viz/tokens/level.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { add, sum } from './validate-types.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { countFiles, dayEnd, monthCount, readChunk } from './validate-format.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateColumns } from './validate-chunks.ts'

type Repository = DecodedBundle['repos'][number]

export function validateShape(
  bundle: EncodedBundle,
  resources: ValidationResources,
  findings: Finding[]
): void {
  const grid = resources.decoded?.grid
  const repos = resources.decoded?.repos ?? []
  validateCorpus(bundle, grid, repos, findings)
  validateGrid(bundle, grid, findings)
  validateChunkCount(bundle, resources.files, resources.chunks, findings)
  validateColumns(resources.chunks, resources.slices, repos.length, findings)
  validateCombinedTotal(bundle, grid, findings)
}

export function validateRegression(
  bundle: EncodedBundle,
  prev: PipelineState | null,
  repos: readonly Repository[],
  findings: Finding[]
): void {
  validatePreviousRun(bundle, prev, findings)
  validateRepositoryStatuses(repos, findings)
  validateStaleHistory(prev, repos, findings)
}

function validateCorpus(
  bundle: EncodedBundle,
  grid: DecodedBundle['grid'] | undefined,
  repos: readonly Repository[],
  findings: Finding[]
): void {
  if (
    repos.length >= 40 &&
    bundle.manifest.events >= 40_000 &&
    gridTotal(grid) > 0
  )
    return
  add(findings, 'E_EMPTY', 'Bundle is below the non-empty corpus floor.')
}

function validateGrid(
  bundle: EncodedBundle,
  grid: DecodedBundle['grid'] | undefined,
  findings: Finding[]
): void {
  if (!grid || !gridLengthMatches(bundle, grid))
    add(findings, 'E_GRID_LEN', 'Grid lengths or window bounds are invalid.')
  if (
    grid &&
    grid.privateMonthly.length !==
      monthCount(bundle.manifest.windowStart, bundle.manifest.windowEnd)
  )
    add(findings, 'E_GRID_MONTHS', 'Private aggregate month count is invalid.')
  if (!bandsMatch(grid?.bands))
    add(findings, 'E_GRID_BANDS', 'Grid contribution bands are invalid.')
}

function bandsMatch(bands: readonly number[] | undefined): boolean {
  return (
    bands?.every((value, index) => value === BAND_LOWER_BOUNDS[index]) ?? false
  )
}

function gridLengthMatches(
  bundle: EncodedBundle,
  grid: DecodedBundle['grid']
): boolean {
  return (
    grid.human.length === grid.agent.length &&
    grid.dayCount === bundle.manifest.dayCount &&
    dayEnd(bundle.manifest.windowStart, bundle.manifest.dayCount) ===
      bundle.manifest.windowEnd
  )
}

function validateChunkCount(
  bundle: EncodedBundle,
  files: ReadonlyMap<string, string>,
  chunks: readonly string[],
  findings: Finding[]
): void {
  if (hasExpectedChunks(bundle, files, chunks)) return
  add(findings, 'E_CHUNK_COUNT', 'Chunk count or chunk size is invalid.')
}

function hasExpectedChunks(
  bundle: EncodedBundle,
  files: ReadonlyMap<string, string>,
  chunks: readonly string[]
): boolean {
  return (
    countFiles(files, /^events\/ee-\d+\.json$/) === bundle.manifest.chunks &&
    countFiles(files, /^paths\/pd-\d+\.json$/) === bundle.manifest.chunks &&
    chunks.every(
      (text) =>
        (readChunk(text)?.d.length ?? Infinity) <= bundle.manifest.chunkSize
    )
  )
}

function validateCombinedTotal(
  bundle: EncodedBundle,
  grid: DecodedBundle['grid'] | undefined,
  findings: Finding[]
): void {
  if (bundle.combinedTotal === gridTotal(grid)) return
  add(findings, 'E_REGRESSION', 'Combined total does not match the grid.')
}

function validatePreviousRun(
  bundle: EncodedBundle,
  prev: PipelineState | null,
  findings: Finding[]
): void {
  if (!prev || !regressed(bundle, prev)) return
  add(
    findings,
    'E_REGRESSION',
    'The bundle regressed against the prior successful run.'
  )
}

/**
 * A drop in events means breakage only while both runs extracted by the same
 * rules. Adding one pattern to the vendored list legitimately removed 85.6% of
 * the corpus; the guard read that as a broken run and refused to publish it,
 * which is the correct call on the evidence it had. Comparing the fingerprints
 * gives it the missing evidence, and it re-arms on the very next run because
 * the new fingerprint is written to state either way.
 *
 * The combined total is deliberately still compared: it comes from GitHub's
 * contribution calendar rather than from the file corpus, so no extraction rule
 * can move it and a fall there means something really did break.
 */
function regressed(bundle: EncodedBundle, prev: PipelineState): boolean {
  const comparable = (prev.extractionRules ?? null) === bundle.extractionRules
  return (
    (comparable && bundle.manifest.events < (prev.events ?? 0) * 0.9) ||
    bundle.combinedTotal < (prev.combinedTotal ?? 0)
  )
}

const repositoryStatuses: ReadonlySet<string> = new Set<RepoInput['status']>([
  'ok',
  'stale',
  'gone',
])

function validateRepositoryStatuses(
  repos: readonly Repository[],
  findings: Finding[]
): void {
  if (repos.every((repo) => repositoryStatuses.has(repo.status))) return
  add(findings, 'E_REPO_STATUS', 'A repository has an invalid status.')
}

function validateStaleHistory(
  prev: PipelineState | null,
  repos: readonly Repository[],
  findings: Finding[]
): void {
  if (!prev || !hasLostStaleHistory(prev, repos)) return
  add(findings, 'E_REPO_STATUS', 'A stale repository lost event history.')
}

function hasLostStaleHistory(
  previous: PipelineState,
  repos: readonly Repository[]
): boolean {
  const current = new Map(repos.map((repo) => [repo.name, repo]))
  return Object.entries(previous.repos).some(([name, repo]) => {
    if (repo.events === 0) return false
    if (repo.status !== 'stale' && repo.status !== 'gone') return false
    const retained = current.get(name)
    return !retained || retained.vol < repo.events
  })
}

function gridTotal(grid: DecodedBundle['grid'] | undefined): number {
  return sum(grid?.human) + sum(grid?.agent)
}
