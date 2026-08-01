# KW-022 — Viz render modules: graph / ribbon / overview

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 4 — Three canvases share one projection model, one colour pipeline and one budget instrument; splitting them would create three tickets that must agree on an unreviewed interface.

**Risk:** High — the widest single write surface in the viz lane, on the critical path, and GT-14 measured that the fleet gives complexity 4 no elevated turn budget (`max_turns_by_complexity` defines only 1/2/3 → 4/8/12, fallback `max_turns: 12`). Expect to need the full budget; do not start it in parallel with anything else.

**Phase hint:** 3

**Depends on:** KW-008, KW-007

**Serializes with:** none

**Requirements:** REQ-002, REQ-005, REQ-006, REQ-007

**Decisions:** DEC-003, DEC-005, DEC-008, DEC-009, DEC-010, DEC-011, DEC-016

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/viz/render/` contains three pure canvas painters — the reverse-Gource graph, the detail contribution ribbon and the five-year overview strip — plus the private-repo cluster and the frame-budget instrument they share. Each painter is a deterministic function of its inputs: called twice with the same state it emits a byte-identical draw-command sequence. The instrument proves on every frame that the `ctx.filter`, blit-alignment and cost invariants held. The ribbon's cells are square at every viewport width, which the prototype's geometry is not.

## Context and evidence

The design prototype at `docs/design/kevinweaver.dev.dc.html` (1,033 lines, verified at the researched commit) paints all three canvases inside one React class. This ticket ports that paint code into pure modules, fixing four measured defects on the way. Line numbers were re-derived against that commit (**C-30**):

| Prototype method | Lines (re-measured this session) | Becomes |
|---|---|---|
| `drawGraph` | 705–869 | `lib/viz/render/graph.ts` + `lib/viz/render/cluster.ts` |
| `drawRibbon` | 571–634 | `lib/viz/render/ribbon.ts` |
| `drawOverview` | 537–568 | `lib/viz/render/overview.ts` |
| `drawGame` | 637–684, call site 633 | **nothing — deleted, never ported** (KW-026 owns the deletion audit) |
| `sizeAll` DPR clamp | 520–521 | `DPR_CAP` in `lib/viz/render/budget.ts` |
| `hover` arithmetic hit-test | 686 | `ribbonHitTest` in `lib/viz/render/ribbon.ts` |

GT-13's ranges (`drawGraph` 705–903, `drawRibbon` 571–636, `drawOverview` 537–570) name the correct **start** lines only; trust the end lines in the table, which were measured directly.

**Defect 1 — `ctx.filter` is a per-draw-call cliff (C-25, corrected).** The rule is **at most one draw call while `ctx.filter` is set**, not the viz-runtime track's "never let `ctx.filter` near a path draw" (refuted by its own verifier). At 1280×720: 60 separate filtered arc `fill()` calls 345.26 ms against the same 60 arcs as one path with one `fill()` at 8.36 ms (41× cheaper), and one filtered full-canvas `fillRect` at 6.14 ms — ≈5.4–6.1 ms per filtered draw call, since Chromium runs a full canvas-sized filter pass per primitive drawn under the filter. 8.36 ms is half a frame, so nothing is filtered per frame.

**Defect 2 — the blit rule was justified by the wrong mechanism (C-25, corrected).** Decomposed, 300 px tile onto 1280×720: baseline integer-position `drawImage` 0.0218 ms; `+ save/restore` 0.0270 (**+0.005**); `+ translate` 0.0230 (+0.001); `+ globalAlpha` 0.0436 (+0.022); **`+ rotate 0.1 rad` 0.4268 (+0.405)**; **at (400.5, 200.5) 0.1819 (+0.160)**. It is the pixels, not the "transform/state machinery" the original 21×-regression rule blamed. **Corrected rule: blit axis-aligned at integer coordinates; `save`/`restore`/`translate` are free and must not be banned.**

**Defect 3 — the ribbon's gutters are anisotropic.** `drawRibbon` computes `cw = (W - left) / weeks` and `cell = Math.min(cw - 2.5, (H - top - 14) / 7 - 2.5)`, then advances `x` by `cw` but `y` by `step = cell + 2.5`. At `W = 1198` and the comp's fixed `H = 140`: `cw = 22.075`, `cell = 12.643`, a **9.43 px** horizontal gutter against **2.5 px** vertical — columns of dashes rather than a lattice. The crossover is `W ≥ 830 px`, so it is desktop-only and invisible on a phone. Fix: advance both axes by `cell + gap`, centre the block, and grow the ribbon box from `140px` to `clamp(120px, 20vh, 200px)`.

**Defect 4 — the Gource projection's dead margins are absolute.** `drawGraph` bakes `const P = (r) => ({ x: 40 + r.px * (W - 80), y: 34 + r.py * (H - 74) })`. At the ≤720 px breakpoint the comp forces `.kw-graph{height:340px}` (line 44) — 74/340 = **21.8 % of the canvas height is padding**. The forced heights also pin `ry` to its `0.38` cap while `rx` stays at `0.42`, flattening the repo ring until labels collide. Re-derive as `clamp(16px, 4%, 40px)` on each axis, and render a reduced repo set below 1080 px.

Further facts, with all timings Chromium SwiftShader software raster — the pessimistic bound, taken with a forced `ctx.getImageData(0, 0, 1, 1)` flush, since Chromium defers canvas commands and reports 0.0000 ms without one. **Two canvases, not one:** 261 week-columns × (11 px cell + 2 px gap) = `3,393 px`, wider than any laptop (the comp ships both: overview line 76, ribbon 83, graph 97). **Canvas, not DOM (C-26, corrected, DEC-011)** for the O(1) hit-test against 1,826 event targets and `shadowBlur` at `lv >= 8`, not for cost: DOM highlight-move measured 0.0205 ms against 0.0227 ms for the canvas blit + highlight, while a cached-bitmap blit + one `strokeRect` costs 0.0225 ms against 0.338 ms of per-cell `fillStyle`. **Scale (C-27):** 13,453 unique paths across 51 repos, not 7,354 / ~20; `Max repo circles 24` → ~56. **Colour (DEC-009):** the gruvbox ramp hits `--green-d` at level 6 and `--green` at level 7 exactly; KW-007 owns it. **Lifespan (DEC-010):** `birth <= T <= death` replaces the prototype's `if (!f.seen) return;` accumulation, ended repositories becoming ghost outlines via `repoPhase`. **Determinism (DEC-016):** jitter from `randomHash(a, b)`, never `nextRng`/`rngValue`, or replay desynchronises and KW-031's baselines die.

Requirements this ticket carries:

- **REQ-002** — design fidelity: the instrument pane reproduces the comp's geometry and colour channels at 1560 px, with the four measured geometry defects corrected rather than transcribed.
- **REQ-005** — reverse playback with honest lifespan semantics: entities appear as the cursor walks back into their era and disappear once it passes below their birth; ended repositories render as ghosts rather than vanishing.
- **REQ-006** — the client runtime is deterministic and testable: the same inputs produce the same frame, so CI can assert draw-command sequences before pixels.
- **REQ-007** — wherever colour carries meaning the encoding survives greyscale and common colour-vision deficiencies; every colour channel is paired with a non-colour channel (partial-height fill for actor share, dashed ring plus hatch for private, stroke weight plus dash for actor).

Plan context, pinned to the planning commit `e664d73a195facd64db58ba10952170ff01b4772` (`https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/`):

- `docs/build-orders/site-rewrite/README.md` — pack index and the `KW-01..KW-32` → `KW-001..KW-032` zero-padding map.
- `docs/research/2026-07-31-decomposition-synthesis.md` — §3 decisions `D-01..D-17` (published `DEC-001..DEC-017`); §4 gates `HG-1..HG-7` (published `GATE-001..GATE-007`); §5 wave 3, entry "KW-22", this ticket's implementation pointers; §6 waves, topological levels, critical path, write-surface partition proof.
- `docs/research/2026-07-31-viz-runtime.md` — §3–§7 grid tiers, ramp, cached-bitmap decision, sprites, the `ctx.filter` trap, the full performance budget; §9 the accessibility surface canvas cannot provide; "Verification corrections" C1, C2, C5, C6, C7, which override that document on the filter rule, blit rule, DOM node count and corpus scale.
- `docs/research/2026-07-31-design-comp-spec.md` — §6.1, §6.2, §6.4 ribbon geometry, the anisotropic-gutter bug, Gource pane geometry and ring layout, encoded channels.

## Scope

- Create `lib/viz/render/budget.ts`: the shared types, the quality ladder, `DPR_CAP`, the unit-cost table, the recording/enforcing context Proxy and `FrameReport`.
- Create `lib/viz/render/graph.ts`: the reverse-Gource painter — projection with `clamp(16px, 4%, 40px)` margins, repo ring, ghost outlines, file satellites and spokes, beams, actor sprites, and the 27×31 ASCII sprite data with its gruvbox palette map.
- Create `lib/viz/render/ribbon.ts`: the detail ribbon — integer device-pixel geometry with isotropic gutters, a cached offscreen bitmap, the playhead column wash plus hairline, weekday and month chrome, the agent birth rule, and the arithmetic hit-test.
- Create `lib/viz/render/overview.ts`: the five-year strip — cached bitmap, year rules and labels, the window brush, the birth rule, the playhead hairline.
- Create `lib/viz/render/cluster.ts`: the private-repo cluster — build the blurred tile under exactly one filtered draw call, blit it axis-aligned at integer coordinates, feature-detect `ctx.filter`, fall back to hatch.
- Correct the four measured geometry defects: anisotropic ribbon gutters, absolute Gource dead margins, the `ry`/`rx` cap flattening below 1080 px, and the uncapped per-frame `shadowBlur` and `fillText` counts.
- Instrument every frame and make the `ctx.filter`, blit-alignment, draw-call and cost invariants throw in development and test builds.
- Declare `GridSeries` and `RenderMeta` locally, so the renderer does not depend on the bundle codec.

## Non-goals

- No `requestAnimationFrame`, accumulator, clock, `matchMedia` or `?viz-test=1` harness; `lib/viz/driver.ts` and `lib/viz/testHarness.ts` are KW-024's, and exactly one file in the repository may call rAF.
- No simulation: `lib/viz/sim/step.ts` and `lib/viz/sim/layout.ts` are KW-021's. Never advance `tick`, `cursorDay`, `alpha`, `heat`, `beamLife`, `repoX/repoY` or the RNG.
- No changes to `lib/viz/sim/**` or `eslint.config.mjs`; both are KW-008's write surface.
- No colour data: `lib/viz/tokens/ramp.ts` and `lib/viz/tokens/level.ts` are KW-007's, imported read-only.
- No React, JSX, `ResizeObserver`, `<canvas>` creation, pointer or keyboard handlers; `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx` are KW-025's.
- No transport controls, no `drawGame` port, no Bomberman residue to delete later; KW-026 owns the transport bar and audits this directory for game residue.
- No visually-hidden `<table>`, `aria-label` generation or `role="img"`; DEC-011's text alternative is `components/viz/ContributionTable.tsx`, KW-029's.
- No `vitest.config.mts`, `test/setup.dom.ts` or `test/canvas-recorder.ts`; those are KW-011's, and this ticket does not depend on KW-011.
- No committed test file. The enforcement this ticket owns is the always-on instrument in `budget.ts`; the CI assertions consuming it belong to KW-024, KW-029, KW-031.
- No dependency and no npm script added: `package.json` and `package-lock.json` are frozen after KW-001 (DEC-003).
- No `public/data/**`, no `lib/bundle/**` import, no fetch, no network access of any kind.
- No screenshot baselines and no `e2e/**`; KW-031 owns visual regression.

## Existing owner and reuse target

`lib/viz/render/` **does not exist at the researched commit** — `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772` lists no `lib/` path at all. This ticket creates the directory; there is no module to extend, so the reuse targets are upstream contracts and the prototype:

| Reuse target | Status at the researched commit | Who creates it |
|---|---|---|
| `docs/design/kevinweaver.dev.dc.html` | **Present**, 1,033 lines. Port source for geometry, colour channels, draw ordering. | committed |
| `public/images/kevin.png` | **Present**, 2,325 bytes, 270×310 8-bit RGBA (IHDR `0x0000010E × 0x00000136`). Sprite extraction source. | committed |
| `lib/viz/sim/types.ts` (`SimState`, `PHASE_ABSENT`/`PHASE_LIVE`/`PHASE_GHOST`, `RepoPhase`, `MAX_BEAMS`), `lib/viz/sim/cursor.ts` (`liveIdsAscending`, `repoPhase`, `isLive`), `lib/viz/sim/rng.ts` (`randomHash`) | absent | **KW-008** (hard dependency) |
| `lib/viz/tokens/ramp.ts` (`LV`, `AG`, `AG_SEMANTIC_MAX`, `PANE_SURFACE`, `rampColor`, `agentColor`), `lib/viz/tokens/level.ts` (`Level`, `level`, `bandLabel`, `BAND_LABELS`) | absent | **KW-007** (hard dependency) |
| `tsconfig.json`, `eslint.config.mjs`, `next@16.2.12`, `typescript`, `vitest@4.1.10` | absent (tree is Next 10 / `.eslintrc.js` / `yarn.lock`) | **KW-001**, transitively |

Do not stub either dependency: if `lib/viz/sim/types.ts` or `lib/viz/tokens/ramp.ts` is missing at pickup, the dependency graph has been violated — stop and report it rather than writing a local copy of `SimState`, the exact drift the contract/implementation split exists to prevent.

## Contract and invariants

This ticket is a **producer** for KW-024 (driver), KW-025 (instrument pane) and KW-029 (accessibility gate), and a **consumer** of KW-008 and KW-007, whose sketches it quotes verbatim below alongside the surface it publishes.

### What this ticket consumes, verbatim from KW-008

```ts
// from lib/viz/sim/types.ts — READ ONLY. Never widened, never re-declared here.
export const PHASE_ABSENT = 0; // cursor is earlier than birth: it did not exist yet
export const PHASE_LIVE = 1;   // birth <= cursor <= death
export const PHASE_GHOST = 2;  // cursor is later than death: dimmed outline (DEC-010)

// from lib/viz/sim/cursor.ts
export function repoPhase(state: SimState, repoId: number, day: number): RepoPhase;
export function isLive(state: SimState, id: number): boolean;
export function liveIdsAscending(state: SimState, out: Int32Array): number;

// from lib/viz/sim/rng.ts
export function randomHash(a: number, b: number): number;
```

The exact `SimState` fields this directory reads, and nothing else: `tick`, `cursorDay`, `cursorDayInt`, `entityCount`, `repoCount`, `dayCount`, `kind`, `repoOf`, `birth`, `death`, `alpha`, `heat`, `px`, `py`, `pr`, `repoAngle`, `repoX`, `repoY`, `repoR`, `repoAlpha`, `actorX`, `actorY`, `beamEnt`, `beamActor`, `beamKind`, `beamLife`, `beamHead`.

Everything the sim writes is in **unit space**. KW-021's producer contract fixes these four readings:

- **`repoAngle[i]` is radians** on a viewport-independent unit circle. Never re-derive the arc allocation; read the angle only to decide which side of a repo disc the label sits on (the prototype's `r.ang0`).
- **`repoX[i]`, `repoY[i]` are normalized `[0, 1]` of the canvas box**, easing toward `RING = { cx: 0.5, cy: 0.46, rx: 0.42, ry: 0.38, phase: 0.55 }`. The `0.46` vertical centre is the prototype's, not a typo for `0.5`.
- **`px[e]`, `py[e]` are `[-1, 1]` relative to the owning repo's unit disc** (centre `0,0`, radius `1`), and `pr[e]` is the file radius in those same units — **not** field coordinates. A file's field position is the repo's projected centre plus `(px, py)` scaled by the repo's projected disc radius.
- **`repoR[i]` is the `packEnclose` result in file-radius units**, not pixels. `graphProjection` returns `repoRadiusScale`; a repo disc radius in device pixels is `state.repoR[i] * proj.repoRadiusScale`, a file dot radius `state.pr[e] * state.repoR[i] * proj.repoRadiusScale`.

Projection to device pixels is this ticket's job and nobody else's. If KW-021 changes any of the four, the fix goes in `graphProjection` — never by re-deriving positions here.

### What this ticket consumes, verbatim from KW-007

```ts
// from lib/viz/tokens/ramp.ts — READ ONLY.
export const PANE_SURFACE: '#1d2021';
export const LV: readonly [
  '#3c3836', '#404a2b', '#4d5b21', '#5e6a1f', '#70791d',
  '#83881b', '#98971a', '#b8bb26', '#d9d34a', '#faeb77',
];
export const AG: readonly [
  '#3c3836', '#5a3b43', '#764251', '#8b4c5f', '#a1586d',
  '#b6637c', '#cc708b', '#f98cac', '#ffa6c6', '#ffc5e1',
];
export const AG_SEMANTIC_MAX: 6;
export function rampColor(value: Level): string;
export function agentColor(value: Level): string;

// from lib/viz/tokens/level.ts — READ ONLY.
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export function level(count: number): Level;
export function bandLabel(value: Level): string;
```

`AG` is **animation only** (C-6): it appears in the graph's actor tokens and the ribbon's partial-height agent share indicator, and must never fill a grid cell — grid cells encode the combined human + agent count with `LV` alone.

### The shared surface this ticket publishes — `lib/viz/render/budget.ts`

```ts
import type { SimState } from '@/lib/viz/sim/types';
import type { Level } from '@/lib/viz/tokens/level';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Measured in the prototype (sizeAll, line 521), re-justified by the dpr sweep. */
export const DPR_CAP = 2;

