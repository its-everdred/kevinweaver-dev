import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface RepoPipelineState {
  heads: Readonly<Record<string, string>>
  events: number
  lastEventDay: string
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

/** Creates the schema-one baseline used when no prior run has been persisted. */
export function bootstrapState(): PipelineState {
  return { schema: 1, repos: {} }
}

/** Reads a pipeline state file, returning null only when the file is absent. */
export async function readState(path: string): Promise<PipelineState | null> {
  try {
    return parseState(await readFile(path, 'utf8'))
  } catch (error: unknown) {
    if (isMissing(error)) return null
    throw error
  }
}

/** Writes state atomically while preserving forward-compatible unknown keys. */
export async function writeState(
  path: string,
  state: PipelineState
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  await writeFile(temporary, `${JSON.stringify(state)}\n`)
  await rename(temporary, path)
}

/** Merges one repository's fresh extraction result into prior persisted state. */
export function mergeRepoState(
  previous: RepoPipelineState | undefined,
  next: RepoPipelineState
): RepoPipelineState {
  if (next.status === 'ok') return next
  if (previous === undefined) return next
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
  const value: unknown = JSON.parse(text)
  if (!isRecord(value) || value.schema !== 1 || !isRecord(value.repos)) {
    throw new PipelineStateError('Expected pipeline state schema 1.')
  }
  return value as PipelineState
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissing(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

export class PipelineStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PipelineStateError'
  }
}
