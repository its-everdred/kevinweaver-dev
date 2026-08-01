import { describe, expect, it } from 'vitest'
import { encodeBundle } from './codec'
import type { BundleInput } from './codec'
import {
  BUNDLE_VERSION,
  type ActorId,
  type RepoRecord,
  type SortableEvent,
} from './schema'
import {
  BundleLoadError,
  createBundleLoader,
  FIRST_BYTE_FILE_COUNT,
} from './loader'

const actors = [
  { id: 0 as const, login: 'its-everdred', kind: 'human' as const },
  { id: 1 as const, login: 'its-applekid', kind: 'agent' as const },
]

describe('bundle loader', () => {
  it('boots from five files and prefetches at 60 percent', async () => {
    const files = new Map(encodeBundle(fixture(), { chunkSize: 3 }).files)
    const requests: string[] = []
    const loader = createBundleLoader({ fetchImpl: stubFetch(files, requests) })

    const head = await loader.boot()
    expect(FIRST_BYTE_FILE_COUNT).toBe(5)
    expect(requests).toHaveLength(5)
    expect(new Set(requests)).toEqual(
      new Set([
        '/data/v1/manifest.json',
        '/data/v1/repos.json',
        '/data/v1/grid.json',
        '/data/v1/events/ee-00.json',
        '/data/v1/paths/pd-00.json',
      ])
    )
    expect(head.events).toHaveLength(3)
    expect(loader.take(1)).toHaveLength(1)
    expect(requests).toHaveLength(5)
    expect(loader.take(1)).toHaveLength(1)
    await loader.ensureChunk(1)
    expect(requests).toHaveLength(7)
    expect(requests.slice(-2)).toEqual([
      '/data/v1/events/ee-01.json',
      '/data/v1/paths/pd-01.json',
    ])
  })

  it('keeps one global dictionary and consumes newest-first', async () => {
    const files = new Map(encodeBundle(fixture(), { chunkSize: 3 }).files)
    const loader = createBundleLoader({ fetchImpl: stubFetch(files, []) })
    await loader.boot()
    const first = loader.takeThroughDay(0)
    await loader.ensureChunk(1)
    const rest = loader.takeThroughDay(3)

    expect(first).toHaveLength(2)
    expect(rest).toHaveLength(3)
    expect(rest[1]).toMatchObject({ path: 'packages/engine/src/run.ts' })
    expect(loader.takeThroughDay(3)).toEqual([])
    expect(loader.status()).toMatchObject({
      phase: 'exhausted',
      historyEnded: true,
      endReason: 'manifest-exhausted',
      eventsConsumed: 5,
      pathsLoaded: 4,
    })
  })

  it('ends history quietly when a later chunk is missing', async () => {
    const files = new Map(encodeBundle(fixture(), { chunkSize: 3 }).files)
    const requests: string[] = []
    files.delete('events/ee-01.json')
    const loader = createBundleLoader({ fetchImpl: stubFetch(files, requests) })
    await loader.boot()
    const result = await loader.ensureChunk(1)

    expect(result).toBe(false)
    expect(loader.status()).toMatchObject({
      phase: 'exhausted',
      historyEnded: true,
      endReason: 'chunk-missing',
    })
  })

  it('resolves the required head when the first event file is missing', async () => {
    const files = new Map(encodeBundle(fixture(), { chunkSize: 3 }).files)
    files.delete('events/ee-00.json')
    const loader = createBundleLoader({ fetchImpl: stubFetch(files, []) })
    const head = await loader.boot()

    expect(head.manifest.v).toBe(BUNDLE_VERSION)
    expect(head.repos).toHaveLength(2)
    expect(head.grid.dayCount).toBe(4)
    expect(head.events).toEqual([])
    expect(loader.status().endReason).toBe('chunk-missing')
  })

  it('rejects malformed versions, aborted boots, and unsafe bases', async () => {
    const files = new Map(encodeBundle(fixture(), { chunkSize: 3 }).files)
    const manifestText = files.get('manifest.json')!
    files.set('manifest.json', manifestText.replace('"v":1', '"v":2'))
    const versionLoader = createBundleLoader({
      fetchImpl: stubFetch(files, []),
    })

    await expect(versionLoader.boot()).rejects.toMatchObject({
      reason: 'version',
    })
    expect(() =>
      createBundleLoader({ baseUrl: 'https://evil.example/data' })
    ).toThrow(BundleLoadError)
    expect(() => createBundleLoader({ baseUrl: '//evil.example' })).toThrow(
      BundleLoadError
    )

    const controller = new AbortController()
    controller.abort()
    const aborted = createBundleLoader({
      signal: controller.signal,
      fetchImpl: stubFetch(new Map(), []),
    })
    await expect(aborted.boot()).rejects.toBeDefined()
    expect(() => aborted.dispose()).not.toThrow()
    expect(() => aborted.dispose()).not.toThrow()
  })
})

function stubFetch(
  files: ReadonlyMap<string, string>,
  requests: string[]
): typeof fetch {
  return async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    requests.push(url)
    const prefix = '/data/v1/'
    const body = files.get(
      url.startsWith(prefix) ? url.slice(prefix.length) : ''
    )
    return new Response(body ?? 'not found', {
      status: body === undefined ? 404 : 200,
    })
  }
}

function fixture(): BundleInput {
  const repos = [
    repo(0, 'aiur-team/aiur', 1),
    repo(1, 'its-everdred/kevinweaver-dev', 0),
  ]
  return {
    meta: {
      v: 1,
      generatedAt: '2026-07-31T16:39:00Z',
      commit: 'e664d73',
      windowStart: '2026-07-28',
      windowEnd: '2026-07-31',
      dayCount: 4,
      repoCount: repos.length,
      repoCountDefinition: 'ownerPublicNonFork',
      actors,
      degraded: [],
    },
    repos,
    grid: {
      start: '2026-07-28',
      dayCount: 4,
      human: [0, 1, 0, 2],
      agent: [1, 0, 0, 3],
      privateMonthly: [4],
      privateStart: '2026-07',
      bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256],
    },
    events: [
      event(
        0,
        0,
        'packages/engine/src/bootstrap.ts',
        1,
        'aiur-team/aiur',
        'a2'
      ),
      event(1, 3, 'app/layout.tsx', 0, 'its-everdred/kevinweaver-dev', 'c2'),
      event(0, 0, 'packages/engine/src/run.ts', 1, 'aiur-team/aiur', 'a1'),
      event(1, 1, 'app/page.tsx', 0, 'its-everdred/kevinweaver-dev', 'b1'),
      event(0, 3, 'packages/engine/src/run.ts', 0, 'aiur-team/aiur', 'c1'),
    ],
  }
}

function repo(id: number, name: string, actor: ActorId): RepoRecord {
  return {
    id,
    ghId: id + 1,
    name,
    short: name.split('/')[1]!,
    actor,
    vol: 10,
    stars: 2,
    from: '2026-07-28',
    to: '2026-07-31',
    private: false,
    ext: ['ts'],
    status: 'ok',
  }
}

function event(
  repoId: number,
  day: number,
  path: string,
  actor: ActorId,
  repoName: string,
  sha: string
): SortableEvent {
  return { day, repo: repoId, path, actor, repoName, sha }
}
