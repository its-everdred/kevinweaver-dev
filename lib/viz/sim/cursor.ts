import type { RepoPhase, SimState } from './types';
import { ENTITY_FILE, PHASE_ABSENT, PHASE_GHOST, PHASE_LIVE } from './types';

/**
 * @description Seeds the file live set at a cursor day from empty state.
 * @param state Simulation state to seed.
 * @param day Inclusive day index to represent.
 */
export function seedCursor(state: SimState, day: number): void {
  assertDay(state, day);
  clearLiveSet(state);
  while (
    state.pDeath < state.byDeath.length &&
    valueAt(state.death, valueAt(state.byDeath, state.pDeath)) >= day
  ) {
    const id = valueAt(state.byDeath, state.pDeath++);
    if (valueAt(state.birth, id) <= day) {
      liveAdd(state, id);
      heapPush(state, id);
    }
  }
  state.cursorDayInt = day;
  state.cursorDay = day;
}

/**
 * @description Moves the cursor backward while incrementally maintaining files in range.
 * @param state Simulation state to update.
 * @param day Inclusive day index, which must not exceed the current day.
 * @throws {RangeError} When the caller moves the reverse cursor forward or out of range.
 */
export function advanceCursor(state: SimState, day: number): void {
  assertDay(state, day);
  if (day > state.cursorDayInt) {
    throw new RangeError('advanceCursor cannot move forward in day index');
  }
  while (
    state.pDeath < state.byDeath.length &&
    valueAt(state.death, valueAt(state.byDeath, state.pDeath)) >= day
  ) {
    const id = valueAt(state.byDeath, state.pDeath++);
    if (valueAt(state.birth, id) <= day) {
      liveAdd(state, id);
      heapPush(state, id);
    }
  }
  while (state.nHeap > 0 && valueAt(state.birth, valueAt(state.birthHeap, 0)) > day) {
    liveRemove(state, heapPop(state));
  }

  state.cursorDayInt = day;
  state.cursorDay = day;
}

/**
 * @description Rebuilds the file live set for any valid day index.
 * @param state Simulation state to update.
 * @param day Inclusive day index to represent.
 */
export function seekCursor(state: SimState, day: number): void {
  assertDay(state, day);
  clearLiveSet(state);
  while (
    state.pDeath < state.byDeath.length &&
    valueAt(state.death, valueAt(state.byDeath, state.pDeath)) >= day
  ) {
    const id = valueAt(state.byDeath, state.pDeath++);
    if (valueAt(state.birth, id) <= day) {
      liveAdd(state, id);
      heapPush(state, id);
    }
  }
  state.cursorDayInt = day;
  state.cursorDay = day;
}

/**
 * @description Classifies a repository independently of cursor history.
 * @param state Simulation state containing repository lifespans.
 * @param repoId Repository entity id.
 * @param day Day index to classify.
 * @returns Whether the repository is absent, live, or a dimmed ghost.
 */
export function repoPhase(state: SimState, repoId: number, day: number): RepoPhase {
  if (!Number.isInteger(repoId) || repoId < 0 || repoId >= state.repoCount) {
    throw new RangeError(`repo id ${repoId} is outside the repository table`);
  }
  assertDay(state, day);
  if (day < valueAt(state.birth, repoId)) return PHASE_ABSENT;
  if (day <= valueAt(state.death, repoId)) return PHASE_LIVE;
  return PHASE_GHOST;
}

/**
 * @description Tests whether a file id is in the incremental live set.
 * @param state Simulation state to inspect.
 * @param id Entity id to test.
 * @returns True only for a currently-live file entity.
 */
export function isLive(state: SimState, id: number): boolean {
  return (
    Number.isInteger(id) &&
    id >= state.repoCount &&
    id < state.entityCount &&
    valueAt(state.kind, id) === ENTITY_FILE &&
    valueAt(state.slot, id) !== -1
  );
}

/**
 * @description Enumerates currently-live file ids in canonical ascending order.
 * @param state Simulation state to enumerate.
 * @param out Caller-owned buffer with capacity for every entity.
 * @returns The number of ids written to out.
 * @throws {RangeError} When out cannot hold the complete entity table.
 */
export function liveIdsAscending(state: SimState, out: Int32Array): number {
  if (out.length < state.entityCount) {
    throw new RangeError('live id output buffer is smaller than the entity table');
  }

  let count = 0;
  for (let id = state.repoCount; id < state.entityCount; id++) {
    if (valueAt(state.slot, id) !== -1) out[count++] = id;
  }
  return count;
}

function assertDay(state: SimState, day: number): void {
  if (!Number.isInteger(day) || day < 0 || day >= state.dayCount) {
    throw new RangeError(`day ${day} is outside the simulation window`);
  }
}

function clearLiveSet(state: SimState): void {
  state.live.fill(0);
  state.slot.fill(-1);
  state.birthHeap.fill(0);
  state.nLive = 0;
  state.nHeap = 0;
  state.pDeath = 0;
}

function liveAdd(state: SimState, id: number): void {
  state.live[state.nLive] = id;
  state.slot[id] = state.nLive++;
}

function liveRemove(state: SimState, id: number): void {
  const slot = valueAt(state.slot, id);
  const last = state.nLive - 1;
  const lastId = valueAt(state.live, last);
  state.live[slot] = lastId;
  state.slot[lastId] = slot;
  state.slot[id] = -1;
  state.nLive = last;
}

function heapPush(state: SimState, id: number): void {
  let index = state.nHeap++;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    const parentId = valueAt(state.birthHeap, parent);
    if (!hasHigherBirth(state, id, parentId)) break;
    state.birthHeap[index] = parentId;
    index = parent;
  }
  state.birthHeap[index] = id;
}

function heapPop(state: SimState): number {
  const top = valueAt(state.birthHeap, 0);
  const last = valueAt(state.birthHeap, --state.nHeap);
  let index = 0;
  while (index * 2 + 1 < state.nHeap) {
    const left = index * 2 + 1;
    const right = left + 1;
    const child =
      right < state.nHeap &&
      hasHigherBirth(state, valueAt(state.birthHeap, right), valueAt(state.birthHeap, left))
        ? right
        : left;
    const childId = valueAt(state.birthHeap, child);
    if (!hasHigherBirth(state, childId, last)) break;
    state.birthHeap[index] = childId;
    index = child;
  }
  if (state.nHeap > 0) state.birthHeap[index] = last;
  return top;
}
function hasHigherBirth(state: SimState, left: number, right: number): boolean {
  return valueAt(state.birth, left) === valueAt(state.birth, right)
    ? left > right
    : valueAt(state.birth, left) > valueAt(state.birth, right);
}
function valueAt(table: Int32Array | Uint8Array, index: number): number {
  const value = table[index];
  if (value === undefined) throw new RangeError(`missing table value at ${index}`);
  return value;
}
