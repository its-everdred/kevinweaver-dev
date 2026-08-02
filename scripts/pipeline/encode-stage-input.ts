import type { EncodeInput, RepoInput } from './encode-types.ts'
import type { CalendarBundle } from './calendar.ts'
import type { DiscoveredRepo, DiscoveryResult } from './discover.ts'
import type { ExtractResult } from './extract.ts'
import type { PrivateAggregate } from './private.ts'
import type { PipelineState, RepoPipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BAND_LOWER_BOUNDS } from '../../lib/viz/tokens/level.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { currentSecond, requiredCommit } from './encode-stage-runtime.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { sortedHeads } from './encode-heads.ts'

type Private = Pick<PrivateAggregate, 'p' | 'degraded'>

/** Combines verified stage outputs into the fixed encoder input contract. */
export function assembleInput(
  calendar: CalendarBundle,
  privateAggregate: Private,
  discovery: DiscoveryResult,
  extraction: ExtractResult,
  previous: PipelineState | null
): EncodeInput {
  const known = new Map(
    discovery.repos.map((repo) => [repo.nameWithOwner, repo])
  )
  const grid = calendar.combined
  return {
    events: extraction.events,
    repos: extraction.repos.flatMap((repo) =>
      publicRepo(repo.n, known.get(repo.n), repo, previous?.repos[repo.n])
    ),
    grid: {
      start: calendar.windowStart,
      e: grid.map((day) => day.e),
      a: grid.map((day) => day.a),
      p: privateAggregate.p,
      bands: BAND_LOWER_BOUNDS,
    },
    combinedTotal: grid.reduce((total, day) => total + day.e + day.a, 0),
    generatedAt: currentSecond(),
    commit: requiredCommit(),
    repoCount: discovery.repoCountDefinition.count,
    repoCountDefinition: discovery.repoCountDefinition.definition,
    refs: 'all',
    chunkSize: 1500,
    dictSliceGuardGzipBytes: 12_288,
    samlCanary: {
      ok: calendar.canary.ok,
      org: 'ethereum-optimism',
      checkedAt: calendar.canary.checkedAt,
    },
    degraded: degraded(
      calendar.degraded,
      privateAggregate.degraded,
      extraction.repos
    ),
  }
}

function publicRepo(
  name: string,
  current: DiscoveredRepo | undefined,
  extracted: ExtractResult['repos'][number],
  prior: RepoPipelineState | undefined
): RepoInput[] {
  const databaseId = current?.databaseId ?? prior?.databaseId
  const stargazerCount = current?.stargazerCount ?? prior?.stargazerCount
  if (!databaseId || stargazerCount === undefined) return []
  return [
    {
      n: name,
      databaseId,
      stargazerCount,
      heads: sortedHeads(extracted.heads),
      first: extracted.first || undefined,
      last: extracted.last || undefined,
      private: current?.isPrivate ?? false,
      status:
        extracted.status === 'stale' && extracted.consecutiveFailures >= 7
          ? 'gone'
          : extracted.status,
    },
  ]
}

function degraded(
  ...sources: readonly (readonly string[] | ExtractResult['repos'])[]
): EncodeInput['degraded'] {
  const values = new Set(
    sources.flatMap((source) =>
      source.map((value) =>
        typeof value === 'string'
          ? value
          : value.status === 'ok'
            ? ''
            : 'events'
      )
    )
  )
  return [...values].filter(
    (value): value is EncodeInput['degraded'][number] =>
      value === 'calendar' || value === 'private' || value === 'events'
  )
}
