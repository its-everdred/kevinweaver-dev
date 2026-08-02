import { rm } from 'node:fs/promises'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readState } from './state.ts'
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
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { commitPipelineState, discardPipelineState, recoverPipelineState, stagePipelineState } from './encode-state-journal.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readStagedBundle, writeBundle } from './encode-stage-output.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { PipelineAvailabilityError, UpstreamUnavailableError } from './encode-stage-runtime.ts'
export { writeBundle }
/**
 * @description Atomically replaces the public bundle with a staged generation.
 * @param tempDir Complete staged generation directory.
 * @param targetDir Public generation directory.
 * @returns Resolves after the staged generation becomes visible.
 */
export async function promoteBundle(
  tempDir: string,
  targetDir: string
): Promise<void> {
  await promote(tempDir, targetDir)
}

/**
 * @description Runs the encoder pipeline and returns its stable process status.
 * @param argv Command-line arguments without the executable and script names.
 * @returns Zero on publication or a classified non-zero refusal code.
 */
export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  if (argv.includes('--help')) {
    console.log(usage())
    return 0
  }
  let temporary: string | undefined
  let result: number
  try {
    const options = readOptions(argv)
    const run = await prepareRun(options)
    temporary = temporaryPath(options.out)
    const staged = await stageRun(run, temporary)
    const validation = validateBundle(staged.bundle, staged.previous)
    result = validation.ok
      ? await publishOrValidate(staged, options)
      : report(validation.findings, refusalCode(staged.bundle))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pipeline failed')
    result = exitCode(error)
  }
  return cleanupResult(temporary, result)
}

function exitCode(error: unknown): number {
  if (error instanceof UpstreamUnavailableError) return 3
  if (error instanceof PipelineAvailabilityError) return 2
  return 1
}

type PreparedRun = {
  bundle: EncodedBundle
  input: EncodeInput
  previous: PipelineState | null
  statePath: string
}

type StagedRun = PreparedRun & { temporary: string }

async function prepareRun(options: Options): Promise<PreparedRun> {
  const statePath = options.state ?? 'data/.pipeline-state.json'
  const target = options.out ?? 'public/data/v1'
  const persisted = await readState(statePath)
  await recoverPromotion(target, persisted)
  const previous = await recoverPipelineState(statePath, target, persisted)
  const input = await resolveInput(options.input, previous, target)
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
  run: StagedRun,
  output: string | undefined
): Promise<void> {
  const target = output ?? 'public/data/v1'
  await persistState(run, target)
}

async function publishOrValidate(
  run: StagedRun,
  options: Options
): Promise<number> {
  if (!options.dryRun) await publish(run, options.out)
  return 0
}

async function stageRun(
  run: PreparedRun,
  temporary: string
): Promise<StagedRun> {
  await cleanTemporary(temporary)
  await writeBundle(run.bundle, temporary)
  return {
    ...run,
    bundle: await readStagedBundle(run.bundle, temporary),
    temporary,
  }
}

function temporaryPath(output: string | undefined): string {
  return `${output ?? 'public/data/v1'}.tmp-${process.pid}`
}

async function cleanTemporary(temporary: string): Promise<void> {
  await rm(temporary, { recursive: true, force: true })
}

async function cleanupResult(
  temporary: string | undefined,
  result: number
): Promise<number> {
  if (!temporary) return result
  try {
    await cleanTemporary(temporary)
    return result
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Staged bundle cleanup failed'
    )
    return result === 0 ? 1 : result
  }
}

async function persistState(run: StagedRun, target: string): Promise<void> {
  await persistWith(
    {
      stage: stagePipelineState,
      promote: promoteBundle,
      commit: commitPipelineState,
      rollback: rollbackPromotion,
      discard: discardPipelineState,
      finalize: finalizePromotion,
    },
    run.statePath,
    nextState(run.previous, run.bundle, run.input),
    run.temporary,
    target
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
