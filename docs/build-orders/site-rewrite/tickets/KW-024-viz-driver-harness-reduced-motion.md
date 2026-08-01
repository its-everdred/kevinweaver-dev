# KW-024 — Viz driver: single rAF owner, test harness, reduced motion

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Two new files, no new dependencies, and both upstream contracts are already frozen; the whole difficulty is concentrated in one arithmetic seam (the closed-form tick to cursor-day and tick to RNG mapping) rather than spread across a wide surface.

**Risk:** Medium — the driver is the single point at which determinism can be lost, and losing it fails nothing locally: a float-drift or RNG-chaining mistake here compiles, lints, renders correctly to the eye, and only surfaces weeks later as KW-031 screenshot flake. It is also on the critical path (`KW-001 → KW-008 → KW-022 → KW-024 → KW-025 → KW-029 → KW-032`).

**Phase hint:** 4

**Depends on:** KW-021, KW-022

**Serializes with:** none

**Requirements:** REQ-004, REQ-005, REQ-008

**Decisions:** DEC-003, DEC-005, DEC-008, DEC-010, DEC-016

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/viz/driver.ts` is the only file in the repository that calls `requestAnimationFrame`, and a rendered frame is fully described by the triple `(SimInput, seed, tick)`: `seekTick(t)` produces the same bytes on every call, on every run, at 60 Hz and at 120 Hz. Under `prefers-reduced-motion: reduce` the loop never starts at all — the driver renders exactly one static frame showing the entities alive today — and the driver honours a live `change` on that media query instead of reading it once. A Playwright-drivable harness is reachable at `window.__viz` when `?viz-test=1` is present, and is absent from a plain production build.

## Context and evidence

This ticket exists because the design prototype at `docs/design/kevinweaver.dev.dc.html` (1,033 lines, verified present and unchanged at the researched commit) is a working animation whose *driver* is where five separate defects live. Every line number below was re-derived against `e664d73a195facd64db58ba10952170ff01b4772` this session, per **C-30** (cite the method first, the line second — six of the viz-runtime track's line citations were measured off by 2–6 lines).

**Defect 1 — there is no single rAF owner.** `requestAnimationFrame` appears **4** times in the prototype (measured: `grep -c requestAnimationFrame` → 4): the playback loop start in `begin()` (459), the boot branch inside `loop` (875), the loop's own re-schedule (901), and a scroll-position sync in `wire()` (508). `cancelAnimationFrame` appears once, in `componentWillUnmount` (406). Four schedulers means four places that can keep animating after a pause, and it is why the design-comp-spec track's port plan named a single `useRafLoop` module. This ticket is that module, renamed `lib/viz/driver.ts` by the synthesis.

**Defect 2 — the frame is not a function of the tick.** `loop` (872) computes `const dt = Math.min(0.05, (ts - this.last) / 1000)` from the wall clock and then advances `this.day = Math.max(0, this.day - sp * dt)` (887). The day cursor therefore depends on the exact sequence of `requestAnimationFrame` timestamps the browser happened to deliver. No two runs agree, so no screenshot can be a baseline. **REQ-008** is the requirement this defeats.

**Defect 3 — `matchMedia` is read once, in the constructor.** Line 205: `this.rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;`. The design-comp-spec track's §9.6 rates the prototype's reduced-motion behaviour as *"a genuinely good reduced-motion story"* with three holes, and this is hole 1: a user who toggles the OS setting mid-session gets no change in either direction.

**Defect 4 — the wall clock lives inside the animation loop.** `this.tickClock()` is called at line 899, inside `loop`, and `loop` is never entered under reduced motion because `begin()` short-circuits at line 457 (`if (this.rm) { this.settleStatic(); this.drawAll(); return; }`). The consequence, measured: the tmux status bar stays at its markup literal `09:41` (line 180) forever. That is design-comp-spec §9.6 hole 2, and its stated fix is *"Move it to a 30 s `setInterval` that runs in both modes (or drop the clock)"* — i.e. **the fix is to keep the clock out of the driver**, which is exactly what this ticket does. `tickClock` (979) also hardcodes the date suffix `· fri 31-jul-26`.

**Defect 5 — `settleStatic()` renders the wrong frame.** Lines 463–469 walk **every** day in the window setting `f.seen = true; f.heat = 0.32` and `r.entered = true; r.hot = 0.5`, producing the fully accumulated final state. Under **DEC-010**'s lifespan-interval semantics that is wrong: the static frame must be `visible(e, today)` — the seed set — which is both correct and the most informative frame. It also calls `pushLog()` twice (467–468), and those log lines carry `animation:kw-logIn .3s ease both`, so the reduced-motion path animates. Hole 3.

Two contradictions from the verification passes bind this ticket directly:

- **C-24 (ci-testing verifier, C3a/C3b).** A closure-based RNG makes `step` impure and throws `DataCloneError` under `structuredClone`. **DEC-016** settles it: mulberry32 carried as a **32-bit integer field** `SimState.rngState`, advanced functionally. This matters here specifically because it is what makes an O(1) closed-form RNG anchor possible (see Contract, below). The viz-runtime track's `VizFrameInfo` sketch still shows `rngState: [number, number, number, number]` (its abandoned xorshift128 proposal); **that is superseded — `rngState` is one `number`.**
- **C-27 (viz-runtime verifier, C1).** Real corpus scale is **13,453 unique paths across 51 repos**, not the 7,354 / ~20 the viz-runtime track assumed. The driver's only scale-sensitive operation is `seekCursor`, re-measured by KW-008 at **0.088 ms** at the corrected scale. That is well inside a harness command and far too slow for a per-frame call, which is why `anchorTick` uses the O(1) `advanceCursor` on the monotone path and reserves `seekCursor` for seeks and the once-per-sweep wrap.

One correction this ticket makes to its own source material, with the evidence:

> **The viz-runtime track's `VizFrameInfo` contains `lastFrameMs`, and its own idempotency test asserts `expect(b).toEqual(a)` on two `seekTick(3600)` results** (§8.1 vs §8.3). Those two statements cannot both hold: `lastFrameMs` is a wall-clock measurement. **Resolution: `VizFrameInfo` is deterministic by construction and carries no timing value.** Frame timings move to a separate `driver.perf()` accessor that tests never compare. This is recorded here rather than deferred because KW-031's acceptance is literally "assert the `VizFrameInfo` struct ... and only then screenshot".

Requirements this ticket carries:

- **REQ-004 — WCAG 2.2 AA.** *Trace:* SC 2.2.2 (Pause, Stop, Hide) and the `prefers-reduced-motion` contract are discharged at their root here: under reduce the rAF loop is never scheduled, so there is no motion to stop, and the media query is live rather than sampled once. KW-029 verifies this from the outside ("reduced motion provably halts the sim"); KW-024 is what makes it true.
- **REQ-005 — every repository and contribution figure the site displays is derived from measured GitHub data at generation time; no figure is a literal in copy or code.** *Trace:* the driver owns the day-index to calendar-date conversion (KW-008 invariant I-7 pushes it here because `Date` construction is lint-banned inside `lib/viz/sim/`). `formatDayISO` derives every date from `SimInput.windowStartISO` and `SimInput.dayCount`; `2021-08-01`, `1826` and `2038` are forbidden literals in this file (**DEC-008**). The prototype hardcodes all three of them in three mutually inconsistent places.
- **REQ-008 — the pipeline is a deterministic function of its inputs: the same inputs produce byte-identical output on every run.** *Trace:* this ticket carries the client-runtime half. `seekTick(t)` is a closed-form pure function of `(SimInput, seed, t)` with no wall-clock term, the RNG is anchored per tick rather than chained across ticks, and the rasterization flush closes the last race (Chromium defers canvas commands — an entire viz-runtime benchmark round reported `0.0000 ms` for every entry until a `getImageData` flush was added).

Plan context, all pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772` (browse at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/`):

| What | Where |
|---|---|
| Pack index, and the `KW-01..KW-32` → `KW-001..KW-032` zero-padding map | `docs/build-orders/site-rewrite/README.md` (pack sibling, same planning commit) |
| Wave and graph analysis, verified topological levels, critical path, write-surface partition | `docs/research/2026-07-31-decomposition-synthesis.md` §6 |
| Decision registry `D-01..D-17` (published as `DEC-001..DEC-017`) | same document, §3 |
| Human gates `HG-1..HG-7` (published as `GATE-001..GATE-007`) | same document, §4 |
| This ticket's implementation pointers | same document, §5, wave 4, entry "KW-24" |
| Fixed-timestep accumulator, harness API, quality ladder, reduced-motion policy | `docs/research/2026-07-31-viz-runtime.md` §2.3, §7.3, §8, §9.1 and its "Verification corrections" C1/C9 |
| `page.clock` semantics, `runFor` vs `fastForward`, the `NEXT_PUBLIC_TEST_HOOKS` gate | `docs/research/2026-07-31-ci-testing.md` §5.3, §5.6 and its "Verification corrections" C3 |
| The three reduced-motion holes, with line numbers | `docs/research/2026-07-31-design-comp-spec.md` §9.6 |
| `SimState` / `SimInput` / `SimStateDigest`, cursor and RNG contracts | `docs/build-orders/site-rewrite/tickets/KW-008-viz-contract-simstate-cursors-rng.md` |

## Scope

- Implement `lib/viz/driver.ts`: `createVizDriver(options)` returning a `VizDriver` handle, containing the repository's only `requestAnimationFrame`/`cancelAnimationFrame` call sites and its only `performance.now()` call site outside test tooling.
- Implement the closed-form canonical mapping `cursorDayAtTick(input, tick)` and `rngAnchor(seed, tick)`, plus `anchorTick(tick)`, which re-derives `tick`, `cursorDay`, `cursorDayInt` and the live set from the tick alone so accumulated float drift can never move a rendered day.
- Implement the fixed-timestep accumulator at `FIXED_DT` with the `MAX_STEPS` catch-up clamp and the 0.25 s backgrounded-tab guard, driving KW-021's `step` and KW-022's three render modules.
- Implement the reduced-motion path: a live `matchMedia('(prefers-reduced-motion: reduce)')` `change` subscription, no rAF scheduling under reduce, and exactly one static frame rendered through the same `seekTick(0)` code path the tests use.
- Implement `formatDayISO`, `weekdayOfISO` and the ribbon-window functions `ribbonWinStart` and `highlightCellFor`, all pure and all derived from `SimInput`, with no date or window-size literal from the data domain.
- Implement the quality ladder `qualityForTier` and the frame-time governor, published to consumers and read only by `lib/viz/render/**`, never by `lib/viz/sim/**`.
- Implement `lib/viz/testHarness.ts`: `installTestHarness(driver)` exposing `window.__viz` with `pause/play/reset/renderFrame/seekTick/seekDate/inspect/setQuality`, every command awaiting a synchronous `getImageData(0, 0, 1, 1)` rasterization flush on every attached canvas.
- Gate the harness on `?viz-test=1` at runtime and on a build-time constant so it is absent from a plain production build, and load it through a dynamic `import()` so it can never enter the main chunk.

## Non-goals

- No canvas element creation, no `ResizeObserver`, no DPR backing-store sizing, no Pointer Events, no React component and no `'use client'` file — KW-025 owns `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx` and hands this driver ready-made 2D contexts.
- No transport bar, no play/pause button, no keyboard bindings, no Space rebinding and no Bomberman deletion — KW-026 owns `app/regions/TransportBar.tsx`.
- No drawing code of any kind: no `arc`, no `fillText`, no `ctx.filter`, no sprites, no colour ramp — KW-022 owns `lib/viz/render/**` and KW-007 owns `lib/viz/tokens/**`.
- No edits to any file under `lib/viz/sim/` — KW-008 owns `types.ts`/`rng.ts`/`cursor.ts`/`state.ts` and KW-021 owns `step.ts`/`layout.ts`. This ticket imports from them and never writes them.
- No import from `lib/bundle/**` and no bundle-to-`SimInput` adapter. KW-024 does not depend on KW-012 or KW-015; KW-025 decodes the bundle and passes a finished `SimInput` in.
- No `eslint.config.mjs` edit. KW-001 created that file and KW-008 owns the `lib/viz/sim/**` determinism fence. Single-rAF-ownership is proven by `grep` in this ticket's agent gate, not by a lint rule.
- No `package.json` or `package-lock.json` change and no new dependency; both are frozen after KW-001 (DEC-003).
- No committed test file. The bit-identical double-render canary is KW-031's, in `e2e/canvas.spec.ts`; this ticket proves determinism with a temporary test that is deleted before commit.
- No tmux status-bar clock and no `app/regions/TmuxBar.tsx` — KW-018 owns it, and keeping the clock *out* of the driver is precisely the fix for design-comp-spec §9.6 hole 2.
- No Playwright spec, no `playwright.config.ts`, no `e2e/**` — KW-023 scaffolds and KW-031 writes the canvas specs.
- No event-log line emission and no `pushLog` port — KW-025 owns the log-tail pane and derives its lines from this driver's `subscribe` callback.

## Existing owner and reuse target

There is no existing owner. At `e664d73a195facd64db58ba10952170ff01b4772` the repository contains only `.aiur/`, `components/`, `pages/`, `public/`, `styles/`, `docs/` and root config (`git ls-tree -r --name-only`, verified this session); `lib/`, `app/` and `test/` do not exist. Both files in this ticket's write surface are new.

Named upstream artifacts this ticket consumes. **Every one of them is created by a named upstream ticket; none exists at the researched commit.**

| Artifact | Created by | What KW-024 uses it for |
|---|---|---|
| `lib/viz/sim/types.ts` — `SimInput`, `SimState`, `SimStateDigest`, `DAY_ALIVE`, `SPEEDS`, `FIXED_DT`, `MAX_STEPS`, `ENTITY_REPO`, `PHASE_ABSENT/LIVE/GHOST` | KW-008 (merged, contract frozen) | the whole type surface; the driver declares no state of its own beyond the tick mapping |
| `lib/viz/sim/rng.ts` — `seedRng`, `nextRng` | KW-008 | `rngAnchor` is proved equal to *n*-fold `nextRng`; `seedRng` coerces `?seed=` |
| `lib/viz/sim/cursor.ts` — `advanceCursor`, `seekCursor`, `repoPhase`, `isLive`, `liveIdsAscending` | KW-008 | `anchorTick` cursor maintenance and `VizFrameInfo.liveRepos` |
| `lib/viz/sim/state.ts` — `createSimState`, `resetSimState`, `digestSimState` | KW-008 | construction, `reset(seed)`, and the equality projection `VizFrameInfo` widens |
| `lib/viz/sim/step.ts` — `step` | **KW-021** | the per-fixed-step integrator. viz-runtime §2.1 gives it as `step(state, dtFixed)`; the synthesis phrases it `step(state) -> state`. Call it as `state = step(state, FIXED_DT) ?? state` so both readings work, and never assume it returns a new object. |
| `lib/viz/sim/layout.ts` — `packOnce` | **KW-021** | called exactly once, at driver construction, before the first frame |
| `lib/viz/render/graph.ts`, `ribbon.ts`, `overview.ts` | **KW-022** | the three `render(state, ctx, options)` modules the driver calls per frame |
| `lib/viz/render/budget.ts` | **KW-022** | the draw-call instrument the driver reads into `VizFrameInfo.drawCalls` |

**Symbol names in the last three rows are not pinned by any document at the researched commit** — the synthesis names the *files*, not the exports. Verify them at pickup by reading the merged `lib/viz/render/*.ts`, and if they differ, adapt **at the driver's import site only**. Editing a file under `lib/viz/render/` is a write-surface violation and will be rejected at review. Expected names, in order of likelihood: `renderGraph` / `drawGraph`, `renderRibbon` / `drawRibbon`, `renderOverview` / `drawOverview`, and `resetDrawCalls` / `readDrawCalls` in `budget.ts`.

The **port source** is `docs/design/kevinweaver.dev.dc.html`, which exists and is committed at the researched commit. Read these sites, in this order:

| Prototype site | Lines | What to take, what to reject |
|---|---|---|
| `constructor` | 195–221 | take `this.speeds = [4, 8, 12, 20, 32]` (209) — already `SPEEDS` in KW-008 — and the default-speed resolution at 210–211, which selects `12` ⇒ index **2**. Reject the one-shot `matchMedia` read at **205**. |
| `begin` | 450–462 | take `this.day = this.N - 1` (451) and `this.winStart = this.N - 371` (452) as the tick-0 anchor. Reject `this.last = performance.now()` (458) as the clock source and reject `setInterval(… , 2600)` (460) entirely (DEC-014, KW-026). |
| `settleStatic` | 463–469 | take only the settled channel constants `f.heat = 0.32` (464) and the repo-visible marker (465). Reject the all-days accumulation loop and both `pushLog` calls (467–468). |
| `wire` | 471–512 | reject the scroll rAF at **508**; KW-018 must not port it either (see Sibling boundaries). |
| `loop` | 872–902 | take the structure: dwell, cursor advance, ribbon-window follow, wrap-to-today. Reject the wall-clock `dt` (874), the near-birth speed clamp (885), the `> 3` window hysteresis (892), and `this.tickClock()` (899). |
| `tickClock` | 979–984 | reject entirely — `new Date()` with no argument plus the hardcoded `· fri 31-jul-26` suffix. The clock belongs to KW-018. |
| `componentDidMount` | 401–405 | `window.__kw = this` (403) is the prototype's ungated debug global. The shipped equivalent is `window.__viz`, gated twice. |

## Contract and invariants

This ticket is a **producer** for KW-025, KW-026 and KW-031, and a **consumer** of KW-008, KW-021 and KW-022. The sketches below are the interface those consumers quote verbatim.

### The canonical frame — the one idea this ticket exists to protect

A frame is fully described by `(SimInput, seed, tick)`. That is only achievable if both time-varying quantities have **closed forms** in `tick`, so that `seekTick(t)` never replays *t* steps.

**Closed form 1 — the RNG.** DEC-016's mulberry32 advances its state by pure addition (KW-008 `nextRng`: `return (rngState + 0x6d2b79f5) >>> 0`). Applying it *n* times is therefore one multiply:

```ts
/** Equal to applying nextRng() exactly `tick` times to seedRng(seed). O(1). */
export function rngAnchor(seed: number, tick: number): number {
  return ((seedRng(seed) + Math.imul(tick, 0x6d2b79f5)) >>> 0);
}
```

**Verified this session:** `rngAnchor(12345, n)` equals *n*-fold `nextRng` from `seedRng(12345)` for every `n` in `1..200000`, with zero mismatches. The driver re-anchors `state.rngState` at the start of every fixed step and zeroes `state.rngDraws`; draws *within* a step chain normally. Successive anchors differ by exactly the constant mulberry32 itself adds, so the stream statistics are unchanged.

**Closed form 2 — the cursor day.** The prototype's three-phase playback (park on today, rewind, wrap) becomes one periodic function. `DWELL_TICKS` is the prototype's 4,200 ms dwell (879) expressed in fixed steps; `DEFAULT_SPEED_INDEX` is `2`, from the prototype's default of 12 days/s (210–211).

```ts
export const DEFAULT_SPEED_INDEX = 2;                       // SPEEDS[2] === 12 days/s
export const DWELL_TICKS = Math.round(4.2 / FIXED_DT);      // 504 at FIXED_DT = 1/120

export interface TickMapping {
  readonly day0: number;        // dayCount - 1
  readonly daysPerTick: number; // SPEEDS[DEFAULT_SPEED_INDEX] * FIXED_DT
  readonly rewindTicks: number; // ceil(day0 / daysPerTick)
  readonly sweepTicks: number;  // DWELL_TICKS + rewindTicks
}

export function tickMapping(input: SimInput): TickMapping;

/** Pure. No wall clock. Periodic with period sweepTicks, defined for every integer tick. */
export function cursorDayAtTick(m: TickMapping, tick: number): number {
  const p = ((tick % m.sweepTicks) + m.sweepTicks) % m.sweepTicks;
  if (p <= DWELL_TICKS) return m.day0;
  const d = m.day0 - m.daysPerTick * (p - DWELL_TICKS);
  return d > 0 ? d : 0;
}
```

**Why the driver re-anchors instead of trusting `step`'s incremental subtraction — measured this session.** Comparing repeated `day -= SPEEDS[i] * FIXED_DT` against the closed form over five full sweeps:

| `dayCount` | speed (days/s) | ticks/sweep | max drift (days) | ticks where `Math.floor` disagrees |
|---|---|---|---|---|
| 1826 | 4 | 55,254 | 1.19e-9 | 0 |
| 1826 | 12 | 18,754 | 7.29e-10 | 0 |
| **1826** | **20** | **11,454** | **3.64e-10** | **9,120** |
| 2038 | 12 | 20,874 | 9.21e-10 | 0 |
| **2038** | **20** | **12,726** | **4.61e-10** | **10,180** |
| 1461 | 8 | 22,404 | 3.97e-10 | 1,020 |

At 20 days/s the incremental and closed-form cursors disagree on the **integer** day for 15.9 % of ticks (9,120 of 57,270). `20/120 = 1/6` is not representable in binary floating point; `12/120 = 0.1` happens to stay aligned. Without the per-tick anchor, `seekTick(t)` and playback-to-`t` would render different days at three of the five shipped speeds, and the failure would be invisible until a screenshot diffed.

```ts
/** Driver-owned truth. Idempotent: calling it twice with the same tick is a no-op. */
function anchorTick(tick: number): void {
  state.tick = tick;
  const day = cursorDayAtTick(mapping, tick);
  const dayInt = Math.floor(day);
  state.cursorDay = day;
  if (dayInt < state.cursorDayInt) advanceCursor(state, dayInt);   // O(1) amortized
  else if (dayInt > state.cursorDayInt) seekCursor(state, dayInt); // O(n) = 0.088 ms
  state.cursorDayInt = dayInt;
}
```

`advanceCursor` throws `RangeError` if asked to move up (KW-008), which is why the direction test is explicit. The only forward jump on the playback path is the once-per-sweep wrap, so `seekCursor` runs at most once every 18,754 ticks — about once every 156 s at 120 Hz.

### `lib/viz/driver.ts` — the public seam

```ts
import type { SimInput, SimState } from './sim/types';

export type VizCanvasId = 'graph' | 'ribbon' | 'overview';

export interface VizViewport {
  /** CSS pixels. The driver never writes canvas.width/height — KW-025 does. */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Already clamped by KW-025 to Math.min(quality.dprCap, devicePixelRatio). */
  readonly dpr: number;
}

export type VizQualityTier = 0 | 1 | 2 | 3 | 4 | 5;

/** Read ONLY by lib/viz/render/**. Never passed into lib/viz/sim/** (DEC-016 boundary). */
export interface VizQuality {
  readonly tier: VizQualityTier;
  readonly fileLabels: boolean; // tier < 1
  readonly spokes: boolean;     // tier < 2
  readonly glow: boolean;       // tier < 3  (shadowBlur)
  readonly dprCap: 1 | 2;       // tier < 4 ? 2 : 1
  readonly fileCap: number;     // tier < 5 ? 2000 : 1000
}
export function qualityForTier(tier: VizQualityTier): VizQuality;

/** Exactly what the driver hands each render module. KW-022 declares the receiving type. */
export interface VizRenderOptions {
  readonly viewport: VizViewport;
  readonly quality: VizQuality;
  readonly winStart: number;      // ribbon window, first column, day index (may be negative)
  readonly ribbonWeeks: number;   // 53
  readonly settled: boolean;      // true when this frame came from seekTick()
}

/** DETERMINISTIC BY CONSTRUCTION. No wall-clock value may ever be added to this type. */
export interface VizFrameInfo {
  readonly tick: number;
  readonly cursorDay: number;
  readonly cursorDayInt: number;
  readonly date: string;          // 'YYYY-MM-DD', from windowStartISO. Never a literal.
  readonly speedIndex: number;
  readonly playing: boolean;
  readonly reducedMotion: boolean;
  readonly settled: boolean;      // see invariant I-D4
  readonly nLive: number;
  readonly liveRepos: readonly string[];  // ascending repo id, mapped through repoNames
  readonly ghostRepos: number;
  readonly liveHash: number;      // from digestSimState()
  readonly rngState: number;      // ONE 32-bit int (DEC-016), not a 4-tuple
  readonly rngDraws: number;
  readonly winStart: number;
  readonly highlightCell: { readonly week: number; readonly weekday: number } | null;
  readonly beams: number;
  readonly drawCalls: {
    readonly graph: number; readonly ribbon: number;
    readonly overview: number; readonly total: number;
  };
  readonly qualityTier: VizQualityTier;
}

/** Non-deterministic on purpose. Never compared by a test. */
export interface VizPerfInfo {
  readonly lastFrameMs: number;
  readonly medianFrameMs: number;
  readonly framesOverBudget: number;
  readonly governorEnabled: boolean;
}

export interface VizDriverOptions {
  readonly input: SimInput;
  /** Length must equal input.repoCount. Supplied by KW-025 from KW-015's loader. */
  readonly repoNames: readonly string[];
  readonly seed: number;
  /** Test override; when omitted the driver reads and subscribes to matchMedia. */
  readonly reducedMotion?: boolean;
}

export interface VizDriver {
  readonly state: SimState;
  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void;
  setViewport(id: VizCanvasId, viewport: VizViewport): void;
  start(): void;
  stop(): void;
  play(): void;
  pause(): Promise<void>;
  setSpeedIndex(index: number): void;
  /** User scrub. Latches the ribbon window until releaseWindow(). */
  seekDay(day: number): Promise<VizFrameInfo>;
  releaseWindow(): void;
  seekTick(tick: number): Promise<VizFrameInfo>;
  seekDate(iso: string): Promise<VizFrameInfo>;
  renderFrame(steps?: number): Promise<VizFrameInfo>;
  reset(seed?: number): void;
  setQuality(q: 'high' | 'low' | 'auto'): void;
  inspect(): VizFrameInfo;
  perf(): VizPerfInfo;
  subscribe(listener: (info: VizFrameInfo) => void): () => void;
  destroy(): void;
}

export function createVizDriver(options: VizDriverOptions): VizDriver;
```

### `lib/viz/testHarness.ts` — the Playwright seam

```ts
import type { VizDriver, VizFrameInfo } from './driver';

export interface VizTestHarness {
  /** Stop the rAF loop. Idempotent. Resolves once no frame is in flight. */
  pause(): Promise<void>;
  play(): void;
  /** Reset to tick 0 with an explicit seed. Re-runs nothing: packOnce is boot-only. */
  reset(seed?: number): void;
  /** Advance `n` fixed steps from the CURRENT state, then render once. Path-dependent. */
  renderFrame(n?: number): Promise<VizFrameInfo>;
  /** The canonical settled frame at `t`. O(n), never a replay of t steps. */
  seekTick(t: number): Promise<VizFrameInfo>;
  /** seekTick for the first tick whose cursorDayInt matches `iso`. */
  seekDate(iso: string): Promise<VizFrameInfo>;
  inspect(): VizFrameInfo;
  /** 'high' pins tier 0, 'low' pins tier 5; both disable the governor. */
  setQuality(q: 'high' | 'low' | 'auto'): void;
}

declare global {
  interface Window { __viz?: VizTestHarness }
}

/** Returns an uninstall function. Sets window.__viz only when ?viz-test=1 is present. */
export function installTestHarness(driver: VizDriver): () => void;
```

The Playwright shape KW-031 will write, quoted so the driver is built to satisfy it:

```ts
await page.goto('/?viz-test=1&seed=1');
await page.waitForFunction(() => Boolean(window.__viz));
await page.evaluate(() => window.__viz!.pause());
await page.evaluate(() => window.__viz!.setQuality('high'));
const a = await page.evaluate(() => window.__viz!.seekTick(3600));
expect(a.date).toBe('2025-09-24');           // for windowStart 2021-08-01, dayCount 1826
expect(a.drawCalls.total).toBeLessThan(3000);
await expect(page.locator('#graph')).toHaveScreenshot('t3600.png', { maxDiffPixels: 0 });
const b = await page.evaluate(() => window.__viz!.seekTick(3600));
expect(b).toEqual(a);                         // idempotency
```

**Verified this session:** with `windowStartISO = '2021-08-01'` and `dayCount = 1826`, `cursorDayAtTick(m, 3600) = 1515.4`, `Math.floor` → `1515`, and `formatDayISO('2021-08-01', 1515)` → `'2025-09-24'`. `sweepTicks` is `18754`.

### Invariants

- **I-D1 — exactly one rAF owner.** `requestAnimationFrame` and `cancelAnimationFrame` appear in `lib/viz/driver.ts` and nowhere else in `app/`, `components/`, `lib/` or `e2e/`. Same for `performance.now()`. No `setTimeout`, `setInterval` or `requestIdleCallback` anywhere in `lib/viz/**` — see I-D6 for why this is not merely tidiness.
- **I-D2 — the tick is the clock.** `state.tick`, `state.cursorDay`, `state.cursorDayInt` and `state.rngState` are written only by `anchorTick` and `rngAnchor`. If `step` also writes them, `anchorTick` runs after `step` on every path and its value wins. No wall-clock quantity ever reaches `SimState`.
- **I-D3 — `seekTick(t)` is pure in `(SimInput, seed, t)`.** Two calls with the same `t` return `VizFrameInfo` values that are `toEqual`-identical, and `digestSimState(state)` is identical, regardless of what happened in between.
- **I-D4 — `seekTick(t)` and `reset() + renderFrame(t)` are each deterministic but are NOT equal, and the difference is reported.** `seekTick` produces the *settled* frame: `alpha[e] = live ? 1 : 0`, `heat[e] = live ? 0.32 : 0` (the prototype's own `settleStatic` constant, 464), `beamHead = 0` with every `beamLife` zeroed, actors snapped to their targets. Free playback additionally carries transient motion channels — beams in flight, heat accumulated from days the cursor crossed, actor easing — which are path-dependent **by design**. `VizFrameInfo.settled` says which mode produced the frame. **KW-031 must take every screenshot through `seekTick`.**
- **I-D5 — the reduced-motion path is the same code path as the test path.** Under reduce, `start()` calls `seekTick(0)` and returns without scheduling anything. `seekTick(0)` puts the cursor at `dayCount - 1`, so the live set is exactly the entities alive today — the seed set DEC-010 requires, not the accumulated final state the prototype paints. One code path means the fallback cannot rot.
- **I-D6 — no timers in the harness await path.** `page.clock.install()` fakes `Date`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback` **and** `performance` (measured, Playwright Clock docs). A harness command that awaits a `setTimeout` or an rAF therefore **deadlocks** under `page.clock.pauseAt`. The rasterization flush is the *synchronous* call `ctx.getImageData(0, 0, 1, 1)` on each attached canvas, and the returned promise is resolved through a microtask (`Promise.resolve()`), never a task.
- **I-D7 — quality never reaches the sim.** `VizQuality` is passed to `lib/viz/render/**` only. `lib/viz/sim/**` never sees it, so degradation cannot change `digestSimState` and cannot make a screenshot flaky through the back door. While the harness is installed the governor is **off by default**; `setQuality('auto')` is the only way to turn it on.
- **I-D8 — no data-domain literal.** `2021-08-01`, `1826`, `2038`, `13453`, `4817` and every contribution figure are forbidden in both files (DEC-008). `windowStartISO`, `dayCount`, `repoCount` and `entityCount` come from `SimInput`. The permitted constants are layout and timing: `53` weeks, `7` days, `185` (the prototype's window centring offset, 891), `4.2` s of dwell, and `SPEEDS`/`FIXED_DT`/`MAX_STEPS` re-exported from KW-008.
- **I-D9 — the driver is DOM-quiet.** It touches exactly three browser APIs: `requestAnimationFrame`/`cancelAnimationFrame`, `performance.now`, and `matchMedia`. It never queries the document, never reads `location` (the harness does that), never writes text content, and never creates an element. Canvas contexts arrive through `setCanvas`.

### What consumers get, and when

| Consumer | Imports | Contract note |
|---|---|---|
| KW-025 `app/regions/Instrument.tsx` | `createVizDriver`, `VizDriver`, `VizCanvasId`, `VizViewport`, `VizFrameInfo` | Owns the canvases. Calls `setCanvas` then `setViewport` on every resize, `start()` once, `destroy()` on unmount. Reads `quality.dprCap` from `subscribe` and applies it to the backing store — the driver never sets `canvas.width`. |
| KW-026 `app/regions/TransportBar.tsx` | `VizDriver`, `SPEEDS`, `VizFrameInfo` | Calls `play/pause/setSpeedIndex/seekDay/releaseWindow`. Renders `date`, `winStart` and `tick` from the `subscribe` payload. Must not add its own rAF. |
| KW-029 `components/viz/ContributionTable.tsx` | `VizFrameInfo` (type only) | The hidden table is generated from the payload, not from the driver; it consumes `date`/`highlightCell` only to mark the current cell. |
| KW-031 `e2e/canvas.spec.ts` | `window.__viz` | Must `pause()` then `setQuality('high')` before the first `seekTick`, and must assert `VizFrameInfo` **before** the screenshot. |

## Refreshable implementation notes

Re-verify against `e664d73a195facd64db58ba10952170ff01b4772` at pickup. Nothing below changes scope.

### Files to create

| Path | Exports |
|---|---|
| `lib/viz/driver.ts` | `createVizDriver`, `VizDriver`, `VizDriverOptions`, `VizCanvasId`, `VizViewport`, `VizQuality`, `VizQualityTier`, `qualityForTier`, `VizRenderOptions`, `VizFrameInfo`, `VizPerfInfo`, `DEFAULT_SPEED_INDEX`, `DWELL_TICKS`, `RIBBON_WEEKS`, `tickMapping`, `cursorDayAtTick`, `rngAnchor`, `formatDayISO`, `weekdayOfISO`, `ribbonWinStart`, `highlightCellFor` |
| `lib/viz/testHarness.ts` | `VizTestHarness`, `installTestHarness` |

No other file is created or modified. In particular: no `test/`, no `app/`, no `eslint.config.mjs`, no `package.json`.

### The frame loop, verbatim structure

```ts
const FRAME_BACKLOG_CAP = 0.25;   // s. Tab was backgrounded; do not fast-forward.

function frame(now: number): void {
  const dt = Math.min(FRAME_BACKLOG_CAP, (now - prev) / 1000);
  prev = now;
  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n < MAX_STEPS) { advance(); acc -= FIXED_DT; n++; }
  if (n === MAX_STEPS) acc = 0;   // drop the backlog, do not accumulate debt
  paint(false);
  governorSample(now);
  raf = requestAnimationFrame(frame);
}

function advance(): void {
  const t = state.tick + 1;
  state.rngState = rngAnchor(seed, t);
  state.rngDraws = 0;
  state = step(state, FIXED_DT) ?? state;   // KW-021
  anchorTick(t);                            // driver's value wins (I-D2)
}
```

`paint(settled)` builds one `VizRenderOptions`, calls `resetDrawCalls()`, then the three render modules in ascending cost order (`overview`, `ribbon`, `graph`), skipping any canvas whose context is `null`, then reads the draw-call counters and notifies subscribers. Render is never called from inside `advance()`.

### `seekTick`, exactly

```ts
async function seekTick(t: number): Promise<VizFrameInfo> {
  resetSimState(state, seed);          // KW-008: reseeds, re-seeds the cursor at dayCount-1
  anchorTick(t);
  state.rngState = rngAnchor(seed, t);
  state.rngDraws = 0;
  state = step(state, 0) ?? state;     // zero-dt recompute of derived positions
  anchorTick(t);                       // idempotent; defends against step advancing anything
  settleChannels();
  paint(true);
  flushRaster();                       // synchronous getImageData on every attached canvas
  return inspect();
}

function settleChannels(): void {
  for (let i = 0; i < state.entityCount; i++) {
    const live = state.kind[i] === ENTITY_REPO
      ? repoPhase(state, i, state.cursorDayInt) === PHASE_LIVE
      : isLive(state, i);
    state.alpha[i] = live ? 1 : 0;
    state.heat[i] = live ? SETTLED_HEAT : 0;   // SETTLED_HEAT = 0.32, prototype line 464
  }
  for (let r = 0; r < state.repoCount; r++) {
    state.repoAlpha[r] = repoPhase(state, r, state.cursorDayInt) === PHASE_ABSENT ? 0 : 1;
  }
  for (let a = 0; a < 2; a++) { state.actorX[a] = state.actorTX[a]; state.actorY[a] = state.actorTY[a]; }
  state.beamHead = 0;
  state.beamLife.fill(0);
  state.beamEnt.fill(-1);
}
```

Note what is **not** in that loop. `repoX`/`repoY` are deliberately left alone: KW-008's `SimState` carries `repoAngle`, `repoX`, `repoY`, `repoR`, `repoAlpha` and **no** repo-target arrays, because repo positions come from the deterministic sorted-index ellipse (KW-021, `cos/sin`) rather than from an easing toward a target — so there is nothing to snap. Only the two actors ease, and they have explicit `actorTX`/`actorTY` targets. The ghost **dim** for `PHASE_GHOST` repos is KW-022's, driven by `repoPhase`; the driver only distinguishes present from absent, so no invented alpha constant ships here.

### Dates and the ribbon window — a fully worked, verified algorithm

`lib/viz/sim/**` may not construct a `Date` (KW-008 invariant I-7), so all of this lives here. Everything is UTC; never call a local-time getter.

```ts
const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

export function weekdayOfISO(iso: string): number {          // 0 = Sunday
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function formatDayISO(windowStartISO: string, day: number): string {
  const [y, m, d] = windowStartISO.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + day * 86_400_000);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

export const RIBBON_WEEKS = 53;                 // layout, not data: 53 columns
const RIBBON_DAYS = RIBBON_WEEKS * 7;           // 371, the prototype's window (452)
const WINDOW_LEAD_DAYS = 185;                   // prototype line 891

/** Pure function of the cursor. NO hysteresis — see the note below. */
export function ribbonWinStart(input: SimInput, cursorDayInt: number, latched: number | null): number {
  if (latched !== null) return latched;
  const sw = weekdayOfISO(input.windowStartISO);
  const lastSunday = (input.dayCount - 1) - (((input.dayCount - 1 + sw) % 7) + 7) % 7;
  const minStart = -sw;                                   // column 0 is always a Sunday
  const maxStart = Math.max(minStart, lastSunday - 7 * (RIBBON_WEEKS - 1));
  let c = cursorDayInt - WINDOW_LEAD_DAYS;
  if (c > maxStart) c = maxStart;
  if (c < minStart) c = minStart;
  c -= (((c + sw) % 7) + 7) % 7;                           // snap down to a Sunday
  return (c < minStart ? minStart : c) | 0;                // `| 0` normalises -0 to 0
}

export function highlightCellFor(input: SimInput, cursorDayInt: number, winStart: number) {
  const sw = weekdayOfISO(input.windowStartISO);
  const week = Math.floor((cursorDayInt - winStart) / 7);
  const weekday = (((cursorDayInt + sw) % 7) + 7) % 7;
  return week >= 0 && week < RIBBON_WEEKS ? { week, weekday } : null;
}
```

Three details that were measured, not guessed:

1. **The prototype's `> 3` hysteresis (892) is deleted.** It makes `winStart` depend on the *path* the cursor took, which breaks I-D3 outright: `seekTick(t)` and playback-to-`t` would disagree on the ribbon window. Recomputing a clamp per frame is free.
2. **The window must be snapped to a Sunday column, and `maxStart` must be derived from the last Sunday**, not from `dayCount - RIBBON_DAYS`. Verified this session: the naive `maxStart = dayCount - 371` produces `week === 53` (out of range) for the last **6** days of a 1,826-day window. The algorithm above was swept over every day of four configurations — `('2021-08-01', 1826)`, `('2021-08-03', 1826)` (a Tuesday start), `('2021-08-01', 2038)` and `('2026-01-01', 100)` (a window shorter than the ribbon) — and produced **0** out-of-range or null cells in all four.
3. **`| 0` on the return value.** With a Sunday `windowStartISO`, `-sw` evaluates to `-0`. `JSON.stringify(-0)` is `"0"` but Vitest's `toEqual` distinguishes `-0` from `0`, so an unnormalised `-0` would make the idempotency assertion fail for a reason that has nothing to do with the driver.

### Reduced motion

```ts
const REDUCE = '(prefers-reduced-motion: reduce)';
const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia(REDUCE) : null;

let reducedMotion = options.reducedMotion ?? (mq?.matches ?? false);
const onChange = (e: MediaQueryListEvent) => {
  reducedMotion = e.matches;
  if (reducedMotion) { stop(); void seekTick(0); }
  else if (running) { prev = performance.now(); acc = 0; raf = requestAnimationFrame(frame); }
};
mq?.addEventListener('change', onChange);   // destroy() removes it
```

`start()` under reduce calls `seekTick(0)` and returns **without** calling `requestAnimationFrame`. Playback controls stay enabled (viz-runtime §9.1: reduced motion is a default, not a prohibition) — a user who presses Play in KW-026 gets `play()`, which starts the loop even under reduce. Only the *automatic* start is suppressed. The driver emits no log lines on this path, so the prototype's two animated `pushLog` calls (467–468) do not recur.

### The harness gate

```ts
// lib/viz/driver.ts, at the end of createVizDriver()
const HARNESS_BUILD =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_TEST_HOOKS === '1';
if (HARNESS_BUILD) {
  void import('./testHarness').then((m) => { uninstallHarness = m.installTestHarness(driver); });
}
```

```ts
// lib/viz/testHarness.ts
export function installTestHarness(driver: VizDriver): () => void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('viz-test') !== '1') return () => {};
  const seed = params.get('seed');
  if (seed !== null) driver.reset(Number(seed));
  driver.setQuality('high');            // governor off: degradation must not flake screenshots
  window.__viz = { /* … */ };
  return () => { delete window.__viz; };
}
```

`NEXT_PUBLIC_TEST_HOOKS` is **not invented here** — it is the gate the ci-testing track already specified (§5.3) and already sets in the e2e workflow and in `playwright.config.ts`'s `webServer.env`. Reuse the name; do not add a second variable. Two gates, deliberately: the build gate keeps the module out of the production bundle, and the `?viz-test=1` gate keeps `window.__viz` undefined even in a CI build that a human happens to open. The `import()` must be dynamic — a static import puts the harness in the main chunk regardless of the branch.

### Rasterization flush

```ts
function flushRaster(): void {
  for (const ctx of attachedContexts()) {
    // Chromium defers canvas commands. Without this read, a screenshot taken after the
    // await can show the PREVIOUS frame. Measured: an entire viz-runtime benchmark round
    // reported 0.0000 ms for every entry until a flush was added.
    ctx.getImageData(0, 0, 1, 1);
  }
}
```

Synchronous, and therefore safe under `page.clock`. Do not wrap it in `setTimeout`, `requestAnimationFrame` or `requestIdleCallback` (I-D6). Every harness method returns `Promise.resolve(inspect())` after the flush so the Playwright `await` is a microtask.

### The quality governor

Sample `performance.now()` deltas into a 60-entry ring buffer. When the rolling **median** exceeds 12 ms for 30 consecutive frames, step the tier up by one (max 5) and clear the counter. The ladder is viz-runtime §7.3's, in order: drop file labels, drop spokes, drop `shadowBlur`, drop the DPR cap to 1, halve the file cap from 2,000 to 1,000. **It never steps back down automatically** — oscillation between tiers is worse than a permanently conservative frame, and `setQuality('high')` is the explicit way back. The governor is disabled whenever the harness is installed and whenever `setQuality` has been called with `'high'` or `'low'`.

### Verifying determinism before commit

There is no committed test in this ticket's write surface. Create `test/viz/driver.tmp.test.ts`, run it, and **delete it before committing** — the same pattern KW-008 uses for its deliberate-ESLint-violation fixture. `vitest@4.1.10` is installed by KW-001 and its default `include` glob (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) and default `node` environment are sufficient; do not add a config file.

```ts
// test/viz/driver.tmp.test.ts — TEMPORARY. Delete before commit.
import { describe, expect, it, vi } from 'vitest';
import { createVizDriver, rngAnchor, cursorDayAtTick, tickMapping, formatDayISO } from '../../lib/viz/driver';
import { seedRng, nextRng } from '../../lib/viz/sim/rng';

