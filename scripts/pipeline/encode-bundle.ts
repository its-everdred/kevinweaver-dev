import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { dayIndex, decodeManifest, encodeBundle as encodeCodec } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BUNDLE_VERSION } from '../../lib/bundle/schema.ts'
import type { RepoRecord, SortableEvent } from '../../lib/bundle/schema.ts'
import type { EncodedBundle, EncodeInput, RawEvent } from './encode-types.ts'

export function encodeBundle(input: EncodeInput): EncodedBundle {
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
    files: [...encoded.files].map(([path, text]) => ({
      path,
      bytes: Buffer.from(`${text}\n`),
    })),
  }
}
function repoRecords(input: EncodeInput): RepoRecord[] {
  if (input.repoCount !== input.repos.length)
    throw new Error('Repo count does not match repositories.')
  const counts = eventCounts(input.events)
  return [...input.repos]
    .sort((a, b) => a.n.localeCompare(b.n))
    .map((repo, id) => {
      if (repo.private)
        throw new Error('Private repositories cannot enter the bundle.')
      const events = input.events.filter((event) => event.repo === repo.n)
      return {
        id,
        ghId: repo.databaseId,
        name: repo.n,
        short: repo.n.split('/').at(-1) ?? repo.n,
        actor: dominantActor(events),
        vol: counts.get(repo.n) ?? 0,
        stars: repo.stargazerCount,
        from: repo.first,
        to: repo.last,
        private: false,
        ext: extensions(events),
        status: repo.status,
      }
    })
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
function eventCounts(events: readonly RawEvent[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const event of events)
    counts.set(event.repo, (counts.get(event.repo) ?? 0) + 1)
  return counts
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
