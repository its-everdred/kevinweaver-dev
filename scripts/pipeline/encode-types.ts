import type { Manifest, RepoCountDefinition } from '../../lib/bundle/schema.ts'

export interface RawEvent {
  day: string
  repo: string
  sha: string
  path: string
  actor: 0 | 1
}
export interface RepoInput {
  n: string
  databaseId: number
  stargazerCount: number
  first?: string
  last?: string
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
