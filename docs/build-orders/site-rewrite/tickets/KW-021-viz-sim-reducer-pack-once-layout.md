# KW-021 — Viz sim reducer + pack-once layout

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Two pure modules over an already-fixed state shape, but every decay constant in the prototype has to be re-derived into half-life form and the circle-pack layout busts its boot budget at the corrected corpus scale, so both the integrator and the packer need a measured answer rather than a transcription.

**Risk:** Medium — a frame-rate-dependent constant or a second `packSiblings` call is invisible on the developer's own display and only surfaces as flaky visual-regression baselines in KW-031, three waves later.

**Phase hint:** 3

**Depends on:** KW-008

**Serializes with:** none

**Requirements:** REQ-005, REQ-006

**Decisions:** DEC-003, DEC-005, DEC-010, DEC-016

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/viz/sim/step.ts` advances the visualization by exactly one fixed 1/120 s tick with no wall-clock input, so 10 seconds of playback produce a bit-identical state on a 60 Hz and a 120 Hz display; `lib/viz/sim/layout.ts` computes every circle position exactly once at load, in under the 15 ms boot budget at the real 13,453-path / 51-repo corpus scale, and never again for the life of the page.

## Context and evidence

The prototype at `docs/design/kevinweaver.dev.dc.html` (1,033 lines, committed at the researched commit) animates correctly on the machine it was written on and incorrectly everywhere else. Two independent defects, both re-measured this session.

**Defect 1 — every decay constant is per *rendered frame*, so the whole visualization runs exactly 2× fast on a 120 Hz display.** Eight sites, verified by `grep -n` against the researched commit:

| Prototype site | Line | Constant |
|---|---|---|
| beam life | 754 | `b.life -= 0.022` |
| file heat | 797 | `f.heat *= 0.955` |
| applekid-birth flash | 860 | `this.flash -= 0.012` |
| actor converge line | 851 | `this.converge -= 0.02` |
| repo alpha ease | 746 | `r.alpha += (… - r.alpha) * k` |
| repo x/y ease | 747–748 | `r.px += (r.gx - r.px) * (this.snap ? 1 : 0.045)` |
| actor ease | 829 | `a.x += (a.tx - a.x) * 0.09` |
| repo dormant dim | 718 | `r.hot += (0.34 - r.hot) * 0.02` |

Exactly one quantity is correctly dt-scaled: `this.day = Math.max(0, this.day - sp * dt)` (line 887). Note the repo-easing coefficient is **conditional on `this.snap`** — `const k = this.snap ? 1 : 0.045` at line 745, not a bare `0.045`; one research track quoted it as a literal and its verifier corrected that (C-30, citation-hygiene table). This ticket converts every one of those constants to **half-life form** driven by the 120 Hz fixed timestep from `lib/viz/sim/types.ts`.

**Defect 2 — the layout does not fit its budget at real scale.** **C-27** raised the corpus from the viz-runtime track's assumed 7,354 entities / ~20 repos to the measured **13,453 unique paths across 51 repos**, and GT-6 gives the per-repo shape that makes it bite: `aiur-team/aiur` alone is **7,342 unique paths** (54.6 % of the corpus) and `ethereum-optimism/actions` is **1,451**. The viz-runtime verifier (C2) measured `packSiblings` as roughly `O(n^1.6)` and warned that a single call at aiur's scale busts the `<15 ms` boot budget on its own. Re-measured this session on `d3-hierarchy@3.1.2`, Node v24.18.0, unit-radius circles:

```
packSiblings + packEnclose, min of 3 runs
  n=1451   3.226 ms      n=7342   18.256 ms
  n=2500   3.158 ms      n=13453  46.716 ms
packOnce over the measured 51-repo distribution (7342 / 1451 / 49 × 95), varied radii
  flat, one packSiblings per repo      19.187 ms   ← busts the 15 ms budget
  cohort-chunked at 512                 6.291 ms   ← fits, 2.4× headroom
