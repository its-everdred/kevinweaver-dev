import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

export interface RepoPipelineState {
  heads: Readonly<Record<string, string>>
  events: number
  lastEventDay?: string
  status: 'ok' | 'stale' | 'gone'
  lastOk: string | null
  consecutiveFailures: number
}

export interface PipelineState {
  schema: 1
  lastRun?: string
  refs?: 'all' | 'head'
  repoCountDefinition?: string
  samlCanary?: 'ok' | 'failed'
  combinedTotal?: number
  events?: number
  repos: Readonly<Record<string, RepoPipelineState>>
  calendar?: Readonly<Record<string, unknown>>
  private?: Readonly<Record<string, number>>
  bundleHash?: string
  [key: string]: unknown
}

const repoStateSchema = z.object({
  heads: z.record(z.string(), z.string()),
  events: z.number().int().nonnegative(),
  lastEventDay: z.string().optional(),
  status: z.enum(['ok', 'stale', 'gone']),
  lastOk: z.string().nullable(),
  consecutiveFailures: z.number().int().nonnegative(),
})

const stateSchema = z
  .object({
    schema: z.literal(1),
    lastRun: z.string().optional(),
    refs: z.enum(['all', 'head']).optional(),
    repoCountDefinition: z.string().optional(),
    samlCanary: z.enum(['ok', 'failed']).optional(),
    combinedTotal: z.number().int().nonnegative().optional(),
    events: z.number().int().nonnegative().optional(),
    repos: z.record(z.string(), repoStateSchema),
    calendar: z.record(z.string(), z.unknown()).optional(),
    private: z.record(z.string(), z.number().int().nonnegative()).optional(),
    bundleHash: z.string().optional(),
  })
  .passthrough()

/** Raises when a persisted state cannot safely participate in regression checks. */
export class PipelineStateError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'PipelineStateError'
  }
}

/** Creates the schema-one baseline used when no prior run has been persisted. */
export function bootstrapState(): PipelineState {
  return { schema: 1, repos: {} }
}

/** Reads a pipeline state file, returning null only when the file is absent. */
export async function readState(path: string): Promise<PipelineState | null> {
  try {
    const state = parseState(await readFile(path, 'utf8'))
    return isBootstrap(state) ? null : state
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
}

function isBootstrap(state: PipelineState): boolean {
  return (
    Object.keys(state).length === 2 && Object.keys(state.repos).length === 0
  )
}

/** Writes state atomically while retaining unknown forward-compatible fields. */
export async function writeState(
  path: string,
  state: PipelineState
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(state)}\n`)
  await rename(temporary, path)
}

/** Merges a repository result without allowing stale or gone records to lose history. */
export function mergeRepoState(
  previous: RepoPipelineState | undefined,
  next: RepoPipelineState
): RepoPipelineState {
  if (next.status === 'ok' || previous === undefined) return next
  return {
    ...next,
    heads: previous.heads,
    events: previous.events,
    lastEventDay: previous.lastEventDay,
    lastOk: previous.lastOk,
    consecutiveFailures: previous.consecutiveFailures + 1,
  }
}

function parseState(text: string): PipelineState {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch (error: unknown) {
    throw new PipelineStateError('Expected pipeline state schema 1.', error)
  }
  const parsed = stateSchema.safeParse(value)
  if (!parsed.success)
    throw new PipelineStateError(
      'Expected pipeline state schema 1.',
      parsed.error
    )
  return parsed.data
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
