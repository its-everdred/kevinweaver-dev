import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { z } from 'zod'

// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { dayIndex, decodeManifest, encodeBundle as encodeCodec } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BUNDLE_VERSION } from '../../lib/bundle/schema.ts'
import type {
  Manifest,
  RepoCountDefinition,
  RepoRecord,
  SortableEvent,
} from '../../lib/bundle/schema.ts'
import type { PipelineState, RepoPipelineState } from './state.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { PipelineStateError, bootstrapState, mergeRepoState, readState, writeState } from './state.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'

export interface RawEvent {
  day: string
  repo: string
  sha: string
  path: string
  actor: 0 | 1
}
export interface RepoInput {
  n: string
  ghId: number
  stars: number
  first: string
  last: string
  private: boolean
  status: 'ok' | 'stale' | 'gone'
}
export interface SamlCanary {
  ok: boolean
  org: string
  checkedAt: string
}
export interface EncodeInput {
  events: readonly RawEvent[]
  repos: readonly RepoInput[]
  grid: {
    start: string
    e: readonly number[]
    a: readonly number[]
    p: readonly number[]
    bands: readonly number[]
  }
  combinedTotal: number
  generatedAt: string
  commit: string
  repoCount: number
  repoCountDefinition: RepoCountDefinition
  refs: 'all' | 'head'
  chunkSize: number
  dictSliceGuardGzipBytes: number
  samlCanary: SamlCanary
  degraded: readonly ('calendar' | 'private' | 'events')[]
}
export interface EncodedFile {
  path: string
  bytes: Uint8Array
}
export interface EncodedBundle {
  manifest: Manifest
  files: readonly EncodedFile[]
  samlCanary: SamlCanary
  combinedTotal: number
}

const inputSchema = z.object({
  events: z.array(
    z.object({
      day: z.string(),
      repo: z.string(),
      sha: z.string(),
      path: z.string(),
      actor: z.union([z.literal(0), z.literal(1)]),
    })
  ),
  repos: z.array(
    z.object({
      n: z.string(),
      ghId: z.number().int().nonnegative(),
      stars: z.number().int().nonnegative(),
      first: z.string(),
      last: z.string(),
      private: z.boolean(),
      status: z.enum(['ok', 'stale', 'gone']),
    })
  ),
  grid: z.object({
    start: z.string(),
    e: z.array(z.number().int().nonnegative()).min(1),
    a: z.array(z.number().int().nonnegative()),
    p: z.array(z.number().int().nonnegative()),
    bands: z.array(z.number().int().nonnegative()),
  }),
  combinedTotal: z.number().int().nonnegative(),
  generatedAt: z.string(),
  commit: z.string(),
  repoCount: z.number().int().nonnegative(),
  repoCountDefinition: z.enum([
    'publicRepos',
    'ownerPublic',
    'ownerPublicNonFork',
    'withMemberAffiliations',
    'repositoriesContributedTo',
  ]),
  refs: z.enum(['all', 'head']),
  chunkSize: z.number().int().positive(),
  dictSliceGuardGzipBytes: z.number().int().nonnegative(),
  samlCanary: z.object({
    ok: z.boolean(),
    org: z.string(),
    checkedAt: z.string(),
  }),
  degraded: z.array(z.enum(['calendar', 'private', 'events'])),
})