```

So the synthesis is right that the rollup is **a precondition, not a contingency**. What ships here is the arithmetic half of it: a **cohort rollup** that packs each repo in deterministic chunks of `PACK_CHUNK_SIZE = 512` sorted by birth, then packs the chunk circles. See "Sibling boundaries and open gates" for why the *semantic* depth-2 directory rollup cannot be built in this ticket.

**DEC-010** is what makes any of this testable. The prototype accumulates (`f.seen = true` at line 464, `r.entered = true` at 465, never cleared, and `drawGraph` gates on `if (!f.seen) return;` at line 796 with the source comment at 714 saying so out loud), which means the on-screen set depends on playback history rather than on the cursor. DEC-010 replaces that with lifespan-interval visibility plus a dimmed ghost phase for repositories whose era has ended. KW-008 already shipped the cursor that implements it; this ticket is the only caller that drives the cursor during playback.

**DEC-016 / C-24a** put the RNG on `SimState` as a 32-bit integer field "advanced functionally inside `step`" — `step` is the function that sentence is about. `lib/viz/sim/step.ts` is the only file in the repository permitted to advance `rngState`.

**DEC-003** freezes `package.json` and `package-lock.json` after KW-001, which is what forecloses the two library questions this ticket would otherwise re-open. `d3-hierarchy` is in KW-001's pre-install list and `gsap` and `d3-force` are not. The research supports both exclusions, with one correction that matters for review:

- **GSAP is excluded on measured grounds.** `gsap@3.15.0` is 28,268 B gzip — larger than the entire rest of the viz runtime — ships **no `LICENSE` file** in its npm tarball, and its `license` field is an English sentence rather than an SPDX id, so SBOM tooling reports UNKNOWN. Independently re-verified by the viz-runtime verifier. The prototype uses no tween library at all.
- **`d3-force` is excluded on bundle size and cross-engine float reproducibility, *not* on determinism.** **C-25's sibling correction (C8)** refuted the determinism claim: `d3-force@3.0.0` contains zero `Math.random` calls, seeds from `lcg()` at `src/simulation.js:26`, and two 300-tick runs are bit-identical. Repeating "d3-force is nondeterministic" in a PR description is a factual error a reviewer will catch. The surviving argument is 9.25 KB gzip of source to solve a ring placement that `cos`/`sin` already solves exactly.
- Named fallback if the hand-rolled easing in this ticket proves insufficient: `@tweenjs/tween.js@25.0.0`, MIT, 7.0 KB gzip, whose `TWEEN.update(time)` API is explicit time-driving. **Adopting it is out of scope here** — it would require a `package.json` edit, which DEC-003 forbids; it would be a separate ticket.

Requirements this ticket carries:

- **REQ-005** — the visualization plays repository and file history in reverse with honest lifespan semantics: entities appear as the cursor walks back into their active era and disappear once it passes below their birth.
- **REQ-006** — the client runtime is deterministic and testable: the same `(input, seed, tick)` produces the same frame, so CI can assert semantics before pixels.

Plan context, all pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772` (browse at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/`):

| What | Where |
|---|---|
| Pack index, and the `KW-01..KW-32` → `KW-001..KW-032` zero-padding map | `docs/build-orders/site-rewrite/README.md` (pack sibling, same planning commit) |
| Wave and graph analysis, verified topological levels, critical path, write-surface partition | `docs/research/2026-07-31-decomposition-synthesis.md` §6 |
| Decision registry `D-01..D-17` (published as `DEC-001..DEC-017`) | same document, §3 |
| Human gates `HG-1..HG-7` (published as `GATE-001..GATE-007`) | same document, §4 |
| This ticket's implementation pointers | same document, §5, wave 3, entry "KW-21" |
| Fixed-timestep accumulator, state shape, pack-once argument, library exclusions | `docs/research/2026-07-31-viz-runtime.md` §1.4, §2.1–2.4, §10.3–10.6 |
| Corrections that override that doc's body: corpus scale (C1), boot-budget headroom (C2), `packSiblings` append stability (C3), the set-change tautology (C4), `d3-force` determinism (C8), memory (C9), line-citation drift | same document, "Verification corrections" |
| The producer contract this ticket consumes | `docs/build-orders/site-rewrite/tickets/KW-008-viz-contract-simstate-cursors-rng.md` |

## Scope

- Create `lib/viz/sim/step.ts`: the pure fixed-timestep reducer `step(state)`, the frame-driving accumulator `stepFrame(state, dtSeconds, accumulator)`, the closed-form `cursorDayAtTick(...)`, the idempotent `snapPresentation(state)`, and the exported decay-constant table.
- Convert all eight per-rendered-frame constants listed above to half-life form evaluated once at module load, so `step` contains no rate arithmetic and no `dt` argument.
- Drive the cursor: decrement `cursorDay` by `SPEEDS[speedIndex] * FIXED_DT`, call `advanceCursor` only when the integer day actually changes, and handle the day-0 wrap with `seekCursor` plus `snapPresentation`.
- Emit beams and heat for entities that enter the live set, derived from the `pDeath` pointer delta rather than from a callback the cursor does not provide.
- Create `lib/viz/sim/layout.ts`: `packOnce(state)` writing `px`/`py`/`pr` for every file entity and `repoAngle`/`repoR`/`repoX`/`repoY` for every repo, exactly once, over the union of everything that ever existed.
- Ship the cohort rollup: any repo with more than `PACK_CHUNK_SIZE = 512` file entities is packed in deterministic birth-ordered chunks whose enclosing circles are then packed, keeping the whole-corpus boot pack inside the 15 ms budget.
- Create `test/viz/step.test.ts` proving frame-rate independence, single-pack, replay identity, `structuredClone` survival, the `MAX_STEPS` clamp, and DOM-freedom.
- Add `lib/viz/sim/d3-hierarchy.d.ts` **only if** `@types/d3-hierarchy` is not installed at pickup (see "Refreshable implementation notes").

## Non-goals

- No edits to `lib/viz/sim/types.ts`, `cursor.ts`, `rng.ts` or `state.ts` — KW-008 owns all four, including every constant and every field of `SimState`. If a field seems to be missing, it is missing on purpose; say so in the PR rather than adding it.
- No `requestAnimationFrame`, no `performance.now`, no `window.__viz` harness, no `?seed=` parsing, no day-index to calendar-date conversion — KW-024 owns `lib/viz/driver.ts` and `lib/viz/testHarness.ts`.
- No rendering, no `ctx`, no canvas, no colour, no projection from unit space to pixels, no DPR handling — KW-022 owns `lib/viz/render/**` and KW-007 owns `lib/viz/tokens/**`.
- No React, no component, no `ResizeObserver`, no transport controls — KW-025 owns `app/regions/Instrument.tsx` and KW-026 owns `app/regions/TransportBar.tsx`.
- No `package.json` or `package-lock.json` edits, and therefore no new dependency: no `gsap`, no `d3-force`, no `@tweenjs/tween.js`, no `@types/*` install (DEC-003).
- No wire format, no bundle decoding, no `lib/bundle/**` import — the adapter from decoded payload to `SimInput` is KW-024's.
- No checkpoints, no bitsets, no seek-acceleration structures. `seekCursor` is an `O(n)` rescan measured at 0.088 ms at the corrected scale.
- No `flash`, `converge` or ribbon-window (`winStart`) effects: `SimState` has no field for any of them and adding one is KW-008's write surface.
- No `vitest.config.mts` and no coverage thresholds — KW-011 owns Vitest scaffolding. Run the tests directly, as described below.

## Existing owner and reuse target

There is no existing owner. `lib/` and `test/` do not exist at `e664d73a195facd64db58ba10952170ff01b4772`; `git ls-tree` at that commit shows only `.aiur/`, `components/`, `docs/`, `pages/`, `public/`, `styles/`, `README.md`, `.eslintrc.js`, `.gitignore`, `package.json`, `package-lock.json`, `postcss.config.js`, `tailwind.config.js` and `yarn.lock`. Every file in this ticket's write surface is new.

Named upstream artifacts this ticket consumes:

| Artifact | Created by | What KW-021 uses it for |
|---|---|---|
| `lib/viz/sim/types.ts` | KW-008 | `SimState`, `SimInput`, `SPEEDS`, `FIXED_DT`, `MAX_STEPS`, `MAX_BEAMS`, `DAY_ALIVE`, `ENTITY_REPO`, `ENTITY_FILE`, `PHASE_*`, `RepoPhase` |
| `lib/viz/sim/cursor.ts` | KW-008 | `advanceCursor`, `seekCursor`, `repoPhase`, `isLive`, `liveIdsAscending` |
| `lib/viz/sim/rng.ts` | KW-008 | `nextRng`, `rngValue` |
| `lib/viz/sim/state.ts` | KW-008 | `createSimState`, `digestSimState` — used by the tests, not by `step` |
| `eslint.config.mjs` + its `lib/viz/sim/**` determinism override | KW-001 creates, KW-008 appends the override | this ticket is *governed* by that block and must not modify it |
| `d3-hierarchy` in `dependencies` | KW-001 (DEC-003 pre-installs it by name) | `packSiblings`, `packEnclose` in `layout.ts` |
| `vitest@4.1.10`, `typescript@5.9.3`, `eslint@9.39.5` | KW-001 | the agent-gate commands |

The **port source** is the prototype at `docs/design/kevinweaver.dev.dc.html`, verified present at the researched commit. Cite methods before line numbers (C-30 — six of the viz-runtime track's line citations were off by 2–6; every line below was re-derived this session).

| Prototype site | Lines | What to take, what to reject |
|---|---|---|
| `constructor` | 195–221 | `this.speeds = [4, 8, 12, 20, 32]` (209) — already exported as `SPEEDS` by KW-008; import it, do not re-declare |
| `drawGraph` repo ring | 715–744 | take the angle formula and the `0.42` / `0.38` / `0.46` ellipse constants; **reject** `g.measureText(r.s).width` (722) and everything derived from `W`/`H` — sim has no canvas and no font metrics |
| `drawGraph` easing | 745–748 | take the coefficients, reject the per-frame application; note `k` is `this.snap ? 1 : 0.045` |
| `drawGraph` beams | 752–770 | take `life` starting at 1 and the ring-buffer idea; reject the `Array.filter` per frame — `SimState` has a fixed 256-slot buffer |
| `drawGraph` heat | 795–800 | take `f.heat = 1` on touch and the decay; reject `if (!f.seen) return;` (796) — that is the accumulation bug DEC-010 deletes |
| `drawActor` | 827–846 | take `0.09` easing; the target-setting moves into `step` |
| `loop` | 872–902 | take `this.day -= sp * dt` (887) and the day-0 wrap (896); **reject** `const dt = Math.min(0.05, …)` (874) — the clamp belongs in `stepFrame` at 0.25 s, and reject `this.last = ts` — no wall clock in `sim/` |
| `loop` near-birth slowdown | 885 | **reject deliberately** — see the note in "Contract and invariants" |
| `emitDay` | 904–919 | take `f.heat = 1`, `beams.push({… life: 1})` and the actor-target assignment; **reject** `Math.random() < 0.25` (915), the log lines, and `e.a`/`e.k` — actor and event-kind attribution is not in `SimInput` |
| `emitLive` | 948–960 | reject entirely — two `Math.random()` calls at 952–953; DEC-014 deletes the synthesiser |

## Contract and invariants

This ticket is a **consumer** of KW-008 and a **producer** for KW-022 and KW-024.

### What KW-021 consumes from KW-008, quoted verbatim

```ts
// lib/viz/sim/types.ts — KW-008. Do not redeclare any of these.
export const DAY_ALIVE = 0x7fffffff;
export const SPEEDS = [4, 8, 12, 20, 32] as const;
export const FIXED_DT = 1 / 120;
export const MAX_STEPS = 8;
export const MAX_BEAMS = 256;
export const ENTITY_REPO = 0;
export const ENTITY_FILE = 1;
export const PHASE_ABSENT = 0;
export const PHASE_LIVE = 1;
export const PHASE_GHOST = 2;

// lib/viz/sim/cursor.ts — KW-008.
export function advanceCursor(state: SimState, day: number): void;   // day <= cursorDayInt, else RangeError
export function seekCursor(state: SimState, day: number): void;      // O(entityCount), any direction
export function repoPhase(state: SimState, repoId: number, day: number): RepoPhase;
export function isLive(state: SimState, id: number): boolean;
export function liveIdsAscending(state: SimState, out: Int32Array): number;

// lib/viz/sim/rng.ts — KW-008. The mandated call-site pattern, zero allocation:
//   state.rngState = nextRng(state.rngState);
//   const r = rngValue(state.rngState);
//   state.rngDraws++;
export function nextRng(rngState: number): number;
export function rngValue(rngState: number): number;
```

The `SimState` fields this ticket writes, and nothing else: `tick`, `cursorDay`, `cursorDayInt` (only via the cursor functions), `rngState`, `rngDraws`, `alpha`, `heat`, `px`, `py`, `pr`, `repoAngle`, `repoX`, `repoY`, `repoR`, `repoAlpha`, `actorX`, `actorY`, `actorTX`, `actorTY`, `beamEnt`, `beamActor`, `beamKind`, `beamLife`, `beamHead`. `playing` and `speedIndex` are read here and written by KW-024/KW-026.

### The producer sketch — `lib/viz/sim/step.ts`

Consumers quote this verbatim.

```ts
import type { SimState } from './types';

/**
 * Half-life form of every decay in the prototype. Each half-life is derived
 * from the prototype's per-frame coefficient authored against a 60 Hz
 * display: T_half = ln(0.5) / (60 * ln(kFrame)) seconds.
 * Verified: keepPerStep ** 120 === kFrame ** 60 to 6 dp for all four.
 */
export const DECAY = {
  /** f.heat *= 0.955 (line 797) -> 0.955 ** 60 = 0.063125 per second. */
  heatHalfLifeSeconds: 0.250901,
  /** r.alpha/r.px/r.py ease, k = snap ? 1 : 0.045 (lines 745-748). Same family. */
  repoEaseHalfLifeSeconds: 0.250901,
  /** r.hot += (0.34 - r.hot) * 0.02 (line 718): the slow dormant dim-down. */
  repoGhostHalfLifeSeconds: 0.571827,
  /** a.x += (a.tx - a.x) * 0.09 (line 829). */
  actorEaseHalfLifeSeconds: 0.122494,
  /** File appear/disappear tween. New (DEC-010); deliberately reuses the
   *  repo-ease family so this module introduces no unanchored constant. */
  fileAlphaHalfLifeSeconds: 0.250901,
  /** b.life -= 0.022 per frame (line 754) -> 1.32 per second, 0.7576 s fade. */
  beamLifePerSecond: 1.32,
} as const;

/** Ghost repositories hold this alpha (prototype's 0.34 dormant target, line 718). */
export const REPO_GHOST_ALPHA = 0.34;
/** At most this many beams are emitted for one crossed day. Ring is MAX_BEAMS. */
export const MAX_BEAMS_PER_DAY = 12;
/** Actor idle-wander box, unit space, centred on the ring centre (0.5, 0.46). */
export const ACTOR_WANDER = { x: 0.6, y: 0.5 } as const;

/**
 * Advance the simulation by exactly one fixed timestep.
 *
 * Takes NO wall-clock argument: everything is derived from FIXED_DT, so a
 * frame is fully described by (SimInput, seed, tick). Mutates `state` in
 * place and allocates nothing. Safe to call when `playing` is false — the
 * cursor freezes, presentation channels continue to settle, which is what
 * makes the reduced-motion static frame reachable.
 */
export function step(state: SimState): void;

/**
 * Drive `step` from a real frame delta. This is the whole accumulator; the
 * rAF loop in KW-024's driver.ts supplies `dtSeconds` and stores the return
 * value. Pure with respect to wall-clock: it never reads a clock itself.
 *
 * dtSeconds is clamped to 0.25 s (a backgrounded tab must not fast-forward).
 * At most MAX_STEPS steps run per call; when that clamp fires the leftover
 * accumulator is dropped to 0 rather than accruing debt.
 *
 * @returns the new accumulator, in seconds.
 */
export function stepFrame(state: SimState, dtSeconds: number, accumulator: number): number;

/**
 * Closed form of the cursor. Holds while speedIndex is unchanged and no
 * day-0 wrap has occurred; KW-024's O(n) seekTick is built on it.
 * cursorDay(t) = max(0, startDay - SPEEDS[speedIndex] * FIXED_DT * ticks)
 */
export function cursorDayAtTick(startDay: number, speedIndex: number, ticks: number): number;

/**
 * Put every presentation channel at its steady-state value for the current
 * cursorDayInt: alpha at its live/ghost/absent target, heat at 0, all beams
 * dead, actors at their targets, repos at their ring slots. Idempotent and
 * path-independent — two calls produce the same state, and the state does
 * not depend on how the cursor got there. KW-024 calls this after every
 * seekCursor so seekTick(t) is idempotent, and this module calls it on wrap.
 */
export function snapPresentation(state: SimState): void;
```

### The producer sketch — `lib/viz/sim/layout.ts`

```ts
import type { SimState } from './types';

/** Repos above this file count are packed in cohort chunks. Measured: a flat
 *  pack of the real 51-repo distribution is 19.187 ms and busts the 15 ms
 *  boot budget; at 512 it is 6.291 ms. */
export const PACK_CHUNK_SIZE = 512;
/** Unit-space ellipse the repo ring sits on. From the prototype's caps at
 *  lines 728-729 and its vertical centre at 735. */
export const RING = { cx: 0.5, cy: 0.46, rx: 0.42, ry: 0.38, phase: 0.55 } as const;
/** Repos start this far out and ease in (prototype lines 733-734: rx * 1.5). */
export const RING_ENTRY_SCALE = 1.5;

/**
 * Compute every position exactly once, over the union of every entity that
 * ever existed. Writes px/py/pr for file entities in their repo's unit disc
 * (centre 0,0 / radius 1), and repoAngle/repoR/repoX/repoY/repoAlpha for
 * repo entities. Idempotent: a second call on the same state object returns
 * without calling into d3-hierarchy again.
 *
 * Visibility is NEVER a re-layout. It is the alpha/scale channel that
 * `step` tweens on a fixed position.
 */
export function packOnce(state: SimState): void;

/** True once packOnce has run for this state object. */
export function isPacked(state: SimState): boolean;
```

### What consumers get

| Consumer | Reads | Contract note |
|---|---|---|
| KW-022 `lib/viz/render/graph.ts` | `px`, `py`, `pr`, `repoX`, `repoY`, `repoR`, `repoAlpha`, `alpha`, `heat`, `beam*`, `actor*` | all coordinates are **unit space**: file `px`/`py` in `[-1, 1]` relative to the repo disc, repo `repoX`/`repoY` in `[0, 1]` of the canvas box. Render owns the mapping to pixels, the margins, and the DPR clamp. Render must never call `nextRng`/`rngValue`; jitter is `randomHash(entityId, tick)` from KW-008. |
| KW-024 `lib/viz/driver.ts` | `step`, `stepFrame`, `cursorDayAtTick`, `snapPresentation`, `packOnce` | the rAF loop is `acc = stepFrame(state, (now - prev) / 1000, acc)` and nothing else; `seekTick(t)` is `seekCursor(state, Math.floor(cursorDayAtTick(...)))` then `snapPresentation(state)` then `state.tick = t` — never a replay of `t` steps. `packOnce` runs once at boot and again only after `resetSimState`. |
| KW-031 visual regression | — | depends transitively on I-1 below holding at every tick. |

### Invariants

- **I-1 — a frame is `(SimInput, seed, tick)`, exactly.** `step` reads no clock and takes no `dt`. Two states driven to the same `tick` from the same input and seed, by any sequence of `stepFrame` calls with any frame deltas that produce that tick count, are equal under `digestSimState`. **Verified this session** at the corrected 13,504-entity scale: 600 frames of `dt = 1/60` and 1,200 frames of `dt = 1/120` both reach `tick = 1200` with byte-equal `cursorDay`, `rngState`, `rngDraws`, `nLive`, summed `alpha`, summed `heat` and `beamHead`, and the residual accumulator is exactly `0` in both cases. The exactness is not luck: `fl(1/60) === 2 * fl(1/120)` and Sterbenz subtraction makes the two decrements exact.
- **I-2 — at most one day is crossed per step.** The fastest speed is 32 days/s and the step is 1/120 s, so `32 * FIXED_DT = 0.2667` days per step. `step` therefore calls `advanceCursor` at most once and never loops over days. A future speed above 120 days/s would break this; assert it in the test.
- **I-3 — `advanceCursor` is called only when the integer day decreases.** `advanceCursor` throws `RangeError` for a forward day (KW-008). The guard is `const day = Math.floor(state.cursorDay); if (day < state.cursorDayInt) …`. The day-0 wrap is the one forward move and it goes through `seekCursor`.
- **I-4 — the entered set is recovered from the `pDeath` pointer delta.** KW-008's cursor has no delta callback, and it does not need one: the ENTER loop consumes `byDeath[pDeath …)` in order, so the entities that entered on this crossing are exactly `byDeath[p0 … state.pDeath)` filtered by `slot[e] !== -1`. Snapshot `p0` before the call. Do not diff `live`, do not scan `slot`, and do not add a field to `SimState`.
- **I-5 — the RNG advances in exactly one place.** Actor idle-wander retargeting, two draws per retarget, and nowhere else. `rngDraws` is therefore a meaningful assertion surface: if it moves for any other reason, a determinism leak has been introduced. Beam curvature, dither and any other visual noise are render's problem and use `randomHash`.
- **I-6 — the RNG never invents data.** Actor attribution and event kind are *facts about commits*. `SimInput` carries neither, so every beam is emitted with `beamActor = 0` and `beamKind = 0` and the second actor's beams do not exist yet. Deriving them from `rngValue` would fabricate exactly the kind of claim DEC-014 deletes elsewhere in this plan. See "Sibling boundaries and open gates".
- **I-7 — layout runs once, and visibility is never a re-layout.** `packOnce` is idempotent; `step` never touches `px`/`py`/`pr`/`repoAngle`/`repoR`. The reverse pass produces roughly 15 set-changes per simulated day at the corrected scale, so a re-pack per set-change is not merely expensive, it makes circles move for reasons unrelated to the data.
- **I-8 — pack order is total and stable.** Files are packed in `birth ASC, id ASC` order; repos are ranked `death DESC, id ASC`, matching `byDeath`'s tie-break. `packSiblings` is a greedy front-chain over the input array, so this order is what makes positions reproducible. **Verified this session:** two packs of identical input are bit-identical, and appending one circle to a 512-circle pack moves 0 of the existing 512 by more than 0 px (max drift `0.000000`) — the C3 correction, reproduced.
- **I-9 — no allocation after boot.** `packOnce` allocates its scratch arrays; `step`, `stepFrame`, `cursorDayAtTick` and `snapPresentation` allocate nothing. No closures per frame, no object literals, no `Array.filter` (the prototype's `this.beams.filter` at line 752 is exactly what the fixed ring buffer replaces).
- **I-10 — the near-birth slowdown is deliberately dropped.** The prototype's `if (Math.abs(this.day - this.birthIdx) < 6) sp = Math.min(sp, 2.5);` (line 885) makes `cursorDay` a non-invertible function of `tick`, which would force KW-024's `seekTick` to replay `t` steps instead of the `O(n)` rescan the whole test strategy is built on. If the slow-down is wanted back it must arrive as a speed-index change driven by the transport, not as hidden state inside the integrator. Record this in the PR description.

## Refreshable implementation notes

Re-verify against `e664d73a195facd64db58ba10952170ff01b4772` at pickup. Nothing below changes scope.

### Files to create

| Path | Exports |
|---|---|
| `lib/viz/sim/step.ts` | `DECAY`, `REPO_GHOST_ALPHA`, `MAX_BEAMS_PER_DAY`, `ACTOR_WANDER`, `step`, `stepFrame`, `cursorDayAtTick`, `snapPresentation` |
| `lib/viz/sim/layout.ts` | `PACK_CHUNK_SIZE`, `RING`, `RING_ENTRY_SCALE`, `packOnce`, `isPacked` |
| `test/viz/step.test.ts` | the tests below |
| `lib/viz/sim/d3-hierarchy.d.ts` | **conditional** — see the next subsection |

### First action at pickup: the `d3-hierarchy` typings check

`d3-hierarchy@3.1.2` ships **no TypeScript declarations**. Verified this session by unpacking the published tarball: the only non-`.js` file is `package/package.json`, and the manifest has no `types`/`typings` key (`"main": "src/index.js"`, `"module": "src/index.js"`, `"exports": {"umd": "./dist/d3-hierarchy.min.js", "default": "./src/index.js"}`, `"type": "module"`, `"sideEffects": false`, `"license": "ISC"`). Under `strict`, `import { packSiblings } from 'd3-hierarchy'` is `TS7016`.

Run this first:

```bash
ls node_modules/@types/d3-hierarchy/package.json 2>/dev/null && echo TYPED || echo UNTYPED
```

- **TYPED** — KW-001 installed `@types/d3-hierarchy` (3.1.7 is current on the registry). Import normally and **do not** create the shim.
- **UNTYPED** — create `lib/viz/sim/d3-hierarchy.d.ts` with exactly the surface used. It must contain no top-level `import`/`export`, or it becomes a module augmentation and fails:

```ts
declare module 'd3-hierarchy' {
  interface PackCircle {
    r: number;
    x?: number;
    y?: number;
  }
  /** Mutates each circle, assigning x/y. Returns the same array. */
  function packSiblings<T extends PackCircle>(circles: T[]): T[];
  /** Smallest circle enclosing the given circles. */
  function packEnclose<T extends PackCircle>(
    circles: T[],
  ): { x: number; y: number; r: number };
}
```

Do **not** install anything either way. `package.json` and `package-lock.json` are frozen (DEC-003) and a lockfile edit in this PR is an at-merge-gate failure.

### `lib/viz/sim/step.ts` — the worked reducer

Derive the per-step coefficients once at module load. Never inside `step`. `DECAY`, `REPO_GHOST_ALPHA`, `MAX_BEAMS_PER_DAY` and `ACTOR_WANDER` are declared in this same file, exactly as sketched in "Contract and invariants"; `RING` comes from `layout.ts`, which imports nothing from `step.ts`, so there is no cycle.

```ts
import {
  FIXED_DT, MAX_STEPS, MAX_BEAMS, SPEEDS,
  PHASE_LIVE, PHASE_GHOST,
} from './types';
import type { SimState } from './types';
import { advanceCursor, seekCursor, repoPhase } from './cursor';
import { nextRng, rngValue } from './rng';
import { RING } from './layout';

const keep = (halfLifeSeconds: number) => Math.pow(0.5, FIXED_DT / halfLifeSeconds);

const HEAT_KEEP        = keep(DECAY.heatHalfLifeSeconds);        // 0.977241014
const REPO_EASE_K      = 1 - keep(DECAY.repoEaseHalfLifeSeconds); // 0.022758986
const REPO_GHOST_K     = 1 - keep(DECAY.repoGhostHalfLifeSeconds);// 0.010050506
const ACTOR_EASE_K     = 1 - keep(DECAY.actorEaseHalfLifeSeconds);// 0.046060799
const FILE_ALPHA_K     = 1 - keep(DECAY.fileAlphaHalfLifeSeconds);// 0.022758986
const BEAM_DECAY_STEP  = DECAY.beamLifePerSecond * FIXED_DT;      // 0.011
const IDLE_EPSILON_SQ  = 1e-6;

export function step(state: SimState): void {
  state.tick++;

  if (state.playing) {
    const speed = SPEEDS[state.speedIndex];
    const next = state.cursorDay - speed * FIXED_DT;
    if (next <= 0) {                       // day-0 wrap, prototype line 896
      state.cursorDay = state.dayCount - 1;
      seekCursor(state, state.dayCount - 1);
      snapPresentation(state);
      return;                              // the wrap frame does no easing
    }
    state.cursorDay = next;
    const day = Math.floor(state.cursorDay);
    if (day < state.cursorDayInt) {        // I-2: at most one day per step
      const p0 = state.pDeath;
      advanceCursor(state, day);
      let emitted = 0;
      for (let p = p0; p < state.pDeath; p++) {
        const e = state.byDeath[p];
        if (state.slot[e] === -1) continue; // consumed but not live: birth > day
        state.heat[e] = 1;                  // prototype emitDay, line 911
        if (emitted < MAX_BEAMS_PER_DAY) { emitBeam(state, e); emitted++; }
      }
    }
  }

  // --- presentation, one pass over files -------------------------------
  for (let i = state.repoCount; i < state.entityCount; i++) {
    state.heat[i] *= HEAT_KEEP;
    const target = state.slot[i] !== -1 ? 1 : 0;
    state.alpha[i] += (target - state.alpha[i]) * FILE_ALPHA_K;
  }

  // --- presentation, repos ---------------------------------------------
  const day = state.cursorDayInt;
  for (let r = 0; r < state.repoCount; r++) {
    const phase = repoPhase(state, r, day);
    const target = phase === PHASE_LIVE ? 1 : phase === PHASE_GHOST ? REPO_GHOST_ALPHA : 0;
    // Ghosts dim on the slow 0.02 curve; everything else uses the 0.045 curve.
    const k = phase === PHASE_GHOST ? REPO_GHOST_K : REPO_EASE_K;
    state.repoAlpha[r] += (target - state.repoAlpha[r]) * k;
    const a = state.repoAngle[r];
    const gx = RING.cx + Math.cos(a) * RING.rx;
    const gy = RING.cy + Math.sin(a) * RING.ry;
    state.repoX[r] += (gx - state.repoX[r]) * REPO_EASE_K;
    state.repoY[r] += (gy - state.repoY[r]) * REPO_EASE_K;
  }

  // --- beams: fixed ring, no filter, no allocation ----------------------
  for (let b = 0; b < MAX_BEAMS; b++) {
    if (state.beamLife[b] > 0) {
      state.beamLife[b] = Math.max(0, state.beamLife[b] - BEAM_DECAY_STEP);
    }
  }

  // --- actors: ease, then retarget when settled (I-5, the only RNG use) --
  for (let a = 0; a < 2; a++) {
    state.actorX[a] += (state.actorTX[a] - state.actorX[a]) * ACTOR_EASE_K;
    state.actorY[a] += (state.actorTY[a] - state.actorY[a]) * ACTOR_EASE_K;
    const dx = state.actorTX[a] - state.actorX[a];
    const dy = state.actorTY[a] - state.actorY[a];
    if (dx * dx + dy * dy < IDLE_EPSILON_SQ) {
      state.rngState = nextRng(state.rngState);
      const u = rngValue(state.rngState);
      state.rngDraws++;
      state.rngState = nextRng(state.rngState);
      const v = rngValue(state.rngState);
      state.rngDraws++;
      state.actorTX[a] = RING.cx + (u - 0.5) * ACTOR_WANDER.x;
      state.actorTY[a] = RING.cy + (v - 0.5) * ACTOR_WANDER.y;
    }
  }
}
```

`emitBeam` is module-private:

```ts
function emitBeam(state: SimState, entityId: number): void {
  const h = state.beamHead;
  state.beamEnt[h] = entityId;
  state.beamActor[h] = 0;            // I-6: SimInput carries no attribution
  state.beamKind[h] = 0;
  state.beamLife[h] = 1;             // prototype: life starts at 1, line 914
  state.beamHead = (h + 1) % MAX_BEAMS;
  // Actor target follows the touched file, prototype emitDay lines 912-913.
  const r = state.repoOf[entityId];
  if (r >= 0) {
    state.actorTX[0] = state.repoX[r] + state.px[entityId] * 0.03;
    state.actorTY[0] = state.repoY[r] + state.py[entityId] * 0.05;
  }
}
```

`snapPresentation` is the settled-state projection. It must not read `tick` and must not consume the RNG, so two calls agree and a `seekCursor` jump lands on the same state a playthrough would:

```ts
export function snapPresentation(state: SimState): void {
  const day = state.cursorDayInt;
  for (let i = state.repoCount; i < state.entityCount; i++) {
    state.alpha[i] = state.slot[i] !== -1 ? 1 : 0;
    state.heat[i] = 0;
  }
  for (let r = 0; r < state.repoCount; r++) {
    const phase = repoPhase(state, r, day);
    state.repoAlpha[r] =
      phase === PHASE_LIVE ? 1 : phase === PHASE_GHOST ? REPO_GHOST_ALPHA : 0;
    const a = state.repoAngle[r];
    state.repoX[r] = RING.cx + Math.cos(a) * RING.rx;
    state.repoY[r] = RING.cy + Math.sin(a) * RING.ry;
  }
  for (let b = 0; b < MAX_BEAMS; b++) state.beamLife[b] = 0;
  state.beamHead = 0;
  for (let a = 0; a < 2; a++) {
    state.actorX[a] = state.actorTX[a] = RING.cx;
    state.actorY[a] = state.actorTY[a] = RING.cy;
  }
}
```

`stepFrame` is the whole accumulator, verbatim from viz-runtime §2.3 with the wall clock removed:

```ts
export function stepFrame(state: SimState, dtSeconds: number, accumulator: number): number {
  let acc = accumulator + (dtSeconds > 0.25 ? 0.25 : dtSeconds);
  let n = 0;
  while (acc >= FIXED_DT && n < MAX_STEPS) { step(state); acc -= FIXED_DT; n++; }
  if (n === MAX_STEPS) acc = 0;   // drop the backlog, do not accrue debt
  return acc;
}
```

### `lib/viz/sim/layout.ts` — the worked packer

`PACK_CHUNK_SIZE`, `RING` and `RING_ENTRY_SCALE` are declared and exported at the top of this same file, exactly as sketched in "Contract and invariants".

```ts
import { packSiblings, packEnclose } from 'd3-hierarchy';
import { ENTITY_FILE } from './types';
import type { SimState } from './types';

const PACKED = new WeakSet<SimState>();

export function isPacked(state: SimState): boolean { return PACKED.has(state); }

export function packOnce(state: SimState): void {
  if (PACKED.has(state)) return;

  // 1. bucket file ids by repo, in birth ASC / id ASC order (I-8)
  const byRepo: number[][] = Array.from({ length: state.repoCount }, () => []);
  for (let i = state.repoCount; i < state.entityCount; i++) {
    if (state.kind[i] !== ENTITY_FILE) continue;
    const r = state.repoOf[i];
    if (r >= 0 && r < state.repoCount) byRepo[r].push(i);
  }
  for (const ids of byRepo) {
    ids.sort((a, b) => (state.birth[a] - state.birth[b]) || (a - b));
  }

  // 2. pack each repo, chunking above PACK_CHUNK_SIZE (the cohort rollup)
  for (let r = 0; r < state.repoCount; r++) {
    const ids = byRepo[r];
    const enclose = ids.length <= PACK_CHUNK_SIZE
      ? packFlat(state, ids)
      : packChunked(state, ids);
    state.repoR[r] = enclose;         // in file-radius units; render scales it
  }

  // 3. repo ring: equal arc share by rank, the degenerate case of the
  //    prototype's proportional formula at lines 736-741. Rank is
  //    death DESC, id ASC — the same total order as byDeath.
  const rank = Array.from({ length: state.repoCount }, (_, i) => i)
    .sort((a, b) => (state.death[b] - state.death[a]) || (a - b));
  for (let k = 0; k < rank.length; k++) {
    const r = rank[k];
    const a = ((2 * k + 1) / state.repoCount) * Math.PI + RING.phase;
    state.repoAngle[r] = a;
    // start on a wider ring and ease in (prototype lines 733-734)
    state.repoX[r] = RING.cx + Math.cos(a) * RING.rx * RING_ENTRY_SCALE;
    state.repoY[r] = RING.cy + Math.sin(a) * RING.ry * RING_ENTRY_SCALE;
    state.repoAlpha[r] = 0;
  }

  PACKED.add(state);
}
```

`packFlat` and `packChunked` both write `px`/`py`/`pr` normalized into the repo's unit disc, so render never needs to know how a repo was packed:

```ts
function packFlat(state: SimState, ids: number[]): number {
  if (ids.length === 0) return 0;
  const circles = ids.map(() => ({ r: 1 }));
  packSiblings(circles);
  const e = packEnclose(circles);
  for (let i = 0; i < ids.length; i++) {
    const c = circles[i];
    state.px[ids[i]] = (c.x! - e.x) / e.r;
    state.py[ids[i]] = (c.y! - e.y) / e.r;
    state.pr[ids[i]] = 1 / e.r;
  }
  return e.r;
}

function packChunked(state: SimState, ids: number[]): number {
  const groups: { r: number; ids: number[] }[] = [];
  for (let i = 0; i < ids.length; i += PACK_CHUNK_SIZE) {
    const slice = ids.slice(i, i + PACK_CHUNK_SIZE);
    const circles = slice.map(() => ({ r: 1 }));
    packSiblings(circles);
    const e = packEnclose(circles);
    // stash chunk-local normalized coords, rescaled after the outer pack
    for (let j = 0; j < slice.length; j++) {
      state.px[slice[j]] = (circles[j].x! - e.x) / e.r;
      state.py[slice[j]] = (circles[j].y! - e.y) / e.r;
      state.pr[slice[j]] = 1 / e.r;
    }
    groups.push({ r: e.r, ids: slice });
  }
  const outer = groups.map((g) => ({ r: g.r }));
  packSiblings(outer);
  const oe = packEnclose(outer);
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const gx = (outer[g].x! - oe.x) / oe.r;
    const gy = (outer[g].y! - oe.y) / oe.r;
    const scale = grp.r / oe.r;
    for (const id of grp.ids) {
      state.px[id] = gx + state.px[id] * scale;
      state.py[id] = gy + state.py[id] * scale;
      state.pr[id] = state.pr[id] * scale;
    }
  }
  return oe.r;
}
```

All circles use `r: 1`. `SimInput` carries no per-file weight (no touch counts, no size), so a varied radius would be invented data. Render may scale a circle by `heat`/`alpha` at draw time; that is presentation.

### Measurements to reproduce, and the budget they justify

Run on `d3-hierarchy@3.1.2`, Node v24.18.0, this session. The distribution is the measured one: aiur 7,342 unique paths and `ethereum-optimism/actions` 1,451 (GT-6), the remaining 4,660 spread over 49 repos, total 13,453 across 51 repos (C-27).

| Configuration | min of 3 runs |
|---|---|
| flat `packOnce` over all 51 repos (one `packSiblings` per repo) | **19.187 ms** — busts the 15 ms budget |
| cohort-chunked at 256 | 5.360 ms |
| **cohort-chunked at 512 (shipped)** | **6.291 ms** |
| cohort-chunked at 1024 | 7.753 ms |
| cohort-chunked at 2048 | 9.552 ms |
| single `packSiblings` at n = 7,342 (aiur alone, flat) | 18.256 ms |
| single `packSiblings` at n = 13,453 (whole corpus in one call) | 46.716 ms |

256 is marginally faster than 512 but produces 29 visible cohort clusters for aiur against 15, which reads as noise; 512 is the shipped value and the constant is exported so the number can be revisited with a measurement rather than a guess.

Per-step cost of the reducer itself, at 51 repos + 13,453 files with the full presentation pass:

| Measurement | Value |
|---|---|
| one `step(state)` | **0.0374 ms** |
| CPU per wall-clock second at 120 Hz | **4.49 ms** — 0.45 % of one core |
| per rendered frame at 60 fps (2 steps) | 0.075 ms, 0.45 % of a 16.7 ms budget |
| days crossed per step at the fastest speed (32 days/s) | 0.2667 |

The dominant term is the `O(entityCount)` presentation pass. It is deliberate: iterating only the live set would make fade-*out* impossible, because KW-008's cursor reports no removals. At 0.45 % of a core the simplicity is worth more than the saving. If it ever is not, the fix is a small dirty-list, not a different architecture.

### Worked fixture

`test/viz/step.test.ts` builds its own fixture. Do **not** import `test/viz/fixtures.ts` — that path is not in KW-008's declared write surface and may not exist.

```ts
import { DAY_ALIVE, ENTITY_REPO, ENTITY_FILE } from '../../lib/viz/sim/types';
import type { SimInput } from '../../lib/viz/sim/types';

