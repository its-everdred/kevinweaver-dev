# KW-008 — Viz contract: SimState types, lifespan cursors, seeded RNG

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Three small pure modules with no I/O, but the reverse-time cursor algorithm and the functional RNG are the contract that KW-021 and KW-022 build against in parallel, so the interface has to be right the first time.

**Risk:** Medium — nothing renders, so a defect stays invisible until KW-021 and KW-022 consume it; a wrong SimState shape forces rework in two downstream tickets, one of which is on the critical path.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-005, REQ-008

**Decisions:** DEC-003, DEC-005, DEC-008, DEC-010, DEC-016

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/viz/sim/` contains the pure, DOM-free core of the visualization — the shared `SimState` and `SimInput` types, the reverse-time lifespan cursor, and the seeded RNG — and it imports cleanly in plain Node, survives `structuredClone`, replays bit-identically from a seed, and is fenced by ESLint rules that fail the build on any use of `Math.random`, `Date.now`, `performance.now`, `requestAnimationFrame` or timers inside that directory.

## Context and evidence

The design prototype at `docs/design/kevinweaver.dev.dc.html` (1,033 lines, verified at the researched commit) is a working animation with two structural problems this ticket exists to fix.

**Problem 1 — the prototype accumulates instead of stabbing lifespans.** It sets `f.seen = true` (line 464) and `r.entered = true` (line 465) and never clears them, so walking backwards the on-screen set only ever grows: at 2021 it still shows repositories that did not exist yet. **DEC-010** replaces this with lifespan-interval visibility, `birth <= T <= death`, plus a dimmed *ghost* state for repositories whose era has already ended relative to the cursor. That change is what makes visibility a pure function of `T` with no history and no hysteresis, which is in turn what makes deterministic screenshots possible at all.

**Problem 2 — the prototype is nondeterministic in six independent places.** Measured at the researched commit: **6** `Math.random`, **5** `performance.now`, **4** `Date.now`/`new Date` call sites, including two `Math.random` calls inside `emitLive()` (lines 952–953) and one `performance.now()` inside `begin()` (line 458). Every one is a determinism blocker for KW-031's visual-regression baselines.

**C-24** is the contradiction this ticket resolves in code. The ci-testing track proposed a closure-based `createRng(seed)`; its verifier refuted the implementation on three counts, and the verifier wins:

- **C-24a** — a closure over a mutable `let a` makes `step` impure. Two calls to `step(s0)` with the same `s0` return different results, and property-based tests over `step` are unsound. Fix: carry the RNG as a **32-bit integer field on `SimState`**, advanced functionally.
- **C-24b** — `structuredClone(state)` throws `DataCloneError` when `state.rng` is a function. Measured: `node -e "structuredClone({rng:()=>1})"` throws. The same fix resolves it.
- **C-24c** — `no-restricted-globals` does not catch `window.requestAnimationFrame`; its `checkGlobalObject` option defaults to `false`. Fix: set `checkGlobalObject: true` and widen the `files` glob so it actually matches.

**DEC-016** settles which RNG: mulberry32, not the xorshift128 that the viz-runtime track proposed independently, because mulberry32 uses only `Math.imul`, `^` and `>>>` — no floating-point accumulation — so it is bit-identical across V8 versions and architectures.

**C-27** sets the scale this code must hold: **13,453 unique paths across 51 repos** (data-pipeline, "exact"), not the 7,354 entities / ~20 repos the viz-runtime track assumed. Its own verifier (C9) recomputed resident state at **633 KB** of typed arrays rather than 172 KB. GT-6 corroborates the order of magnitude: `aiur-team/aiur` alone has 7,342 unique paths.

**C-30** ruled that tickets cite method names first and line numbers second, because six of the viz-runtime track's line citations were off by 2–6 lines. The line numbers in this document were re-derived against the researched commit.

This ticket is deliberately a **contract, not an implementation**. Splitting the viz core into a contract (types + cursors + RNG, here) and an implementation (reducer + layout, KW-021) is what lets KW-021 and KW-022 run in parallel in wave 3 instead of KW-022 waiting on a proven reducer. It removes one level from the critical path, and it puts KW-008 *on* that path: `KW-001 → KW-008 → KW-022 → KW-024 → KW-025 → KW-029 → KW-032`.

Requirements this ticket carries:

- **REQ-005** — Every repository and contribution figure the site displays is derived from measured GitHub data at generation time; no figure is a literal in copy or code. *Trace:* two ways. `dayCount` and `windowStartISO` come from `SimInput`, never from a constant (invariant I-6, DEC-008) — the prototype's three mutually inconsistent windows are what DEC-008 exists to kill. And DEC-010's lifespan semantics are the on-screen form of the same requirement: monotonic accumulation puts repositories on screen at dates when they did not exist, which is a fabricated figure rendered as a picture.
- **REQ-008** — The pipeline is a deterministic function of its inputs: the same inputs produce byte-identical output on every run. *Trace:* this ticket carries the client-runtime half of that property. A frame is fully described by `(SimInput, seed, tick)`, the RNG is a 32-bit integer field advanced functionally, and the ESLint fence makes any wall-clock or `Math.random` leak a build failure rather than a flaky screenshot.

Plan context, all pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772` (browse at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/`):

| What | Where |
|---|---|
| Pack index, and the `KW-01..KW-32` → `KW-001..KW-032` zero-padding map | `docs/build-orders/site-rewrite/README.md` (pack sibling, same planning commit) |
| Wave and graph analysis, verified topological levels, critical path, write-surface partition | `docs/research/2026-07-31-decomposition-synthesis.md` §6 |
| Decision registry `D-01..D-17` (published as `DEC-001..DEC-017`) | same document, §3 |
| Human gates `HG-1..HG-7` (published as `GATE-001..GATE-007`) | same document, §4 |
| This ticket's implementation pointers | same document, §5, wave 2, entry "KW-08" |
| Reverse-playback state model, `State` shape, determinism API, and the corpus-scale corrections | `docs/research/2026-07-31-viz-runtime.md` §1, §2, §8 and its "Verification corrections" C1/C2/C9 |
| Determinism architecture and the three defects fixed here | `docs/research/2026-07-31-ci-testing.md` §5.1–5.3 and its "Verification corrections" C3 |

## Scope

- Define `SimInput` and `SimState` in `lib/viz/sim/types.ts` as the single shared shape that KW-021, KW-022 and KW-024 all import, together with the shared constants `DAY_ALIVE`, `SPEEDS`, `FIXED_DT`, `MAX_STEPS`, `MAX_BEAMS` and the entity/phase enums.
- Implement `lib/viz/sim/rng.ts`: mulberry32 decomposed into the two allocation-free pure functions `nextRng(rngState)` and `rngValue(rngState)`, plus `randomHash(a, b)` for render-side jitter that must not consume the stream.
- Implement `lib/viz/sim/cursor.ts`: the reverse-time two-pointer plus max-heap live-set maintenance (`seedCursor`, `advanceCursor`), the `O(n)` rescan `seekCursor`, the `repoPhase` ghost classifier, and the canonical ascending enumeration `liveIdsAscending`.
- Implement `lib/viz/sim/state.ts`: `createSimState(input, seed)` allocating every typed array exactly once, `resetSimState(state, seed)`, the dwell-tail application, and `digestSimState(state)` as the canonical path-independent equality projection.
- Add one scoped determinism override block to `eslint.config.mjs` covering `lib/viz/sim/**`, with `checkGlobalObject: true`.
- Add `test/viz/cursor.test.ts` and `test/viz/rng.test.ts` proving DOM-freedom, `structuredClone` round-trip, path independence, and bit-identical replay from a seed.

## Non-goals

- No `step()`, no fixed-timestep integrator, no half-life decay conversion, no `packOnce`/circle-pack layout — KW-021 owns `lib/viz/sim/step.ts` and `lib/viz/sim/layout.ts`.
- No rendering, no canvas, no `ctx`, no colour ramp — KW-022 owns `lib/viz/render/**` and KW-007 owns `lib/viz/tokens/**`.
- No `requestAnimationFrame` loop, no driver, no `window.__viz` test harness, no day-index to calendar-date conversion — KW-024 owns `lib/viz/driver.ts` and `lib/viz/testHarness.ts`.
- No wire-format or bundle types, and no import from `lib/bundle/**` — KW-012 owns the codec contract; this ticket declares its own `SimInput` and the adapter is written downstream.
- No changes to `package.json` or `package-lock.json`; both are frozen after KW-001 (DEC-003). Everything needed here is already installed by KW-001.
- No `vitest.config.mts`, no coverage thresholds, no test projects — KW-011 owns Vitest scaffolding.
- No checkpoint bitsets and no seek acceleration structures: a brute-force `O(n)` rescan of the whole entity table is 9.7 µs measured (0.088 ms re-measured at the corrected 13,453-entity scale), so the 18 KB of bitsets buys nothing.

## Existing owner and reuse target

There is no existing owner. `lib/` and `test/` do not exist at `e664d73a195facd64db58ba10952170ff01b4772` (`git ls-files` shows only `.aiur/`, `components/`, `pages/`, `public/`, `styles/`, `docs/` and root config). Every file in this ticket's write surface is new except `eslint.config.mjs`.

Named upstream artifacts this ticket consumes, all created by **KW-001**:

| Artifact | Created by | What KW-008 uses it for |
|---|---|---|
| `eslint.config.mjs` | KW-001 | this ticket appends exactly one scoped override object; it does not restructure the file |
| `tsconfig.json` | KW-001 | `npx tsc --noEmit` must pass; `strict` is expected to be on |
| `package.json` scripts `lint`, `typecheck`, `test:unit` | KW-001 (DEC-003 pre-declares all of them) | the agent gate commands |
| `vitest@4.1.10` in `devDependencies` | KW-001 (DEC-003 pre-installs the full downstream set) | running `test/viz/*.test.ts` |

The **port source** is the prototype at `docs/design/kevinweaver.dev.dc.html`, which exists and is committed at the researched commit. Read these methods, in this order, and cite methods before line numbers (C-30):

| Prototype site | Lines | What to take, what to reject |
|---|---|---|
| `constructor` | 195–221 | take `this.speeds = [4, 8, 12, 20, 32]` (line 209) verbatim as `SPEEDS` |
| `buildData` | 267–393 | reject `this.start = new Date(Date.UTC(2021, 7, 1))` (line 273) — the window comes from the payload (DEC-008) |
| `begin` | 450–462 | reject `this.last = performance.now()` (line 458) |
| `settleStatic` | 463–470 | reject `f.seen = true` / `r.entered = true` (lines 464–465) — this is the accumulation bug DEC-010 fixes |
| `drawGraph` | 705–903 | take the dwell-tail idea from `d >= r.from - 20 && d <= r.to + 90` (line 716); leave everything else to KW-022 |
| `emitLive` | 948–960 | reject entirely — two `Math.random()` calls (952–953); DEC-014 deletes the synthesiser |

## Contract and invariants

This ticket is the **producer**. KW-021, KW-022 and KW-024 are the consumers and quote the sketches below verbatim.

### The shared type surface — `lib/viz/sim/types.ts`

```ts
/** Sentinel day index meaning "still alive at the end of the window". */
export const DAY_ALIVE = 0x7fffffff;

/** Playback speeds in days/second. Verbatim from the prototype, line 209. */
export const SPEEDS = [4, 8, 12, 20, 32] as const;

/** Fixed sim timestep, seconds. 120 Hz, decoupled from display refresh. */
export const FIXED_DT = 1 / 120;
/** Spiral-of-death clamp: never simulate more than 8 steps of catch-up in one frame. */
export const MAX_STEPS = 8;
/** Beam ring-buffer capacity. Fixed; the buffer never grows. */
export const MAX_BEAMS = 256;

/** Dwell tail added to the last touch before an entity is considered dead. */
export const DWELL_TAIL_DAYS = { repo: 90, file: 30 } as const;

export const ENTITY_REPO = 0;
export const ENTITY_FILE = 1;

export const PHASE_ABSENT = 0; // cursor is earlier than birth: it did not exist yet
export const PHASE_LIVE = 1;   // birth <= cursor <= death
export const PHASE_GHOST = 2;  // cursor is later than death: dimmed outline (DEC-010)

export type RepoPhase =
  | typeof PHASE_ABSENT
  | typeof PHASE_LIVE
  | typeof PHASE_GHOST;

/**
 * The ONLY ingest shape lib/viz/sim accepts. Deliberately structural and
 * local: KW-008 does not depend on KW-012, so it must not import
 * lib/bundle/schema.ts. Whoever wires the decoded bundle to the sim writes
 * the adapter (KW-024, lib/viz/driver.ts).
 *
 * Day indices are 0-based and increase with calendar time. Day 0 is
 * windowStartISO. The cursor walks DOWN from dayCount - 1.
 */
export interface SimInput {
  /** Number of days in the window. From the payload; never a literal (DEC-008). */
  readonly dayCount: number;
  /** 'YYYY-MM-DD' for day index 0. Opaque here — lib/viz/sim never parses dates. */
  readonly windowStartISO: string;
  /** Repo entities occupy ids [0, repoCount). File entities follow. */
  readonly repoCount: number;
  readonly entityCount: number;
  /** ENTITY_REPO | ENTITY_FILE, length entityCount. */
  readonly kind: Uint8Array;
  /** Owning repo id for files; -1 for repo entities. Length entityCount. */
  readonly repoOf: Int32Array;
  /** First touch, day index. Length entityCount. */
  readonly birthDay: Int32Array;
  /** Last touch, day index, or DAY_ALIVE. Length entityCount. */
  readonly lastTouchDay: Int32Array;
}

/**
 * Allocated exactly once by createSimState(). Every field is
 * structuredClone-safe: numbers, booleans, strings and typed arrays only.
 * No functions, no Map, no Set, no closures, no DOM references (C-24b).
 */
export interface SimState {
  // ---- deterministic clock ----
  /** Integer count of fixed steps taken. THE canonical clock. */
  tick: number;
  /** Day index, float, decreasing. cursorDay = f(tick) while playing. */
  cursorDay: number;
  /** Math.floor(cursorDay). The value the cursor pointers actually track. */
  cursorDayInt: number;
  playing: boolean;
  /** Index into SPEEDS. */
  speedIndex: number;

  // ---- rng: a 32-bit integer field, advanced functionally (DEC-016, C-24a) ----
  rngState: number;
  /** Count of rngValue() results consumed. Test hook: assert no drift. */
  rngDraws: number;

  // ---- static entity table: written by createSimState, never mutated after ----
  entityCount: number;
  repoCount: number;
  dayCount: number;
  windowStartISO: string;
  kind: Uint8Array;
  repoOf: Int32Array;
  birth: Int32Array;
  /** Dwell tail already applied. DAY_ALIVE for still-alive entities. */
  death: Int32Array;
  /** File entity ids sorted death DESC, tie-broken id ASC. Static. */
  byDeath: Int32Array;

  // ---- live set (ECS swap-remove) ----
  /** Dense list of live ids. ORDER IS UNSPECIFIED — see invariant I-3. */
  live: Int32Array;
  /** entity id -> index into live, or -1 when not live. Length entityCount. */
  slot: Int32Array;
  nLive: number;
  /** Monotone pointer into byDeath. */
  pDeath: number;
  /** Max-heap of live file ids keyed by birth[]. */
  birthHeap: Int32Array;
  nHeap: number;

  // ---- presentation channels: allocated here, written by KW-021 step() ----
  alpha: Float32Array;
  heat: Float32Array;

  // ---- packed layout: allocated here, written ONCE by KW-021 packOnce() ----
  px: Float32Array;
  py: Float32Array;
  pr: Float32Array;

  // ---- repo ring, length repoCount: allocated here, written by KW-021 ----
  repoAngle: Float32Array;
  repoX: Float32Array;
  repoY: Float32Array;
  repoR: Float32Array;
  repoAlpha: Float32Array;

  // ---- actors, length 2: [human, agent] ----
  actorX: Float32Array;
  actorY: Float32Array;
  actorTX: Float32Array;
  actorTY: Float32Array;

  // ---- beams: fixed-capacity ring buffer, length MAX_BEAMS ----
  beamEnt: Int32Array;
  beamActor: Uint8Array;
  beamKind: Uint8Array;
  beamLife: Float32Array;
  beamHead: number;
}

/**
 * The canonical, path-independent projection of a frame. This — not deep
 * equality on SimState — is the equality surface tests assert on, and it is
 * the shape KW-024 widens into VizFrameInfo.
 */
export interface SimStateDigest {
  tick: number;
  cursorDay: number;
  cursorDayInt: number;
  rngState: number;
  rngDraws: number;
  nLive: number;
  /** FNV-1a over liveIdsAscending(). Order-independent by construction. */
  liveHash: number;
  ghostRepos: number;
}
```

### The RNG — `lib/viz/sim/rng.ts`

```ts
/** Coerce any seed to a 32-bit unsigned RNG state. NaN and undefined -> 0. */
export function seedRng(seed: number): number {
  return Number.isFinite(seed) ? seed >>> 0 : 0;
}

/** Advance the RNG. Pure, allocation-free. mulberry32's state step. */
export function nextRng(rngState: number): number {
  return (rngState + 0x6d2b79f5) >>> 0;
}

/** Map an RNG state to a value in [0, 1). Pure, allocation-free. */
export function rngValue(rngState: number): number {
  let t = rngState >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Deterministic hash for render-side jitter. render/ MUST use this and MUST
 * NOT touch the stream: render may be called a different number of times
 * than sim, so a stream draw in render desynchronises replay.
 */
export function randomHash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
```

The call-site pattern consumers copy — never a closure, never a tuple return, zero allocation:

```ts
state.rngState = nextRng(state.rngState);
const r = rngValue(state.rngState);
state.rngDraws++;
```

**Verified this session:** `nextRng`/`rngValue` composed in that order reproduce a canonical closure-based `mulberry32(12345)` exactly for 1,000 successive draws. That equivalence is the property `test/viz/rng.test.ts` must pin.

### The cursor — `lib/viz/sim/cursor.ts`

```ts
/** Seed the live set at day, from empty. Called by createSimState/resetSimState. */
export function seedCursor(state: SimState, day: number): void;

/**
 * Advance the cursor DOWN to `day`, maintaining the live set incrementally.
 * Requires day <= state.cursorDayInt; throws RangeError otherwise. Callers
 * that need to move forward in day index call seekCursor instead.
 */
export function advanceCursor(state: SimState, day: number): void;

/** Rebuild the live set at `day` from scratch. O(entityCount). Any direction. */
export function seekCursor(state: SimState, day: number): void;

/** O(1) three-way classification for a repo entity (DEC-010). */
export function repoPhase(state: SimState, repoId: number, day: number): RepoPhase;

/** O(1) membership test. Always false for repo entities — see invariant I-1. */
export function isLive(state: SimState, id: number): boolean;

/**
 * Fill `out` with the live entity ids in ASCENDING id order and return the
 * count. `out` must have length >= state.entityCount. This is the ONLY
 * enumeration renderers may use to establish draw order (invariant I-3).
 */
export function liveIdsAscending(state: SimState, out: Int32Array): number;
```

`advanceCursor` is the two-pointer plus heap algorithm, transcribed from viz-runtime §1.2:

```ts
// ENTER: cursor crosses down through death(e)
while (state.pDeath < state.byDeath.length &&
       state.death[state.byDeath[state.pDeath]] >= day) {
  const e = state.byDeath[state.pDeath++];
  if (state.birth[e] <= day) { liveAdd(state, e); heapPush(state, e); }
}
// LEAVE: cursor crosses down through birth(e)
while (state.nHeap && state.birth[state.birthHeap[0]] > day) {
  liveRemove(state, heapPop(state));
}
state.cursorDayInt = day;
```

### Invariants

- **I-1 — visibility is a pure function of the cursor.** For every **file** entity `e` and day `T`: `isLive(state, e) === (birth[e] <= T && T <= death[e])` after any sequence of cursor calls ending at `T`. No history, no hysteresis, no `seen` flag. The live set, `byDeath`, `slot` and `birthHeap` track **file entities only** — `isLive(state, repoId)` is always `false` and `slot[repoId]` stays `-1` for the whole run. Repositories are classified by `repoPhase`, which is `O(1)` and needs no pointer machinery because there are only ~51 of them.
- **I-2 — repositories ghost, files vanish (DEC-010).** `repoPhase` returns `PHASE_ABSENT` when `T < birth`, `PHASE_LIVE` when `birth <= T <= death`, and `PHASE_GHOST` when `T > death`. Ghosts render as dimmed outlines rather than disappearing, which is what preserves the "longer you stay, the further back you see" property without the dishonesty of monotonic accumulation. Files have no ghost state; there are ~51 repos and ~13,400 files, so ghosting is bounded.
- **I-3 — `live` order is path-dependent; the digest is not.** Swap-remove means the order of `state.live` depends on the sequence of cursor calls that produced it. Consumers must not depend on it. Draw order comes from `liveIdsAscending`, and equality assertions come from `digestSimState`. **Verified this session:** `digestSimState` after `seekCursor(state, D)` equals `digestSimState` after a monotone `advanceCursor` walk down to `D`, at every sampled day across a 1,826-day, 13,453-entity synthetic corpus (0 mismatches over 11 sampled days).
- **I-4 — the RNG is a 32-bit integer field, advanced functionally (DEC-016, C-24a/C-24b).** `SimState` never carries a function. `structuredClone(state)` must not throw and must round-trip to an equal digest.
- **I-5 — one allocation point.** `createSimState` is the only function in `lib/viz/sim/` that allocates. `advanceCursor`, `seekCursor`, `nextRng`, `rngValue`, `randomHash` and `repoPhase` allocate nothing. `liveIdsAscending` writes into a caller-supplied buffer.
- **I-6 — no literals from the payload domain.** `dayCount`, `windowStartISO` and the entity table come from `SimInput` (DEC-008). `1826`, `2038`, `2021-08-01` and every contribution figure are forbidden in this directory, in code and in tests except as fixture data.
- **I-7 — no date arithmetic in `lib/viz/sim/`.** `windowStartISO` is carried opaquely. Day-index to calendar-date conversion belongs to `lib/viz/driver.ts` (KW-024), because `Date` construction is lint-banned here.

### What consumers get, and when

| Consumer | Imports | Contract note |
|---|---|---|
| KW-021 `lib/viz/sim/step.ts` | `SimState`, `SPEEDS`, `FIXED_DT`, `MAX_STEPS`, `advanceCursor`, `nextRng`, `rngValue` | `step` mutates `cursorDay`, calls `advanceCursor(state, Math.floor(state.cursorDay))`, and advances `rngState` in place. It must not re-derive the live set. |
| KW-021 `lib/viz/sim/layout.ts` | `SimState`, `px`/`py`/`pr` | `packOnce` writes `px/py/pr` exactly once over the union of all entities ever seen; the arrays are already allocated by `createSimState`. |
| KW-022 `lib/viz/render/**` | `SimState`, `liveIdsAscending`, `repoPhase`, `randomHash`, `PHASE_*` | Render is a pure function of `(state, ctx)`. It must never call `nextRng`/`rngValue`; jitter uses `randomHash(entityId, tick)`. |
| KW-024 `lib/viz/driver.ts` | everything, plus `digestSimState` | Owns the rAF accumulator, the bundle→`SimInput` adapter, `?seed=` parsing, and day→ISO formatting. Widens `SimStateDigest` into `VizFrameInfo`. |

## Refreshable implementation notes

Re-verify against `e664d73a195facd64db58ba10952170ff01b4772` at pickup. Nothing below changes scope.

### Files to create

| Path | Exports |
|---|---|
| `lib/viz/sim/types.ts` | the constants and interfaces in the sketch above. Types and constants only — no runtime logic. |
| `lib/viz/sim/rng.ts` | `seedRng`, `nextRng`, `rngValue`, `randomHash` |
| `lib/viz/sim/cursor.ts` | `seedCursor`, `advanceCursor`, `seekCursor`, `repoPhase`, `isLive`, `liveIdsAscending` |
| `lib/viz/sim/state.ts` | `createSimState`, `resetSimState`, `digestSimState` |
| `test/viz/rng.test.ts` | RNG tests |
| `test/viz/cursor.test.ts` | cursor, state, structuredClone, path-independence and DOM-freedom tests |

### File to modify

`eslint.config.mjs` — append exactly one override object to the exported array. Do not touch any other block, do not add `ignores`, do not relax an existing rule. This exact block was executed against `eslint@9.39.5` this session:

```js
{
  files: ['lib/viz/sim/**/*.{ts,mts,js,mjs}'],
  rules: {
    'no-restricted-properties': ['error',
      { object: 'Math', property: 'random', message: 'lib/viz/sim is deterministic: use nextRng/rngValue from lib/viz/sim/rng.ts.' },
      { object: 'Date', property: 'now', message: 'lib/viz/sim is deterministic: time is SimState.tick, not the wall clock.' },
      { object: 'performance', property: 'now', message: 'lib/viz/sim is deterministic: time is SimState.tick, not the wall clock.' },
    ],
    'no-restricted-globals': ['error', {
      checkGlobalObject: true,
      globals: [
        { name: 'requestAnimationFrame', message: 'rAF belongs to lib/viz/driver.ts.' },
        { name: 'cancelAnimationFrame', message: 'rAF belongs to lib/viz/driver.ts.' },
        { name: 'setTimeout', message: 'Timers belong to lib/viz/driver.ts.' },
        { name: 'setInterval', message: 'Timers belong to lib/viz/driver.ts.' },
        { name: 'window', message: 'lib/viz/sim must import cleanly in plain Node: no DOM.' },
        { name: 'document', message: 'lib/viz/sim must import cleanly in plain Node: no DOM.' },
      ],
    }],
    'no-restricted-syntax': ['error',
      { selector: "NewExpression[callee.name='Date']", message: 'lib/viz/sim must not construct Date; day-index to ISO conversion belongs to lib/viz/driver.ts.' },
    ],
  },
}
```

Three things about this block that are easy to get wrong:

1. **`checkGlobalObject` only exists in the object form of `no-restricted-globals`.** The rule's schema (`eslint@9.39.5`, `lib/rules/no-restricted-globals.js:66-92`) accepts either a flat array of globals *or* a single object with a required `globals` key plus optional `checkGlobalObject` and `globalObjects`. Writing `['error', {checkGlobalObject: true}, 'requestAnimationFrame']` is a schema error. Verified.
2. **The default global-object set is `{globalThis, self, window}`** (`lib/rules/no-restricted-globals.js:25`), so no `globalObjects` option is needed. Verified: `globalThis.requestAnimationFrame(...)` reports under this config; without `checkGlobalObject: true` it does not.
3. **`Date` is banned by AST selector, not as a global.** Banning the identifier `Date` in `no-restricted-globals` would also fire on TypeScript type positions. `NewExpression[callee.name='Date']` catches `new Date(...)` and nothing else.

Executed proof, this session, on `eslint@9.39.5` with the block above:

```
lib/viz/sim/violation.js
  2:13  error  'Math.random' is restricted from being used. …          no-restricted-properties
  3:13  error  'Date.now' is restricted from being used. …             no-restricted-properties
  4:13  error  'performance.now' is restricted from being used. …      no-restricted-properties
  5:3   error  Unexpected use of 'window'. …                           no-restricted-globals
  6:3   error  Unexpected use of 'setTimeout'. …                       no-restricted-globals
  7:13  error  lib/viz/sim must not construct Date; …                  no-restricted-syntax

✖ 6 problems (6 errors, 0 warnings)
```

The clean module in the same directory reported zero problems. Note `window.requestAnimationFrame(...)` reports **once**, as `window`, because `window` is itself restricted — expect 6 errors from the 6-violation fixture, not 7.

### `createSimState` — the dwell tail and `byDeath`

```ts
export function createSimState(input: SimInput, seed: number): SimState {
  const n = input.entityCount;
  const lastDay = input.dayCount - 1;

  const death = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const raw = input.lastTouchDay[i];
    if (raw === DAY_ALIVE) { death[i] = DAY_ALIVE; continue; }
    const tail = input.kind[i] === ENTITY_REPO
      ? DWELL_TAIL_DAYS.repo
      : DWELL_TAIL_DAYS.file;
    death[i] = Math.min(lastDay, raw + tail);
  }

  // byDeath: FILE ids only, death DESC, tie-broken id ASC so the order is
  // total and reproducible. Repos are classified by repoPhase, not pointers.
  const files: number[] = [];
  for (let i = 0; i < n; i++) if (input.kind[i] === ENTITY_FILE) files.push(i);
  files.sort((a, b) => (death[b] - death[a]) || (a - b));
  // …allocate every remaining typed array, then seedCursor(state, lastDay).
}
```

The dwell tail comes from the prototype's `d >= r.from - 20 && d <= r.to + 90` (`drawGraph`, line 716) generalised into named constants: 90 days for repos, 30 for files. The tail must be **clamped to `dayCount - 1`** so a still-active repo never gets a `death` beyond the window.

### Worked fixture

Put this in `test/viz/fixtures.ts` or inline. It is small enough to reason about by hand and exercises every phase, including a repo that dies mid-window and a file that outlives the window.

```ts
// 6 days (day 0 = 2026-01-01 … day 5 = 2026-01-06), 2 repos, 3 files.
// Tails are set to 0 for this fixture by using lastTouchDay values that are
// already clamped; assert the tail separately with a second fixture.
export const TINY: SimInput = {
  dayCount: 6,
  windowStartISO: '2026-01-01',
  repoCount: 2,
  entityCount: 5,
  kind:         Uint8Array.from([0, 0, 1, 1, 1]),
  repoOf:       Int32Array.from([-1, -1, 0, 0, 1]),
  birthDay:     Int32Array.from([0, 3, 0, 2, 3]),
  lastTouchDay: Int32Array.from([1, DAY_ALIVE, 1, DAY_ALIVE, 4]),
};

