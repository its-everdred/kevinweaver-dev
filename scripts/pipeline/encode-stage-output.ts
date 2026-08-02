import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { decodeManifest } from '../../lib/bundle/codec.ts'
import type { EncodedBundle } from './encode-types.ts'

/**
 * @description Writes a complete encoded generation beneath a staging directory.
 * @param bundle Candidate bundle with safe bundle-relative paths.
 * @param directory Empty staging directory.
 * @returns Resolves after every resource has been written.
 */
export async function writeBundle(
  bundle: EncodedBundle,
  directory: string
): Promise<void> {
  validatePaths(bundle)
  await makeParents(bundle, directory)
  await Promise.all(
    bundle.files.map((file) =>
      writeFile(join(directory, file.path), file.bytes)
    )
  )
}

/**
 * @description Re-reads staged bytes so validation observes filesystem output.
 * @param source In-memory candidate supplying non-file pipeline metadata.
 * @param directory Staging directory containing written resources.
 * @returns Bundle reconstructed from staged resource bytes.
 */
export async function readStagedBundle(
  source: EncodedBundle,
  directory: string
): Promise<EncodedBundle> {
  const files = await Promise.all(
    source.files.map((file) => readStagedFile(directory, file.path))
  )
  return {
    ...source,
    manifest: decodeManifest(requiredManifest(files)),
    files,
  }
}

function validatePaths(bundle: EncodedBundle): void {
  bundle.files.forEach((file) => {
    if (!safePath(file.path))
      throw new BundleWriteError(`Unsafe bundle path: ${file.path}`)
  })
}

async function makeParents(
  bundle: EncodedBundle,
  directory: string
): Promise<void> {
  const parents = new Set(
    bundle.files.map((file) => dirname(join(directory, file.path)))
  )
  await Promise.all(
    [...parents].map((parent) => mkdir(parent, { recursive: true }))
  )
}

async function readStagedFile(directory: string, path: string) {
  return { path, bytes: await readFile(join(directory, path)) }
}

function requiredManifest(
  files: readonly { path: string; bytes: Uint8Array }[]
): string {
  const file = files.find((entry) => entry.path === 'manifest.json')
  if (!file) throw new BundleWriteError('Staged bundle has no manifest.')
  return new TextDecoder().decode(file.bytes)
}

function safePath(path: string): boolean {
  return (
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path.split('/').every(safeSegment)
  )
}

function safeSegment(segment: string): boolean {
  return segment !== '' && segment !== '.' && segment !== '..'
}

/**
 * @description Signals an unsafe or incomplete staged bundle generation.
 */
export class BundleWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleWriteError'
  }
}
