import { seedCursor } from './cursor';
import { seedRng } from './rng';
import {
  DAY_ALIVE,
  DWELL_TAIL_DAYS,
  ENTITY_FILE,
  ENTITY_REPO,
  MAX_BEAMS,
  type SimInput,
  type SimState,
  type SimStateDigest,
} from './types';

/**
 * @description Allocates a complete deterministic simulation state from one payload.
 * @param input Structural simulation input from a downstream adapter.
 * @param seed Seed for the functional RNG stream.
 * @returns A state seeded at the final day of its input window.
 * @throws {RangeError} When the input cannot describe a valid simulation window.
 */
export function createSimState(input: SimInput, seed: number): SimState {
  validateInput(input);
  const death = buildDeaths(input);
  const state: SimState = {
    tick: 0,
    cursorDay: input.dayCount - 1,
    cursorDayInt: input.dayCount - 1,
    playing: true,
    speedIndex: 0,
    rngState: seedRng(seed),
    rngDraws: 0,
    entityCount: input.entityCount,
    repoCount: input.repoCount,
    dayCount: input.dayCount,
    windowStartISO: input.windowStartISO,
    kind: new Uint8Array(input.kind),
    repoOf: new Int32Array(input.repoOf),
    birth: new Int32Array(input.birthDay),
    death,
    byDeath: buildDeathOrder(input, death),
    live: new Int32Array(input.entityCount),
    slot: new Int32Array(input.entityCount),
    nLive: 0,
    pDeath: 0,
    alpha: new Float32Array(input.entityCount),
    heat: new Float32Array(input.entityCount),
    px: new Float32Array(input.entityCount),
    py: new Float32Array(input.entityCount),
    pr: new Float32Array(input.entityCount),
    repoAngle: new Float32Array(input.repoCount),
    repoX: new Float32Array(input.repoCount),
    repoY: new Float32Array(input.repoCount),
    repoR: new Float32Array(input.repoCount),
    repoAlpha: new Float32Array(input.repoCount),
    actorX: new Float32Array(2),
    actorY: new Float32Array(2),
    actorTX: new Float32Array(2),
    actorTY: new Float32Array(2),
    beamEnt: new Int32Array(MAX_BEAMS),
    beamActor: new Uint8Array(MAX_BEAMS),
    beamKind: new Uint8Array(MAX_BEAMS),
    beamLife: new Float32Array(MAX_BEAMS),
    beamHead: 0,
  };
  resetSimState(state, seed);
  return state;
}
/**
 * @description Restores mutable simulation channels to their seeded initial values.
 * @param state Simulation state to reset without reallocating typed arrays.
 * @param seed Seed for the reset RNG stream.
 */
export function resetSimState(state: SimState, seed: number): void {
  state.tick = 0;
  state.playing = true;
  state.speedIndex = 0;
  state.rngState = seedRng(seed);
  state.rngDraws = 0;
  state.cursorDay = state.dayCount - 1;
  state.alpha.fill(0);
  state.heat.fill(0);
  state.px.fill(0);
  state.py.fill(0);
  state.pr.fill(0);
  state.repoAngle.fill(0);
  state.repoX.fill(0);
  state.repoY.fill(0);
  state.repoR.fill(0);
  state.repoAlpha.fill(0);
  state.actorX.fill(0);
  state.actorY.fill(0);
  state.actorTX.fill(0);
  state.actorTY.fill(0);
  state.beamEnt.fill(-1);
  state.beamActor.fill(0);
  state.beamKind.fill(0);
  state.beamLife.fill(0);
  state.beamHead = 0;
  seedCursor(state, state.dayCount - 1);
}

/**
 * @description Projects mutable state into path-independent, renderer-safe equality data.
 * @param state Simulation state to summarize.
 * @returns The canonical equality projection for a simulation frame.
 */
export function digestSimState(state: SimState): SimStateDigest {
  let liveHash = 2166136261;
  let ghostRepos = 0;
  for (let id = state.repoCount; id < state.entityCount; id++) {
    if (valueAt(state.slot, id) !== -1) liveHash = Math.imul(liveHash ^ id, 16777619);
  }
  for (let repoId = 0; repoId < state.repoCount; repoId++) {
    if (state.cursorDayInt > valueAt(state.death, repoId)) ghostRepos++;
  }

  return {
    tick: state.tick,
    cursorDay: state.cursorDay,
    cursorDayInt: state.cursorDayInt,
    rngState: state.rngState,
    rngDraws: state.rngDraws,
    nLive: state.nLive,
    liveHash: liveHash >>> 0,
    ghostRepos,
  };
}
function buildDeaths(input: SimInput): Int32Array {
  const death = new Int32Array(input.entityCount);
  const lastDay = input.dayCount - 1;
  for (let id = 0; id < input.entityCount; id++) {
    const lastTouch = valueAt(input.lastTouchDay, id);
    if (lastTouch === DAY_ALIVE) {
      death[id] = DAY_ALIVE;
      continue;
    }
    const tail = valueAt(input.kind, id) === ENTITY_REPO ? DWELL_TAIL_DAYS.repo : DWELL_TAIL_DAYS.file;
    death[id] = Math.min(lastDay, lastTouch + tail);
  }
  return death;
}

function buildDeathOrder(input: SimInput, death: Int32Array): Int32Array {
  const files: number[] = [];
  for (let id = 0; id < input.entityCount; id++) {
    if (valueAt(input.kind, id) === ENTITY_FILE) files.push(id);
  }
  files.sort((left, right) => valueAt(death, right) - valueAt(death, left) || left - right);
  return Int32Array.from(files);
}

function validateInput(input: SimInput): void {
  if (!Number.isInteger(input.dayCount) || input.dayCount <= 0) {
    throw new RangeError('dayCount must be a positive integer');
  }
  if (!Number.isInteger(input.entityCount) || input.entityCount < 0) {
    throw new RangeError('entityCount must be a non-negative integer');
  }
  if (!Number.isInteger(input.repoCount) || input.repoCount < 0 || input.repoCount > input.entityCount) {
    throw new RangeError('repoCount must be within the entity table');
  }
  assertTableLengths(input);

  for (let id = 0; id < input.entityCount; id++) {
    validateEntity(input, id);
  }
}

function assertTableLengths(input: SimInput): void {
  const lengths = [
    input.kind.length,
    input.repoOf.length,
    input.birthDay.length,
    input.lastTouchDay.length,
  ];
  if (lengths.some((length) => length !== input.entityCount)) {
    throw new RangeError('every entity table must match entityCount');
  }
}
function validateEntity(input: SimInput, id: number): void {
  const kind = valueAt(input.kind, id);
  const birth = valueAt(input.birthDay, id);
  const lastTouch = valueAt(input.lastTouchDay, id);
  const repoOf = valueAt(input.repoOf, id);
  if (id < input.repoCount && (kind !== ENTITY_REPO || repoOf !== -1)) throw new RangeError(`invalid repo at ${id}`);
  if (id >= input.repoCount && (kind !== ENTITY_FILE || repoOf < 0 || repoOf >= input.repoCount)) throw new RangeError(`invalid file at ${id}`);
  if (!Number.isInteger(birth) || birth < 0 || birth >= input.dayCount) {
    throw new RangeError(`invalid birth day at ${id}`);
  }
  if (lastTouch !== DAY_ALIVE && (lastTouch < birth || lastTouch >= input.dayCount)) {
    throw new RangeError(`invalid last touch day at ${id}`);
  }
}
function valueAt(table: Int32Array | Uint8Array, index: number): number {
  const value = table[index];
  if (value === undefined) throw new RangeError(`missing table value at ${index}`);
  return value;
}
