import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode-bundle.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { nextState } from './encode-state.ts'
import type { EncodeInput } from './encode-types.ts'

describe('pipeline state encoder', () => {
  it('retains a prior-only repository and marks it gone after seven failures', () => {
    const input = fixture()
    const bundle = encodeBundle(input)
    const previous = {
      schema: 1 as const,
      repos: {
        'owner/old': {
          heads: { main: 'a'.repeat(40) },
          events: 12,
          lastEventDay: '2026-07-30',
          status: 'stale' as const,
          lastOk: '2026-07-30T00:00:00Z',
          consecutiveFailures: 6,
        },
      },
    }

    const state = nextState(previous, bundle, input)

    expect(state.repos['owner/old']).toMatchObject({
      events: 12,
      status: 'gone',
      consecutiveFailures: 7,
    })
  })
})

function fixture(): EncodeInput {
  return {
    events: [
      {
        day: '2026-07-31',
        repo: 'owner/current',
        sha: 'a'.repeat(40),
        path: 'src/run.ts',
        actor: 0,
      },
    ],
    repos: [
      {
        n: 'owner/current',
        databaseId: 1,
        stargazerCount: 0,
        first: '2026-07-31',
        last: '2026-07-31',
        private: false,
        status: 'ok',
      },
    ],
    grid: {
      start: '2026-07-31',
      e: [1],
      a: [0],
      p: [0],
      bands: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    },
    combinedTotal: 1,
    generatedAt: '2026-07-31T00:00:00Z',
    commit: 'abcdef0',
    repoCount: 1,
    repoCountDefinition: 'ownerPublicNonFork',
    refs: 'all',
    chunkSize: 1500,
    dictSliceGuardGzipBytes: 12_288,
    samlCanary: {
      ok: true,
      org: 'ethereum-optimism',
      checkedAt: '2026-07-31T00:00:00Z',
    },
    degraded: [],
  }
}