// 2 repos, 3 files, 40 days. Small enough to hand-check, long enough that the
// 30/90-day dwell tails do not saturate against dayCount - 1.
export const TINY: SimInput = {
  dayCount: 40,
  windowStartISO: '2026-01-01',
  repoCount: 2,
  entityCount: 5,
  kind:         Uint8Array.from([ENTITY_REPO, ENTITY_REPO, ENTITY_FILE, ENTITY_FILE, ENTITY_FILE]),
  repoOf:       Int32Array.from([-1, -1, 0, 0, 1]),
  birthDay:     Int32Array.from([0, 20, 2, 6, 22]),
  lastTouchDay: Int32Array.from([5, DAY_ALIVE, 4, DAY_ALIVE, 30]),
};

// After createSimState (KW-008 applies the tails, clamped to dayCount - 1 = 39):
//   death = [39, DAY_ALIVE, 34, DAY_ALIVE, 39]
// Cursor seeded at day 39. Walking back at SPEEDS[0] = 4 days/s:
//   day 39 -> live files {2, 3, 4};  repo 0 GHOST? no: death[0] = 39 -> LIVE
//   day 21 -> live files {2, 3};     repo 1 ABSENT (birth 20 <= 21 -> LIVE; at 19 ABSENT)
//   day  5 -> live files {2, 3};     repo 1 ABSENT
//   day  1 -> live files {};         both repos: repo 0 ABSENT at day < 0 only
// Beams: one per entered file, capped at MAX_BEAMS_PER_DAY per crossed day.
```

The large fixture is generated, not checked in: 51 repos and 13,453 files whose births and deaths come from a `mulberry32(7)` stream, so it is reproducible without a data file.

### Running the tests before KW-011 lands

KW-021 does not depend on KW-011, so `vitest.config.mts` will not exist. `vitest@4.1.10` is installed by KW-001 (DEC-003); its default `include` is `['**/*.{test,spec}.?(c|m)[jt]s?(x)']` and its default environment is `node`, which is exactly what this ticket needs.

```bash
npx vitest run test/viz/step.test.ts
```

Do not add a config file and do not pass `--environment jsdom`. If KW-011 has already merged, `npm run test:unit` runs the same file under the `node` project.

### The single-pack spy

`vi.mock` is hoisted, so it must be at the top of the test file:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('d3-hierarchy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('d3-hierarchy')>();
  return { ...actual, packSiblings: vi.fn(actual.packSiblings) };
});

import { packSiblings } from 'd3-hierarchy';
import { packOnce, PACK_CHUNK_SIZE } from '../../lib/viz/sim/layout';
import { step } from '../../lib/viz/sim/step';
import { createSimState } from '../../lib/viz/sim/state';

it('packs once and never again', () => {
  const state = createSimState(TINY, 12345);
  vi.mocked(packSiblings).mockClear();
  packOnce(state);
  const afterFirstPack = vi.mocked(packSiblings).mock.calls.length;
  expect(afterFirstPack).toBe(TINY.repoCount);          // no repo exceeds the chunk size
  packOnce(state);                                       // idempotent
  for (let i = 0; i < 10_000; i++) step(state);
  expect(vi.mocked(packSiblings).mock.calls.length).toBe(afterFirstPack);
});

it('never hands packSiblings more than PACK_CHUNK_SIZE circles', () => {
  const state = createSimState(BIG, 12345);              // the 51 / 13,453 fixture
  vi.mocked(packSiblings).mockClear();
  packOnce(state);
  for (const [circles] of vi.mocked(packSiblings).mock.calls) {
    expect(circles.length).toBeLessThanOrEqual(PACK_CHUNK_SIZE);
  }
});
```

