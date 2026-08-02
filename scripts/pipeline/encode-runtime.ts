import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { PipelineStateError, readState, writeState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode-bundle.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readOptions, resolveInput } from './encode-input.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { nextState } from './encode-state.ts'
import type { EncodedBundle, EncodeInput } from './encode-types.ts'
import type { Options } from './encode-input.ts'
import type { PipelineState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { finalizePromotion, promote, rollbackPromotion } from './encode-promote.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { recoverPromotion } from './encode-promote.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { persistWith } from './encode-transaction.ts'
export async function writeBundle(
  bundle: EncodedBundle,
  dir: string
): Promise<void> {
  validatePaths(bundle)
  await mkdirParents(bundle, dir)
  await Promise.all(
    bundle.files.map((file) => writeFile(join(dir, file.path), file.bytes))
  )
}

function validatePaths(bundle: EncodedBundle): void {
  bundle.files.forEach((file) => {
    if (!isBundlePath(file.path))
      throw new BundleWriteError(`Unsafe bundle path: ${file.path}`)
  })
}

async function mkdirParents(bundle: EncodedBundle, dir: string): Promise<void> {
  const parents = new Set(
    bundle.files.map((file) => dirname(join(dir, file.path)))
  )
  await Promise.all(
    [...parents].map((parent) => mkdir(parent, { recursive: true }))
  )
}
export async function promoteBundle(
  tempDir: string,
  targetDir: string
): Promise<void> {
  await promote(tempDir, targetDir)
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
    const run = await prepareRun(options)
    const validation = validateBundle(run.bundle, run.previous)
    if (!validation.ok)
      return report(validation.findings, refusalCode(run.bundle))
    if (options.dryRun) return 0
    await publish(run, options.out)
    return 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pipeline failed')
    return error instanceof PipelineStateError ? 1 : 3
  }
}

type PreparedRun = {
  bundle: EncodedBundle
  input: EncodeInput
  previous: PipelineState | null
  statePath: string
}

async function prepareRun(options: Options): Promise<PreparedRun> {
  const statePath = options.state ?? 'data/.pipeline-state.json'
  const previous = await readState(statePath)
  await recoverPromotion(options.out ?? 'public/data/v1', previous)
  const input = await resolveInput(options.input)
  const bundle = encodeBundle(withGeneratedAt(input, options.generatedAt))
  return { bundle, input, previous, statePath }
}

function withGeneratedAt(
  input: EncodeInput,
  generatedAt: string | undefined
): EncodeInput {
  return { ...input, generatedAt: generatedAt ?? currentSecond() }
}

function currentSecond(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function refusalCode(bundle: EncodedBundle): number {
  return bundle.samlCanary.ok && !bundle.manifest.degraded.includes('calendar')
    ? 1
    : 2
}

async function publish(
  run: PreparedRun,
  output: string | undefined
): Promise<void> {
  const target = output ?? 'public/data/v1'
  const temporary = `${target}.tmp-${process.pid}`
  await rm(temporary, { recursive: true, force: true })
  await writeBundle(run.bundle, temporary)
  await promoteBundle(temporary, target)
  await persistState(run, target)
}

async function persistState(run: PreparedRun, target: string): Promise<void> {
  await persistWith(
    {
      write: writeState,
      rollback: rollbackPromotion,
      finalize: finalizePromotion,
    },
    run.statePath,
    nextState(run.previous, run.bundle, run.input),
    target
  )
}
class BundleWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleWriteError'
  }
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