/** The ONLY grid ingest shape lib/viz/render accepts. All arrays are length dayCount. */
export interface GridSeries {
  readonly dayCount: number;
  readonly windowStartISO: string;  // day 0; indices increase with calendar time
  readonly total: Uint16Array;      // combined human + agent contribution count per day
  readonly agent: Uint16Array;      // agent-only count; drives the partial-height fill
  readonly level: Uint8Array;       // level(total[i]), precomputed by the caller with KW-007's level()
  readonly agentBirthDay: number;   // agent's first commit, or -1 if outside the window
}

/** Presentation metadata the sim does not carry; KW-024 adapts KW-012's bundle shape
 *  {id, short, actor, vol, stars, from, to, private, ext[]} into it. */
export interface RepoMeta {
  readonly short: string;      // display label, e.g. 'aiur'. For a private repo, ALREADY masked.
  readonly actor: 0 | 1 | 2;   // 0 human, 1 agent, 2 both. Drives stroke colour and beam dash.
  readonly stars: number;
  readonly isPrivate: boolean;
}

export interface RenderMeta {
  readonly repos: readonly RepoMeta[]; // length === state.repoCount, indexed by repo id
  /** MUST be pure and MUST return the mask '••••••/•••••••' for any entity whose repo is private. */
  fileLabel(entityId: number): string;
  // Agent-birth banner copy and sub-line. null suppresses the banner; the rule still draws.
  readonly agentBirthLabel: string | null;
  readonly agentBirthSubLabel: string | null;
}

