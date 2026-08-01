import { describe, expect, it, vi } from 'vitest'

vi.mock('d3-hierarchy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('d3-hierarchy')>()
  return { ...actual, packSiblings: vi.fn(actual.packSiblings) }
})

import { packSiblings } from 'd3-hierarchy'

import { advanceCursor } from '../../lib/viz/sim/cursor'
import { PACK_CHUNK_SIZE, isPacked, packOnce } from '../../lib/viz/sim/layout'
import { createSimState, digestSimState } from '../../lib/viz/sim/state'
import {
  cursorDayAtTick,
  snapPresentation,
  step,
  stepFrame,
} from '../../lib/viz/sim/step'
import {
  DAY_ALIVE,
  ENTITY_FILE,
  ENTITY_REPO,
  FIXED_DT,
  MAX_STEPS,
  SPEEDS,
} from '../../lib/viz/sim/types'
import type { SimInput, SimState } from '../../lib/viz/sim/types'

const TINY: SimInput = {
  dayCount: 200,
  windowStartISO: '2026-01-01',
  repoCount: 2,
  entityCount: 5,
  kind: Uint8Array.from([
    ENTITY_REPO,
    ENTITY_REPO,
    ENTITY_FILE,
    ENTITY_FILE,
    ENTITY_FILE,
  ]),
  repoOf: Int32Array.from([-1, -1, 0, 0, 1]),
  birthDay: Int32Array.from([0, 20, 2, 6, 22]),
  lastTouchDay: Int32Array.from([5, DAY_ALIVE, 4, DAY_ALIVE, 30]),
}

function makeLargeInput(): SimInput {
  const repoCount = 51
  const fileCount = 13402
  const entityCount = repoCount + fileCount
  const kind = new Uint8Array(entityCount)
  const repoOf = new Int32Array(entityCount)
  const birthDay = new Int32Array(entityCount)
  const lastTouchDay = new Int32Array(entityCount)

  for (let id = 0; id < entityCount; id++) {
    const birth = (id * 29) % 200
    kind[id] = id < repoCount ? ENTITY_REPO : ENTITY_FILE
    repoOf[id] = id < repoCount ? -1 : largeRepoFor(id - repoCount)
    birthDay[id] = birth
    lastTouchDay[id] = id % 7 === 0 ? DAY_ALIVE : birth + (id % 100)
  }

  return {
    dayCount: 400,
    windowStartISO: '2026-01-01',
    repoCount,
    entityCount,
    kind,
    repoOf,
    birthDay,
    lastTouchDay,
  }
}

function largeRepoFor(fileIndex: number): number {
  if (fileIndex < 7342) return 0
  if (fileIndex < 8793) return 1
  return 2 + ((fileIndex - 8793) % 49)
}

function advanceFrames(state: SimState, frames: number, delta: number): number {
  let accumulator = 0
  for (let frame = 0; frame < frames; frame++) {
    accumulator = stepFrame(state, delta, accumulator)
  }
  return accumulator
}

function presentationDigest(state: SimState): object {
  return {
    digest: digestSimState(state),
    alpha: sum(state.alpha),
    heat: sum(state.heat),
    beamHead: state.beamHead,
  }
}

function sum(values: Float32Array): number {
  let total = 0
  for (const value of values) total += value
  return total
}

