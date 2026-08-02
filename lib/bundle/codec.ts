// @ts-expect-error Node type stripping requires explicit TypeScript extensions.
import { frontCode, frontDecode } from './frontcode.ts'
import {
  BAND_COUNT,
  BUNDLE_VERSION,
  chunkFileName,
  DEFAULT_CHUNK_SIZE,
  dictFileName,
  MAX_DICT_SLICE_GZIP_BYTES,
  // @ts-expect-error Node type stripping requires explicit TypeScript extensions.
} from './schema.ts'
import type {
  Actor,
  ActorId,
  BundleEvent,
  BundleMeta,
  ChunkWire,
  DictSliceWire,
  GridSeries,
  IsoDay,
  Manifest,
  RepoCountDefinition,
  RepoRecord,
  RepoStatus,
  RepoWire,
  SortableEvent,
} from './schema.ts'

export interface BundleInput {
  meta: BundleMeta
  repos: readonly RepoRecord[]
  grid: GridSeries
  events: readonly SortableEvent[]
}

export interface EncodeOptions {
  chunkSize?: number
  gzipSize?: (text: string) => number
  maxDictSliceGzipBytes?: number
  sha256?: (text: string) => string
}

export interface EncodedBundle {
  files: ReadonlyMap<string, string>
  chunkCount: number
  eventCount: number
  dictLength: number
  dictSliceGzipBytes: readonly number[] | null
}

export interface DecodedBundle {
  manifest: Manifest
  repos: RepoRecord[]
  grid: GridSeries
  paths: string[]
  events: BundleEvent[]
}

interface GridWire {
  start: IsoDay
  n: number
  e: readonly number[]
  a: readonly number[]
  p: readonly number[]
  pStart: string
  bands: readonly number[]
}

interface IndexedEvent {
  event: SortableEvent
  pathId: number
}

interface EventRange {
  start: number
  end: number
}

interface Dictionary {
  paths: string[]
  firstUses: number[]
  events: IndexedEvent[]
}

interface SplitResult {
  ranges: EventRange[]
  sizes: number[]
}

/** Error raised when bundle input or wire data violates the v1 contract. */
export class BundleCodecError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'BundleCodecError'
  }
}

/** Encodes a validated domain bundle into deterministic JSON files. */
export function encodeBundle(
  input: BundleInput,
  options: EncodeOptions = {}
): EncodedBundle {
  const settings = resolveOptions(options)
  validateInput(input)
  const sorted = [...input.events].sort(compareEvents)
  const dictionary = buildDictionary(sorted)
  const split = splitRanges(
    initialRanges(sorted.length, settings.chunkSize),
    dictionary,
    settings.gzipSize,
    settings.maxDictSliceGzipBytes
  )
  const dataFiles = encodeDataFiles(input, dictionary, split.ranges)
  const manifest = buildManifest(
    input.meta,
    settings.chunkSize,
    split.ranges.length,
    sorted.length,
    integrityFor(dataFiles, settings.sha256)
  )
  const files = new Map<string, string>([
    ['manifest.json', JSON.stringify(manifest)],
  ])
  for (const [name, text] of dataFiles) files.set(name, text)
  return {
    files,
    chunkCount: split.ranges.length,
    eventCount: sorted.length,
    dictLength: dictionary.paths.length,
    dictSliceGzipBytes: settings.gzipSize === undefined ? null : split.sizes,
  }
}