### Version pins

`d3-hierarchy@3.1.2` (ISC, ESM-only, `sideEffects: false`, `packSiblings` + `packEnclose` tree-shake to 2,455 B gzip), `typescript@5.9.3`, `eslint@9.39.5`, `vitest@4.1.10` — all installed by KW-001, all confirmed on the registry this session with `npm view`. `@types/d3-hierarchy` is 3.1.7 on the registry; install nothing (DEC-003).

## Acceptance and verification

### Agent gate

- `npx tsc --noEmit` exits 0.
- `npx eslint lib/viz/sim test/viz` exits 0 — including KW-008's `lib/viz/sim/**` determinism override, which bans `Math.random`, `Date.now`, `performance.now`, `new Date`, `window`, `document`, `setTimeout`, `setInterval` and `requestAnimationFrame` in both new files.
- `npx vitest run test/viz/step.test.ts` exits 0 with every test green.
- Frame-rate independence: 600 `stepFrame(state, 1/60, acc)` calls and 1,200 `stepFrame(state, 1/120, acc)` calls from the same seeded state both reach `tick === 1200`, and `digestSimState` plus the summed `alpha`, summed `heat`, `beamHead` and returned accumulator are identical between the two.
- `packSiblings` is called only inside `packOnce`: a spy records `repoCount` calls for a fixture whose largest repo is under `PACK_CHUNK_SIZE`, a second `packOnce(state)` adds zero, and 10,000 subsequent `step(state)` calls add zero.
- No `packSiblings` call receives more than `PACK_CHUNK_SIZE = 512` circles on the 51-repo / 13,453-file fixture, and the whole `packOnce` completes in under 60 ms in CI (the measured local figure is 6.291 ms; the ceiling is deliberately loose because CI timing is not a stable assertion surface).
- Two `createSimState(BIG, 12345)` states driven through the same 5,000 `step` calls produce identical `tick`, `cursorDay`, `rngState`, `rngDraws`, `nLive` and `liveHash`.
- `structuredClone(state)` after 1,000 steps does not throw and its digest equals the original's; stepping the clone and the original in lockstep keeps them equal.
- The `MAX_STEPS` clamp: `stepFrame(state, 5, 0)` advances `tick` by exactly `MAX_STEPS` and returns exactly `0`.
- `state.rngDraws` advances only on actor retargeting: a run in which both actors are pinned at their targets leaves `rngDraws` unchanged across 1,000 steps.
- `step` never crosses more than one day: across a full reverse playthrough at `SPEEDS[SPEEDS.length - 1]`, `state.cursorDayInt` decreases by at most 1 per `step` call, and `advanceCursor` never throws `RangeError`.
- The day-0 wrap works: driving past day 0 sets `cursorDay` to `dayCount - 1`, restores `nLive` to the seed-day value, and leaves every beam dead.
- Node-environment test imports `lib/viz/sim/step.ts` and `lib/viz/sim/layout.ts` and asserts `typeof globalThis.document === 'undefined'` and `typeof globalThis.window === 'undefined'` — the sim stays DOM-free.
- `grep -riE '\b(gsap|d3-force|forceSimulation)\b' package.json package-lock.json lib test` returns nothing, and `npm ls d3-force gsap` reports neither package.

