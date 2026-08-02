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
