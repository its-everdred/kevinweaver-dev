import { packEnclose, packSiblings } from 'd3-hierarchy'

import { ENTITY_FILE } from './types'
import type { SimState } from './types'

/** Maximum number of files packed in one deterministic cohort. */
export const PACK_CHUNK_SIZE = 512
/** Unit-space ellipse used for repository placement. */
export const RING = {
  cx: 0.5,
  cy: 0.46,
  rx: 0.42,
  ry: 0.38,
  phase: 0.55,
} as const
const PACKED = new WeakSet<SimState>()

/**
 * @description Tests whether positions have been calculated for this state object.
 * @param state Simulation state to inspect.
 * @returns True after a successful call to packOnce for this object.
 */
export function isPacked(state: SimState): boolean {
  return PACKED.has(state)
}

/**
 * @description Computes stable file-disc and repository-ring positions once per state object.
 * @param state Simulation state whose presentation coordinates receive the packed positions.
 */
export function packOnce(state: SimState): void {
  if (PACKED.has(state)) return

  const filesByRepo = bucketFiles(state)
  for (let repoId = 0; repoId < state.repoCount; repoId++) {
    const fileIds = required(filesByRepo, repoId)
    state.repoR[repoId] =
      fileIds.length > PACK_CHUNK_SIZE
        ? packChunked(state, fileIds)
        : packFlat(state, fileIds)
  }

  placeRepos(state)
  PACKED.add(state)
}

function bucketFiles(state: SimState): number[][] {
  const filesByRepo = Array.from(
    { length: state.repoCount },
    () => [] as number[]
  )
  for (let id = state.repoCount; id < state.entityCount; id++) {
    if (valueAt(state.kind, id) !== ENTITY_FILE) continue
    const repoId = valueAt(state.repoOf, id)
    if (repoId >= 0 && repoId < state.repoCount)
      required(filesByRepo, repoId).push(id)
  }
  for (const fileIds of filesByRepo) fileIds.sort(compareBirth(state))
  return filesByRepo
}

function compareBirth(
  state: SimState
): (left: number, right: number) => number {
  return (left, right) =>
    valueAt(state.birth, left) - valueAt(state.birth, right) || left - right
}

function packFlat(state: SimState, ids: readonly number[]): number {
  if (ids.length === 0) return 0
  const circles = packSiblings(ids.map(() => ({ r: 1 })))
  const enclosing = packEnclose(circles)
  for (let index = 0; index < ids.length; index++) {
    const id = required(ids, index)
    const circle = required(circles, index)
    state.px[id] = (circle.x - enclosing.x) / enclosing.r
    state.py[id] = (circle.y - enclosing.y) / enclosing.r
    state.pr[id] = 1 / enclosing.r
  }
  return enclosing.r
}

function packChunked(state: SimState, ids: readonly number[]): number {
  const groups: PackedGroup[] = []
  for (let start = 0; start < ids.length; start += PACK_CHUNK_SIZE) {
    const fileIds = ids.slice(start, start + PACK_CHUNK_SIZE)
    groups.push(packGroup(state, fileIds))
  }
  const circles = packSiblings(groups.map((group) => ({ r: group.radius })))
  const enclosing = packEnclose(circles)
  for (let index = 0; index < groups.length; index++) {
    rescaleGroup(
      state,
      required(groups, index),
      required(circles, index),
      enclosing
    )
  }
  return enclosing.r
}

interface PackedGroup {
  readonly fileIds: readonly number[]
  readonly radius: number
}

function packGroup(state: SimState, fileIds: readonly number[]): PackedGroup {
  const circles = packSiblings(fileIds.map(() => ({ r: 1 })))
  const enclosing = packEnclose(circles)
  for (let index = 0; index < fileIds.length; index++) {
    const id = required(fileIds, index)
    const circle = required(circles, index)
    state.px[id] = (circle.x - enclosing.x) / enclosing.r
    state.py[id] = (circle.y - enclosing.y) / enclosing.r
    state.pr[id] = 1 / enclosing.r
  }
  return { fileIds, radius: enclosing.r }
}

function rescaleGroup(
  state: SimState,
  group: PackedGroup,
  circle: { readonly x: number; readonly y: number },
  enclosing: { readonly x: number; readonly y: number; readonly r: number }
): void {
  const x = (circle.x - enclosing.x) / enclosing.r
  const y = (circle.y - enclosing.y) / enclosing.r
  const scale = group.radius / enclosing.r
  for (const id of group.fileIds) {
    state.px[id] = x + valueAt(state.px, id) * scale
    state.py[id] = y + valueAt(state.py, id) * scale
    state.pr[id] = valueAt(state.pr, id) * scale
  }
}

function placeRepos(state: SimState): void {
  if (state.repoCount === 0) return
  const repoIds = Array.from({ length: state.repoCount }, (_, repoId) => repoId)
  repoIds.sort(
    (left, right) =>
      valueAt(state.death, right) - valueAt(state.death, left) || left - right
  )
  for (let rank = 0; rank < repoIds.length; rank++) {
    const repoId = required(repoIds, rank)
    const slot = hashPosition(state, repoId)
    state.repoAngle[repoId] = slot.angle
    state.repoX[repoId] = RING.cx + Math.cos(slot.angle) * slot.r * RING.rx
    state.repoY[repoId] = RING.cy + Math.sin(slot.angle) * slot.r * RING.ry
    state.repoAlpha[repoId] = 0
  }
}

/**
 * @description Derives a deterministic, non-uniform scatter position for one repository.
 * @param state Simulation state for the repo's seed and id.
 * @param repoId Repository entity id.
 * @returns A pseudo-random angle and radial fraction within the field.
 */
function hashPosition(
  state: SimState,
  repoId: number
): { readonly angle: number; readonly r: number } {
  const a = hash01(repoId * 2 + 1)
  const b = hash01(repoId * 2 + 2)
  const angle = a * Math.PI * 2
  const r = 0.15 + b * 0.6
  return { angle, r }
}

/**
 * @description Deterministic hash returning a fraction in [0, 1), independent
 * of the repository count so a small repo set still scatters across the field.
 */
function hash01(seed: number): number {
  let h = seed | 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b)
  h ^= h >>> 16
  return ((h >>> 0) % 1000) / 1000
}

function required<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined)
    throw new RangeError(`missing array value at ${index}`)
  return value
}

function valueAt(
  values: Int32Array | Uint8Array | Float32Array,
  index: number
): number {
  const value = values[index]
  if (value === undefined)
    throw new RangeError(`missing table value at ${index}`)
  return value
}