### At-merge gate

- `ci-ok` is green on the exact PR head commit.
- The PR diff touches no file outside this ticket's write surface. In particular `package.json` and `package-lock.json` are unmodified (DEC-003), and `lib/viz/sim/types.ts`, `cursor.ts`, `rng.ts`, `state.ts` and `eslint.config.mjs` are unmodified (KW-008 and KW-001 own them).
- No file added by this ticket imports from `lib/viz/render/**`, `lib/bundle/**`, `app/**`, `react` or `next`.
- No numeric literal from the data domain (`1826`, `2038`, `7354`, `13453`, `51`, any contribution total) appears in `lib/viz/sim/step.ts` or `lib/viz/sim/layout.ts`; every such number is either derived from `SimState` or lives in a test fixture (DEC-008).
- Every decay constant in `step.ts` is expressed as a half-life or a per-second rate and converted through `FIXED_DT` exactly once at module load; `grep` finds no bare `0.955`, `0.045`, `0.09`, `0.02` or `0.022` applied per step.
- The PR description states that the prototype's near-birth slowdown (line 885) was dropped deliberately, with the `seekTick` reason (I-10).

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure modes and required behaviour**

- **Backgrounded tab.** `stepFrame` receives a multi-second `dtSeconds`. It clamps to 0.25 s, runs `MAX_STEPS = 8` steps, and zeroes the accumulator. The visualization resumes where it left off rather than fast-forwarding weeks of history in one frame — the prototype's `Math.min(0.05, …)` at line 874 had the same intent with a tighter clamp and no step cap, which is the spiral-of-death shape.
- **A speed above 120 days/second.** Would break I-2 by crossing more than one day per step, and `step` would silently skip a day's beams. The test asserts the property directly; if `SPEEDS` ever changes, the test fails rather than the visualization quietly dropping events.
- **Forward cursor movement.** `advanceCursor` throws `RangeError`. `step` guards with `day < state.cursorDayInt`, and the day-0 wrap is routed through `seekCursor`. A `RangeError` escaping `step` means the guard was edited; do not catch it.
- **`packOnce` never called.** Every `px`/`py`/`pr` is 0, so every file draws at the repo centre. It is a legible failure rather than a crash, but `isPacked(state)` exists so KW-024 can assert at boot; the driver should call `packOnce` before the first `step`.
- **A repo with zero files.** `packFlat` returns radius 0 and writes nothing; `repoR` is 0 and the render side draws the repo label with no disc. Must not throw and must not produce `NaN`.
- **`repoCount === 0` or `entityCount === 0`.** `packOnce` and `step` must both be no-ops that leave a valid state. The ring formula divides by `state.repoCount`; guard it.
- **`NaN` propagation.** A single `NaN` in `cursorDay` poisons `Math.floor` and every downstream tween forever. `SimInput` validation is KW-008's (`createSimState` throws on `birthDay > lastTouchDay`), but the test drives 10,000 steps and asserts `Number.isFinite` on `cursorDay`, every `repoX`/`repoY`, and the summed `alpha`.

