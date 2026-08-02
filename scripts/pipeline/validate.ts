import { brotliCompressSync, gzipSync } from 'node:zlib'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeBundle } from '../../lib/bundle/codec.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { FIRST_BYTE_BROTLI_BUDGET_BYTES, MAX_DICT_SLICE_GZIP_BYTES, chunkFileName, dictFileName } from '../../lib/bundle/schema.ts'
import type { EncodedBundle } from './encode.ts'
import type { PipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { add } from './validate-types.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { firstByte, numbered, validateIntegrity, validateJson, validateManifestBytes } from './validate-format.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateRegression, validateShape } from './validate-shape.ts'
export type { Finding, Severity, ValidationResult } from './validate-types.ts'
import type {
  Finding,
  ValidationResources,
  ValidationResult,
} from './validate-types.ts'
export function validateBundle(
  bundle: EncodedBundle,
  prev: PipelineState | null
): ValidationResult {
  const findings: Finding[] = []
  const resources = collectResources(bundle, findings)
  const metrics = measure(resources)
  validateResources(bundle, prev, resources, findings)
  validateBudgets(bundle, metrics, findings)
  return {
    ok: findings.length === 0,
    findings,
    ...metrics,
    chunkCount: bundle.manifest.chunks,
    eventCount: bundle.manifest.events,
  }
}

function collectResources(
  bundle: EncodedBundle,
  findings: Finding[]
): ValidationResources {
  const files = new Map(
    bundle.files.map((file) => [
      file.path,
      new TextDecoder().decode(file.bytes),
    ])
  )
  return {
    files,
    decoded: decode(files, findings),
    chunks: numbered(files, bundle.manifest.chunks, chunkFileName),
    slices: numbered(files, bundle.manifest.chunks, dictFileName),
  }
}

function measure(
  resources: ValidationResources
): Pick<ValidationResult, 'firstByteBrotliBytes' | 'maxDictSliceGzipBytes'> {
  return {
    firstByteBrotliBytes: brotliCompressSync(
      Buffer.from(firstByte(resources.files))
    ).byteLength,
    maxDictSliceGzipBytes: Math.max(
      0,
      ...resources.slices.map((slice) => gzipSync(slice).byteLength)
    ),
  }
}

function validateResources(
  bundle: EncodedBundle,
  prev: PipelineState | null,
  resources: ValidationResources,
  findings: Finding[]
): void {
  validateJson(resources.files, findings)
  validateManifestBytes(bundle.manifest, resources.files, findings)
  validateIntegrity(bundle.manifest.integrity, resources.files, findings)
  validateShape(bundle, resources, findings)
  validateRegression(bundle, prev, resources.decoded?.repos ?? [], findings)
}

function validateBudgets(
  bundle: EncodedBundle,
  metrics: Pick<
    ValidationResult,
    'firstByteBrotliBytes' | 'maxDictSliceGzipBytes'
  >,
  findings: Finding[]
): void {
  if (metrics.maxDictSliceGzipBytes > MAX_DICT_SLICE_GZIP_BYTES)
    add(
      findings,
      'E_DICT_GUARD',
      'A dictionary slice exceeds 12,288 gzip bytes.'
    )
  if (metrics.firstByteBrotliBytes > FIRST_BYTE_BROTLI_BUDGET_BYTES)
    add(
      findings,
      'E_FIRST_BYTE',
      'The first-byte payload exceeds 12,288 brotli bytes.'
    )
  if (!bundle.samlCanary.ok || bundle.manifest.degraded.includes('calendar'))
    add(findings, 'E_SAML', 'SAML canary or calendar availability failed.')
}
function decode(files: ReadonlyMap<string, string>, findings: Finding[]) {
  try {
    return decodeBundle(files)
  } catch (error) {
    add(
      findings,
      'E_ROUNDTRIP',
      error instanceof Error ? error.message : 'Bundle decode failed'
    )
    return undefined
  }
}
