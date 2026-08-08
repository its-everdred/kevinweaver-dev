import { BUNDLE_VERSION, chunkFileName, dictFileName } from './schema'
import type { BundleEvent, GridSeries, Manifest, RepoRecord } from './schema'
import {
  decodeChunk,
  decodeDictSlice,
  decodeGrid,
  decodeManifest,
  decodeRepos,
  expandChunk,
} from './codec'
import { fetchText, type TextFetch } from './fetchText'

export const DEFAULT_BASE_URL = '/data/v1'
export const PREFETCH_TRIGGER = 0.6
export const FIRST_BYTE_FILE_COUNT = 5

export type LoaderPhase = 'idle' | 'booting' | 'ready' | 'exhausted' | 'failed'
export type LoaderEndReason =
  | 'manifest-exhausted'
  | 'chunk-missing'
  | 'chunk-malformed'
  | 'dictionary-gap'
  | 'path-id-out-of-range'
  | 'aborted'

export interface BundleHead {
  manifest: Manifest
  repos: RepoRecord[]
  grid: GridSeries
  events: readonly BundleEvent[]
}

export interface LoaderStatus {
  phase: LoaderPhase
  chunksLoaded: number
  chunksTotal: number
  eventsLoaded: number
  eventsConsumed: number
  pathsLoaded: number
  residentThroughDay: number
  historyEnded: boolean
  endReason: LoaderEndReason | null
  /**
   * A chunk did not arrive but may still exist: every attempt at it failed
   * rather than being refused. History is NOT ended, so `retry()` can pick the
   * pump back up from where it stopped instead of the caller rebuilding the
   * loader and refetching everything it already has.
   */
  stalled: boolean
  degraded: readonly string[]
  requestCount: number
}

export interface LoaderOptions {
  baseUrl?: string
  fetchImpl?: typeof fetch
  prefetchTrigger?: number
  signal?: AbortSignal
  onStatus?: (status: LoaderStatus) => void
}

export class BundleLoadError extends Error {
  readonly reason: 'network' | 'http' | 'parse' | 'version' | 'config'
  readonly url: string | null

  constructor(
    reason: BundleLoadError['reason'],
    url: string | null,
    message: string
  ) {
    super(message)
    this.name = 'BundleLoadError'
    this.reason = reason
    this.url = url
  }
}

export interface BundleLoader {
  boot(): Promise<BundleHead>
  status(): LoaderStatus
  takeThroughDay(day: number): BundleEvent[]
  take(n: number): BundleEvent[]
  events(): AsyncIterableIterator<BundleEvent>
  ensureChunk(index: number): Promise<boolean>
  /**
   * Clears a stall so the next `ensureChunk` tries the chunk that failed again.
   * Only the caller that owns the pump's pacing calls this: without the stall,
   * `armPrefetch` would re-request an unreachable chunk on every consumed
   * event.
   */
  retry(): void
  paths(): readonly string[]
  dispose(): void
}

/**
 * Chunks fetched ahead of the one being decoded. The pump walks the whole
 * manifest one chunk at a time because a chunk's dictionary slice only decodes
 * on top of the slice before it, so without a read-ahead the wall clock is the
 * chunk count times the round trip — measured at 22s on a phone at 150ms RTT
 * for 94 chunks, which is 22s of a galaxy holding only its synthesized repo.
 * Two keeps at most six requests in flight, inside the six-connection limit an
 * HTTP/1.1 origin imposes, and roughly thirds the latency term.
 */
const CHUNK_READ_AHEAD = 2

const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

function normalizeBaseUrl(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || SCHEME.test(raw)) {
    throw new BundleLoadError(
      'config',
      raw,
      `baseUrl must be a same-origin path: ${raw}`
    )
  }
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

/** The body, or null when there is none, for the decoders that only need that. */
const bodyOf = (result: TextFetch): string | null =>
  result.ok ? result.text : null

function clampTrigger(value: number): number {
  return Math.min(1, Math.max(0, value))
}