**Security.** No network, no filesystem, no secrets, no user-supplied strings. The only external code is `d3-hierarchy`'s `packSiblings`/`packEnclose`, ISC-licensed, whose source contains zero `Math.random` calls (verified by `grep` over the unpacked tarball) and which is deterministic under repeat invocation (verified: two packs of an identical 2,000-circle input produce byte-equal `packEnclose` output). No `eval`, no dynamic `import`, no prototype mutation.

**Migration.** None. Both source files are new, and the prototype is a read-only port source. No persisted state, no schema version, no data migration. `SimState` is created fresh on every page load.

**Accessibility.** No DOM, so no direct surface, but two obligations are discharged here rather than deferred. First, `prefers-reduced-motion` is satisfiable only because `step` is skippable: KW-024's static path is `seekCursor` to the seed day plus `snapPresentation` plus one render, and `snapPresentation` exists in this ticket precisely so that path produces the same state a settled playthrough would. Second, DEC-011's visually-hidden `<table>` is generated from the same cursor state this reducer drives, so the text alternative and the canvas cannot disagree about which repositories are live. Do not add any motion here that is not expressible as a half-life on a state field — anything that lives only in the renderer's head is invisible to both the static frame and the text alternative.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/research/2026-07-31-viz-runtime.md, docs/research/2026-07-31-decomposition-synthesis.md, lib/viz/sim/types.ts, lib/viz/sim/cursor.ts, lib/viz/sim/rng.ts, lib/viz/sim/state.ts, package.json, tsconfig.json
- Writes: lib/viz/sim/step.ts, lib/viz/sim/layout.ts, lib/viz/sim/d3-hierarchy.d.ts, test/viz/step.test.ts
- Contracts: lib/viz/sim/step.ts#step, lib/viz/sim/step.ts#stepFrame, lib/viz/sim/step.ts#cursorDayAtTick, lib/viz/sim/step.ts#snapPresentation, lib/viz/sim/layout.ts#packOnce
- Safety: lib/viz/sim/step.ts#fixed-timestep-determinism, lib/viz/sim/layout.ts#pack-once-boot-budget

