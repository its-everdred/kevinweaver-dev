import { describe, expect, it } from 'vitest'
import {
  decodeBundle,
  decodeManifest,
  encodeBundle,
} from '../../lib/bundle/codec'
import type { BundleInput } from '../../lib/bundle/codec'

describe('bundle repository count', () => {
  it('round-trips a manifest count independent of the repo table', () => {
    const input = fixture(2)
    const decoded = decodeBundle(encodeBundle(input).files)

    expect(decoded.manifest.repoCount).toBe(input.meta.repoCount)
    expect(decoded.manifest.repoCountDefinition).toBe('ownerPublicNonFork')
    expect(decoded.repos).toHaveLength(input.repos.length)
  })

  it('decodes a manifest count that differs from the repo table', () => {
    const files = new Map(encodeBundle(fixture()).files)
    const manifestText = files.get('manifest.json')
    if (manifestText === undefined) throw new Error('Missing manifest resource')
    const manifest = decodeManifest(manifestText)
    files.set(
      'manifest.json',
      JSON.stringify({ ...manifest, repoCount: manifest.repoCount + 1 })
    )

    const decoded = decodeBundle(files)

    expect(decoded.manifest.repoCount).toBe(2)
    expect(decoded.repos).toHaveLength(1)
  })
})

function fixture(repoCount = 1): BundleInput {
  return {
    meta: {
      v: 1,
      generatedAt: '2026-07-31T16:39:00Z',
      commit: 'e664d73',
      days: ['2026-07-31', '2026-07-31'],
      refs: 'all',
      windowStart: '2026-07-31',
      windowEnd: '2026-07-31',
      dayCount: 1,
      repoCount,
      repoCountDefinition: 'ownerPublicNonFork',
      actors: [
        { id: 0, login: 'its-everdred', kind: 'human' },
        { id: 1, login: 'its-applekid', kind: 'agent' },
      ],
      degraded: [],
    },
    repos: [
      {
        id: 0,
        ghId: 1,
        name: 'its-everdred/kevinweaver-dev',
        short: 'kevinweaver-dev',
        actor: 0,
        vol: 1,
        stars: 0,
        from: '2026-07-31',
        to: '2026-07-31',
        private: false,
        ext: ['ts'],
        status: 'ok',
      },
    ],
    grid: {
      start: '2026-07-31',
      dayCount: 1,
      human: [1],
      agent: [0],
      privateMonthly: [0],
      privateStart: '2026-07',
      bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256],
    },
    events: [
      {
        day: 0,
        repo: 0,
        path: 'lib/bundle/codec.ts',
        actor: 0,
        repoName: 'its-everdred/kevinweaver-dev',
        sha: 'a'.repeat(40),
      },
    ],
  }
}