// Minimal fake 2D context: records method names, satisfies the raster flush.
function fakeCtx() {
  const calls: string[] = [];
  return new Proxy({} as CanvasRenderingContext2D, {
    get(_t, k: string) {
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (k === 'canvas') return { width: 1280, height: 720 };
      return (...a: unknown[]) => { calls.push(k + '(' + a.join(',') + ')'); };
    },
    set() { return true; },
  });
}

describe('driver determinism', () => {
  it('rngAnchor equals n-fold nextRng', () => {
    let s = seedRng(12345);
    for (let n = 1; n <= 5000; n++) { s = nextRng(s); expect(rngAnchor(12345, n)).toBe(s); }
  });

  it('seekTick is idempotent and path-independent', async () => {
    const d = createVizDriver({ input: FIXTURE, repoNames: NAMES, seed: 1 });
    d.setCanvas('graph', fakeCtx()); d.setCanvas('ribbon', fakeCtx()); d.setCanvas('overview', fakeCtx());
    const a = await d.seekTick(3600);
    await d.seekTick(17);                     // a completely different tick in between
    const b = await d.seekTick(3600);
    expect(b).toEqual(a);
  });

  it('never schedules rAF under reduced motion', async () => {
    const raf = vi.fn(); vi.stubGlobal('requestAnimationFrame', raf);
    const d = createVizDriver({ input: FIXTURE, repoNames: NAMES, seed: 1, reducedMotion: true });
    d.setCanvas('graph', fakeCtx());
    d.start();
    expect(raf).not.toHaveBeenCalled();
    expect(d.inspect().cursorDayInt).toBe(FIXTURE.dayCount - 1);   // the seed set, today
  });
});
```

`FIXTURE` is a small `SimInput` built in the test file with typed arrays — 3 repos, ~40 files, a 400-day window, a `windowStartISO` chosen so the weekday is **not** Sunday (that is the case the ribbon snap gets wrong if implemented naively). Do not reuse KW-008's fixtures; they live in files this ticket must not touch.

### Version pins

Nothing is installed. `typescript@5.9.3`, `eslint@9.39.5`, `vitest@4.1.10`, `next@16.2.12`, `react@19.2.8` and `@playwright/test@1.62.1` are all installed by KW-001 and all confirmed to exist on the registry this session (`npm view <pkg>@<version> version`). `package.json` and `package-lock.json` are frozen (DEC-003).

## Acceptance and verification

### Agent gate

- `npx tsc --noEmit` exits 0.
- `npx eslint lib/viz/driver.ts lib/viz/testHarness.ts` exits 0.
- `grep -rlE '\brequestAnimationFrame\b' app components lib e2e --include='*.ts' --include='*.tsx'` prints exactly one path, `lib/viz/driver.ts`; the same command for `cancelAnimationFrame` and for `performance\.now` also prints exactly `lib/viz/driver.ts`.
- `grep -nE 'setTimeout|setInterval|requestIdleCallback' lib/viz` is empty.
- `grep -nE '\b(2021-08-01|1826|2038|13453|4817|09:41)\b' lib/viz/driver.ts lib/viz/testHarness.ts` is empty (DEC-008).
- `rngAnchor(12345, n)` equals *n*-fold `nextRng` from `seedRng(12345)` for `n` in `1..5000`.
- `seekTick(3600)` called twice, with `seekTick(17)` in between, returns `VizFrameInfo` values that are deeply equal, and `digestSimState(driver.state)` is identical for both — proving path independence, not just repeatability.
- `VizFrameInfo` contains no key whose value derives from `performance.now()`, `Date.now()` or `new Date()` without an argument; every timing value is reachable only through `driver.perf()`.
- With `reducedMotion: true`, `start()` calls a stubbed `requestAnimationFrame` **zero** times, exactly one `paint` occurs, and `inspect().cursorDayInt === input.dayCount - 1` — the entities alive today, not the accumulated final state (DEC-010).
- A `matchMedia` stub that fires `change` with `matches: true` while the loop is running causes `cancelAnimationFrame` to be called and one static frame to be rendered; firing it again with `matches: false` resumes scheduling.
- `ribbonWinStart` and `highlightCellFor`, swept over every day of at least three `SimInput` configurations including one whose `windowStartISO` is not a Sunday and one whose `dayCount` is smaller than 371, return a `week` in `[0, 53)` for every day and never `null`.
- `npx vitest run test/viz/driver.tmp.test.ts` is green, and the file is deleted before the commit.
- `NEXT_PUBLIC_TEST_HOOKS` unset, `npm run build`, then `grep -rl '__viz' .next/static` prints nothing. If the toolchain declines to fold the branch, the fallback proof is that a plain `/` load requests no chunk containing `__viz` and `window.__viz` is `undefined`.
- With `NEXT_PUBLIC_TEST_HOOKS=1` and `npm run build && npm run start`, loading `/` leaves `window.__viz` undefined and loading `/?viz-test=1` defines it with all eight methods.

### At-merge gate

- `ci-ok` is green on the exact PR head commit.
- The PR diff adds exactly two files, `lib/viz/driver.ts` and `lib/viz/testHarness.ts`, and modifies none. `package.json`, `package-lock.json`, `eslint.config.mjs` and every file under `lib/viz/sim/`, `lib/viz/render/`, `app/` and `e2e/` are untouched.
- No file under `lib/viz/` imports from `lib/bundle/**`, `react`, `next`, or any component directory.
- `lib/viz/driver.ts` does not read `document`, `location`, `navigator` or `window.innerWidth`; the only `window` members it touches are `requestAnimationFrame`, `cancelAnimationFrame`, `matchMedia` and `performance` (I-D9). `location.search` is read only in `lib/viz/testHarness.ts`.
- Any divergence between the render/budget symbol names assumed here and the names KW-022 actually merged is resolved at the driver's import site, with the corrected names noted in the PR body. No file under `lib/viz/render/` appears in the diff.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure modes and required behaviour**

- **A canvas context is missing or was lost.** `setCanvas(id, null)` is legal and means "skip this canvas". `paint` skips null contexts, and `drawCalls` reports 0 for them rather than throwing. A `webglcontextlost`-style loss on a 2D context surfaces as `getImageData` throwing; catch it in `flushRaster`, drop that context to `null`, and keep the other two rendering. A dead ribbon must not take down the graph.
- **`repoNames.length !== input.repoCount`.** Throw `RangeError` from `createVizDriver` with both lengths in the message. Silently short-mapping produces a `liveRepos` array with `undefined` holes, which would poison every KW-031 baseline in a way that reads as a rendering bug.
- **`step` or a render module throws.** Catch at the frame boundary, call `stop()`, record the error on the driver handle, and notify subscribers once with the last good `VizFrameInfo`. A throwing rAF callback that is re-scheduled anyway produces an error every 16 ms and an unusable console; a driver that halts leaves a correct static frame on screen.
- **`MAX_STEPS` saturation.** When the accumulator asks for more than `MAX_STEPS` catch-up steps the backlog is dropped (`acc = 0`), never carried. Carrying it is the spiral of death: each frame falls further behind and asks for more steps.
- **Backgrounded tab.** `dt` is clamped to 0.25 s before it reaches the accumulator, so returning to a tab after ten minutes advances 30 ticks, not 72,000.
- **`?seed=` is hostile.** `seedRng` (KW-008) coerces with `>>> 0` and maps non-finite input to 0, so `?seed=NaN`, `?seed=1e400` and `?seed=%00` all produce a valid 32-bit state. `Number(null)` is 0, which is also valid.
- **`seekTick` with a huge or negative tick.** `cursorDayAtTick` is periodic and defined for every integer, including negatives, so `seekTick(-1)` and `seekTick(1e9)` return valid frames. Reject only non-integers and non-finite values with `RangeError`; `Math.floor` of a fractional tick would silently alias two ticks to one frame.
- **`seekDate` for a date outside the window.** Return `null`-free behaviour by clamping to `[0, dayCount - 1]` and reporting the clamped `date` in the returned `VizFrameInfo`, so a test that asks for a date the payload does not cover fails on the assertion rather than on an exception with no context.
- **The governor fires during a screenshot run.** Cannot happen: the harness disables it at install. If a test needs the governor, it must ask for it with `setQuality('auto')` and accept that draw counts vary.

**Security.** No network, no filesystem, no secrets, no `eval`, no dynamic `import()` of a computed specifier — the one dynamic import has a literal path. The only externally-controlled inputs are the `?viz-test=1` and `?seed=` query parameters, both read through `URLSearchParams` and both numerically coerced. `window.__viz` is a deliberate global, which is why it carries two independent gates: without `?viz-test=1` it is never defined, and without the build flag the module is never even downloaded. It exposes read and playback control over a public animation only — no data the page has not already fetched, no privileged API.

**Migration.** None. Both files are new. The prototype at `docs/design/kevinweaver.dev.dc.html` is a read-only port source. No persisted state, no schema version, no stored user preference — `prefers-reduced-motion` is read live from the OS, never cached.

**Accessibility.** This ticket owns the mechanism behind two conformance claims KW-029 later verifies from the outside. (a) **WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide)**: under `prefers-reduced-motion: reduce` no animation frame is ever scheduled, so there is nothing to pause; and the media query is subscribed rather than sampled once, closing design-comp-spec §9.6 hole 1. (b) **The static frame is the *correct* frame**: `seekTick(0)` renders the entities alive today (DEC-010's seed set), not the prototype's accumulated end state, so the accessible text alternative KW-029 generates from `repoPhase`/`liveIdsAscending` and the pixels on the canvas describe the same instant. Two obligations are deliberately **not** taken here and are called out so they are not lost: the tmux wall clock must tick independently of this driver (KW-018), and the canvases' `role`/`aria-label`/`tabindex` and the hidden table belong to KW-025 and KW-029. The driver renders no text and owns no focusable element.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/research/2026-07-31-viz-runtime.md, docs/research/2026-07-31-ci-testing.md, docs/research/2026-07-31-design-comp-spec.md, docs/research/2026-07-31-decomposition-synthesis.md, lib/viz/sim/types.ts, lib/viz/sim/rng.ts, lib/viz/sim/cursor.ts, lib/viz/sim/state.ts, lib/viz/sim/step.ts, lib/viz/sim/layout.ts, lib/viz/render/graph.ts, lib/viz/render/ribbon.ts, lib/viz/render/overview.ts, lib/viz/render/budget.ts, package.json, tsconfig.json
- Writes: lib/viz/driver.ts, lib/viz/testHarness.ts
- Contracts: lib/viz/driver.ts#createVizDriver, lib/viz/driver.ts#VizDriver, lib/viz/driver.ts#VizFrameInfo, lib/viz/driver.ts#VizQuality, lib/viz/driver.ts#VizRenderOptions, lib/viz/driver.ts#cursorDayAtTick, lib/viz/driver.ts#rngAnchor, lib/viz/testHarness.ts#VizTestHarness
- Safety: lib/viz/driver.ts#single-raf-owner, lib/viz/testHarness.ts#window-viz-global

## Sibling boundaries and open gates

**Same wave (phase 4).** KW-027 (SEO, metadata, OG image) and KW-028 (daily data workflow) share this wave. Neither touches `lib/viz/**` and this ticket touches neither `app/` nor `.github/workflows/`. There are no `serializes_with` edges anywhere in this Build Order (DEC-005).

**Upstream, must be merged before pickup.**

| Ticket | Owns | What KW-024 consumes |
|---|---|---|
| KW-021 | `lib/viz/sim/step.ts`, `lib/viz/sim/layout.ts`, `test/viz/step.test.ts` | `step` and `packOnce`. `packOnce` is called once at construction; `step` once per fixed step. Do not create, stub or edit either file. |
| KW-022 | `lib/viz/render/{graph,ribbon,overview,cluster,budget}.ts` | the three render entry points and the draw-call instrument. Read the merged files for the real export names before writing the imports. |
| KW-008 (transitively, via both) | `lib/viz/sim/{types,rng,cursor,state}.ts` | the whole type surface, `advanceCursor`/`seekCursor`/`repoPhase`/`isLive`/`liveIdsAscending`, `resetSimState`, `digestSimState`, `nextRng`, `seedRng`. |

**If KW-021 or KW-022 is unmerged when this is picked up: do not start.** The driver is almost entirely calls into those two modules; writing it against invented stubs means writing it twice, and the second pass is the one that has to discover which of the invented signatures were wrong. The dependency is hard, not advisory.

**Downstream, blocked on this ticket.**

| Ticket | Owns | What it consumes |
|---|---|---|
| KW-025 | `app/regions/Instrument.tsx`, `components/viz/{Overview,Ribbon,Gource}.tsx` | `createVizDriver`, `setCanvas`, `setViewport`, `subscribe`, `destroy`, and `quality.dprCap`. It also builds the `SimInput` from KW-015's loader — that adapter is **its** work, not this ticket's. |
| KW-026 | `app/regions/TransportBar.tsx` | `play`, `pause`, `setSpeedIndex`, `seekDay`, `releaseWindow`, and the `VizFrameInfo` fields `date`, `tick`, `winStart`, `playing`, `speedIndex`. |
| KW-031 | `e2e/canvas.spec.ts`, `e2e/__screenshots__/**` | `window.__viz`. Its bit-identical double-render canary is the committed regression test for I-D3, which is why this ticket ships none. |

**Two cross-ticket notes that will otherwise be lost.**

1. **KW-018 must not port the prototype's scroll rAF (line 508).** Invariant I-D1 says `requestAnimationFrame` appears in exactly one file, and KW-018 does not depend on KW-024, so nothing orders these two tickets. The scroll-position sync belongs in CSS (`scroll-behavior`, `:target`) or an `IntersectionObserver`, not in a rAF.
2. **KW-018 owns the tmux wall clock, and it must not be driven by this driver.** design-comp-spec §9.6 hole 2 is that `tickClock()` lives inside the animation loop (line 899) and therefore freezes at the markup literal `09:41` (line 180) under reduced motion. The fix named there is a 30 s `setInterval` in the bar component that runs in both modes. This driver deliberately schedules no clock update, which is the half of the fix KW-024 can enforce.

**Open gates.** None block this ticket. `GATE-002` (`workflow` scope on the push credential) blocks KW-001, KW-023, KW-028 and KW-031 at push time; `GATE-003` (SSO-authorized `CONTRIB_TOKEN`) affects the data pipeline. Neither touches `lib/viz/**`, and this ticket runs entirely on fixtures. Pick it up as soon as KW-021 and KW-022 have both merged.
