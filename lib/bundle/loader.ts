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
  paths(): readonly string[]
  dispose(): void
}

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

async function getText(
  fetchImpl: typeof fetch,
  url: string,
  signal: AbortSignal
): Promise<string | null> {
  try {
    const response = await fetchImpl(url, {
      credentials: 'omit',
      signal,
    })
    return response.ok ? await response.text() : null
  } catch (error) {
    if (signal.aborted) throw error
    return null
  }
}

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
    const texts = await Promise.all(names.map((name) => this.request(name)))
    if (this.signal.aborted) {
      this.end('aborted')
      throw abortError()
    }
    const manifestText = texts[0] ?? null
    const reposText = texts[1] ?? null
    const gridText = texts[2] ?? null
    const eventText = texts[3] ?? null
    const dictText = texts[4] ?? null
    assertVersion(manifestText, this.url(names[0]))
    const manifest = this.decodeManifest(manifestText, names[0])
    this.manifest = manifest
    this.repos = this.decodeRepos(reposText, names[1])
    this.grid = this.decodeGrid(gridText, names[2])
    if (eventText === null || dictText === null) this.end('chunk-missing')
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
    const names = [chunkFileName(index), dictFileName(index)]
    const texts = await Promise.all(names.map((name) => this.request(name)))
    const eventText = texts[0] ?? null
    const dictText = texts[1] ?? null
    if (this.signal.aborted) {
      this.end('aborted')
      return false
    }
    if (eventText === null || dictText === null) {
      this.end('chunk-missing')
      return false
    }
    return this.admitChunk(index, eventText, dictText)
  }

  private async request(name: string): Promise<string | null> {
    const url = this.url(name)
    this.requestCount += 1
    return getText(this.fetchImpl, url, this.signal)
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
