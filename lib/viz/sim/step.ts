import { advanceCursor, repoPhase, seekCursor } from './cursor'
import { RING } from './layout'
import { nextRng, rngValue } from './rng'
import {
  FIXED_DT,
  MAX_BEAMS,
  MAX_STEPS,
  PHASE_GHOST,
  PHASE_LIVE,
  SPEEDS,
} from './types'
import type { SimState } from './types'

/** Half-life and per-second forms of the prototype's frame-based transitions. */
export const DECAY = {
  heatHalfLifeSeconds: 0.250901,
  repoEaseHalfLifeSeconds: 0.250901,
  repoGhostHalfLifeSeconds: 0.571827,
  actorEaseHalfLifeSeconds: 0.122494,
  fileAlphaHalfLifeSeconds: 0.250901,
  beamLifePerSecond: 1.32,
} as const

/** Alpha target for repositories whose active era has ended. */
export const REPO_GHOST_ALPHA = 0.34
/** Maximum events represented by beam slots for one crossed day. */
export const MAX_BEAMS_PER_DAY = 12
/** Unit-space extent used when actors choose a new idle target. */
export const ACTOR_WANDER = { x: 0.6, y: 0.5 } as const

const HEAT_KEEP = keepForStep(DECAY.heatHalfLifeSeconds)
const REPO_EASE_K = 1 - keepForStep(DECAY.repoEaseHalfLifeSeconds)
const REPO_GHOST_K = 1 - keepForStep(DECAY.repoGhostHalfLifeSeconds)
const ACTOR_EASE_K = 1 - keepForStep(DECAY.actorEaseHalfLifeSeconds)
const FILE_ALPHA_K = 1 - keepForStep(DECAY.fileAlphaHalfLifeSeconds)
const BEAM_DECAY_STEP = DECAY.beamLifePerSecond * FIXED_DT
const IDLE_EPSILON_SQ = 1e-6

/**
 * @description Advances presentation and playback by one deterministic fixed timestep.
 * @param state Mutable simulation state to advance in place.
 */
export function step(state: SimState): void {
  state.tick++
  if (state.playing && advancePlayback(state)) return
  settleFiles(state)
  settleRepos(state)
  decayBeams(state)
  settleActors(state)
}

/**
 * @description Advances fixed steps for a real frame delta without reading a wall clock.
 * @param state Mutable simulation state to advance.
 * @param dtSeconds Caller-supplied elapsed seconds.
 * @param accumulator Unconsumed fixed-step seconds from the prior frame.
 * @returns Remaining fixed-step accumulator in seconds.
 */
export function stepFrame(
  state: SimState,
  dtSeconds: number,
  accumulator: number
): number {
  let remaining = accumulator + Math.max(0, Math.min(dtSeconds, 0.25))
  let steps = 0
  while (remaining >= FIXED_DT && steps < MAX_STEPS) {
    step(state)
    remaining -= FIXED_DT
    steps++
  }
  return steps === MAX_STEPS ? 0 : remaining
}

/**
 * @description Calculates a cursor value for a constant speed, before any day-zero wrap.
 * @param startDay Cursor day at tick zero.
 * @param speedIndex Index into the approved playback speeds.
 * @param ticks Number of fixed simulation ticks elapsed.
 * @returns Cursor day clamped to the beginning of the available window.
 */
export function cursorDayAtTick(
  startDay: number,
  speedIndex: number,
  ticks: number
): number {
  return Math.max(0, startDay - speedAt(speedIndex) * FIXED_DT * ticks)
}

/**
 * @description Projects all presentation channels to their current cursor's settled state.
 * @param state Mutable simulation state to project without consuming time or RNG draws.
 */
export function snapPresentation(state: SimState): void {
  snapFiles(state)
  snapRepos(state)
  state.beamLife.fill(0)
  state.beamHead = 0
  for (let actorId = 0; actorId < state.actorX.length; actorId++) {
    state.actorX[actorId] = RING.cx
    state.actorY[actorId] = RING.cy
    state.actorTX[actorId] = RING.cx
    state.actorTY[actorId] = RING.cy
  }
}

function keepForStep(halfLifeSeconds: number): number {
  return Math.pow(0.5, FIXED_DT / halfLifeSeconds)
}

function advancePlayback(state: SimState): boolean {
  const nextDay = state.cursorDay - speedAt(state.speedIndex) * FIXED_DT
  if (nextDay <= 0) {
    const resetDay = state.dayCount - 1
    state.cursorDay = resetDay
    seekCursor(state, resetDay)
    snapPresentation(state)
    return true
  }
  state.cursorDay = nextDay
  const day = Math.floor(nextDay)
  if (day < state.cursorDayInt) emitEntered(state, day)
  return false
}

function emitEntered(state: SimState, day: number): void {
  const previousPointer = state.pDeath
  advanceCursor(state, day)
  let emitted = 0
  for (let pointer = previousPointer; pointer < state.pDeath; pointer++) {
    const entityId = valueAt(state.byDeath, pointer)
    if (valueAt(state.slot, entityId) === -1) continue
    state.heat[entityId] = 1
    if (emitted < MAX_BEAMS_PER_DAY) {
      emitBeam(state, entityId)
      emitted++
    }
  }
}

