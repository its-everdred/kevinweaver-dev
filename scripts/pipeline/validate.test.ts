import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { encodeBundle } from './encode.ts'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { validateBundle } from './validate.ts'
import type { EncodeInput } from './encode.ts'

const input: EncodeInput = {
  events: [],
  repos: [],
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
  repoCount: 0,
  repoCountDefinition: 'ownerPublicNonFork',
  refs: 'all',
  chunkSize: 1500,
  dictSliceGuardGzipBytes: 12_288,
  samlCanary: {
    ok: false,
    org: 'ethereum-optimism',
    checkedAt: '2026-07-31T00:00:00Z',
  },
  degraded: [],
}

describe('pipeline validator', () => {
  it('refuses an empty corpus and failed SAML canary', () => {
    const result = validateBundle(encodeBundle(input), null)
    expect(result.ok).toBe(false)
    expect(result.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['E_EMPTY', 'E_SAML'])
    )
  })
})