class Loader implements BundleLoader {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly prefetchTrigger: number
  private readonly controller = new AbortController()
  private readonly signal: AbortSignal
  private readonly onStatus: ((status: LoaderStatus) => void) | undefined
  private readonly eventList: BundleEvent[] = []
  private readonly pathList: string[] = []
  private readonly chunkStart: number[] = []
  private readonly chunkLen: number[] = []
  /** Chunk index to its two in-flight or warmed requests; see `chunkTexts`. */
  private readonly inFlight = new Map<number, Promise<TextFetch[]>>()
  private bootPromise: Promise<BundleHead> | undefined
  private chunkPromise: Promise<boolean> | undefined
  private manifest: Manifest | undefined
  private repos: RepoRecord[] = []
  private grid: GridSeries | undefined
  private cursor = 0
  private chunksLoaded = 0
  private eventsConsumed = 0
  private historyEnded = false
  private endReason: LoaderEndReason | null = null
  private phase: LoaderPhase = 'idle'
  private requestCount = 0
  private disposed = false
  private stalled = false
  private readonly degraded: string[] = []

  constructor(options: LoaderOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.prefetchTrigger = clampTrigger(
      options.prefetchTrigger ?? PREFETCH_TRIGGER
    )
    this.signal =
      options.signal === undefined
        ? this.controller.signal
        : combineSignals(options.signal, this.controller.signal)
    this.onStatus = options.onStatus
  }

  boot(): Promise<BundleHead> {
    if (this.bootPromise !== undefined) return this.bootPromise
    this.phase = 'booting'
    this.notify()
    this.bootPromise = this.loadBoot()
    return this.bootPromise
  }

  status(): LoaderStatus {
    return {
      phase: this.phase,
      chunksLoaded: this.chunksLoaded,
      chunksTotal: this.manifest?.chunks ?? 0,
      eventsLoaded: this.eventList.length,
      eventsConsumed: this.eventsConsumed,
      pathsLoaded: this.pathList.length,
      residentThroughDay: this.eventList.at(-1)?.day ?? -1,
      historyEnded: this.historyEnded,
      endReason: this.endReason,
      stalled: this.stalled,
      degraded: [...(this.manifest?.degraded ?? []), ...this.degraded],
      requestCount: this.requestCount,
    }
  }

  takeThroughDay(day: number): BundleEvent[] {
    const out: BundleEvent[] = []
    while (
      this.cursor < this.eventList.length &&
      this.eventList[this.cursor]!.day <= day
    ) {
      out.push(this.eventList[this.cursor]!)
      this.advanceCursor()
    }
    this.armPrefetch()
    return out
  }

  take(count: number): BundleEvent[] {
    const limit = Math.max(0, Math.floor(count))
    const out = this.eventList.slice(this.cursor, this.cursor + limit)
    this.cursor += out.length
    this.eventsConsumed += out.length
    this.armPrefetch()
    return out
  }

  async *events(): AsyncIterableIterator<BundleEvent> {
    while (true) {
      if (this.cursor < this.eventList.length) {
        const event = this.eventList[this.cursor]!
        this.advanceCursor()
        this.armPrefetch()
        yield event
        continue
      }
      if (this.historyEnded || !(await this.ensureChunk(this.chunksLoaded)))
        return
    }
  }

  async ensureChunk(index: number): Promise<boolean> {
    if (
      this.historyEnded ||
      this.manifest === undefined ||
      index >= this.manifest.chunks
    ) {
      if (this.manifest !== undefined && index >= this.manifest.chunks)
        this.end('manifest-exhausted')
      return false
    }
    if (index < this.chunksLoaded) return true
    // Held until `retry()`, so a chunk the network could not deliver is asked
    // for again on the pump's schedule rather than on every consumed event.
    if (this.stalled) return false
    if (index > this.chunksLoaded) {
      while (this.chunksLoaded <= index && !this.historyEnded) {
        if (!(await this.ensureChunk(this.chunksLoaded))) return false
      }
      return index < this.chunksLoaded
    }
    if (this.chunkPromise !== undefined) return this.chunkPromise
    this.chunkPromise = this.loadChunk(index).finally(() => {
      this.chunkPromise = undefined
    })
    return this.chunkPromise
  }

  retry(): void {
    if (!this.historyEnded) this.stalled = false
  }