/** Encodes canonical inputs through KW-012's deterministic Scheme D codec. */
export function encodeBundle(input: EncodeInput): EncodedBundle {
  const repos = repoRecords(input)
  const windowEnd = dayAt(input.grid.start, input.grid.e.length - 1)
  const encoded = encodeCodec(
    {
      meta: {
        v: BUNDLE_VERSION,
        generatedAt: input.generatedAt,
        commit: input.commit,
        windowStart: input.grid.start,
        windowEnd,
        dayCount: input.grid.e.length,
        repoCount: input.repoCount,
        repoCountDefinition: input.repoCountDefinition,
        actors: [
          { id: 0, login: 'its-everdred', kind: 'human' },
          { id: 1, login: 'its-applekid', kind: 'agent' },
        ],
        degraded: input.degraded,
      },
      repos,
      grid: {
        start: input.grid.start,
        dayCount: input.grid.e.length,
        human: input.grid.e,
        agent: input.grid.a,
        privateMonthly: input.grid.p,
        privateStart: input.grid.start.slice(0, 7),
        bands: input.grid.bands,
      },
      events: sortableEvents(input.events, repos, windowEnd),
    },
    {
      chunkSize: input.chunkSize,
      maxDictSliceGzipBytes: input.dictSliceGuardGzipBytes,
      gzipSize: (text) => gzipSync(`${text}\n`).byteLength,
      sha256: (text) =>
        `sha256-${createHash('sha256').update(`${text}\n`).digest('hex')}`,
    }
  )
  const manifest = decodeManifest(requiredFile(encoded.files, 'manifest.json'))
  return {
    manifest,
    samlCanary: input.samlCanary,
    combinedTotal: input.combinedTotal,
    files: [...encoded.files].map(([path, text]) => ({
      path,
      bytes: Buffer.from(`${text}\n`),
    })),
  }
}

/** Writes all bundle resources below a caller-selected temporary directory. */
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

/** Atomically replaces the public bundle only after validation has succeeded. */
export async function promoteBundle(
  tempDir: string,
  targetDir: string
): Promise<void> {
  const previous = `${targetDir}.previous`
  await rm(previous, { recursive: true, force: true })
  try {
    await rename(targetDir, previous)
  } catch (error: unknown) {
    if (!isMissing(error)) throw error
  }
  try {
    await rename(tempDir, targetDir)
  } catch (error: unknown) {
    await restorePrevious(previous, targetDir)
    throw error
  }
  await rm(previous, { recursive: true, force: true })
}

/** Runs the fixture-friendly data pipeline entry point and returns its exit code. */
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
    const previous = await readState(
      options.state ?? 'data/.pipeline-state.json'
    )
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
    await writeState(
      options.state ?? 'data/.pipeline-state.json',
      nextState(previous, bundle, input)
    )
    return 0
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Pipeline failed')
    return error instanceof PipelineStateError ? 1 : 3
  }
}

class UpstreamUnavailableError extends Error {
  constructor(specifier: string) {
    super(`Upstream pipeline input is unavailable: ${specifier}`)
    this.name = 'UpstreamUnavailableError'
  }
}
class BundleWriteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BundleWriteError'
  }
}
type Options = {
  input?: string
  out?: string
  state?: string
  generatedAt?: string
  dryRun: boolean
}

function repoRecords(input: EncodeInput): RepoRecord[] {
  if (input.repoCount !== input.repos.length)
    throw new Error('Repo count does not match repositories.')
  const counts = eventCounts(input.events)
  return [...input.repos]
    .sort((left, right) => (left.n < right.n ? -1 : left.n > right.n ? 1 : 0))
    .map((repo, id) => {
      if (repo.private)
        throw new Error('Private repositories cannot enter the bundle.')
      const events = input.events.filter((event) => event.repo === repo.n)
      return {
        id,
        ghId: repo.ghId,
        name: repo.n,
        short: repo.n.split('/').at(-1) ?? repo.n,
        actor: dominantActor(events),
        vol: counts.get(repo.n) ?? 0,
        stars: repo.stars,
        from: repo.first,
        to: repo.last,
        private: false,
        ext: extensions(events),
        status: repo.status,
      }
    })
}

function sortableEvents(
  events: readonly RawEvent[],
  repos: readonly RepoRecord[],
  windowEnd: string
): SortableEvent[] {
  const ids = new Map(repos.map((repo) => [repo.name, repo.id]))
  return events.map((event) => ({
    ...event,
    day: dayIndex(event.day, windowEnd),
    repo: requiredId(ids, event.repo),
    repoName: event.repo,
  }))
}

function eventCounts(events: readonly RawEvent[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const event of events)
    counts.set(event.repo, (counts.get(event.repo) ?? 0) + 1)
  return counts
}