/** Decodes a complete v1 file map and checks its cross-file invariants. */
export function decodeBundle(
  files: ReadonlyMap<string, string>
): DecodedBundle {
  const manifest = decodeManifest(requiredFile(files, 'manifest.json'))
  const repos = decodeRepos(requiredFile(files, 'repos.json'))
  const grid = decodeGrid(requiredFile(files, 'grid.json'))
  const eventDayCount = eventSpanDayCount(manifest)
  assert(
    manifest.repoCount === repos.length,
    'Manifest repo count does not match repos.'
  )
  assert(
    grid.start === manifest.windowStart,
    'Grid start does not match manifest.'
  )
  assert(
    grid.dayCount === manifest.dayCount,
    'Grid day count does not match manifest.'
  )
  const paths: string[] = []
  const events: BundleEvent[] = []
  let previousDay = -1
  for (let index = 0; index < manifest.chunks; index += 1) {
    const slice = decodeDictSlice(requiredFile(files, dictFileName(index)))
    assert(slice.from === paths.length, 'Dictionary slices must be contiguous.')
    paths.push(...slice.paths)
    const chunk = decodeChunk(requiredFile(files, chunkFileName(index)))
    const expanded = expandChunk(chunk, paths)
    assert(chunk.b >= previousDay, 'Chunks must be newest-first.')
    expanded.forEach((event) => {
      assert(
        event.repo < repos.length,
        'Chunk references an unknown repository.'
      )
      assert(
        event.day < eventDayCount,
        'Chunk event falls outside the event span.'
      )
    })
    previousDay = expanded.at(-1)?.day ?? previousDay
    events.push(...expanded)
  }
  assert(
    events.length === manifest.events,
    'Manifest event count does not match chunks.'
  )
  return { manifest, repos, grid, paths, events }
}

/** Decodes and validates manifest.json without loading any other bundle file. */
export function decodeManifest(text: string): Manifest {
  const value = recordFromJson(text)
  const manifest: Manifest = {
    v: readVersion(value, 'v'),
    generatedAt: readString(value, 'generatedAt'),
    commit: readString(value, 'commit'),
    days: readEventSpan(value, 'days'),
    refs: readRefs(value, 'refs'),
    windowStart: readIsoDay(value, 'windowStart'),
    windowEnd: readIsoDay(value, 'windowEnd'),
    dayCount: readPositiveInteger(value, 'dayCount'),
    repoCount: readNonNegativeInteger(value, 'repoCount'),
    repoCountDefinition: readRepoCountDefinition(value, 'repoCountDefinition'),
    actors: readActors(value, 'actors'),
    degraded: readStringArray(value, 'degraded'),
    chunkSize: readPositiveInteger(value, 'chunkSize'),
    chunks: readNonNegativeInteger(value, 'chunks'),
    events: readNonNegativeInteger(value, 'events'),
    integrity: readStringRecord(value, 'integrity'),
  }
  validateMeta(manifest)
  return manifest
}

/** Decodes repos.json and derives the public renderer representation. */
export function decodeRepos(text: string): RepoRecord[] {
  const values = arrayFromJson(text)
  const repos = values.map((value) => repoFromWire(recordFromValue(value)))
  validateRepos(repos)
  return repos
}

/** Decodes compact grid.json into its named domain fields. */
export function decodeGrid(text: string): GridSeries {
  const value = recordFromJson(text)
  const grid: GridSeries = {
    start: readIsoDay(value, 'start'),
    dayCount: readPositiveInteger(value, 'n'),
    human: readNumberArray(value, 'e'),
    agent: readNumberArray(value, 'a'),
    privateMonthly: readNumberArray(value, 'p'),
    privateStart: readIsoMonth(value, 'pStart'),
    bands: readNumberArray(value, 'bands'),
  }
  validateGrid(grid)
  return grid
}

/** Decodes one independently usable columnar event file. */
export function decodeChunk(text: string): ChunkWire {
  const value = recordFromJson(text)
  const chunk: ChunkWire = {
    b: readNonNegativeInteger(value, 'b'),
    d: readNumberArray(value, 'd'),
    r: readNumberArray(value, 'r'),
    p: readNumberArray(value, 'p'),
    a: readActorArray(value, 'a'),
  }
  validateChunk(chunk)
  return chunk
}

/** Decodes one self-contained front-coded dictionary slice. */
export function decodeDictSlice(text: string): {
  from: number
  paths: string[]
} {
  const value = recordFromJson(text)
  const from = readNonNegativeInteger(value, 'from')
  const count = readNonNegativeInteger(value, 'n')
  const paths = frontDecode(readString(value, 'fc'))
  assert(paths.length === count, 'Dictionary slice length does not match n.')
  return { from, paths }
}