/** Resolved design-system values: the only source of colour and font size in this directory. */
export interface RenderTheme {
  readonly lv: readonly string[];      // LV, verbatim from KW-007
  readonly ag: readonly string[];      // AG, verbatim from KW-007
  readonly paneSurface: string;        // PANE_SURFACE
  readonly token: Readonly<Record<TokenName, string>>;
  // CSS px, from --fs-micro / --fs-small / --fs-mono:
  readonly fontPx: { readonly micro: number; readonly small: number; readonly mono: number };
  readonly fontFamily: string;         // resolved --mono stack
}

export type TokenName =
  | 'bgH' | 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4'
  | 'fg0' | 'fg1' | 'fg2' | 'fg3' | 'fg4' | 'gray'
  | 'green' | 'greenD' | 'aqua' | 'aquaD'
  | 'purple' | 'purpleD' | 'yellow' | 'yellowD' | 'red' | 'blue';

/** The ONLY function in lib/viz/render/** that touches the DOM. */
export function resolveRenderTheme(el: Element): RenderTheme;

/** Adaptive degradation. Read by render/ only, NEVER by sim/ — it must not affect determinism. */
export interface Quality {
  readonly name: 'full' | 'no-file-labels' | 'no-spokes' | 'no-shadows' | 'dpr1' | 'half-files';
  readonly dpr: number;
  readonly fileLabels: boolean;
  readonly spokes: boolean;
  readonly shadows: boolean;
  readonly maxFiles: number;
  readonly clusterMode: 'blur' | 'hatch';
}

/** Six rungs, in degradation order; QUALITY_LADDER[0] is 'full'. */
export const QUALITY_LADDER: readonly Quality[];
export function degrade(current: Quality): Quality;

export interface Viewport {
  readonly cssWidth: number;   // CSS px, from getBoundingClientRect()
  readonly cssHeight: number;
  readonly dpr: number;        // Math.min(DPR_CAP, devicePixelRatio || 1), resolved by KW-025
  readonly pxWidth: number;    // backing store: Math.round(cssWidth * dpr)
  readonly pxHeight: number;   // Math.round(cssHeight * dpr)
}

/** Everything a painter needs that is not SimState and not the ctx. Pure data. */
export interface RenderView {
  readonly viewport: Viewport;
  readonly theme: RenderTheme;
  readonly quality: Quality;
  readonly meta: RenderMeta;
  readonly budget: FrameBudget;
  readonly focusedDay: number; // day the ribbon paints a keyboard focus ring on, or -1. KW-025 owns it.
}

/** Measured unit costs, microseconds (SwiftShader software raster: a pessimistic bound). */
export const UNIT_COST_US: {
  readonly smallArcFill: 1.21;
  readonly largeArcFill: 13.1;
  readonly radialLine40px: 0.30;
  readonly longLine640px: 2.55;
  readonly fillTextMono: 1.57;
  readonly blitCachedBitmap: 20.2;
  readonly filteredDrawCall: 5440;
  readonly shadowMultiplier: 5.3;
};

/** Hard caps. Every one of these is a measured number, not a guess. */
export const CAPS: {
  readonly frameBudgetMs: 8;
  readonly maxDrawCalls: 3000;
  readonly maxFilteredDrawCallsPerFrame: 0;
  readonly maxFilteredDrawCallsPerBuild: 1;
  readonly maxFileCircles: 2000;
  readonly maxRepoCircles: 56;
  readonly maxSpokes: 2000;
  readonly maxFillText: 200;
  readonly maxShadowPrimitives: 48;
  readonly maxBitmapEdgePx: 16384;
};

export interface FrameReport {
  readonly drawCalls: number;
  readonly filteredDrawCalls: number;
  readonly arcFills: number;
  readonly lines: number;
  readonly fillTextCalls: number;
  readonly shadowPrimitives: number;
  readonly blits: number;
  readonly nonIntegerBlits: number;
  readonly rotatedBlits: number;
  readonly estimatedMs: number;
  readonly violations: readonly string[]; // empty when the frame is legal; non-empty = a CAPS breach
}

export interface FrameBudget {
  begin(): void;      // zeroes the counters; KW-024's driver calls it once per frame, before any painter
  end(): FrameReport; // seals the counters, returns the report, stores it on `last`
  readonly last: FrameReport | null; // KW-024's inspect() reads .drawCalls from here
}

export function createFrameBudget(enforce: boolean): FrameBudget;

/** Proxy over `ctx`; see below. Production passes the RAW ctx — instrumentation is dev/test only. */
export function instrumentContext(ctx: Ctx2D, budget: FrameBudget): Ctx2D;