function dominantActor(events: readonly RawEvent[]): 0 | 1 {
  if (events.length === 0)
    throw new Error('Repository has no events to establish its dominant actor.')
  const agentCount = events.filter((event) => event.actor === 1).length
  return agentCount > events.length - agentCount ? 1 : 0
}

function extensions(events: readonly RawEvent[]): string[] {
  return [
    ...new Set(events.map((event) => extension(event.path)).filter(Boolean)),
  ]
    .sort()
    .slice(0, 8)
}

function extension(path: string): string {
  const basename = path.slice(path.lastIndexOf('/') + 1)
  const dot = basename.lastIndexOf('.')
  return dot > 0 && dot < basename.length - 1 ? basename.slice(dot + 1) : ''
}

function dayAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10)
}
function requiredFile(
  files: ReadonlyMap<string, string>,
  path: string
): string {
  const value = files.get(path)
  if (value === undefined) throw new Error(`Missing bundle resource: ${path}`)
  return value
}
function requiredId(ids: ReadonlyMap<string, number>, repo: string): number {
  const id = ids.get(repo)
  if (id === undefined)
    throw new Error(`Event references unknown repository: ${repo}`)
  return id
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
  } catch (error: unknown) {
    if (!isMissing(error)) throw error
  }
}

function readOptions(argv: readonly string[]): Options {
  const options: Options = { dryRun: argv.includes('--dry-run') }
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--dry-run') continue
    if (
      flag !== '--input' &&
      flag !== '--out' &&
      flag !== '--state' &&
      flag !== '--generated-at'
    )
      throw new Error(`Unknown option: ${flag}`)
    const value = argv[index + 1]
    if (!value || value.startsWith('--'))
      throw new Error(`Missing value for ${flag}`)
    if (flag === '--input') options.input = value
    if (flag === '--out') options.out = value
    if (flag === '--state') options.state = value
    if (flag === '--generated-at') options.generatedAt = value
    index += 1
  }
  return options
}

async function resolveInput(path: string | undefined): Promise<EncodeInput> {
  if (!path) {
    await loadStage('./extract.ts', 'extractAll')
    throw new UpstreamUnavailableError('--input')
  }
  const parsed = inputSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
  if (!parsed.success)
    throw new Error(`Invalid --input: ${parsed.error.message}`)
  return parsed.data
}

async function loadStage(specifier: string, binding: string): Promise<void> {
  let stageModule: Record<string, unknown>
  try {
    stageModule = await import(specifier)
  } catch {
    throw new UpstreamUnavailableError(specifier)
  }
  const value = stageModule[binding]
  if (typeof value !== 'function')
    throw new UpstreamUnavailableError(`${specifier}#${binding}`)
}

function nextState(
  previous: PipelineState | null,
  bundle: EncodedBundle,
  input: EncodeInput
): PipelineState {
  return {
    ...(previous ?? bootstrapState()),
    schema: 1,
    lastRun: bundle.manifest.generatedAt,
    refs: input.refs,
    repoCountDefinition: input.repoCountDefinition,
    samlCanary: bundle.samlCanary.ok ? 'ok' : 'failed',
    combinedTotal: bundle.combinedTotal,
    events: bundle.manifest.events,
    repos: Object.fromEntries(
      input.repos.map((repo) => [
        repo.n,
        repositoryState(
          previous?.repos[repo.n],
          repo,
          input,
          bundle.manifest.generatedAt
        ),
      ])
    ),
  }
}

function repositoryState(
  previous: RepoPipelineState | undefined,
  repo: RepoInput,
  input: EncodeInput,
  generatedAt: string
): RepoPipelineState {
  const eventCount = input.events.filter(
    (event) => event.repo === repo.n
  ).length
  const next: RepoPipelineState = {
    heads: previous?.heads ?? {},
    events: eventCount,
    lastEventDay: repo.last,
    status: repo.status,
    lastOk: repo.status === 'ok' ? generatedAt : (previous?.lastOk ?? null),
    consecutiveFailures:
      repo.status === 'ok' ? 0 : (previous?.consecutiveFailures ?? 0),
  }
  return mergeRepoState(previous, next)
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