  paths(): readonly string[] {
    return this.pathList
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.controller.abort()
    this.end('aborted')
  }

  private async loadBoot(): Promise<BundleHead> {
    const names = [
      'manifest.json',
      'repos.json',
      'grid.json',
      chunkFileName(0),
      dictFileName(0),
    ] as const
    const parts = await Promise.all(names.map((name) => this.request(name)))
    if (this.signal.aborted) {
      this.end('aborted')
      throw abortError()
    }
    const manifestText = bodyOf(parts[0]!)
    assertVersion(manifestText, this.url(names[0]))
    const manifest = this.decodeManifest(manifestText, names[0])
    this.manifest = manifest
    this.repos = this.decodeRepos(bodyOf(parts[1]!), names[1])
    this.grid = this.decodeGrid(bodyOf(parts[2]!), names[2])
    const eventText = bodyOf(parts[3]!)
    const dictText = bodyOf(parts[4]!)
    if (eventText === null || dictText === null)
      this.missChunk(parts[3]!, parts[4]!)
    else if (!this.admitChunk(0, eventText, dictText))
      this.end(this.endReason ?? 'chunk-malformed')
    if (!this.historyEnded) {
      this.phase = 'ready'
      this.notify()
    }
    return {
      manifest,
      repos: this.repos,
      grid: this.grid,
      events: this.eventList,
    }
  }

  private async loadChunk(index: number): Promise<boolean> {
    const pending = this.chunkTexts(index)
    // Started before the current chunk is awaited, so the next chunk's round
    // trip overlaps this one's. A chunk only DECODES on top of the one before
    // it; nothing stops it being fetched early, and the pump is 94 chunks deep,
    // which unpipelined is 94 round trips a phone pays end to end.
    this.readAhead(index)
    const parts = await pending.finally(() => this.forget(index, pending))
    if (this.signal.aborted) {
      this.end('aborted')
      return false
    }
    const eventText = bodyOf(parts[0]!)
    const dictText = bodyOf(parts[1]!)
    if (eventText === null || dictText === null)
      return this.missChunk(parts[0]!, parts[1]!)
    return this.admitChunk(index, eventText, dictText)
  }

  /** Warms the chunks after `index`, within the read-ahead depth. */
  private readAhead(index: number): void {
    const total = this.manifest?.chunks ?? 0
    for (let step = 1; step <= CHUNK_READ_AHEAD; step += 1)
      if (index + step < total) void this.chunkTexts(index + step)
  }

  /**
   * The two requests one chunk needs, started at most once. The entry is
   * dropped the moment the chunk is consumed, so the map holds at most
   * `CHUNK_READ_AHEAD` bodies and a stall never resumes from a cached failure.
   */
  private chunkTexts(index: number): Promise<TextFetch[]> {
    const warm = this.inFlight.get(index)
    if (warm !== undefined) return warm
    const names = [chunkFileName(index), dictFileName(index)]
    const pending = Promise.all(names.map((name) => this.request(name)))
    // A read-ahead that fails is forgotten rather than remembered: an outage
    // long enough to take out the chunk being decoded takes out the chunks
    // warmed behind it too, and serving those failures back from the map would
    // make every later `retry()` stall on a request nobody ever re-sent. The
    // rejection handler also absorbs the abort a disposed loader raises in a
    // read-ahead nobody is left to consume.
    void pending.then(
      (parts) => {
        if (parts.some((part) => !part.ok)) this.forget(index, pending)
      },
      () => this.forget(index, pending)
    )
    this.inFlight.set(index, pending)
    return pending
  }

  /** Drops a warmed entry, unless a newer attempt has already replaced it. */
  private forget(index: number, pending: Promise<TextFetch[]>): void {
    if (this.inFlight.get(index) === pending) this.inFlight.delete(index)
  }

  /**
   * A chunk that did not arrive. If every attempt at it merely failed, the file
   * may well still be there and history stalls, recoverable by `retry()`; if
   * the server refused it, this deployment does not have it and history ends.
   */
  private missChunk(...parts: readonly TextFetch[]): false {
    if (!parts.some((part) => !part.ok && part.transient))
      return this.end('chunk-missing')
    if (!this.stalled) {
      this.stalled = true
      this.degraded.push('chunk-stalled')
    }
    this.notify()
    return false
  }