/** Throws when report.violations is non-empty. Used by KW-024's harness and KW-031's e2e. */
export function assertFrameBudget(report: FrameReport): void;
```

The painters carry no colour or px literal — the one exception is the sprite palette, which maps chars to token **names**.

### The painters

```ts
// lib/viz/render/overview.ts
export interface OverviewGeometry {
  readonly weeks: number;
  readonly cwPx: number;    // pxWidth / weeks — NOT rounded: the strip is a minimap
  readonly chPx: number;
  readonly labelStripPx: number;
}
export interface OverviewLayer {
  readonly grid: GridSeries;
  bitmap: OffscreenCanvas | HTMLCanvasElement | null; // null until the first render
  bitmapKey: string;        // `${pxWidth}x${pxHeight}x${themeVersion}`
}
export function createOverviewLayer(grid: GridSeries): OverviewLayer;
export function overviewGeometry(view: RenderView, grid: GridSeries): OverviewGeometry;
/** CSS-pixel x to a day index, clamped to [0, dayCount - 1]. Pure; KW-025's drag handler calls it. */
export function overviewDayAtX(geom: OverviewGeometry, view: RenderView, cssX: number): number;
export function renderOverview(state: SimState, ctx: Ctx2D, view: RenderView, layer: OverviewLayer, winStartDay: number): void;

// lib/viz/render/ribbon.ts
export const RIBBON_WEEKS = 53;          // the comp's window everywhere
export const RIBBON_WINDOW_DAYS = 371;
export interface RibbonGeometry {   // every field is INTEGER device px
  readonly cellPx: number;
  readonly gapPx: number;
  readonly stepPx: number;    // cellPx + gapPx, used for BOTH axes
  readonly originXPx: number;
  readonly originYPx: number;
  readonly gutterPx: number;  // weekday label gutter
  readonly monthStripPx: number;
}
export interface RibbonLayer {
  readonly grid: GridSeries;
  bitmap: OffscreenCanvas | HTMLCanvasElement | null;
  bitmapKey: string;
  winStartDay: number;      // first visible day; renderRibbon mutates it via nextWinStart
  followPlayhead: boolean;  // false once the user drags the overview
}
export function createRibbonLayer(grid: GridSeries): RibbonLayer;
export function ribbonGeometry(view: RenderView): RibbonGeometry;
/** Pure; applies the drift hysteresis described below. */
export function nextWinStart(prevWinStart: number, cursorDayInt: number, dayCount: number, followPlayhead: boolean): number;
/** KW-025 calls this from its pointer handler; it also clears followPlayhead. */
export function setRibbonWindow(layer: RibbonLayer, dayIndex: number): void;
/** O(1) arithmetic hit-test. Returns a day index or -1. Replaces 1,826 event targets. */
export function ribbonHitTest(geom: RibbonGeometry, view: RenderView, layer: RibbonLayer, cssX: number, cssY: number): number;
export function renderRibbon(state: SimState, ctx: Ctx2D, view: RenderView, layer: RibbonLayer): void;

// lib/viz/render/graph.ts
export interface GraphProjection {
  readonly padXPx: number;  // clamp(16, 0.04 * cssWidth, 40) * dpr
  readonly padYPx: number;  // clamp(16, 0.04 * cssHeight, 40) * dpr
  readonly fieldWPx: number;
  readonly fieldHPx: number;
  readonly cx: number;      // field centre, device px
  readonly cy: number;      // field centre, device px (the comp's 0.46, not 0.5)
  readonly rx: number;      // ellipse semi-axes, device px
  readonly ry: number;
  // repoDiscPx = state.repoR[i] * repoRadiusScale, chosen so the largest disc fits the gap:
  readonly repoRadiusScale: number;
  readonly repoBudget: number; // repo count to draw; reduced below 1080 px CSS width
}
export interface GraphLayer {
  sprites: SpriteAtlas | null;
  cluster: ClusterTile | null;
  liveScratch: Int32Array;  // for liveIdsAscending; allocated once, length entityCount
}
export function createGraphLayer(entityCount: number): GraphLayer;
export function graphProjection(view: RenderView): GraphProjection;
/** Maps a normalized [0,1] field coordinate to device px. The replacement for the comp's `P`. */
export function project(proj: GraphProjection, nx: number, ny: number): { x: number; y: number };
export function renderGraph(state: SimState, ctx: Ctx2D, view: RenderView, layer: GraphLayer): void;

// lib/viz/render/cluster.ts
export interface ClusterTile {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement;
  readonly sizePx: number;
  readonly mode: 'blur' | 'hatch';
}
/** True when ctx.filter is honoured. */
export function supportsCanvasFilter(ctx: Ctx2D): boolean;
/**
 * EXACTLY ONE draw call runs while ctx.filter is set: blobs accumulated into ONE path
 * and filled ONCE, or drawn unfiltered into a source canvas blitted once under the filter.
 */