/** Expands a validated event chunk using the dictionary available through its slice. */
export function expandChunk(
  chunk: ChunkWire,
  paths: readonly string[]
): BundleEvent[] {
  validateChunk(chunk)
  let day = chunk.b
  return chunk.d.map((delta, index) => {
    day += delta
    const repo = chunk.r[index]!
    const pathId = chunk.p[index]!
    const actor = chunk.a[index]!
    const path = paths[pathId]
    assert(path !== undefined, 'Chunk references an unavailable path.')
    return { day, repo, path, actor }
  })
}

/** Sorts events by newest day, then raw repository name, SHA, and path. */
export function compareEvents(a: SortableEvent, b: SortableEvent): number {
  return (
    a.day - b.day ||
    compareRaw(a.repoName, b.repoName) ||
    compareRaw(a.sha, b.sha) ||
    compareRaw(a.path, b.path)
  )
}

/** Calculates how many UTC calendar days precede the newest window day. */
export function dayIndex(day: IsoDay, windowEnd: IsoDay): number {
  const dayMs = isoDayMs(day)
  const endMs = isoDayMs(windowEnd)
  return Math.round((endMs - dayMs) / 86_400_000)
}

/** Converts a zero-based newest-first day index into an ISO calendar day. */
export function dayFromIndex(index: number, windowEnd: IsoDay): IsoDay {
  assert(
    Number.isInteger(index) && index >= 0,
    'Day index must be non-negative.'
  )
  return new Date(isoDayMs(windowEnd) - index * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

function resolveOptions(options: EncodeOptions) {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE
  const maxDictSliceGzipBytes =
    options.maxDictSliceGzipBytes ?? MAX_DICT_SLICE_GZIP_BYTES
  assert(
    Number.isInteger(chunkSize) && chunkSize > 0,
    'Chunk size must be positive.'
  )
  assert(
    maxDictSliceGzipBytes >= 0,
    'Dictionary byte limit must be non-negative.'
  )
  return { ...options, chunkSize, maxDictSliceGzipBytes }
}

function validateInput(input: BundleInput): void {
  validateMeta(input.meta)
  validateRepos(input.repos)
  validateGrid(input.grid)
  assert(
    input.meta.repoCount === input.repos.length,
    'Meta repo count does not match repos.'
  )
  assert(
    input.grid.start === input.meta.windowStart,
    'Grid start must equal window start.'
  )
  assert(
    input.grid.dayCount === input.meta.dayCount,
    'Grid day count must equal meta.'
  )
  for (const event of input.events) validateEvent(event, input)
}

function validateMeta(meta: BundleMeta): void {
  assert(meta.v === BUNDLE_VERSION, 'Unsupported bundle version.')
  isoSecondMs(meta.generatedAt)
  assert(meta.days.length === 2, 'Event span must contain two days.')
  const newest = isoDayMs(meta.days[0])
  const oldest = isoDayMs(meta.days[1])
  assert(newest >= oldest, 'Invalid event span.')
  assert(meta.refs === 'all' || meta.refs === 'head', 'Invalid refs mode.')
  assert(
    isoDayMs(meta.windowStart) <= isoDayMs(meta.windowEnd),
    'Invalid bundle window.'
  )
  assert(
    meta.dayCount === dayIndex(meta.windowStart, meta.windowEnd) + 1,
    'Invalid day count.'
  )
  assert(
    meta.repoCount >= 0 && Number.isInteger(meta.repoCount),
    'Invalid repo count.'
  )
  assert(meta.actors.length === 2, 'Bundles require exactly two actors.')
  meta.actors.forEach((actor, index) => {
    assert(actor.id === index, 'Actor ids must match their array indices.')
    assert(actor.login.length > 0, 'Actor login must be non-empty.')
    assert(
      actor.kind === 'human' || actor.kind === 'agent',
      'Invalid actor kind.'
    )
  })
}

function validateRepos(repos: readonly RepoRecord[]): void {
  repos.forEach((repo, index) => {
    assert(repo.id === index, 'Repository ids must be dense.')
    assert(
      Number.isInteger(repo.ghId) && repo.ghId >= 0,
      'Repository GitHub id is invalid.'
    )
    assert(repo.name.includes('/'), 'Repository name must include its owner.')
    assert(
      repo.private === false,
      'Private repositories cannot enter the bundle.'
    )
    assert(
      repo.short === shortName(repo.name),
      'Repository short name must be derived.'
    )
    assert(repo.short.length > 0, 'Repository short name must be non-empty.')
    assert(
      Number.isInteger(repo.vol) && repo.vol >= 0,
      'Repository volume is invalid.'
    )
    assert(
      Number.isInteger(repo.stars) && repo.stars >= 0,
      'Repository star count is invalid.'
    )
    assert(
      isoDayMs(repo.from) <= isoDayMs(repo.to),
      'Repository date range is invalid.'
    )
    assert(
      repo.ext.length <= 8 &&
        repo.ext.every((extension) => extension.length > 0) &&
        isSorted(repo.ext),
      'Repository extensions are invalid.'
    )
    assert(
      repo.status === 'ok' || repo.status === 'stale' || repo.status === 'gone',
      'Invalid repo status.'
    )
    assert(repo.actor === 0 || repo.actor === 1, 'Invalid repository actor.')
    assert(
      index === 0 || repos[index - 1]!.name < repo.name,
      'Repositories must be name-sorted.'
    )
  })
}

function validateGrid(grid: GridSeries): void {
  isoDayMs(grid.start)
  isoMonthMs(grid.privateStart)
  assert(grid.human.length === grid.dayCount, 'Human grid length is invalid.')
  assert(grid.agent.length === grid.dayCount, 'Agent grid length is invalid.')
  assert(grid.bands.length === BAND_COUNT, 'Grid requires exactly ten bands.')
  grid.human.forEach(validateCount)
  grid.agent.forEach(validateCount)
  grid.privateMonthly.forEach(validateCount)
}

function validateEvent(event: SortableEvent, input: BundleInput): void {
  assert(
    Number.isInteger(event.day) &&
      event.day >= 0 &&
      event.day < eventSpanDayCount(input.meta),
    'Event falls outside the event span.'
  )
  assert(
    event.repo === Math.floor(event.repo) &&
      input.repos[event.repo] !== undefined,
    'Event references an unknown repository.'
  )
  assert(
    input.repos[event.repo]!.name === event.repoName,
    'Event repo name does not match its id.'
  )
  assert(event.actor === 0 || event.actor === 1, 'Event actor is invalid.')
  assert(
    event.path.length > 0 && !event.path.includes('\n'),
    'Event path is invalid.'
  )
}

function eventSpanDayCount(meta: BundleMeta): number {
  return dayIndex(meta.days[1], meta.days[0]) + 1
}

function buildDictionary(events: readonly SortableEvent[]): Dictionary {
  const ids = new Map<string, number>()
  const paths: string[] = []
  const firstUses: number[] = []
  const indexed = events.map((event, eventIndex) => {
    const known = ids.get(event.path)
    const pathId = known ?? paths.length
    if (known === undefined) {
      ids.set(event.path, pathId)
      paths.push(event.path)
      firstUses.push(eventIndex)
    }
    return { event, pathId }
  })
  return { paths, firstUses, events: indexed }
}

function initialRanges(count: number, chunkSize: number): EventRange[] {
  const ranges: EventRange[] = []
  for (let start = 0; start < count; start += chunkSize) {
    ranges.push({ start, end: Math.min(start + chunkSize, count) })
  }
  return ranges
}

function splitRanges(
  ranges: readonly EventRange[],
  dictionary: Dictionary,
  gzipSize: ((text: string) => number) | undefined,
  maximum: number
): SplitResult {
  if (gzipSize === undefined) return { ranges: [...ranges], sizes: [] }
  return ranges.reduce<SplitResult>(
    (result, range) =>
      appendSplit(result, splitRange(range, dictionary, gzipSize, maximum)),
    { ranges: [], sizes: [] }
  )
}

function splitRange(
  range: EventRange,
  dictionary: Dictionary,
  gzipSize: (text: string) => number,
  maximum: number
): SplitResult {
  const size = gzipSize(JSON.stringify(dictWire(range, dictionary)))
  assert(
    Number.isFinite(size) && size >= 0,
    'gzipSize must return a non-negative number.'
  )
  if (size <= maximum) return { ranges: [range], sizes: [size] }
  assert(
    range.end - range.start > 1,
    'One event exceeds the dictionary slice byte limit.'
  )
  const middle = range.start + Math.floor((range.end - range.start) / 2)
  return appendSplit(
    splitRange(
      { start: range.start, end: middle },
      dictionary,
      gzipSize,
      maximum
    ),
    splitRange({ start: middle, end: range.end }, dictionary, gzipSize, maximum)
  )
}

function appendSplit(left: SplitResult, right: SplitResult): SplitResult {
  return {
    ranges: [...left.ranges, ...right.ranges],
    sizes: [...left.sizes, ...right.sizes],
  }
}

function encodeDataFiles(
  input: BundleInput,
  dictionary: Dictionary,
  ranges: readonly EventRange[]
): Map<string, string> {
  const files = new Map<string, string>()
  files.set('repos.json', JSON.stringify(input.repos.map(repoWire)))
  files.set('grid.json', JSON.stringify(gridWire(input.grid)))
  ranges.forEach((range, index) => {
    files.set(
      chunkFileName(index),
      JSON.stringify(chunkWire(range, dictionary))
    )
    files.set(dictFileName(index), JSON.stringify(dictWire(range, dictionary)))
  })
  return files
}

function buildManifest(
  meta: BundleMeta,
  chunkSize: number,
  chunks: number,
  events: number,
  integrity: Readonly<Record<string, string>>
): Manifest {
  return { ...meta, chunkSize, chunks, events, integrity }
}

function integrityFor(
  files: ReadonlyMap<string, string>,
  sha256: ((text: string) => string) | undefined
): Readonly<Record<string, string>> {
  if (sha256 === undefined) return {}
  return Object.fromEntries(
    [...files].map(([name, text]) => [name, sha256(text)])
  )
}

function repoWire(repo: RepoRecord): RepoWire {
  return {
    i: repo.id,
    g: repo.ghId,
    n: repo.name,
    a: repo.actor,
    e: repo.vol,
    s: repo.stars,
    f: repo.from,
    l: repo.to,
    x: repo.ext,
    z: repo.status,
  }
}

function gridWire(grid: GridSeries): GridWire {
  return {
    start: grid.start,
    n: grid.dayCount,
    e: grid.human,
    a: grid.agent,
    p: grid.privateMonthly,
    pStart: grid.privateStart,
    bands: grid.bands,
  }
}

function chunkWire(range: EventRange, dictionary: Dictionary): ChunkWire {
  const first = dictionary.events[range.start]!
  let previousDay = first.event.day
  const events = dictionary.events.slice(range.start, range.end)
  return {
    b: first.event.day,
    d: events.map((entry, index) => {
      const delta = index === 0 ? 0 : entry.event.day - previousDay
      previousDay = entry.event.day
      return delta
    }),
    r: events.map((entry) => entry.event.repo),
    p: events.map((entry) => entry.pathId),
    a: events.map((entry) => entry.event.actor),
  }
}

function dictWire(range: EventRange, dictionary: Dictionary): DictSliceWire {
  const from = lowerBound(dictionary.firstUses, range.start)
  const until = lowerBound(dictionary.firstUses, range.end)
  const paths = dictionary.paths.slice(from, until)
  return { from, n: paths.length, fc: frontCode(paths) }
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    if (values[middle]! < target) low = middle + 1
    else high = middle
  }
  return low
}

function recordFromJson(text: string): Record<string, unknown> {
  try {
    return recordFromValue(JSON.parse(text))
  } catch (error: unknown) {
    if (error instanceof BundleCodecError) throw error
    throw new BundleCodecError('Invalid JSON bundle file.', error)
  }
}

function arrayFromJson(text: string): unknown[] {
  try {
    const value: unknown = JSON.parse(text)
    assert(Array.isArray(value), 'Expected a JSON array.')
    return value
  } catch (error: unknown) {
    if (error instanceof BundleCodecError) throw error
    throw new BundleCodecError('Invalid JSON bundle file.', error)
  }
}

function recordFromValue(value: unknown): Record<string, unknown> {
  assert(
    typeof value === 'object' && value !== null && !Array.isArray(value),
    'Expected an object.'
  )
  const record: Record<string, unknown> = Object.create(null)
  for (const [key, entry] of Object.entries(value)) record[key] = entry
  return record
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  assert(typeof value === 'string', `Expected ${key} to be a string.`)
  return value
}

function readEventSpan(
  record: Record<string, unknown>,
  key: string
): [IsoDay, IsoDay] {
  const values = readArray(record, key)
  assert(values.length === 2, `Expected ${key} to contain two days.`)
  return [readIsoDayValue(values[0], key), readIsoDayValue(values[1], key)]
}

function readIsoDayValue(value: unknown, key: string): IsoDay {
  assert(typeof value === 'string', `Expected ${key} entries to be strings.`)
  isoDayMs(value)
  return value
}

function readRefs(
  record: Record<string, unknown>,
  key: string
): 'all' | 'head' {
  const value = readString(record, key)
  assert(value === 'all' || value === 'head', `Invalid ${key} mode.`)
  return value
}

function readNumber(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  assert(
    typeof value === 'number' && Number.isFinite(value),
    `Expected ${key} to be a number.`
  )
  return value
}

function readNonNegativeInteger(
  record: Record<string, unknown>,
  key: string
): number {
  const value = readNumber(record, key)
  assert(
    Number.isInteger(value) && value >= 0,
    `Expected ${key} to be a non-negative integer.`
  )
  return value
}

function readPositiveInteger(
  record: Record<string, unknown>,
  key: string
): number {
  const value = readNonNegativeInteger(record, key)
  assert(value > 0, `Expected ${key} to be positive.`)
  return value
}

function readArray(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key]
  assert(Array.isArray(value), `Expected ${key} to be an array.`)
  return value
}

