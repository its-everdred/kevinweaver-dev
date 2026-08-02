import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { PipelineStateError, readState, writeState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode-bundle.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readOptions, resolveInput } from './encode-input.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { nextState } from './encode-state.ts'
import type { EncodedBundle } from './encode-types.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'
export async function writeBundle(
  bundle: EncodedBundle,
  dir: string
): Promise<void> {
  await Promise.all(
    bundle.files.map(async (file) => {
      if (!isBundlePath(file.path))
        throw new BundleWriteError(`Unsafe bundle path: ${file.path}`)
      const path = join(dir, file.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file.bytes)
    })
  )
}
export async function promoteBundle(
  tempDir: string,
  targetDir: string
): Promise<void> {
  const previous = `${targetDir}.previous`
  await rm(previous, { recursive: true, force: true })
  try {
    await rename(targetDir, previous)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  try {
    await rename(tempDir, targetDir)
  } catch (error) {
    await restorePrevious(previous, targetDir)
    throw error
  }
  await rm(previous, { recursive: true, force: true })
}
export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  if (argv.includes('--help')) {
    console.log(usage())
    return 0
  }
  try {
    const options = readOptions(argv)
    const input = await resolveInput(options.input)
    const bundle = encodeBundle(
      options.generatedAt
        ? { ...input, generatedAt: options.generatedAt }
        : input
    )
    const statePath = options.state ?? 'data/.pipeline-state.json'
    const previous = await readState(statePath)
    const validation = validateBundle(bundle, previous)
    if (!validation.ok)
      return report(
        validation.findings,
        bundle.samlCanary.ok && !bundle.manifest.degraded.includes('calendar')
          ? 1
          : 2
      )
    if (options.dryRun) return 0
    const target = options.out ?? 'public/data/v1'
    const temporary = `${target}.tmp-${process.pid}`
    await rm(temporary, { recursive: true, force: true })
    await writeBundle(bundle, temporary)
    await promoteBundle(temporary, target)
    await writeState(statePath, nextState(previous, bundle, input))
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pipeline failed')
    return error instanceof PipelineStateError ? 1 : 3
  }
}
class BundleWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleWriteError'
  }
}
function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
function isBundlePath(path: string): boolean {
  return (
    !path.startsWith('/') &&
    !path.includes('\\') &&
    path
      .split('/')
      .every((segment) => segment !== '' && segment !== '.' && segment !== '..')
  )
}
async function restorePrevious(
  previous: string,
  target: string
): Promise<void> {
  try {
    await rename(previous, target)
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}
function report(
  findings: readonly { message: string }[],
  code: number
): number {
  findings.forEach((finding) => console.error(finding.message))
  return code
}
function usage(): string {
  return 'Usage: data:build --input <encode-input.json> [--out <dir>] [--state <path>] [--generated-at <rfc3339>] [--dry-run]'
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().then((code) => {
    process.exitCode = code
  })