export function buildClusterTile(theme: RenderTheme, quality: Quality, sizePx: number, seed: number): ClusterTile;
/** Blits the tile. xPx and yPx MUST be integers; the function asserts it in dev. */
export function renderCluster(ctx: Ctx2D, tile: ClusterTile, xPx: number, yPx: number, view: RenderView, labelledBy: string): void;
```

### Invariants

- **R-1 — the painters are pure.** `renderGraph`, `renderRibbon`, `renderOverview` and `renderCluster` read only their arguments: no clock (`Date.now`, `performance.now`, `new Date`), no `Math.random`, no `nextRng`/`rngValue`, no `requestAnimationFrame`, no timer, no `getComputedStyle`, no `document`, no `window`. Asserted: same `(state, ctx, view, layer)` twice ⇒ identical draw-command sequence. `layer` is the *declared* mutable surface (the caches), part of the input.
- **R-2 — at most one draw call while `ctx.filter` is set, and zero per frame (C-25).** Only `buildClusterTile` assigns `ctx.filter`, restoring `'none'` in a `finally`. The instrument counts `filteredDrawCalls`; per-frame cap `0`.
- **R-3 — every blit is axis-aligned at integer device coordinates (C-25).** `drawImage` destinations are integers; no `rotate`, no non-integer `translate` on any blit path; `save`/`restore`/`translate` otherwise free. The instrument counts `nonIntegerBlits` and `rotatedBlits`; cap `0` on both.
- **R-4 — the ribbon lattice is isotropic at every width.** `ribbonGeometry` computes one integer `cellPx` and one integer `gapPx`, then advances **both** axes by `stepPx = cellPx + gapPx`. No `cw`, no separate `step`; `stepX === stepY` is structural.
- **R-5 — all grid geometry is integer device pixels.** Cell, gap, step and both origins are integers in the backing store; CSS-pixel values exist only inside `ribbonHitTest` and `overviewDayAtX`, which divide by `dpr` at the boundary.
- **R-6 — visibility is read, never computed.** Files drawn iff `isLive(state, id)`; repositories per `repoPhase(state, id, state.cursorDayInt)`. No `seen` flag, no `entered` flag, no accumulation (DEC-010). Draw order comes from `liveIdsAscending` into `layer.liveScratch`, never from `state.live`, whose order is path-dependent (KW-008's I-3).
- **R-7 — no payload literal.** `dayCount`, `windowStartISO` and every contribution figure come from `GridSeries` (DEC-008). `1826`, `2038`, `261`, `370`, `13453`, `4817`, `2021-08-01` and every contribution total are forbidden here. `RIBBON_WEEKS = 53` and `RIBBON_WINDOW_DAYS = 371` are window-shape constants, not data, and the only calendar numbers allowed.
- **R-8 — colour is never the only channel (REQ-007).** Actor share is a partial-height fill, not a hue; private repositories carry a dashed ring and a hatch fill; agent beams carry `lineWidth 2.2` plus `setLineDash([5, 4])` against human beams at `1.4` solid; level 0 cells carry a 1 px inner stroke so an empty grid reads as a grid.
- **R-9 — quality never reaches the sim.** `Quality` is a field on `RenderView`, read only here, never written to `SimState`. Degrading quality must not change a value the digest covers.
- **R-10 — one allocation policy.** All caches (`bitmap`, `sprites`, `cluster`, `liveScratch`) hang off a `*Layer` created once; a painter may allocate only the strings it passes to `fillText`.

## Refreshable implementation notes

Every path below is a full repository path, refreshable against the researched commit.

### Files

`budget.ts` ~320 lines (the shared surface above, no painting); `cluster.ts` ~140, importing from `budget.ts` only; `overview.ts` ~190 plus private `buildOverviewBitmap`; `ribbon.ts` ~260 plus private `buildRibbonBitmap`; `graph.ts` ~450 plus private `drawRepo`/`drawGhost`/`drawFiles`/`drawBeams`/`drawActors` and the sprite block (`SPRITE_W`, `SPRITE_H`, `EVERDRED_PXA`, `APPLEKID_PXA`, `SPRITE_PALETTE`, `createSpriteAtlas`).

**These five files are the entire write surface**; do not add a sixth. The sprite grids live as string arrays inside `graph.ts` because there is no sprite file in the surface.

### `budget.ts` — the instrument

`instrumentContext` returns a `Proxy` over `ctx` whose `set` trap latches `b.filterActive = value !== 'none'` on `filter` and `b.shadowActive = value > 0` on `shadowBlur` before `Reflect.set`, and whose `get` trap wraps every member of

```ts
const DRAW_CALLS = new Set([
  'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
  'fillText', 'strokeText', 'drawImage', 'putImageData',
]);
```

in `(...args) => { b.count(prop, args); return v.apply(target, args); }`, binding and returning every other member untouched. `b.count` increments `drawCalls`, `filteredDrawCalls` when `filterActive`, `shadowPrimitives` when `shadowActive`; for `drawImage` it checks the destination arguments are integers (`Number.isInteger`) and the transform has no rotation (`ctx.getTransform().b === 0 && ctx.getTransform().c === 0`). On a breach with `enforce` true it throws `Error('KW-022 frame budget: ' + violation)`.

`estimatedMs` is `(arcFills * 1.21 + lines * 2.55 + fillTextCalls * 1.57 + blits * 20.2 + filteredDrawCalls * 5440 + shadowPrimitives * 1.5 * 4.3) / 1000` — a cost *model*, not a timer, so it is stable in CI where wall-clock timing is not. Calibrated against the measured full scene (20 repo circles + 800 file circles + 40 beams + 20 labels + 1 blurred cluster + a full-canvas clear): **3.952 ms at dpr 1** (23.7 % of 16.7 ms), 4.920 at dpr 1.5, 7.036 at dpr 2, 10.596 at dpr 3 — sub-quadratic because path setup is CPU geometry. `DPR_CAP = 2` saves 34 % against dpr 3, justifying the prototype's `Math.min(2, window.devicePixelRatio || 1)` at line 521.

`QUALITY_LADDER` degrades in this order, from viz-runtime §7.3, with rung 0 `full`: (1) drop file labels, (2) drop spokes, (3) drop `shadowBlur`, (4) drop dpr to 1, (5) halve `maxFiles` to 1,000. KW-024 owns the rolling-median trigger (12 ms for 30 consecutive frames); this ticket owns the ladder and the flags.

`resolveRenderTheme(el)` calls `getComputedStyle(el)` once and reads `--bg-h`, `--bg0`…`--bg4`, `--fg0`…`--fg4`, `--gray`, `--green`, `--green-d`, `--aqua`, `--aqua-d`, `--purple`, `--purple-d`, `--yellow`, `--yellow-d`, `--red`, `--blue`, `--mono`, `--fs-micro`, `--fs-small`, `--fs-mono`, falling back to KW-007's `LV`/`AG`/`PANE_SURFACE` for the ramp. **Canvas font sizes come from `theme.fontPx`, never a `9px` literal** — the comp hardcodes `'700 9px "JetBrains Mono", monospace'` in five places, and each must become `` `700 ${theme.fontPx.micro}px ${theme.fontFamily}` ``.

### `ribbon.ts` — the geometry fix, worked

The prototype's geometry is `drawRibbon` lines 575–577 (`weeks = 53, left = 28, top = 20`, then the two mismatched advances quoted in Defect 3). The replacement, in device pixels, integers throughout:

```ts
// from view.viewport { pxWidth, pxHeight, dpr }:
const gutterPx = Math.round(28 * dpr);              // weekday labels: mon / wed / fri
const monthStripPx = Math.round(20 * dpr);          // month labels
const footerPx = Math.round(14 * dpr);              // birth-rule label
const gapPx = Math.max(1, Math.round(2.5 * dpr));
const byWidth = Math.floor((pxWidth - gutterPx) / RIBBON_WEEKS) - gapPx;
const byHeight = Math.floor((pxHeight - monthStripPx - footerPx) / 7) - gapPx;
const cellPx = Math.max(1, Math.min(byWidth, byHeight));
const stepPx = cellPx + gapPx;                      // ONE step, BOTH axes
const blockWPx = RIBBON_WEEKS * stepPx;
const originXPx = gutterPx + Math.max(0, Math.floor((pxWidth - gutterPx - blockWPx) / 2));
const originYPx = monthStripPx;
```

Worked at `W = 1198`, `dpr = 1`, `H = 200` (`clamp(120px, 20vh, 200px)` at 1080p): `stepPx = 22` on **both** axes, `cellPx = 19`, both gutters 3 px — a square lattice where the prototype at `H = 140` gave a 22.075 px horizontal advance against 15.143 px vertical. At `W = 360`, `dpr = 3`, `H = 120`: `gutterPx = 84`, `gapPx = 8`, `cellPx = 10`, `stepPx = 18`, `blockWPx = 954`, `originXPx = 105` — isotropic, integer, centred.

**The height change lives in CSS, not here.** `ribbonGeometry` reads whatever `pxHeight` it is given; the `clamp(120px, 20vh, 200px)` box is KW-025's `components/viz/Ribbon.tsx`, so record it in the PR description.

**The cached bitmap.** `buildRibbonBitmap(layer, geom, theme)` paints the whole corpus at ribbon resolution into an `OffscreenCanvas` of `ceil(grid.dayCount / 7) * stepPx` by `7 * stepPx` — at `stepPx = 22`, `261 × 22 = 5,742 px` wide, far under `CAPS.maxBitmapEdgePx = 16384` and under it again at dpr 2. **Guard the cap anyway**: when `weeks * stepPx > CAPS.maxBitmapEdgePx`, set `layer.bitmap = null` and paint the visible 371 cells directly each frame (~0.07 ms). Bitmap key `` `${pxWidth}x${pxHeight}x${stepPx}` ``; rebuild only when the key or the grid changes.

Per frame, on top of the blit: one `drawImage` at `sx = weekOffset * stepPx` (an integer by R-5), then the playhead — a column wash `rgba(fg0, .05)` over the week column and a 1 px `strokeRect` at `rgba(fg0, .42)` on the exact day cell (prototype lines 612–618). Highlight cost 0.0005–0.0007 ms.

**Window hysteresis** (`nextWinStart`): the prototype moves the window only on a drift greater than 3 days — `if (Math.abs(w - this.winStart) > 3)` inside `loop`. Keep the rule; the target is `clamp(cursorDayInt - 185, 0, dayCount - RIBBON_WINDOW_DAYS)`. When `followPlayhead` is false the window is frozen: the prototype latches `userWin = true` on drag with **no way to un-latch**, a defect — `setRibbonWindow` sets the latch, and KW-025 must ship a visible "follow playhead" affordance plus `Esc`.

**Chrome to port**: the weekday gutter (`mon`/`wed`/`fri` at rows 0/2/4); the month-label strip with the 26 px minimum spacing from the prototype's `lastLabelX` guard; the per-cell agent band `fillRect(x, y + cell * (1 - share), cell, cell * share)` with a `rgba(bgH, .5)` 1 px separator when the day also has human contributions; the green breathing ring on today's cell, its phase from `state.tick` and **never** `performance.now()`; the purple birth rule with its `◆ agent initialized` label.

**`ribbonHitTest`** replaces `hover` (line 686) — same arithmetic, one division per axis, no event targets: with `xPx = cssX * dpr` and `yPx = cssY * dpr`, take `w = Math.floor((xPx - geom.originXPx) / geom.stepPx)` and `d = Math.floor((yPx - geom.originYPx) / geom.stepPx)`, return `-1` when `w < 0 || w >= RIBBON_WEEKS || d < 0 || d > 6`, else `i = layer.winStartDay + w * 7 + d` when `i >= 0 && i < layer.grid.dayCount`, else `-1`. The tooltip content it feeds — date, `total` contributions, `bandLabel(level)`, per-actor split — is KW-025's DOM, not this ticket's.

### `overview.ts`

Port `drawOverview` (537–568) largely as-is; it is the one method with no measured defect. Weeks is `Math.ceil(grid.dayCount / 7)`; `cw = pxWidth / weeks`; `ch = (pxHeight - labelStrip) / 7`; cells are gapless, `fillRect(x, y, max(1, cw - 0.4), max(1, ch - 0.4))`. **The overview strip is exempt from R-4** — a ~1,305 px minimap in a 50 px strip, cells deliberately not square.

Cache the cells as a bitmap on the same key rule as the ribbon. Per frame, in order: blit; year rules (`rgba(bg2, .85)` 1 px) and year labels; the purple birth rule at `agentBirthDay`; the window brush (two `rgba(15,16,17,.6)` scrims either side of `[winStartDay, winStartDay + RIBBON_WINDOW_DAYS]` plus a `rgba(fg0, .75)` 1.5 px `strokeRect`); the playhead hairline at `rgba(fg0, .9)`.

**The year labels are the only place a calendar year appears.** Derive them from `grid.windowStartISO` by counting days, not by constructing `Date.UTC(y, 0, 1)`: this directory does no date arithmetic (KW-008's I-7, extended here). If real year boundaries prove necessary, add `readonly yearBoundaryDays: Int32Array` to `GridSeries` and tell KW-024, which supplies them. Do not import a date library and do not call `new Date`.

### `graph.ts`

**Projection.** Replace the comp's `const P = (r) => ({ x: 40 + r.px * (W - 80), y: 34 + r.py * (H - 74) })` with `padXPx = clamp(16 * dpr, 0.04 * pxWidth, 40 * dpr)` and `padYPx = clamp(16 * dpr, 0.04 * pxHeight, 40 * dpr)`. At the measured desktop field (1194 × 602 CSS at 1080p, aspect ≈ 1.98:1) this reproduces the comp's 40 px; at the ≤720 px breakpoint's forced 340 px height it yields 16 px rather than 74 px, recovering 17 % of the canvas.

**Ring caps.** The prototype recomputes `rx = min(0.42, rpx / (W - 80))` and `ry = min(0.38, rpx / (H - 74) * 0.82)` inside `drawGraph`. **Do not port that computation.** KW-021 owns the ring as the fixed normalized `RING = { cx: 0.5, cy: 0.46, rx: 0.42, ry: 0.38 }` and writes eased `repoX`/`repoY` in `[0, 1]`; this module multiplies by `fieldWPx`/`fieldHPx` and offsets by the padding. `proj.rx`/`proj.ry` are derived (`RING.rx * fieldWPx`, `RING.ry * fieldHPx`) for label placement and the reduced-set decision, not layout. Below **1080 px CSS width** set `proj.repoBudget` to the 12 most-recently-active repositories, rather than shrinking labels below `theme.fontPx.micro`.

**Draw order**, matching the prototype: clear to `theme.paneSurface` → beams → repositories (ghost, then live) → file satellites and spokes → repo labels and star counts → the private cluster → actors → the convergence line. The `flash` overlay and `'its-applekid initialized'` banner are **content**: driven by `state.cursorDayInt` crossing the agent birth day, copy from `view.meta.agentBirthLabel` / `agentBirthSubLabel` (KW-006's `content/`, never a literal here). When either is `null`, draw the rule and omit that line.

**Ghosts (DEC-010),** by `repoPhase(state, id, state.cursorDayInt)`:

- `PHASE_ABSENT` → draw nothing.
- `PHASE_LIVE` → radial-gradient fill from `theme.lv[lvv]` at `3a` alpha to `rgba(bgH, .92)`; stroke `--purple-d` (agent), `--yellow-d` (both), `--aqua-d` (human), `lineWidth 1.5`; cream prestige halo at `R + 6` when `prestige > 0.05`, `prestige = clamp((log10(stars + 1) - 2) / 2.2, 0, 1)`. The halo is a **separate channel from volume** — reputation is a halo, not a bigger circle.
- `PHASE_GHOST` → 1 px dashed outline at `rgba(bg4, .45)`, no fill, no halo, no files, no label beyond the repo short name at `--bg4`.

**Files.** Enumerate with `liveIdsAscending(state, layer.liveScratch)`, take the first `min(count, quality.maxFiles)` after sorting by `state.heat` descending; `CAPS.maxFileCircles = 2000`, measured 2.45 ms, against a modelled peak live set of 869. Position is `repoCentre + (state.px[e], state.py[e]) * discPx` where `discPx = state.repoR[repoOf[e]] * proj.repoRadiusScale`; dot radius `state.pr[e] * discPx`, floored at 1 px. `px`/`py` are unit-disc coordinates in `[-1, 1]`, **not** field coordinates — projecting them as field coordinates piles every file into the top-left corner. Spoke only when `state.heat[e] > 0.15` (the prototype draws one per *visible* file, uncapped, and long lines cost by **length**, 2.55 µs at ~640 px). File label only when `state.heat[e] > 0.55` and `quality.fileLabels`, cap `CAPS.maxFillText = 200`. `shadowBlur` only when `state.heat[e] > 0.3` and `quality.shadows`, cap `CAPS.maxShadowPrimitives = 48` — a **5.3×** penalty the prototype applies uncapped.

**Beams.** Read the ring buffer `state.beamEnt`/`beamActor`/`beamKind`/`beamLife`/`beamHead`, capacity `MAX_BEAMS = 256` from KW-008. Kind colours: commit `--aqua`, pr `--purple`, issue `--yellow`, review `--blue`. Agent beams `lineWidth 2.2` with `setLineDash([5, 4])`, human beams `1.4` solid. **Never decrement `beamLife` here**; that is `step`'s job in KW-021.

**Sprites.** Replace `drawActor` (828–847) — an aqua circle labelled `kw`, a rotated purple square labelled `ak` — with blitted sprites, which must not be rotated. `public/images/kevin.png` is 270 × 310, 2,325 bytes, 8-bit RGBA, with GCD 10 on every colour run length: a **27 × 31 image stored at 10×**. Its 11 opaque colours (`#ffffff #090909 #271d14 #100a05 #070201 #a87468 #cca68e #ebc0a8 #facabc #ffded2 #794d43`) contain **no gruvbox token**, and at r ≈ 11 px a 270 px bitmap either mushes or aliases. Ship instead a 27 × 31 ASCII grid plus a palette mapping each character to a **token name**:

