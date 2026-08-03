'use client'
import { useEffect, useSyncExternalStore } from 'react'
import { dayIndex } from '@/lib/bundle/codec'
import { createBundleLoader, type BundleHead } from '@/lib/bundle/loader'
import {
  bindVizTransport,
  createVizDriver,
  formatDayISO,
  type VizDriver,
  type VizDriverRenderData,
} from '@/lib/viz/driver'
// prettier-ignore
import { DAY_ALIVE, ENTITY_FILE, ENTITY_REPO, type SimInput } from '@/lib/viz/sim/types'
// prettier-ignore
interface FileEntity { readonly repo: number; readonly path: string; readonly birth: number; readonly lastTouch: number }
/** Payload, simulation, and render data sharing one entity index space. */
// prettier-ignore
export interface InstrumentViz { readonly head: BundleHead; readonly input: SimInput; readonly render: VizDriverRenderData; readonly driver: VizDriver }
// prettier-ignore
export type InstrumentRuntimeState = { readonly status: 'loading' } | { readonly status: 'unavailable' } | { readonly status: 'ready'; readonly viz: InstrumentViz }
type RepoRecord = BundleHead['repos'][number]
const LOADING: InstrumentRuntimeState = { status: 'loading' }
const UNAVAILABLE: InstrumentRuntimeState = { status: 'unavailable' }
const MAX_BOOT_ATTEMPTS = 2
const RETRY_DELAY_MS = 100
const listeners = new Set<() => void>()
let state: InstrumentRuntimeState = LOADING
let loading: Promise<void> | undefined
let attempts = 0

/**
 * @description Returns the payload and driver shared by all instrument leaves.
 * @returns Discriminated loading, unavailable, or ready runtime state.
 */
