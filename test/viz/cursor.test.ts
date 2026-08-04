import { describe, expect, it } from 'vitest';

import {
  advanceCursor,
  isLive,
  liveIdsAscending,
  repoPhase,
  seekCursor,
} from '../../lib/viz/sim/cursor';
import { nextRng, rngValue } from '../../lib/viz/sim/rng';
import { createSimState, digestSimState, resetSimState } from '../../lib/viz/sim/state';
import {
  DAY_ALIVE,
  ENTITY_FILE,
  ENTITY_REPO,
  PHASE_ABSENT,
  PHASE_LIVE,
  type SimInput,
} from '../../lib/viz/sim/types';

const TINY: SimInput = {
  dayCount: 6,
  windowStartISO: '2026-01-01',
  repoCount: 2,
  entityCount: 5,
  kind: Uint8Array.from([ENTITY_REPO, ENTITY_REPO, ENTITY_FILE, ENTITY_FILE, ENTITY_FILE]),
  repoOf: Int32Array.from([-1, -1, 0, 0, 1]),
  birthDay: Int32Array.from([0, 3, 0, 2, 3]),
  lastTouchDay: Int32Array.from([1, DAY_ALIVE, 1, DAY_ALIVE, 4]),
};

function idsAt(state: ReturnType<typeof createSimState>): number[] {
  const ids = new Int32Array(state.entityCount);
  return Array.from(liveIdsAscending(state, ids) === 0 ? [] : ids.slice(0, state.nLive));
}

function makeLargeInput(): SimInput {
  const repoCount = 51;
  const fileCount = 13402;
  const entityCount = repoCount + fileCount;
  const kind = new Uint8Array(entityCount);
  const repoOf = new Int32Array(entityCount);
  const birthDay = new Int32Array(entityCount);
  const lastTouchDay = new Int32Array(entityCount);

  for (let id = 0; id < entityCount; id++) {
    const birth = id % 97;
    kind[id] = id < repoCount ? ENTITY_REPO : ENTITY_FILE;
    repoOf[id] = id < repoCount ? -1 : (id - repoCount) % repoCount;
    birthDay[id] = birth;
    lastTouchDay[id] = id % 11 === 0 ? DAY_ALIVE : birth + (id % 31);
  }

  return {
    dayCount: 131,
    windowStartISO: '2026-01-01',
    repoCount,
    entityCount,
    kind,
    repoOf,
    birthDay,
    lastTouchDay,
  };
}

describe('simulation lifespan cursor', () => {
  it('tracks file lifespans and repository phases over reverse playback', () => {
    const state = createSimState(TINY, 12345);

    expect(idsAt(state)).toEqual([2, 3, 4]);
    expect(repoPhase(state, 0, 5)).toBe(PHASE_LIVE);
    expect(repoPhase(state, 1, 2)).toBe(PHASE_LIVE);
    expect(isLive(state, 0)).toBe(false);

    advanceCursor(state, 2);
    expect(idsAt(state)).toEqual([2, 3, 4]);

    advanceCursor(state, 1);
    expect(idsAt(state)).toEqual([2, 3, 4]);
  });

  it('classifies ended repositories as absent and applies non-saturating tails', () => {
    const input: SimInput = {
      dayCount: 151,
      windowStartISO: '2026-01-01',
      repoCount: 1,
      entityCount: 2,
      kind: Uint8Array.from([ENTITY_REPO, ENTITY_FILE]),
      repoOf: Int32Array.from([-1, 0]),
      birthDay: Int32Array.from([0, 4]),
      lastTouchDay: Int32Array.from([7, 9]),
    };
    const state = createSimState(input, 1);

    expect(state.death[0]).toBe(97);
    expect(state.death[1]).toBe(39);
    expect(repoPhase(state, 0, 98)).toBe(PHASE_ABSENT);
    expect(repoPhase(state, 0, 97)).toBe(PHASE_LIVE);
    expect(repoPhase(state, 0, 30)).toBe(PHASE_LIVE);
  });

  it('is path-independent and permits arbitrary-direction seeks', () => {
    const descending = createSimState(TINY, 12345);
    const direct = createSimState(TINY, 12345);

    advanceCursor(descending, 2);
    seekCursor(direct, 4);
    seekCursor(direct, 2);

    expect(digestSimState(descending)).toEqual(digestSimState(direct));
    expect(() => advanceCursor(descending, 3)).toThrow(RangeError);
    seekCursor(descending, 5);
    expect(idsAt(descending)).toEqual([2, 3, 4]);
  });

  it('preserves the fractional cursor owned by the fixed-step reducer', () => {
    const state = createSimState(TINY, 12345);

    state.cursorDay = 4.75;
    advanceCursor(state, 4);
    expect(state.cursorDay).toBe(4.75);
    seekCursor(state, 2);
    expect(state.cursorDay).toBe(4.75);
  });

  it('remains deterministic after cloning and reset', () => {
    const state = createSimState(TINY, 12345);
    const replay = createSimState(TINY, 12345);

    for (let iteration = 0; iteration < 10000; iteration++) {
      const day = (TINY.dayCount - 1) - (iteration % TINY.dayCount);
      seekCursor(state, day);
      seekCursor(replay, day);
      state.rngState = nextRng(state.rngState);
      rngValue(state.rngState);
      state.rngDraws++;
      replay.rngState = nextRng(replay.rngState);
      rngValue(replay.rngState);
      replay.rngDraws++;
    }

    const clone = structuredClone(state);
    expect(digestSimState(clone)).toEqual(digestSimState(state));
    expect(digestSimState(replay)).toEqual(digestSimState(state));
    resetSimState(replay, 12345);
    expect(replay.rngDraws).toBe(0);
    expect(replay.rngState).toBe(12345);
  });

  it('imports cleanly in Node and handles repeated cursor paths', () => {
    const state = createSimState(makeLargeInput(), 11);
    const direct = createSimState(makeLargeInput(), 11);

    expect(globalThis.document).toBeUndefined();
    expect(globalThis.window).toBeUndefined();
    for (let iteration = 0; iteration < 10000; iteration++) {
      if (iteration > 0 && iteration % state.dayCount === 0) resetSimState(state, 11);
      advanceCursor(state, state.dayCount - 1 - (iteration % state.dayCount));
    }
    seekCursor(direct, state.cursorDayInt);
    expect(digestSimState(state)).toEqual(digestSimState(direct));
  });

  it('rejects malformed inputs and empty windows', () => {
    expect(() => createSimState({ ...TINY, dayCount: 0 }, 1)).toThrow(RangeError);
    expect(() => createSimState({
      ...TINY,
      lastTouchDay: Int32Array.from([1, DAY_ALIVE, 1, 1, 4]),
    }, 1)).toThrow('3');
    expect(() => createSimState({
      ...TINY,
      repoOf: Int32Array.from([0, -1, 0, 0, 1]),
    }, 1)).toThrow('invalid repo at 0');
  });
});
