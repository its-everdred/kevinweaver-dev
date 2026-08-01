import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  compareEvents,
  dayFromIndex,
  dayIndex,
  decodeBundle,
  decodeManifest,
  encodeBundle,
} from '../../lib/bundle/codec'
import {
  FrontCodeError,
  frontCode,
  frontDecode,
} from '../../lib/bundle/frontcode'
import type { BundleInput, EncodedBundle } from '../../lib/bundle/codec'
import type { RepoRecord, SortableEvent } from '../../lib/bundle/schema'

const actors = [
  { id: 0 as const, login: 'its-everdred', kind: 'human' as const },
  { id: 1 as const, login: 'its-applekid', kind: 'agent' as const },
]

describe('bundle codec', () => {
  it('reproduces the worked fixture byte-for-byte', () => {
    const encoded = encodeBundle(workedFixture(), { chunkSize: 3 })

    expect(encoded.files.get('events/ee-00.json')).toBe(
      '{"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[1,1,0]}'
    )
    expect(encoded.files.get('events/ee-01.json')).toBe(
      '{"b":3,"d":[0,0],"r":[0,1],"p":[0,3],"a":[0,0]}'
    )
    expect(encoded.files.get('paths/pd-00.json')).toBe(
      '{"from":0,"n":3,"fc":"#packages/engine/src/run.ts\\n7bootstrap.ts\\n#app/page.tsx"}'
    )
    expect(encoded.files.get('paths/pd-01.json')).toBe(
      '{"from":3,"n":1,"fc":"#app/layout.tsx"}'
    )
  })

  it('round-trips the canonical event projection and is byte deterministic', () => {
    const input = workedFixture()
    const first = encodeBundle(input, {
      chunkSize: 3,
      sha256: (text) => `h${text.length}`,
    })
    const second = encodeBundle(input, {
      chunkSize: 3,
      sha256: (text) => `h${text.length}`,
    })
    const decoded = decodeBundle(first.files)

    expect([...first.files]).toEqual([...second.files])
    expect(decoded.events).toEqual(canonicalEvents(input.events))
    expect(decoded.repos).toEqual(input.repos)
    expect(decoded.grid).toEqual(input.grid)
    expect(decoded.manifest).toMatchObject(input.meta)
    expect(decoded.manifest.integrity).toEqual({
      'repos.json': expect.any(String),
      'grid.json': expect.any(String),
      'events/ee-00.json': expect.any(String),
      'paths/pd-00.json': expect.any(String),
      'events/ee-01.json': expect.any(String),
      'paths/pd-01.json': expect.any(String),
    })
  })

  it('round-trips a corpus larger than 5,000 events across 21 repositories', () => {
    const input = generatedInput(5_040, 21)
    const encoded = encodeBundle(input, { chunkSize: 500 })
    const decoded = decodeBundle(encoded.files)

    expect(encoded.eventCount).toBe(5_040)
    expect(decoded.events).toEqual(canonicalEvents(input.events))
    expect(decoded.repos).toEqual(input.repos)
    expect(decoded.grid).toEqual(input.grid)
  })

  it('bisects oversized dictionary slices without changing the global path order', () => {
    const input = generatedInput(1_500, 1, true)
    const encoded = encodeBundle(input, {
      gzipSize: gzipSize,
      maxDictSliceGzipBytes: 12_288,
    })
    const sizes = requireSizes(encoded)

    expect(encoded.chunkCount).toBeGreaterThan(1)
    expect(sizes.every((size) => size <= 12_288)).toBe(true)
    expect(decodeBundle(encoded.files).events).toEqual(
      canonicalEvents(input.events)
    )
  })

  it('enforces schema invariants rather than correcting invalid input', () => {
    const input = workedFixture()
    expect(() =>
      encodeBundle({ ...input, repos: [...input.repos].reverse() })
    ).toThrow()
    expect(() =>
      encodeBundle({
        ...input,
        events: [{ ...input.events[0]!, day: input.meta.dayCount }],
      })
    ).toThrow()
    expect(() =>
      encodeBundle({ ...input, grid: { ...input.grid, bands: [0] } })
    ).toThrow()
    expect(() =>
      encodeBundle({
        ...input,
        repos: [{ ...input.repos[0]!, ghId: -1 }, input.repos[1]!],
      })
    ).toThrow()
    expect(() => encodeExternal(withPrivateRepository(input))).toThrow()
  })

  it('uses one calendar implementation for newest-first day identity', () => {
    expect(dayIndex('2026-07-28', '2026-07-31')).toBe(3)
    expect(dayFromIndex(3, '2026-07-31')).toBe('2026-07-28')
  })

  it('does not treat prototype properties as decoded wire fields', () => {
    const encoded = encodeBundle(workedFixture(), { chunkSize: 3 })
    const manifest = encoded.files.get('manifest.json')!
    expect(() => decodeManifest(`{"__proto__":${manifest}}`)).toThrow()
  })
})

