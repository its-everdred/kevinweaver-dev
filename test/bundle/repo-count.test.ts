import { describe, expect, it } from 'vitest'
import { decodeBundle, decodeManifest, encodeBundle } from '../../lib/bundle/codec'
import type { BundleInput } from '../../lib/bundle/codec'
import type { RepoRecord } from '../../lib/bundle/schema'

describe('bundle repo count codec coverage', () => {
  it('round-trips a manifest count independent of the repo table length', () => {
    const input = fixture()
    input.meta.repoCount = input.repos.length + 1

    const decoded = decodeBundle(encodeBundle(input).files)

    expect(decoded.manifest.repoCount).toBe(input.meta.repoCount)
    expect(decoded.manifest.repoCountDefinition).toBe('ownerPublicNonFork')
    expect(decoded.repos).toHaveLength(input.repos.length)
  })

  it('decodes a manifest count that differs from the repo table length', () => {
    const source = encodeBundle(fixture()).files.get('manifest.json')
    if (source === undefined) throw new Error('Encoded manifest is missing.')
    const manifest = decodeManifest(source)
    manifest.repoCount = 3
    const files = new Map(encodeBundle(fixture()).files)
    files.set('manifest.json', JSON.stringify(manifest))

    const decoded = decodeBundle(files)

    expect(decoded.manifest.repoCount).toBe(3)
    expect(decoded.repos).toHaveLength(2)
  })
})

function fixture(): BundleInput {
  const repos = [repo(0, 'aiur-team/aiur'), repo(1, 'its-everdred/kevinweaver-dev')]
  return {
    meta: {
      v: 1,
      generatedAt: '2026-07-31T16:39:00Z',
      commit: 'fixture',
      days: ['2026-07-31', '2026-07-28'],
      refs: 'all',
      windowStart: '2026-07-28',
      windowEnd: '2026-07-31',
      dayCount: 4,
      repoCount: repos.length,
      repoCountDefinition: 'ownerPublicNonFork',
      actors: [
        { id: 0, login: 'its-everdred', kind: 'human' },
        { id: 1, login: 'its-applekid', kind: 'agent' },
      ],
      degraded: [],
    },
    repos,
    grid: {
      start: '2026-07-28',
      dayCount: 4,
      human: [0, 0, 0, 0],
      agent: [0, 0, 0, 0],
      privateMonthly: [0],
      privateStart: '2026-07',
      bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256],
    },
    events: [],
  }
}

function repo(id: number, name: string): RepoRecord {
  return {
    id,
    ghId: id + 1,
    name,
    short: name.split('/')[1] ?? name,
    actor: id === 0 ? 1 : 0,
    vol: 0,
    stars: 0,
    status: 'ok',
    from: '2026-07-28',
    to: '2026-07-31',
    private: false,
    ext: [],
  }
}
