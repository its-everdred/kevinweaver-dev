import { describe, expect, it } from 'vitest'

// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode.ts'
import type { EncodedBundle, EncodeInput } from './encode.ts'
import type { PipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'

describe('pipeline validator', () => {
  it('refuses an empty corpus and a failed SAML canary', () => {
    const bundle = encodeBundle({
      ...input,
      events: [],
      repos: [],
      repoCount: 0,
      samlCanary: { ...input.samlCanary, ok: false },
    })
    expect(codes(bundle)).toEqual(expect.arrayContaining(['E_EMPTY', 'E_SAML']))
  })

  it('reports malformed event columns and invalid references', () => {
    expect(
      codes(
        withFile(
          validBundle(),
          'events/ee-00.json',
          '{"b":0,"d":[],"r":[0],"p":[0],"a":[0]}'
        )
      )
    ).toContain('E_COLUMNS')
    expect(
      codes(
        withFile(
          validBundle(),
          'events/ee-00.json',
          '{"b":0,"d":[-1],"r":[0],"p":[0],"a":[0]}'
        )
      )
    ).toContain('E_DELTA')
    expect(
      codes(
        withFile(
          validBundle(),
          'events/ee-00.json',
          '{"b":0,"d":[0],"r":[2],"p":[0],"a":[0]}'
        )
      )
    ).toContain('E_REPO_RANGE')
    expect(
      codes(
        withFile(
          validBundle(),
          'events/ee-00.json',
          '{"b":0,"d":[0],"r":[0],"p":[1],"a":[0]}'
        )
      )
    ).toContain('E_PATH_RANGE')
    expect(
      codes(
        withFile(
          validBundle(),
          'events/ee-00.json',
          '{"b":0,"d":[1],"r":[0],"p":[0],"a":[0]}'
        )
      )
    ).toContain('E_CHUNK_BASE')
  })

  it('rejects parseable resource bytes that fail their integrity hash', () => {
    const bundle = validBundle()
    const repos = bundle.files.find((file) => file.path === 'repos.json')
    if (!repos) throw new Error('Missing repos resource')

    expect(
      codes(
        withFile(
          bundle,
          'repos.json',
          `${new TextDecoder().decode(repos.bytes).trimEnd()}\n`
        )
      )
    ).toContain('E_ROUNDTRIP')
  })

  it('detects a regression against saved pipeline state', () => {
    const previous: PipelineState = {
      schema: 1,
      events: 4,
      combinedTotal: 5,
      repos: {},
    }
    expect(codes(validBundle(), previous)).toContain('E_REGRESSION')
  })
})

function validBundle(): EncodedBundle {
  return encodeBundle({
    ...input,
    repos: [input.repos[0]!],
    repoCount: 1,
    events: [input.events[0]!],
  })
}

const input: EncodeInput = {
  events: [
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'a'.repeat(40),
      path: 'packages/engine/src/run.ts',
      actor: 0,
    },
  ],
  repos: [
    {
      n: 'aiur-team/aiur',
      ghId: 1,
      stars: 10,
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

function codes(
  bundle: EncodedBundle,
  previous: PipelineState | null = null
): string[] {
  return validateBundle(bundle, previous).findings.map(
    (finding) => finding.code
  )
}
