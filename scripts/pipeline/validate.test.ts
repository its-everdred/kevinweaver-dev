import { describe, expect, it } from 'vitest'

// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode.ts'
import type { EncodedBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { MINI_INPUT } from './encode.test.ts'
import type { PipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'

describe('pipeline validator', () => {
  it('refuses an empty corpus and a failed SAML canary', () => {
    const bundle = encodeBundle({
      ...MINI_INPUT,
      events: [],
      repos: [],
      repoCount: 0,
      samlCanary: { ...MINI_INPUT.samlCanary, ok: false },
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
    ...MINI_INPUT,
    repos: [MINI_INPUT.repos[0]!],
    repoCount: 1,
    events: [MINI_INPUT.events[0]!],
  })
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
