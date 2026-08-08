import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeChunk, decodeDictSlice } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { frontCode } from '../../lib/bundle/frontcode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { MINI_INPUT } from './encode-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'
import type { EncodedBundle } from './encode.ts'

describe('bundle validator', () => {
  it('rejects structurally valid noncanonical chunk bytes', () => {
    const mutation = noncanonicalChunk()
    const bundle = replace('events/ee-00.json', mutation)

    expect(decodeChunk(mutation)).toMatchObject({ b: 0 })
    expect(roundtripMessages(bundle)).toContain(
      'Chunk 0 is not canonically encoded.'
    )
  })

  it('rejects structurally valid noncanonical dictionary bytes', () => {
    const bundle = encodeBundle(MINI_INPUT)
    const original = text(bundle, 'paths/pd-00.json')
    const decoded = decodeDictSlice(original)
    const mutation = `${JSON.stringify({
      fc: frontCode(decoded.paths),
      n: decoded.paths.length,
      from: decoded.from,
    })}\n`

    expect(decodeDictSlice(mutation).paths).toHaveLength(3)
    expect(
      roundtripMessages(replaceFile(bundle, 'paths/pd-00.json', mutation))
    ).toContain('Dictionary slice 0 is not canonically encoded.')
  })

  it('reports regression against a prior successful corpus', () => {
    const bundle = encodeBundle(validInput())
    const findings = validateBundle(bundle, {
      schema: 1,
      events: 50_000,
      // Same rules as the run under test, so the event count is comparable and
      // the collapse below is real. Without this the guard rightly stands down
      // and this case would silently stop testing the event path it names.
      extractionRules: bundle.extractionRules,
      combinedTotal: 0,
      repos: {},
    }).findings

    expect(findings.map((finding) => finding.code)).toContain('E_REGRESSION')
  })

  it('stands down on an event collapse the extraction rules explain', () => {
    const bundle = encodeBundle(validInput())
    const findings = validateBundle(bundle, {
      schema: 1,
      events: 50_000,
      // A different fingerprint: the prior corpus was gathered under rules this
      // run no longer uses, so its event count says nothing about this one.
      // Adding the vendored-path list dropped 85.6% of the corpus, and the
      // guard refused to publish the intended result.
      extractionRules: 'rules-from-a-previous-era',
      combinedTotal: 0,
      repos: {},
    }).findings

    expect(findings.map((finding) => finding.code)).not.toContain('E_REGRESSION')
  })

  it('still catches a combined-total fall whatever the extraction rules', () => {
    const bundle = encodeBundle(validInput())
    const findings = validateBundle(bundle, {
      schema: 1,
      events: 0,
      extractionRules: 'rules-from-a-previous-era',
      // The contribution calendar is GitHub's own total and no extraction rule
      // can move it, so a fall here means something really did break.
      combinedTotal: bundle.combinedTotal + 1,
      repos: {},
    }).findings

    expect(findings.map((finding) => finding.code)).toContain('E_REGRESSION')
  })

  it('reports the empty-corpus floor independently of parse validity', () => {
    const findings = validateBundle(encodeBundle(MINI_INPUT), null).findings

    expect(findings.map((finding) => finding.code)).toContain('E_EMPTY')
  })

  it('requires a prior stale repository to retain its history', () => {
    const findings = validateBundle(encodeBundle(validInput()), {
      schema: 1,
      events: 40_000,
      combinedTotal: 40_000,
      repos: {
        'owner/repo-00': {
          heads: {},
          events: 1_001,
          status: 'stale',
          lastOk: '2026-07-31T00:00:00Z',
          consecutiveFailures: 1,
        },
      },
    }).findings

    expect(findings.map((finding) => finding.code)).toContain('E_REPO_STATUS')
  })

  it('allows omitted never-observed stale repositories', () => {
    const findings = validateBundle(encodeBundle(validInput()), {
      schema: 1,
      events: 40_000,
      combinedTotal: 40_000,
      repos: {
        'owner/never-observed': {
          heads: {},
          events: 0,
          status: 'stale',
          lastOk: null,
          consecutiveFailures: 1,
        },
      },
    }).findings

    expect(findings.map((finding) => finding.code)).not.toContain(
      'E_REPO_STATUS'
    )
  })

  it.each([
    ['E_DICT_GUARD', 'paths/pd-00.json'],
    ['E_FIRST_BYTE', 'repos.json'],
  ])(
    'reports %s when a resource exceeds its compressed budget',
    (code, path) => {
      const findings = validateBundle(
        replaceFile(encodeBundle(validInput()), path, oversizedJson()),
        null
      ).findings

      expect(findings.map((finding) => finding.code)).toContain(code)
    }
  )

  it.each([
    ['E_COLUMNS', '{"b":0,"d":[0],"r":[],"p":[0],"a":[0]}\n'],
    ['E_DELTA', '{"b":0,"d":[-1],"r":[0],"p":[0],"a":[0]}\n'],
    ['E_PATH_RANGE', '{"b":0,"d":[0],"r":[0],"p":[999],"a":[0]}\n'],
    ['E_REPO_RANGE', '{"b":0,"d":[0],"r":[999],"p":[0],"a":[0]}\n'],
  ])('reports %s for malformed chunk geometry', (code, chunk) => {
    const findings = validateBundle(
      replace('events/ee-00.json', chunk),
      null
    ).findings

    expect(findings.map((finding) => finding.code)).toContain(code)
  })
})

function noncanonicalChunk(): string {
  return '{"d":[0,0,1],"b":0,"r":[0,0,1],"p":[0,1,2],"a":[0,1,0]}\n'
}

function replace(path: string, value: string): EncodedBundle {
  return replaceFile(encodeBundle(MINI_INPUT), path, value)
}

function replaceFile(
  bundle: EncodedBundle,
  path: string,
  value: string
): EncodedBundle {
  return {
    ...bundle,
    files: bundle.files.map((file) =>
      file.path === path ? { ...file, bytes: Buffer.from(value) } : file
    ),
  }
}

function roundtripMessages(bundle: EncodedBundle): string[] {
  return validateBundle(bundle, null).findings.map((finding) => finding.message)
}

function text(bundle: EncodedBundle, path: string): string {
  const file = bundle.files.find((entry) => entry.path === path)
  if (!file) throw new Error(`Missing ${path}`)
  return new TextDecoder().decode(file.bytes)
}

function oversizedJson(): string {
  let state = 17
  const text = Array.from({ length: 30_000 }, () => {
    state = (state * 16_807) % 2_147_483_647
    return String.fromCharCode(33 + (state % 90))
  }).join('')
  return `${JSON.stringify({ from: 0, n: 1, fc: `#${text}` })}\n`
}