## Sibling boundaries and open gates

**Open gates.** None block pickup. KW-021 carries no `GATE-nnn`.

**Upstream, and what to do while it is unmerged.** KW-021 depends on **KW-008** only. If KW-008 is still open at pickup, do not start: every symbol in "Contract and invariants" comes from it and re-declaring any of them creates a merge conflict inside a directory the write-surface partition says is shared file-by-file. If KW-008 has merged but a field is missing, raise it on KW-008's issue — `lib/viz/sim/types.ts` is not this ticket's to edit.

**Same wave (phase 3).** Eleven tickets run in parallel; every one owns a disjoint set of files (DEC-005), and there are no `serializes_with` edges anywhere in this Build Order.

| Ticket | Owns | Boundary with KW-021 |
|---|---|---|
| KW-022 | `lib/viz/render/{graph,ribbon,overview,cluster,budget}.ts` | KW-022 reads the fields this ticket writes and maps unit space to pixels. Every pixel constant — the `clamp(16px, 4%, 40px)` margins, the DPR clamp, the `ctx.filter` one-draw-call rule, the ribbon gutter fix — is KW-022's. Do not put a pixel in `sim/`. |
| KW-013, KW-014, KW-015 | `scripts/pipeline/**`, `lib/bundle/**` | produce the payload; the payload-to-`SimInput` adapter is KW-024's, not this ticket's. |
| KW-016..KW-020 | `app/regions/*.tsx` | no overlap. |
| KW-023 | `playwright.config.ts`, `e2e/**`, `.github/workflows/e2e.yml` | no overlap; its `page.clock` strategy depends on `stepFrame` being the only thing a faked rAF drives. |