function readNumberArray(
  record: Record<string, unknown>,
  key: string
): number[] {
  return readArray(record, key).map((value) => {
    assert(
      typeof value === 'number' && Number.isFinite(value),
      `Invalid ${key} entry.`
    )
    return value
  })
}

function readStringArray(
  record: Record<string, unknown>,
  key: string
): string[] {
  return readArray(record, key).map((value) => {
    assert(typeof value === 'string', `Invalid ${key} entry.`)
    return value
  })
}

function readActorArray(
  record: Record<string, unknown>,
  key: string
): ActorId[] {
  return readArray(record, key).map(readActorId)
}

function readActorId(value: unknown): ActorId {
  assert(value === 0 || value === 1, 'Invalid actor id.')
  return value
}

function readActors(record: Record<string, unknown>, key: string): Actor[] {
  return readArray(record, key).map((value) => {
    const actor = recordFromValue(value)
    return {
      id: readActorId(actor.id),
      login: readString(actor, 'login'),
      kind: readActorKind(actor.kind),
    }
  })
}

function readActorKind(value: unknown): Actor['kind'] {
  assert(value === 'human' || value === 'agent', 'Invalid actor kind.')
  return value
}

function readRepoCountDefinition(
  record: Record<string, unknown>,
  key: string
): RepoCountDefinition {
  const value = readString(record, key)
  assert(isRepoCountDefinition(value), 'Invalid repo count definition.')
  return value
}

