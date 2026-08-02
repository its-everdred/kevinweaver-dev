import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

export interface RepoPipelineState {
  databaseId?: number
  stargazerCount?: number
  heads: Readonly<Record<string, string>>
  events: number
  lastEventDay?: string
  status: 'ok' | 'stale' | 'gone'
  lastOk: string | null
  consecutiveFailures: number
  [key: string]: unknown
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

const repoStateSchema = z
  .object({
    heads: z.record(z.string(), z.string()),
    databaseId: z.number().int().positive().optional(),
    stargazerCount: z.number().int().nonnegative().optional(),
    events: z.number().int().nonnegative(),
    lastEventDay: z.string().optional(),
    status: z.enum(['ok', 'stale', 'gone']),
    lastOk: z.string().nullable(),
    consecutiveFailures: z.number().int().nonnegative(),
  })
  .passthrough()

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

/**
 * @description Signals that persisted state cannot safely participate in checks.
 */
export class PipelineStateError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'PipelineStateError'
  }
}

/**
 * @description Creates the schema-one baseline used before a successful run.
 * @returns Empty schema-one state.
 */
export function bootstrapState(): PipelineState {
  return { schema: 1, repos: {} }
}

/**
 * @description Reads state, treating the committed empty bootstrap as no prior run.
 * @param path State file path.
 * @returns Persisted state, or null when no successful state exists.
 */
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

/**
 * @description Atomically writes state while retaining forward-compatible fields.
 * @param path State file path.
 * @param state Fully validated pipeline state.
 * @returns Resolves once state is durably replaced.
 */
export async function writeState(
  path: string,
  state: PipelineState
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(state)}\n`)
  await rename(temporary, path)
}

/**
 * @description Merges repository state without losing facts from cached history.
 * @param previous Prior per-repository state.
 * @param next Newly observed or cached repository state.
 * @returns Merged state retaining unknown fields.
 */
export function mergeRepoState(
  previous: RepoPipelineState | undefined,
  next: RepoPipelineState
): RepoPipelineState {
  if (previous === undefined) return next
  if (next.status === 'ok') return { ...previous, ...next }
  return {
    ...previous,
    ...next,
    heads: hasHeads(next) ? next.heads : previous.heads,
    events: Math.max(previous.events, next.events),
    lastEventDay: latestDay(previous.lastEventDay, next.lastEventDay),
    lastOk: previous.lastOk,
    consecutiveFailures: Math.max(
      previous.consecutiveFailures + 1,
      next.consecutiveFailures
    ),
  }
}

function hasHeads(state: RepoPipelineState): boolean {
  return Object.keys(state.heads).length > 0
}

function latestDay(
  left: string | undefined,
  right: string | undefined
): string | undefined {
  if (!left) return right
  if (!right) return left
  return left > right ? left : right
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