  private async request(name: string): Promise<TextFetch> {
    const url = this.url(name)
    this.requestCount += 1
    return fetchText(this.fetchImpl, url, this.signal)
  }

  private decodeManifest(text: string | null, name: string): Manifest {
    if (text === null)
      throw new BundleLoadError('http', this.url(name), 'manifest unavailable')
    try {
      return decodeManifest(text)
    } catch (error) {
      throw new BundleLoadError(
        'parse',
        this.url(name),
        `manifest is malformed: ${String(error)}`
      )
    }
  }

  private decodeRepos(text: string | null, name: string): RepoRecord[] {
    if (text === null)
      throw new BundleLoadError(
        'http',
        this.url(name),
        'repositories unavailable'
      )
    try {
      return decodeRepos(text)
    } catch (error) {
      throw new BundleLoadError(
        'parse',
        this.url(name),
        `repositories are malformed: ${String(error)}`
      )
    }
  }

  private decodeGrid(text: string | null, name: string): GridSeries {
    if (text === null)
      throw new BundleLoadError('http', this.url(name), 'grid unavailable')
    try {
      return decodeGrid(text)
    } catch (error) {
      throw new BundleLoadError(
        'parse',
        this.url(name),
        `grid is malformed: ${String(error)}`
      )
    }
  }

  private admitChunk(
    index: number,
    eventText: string,
    dictText: string
  ): boolean {
    try {
      const slice = decodeDictSlice(dictText)
      const chunk = decodeChunk(eventText)
      if (slice.from !== this.pathList.length) return this.end('dictionary-gap')
      this.pathList.push(...slice.paths)
      if (chunk.p.some((id) => id >= this.pathList.length))
        return this.end('path-id-out-of-range')
      const expanded = expandChunk(chunk, this.pathList)
      this.chunkStart.push(this.eventList.length)
      this.chunkLen.push(expanded.length)
      this.eventList.push(...expanded)
      this.chunksLoaded = index + 1
      if (this.chunksLoaded >= (this.manifest?.chunks ?? 0))
        this.end('manifest-exhausted')
      this.notify()
      return true
    } catch {
      return this.end('chunk-malformed')
    }
  }

  private advanceCursor(): void {
    this.cursor += 1
    this.eventsConsumed += 1
  }

  private armPrefetch(): void {
    if (this.historyEnded || this.chunksLoaded === 0) return
    let index = this.chunksLoaded - 1
    while (index > 0 && this.chunkStart[index]! > this.cursor) index -= 1
    const length = this.chunkLen[index]!
    const progress =
      length === 0 ? 1 : (this.cursor - this.chunkStart[index]!) / length
    if (progress >= this.prefetchTrigger) void this.ensureChunk(index + 1)
  }

  private end(reason: LoaderEndReason): false {
    if (!this.historyEnded) {
      this.historyEnded = true
      this.endReason = reason
      this.phase = reason === 'aborted' ? 'failed' : 'exhausted'
      this.degraded.push(reason)
      this.notify()
    }
    return false
  }

  private notify(): void {
    this.onStatus?.(this.status())
  }

  private url(name: string): string {
    return `${this.baseUrl}/${name}`
  }
}

function combineSignals(left: AbortSignal, right: AbortSignal): AbortSignal {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (left.aborted || right.aborted) abort()
  else {
    left.addEventListener('abort', abort, { once: true })
    right.addEventListener('abort', abort, { once: true })
  }
  return controller.signal
}

function abortError(): Error {
  return new DOMException('The operation was aborted', 'AbortError')
}

function assertVersion(text: string | null, url: string): void {
  if (text === null) return
  try {
    const value: unknown = JSON.parse(text)
    if (
      isRecord(value) &&
      typeof value.v === 'number' &&
      value.v !== BUNDLE_VERSION
    ) {
      throw new BundleLoadError(
        'version',
        url,
        `bundle version ${value.v} is unsupported`
      )
    }
  } catch (error) {
    if (error instanceof BundleLoadError) throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createBundleLoader(options: LoaderOptions = {}): BundleLoader {
  return new Loader(options)
}