```ts
const SPRITE_W = 27, SPRITE_H = 31;
// One char per pixel, ' ' = transparent. 31 strings of exactly 27 chars.
const EVERDRED_PXA = [ '...', /* 31 rows */ ] as const;
const APPLEKID_PXA = [ '...', /* 31 rows */ ] as const;
const SPRITE_PALETTE: Readonly<Record<string, TokenName>> = {
  K: 'fg0',      // 1 px keyline — --fg0, NOT the PNG's pure white
  h: 'bg2', H: 'bg3',              // hair mass
  f: 'fg2', g: 'fg3', i: 'fg4',    // 3-tone face, no photo skin
  s: 'aquaD',                      // human shoulders, matching the ring stroke
  C: 'purpleD', c: 'purple',       // agent CRT chassis + highlight
  S: 'bgH',                        // agent screen
  e: 'green', E: 'greenD',         // agent eyes + block cursor
  a: 'red', l: 'green',            // apple badge + leaf
};
```

`createSpriteAtlas(theme, dpr)` walks each grid once, `fillRect(x, y, 1, 1)`s into a 27 × 31 `OffscreenCanvas`, then keeps one pre-scaled copy per integer zoom (1×, 2×, 3×) with `imageSmoothingEnabled = false`. Per-frame cost is one `drawImage`. Grid plus palette is 868 + 96 = **964 bytes raw** against 2,325 for the PNG.

Produce `EVERDRED_PXA` by re-running the PNG extraction: read `public/images/kevin.png`, decode, sample every 10th pixel on both axes, map each of the 11 opaque colours to the nearest gruvbox token by CIEDE2000. **Use a throwaway script outside the repository** (`/tmp/extract-sprite.mjs`); `scripts/**` is not in this write surface and the PNG stays as provenance. Hand-author `APPLEKID_PXA` against the extracted human grid as a proportion reference — shoulders at row 18, head rows 4–17, body width 21 px — so the two read as a matched pair at 22 px; if that stalls, replace the face region with a filled rect and remap the palette.

