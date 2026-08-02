import { createHash } from 'node:crypto'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeDictSlice } from '../../lib/bundle/codec.ts'
import type { EncodedBundle } from './encode.ts'
import type { Finding, ChunkColumns } from './validate-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { add } from './validate-types.ts'
export function numbered(
  files: ReadonlyMap<string, string>,
  count: number,
  name: (index: number) => string
): string[] {
  return Array.from(
    { length: count },
    (_, index) => files.get(name(index)) ?? ''
  )
}
export function countFiles(
  files: ReadonlyMap<string, string>,
  pattern: RegExp
): number {
  return [...files.keys()].filter((path) => pattern.test(path)).length
}
export function readSlice(text: string) {
  try {
    return decodeDictSlice(text)
  } catch {
    return undefined
  }
}
export function readChunk(text: string): ChunkColumns | undefined {
  const value = record(text)
  if (!value) return undefined
  const b = integer(value.b)
  const d = numbers(value.d)
  const r = numbers(value.r)
  const p = numbers(value.p)
  const a = numbers(value.a)
  return b === undefined || !d || !r || !p || !a ? undefined : { b, d, r, p, a }
}
export function validateJson(
  files: ReadonlyMap<string, string>,
  findings: Finding[]
): void {
  if ([...files.values()].some((text) => !json(text)))
    add(findings, 'E_JSON', 'A bundle resource is not valid JSON.')
}
export function validateIntegrity(
  integrity: Readonly<Record<string, string>>,
  files: ReadonlyMap<string, string>,
  findings: Finding[]
): void {
  Object.entries(integrity).forEach(([path, expected]) => {
    const text = files.get(path)
    const actual = text
      ? `sha256-${createHash('sha256').update(text).digest('hex')}`
      : undefined
    if (actual !== expected)
      add(findings, 'E_ROUNDTRIP', `Integrity mismatch for ${path}.`)
  })
}
export function validateManifestBytes(
  manifest: EncodedBundle['manifest'],
  files: ReadonlyMap<string, string>,
  findings: Finding[]
): void {
  if (files.get('manifest.json') !== `${JSON.stringify(manifest)}\n`)
    add(
      findings,
      'E_ROUNDTRIP',
      'Manifest bytes differ from the encoded value.'
    )
}

/**
 * @description Selects resources required before the first visualization frame.
 * @param files Decoded bundle resource text keyed by relative path.
 * @returns Resource bodies in network request order.
 */
export function firstByteResources(
  files: ReadonlyMap<string, string>
): string[] {
  return [
    'manifest.json',
    'repos.json',
    'grid.json',
    'events/ee-00.json',
    'paths/pd-00.json',
  ].map((path) => files.get(path) ?? '')
}
export function dayEnd(start: string, count: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + (count - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10)
}
export function monthCount(start: string, end: string): number {
  return (
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    Number(end.slice(5, 7)) -
    Number(start.slice(5, 7)) +
    1
  )
}
function json(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}
function record(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(text)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function integer(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined
}
function numbers(value: unknown): number[] | undefined {
  return Array.isArray(value) &&
    value.every((entry) => integer(entry) !== undefined)
    ? value
    : undefined
}
