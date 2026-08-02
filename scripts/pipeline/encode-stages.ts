import type { EncodeInput, RepoInput } from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { SamlCanaryError } from './calendar.ts'
import type { CalendarBundle, GraphqlRequest } from './calendar.ts'
import type { DiscoveryResult } from './discover.ts'
import type { ExtractResult } from './extract.ts'
import type { PrivateAggregate } from './private.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BAND_LOWER_BOUNDS } from '../../lib/viz/tokens/level.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { currentSecond, loadStage, PipelineAvailabilityError, requiredCommit, requiredToken } from './encode-stage-runtime.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { sortedHeads } from './encode-heads.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import * as stageAdapters from './encode-stage-adapters.ts'

type Client = GraphqlRequest
type Calendar = CalendarBundle
type Private = PrivateAggregate
type Discovery = DiscoveryResult
type Extraction = ExtractResult

export async function resolveStages(): Promise<EncodeInput> {
  const token = requiredToken()
  const client = await clientFor(token)
  const calendar = await calendarFor(client)
  const privateAggregate = await privateFor(client, calendar.windowStart)
  const discovery = await discoveryFor(client, calendar)
  const extraction = await extractionFor(discovery)
  return assembleInput(calendar, privateAggregate, discovery, extraction)
}

async function clientFor(token: string): Promise<Client> {
  const create = await loadStage('./calendar.ts', 'createContribClient')
  return stageAdapters.clientValue(create(token))
}

async function calendarFor(client: Client): Promise<Calendar> {
  const fetch = await loadStage('./calendar.ts', 'fetchCalendarBundle')
  try {
    return stageAdapters.calendarValue(await fetch(client))
  } catch (error) {
    if (error instanceof SamlCanaryError)
      throw new PipelineAvailabilityError(
        'SAML canary refused the calendar.',
        error
      )
    throw error
  }
}

async function privateFor(client: Client, start: string): Promise<Private> {
  const fetch = await loadStage('./private.ts', 'fetchPrivateAggregate')
  return stageAdapters.privateValue(
    await fetch(client, { pStart: start.slice(0, 7) })
  )
}

async function discoveryFor(
  client: Client,
  calendar: Calendar
): Promise<Discovery> {
  const discover = await loadStage('./discover.ts', 'discoverRepos')
  return stageAdapters.discoveryValue(
    await discover(client, {
      logins: ['its-everdred', 'its-applekid'],
      fromYear: year(calendar.windowStart),
      toYear: year(calendar.windowEnd),
    })
  )
}

async function extractionFor(discovery: Discovery): Promise<Extraction> {
  const extract = await loadStage('./extract.ts', 'extractAll')
  return stageAdapters.extractionValue(
    await extract(
      discovery.repos.map((repo) => repo.nameWithOwner),
      []
    )
  )
}

function assembleInput(
  calendar: Calendar,
  privateAggregate: Private,
  discovery: Discovery,
  extraction: Extraction
): EncodeInput {
  const extracted = new Map(extraction.repos.map((repo) => [repo.n, repo]))
  const grid = calendar.combined
  return {
    events: extraction.events,
    repos: discovery.repos.map((repo) =>
      repoInput(repo, extracted.get(repo.nameWithOwner))
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

function repoInput(
  repo: Discovery['repos'][number],
  extracted: Extraction['repos'][number] | undefined
): RepoInput {
  if (!extracted)
    throw new Error(`Missing extraction result: ${repo.nameWithOwner}`)
  return {
    n: repo.nameWithOwner,
    databaseId: repo.databaseId,
    stargazerCount: repo.stargazerCount,
    heads: sortedHeads(extracted.heads),
    first: extracted.first || undefined,
    last: extracted.last || undefined,
    private: repo.isPrivate,
    status: extracted.status,
  }
}

function degraded(
  ...sources: readonly (readonly string[] | Extraction['repos'])[]
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

function year(day: string): number {
  return Number(day.slice(0, 4))
}