describe('fixed simulation reducer', () => {
  it('is frame-rate independent through the fixed-step accumulator', () => {
    const atSixty = createSimState(TINY, 12345)
    const atOneTwenty = createSimState(TINY, 12345)
    packOnce(atSixty)
    packOnce(atOneTwenty)

    const sixtyAccumulator = advanceFrames(atSixty, 600, 1 / 60)
    const oneTwentyAccumulator = advanceFrames(atOneTwenty, 1200, FIXED_DT)

    expect(atSixty.tick).toBe(1200)
    expect(presentationDigest(atSixty)).toEqual(presentationDigest(atOneTwenty))
    expect(sixtyAccumulator).toBe(oneTwentyAccumulator)
  })

  it('uses a closed cursor form and drops an overlarge accumulator backlog', () => {
    const state = createSimState(TINY, 12345)

    expect(cursorDayAtTick(100, 0, 120)).toBe(96)
    expect(stepFrame(state, -1, 0)).toBe(0)
    expect(state.tick).toBe(0)
    expect(stepFrame(state, 5, 0)).toBe(0)
    expect(state.tick).toBe(MAX_STEPS)
  })

  it('packs only once and never repacks while stepping', () => {
    const state = createSimState(TINY, 12345)
    vi.mocked(packSiblings).mockClear()

    packOnce(state)
    const callsAfterPack = vi.mocked(packSiblings).mock.calls.length
    expect(callsAfterPack).toBe(TINY.repoCount)
    expect(isPacked(state)).toBe(true)
    packOnce(state)
    for (let tick = 0; tick < 10_000; tick++) step(state)

    expect(vi.mocked(packSiblings).mock.calls.length).toBe(callsAfterPack)
  })

  it('uses bounded deterministic cohorts at the measured corpus scale', () => {
    const state = createSimState(makeLargeInput(), 12345)
    vi.mocked(packSiblings).mockClear()
    const startedAt = performance.now()
    packOnce(state)
    const elapsed = performance.now() - startedAt

    for (const [circles] of vi.mocked(packSiblings).mock.calls) {
      expect(circles.length).toBeLessThanOrEqual(PACK_CHUNK_SIZE)
    }
    expect(elapsed).toBeLessThan(60)
    expect(state.px.every(Number.isFinite)).toBe(true)
    expect(state.py.every(Number.isFinite)).toBe(true)
  })

  it('replays identically after structured cloning', () => {
    const initial = createSimState(makeLargeInput(), 12345)
    packOnce(initial)
    for (let tick = 0; tick < 1000; tick++) step(initial)

    const clone = structuredClone(initial)
    expect(presentationDigest(clone)).toEqual(presentationDigest(initial))
    for (let tick = 0; tick < 5000; tick++) {
      step(initial)
      step(clone)
    }

    expect(presentationDigest(clone)).toEqual(presentationDigest(initial))
  })

  it('advances RNG only when an actor settles and retargets', () => {
    const state = createSimState(TINY, 12345)
    state.playing = false
    state.actorTX.fill(Number.MAX_VALUE)
    state.actorTY.fill(Number.MAX_VALUE)
    const rngBefore = state.rngState
    const drawsBefore = state.rngDraws

    for (let tick = 0; tick < 1000; tick++) step(state)

    expect(state.rngState).toBe(rngBefore)
    expect(state.rngDraws).toBe(drawsBefore)
  })

  it('crosses no more than one day per fixed step at the fastest speed', () => {
    const state = createSimState(TINY, 12345)
    state.speedIndex = SPEEDS.length - 1

    for (let tick = 0; tick < 10_000; tick++) {
      const before = state.cursorDayInt
      step(state)
      if (state.cursorDayInt <= before) {
        expect(before - state.cursorDayInt).toBeLessThanOrEqual(1)
      }
    }
  })

  it('wraps at day zero, restores the initial live set, and clears beams', () => {
    const state = createSimState(TINY, 12345)
    const initialLive = state.nLive
    packOnce(state)
    advanceCursor(state, 0)
    state.cursorDay = FIXED_DT
    state.beamLife[0] = 1

    step(state)

    expect(state.cursorDay).toBe(TINY.dayCount - 1)
    expect(state.nLive).toBe(initialLive)
    expect(state.beamLife.every((life) => life === 0)).toBe(true)
  })

  it('projects to a path-independent presentation without consuming RNG', () => {
    const state = createSimState(TINY, 12345)
    packOnce(state)
    advanceCursor(state, 22)
    const rngBefore = state.rngState
    const drawsBefore = state.rngDraws

    snapPresentation(state)
    const once = presentationDigest(state)
    snapPresentation(state)

    expect(presentationDigest(state)).toEqual(once)
    expect(state.rngState).toBe(rngBefore)
    expect(state.rngDraws).toBe(drawsBefore)
  })

  it('stays DOM-free in the node test environment', () => {
    expect(globalThis.document).toBeUndefined()
    expect(globalThis.window).toBeUndefined()
  })
})
