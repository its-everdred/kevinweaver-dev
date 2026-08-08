import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { dayIndex, decodeManifest, encodeBundle as encodeCodec } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BUNDLE_VERSION } from '../../lib/bundle/schema.ts'
import type { RepoRecord, SortableEvent } from '../../lib/bundle/schema.ts'
import type {
  EncodedBundle,
  EncodeInput,
  RawEvent,
  RepoInput,
} from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extractionRules } from './extract-log.ts'

export function encodeBundle(input: EncodeInput): EncodedBundle {
  if (input.chunkSize !== 1500)
    throw new Error('Scheme D chunk size must be 1,500.')
  const repos = repoRecords(input)
  const days = eventSpan(input.events)
  const windowEnd = dayAt(input.grid.start, input.grid.e.length - 1)
  const encoded = encodeCodec(
    {
      meta: {
        v: BUNDLE_VERSION,
        generatedAt: input.generatedAt,
        commit: input.commit,
        days,
        refs: input.refs,
        windowStart: input.grid.start,
        windowEnd,
        dayCount: input.grid.e.length,
        repoCount: input.repoCount,
        repoCountDefinition: input.repoCountDefinition,
        actors: [
          { id: 0, login: 'its-everdred', kind: 'human' },
          { id: 1, login: 'its-applekid', kind: 'agent' },
        ],
        degraded: input.degraded,
      },
      repos,
      grid: {
        start: input.grid.start,
        dayCount: input.grid.e.length,
        human: input.grid.e,
        agent: input.grid.a,
        privateMonthly: input.grid.p,
        privateStart: input.grid.start.slice(0, 7),
        bands: input.grid.bands,
      },
      events: sortableEvents(input.events, repos, days[0]),
    },
    {
      chunkSize: input.chunkSize,
      maxDictSliceGzipBytes: input.dictSliceGuardGzipBytes,
      gzipSize: (text) => gzipSync(`${text}\n`).byteLength,
      sha256: (text) =>
        `sha256-${createHash('sha256').update(`${text}\n`).digest('hex')}`,
    }
  )
  return {
    manifest: decodeManifest(requiredFile(encoded.files, 'manifest.json')),
    samlCanary: input.samlCanary,
    combinedTotal: input.combinedTotal,
    extractionRules: extractionRules(),
    files: [...encoded.files].map(([path, text]) => ({
      path,
      bytes: Buffer.from(`${text}\n`),
    })),
  }
}
function repoRecords(input: EncodeInput): RepoRecord[] {
  const eventsByRepo = groupEvents(input.events)
  return input.repos
    .filter((repo) => (eventsByRepo.get(repo.n)?.length ?? 0) > 0)
    .sort(compareRepos)
    .map((repo, id) => repoRecord(repo, id, eventsByRepo.get(repo.n)!))
}

function repoRecord(
  repo: RepoInput,
  id: number,
  events: readonly RawEvent[]
): RepoRecord {
  if (repo.private)
    throw new Error('Private repositories cannot enter the bundle.')
  assertBounds(repo, events)
  return {
    id,
    ghId: repo.databaseId,
    name: repo.n,
    short: repo.n.split('/').at(-1) ?? repo.n,
    actor: dominantActor(events),
    vol: events.length,
    stars: repo.stargazerCount,
    from: repo.first,
    to: repo.last,
    private: false,
    ext: extensions(events),
    status: repo.status,
  }
}

function assertBounds(
  repo: RepoInput,
  events: readonly RawEvent[]
): asserts repo is RepoInput & { first: string; last: string } {
  const [first, last] = eventBounds(events)
  if (repo.first === first && repo.last === last) return
  throw new Error(`Repository bounds do not match events: ${repo.n}`)
}

function eventBounds(events: readonly RawEvent[]): [string, string] {
  const first = events[0]
  if (!first) throw new Error('Observed repository has no events.')
  let earliest = first.day
  let latest = first.day
  for (const event of events) {
    if (event.day < earliest) earliest = event.day
    if (event.day > latest) latest = event.day
  }
  return [earliest, latest]
}

function compareRepos(left: RepoInput, right: RepoInput): number {
  if (left.n < right.n) return -1
  if (left.n > right.n) return 1
  return 0
}
function sortableEvents(
  events: readonly RawEvent[],
  repos: readonly RepoRecord[],
  newest: string
): SortableEvent[] {
  const ids = new Map(repos.map((repo) => [repo.name, repo.id]))
  return events.map((event) => ({
    ...event,
    day: dayIndex(event.day, newest),
    repo: requiredId(ids, event.repo),
    repoName: event.repo,
  }))
}
function eventSpan(events: readonly RawEvent[]): [string, string] {
  const first = events[0]
  if (!first) throw new Error('Event stream must not be empty.')
  let newest = first.day
  let oldest = first.day
  for (const event of events) {
    if (event.day > newest) newest = event.day
    if (event.day < oldest) oldest = event.day
  }
  return [newest, oldest]
}
function groupEvents(events: readonly RawEvent[]): Map<string, RawEvent[]> {
  const grouped = new Map<string, RawEvent[]>()
  for (const event of events) {
    const repoEvents = grouped.get(event.repo) ?? []
    repoEvents.push(event)
    grouped.set(event.repo, repoEvents)
  }
  return grouped
}
function dominantActor(events: readonly RawEvent[]): 0 | 1 {
  if (events.length === 0)
    throw new Error('Repository has no events to establish its dominant actor.')
  const agents = events.filter((event) => event.actor === 1).length
  return agents > events.length - agents ? 1 : 0
}
function extensions(events: readonly RawEvent[]): string[] {
  return [
    ...new Set(events.map((event) => extension(event.path)).filter(Boolean)),
  ]
    .sort()
    .slice(0, 8)
}
function extension(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const dot = base.lastIndexOf('.')
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1) : ''
}
function dayAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10)
}
function requiredFile(
  files: ReadonlyMap<string, string>,
  path: string
): string {
  const value = files.get(path)
  if (value === undefined) throw new Error(`Missing bundle resource: ${path}`)
  return value
}
function requiredId(ids: ReadonlyMap<string, number>, repo: string): number {
  const id = ids.get(repo)
  if (id === undefined)
    throw new Error(`Event references unknown repository: ${repo}`)
  return id
}