Fallback when `typeof OffscreenCanvas === 'undefined'`: rasterize into a detached `document.createElement('canvas')` — that reads `document`, which R-1 forbids in a painter, so it happens inside `createSpriteAtlas`, a *factory* called by KW-025 at mount, never inside `renderGraph`. If neither is available, fall back to the prototype's primitives (`arc` + `fillText('kw')`, `fillRect` + `fillText('ak')`).

The agent's idle animation is one palette index swapped on `(state.tick / 45) % 2` — the block cursor blinks, no second sprite. Under a reduced-motion static frame (`tick = 0`) it does not blink.

### `cluster.ts` — the one place `ctx.filter` is allowed

Build (on resize, data change and quality change — ~5 times per session, 0.196–0.243 ms each): draw ~60 filled circles in `--bg2`/`--bg3` into a `src` `OffscreenCanvas(300, 300)`, positions and radii from `randomHash(seed, i)`, radii proportional to the private volume per period; then on a second `OffscreenCanvas(300, 300)` set `ctx.filter = 'blur(9px)'`, run `ctx.drawImage(src, 0, 0)` — **exactly one draw call under the filter** — and restore `ctx.filter = 'none'` in a `finally`. Per frame: `ctx.drawImage(tile, xInt, yInt)` (0.0202 ms), `ctx.setLineDash([6, 5])` with `ctx.strokeStyle = token.bg3` around the ring, `ctx.fillText('private repos', ...)`.

Feature-detect once per session by assignment round-trip: `ctx.filter = 'blur(2px)'; const ok = ctx.filter === 'blur(2px)'; ctx.filter = 'none';`. When unsupported — or when `quality.clusterMode === 'hatch'` — build the hatch tile instead: the prototype draws hatched diagonals clipped to a circle at `if (r.priv)` (line 771), measured 0.702–0.743 ms, 4.2 % of budget, needing no offscreen and no feature detection. Ship blur as the default and hatch as the fallback; if the blur path costs a turn more than it is worth, ship hatch only and record the choice in the PR body.

