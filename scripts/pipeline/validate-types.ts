export type Severity = 'error' | 'warn'
export interface Finding {
  code: string
  severity: Severity
  message: string
}
export interface ValidationResult {
  ok: boolean
  findings: readonly Finding[]
  firstByteBrotliBytes: number
  maxDictSliceGzipBytes: number
  chunkCount: number
  eventCount: number
}
export interface ChunkColumns {
  b: number
  d: readonly number[]
  r: readonly number[]
  p: readonly number[]
  a: readonly number[]
}
export interface ValidationResources {
  files: ReadonlyMap<string, string>
  decoded: DecodedBundle | undefined
  chunks: readonly string[]
  slices: readonly string[]
}
export function add(findings: Finding[], code: string, message: string): void {
  findings.push({ code, severity: 'error', message })
}
export function sum(values: readonly number[] | undefined): number {
  return values?.reduce((total, value) => total + value, 0) ?? 0
}
import type { DecodedBundle } from '../../lib/bundle/codec.ts'