function settleFiles(state: SimState): void {
  for (let id = state.repoCount; id < state.entityCount; id++) {
    state.heat[id] = valueAt(state.heat, id) * HEAT_KEEP
    const target = valueAt(state.slot, id) === -1 ? 0 : 1
    state.alpha[id] =
      valueAt(state.alpha, id) +
      (target - valueAt(state.alpha, id)) * FILE_ALPHA_K
  }
}

function settleRepos(state: SimState): void {
  for (let repoId = 0; repoId < state.repoCount; repoId++) {
    const phase = repoPhase(state, repoId, state.cursorDayInt)
    const target =
      phase === PHASE_LIVE ? 1 : phase === PHASE_GHOST ? REPO_GHOST_ALPHA : 0
    const easing = phase === PHASE_GHOST ? REPO_GHOST_K : REPO_EASE_K
    const angle = valueAt(state.repoAngle, repoId)
    state.repoAlpha[repoId] =
      valueAt(state.repoAlpha, repoId) +
      (target - valueAt(state.repoAlpha, repoId)) * easing
    easeRepoPosition(state, repoId, angle)
  }
}

function easeRepoPosition(
  state: SimState,
  repoId: number,
  angle: number
): void {
  const x = RING.cx + Math.cos(angle) * RING.rx
  const y = RING.cy + Math.sin(angle) * RING.ry
  state.repoX[repoId] =
    valueAt(state.repoX, repoId) +
    (x - valueAt(state.repoX, repoId)) * REPO_EASE_K
  state.repoY[repoId] =
    valueAt(state.repoY, repoId) +
    (y - valueAt(state.repoY, repoId)) * REPO_EASE_K
}

function decayBeams(state: SimState): void {
  for (let beamId = 0; beamId < MAX_BEAMS; beamId++) {
    const life = valueAt(state.beamLife, beamId)
    if (life > 0) state.beamLife[beamId] = Math.max(0, life - BEAM_DECAY_STEP)
  }
}

function settleActors(state: SimState): void {
  for (let actorId = 0; actorId < state.actorX.length; actorId++) {
    easeActor(state, actorId)
    if (isSettled(state, actorId)) retargetActor(state, actorId)
  }
}

function easeActor(state: SimState, actorId: number): void {
  state.actorX[actorId] =
    valueAt(state.actorX, actorId) +
    (valueAt(state.actorTX, actorId) - valueAt(state.actorX, actorId)) *
      ACTOR_EASE_K
  state.actorY[actorId] =
    valueAt(state.actorY, actorId) +
    (valueAt(state.actorTY, actorId) - valueAt(state.actorY, actorId)) *
      ACTOR_EASE_K
}

function isSettled(state: SimState, actorId: number): boolean {
  const dx = valueAt(state.actorTX, actorId) - valueAt(state.actorX, actorId)
  const dy = valueAt(state.actorTY, actorId) - valueAt(state.actorY, actorId)
  return dx * dx + dy * dy < IDLE_EPSILON_SQ
}

function retargetActor(state: SimState, actorId: number): void {
  state.rngState = nextRng(state.rngState)
  const x = rngValue(state.rngState)
  state.rngDraws++
  state.rngState = nextRng(state.rngState)
  const y = rngValue(state.rngState)
  state.rngDraws++
  state.actorTX[actorId] = RING.cx + (x - 0.5) * ACTOR_WANDER.x
  state.actorTY[actorId] = RING.cy + (y - 0.5) * ACTOR_WANDER.y
}

function emitBeam(state: SimState, entityId: number): void {
  const beamId = state.beamHead
  state.beamEnt[beamId] = entityId
  state.beamActor[beamId] = 0
  state.beamKind[beamId] = 0
  state.beamLife[beamId] = 1
  state.beamHead = (beamId + 1) % MAX_BEAMS
  const repoId = valueAt(state.repoOf, entityId)
  if (repoId < 0) return
  state.actorTX[0] =
    valueAt(state.repoX, repoId) + valueAt(state.px, entityId) * 0.03
  state.actorTY[0] =
    valueAt(state.repoY, repoId) + valueAt(state.py, entityId) * 0.05
}

function snapFiles(state: SimState): void {
  for (let id = state.repoCount; id < state.entityCount; id++) {
    state.alpha[id] = valueAt(state.slot, id) === -1 ? 0 : 1
    state.heat[id] = 0
  }
}

function snapRepos(state: SimState): void {
  for (let repoId = 0; repoId < state.repoCount; repoId++) {
    const phase = repoPhase(state, repoId, state.cursorDayInt)
    const angle = valueAt(state.repoAngle, repoId)
    state.repoAlpha[repoId] =
      phase === PHASE_LIVE ? 1 : phase === PHASE_GHOST ? REPO_GHOST_ALPHA : 0
    state.repoX[repoId] = RING.cx + Math.cos(angle) * RING.rx
    state.repoY[repoId] = RING.cy + Math.sin(angle) * RING.ry
  }
}

function speedAt(speedIndex: number): number {
  const speed = SPEEDS[speedIndex]
  if (speed === undefined)
    throw new RangeError(`unknown speed index ${speedIndex}`)
  return speed
}

function valueAt(values: Int32Array | Float32Array, index: number): number {
  const value = values[index]
  if (value === undefined)
    throw new RangeError(`missing table value at ${index}`)
  return value
}
