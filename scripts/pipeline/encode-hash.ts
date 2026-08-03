import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Dirent } from 'node:fs'
import type { EncodedBundle } from './encode-types.ts'

/** Produces a stable digest for every resource in an encoded generation. */
export function bundleHash(bundle: EncodedBundle): string {
  return hashEntries(
    bundle.files.map((file) => [file.path, file.bytes] as const)
  )
}

/** Reads a generation's complete resource tree into the recovery digest. */
export async function readBundleHash(directory: string): Promise<string> {
  const paths = await bundlePaths(directory)
  const entries = await Promise.all(
    paths.map(
      async (path) => [path, await readFile(join(directory, path))] as const
    )
  )
  return hashEntries(entries)
}

function hashEntries(
  entries: readonly (readonly [string, Uint8Array])[]
): string {
  const hash = createHash('sha256')
  const sorted = [...entries].sort(compareEntries)
  sorted.forEach(([path, bytes]) => writeEntry(hash, path, bytes))
  return `sha256-${hash.digest('hex')}`
}

function compareEntries(
  [left]: readonly [string, Uint8Array],
  [right]: readonly [string, Uint8Array]
): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function writeEntry(
  hash: ReturnType<typeof createHash>,
  path: string,
  bytes: Uint8Array
): void {
  hash.update(path)
  hash.update('\0')
  hash.update(bytes)
  hash.update('\0')
}

async function bundlePaths(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => entryPaths(directory, prefix, entry))
  )
  return nested.flat()
}

async function entryPaths(
  directory: string,
  prefix: string,
  entry: Dirent
): Promise<string[]> {
  const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
  return entry.isDirectory()
    ? bundlePaths(join(directory, entry.name), path)
    : [path]
}