Bake alpha into the tile at build time and drift the tile by animating `xInt`/`yInt` — **integers only** — never by re-blurring and never by rotating (Defect 2's costs: blit alpha 0.022 ms, half-pixel offset 0.160 ms, rotation 0.405 ms).

The tooltip copy should say this is **honest redaction**: the cluster is generated from `restrictedContributionsCount`, a volume with no repository names and no paths, so there is nothing to leak.

### Version pins

This ticket adds nothing; `package.json` and `package-lock.json` are frozen after KW-001 (DEC-003) and must be byte-identical in the diff. Already installed by KW-001: `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript` (KW-001's pin), `eslint@9.39.5`, `eslint-config-next@16.2.12`, `vitest@4.1.10`. `d3-hierarchy@3.1.2` is installed but is **KW-021's** — `lib/viz/render/**` must not import it. `d3-force` and `gsap` must not appear in the dependency tree at all.

## Acceptance and verification

### Agent gate

- `npm run typecheck`, `npm run lint` and `npm run build` each exit 0.
- `grep -rnE "Math\.random|Date\.now|performance\.now|new Date|requestAnimationFrame|setTimeout|setInterval" lib/viz/render/` returns nothing.
- `grep -rn "getComputedStyle" lib/viz/render/` returns exactly one hit, inside `resolveRenderTheme` in `lib/viz/render/budget.ts`.
- `grep -rn "document\.\|window\." lib/viz/render/` returns hits only inside `resolveRenderTheme` and `createSpriteAtlas`, never in a function whose name begins `render`.
- `grep -rnE "\.filter\s*=" lib/viz/render/` returns hits only in `lib/viz/render/cluster.ts`, every one inside `buildClusterTile` or `supportsCanvasFilter`.
- `grep -rniE "bomberman|drawGame|walkable|userPlay" lib/viz/render/` returns nothing.
- `grep -rnE "\b(1826|2038|13453|4817|261|370)\b" lib/viz/render/` returns nothing (DEC-008); `53` and `371` appear only as `RIBBON_WEEKS` and `RIBBON_WINDOW_DAYS`.
- `grep -rnE "[0-9]+px \\\"?JetBrains" lib/viz/render/` returns nothing — every canvas font string interpolates `theme.fontPx` and `theme.fontFamily`.
- `grep -rn "d3-hierarchy\|d3-force\|gsap" lib/viz/render/` returns nothing.
- A **throwaway** spec at `lib/viz/render/__gate__.test.ts`, run with `npx vitest run lib/viz/render/__gate__.test.ts` and **deleted before commit**, drives all five modules against a hand-rolled recording fake `CanvasRenderingContext2D` (an object literal implementing the `DRAW_CALLS` methods plus `getTransform`, `save`, `restore`, `translate`, `beginPath`, `arc`, `moveTo`, `lineTo`, `setLineDash`, `measureText`, `createRadialGradient`) and a synthetic 13,453-entity / 51-repo `SimState` fixture, asserting:
  - two consecutive `renderGraph` / `renderRibbon` / `renderOverview` calls with the same `(state, ctx, view, layer)` produce identical command logs (R-1);
  - `report.filteredDrawCalls === 0` for every rendered frame, and `buildClusterTile` produces exactly **one** draw call while `filter !== 'none'` (R-2);
  - `report.nonIntegerBlits === 0` and `report.rotatedBlits === 0` (R-3);
  - `ribbonGeometry` returns `stepPx` used on both axes, and for every width in `[320, 360, 414, 720, 830, 1024, 1194, 1198, 1560, 2560]` × dpr in `[1, 2]` the horizontal and vertical gutters are equal and `cellPx >= 1` (R-4);
  - `cellPx`, `gapPx`, `stepPx`, `originXPx` and `originYPx` are integers at every one of those widths (R-5);
  - a repository at `PHASE_GHOST` emits an outline and no fill, one at `PHASE_ABSENT` emits nothing, and no code path reads a `seen` or `entered` field (R-6);
  - `report.estimatedMs` for the reference scene is under `CAPS.frameBudgetMs = 8`, and `report.violations` is empty;
  - `nextWinStart` does not move the window for a 3-day drift, does move it for a 4-day drift, and returns `prevWinStart` unchanged when `followPlayhead` is false;
  - `ribbonHitTest` round-trips: every day in the visible window maps back from its cell centre to that day index, and a point in the gutter returns `-1`;
  - `renderGraph` never calls `nextRng` or `rngValue` — by spying on `lib/viz/sim/rng.ts`, or by `grep` if spying is unavailable;
  - `EVERDRED_PXA` is exactly 31 strings of exactly 27 characters, every character `' '` or a key of `SPRITE_PALETTE`, and every value of `SPRITE_PALETTE` a member of `TokenName`.

### At-merge gate

- `ci-ok` is green on the exact PR head commit.
- The PR diff touches exactly five files, all under `lib/viz/render/`, and nothing else; in particular `package.json`, `package-lock.json`, `eslint.config.mjs`, `tsconfig.json`, `lib/viz/sim/**`, `lib/viz/tokens/**` and `test/**` are unmodified.
- No file under `lib/viz/render/` imports from `lib/bundle/**`, `app/**`, `components/**`, `content/**`, `scripts/**`, `react` or `next`.
- The five acceptance properties from the plan hold and are named in the PR body: `ctx.filter` set for at most one draw call; all blits axis-aligned at integer coordinates; ribbon cells square with isotropic gutters at every width; the frame budget instrumented and asserted; render modules pure functions of their inputs.
- The PR body records the two facts KW-025 must consume: the ribbon box becomes `clamp(120px, 20vh, 200px)`, and the canvas backing store is sized with `Math.min(2, devicePixelRatio || 1)`.
- The throwaway gate spec is absent from the diff.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.**

- `ctx.filter` unsupported, or `quality.clusterMode === 'hatch'` → the hatch tile, detected once per session by assignment round-trip, never per frame.
- `OffscreenCanvas` unavailable → the factories fall back to a detached `<canvas>`; if that also fails, `layer.bitmap` stays `null` and the painter draws cells directly (~0.07 ms). No painter throws for a missing cache.
- Bitmap edge would exceed 16,384 px → skip the cache and draw directly, guarded explicitly.
- `grid.dayCount === 0`, `state.repoCount === 0`, or an empty live set → clear to `theme.paneSurface` and return. Never throw, never divide by zero; `overviewGeometry` guards `weeks < 1`.
- A `NaN` or `Infinity` reaching a coordinate → the instrument's integer/finite check on `drawImage` catches the blit case and `violations` catches the rest. In production the instrument is absent and a `NaN` silently no-ops, which is the correct degradation.
- The frame budget is exceeded → this ticket only *reports* it; KW-024 owns the trigger and calls `degrade`. A breach must never throw in production.

**Security.**

- No secrets, no network, no filesystem: this directory has no I/O of any kind.
- The private-repo cluster is synthesised from a **count** (`restrictedContributionsCount`), never from obscured real data — a 67-month sweep requesting `repository{nameWithOwner isPrivate}` on all four contribution connections leaked **zero** private repository names even as owner with a repo-scoped token. There is nothing to de-blur.
- `RenderMeta.fileLabel` and `RepoMeta.short` must already be masked for private repositories (`••••••/•••••••`). This directory must not receive a real private path and must not mask one itself — masking here would mean the real string had already reached the client bundle.
- DEC-015: the phone number `856-723-2521` must not appear in this directory, in code, in a comment, or in a sprite palette.

**Migration.** None: `lib/viz/render/` does not exist at the researched commit, so nothing is replaced and no data moves.

**Accessibility.**

- Canvas is opaque to `axe` and to screen readers, and the comp has **zero** `aria-*`, `role`, `tabindex` or `alt` attributes, so all a11y is new work — but the DEC-011 hidden `<table>`, the `role="img"` label and the `<input type="range">` behind the overview strip are **KW-029's** and **KW-025's**. This ticket contributes exactly three things:
  1. `focusedDay` on `RenderView`: when `>= 0`, `renderRibbon` paints a 2 px `--fg0` focus ring on that day's cell, offset outward by `gapPx` so it is visible against every ramp level — without it, the keyboard focus KW-025 wires up is invisible.
  2. R-8's non-colour channels, so nothing on any canvas is encoded by hue alone.
  3. A 1 px inner stroke on level-0 cells (DEC-009), so an empty grid reads as a grid at a 1.41:1 contrast ratio against the pane.
- WCAG 1.4.11 adjacent-level contrast is **arithmetically unsatisfiable** for any 10-step ramp (3⁹ = 19,683:1 required, sRGB maximum 21:1); both candidate ramps score 1.22–1.50 adjacent. Do not attempt to fix it in the ramp and do not assert it — conformance comes from the DEC-011 text alternative.
- No text is drawn below `theme.fontPx.micro`; if the resolved `--fs-micro` is 11 px, the canvas draws 11 px.
- `shadowBlur` is decorative in every use here: quality rung 3 removes it and no meaning is lost.
- Reduced motion is not handled here — KW-024 renders one static frame at `tick = 0` through this same painter path, which is why there must be no second "static" code path here.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, public/images/kevin.png, lib/viz/sim/{types,cursor,rng}.ts, lib/viz/tokens/{ramp,level}.ts, docs/research/2026-07-31-viz-runtime.md, docs/research/2026-07-31-design-comp-spec.md, docs/research/2026-07-31-decomposition-synthesis.md, package.json, tsconfig.json
- Writes: lib/viz/render/graph.ts, lib/viz/render/ribbon.ts, lib/viz/render/overview.ts, lib/viz/render/cluster.ts, lib/viz/render/budget.ts
- Contracts: lib/viz/render/budget.ts#{RenderView,RenderTheme,GridSeries,RenderMeta,Quality,FrameBudget,FrameReport}, lib/viz/render/graph.ts#renderGraph, lib/viz/render/ribbon.ts#renderRibbon, lib/viz/render/ribbon.ts#ribbonHitTest, lib/viz/render/overview.ts#renderOverview, lib/viz/render/cluster.ts#buildClusterTile
- Safety: canvas-frame-budget-invariants, privacy:private-repo-cluster-synthesis

## Sibling boundaries and open gates

**Same wave (phase 3).** Eleven tickets run in this wave, each owning a disjoint set of files (DEC-005). KW-013/KW-014 (`scripts/pipeline/**`, `data/.pipeline-state.json`), KW-016–KW-020 (`app/regions/**`) and KW-023 (`playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/e2e.yml`) share no file with this ticket; region tickets never import `lib/viz/render/**`, only KW-025 does. KW-015 owns `lib/bundle/loader.ts`, which must not be imported here.

**KW-021** (`lib/viz/sim/step.ts`, `lib/viz/sim/layout.ts`, `test/viz/step.test.ts`) is the tightest seam in the pack: it **writes** every `SimState` field this ticket **reads**, and both run in parallel because both depend only on KW-008. Neither may create a file in the other's directory. `RING` and `RING_ENTRY_SCALE` are its exports — do not re-declare them, and do not port the prototype's per-frame `rx`/`ry` recomputation.

**Upstream, both hard dependencies, both merged before pickup.** From **KW-008**: `SimState`, `PHASE_ABSENT`/`PHASE_LIVE`/`PHASE_GHOST`, `RepoPhase`, `MAX_BEAMS`, `liveIdsAscending`, `repoPhase`, `isLive`, `randomHash` — never `nextRng` or `rngValue`, since a stream draw in render desynchronises replay. From **KW-007**: `LV`, `AG`, `AG_SEMANTIC_MAX`, `PANE_SURFACE`, `rampColor`, `agentColor`, `Level`, `level`, `bandLabel` — never a hex literal for a ramp stop.

**Downstream, blocked on this ticket.**

- **KW-024** — `lib/viz/driver.ts`, `lib/viz/testHarness.ts`: the single rAF call site, the fixed-timestep accumulator, `matchMedia`, `?viz-test=1`, the bundle→`GridSeries`/`RenderMeta` adapters, the quality trigger. Calls `budget.begin()`, the three painters, `budget.end()`, and surfaces `last.drawCalls` through `inspect()`.
- **KW-025** — `app/regions/Instrument.tsx`, `components/viz/{Overview,Ribbon,Gource}.tsx`: creates the canvases, owns `ResizeObserver` and DPR sizing, calls `resolveRenderTheme` once per mount, converts drag-to-scrub and hover to **Pointer Events**, calls `overviewDayAtX` and `ribbonHitTest`, applies the ribbon box.
- **KW-026** — `app/regions/TransportBar.tsx` plus **deletions in `lib/viz/render/ribbon.ts`**: the one declared write-surface overlap, safe because KW-026 depends on KW-024, which depends on this ticket. Make its deletion a **no-op**: never port `drawGame` (637–684), its call site (633), `this.walkable`, `this.bot`, `this.userPlay`, or the `keydown` block (477–491). Do port `rbGeom` — it becomes `RibbonGeometry`, and the hover path depends on it.
- **KW-029** — `components/viz/ContributionTable.tsx` and the a11y gate: uses `repoPhase`/`liveIdsAscending` for the hidden table, re-audits the ramp, owns the WCAG verdict.
- **KW-031** — `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`: R-1's determinism and R-4/R-5's stability make pixel baselines viable.

**Open gates.** None block this ticket, and none of the seven touch `lib/viz/render/**`. `GATE-002` (`workflow` OAuth scope) blocks KW-001, KW-023, KW-028 and KW-031 at push time; this ticket writes no file under `.github/`. `GATE-003` (the SSO-authorized `CONTRIB_TOKEN`) affects the data half only; this ticket runs on fixtures and never fetches. `GATE-007` (the scanline treatment) is a `styles/` decision owned by KW-003 and does not reach canvas. Pick this ticket up as soon as KW-007 and KW-008 have both merged.

**If either dependency is unmerged at pickup.** Do not start, and do not stub — `SimState` and `LV` are the contracts this whole directory is shaped around. Report the graph violation instead: the blocker gate only fires when an issue normalizes to `todo`, so a reworked upstream ticket can dispatch out of order, and KW-008 is called out as a contract to watch for that.