function readRepoStatus(value: unknown): RepoStatus {
  assert(
    value === 'ok' || value === 'stale' || value === 'gone',
    'Invalid repo status.'
  )
  return value
}

function isRepoCountDefinition(value: string): value is RepoCountDefinition {
  return (
    value === 'publicRepos' ||
    value === 'ownerPublic' ||
    value === 'ownerPublicNonFork' ||
    value === 'withMemberAffiliations' ||
    value === 'repositoriesContributedTo'
  )
}

function readVersion(
  record: Record<string, unknown>,
  key: string
): typeof BUNDLE_VERSION {
  assert(record[key] === BUNDLE_VERSION, 'Unsupported bundle version.')
  return BUNDLE_VERSION
}

function readIsoDay(record: Record<string, unknown>, key: string): IsoDay {
  const value = readString(record, key)
  isoDayMs(value)
  return value
}

function readIsoMonth(record: Record<string, unknown>, key: string): string {
  const value = readString(record, key)
  isoMonthMs(value)
  return value
}

function readStringRecord(
  record: Record<string, unknown>,
  key: string
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(recordFromValue(record[key])).map(([name, value]) => {
      assert(typeof value === 'string', 'Integrity values must be strings.')
      return [name, value]
    })
  )
}

function repoFromWire(wire: Record<string, unknown>): RepoRecord {
  const name = readString(wire, 'n')
  return {
    id: readNonNegativeInteger(wire, 'i'),
    ghId: readNonNegativeInteger(wire, 'g'),
    name,
    short: shortName(name),
    actor: readActorId(wire.a),
    vol: readNonNegativeInteger(wire, 'e'),
    stars: readNonNegativeInteger(wire, 's'),
    from: readIsoDay(wire, 'f'),
    to: readIsoDay(wire, 'l'),
    private: false,
    ext: readStringArray(wire, 'x'),
    status: readRepoStatus(wire.z),
  }
}

