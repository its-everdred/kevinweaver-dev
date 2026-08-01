import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { encodeBundle } from './encode.ts'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { validateBundle } from './validate.ts'
import type { EncodedBundle, EncodeInput } from './encode.ts'
import type { PipelineState } from './state.ts'

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

  it('reports a missing numbered resource as a chunk-count failure', () => {
    const bundle = validBundle()
    const incomplete = {
      ...bundle,
      files: bundle.files.filter((file) => file.path !== 'events/ee-00.json'),
    }
    expect(validateBundle(incomplete, null).findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'E_CHUNK_COUNT' }),
      ])
    )
  })

  it('reports malformed chunk column and reference invariants', () => {
    expectCodes(chunkBundle('{"b":0,"d":[],"r":[0],"p":[0],"a":[0]}'), [
      'E_COLUMNS',
    ])
    expectCodes(chunkBundle('{"b":0,"d":[-1],"r":[0],"p":[0],"a":[0]}'), [
      'E_DELTA',
    ])
    expectCodes(chunkBundle('{"b":0,"d":[0],"r":[1],"p":[0],"a":[0]}'), [
      'E_REPO_RANGE',
    ])
    expectCodes(chunkBundle('{"b":0,"d":[0],"r":[0],"p":[1],"a":[0]}'), [
      'E_PATH_RANGE',
    ])
  })

  it('reports a regression against persisted pipeline state', () => {
    const previous: PipelineState = {
      schema: 1,
      events: 2,
      combinedTotal: 2,
      repos: {},
    }
    expectCodes(validBundle(), ['E_REGRESSION'], previous)
  })
})

function validBundle(): EncodedBundle {
  return encodeBundle({
    ...input,
    repoCount: 1,
    samlCanary: { ...input.samlCanary, ok: true },
    repos: [
      {
        n: 'owner/repo',
        first: '2026-07-31',
        last: '2026-07-31',
        private: false,
        status: 'ok',
      },
    ],
    events: [
      {
        day: '2026-07-31',
        repo: 'owner/repo',
        sha: 'a'.repeat(40),
        path: 'src/index.ts',
        actor: 0,
      },
    ],
  })
}

function chunkBundle(text: string): EncodedBundle {
  return withFile(validBundle(), 'events/ee-00.json', text)
}

function withFile(
  bundle: EncodedBundle,
  path: string,
  text: string
): EncodedBundle {
  return {
    ...bundle,
    files: bundle.files.map((file) =>
      file.path === path ? { ...file, bytes: Buffer.from(`${text}\n`) } : file
    ),
  }
}

function expectCodes(
  bundle: EncodedBundle,
  codes: readonly string[],
  previous: PipelineState | null = null
): void {
  expect(validateBundle(bundle, previous).findings).toEqual(
    expect.arrayContaining(codes.map((code) => expect.objectContaining({ code })))
  )
}
