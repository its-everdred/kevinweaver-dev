import type { EncodeInput, RawEvent, RepoInput } from './encode-types.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { currentSecond, loadStage, requiredCommit, requiredToken } from './encode-stage-runtime.ts'

type Client = <T>(
  query: string,
  variables?: Record<string, unknown>
) => Promise<T>
type Calendar = {
  windowStart: string
  windowEnd: string
  canary: { ok: boolean; checkedAt: string }
  combined: readonly { date: string; e: number; a: number }[]
  degraded: readonly string[]
}
type Private = { p: readonly number[]; degraded: readonly string[] }
type Discovery = {
  repos: readonly {
    nameWithOwner: string
    databaseId: number
    stargazerCount: number
    isPrivate: boolean
  }[]
  repoCountDefinition: {
    count: number
    definition: EncodeInput['repoCountDefinition']
  }
}
type Extraction = {
  events: readonly (RawEvent & { authorDate: string })[]
  repos: readonly {
    n: string
    first: string
    last: string
    private: false
    status: RepoInput['status']
  }[]
}

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
  const create = await loadStage<(value: string) => Client>(
    './calendar.ts',
    'createContribClient'
  )
  return create(token)
}

async function calendarFor(client: Client): Promise<Calendar> {
  const fetch = await loadStage<(value: Client) => Promise<Calendar>>(
    './calendar.ts',
    'fetchCalendarBundle'
  )
  return fetch(client)
}

async function privateFor(client: Client, start: string): Promise<Private> {
  const fetch = await loadStage<
    (value: Client, options: { pStart: string }) => Promise<Private>
  >('./private.ts', 'fetchPrivateAggregate')
  return fetch(client, { pStart: start.slice(0, 7) })
}

async function discoveryFor(
  client: Client,
  calendar: Calendar
): Promise<Discovery> {
  const discover = await loadStage<
    (
      value: Client,
      options: {
        logins: readonly ['its-everdred', 'its-applekid']
        fromYear: number
        toYear: number
      }
    ) => Promise<Discovery>
  >('./discover.ts', 'discoverRepos')
  return discover(client, {
    logins: ['its-everdred', 'its-applekid'],
    fromYear: year(calendar.windowStart),
    toYear: year(calendar.windowEnd),
  })
}

async function extractionFor(discovery: Discovery): Promise<Extraction> {
  const extract = await loadStage<
    (repos: readonly string[], prior: readonly []) => Promise<Extraction>
  >('./extract.ts', 'extractAll')
  return extract(
    discovery.repos.map((repo) => repo.nameWithOwner),
    []
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
    events: extraction.events.map(event),
    repos: discovery.repos.map((repo) =>
      repoInput(repo, extracted.get(repo.nameWithOwner))
    ),
    grid: {
      start: calendar.windowStart,
      e: grid.map((day) => day.e),
      a: grid.map((day) => day.a),
      p: privateAggregate.p,
      bands: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
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

function event(event: RawEvent & { authorDate: string }): RawEvent {
  return {
    day: event.day,
    repo: event.repo,
    sha: event.sha,
    path: event.path,
    actor: event.actor,
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
