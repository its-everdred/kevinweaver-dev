import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
// prettier-ignore
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { encodeBundle as encodeCodec, dayIndex } from '../../lib/bundle/codec.ts'
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { BUNDLE_VERSION } from '../../lib/bundle/schema.ts'
import type {
  Manifest,
  RepoCountDefinition,
  RepoRecord,
  SortableEvent,
} from '../../lib/bundle/schema.ts'
// prettier-ignore
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { bootstrapState, readState, writeState } from './state.ts'
// prettier-ignore
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
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
  readonly samlCanary: SamlCanary
  readonly combinedTotal: number
}

/** Encodes canonical inputs through the shared Scheme D codec. */
export function encodeBundle(input: EncodeInput): EncodedBundle {
  const repos = repoRecords(input)
  const windowEnd = dayAt(input.grid.start, input.grid.e.length - 1)
  const events = sortableEvents(input.events, repos, windowEnd)
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
      events,
    },
    {
      chunkSize: input.chunkSize,
      maxDictSliceGzipBytes: input.dictSliceGuardGzipBytes,
      gzipSize: (text) => gzipSync(text).byteLength,
      sha256: (text) =>
        `sha256-${createHash('sha256').update(text).digest('hex')}`,
    }
  )
  const manifest = JSON.parse(
    required(encoded.files, 'manifest.json')
  ) as Manifest
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
  const oldDir = `${targetDir}.previous`
  await rm(oldDir, { recursive: true, force: true })
  try {
    await rename(targetDir, oldDir)
  } catch (error: unknown) {
    if (!isMissing(error)) throw error
  }
  await rename(tempDir, targetDir)
  await rm(oldDir, { recursive: true, force: true })
}

/** Runs the fixture-friendly command line entry point without network access. */
export async function main(
  argv: readonly string[] = process.argv.slice(2)
): Promise<number> {
  const inputPath = option(argv, '--input')
  if (!inputPath) {
    console.error('Missing --input; upstream stages are unavailable.')
    return 3
  }
  try {
    const input = JSON.parse(await readFile(inputPath, 'utf8')) as EncodeInput
    const generatedAt = option(argv, '--generated-at')
    const bundle = encodeBundle(generatedAt ? { ...input, generatedAt } : input)
    const statePath = option(argv, '--state') ?? 'data/.pipeline-state.json'
    const previous = await readState(statePath)
    const result = validateBundle(bundle, previous)
    if (!result.ok) {
      result.findings.forEach((finding) => console.error(finding.message))
      return bundle.samlCanary.ok ? 1 : 2
    }
    if (argv.includes('--dry-run')) return 0
    const target = option(argv, '--out') ?? 'public/data/v1'
    const temp = `${target}.tmp-${process.pid}`
    await rm(temp, { recursive: true, force: true })
    await writeBundle(bundle, temp)
    await promoteBundle(temp, target)
    await writeState(statePath, {
      ...(previous ?? bootstrapState()),
      schema: 1,
      lastRun: bundle.manifest.generatedAt,
      refs: input.refs,
      repoCountDefinition: input.repoCountDefinition,
      samlCanary: bundle.samlCanary.ok ? 'ok' : 'failed',
      combinedTotal: bundle.combinedTotal,
      events: bundle.manifest.events,
    })
    return 0
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Pipeline failed')
    return 3
  }
}

function repoRecords(input: EncodeInput): RepoRecord[] {
  if (input.repoCount !== input.repos.length)
    throw new Error('Repo count does not match repositories.')
  return [...input.repos]
    .sort((a, b) => a.n.localeCompare(b.n))
    .map((repo, id) => {
      if (repo.private)
        throw new Error('Private repositories cannot enter the bundle.')
      const volume = input.events.filter(
        (event) => event.repo === repo.n
      ).length
      return {
        id,
        ghId: id,
        name: repo.n,
        short: repo.n.split('/').at(-1) ?? repo.n,
        actor: 0,
        vol: volume,
        stars: 0,
        from: repo.first,
        to: repo.last,
        private: false,
        ext: [],
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
function dayAt(start: string, offset: number): string {
  return new Date(Date.parse(`${start}T00:00:00Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10)
}
function required(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Missing bundle resource: ${key}`)
  return value
}
function requiredId(map: ReadonlyMap<string, number>, key: string): number {
  const value = map.get(key)
  if (value === undefined)
    throw new Error(`Event references unknown repository: ${key}`)
  return value
}
function option(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index === -1 ? undefined : argv[index + 1]
}
function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  )
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().then((code) => {
    process.exitCode = code
  })
