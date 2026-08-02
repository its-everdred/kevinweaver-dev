// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeChunk, decodeDictSlice } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { frontCode } from '../../lib/bundle/frontcode.ts'
import type { Finding, ValidationResources } from './validate-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { add } from './validate-types.ts'

/** Confirms chunks and dictionary slices retain their canonical wire bytes. */
export function validateCanonicalBytes(
  resources: ValidationResources,
  findings: Finding[]
): void {
  resources.chunks.forEach((text, index) =>
    validateChunk(text, index, findings)
  )
  resources.slices.forEach((text, index) =>
    validateSlice(text, index, findings)
  )
}

function validateChunk(text: string, index: number, findings: Finding[]): void {
  try {
    if (text === `${JSON.stringify(decodeChunk(text))}\n`) return
  } catch {
    return
  }
  add(findings, 'E_ROUNDTRIP', `Chunk ${index} is not canonically encoded.`)
}

function validateSlice(text: string, index: number, findings: Finding[]): void {
  try {
    const decoded = decodeDictSlice(text)
    const canonical = JSON.stringify({
      from: decoded.from,
      n: decoded.paths.length,
      fc: frontCode(decoded.paths),
    })
    if (text === `${canonical}\n`) return
  } catch {
    return
  }
  add(
    findings,
    'E_ROUNDTRIP',
    `Dictionary slice ${index} is not canonically encoded.`
  )
}