**Downstream.** KW-024 (`lib/viz/driver.ts`, `lib/viz/testHarness.ts`) is the only intended caller of `stepFrame`. KW-026's transport writes `playing` and `speedIndex`; `step` reads both every tick, so a transport change takes effect on the next tick with no extra plumbing.

**Two contract gaps this ticket does not close, recorded rather than papered over.**

1. **Actor attribution and event kind.** `SimInput` (KW-008) carries `kind`, `repoOf`, `birthDay` and `lastTouchDay` and nothing else, so a beam cannot know whether `its-everdred` or `its-applekid` produced the touch, nor whether it was a commit, PR, issue or review. The prototype gets both from its synthetic `day.ev` array. Every beam here is emitted with `beamActor = 0` and `beamKind = 0`. Deriving them from the RNG would fabricate a factual claim, which is the specific error DEC-014 deletes elsewhere in this plan. Closing this needs a per-entity attribution field in `SimInput`, which is KW-008's write surface, and a pipeline field to fill it, which is KW-013/KW-014's.
2. **The depth-2 *directory* rollup.** The synthesis promotes it from contingency to precondition on the strength of C-27, and the budget evidence is real — a flat pack is 19.187 ms against a 15 ms budget. What ships here is the **cohort** rollup: deterministic birth-ordered chunks of 512, which is derivable from `SimInput` and recovers the budget (6.291 ms). A *directory* rollup needs a path or group key per file, and `SimInput` carries no path strings — path data stops at `lib/bundle/**`. If the semantic grouping is wanted, it needs a `groupOf: Int32Array` on `SimInput` (KW-008) fed by the front-coded path dictionary (KW-012/KW-014), plus a hover/zoom drill-down in `lib/viz/render/graph.ts` (KW-022). None of those files are this ticket's. The budget is met either way, which is why this ticket is not blocked.