export function useInstrumentRuntime(): InstrumentRuntimeState {
  useEffect(ensureRuntime, [])
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
/**
 * @description Builds one driver while preserving payload repository, day, and file indices.
 * @param head Validated first-byte payload data.
 * @returns The shared payload, simulation inputs, render data, and driver.
 */
export function createInstrumentViz(head: BundleHead): InstrumentViz {
  const repos = [...head.repos].sort((left, right) => left.id - right.id)
  const files = buildFiles(head)
  const agentBirthDay = head.grid.agent.findIndex((count) => count > 0)
  const input = buildInput(head, repos, files)
  const render = buildRenderData(head, repos, files, agentBirthDay)
  const driver = createVizDriver({ input, render, seed: seedFor(head) })
  bindVizTransport(driver, {
    generatedAt: head.manifest.generatedAt,
    windowStartISO: head.manifest.windowStart,
    windowEndISO: head.manifest.windowEnd,
    dayCount: head.manifest.dayCount,
    birthDayIndex: agentBirthDay,
  })
  return { head, input, render, driver }
}
// prettier-ignore
function subscribe(listener: () => void): () => void { listeners.add(listener); return () => listeners.delete(listener) }
const getSnapshot = (): InstrumentRuntimeState => state
const getServerSnapshot = (): InstrumentRuntimeState => LOADING
const notify = (): void => listeners.forEach((listener) => listener())
function ensureRuntime(): void {
  if (loading) return
  if (state.status === 'unavailable') {
    state = LOADING
    notify()
  }
  attempts += 1
  loading = createBundleLoader()
    .boot()
    .then((head) => {
      state = { status: 'ready', viz: createInstrumentViz(head) }
      notify()
    })
    .catch(() => {
      loading = undefined
      state = UNAVAILABLE
      notify()
      if (attempts < MAX_BOOT_ATTEMPTS)
        window.setTimeout(ensureRuntime, RETRY_DELAY_MS)
    })
}
function buildFiles(head: BundleHead): FileEntity[] {
  const newest = dayIndex(head.manifest.windowStart, head.manifest.days[0])
  const files = new Map<string, FileEntity>()
  for (const event of head.events) {
    const day = clampDay(newest - event.day, head.manifest.dayCount)
    const key = `${event.repo}\u0000${event.path}`
    const current = files.get(key)
    files.set(key, {
      repo: event.repo,
      path: event.path,
      birth: current === undefined ? day : Math.min(current.birth, day),
      lastTouch: current === undefined ? day : Math.max(current.lastTouch, day),
    })
  }
  return [...files.values()].sort(
    (left, right) =>
      left.repo - right.repo || left.path.localeCompare(right.path)
  )
}
// prettier-ignore
function buildInput(head: BundleHead, repos: readonly RepoRecord[], files: readonly FileEntity[]): SimInput {
  const count = repos.length + files.length
  return {
    dayCount: head.manifest.dayCount,
    windowStartISO: head.manifest.windowStart,
    repoCount: repos.length,
    entityCount: count,
    kind: Uint8Array.from({ length: count }, (_, id) =>
      id < repos.length ? ENTITY_REPO : ENTITY_FILE
    ),
    repoOf: Int32Array.from({ length: count }, (_, id) =>
      id < repos.length ? -1 : (files[id - repos.length]?.repo ?? -1)
    ),
    birthDay: Int32Array.from([
      ...repos.map((repo) => dayForRepo(head, repo.from)),
      ...files.map((file) => file.birth),
    ]),
    lastTouchDay: Int32Array.from([
      ...repos.map((repo) => lastTouchForRepo(head, repo.to)),
      ...files.map((file) => file.lastTouch),
    ]),
  }
}
// prettier-ignore
function buildRenderData(head: BundleHead, repos: readonly RepoRecord[], files: readonly FileEntity[], agentBirthDay: number): VizDriverRenderData {
  // prettier-ignore
  return { grid: buildRenderGrid(head, agentBirthDay), meta: buildRenderMeta(head, repos, files, agentBirthDay) }
}
function buildRenderGrid(
  head: BundleHead,
  agentBirthDay: number
): VizDriverRenderData['grid'] {
  const total = head.grid.human.map(
    (human, day) => human + (head.grid.agent[day] ?? 0)
  )
  return {
    dayCount: head.grid.dayCount,
    windowStartISO: head.grid.start,
    total: Uint16Array.from(total),
    agent: Uint16Array.from(head.grid.agent),
    level: Uint8Array.from(total, (count) => levelFor(count, head.grid.bands)),
    agentBirthDay,
  }
}
// prettier-ignore
function buildRenderMeta(head: BundleHead, repos: readonly RepoRecord[], files: readonly FileEntity[], agentBirthDay: number): VizDriverRenderData['meta'] {
  const labels = [...repos.map((repo) => repo.short), ...files.map((file) => file.path)]
  const agent = head.manifest.actors.find((actor) => actor.kind === 'agent')
  return {
    repos: repos.map((repo) => ({
      short: repo.short,
      actor: repo.actor,
      stars: repo.stars,
      isPrivate: repo.private,
    })),
    fileLabel: (entityId) => labels[entityId] ?? '',
    agentBirthLabel:
      agentBirthDay < 0 || !agent ? null : `${agent.login} initialized`,
    agentBirthSubLabel:
      agentBirthDay < 0 ? null : formatDayISO(head.grid.start, agentBirthDay),
    agentBirthDay,
  }
}
function levelFor(count: number, bands: readonly number[]): number {
  let level = 0
  for (let index = 1; index < bands.length; index += 1) {
    const lower = bands[index]
    if (lower === undefined || count < lower) break
    level = index
  }
  return Math.min(9, level)
}
function dayForRepo(head: BundleHead, iso: string): number {
  return clampDay(
    dayIndex(head.manifest.windowStart, iso),
    head.manifest.dayCount
  )
}
function lastTouchForRepo(head: BundleHead, iso: string): number {
  const day = dayForRepo(head, iso)
  return day === head.manifest.dayCount - 1 ? DAY_ALIVE : day
}
// prettier-ignore
const clampDay = (day: number, count: number): number => Math.min(count - 1, Math.max(0, day))
function seedFor(head: BundleHead): number {
  let seed = 2166136261
  for (const char of head.manifest.commit)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619)
  return seed >>> 0
}