// With DWELL_TAIL_DAYS clamped to dayCount-1 = 5:
//   death = [5, DAY_ALIVE, 5, DAY_ALIVE, 5]   (every tail saturates in a
//   6-day window, which is itself worth asserting)
//
// Expected repoPhase over the reverse walk:
//   day 5 -> repo0 LIVE (death clamped), repo1 LIVE
//   day 2 -> repo0 LIVE,                 repo1 ABSENT (birth 3 > 2)
//   day 0 -> repo0 LIVE,                 repo1 ABSENT
//
// Expected liveIdsAscending over files (ids 2,3,4):
//   day 5 -> [2, 3, 4]
//   day 2 -> [2, 3]        (file 4 birth 3 > 2)
//   day 1 -> [2]           (file 3 birth 2 > 1)
//   day 0 -> [2]
```

A second fixture must use a window long enough that the tail does **not** saturate, so `death[i] === lastTouchDay[i] + 30` is actually asserted for a file and `+ 90` for a repo.

### Scale and budget, re-measured this session

The corrected corpus is 13,453 unique paths across 51 repos (C-27). A synthetic corpus at that exact scale over 1,826 days, driven through a full reverse pass with the algorithm above:

| Measurement | Value |
|---|---|
| Full 1,826-day reverse pass | 3.70 ms total = **2.02 µs/simulated day** |
| Single `seekCursor` (`O(n)` rescan, n = 13,453) | **0.088 ms** |
| `liveIdsAscending` at ~1,035 live entities | **0.0183 ms/call** = 1.1 ms per second at 60 fps |
| Resident typed-array state | **~644 KB** (matches the C9 correction's 633 KB) |
| Path-independence mismatches (`seekCursor` vs `advanceCursor` walk, 11 sampled days) | **0** |

At the fastest speed (32 days/s) the cursor costs 65 µs/s, or 0.0065 % of a 60 fps budget. Reverse playback is free; the enumeration pass costs more than the cursor does, and it still costs 0.11 % of budget. **Do not build checkpoints or bitsets.**

Peak live-set size is deliberately **not** pinned here: the viz-runtime track's "869" is a property of an undisclosed synthetic lifespan generator, and its own verifier got 612 and 1,077 from equally arbitrary generators. Size `live`, `slot` and `birthHeap` at `entityCount` and let the real data speak.

### Running the tests before KW-011 lands

KW-008 does **not** depend on KW-011, so `vitest.config.mts` will not exist yet. `vitest@4.1.10` is already installed by KW-001 (DEC-003) and its defaults are sufficient: the default `include` glob is `['**/*.{test,spec}.?(c|m)[jt]s?(x)']` and the default `environment` is `node`, which is exactly the environment this ticket needs. Run:

```bash
npx vitest run test/viz/cursor.test.ts test/viz/rng.test.ts
```

Do not add a config file to make this work, and do not add `--environment jsdom`. If KW-011 has already merged, `npm run test:unit` runs the same files under the `node` project.

### Version pins

`eslint@9.39.5`, `typescript@5.9.3`, `vitest@4.1.10` — all installed by KW-001, all confirmed to exist on the registry this session (`npm view <pkg>@<version> version`). Do not install anything; `package.json` and `package-lock.json` are frozen (DEC-003).

## Acceptance and verification

### Agent gate

- `npx tsc --noEmit` exits 0.
- `npx eslint lib/viz/sim test/viz` exits 0.
- `npx vitest run test/viz/cursor.test.ts test/viz/rng.test.ts` exits 0 with every test green.
- A Node-environment test imports all four `lib/viz/sim/*.ts` modules and asserts `typeof globalThis.document === "undefined"` and `typeof globalThis.window === "undefined"`, proving `lib/viz/sim/**` imports cleanly in plain Node with no DOM.
- A Node-only smoke test drives 10,000 cursor iterations over a fixture at the corrected 13,453-entity scale without throwing, and `digestSimState` after the walk equals `digestSimState` after `seekCursor` to the same day.
- `structuredClone(state)` round-trips: it does not throw `DataCloneError`, and `digestSimState(structuredClone(state))` deep-equals `digestSimState(state)`.
- Two independent `createSimState(fixture, 12345)` runs driven through the same 10,000 iterations produce identical `rngState`, `rngDraws`, `nLive` and `liveHash` — the same seed produces bit-identical output twice.
- `nextRng` composed with `rngValue` reproduces a canonical closure-based `mulberry32(12345)` for 1,000 successive draws.
- A deliberate-violation fixture placed under `lib/viz/sim/` and using `Math.random()`, `Date.now()`, `performance.now()`, `window.requestAnimationFrame(...)`, `setTimeout(...)` and `new Date(0)` produces exactly 6 ESLint errors; the fixture is deleted before commit.
- `advanceCursor(state, day)` throws `RangeError` when `day > state.cursorDayInt`, and `seekCursor` handles that case correctly in both directions.

### At-merge gate

- `ci-ok` is green on the exact PR head commit.
- The PR diff touches no file outside this ticket's write surface; in particular `package.json` and `package-lock.json` are unmodified (DEC-003).
- The `eslint.config.mjs` diff is purely additive: exactly one new override object scoped to `lib/viz/sim/**`, with no existing rule relaxed and no `ignores` entry added.
- No file under `lib/viz/sim/` imports from `lib/bundle/**`, `lib/viz/render/**`, `react`, `next` or any DOM type library.
- No numeric literal from the data domain (`1826`, `2038`, `7354`, `13453`, contribution totals) appears in `lib/viz/sim/**` outside test fixtures (DEC-008).

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure modes and required behaviour**

- **Non-monotone cursor call.** `advanceCursor(state, day)` with `day > state.cursorDayInt` throws `RangeError`. Silently rebuilding would hide a caller bug in KW-021 and produce a live set whose cost is `O(n)` per frame instead of `O(1)` amortized.
- **Empty or degenerate input.** `entityCount === 0` must produce a valid state with `nLive === 0` and must not throw. `dayCount <= 0` throws `RangeError` — an empty window is a pipeline defect, not a render state.
- **Malformed `SimInput`.** `birthDay[i] > lastTouchDay[i]` (and `lastTouchDay[i] !== DAY_ALIVE`) throws with the offending entity id in the message. This is the shape a bad bundle adapter produces and it must fail loudly at `createSimState`, not silently render an empty screen.
- **Seed drift.** `rngDraws` exists specifically so a test can assert the RNG advanced by exactly the expected number of draws. If a render module ever calls `rngValue`, `rngDraws` diverges between a replay and a fresh run and the assertion catches it.
- **`live` order assumed to be stable.** The single most likely downstream bug. Invariant I-3 and `liveIdsAscending` exist to prevent it; the tests assert digest equality across two different paths to the same day.

**Security.** No network, no filesystem, no secrets, no user-supplied strings reach this code. `seedRng` coerces with `>>> 0` and maps non-finite input to 0, so a hostile `?seed=` value parsed downstream by KW-024 cannot produce `NaN` state. No `eval`, no dynamic `import`, no prototype mutation.

**Migration.** None. Every file except `eslint.config.mjs` is new, and that edit is append-only. The prototype at `docs/design/kevinweaver.dev.dc.html` is a read-only port source and is not modified. No data migration, no persisted state, no schema version.

**Accessibility.** No DOM, so no direct accessibility surface. Two obligations to downstream tickets are discharged here rather than deferred: (a) `repoPhase` and `liveIdsAscending` are the single source of truth from which KW-029's visually-hidden `<table>` text alternative is generated, so the accessible text and the canvas can never disagree; (b) the `prefers-reduced-motion` static fallback frame is `seekCursor` to a fixed day plus one render, which is possible only because visibility is a pure function of the cursor (invariant I-1). Do not add motion, timing or easing here — that is KW-021's `step`.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/research/2026-07-31-viz-runtime.md, docs/research/2026-07-31-ci-testing.md, docs/research/2026-07-31-decomposition-synthesis.md, package.json, tsconfig.json
- Writes: lib/viz/sim/types.ts, lib/viz/sim/cursor.ts, lib/viz/sim/rng.ts, lib/viz/sim/state.ts, test/viz/cursor.test.ts, test/viz/rng.test.ts, eslint.config.mjs
- Contracts: lib/viz/sim/types.ts#SimState, lib/viz/sim/types.ts#SimInput, lib/viz/sim/types.ts#SimStateDigest, lib/viz/sim/rng.ts#nextRng, lib/viz/sim/cursor.ts#advanceCursor, lib/viz/sim/cursor.ts#liveIdsAscending
- Safety: eslint.config.mjs#viz-sim-determinism-overrides

## Sibling boundaries and open gates

**Same wave (phase 2, all depending only on KW-001).** Every wave-2 ticket owns a disjoint set of files (DEC-005); there are no `serializes_with` edges anywhere in this Build Order.

| Ticket | Owns | Boundary with KW-008 |
|---|---|---|
| KW-007 | `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts`, `test/viz/ramp-contrast.test.ts` | shares the `test/viz/` **directory** but no file. Do not create `test/viz/index.ts`, a shared helper barrel, or anything else in `test/viz/` beyond the two named test files — a shared file there is exactly the collision the partition exists to prevent. |
| KW-011 | `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts` | KW-008 must not create or edit `vitest.config.mts`, and must not depend on it. Run vitest with its defaults. |
| KW-012 | `lib/bundle/schema.ts`, `lib/bundle/codec.ts`, `lib/bundle/frontcode.ts` | KW-008 must not import from `lib/bundle/**`. `SimInput` is declared locally and deliberately. |
| KW-003, KW-004, KW-005, KW-006, KW-009, KW-010 | styles, fonts, app shell, content, pipeline halves | no shared file. |

**Downstream (wave 3+), blocked on this ticket.**

| Ticket | Owns | What it consumes from here |
|---|---|---|
| KW-021 | `lib/viz/sim/step.ts`, `lib/viz/sim/layout.ts`, `test/viz/step.test.ts` | `SimState`, `SPEEDS`, `FIXED_DT`, `MAX_STEPS`, `advanceCursor`, `nextRng`, `rngValue`. Same directory, disjoint files — do not create `step.ts` or `layout.ts` here, even as a stub. |
| KW-022 | `lib/viz/render/**` | `SimState`, `liveIdsAscending`, `repoPhase`, `randomHash`, `PHASE_*`. |
| KW-024 | `lib/viz/driver.ts`, `lib/viz/testHarness.ts` | everything, plus `digestSimState`, which it widens into `VizFrameInfo`. Owns rAF, `?seed=` parsing, the bundle→`SimInput` adapter and day→ISO formatting. |
| KW-029 | `components/viz/ContributionTable.tsx` | `repoPhase`/`liveIdsAscending` as the source of truth for the visually-hidden text alternative (DEC-011). |
| KW-031 | `e2e/canvas.spec.ts`, `e2e/__screenshots__/**` | the determinism guarantees asserted here are what make its baselines stable. |

**Open gates.** None block this ticket. `GATE-002` (`workflow` scope on the push credential) blocks KW-001, KW-023, KW-028 and KW-031 at push time but does not touch `lib/viz/sim/**` or `eslint.config.mjs`. `GATE-003` (SSO-authorized `CONTRIB_TOKEN`) affects the data half only; this ticket runs entirely on fixtures. Pick this ticket up as soon as KW-001 has merged.

**If KW-001 is unmerged when this is picked up.** Do not start. `eslint.config.mjs`, `tsconfig.json` and the installed `vitest`/`typescript`/`eslint` versions all come from KW-001, and writing this ticket against the repository's current `.eslintrc.js` + `eslint@7` + Next 10 toolchain would have to be redone from scratch. The dependency is hard, not advisory.