function validateChunk(chunk: ChunkWire): void {
  const length = chunk.d.length
  assert(
    chunk.r.length === length &&
      chunk.p.length === length &&
      chunk.a.length === length,
    'Chunk columns must have equal lengths.'
  )
  assert(
    length > 0 && chunk.d[0] === 0,
    'Chunk delta stream must start at zero.'
  )
  chunk.d.forEach((delta) =>
    assert(Number.isInteger(delta) && delta >= 0, 'Invalid day delta.')
  )
  chunk.r.forEach((repo) =>
    assert(Number.isInteger(repo) && repo >= 0, 'Invalid repo id.')
  )
  chunk.p.forEach((path) =>
    assert(Number.isInteger(path) && path >= 0, 'Invalid path id.')
  )
}

function isoDayMs(value: IsoDay): number {
  assert(/^\d{4}-\d{2}-\d{2}$/.test(value), 'Invalid ISO day.')
  const milliseconds = Date.parse(`${value}T00:00:00Z`)
  assert(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString().slice(0, 10) === value,
    'Invalid ISO day.'
  )
  return milliseconds
}

function isoMonthMs(value: string): number {
  assert(/^\d{4}-\d{2}$/.test(value), 'Invalid ISO month.')
  const milliseconds = Date.parse(`${value}-01T00:00:00Z`)
  assert(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString().slice(0, 7) === value,
    'Invalid ISO month.'
  )
  return milliseconds
}

function isoSecondMs(value: string): number {
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value),
    'Invalid ISO second.'
  )
  const milliseconds = Date.parse(value)
  assert(
    Number.isFinite(milliseconds) &&
      new Date(milliseconds).toISOString() === `${value.slice(0, -1)}.000Z`,
    'Invalid ISO second.'
  )
  return milliseconds
}

function compareRaw(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function shortName(name: string): string {
  return name.slice(name.indexOf('/') + 1)
}

function isSorted(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || values[index - 1]! < value
  )
}

function validateCount(value: number): void {
  assert(
    Number.isInteger(value) && value >= 0,
    'Grid counts must be non-negative integers.'
  )
}

function requiredFile(
  files: ReadonlyMap<string, string>,
  name: string
): string {
  const text = files.get(name)
  assert(text !== undefined, `Bundle file ${name} is missing.`)
  return text
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new BundleCodecError(message)
}
