/** Version carried by every v1 bundle manifest. */
export const BUNDLE_VERSION = 1 as const
export const DEFAULT_CHUNK_SIZE = 1500
export const MAX_DICT_SLICE_GZIP_BYTES = 12_288
export const FIRST_BYTE_BROTLI_BUDGET_BYTES = 12_288
export const BAND_COUNT = 10
export const DATA_ROOT = 'public/data/v1'

export type ActorId = 0 | 1
export type ActorKind = 'human' | 'agent'
export type RepoStatus = 'ok' | 'stale' | 'gone'
export type RepoCountDefinition =
  | 'publicRepos'
  | 'ownerPublic'
  | 'ownerPublicNonFork'
  | 'withMemberAffiliations'
  | 'repositoriesContributedTo'

export type IsoDay = string
export type IsoMonth = string
export type IsoSecond = string

export interface Actor {
  id: ActorId
  login: string
  kind: ActorKind
}

/** Metadata that gives aggregate contribution values their precise context. */
export interface BundleMeta {
  v: typeof BUNDLE_VERSION
  generatedAt: IsoSecond
  commit: string
  windowStart: IsoDay
  windowEnd: IsoDay
  dayCount: number
  repoCount: number
  repoCountDefinition: RepoCountDefinition
  actors: readonly Actor[]
  degraded: readonly string[]
}

export interface Manifest extends BundleMeta {
  chunkSize: number
  chunks: number
  events: number
  integrity: Readonly<Record<string, string>>
}

/** Compact representation persisted in repos.json. */
export interface RepoWire {
  i: number
  g: number
  n: string
  a: ActorId
  e: number
  s: number
  f: IsoDay
  l: IsoDay
  x: readonly string[]
  z: RepoStatus
}

/** Renderer-facing public repository record. */
export interface RepoRecord {
  id: number
  ghId: number
  name: string
  short: string
  actor: ActorId
  vol: number
  stars: number
  from: IsoDay
  to: IsoDay
  private: false
  ext: readonly string[]
  status: RepoStatus
}

/** Daily aggregate series, stored with its oldest day first. */
export interface GridSeries {
  start: IsoDay
  dayCount: number
  human: readonly number[]
  agent: readonly number[]
  privateMonthly: readonly number[]
  privateStart: IsoMonth
  bands: readonly number[]
}

/** An event ready for playback after resolving its global path id. */
export interface BundleEvent {
  day: number
  repo: number
  path: string
  actor: ActorId
}

/** Event fields used only while producing the deterministic wire ordering. */
export interface SortableEvent extends BundleEvent {
  repoName: string
  sha: string
}

/** Columnar event chunk persisted under events/. */
export interface ChunkWire {
  b: number
  d: readonly number[]
  r: readonly number[]
  p: readonly number[]
  a: readonly ActorId[]
}

/** Independently decodable front-coded dictionary slice persisted under paths/. */
export interface DictSliceWire {
  from: number
  n: number
  fc: string
}

/** @returns The stable relative event filename for a chunk index. */
export function chunkFileName(index: number): string {
  return `events/ee-${String(index).padStart(2, '0')}.json`
}

/** @returns The stable relative path-dictionary filename for a chunk index. */
export function dictFileName(index: number): string {
  return `paths/pd-${String(index).padStart(2, '0')}.json`
}
