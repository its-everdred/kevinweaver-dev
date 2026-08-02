import type { Manifest, RepoCountDefinition } from '../../lib/bundle/schema.ts'

/**
 * @description One author-attributed repository file touch.
 */
export interface RawEvent {
  day: string
  repo: string
  sha: string
  path: string
  actor: 0 | 1
}
/**
 * @description Truthful repository metadata and measured event bounds.
 */
export interface RepoInput {
  n: string
  databaseId: number
  stargazerCount: number
  heads?: Readonly<Record<string, string>>
  first?: string
  last?: string
  private: boolean
  status: 'ok' | 'stale' | 'gone'
  consecutiveFailures?: number
}
/**
 * @description SAML authorization evidence produced by the calendar stage.
 */
export interface SamlCanary {
  ok: boolean
  org: string
  checkedAt: string
}
/**
 * @description Complete pure encoder input assembled from pipeline stages.
 */
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
/**
 * @description One bundle-relative resource and its exact bytes.
 */
export interface EncodedFile {
  path: string
  bytes: Uint8Array
}
/**
 * @description Encoded resource tree plus non-public validation metadata.
 */
export interface EncodedBundle {
  manifest: Manifest
  files: readonly EncodedFile[]
  samlCanary: SamlCanary
  combinedTotal: number
}
