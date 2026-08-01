import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { encodeBundle } from './encode.ts'
import type { EncodeInput } from './encode.ts'

const input: EncodeInput = {
  events: [
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'a'.repeat(40),
      path: 'packages/engine/src/run.ts',
      actor: 0,
    },
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'b'.repeat(40),
      path: 'packages/engine/src/bootstrap.ts',
      actor: 1,
    },
    {
      day: '2026-07-30',
      repo: 'ethereum-optimism/actions',
      sha: 'c'.repeat(40),
      path: 'apps/web/app/page.tsx',
      actor: 0,
    },
  ],
  repos: [
    {
      n: 'aiur-team/aiur',
      first: '2026-07-30',
      last: '2026-07-31',
      private: false,
      status: 'ok',
    },
    {
      n: 'ethereum-optimism/actions',
      first: '2026-07-30',
      last: '2026-07-30',
      private: false,
      status: 'ok',
    },
  ],
  grid: {
    start: '2026-07-30',
    e: [1, 2],
    a: [0, 1],
    p: [0],
    bands: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  combinedTotal: 4,
  generatedAt: '2026-07-31T00:00:00Z',
  commit: 'abcdef0',
  repoCount: 2,
  repoCountDefinition: 'ownerPublicNonFork',
  refs: 'all',
  chunkSize: 3,
  dictSliceGuardGzipBytes: 12_288,
  samlCanary: {
    ok: true,
    org: 'ethereum-optimism',
    checkedAt: '2026-07-31T00:00:00Z',
  },
  degraded: [],
}

describe('pipeline encoder', () => {
  it('emits byte-deterministic Scheme D resources', () => {
    const first = encodeBundle(input)
    const second = encodeBundle({
      ...input,
      events: [...input.events].reverse(),
    })
    expect(first.files).toEqual(second.files)
    expect(first.manifest).toMatchObject({
      generatedAt: input.generatedAt,
      windowStart: '2026-07-30',
      windowEnd: '2026-07-31',
      dayCount: 2,
    })
    expect(
      new TextDecoder().decode(
        first.files.find((file) => file.path === 'events/ee-00.json')?.bytes
      )
    ).toBe('{"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[0,1,0]}\n')
  })
})