describe('front coding', () => {
  it('round-trips generated lists, capped prefixes, and backslashes', () => {
    for (let index = 0; index < 200; index += 1) {
      const shared = `src/${'a'.repeat(90 + (index % 12))}/`
      const paths = Array.from(
        { length: (index % 7) + 1 },
        (_, pathIndex) => `${shared}entry-${index}-${pathIndex}\\nested.ts`
      )
      expect(frontDecode(frontCode(paths))).toEqual(paths)
    }
  })

  it('rejects paths that cannot be represented as newline-joined entries', () => {
    expect(() => frontCode([''])).toThrow(FrontCodeError)
    expect(() => frontCode(['src/one\ntwo.ts'])).toThrow(FrontCodeError)
  })
})

describe('bundle modules remain browser-safe', () => {
  it('contains no platform built-in imports or DOM global property access', () => {
    const files = ['schema.ts', 'frontcode.ts', 'codec.ts']
    for (const file of files) {
      const source = readFileSync(resolve('lib/bundle', file), 'utf8')
      const executableSource = source.replace(
        /(['"`])(?:\\.|(?!\1)[^\\])*\1/g,
        ''
      )
      expect(source).not.toMatch(
        /from\s+['"](?:node:)?(?:fs|zlib|crypto|path)['"]/
      )
      expect(executableSource).not.toMatch(/\b(?:document|window)\s*(?:\.|\[)/)
    }
  })
})

function workedFixture(): BundleInput {
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

function generatedInput(
  eventCount: number,
  repoCount: number,
  uniquePaths = false
): BundleInput {
  const dayCount = 20
  const repos = Array.from({ length: repoCount }, (_, index) =>
    repo(index, `owner/repo-${String(index).padStart(2, '0')}`, actorId(index))
  )
  const events = Array.from({ length: eventCount }, (_, index) => {
    const repoIndex = index % repoCount
    const suffix = uniquePaths ? randomPath(index) : `file-${index % 80}.ts`
    return event(
      repoIndex,
      index % dayCount,
      `src/repo-${repoIndex}/${suffix}`,
      actorId(index),
      repos[repoIndex]!.name,
      `sha-${String(index).padStart(5, '0')}`
    )
  }).reverse()
  return {
    meta: {
      v: 1,
      generatedAt: '2026-07-31T16:39:00Z',
      commit: 'fixture',
      windowStart: '2026-07-12',
      windowEnd: '2026-07-31',
      dayCount,
      repoCount,
      repoCountDefinition: 'ownerPublicNonFork',
      actors,
      degraded: [],
    },
    repos,
    grid: {
      start: '2026-07-12',
      dayCount,
      human: Array(dayCount).fill(0),
      agent: Array(dayCount).fill(0),
      privateMonthly: [0],
      privateStart: '2026-07',
      bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256],
    },
    events,
  }
}

function repo(id: number, name: string, actor: 0 | 1): RepoRecord {
  return {
    id,
    ghId: 1_000 + id,
    name,
    short: name.slice(name.indexOf('/') + 1),
    actor,
    vol: 1,
    stars: 0,
    from: '2026-07-12',
    to: '2026-07-31',
    private: false,
    ext: ['.ts'],
    status: 'ok',
  }
}

function event(
  repo: number,
  day: number,
  path: string,
  actor: 0 | 1,
  repoName: string,
  sha: string
): SortableEvent {
  return { repo, day, path, actor, repoName, sha }
}

function actorId(value: number): 0 | 1 {
  return value % 2 === 0 ? 0 : 1
}

function canonicalEvents(events: readonly SortableEvent[]) {
  return [...events].sort(compareEvents).map(({ day, repo, path, actor }) => ({
    day,
    repo,
    path,
    actor,
  }))
}

function gzipSize(text: string): number {
  return gzipSync(text, { level: 9 }).length
}

function requireSizes(encoded: EncodedBundle): readonly number[] {
  if (encoded.dictSliceGzipBytes === null)
    throw new Error('Expected gzip sizes.')
  return encoded.dictSliceGzipBytes
}

function randomPath(index: number): string {
  let state = index + 1
  let value = ''
  for (let offset = 0; offset < 108; offset += 1) {
    state = (state * 16_807) % 2_147_483_647
    value += String.fromCharCode(97 + (state % 26))
  }
  return `${value}.ts`
}

function withPrivateRepository(input: BundleInput): unknown {
  return { ...input, repos: [{ ...input.repos[0]!, private: true }] }
}

function encodeExternal(value: unknown): unknown {
  return Reflect.apply(encodeBundle, undefined, [value])
}
