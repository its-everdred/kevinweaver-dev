# KW-022 — Viz render modules: graph / ribbon / overview

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 4 — Three canvases share one projection model, one colour pipeline and one budget instrument; splitting them creates three tickets that must agree on an unreviewed interface, so the boundary is intrinsically indivisible.

**Risk:** High — this is the widest single write surface in the viz lane, it sits on the critical path, and GT-14 measured that the fleet gives complexity 4 no elevated turn budget (`max_turns_by_complexity` defines only 1/2/3 → 4/8/12, fallback `max_turns: 12`). Expect to need the full budget; do not start it in parallel with anything else.

**Phase hint:** 3

**Depends on:** KW-008, KW-007

**Serializes with:** none

**Requirements:** REQ-002, REQ-005, REQ-006, REQ-007

**Decisions:** DEC-003, DEC-005, DEC-008, DEC-009, DEC-010, DEC-011, DEC-016

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/viz/render/` contains three pure canvas painters — the reverse-Gource graph, the detail contribution ribbon, and the five-year overview strip — plus the private-repo cluster and the frame-budget instrument they share. Each painter is a deterministic function of its inputs: called twice with the same state it emits a byte-identical draw-command sequence. The instrument proves, on every frame, that at most one draw call ran while `ctx.filter` was set, that every blit landed axis-aligned on integer device pixels, and that the frame's estimated cost sits inside the 8 ms budget. The ribbon's cells are square at every viewport width, which the shipping prototype's geometry is not.

## Context and evidence

The design prototype at `docs/design/kevinweaver.dev.dc.html` (1,033 lines, verified at the researched commit) already paints all three canvases inside one React class. This ticket ports that paint code out of the class and into pure modules, fixing four measured defects on the way. Method names first, line numbers second (**C-30**: six of the viz-runtime track's line citations were off by 2–6 lines, so every number below was re-derived against the researched commit):

| Prototype method | Lines (re-measured this session) | Becomes |
|---|---|---|
| `drawGraph` | 705–869 | `lib/viz/render/graph.ts` + `lib/viz/render/cluster.ts` |
| `drawRibbon` | 571–634 | `lib/viz/render/ribbon.ts` |
| `drawOverview` | 537–568 | `lib/viz/render/overview.ts` |
| `drawGame` | 637–684, call site 633 | **nothing — deleted, never ported** (KW-026 owns the deletion audit) |
| `sizeAll` DPR clamp | 520–521 | `DPR_CAP` in `lib/viz/render/budget.ts` |
| `hover` arithmetic hit-test | 686 | `ribbonHitTest` in `lib/viz/render/ribbon.ts` |

GT-13's ranges (`drawGraph` 705–903, `drawRibbon` 571–636, `drawOverview` 537–570) name the correct **start** lines; the end lines above were measured directly and are the ones to trust. `drawRibbon` ends at 634 because the `this.drawGame(...)` call site is 633 — the same 633 the KW-026 entry cites.

**Defect 1 — `ctx.filter` is a per-draw-call cliff (C-25, corrected).** The viz-runtime track wrote the rule as "never let `ctx.filter` near a path draw". Its verifier refuted that as stated and the verifier wins: the real rule is **at most one draw call while `ctx.filter` is set**. Measured at 1280×720: 60 separate filtered arc `fill()` calls cost 345.26 ms, but *the same 60 arcs as one path with one `fill()`* cost 8.36 ms — 41× cheaper. A single filtered full-canvas `fillRect` costs 6.14 ms. All three agree on ≈5.4–6.1 ms per filtered draw call, because Chromium runs a full canvas-sized filter pass for every primitive drawn while the filter is active; a canvas-size sweep confirmed the mechanism (cost ratio 11.1 against an area ratio of 10.24). The shipping consequence is unchanged — 8.36 ms is still half a frame, so nothing is filtered per frame — but the rule as originally written would have forbidden a legitimate implementation, and this ticket must state the corrected form.

**Defect 2 — the blit rule was justified by the wrong mechanism (C-25, corrected).** The original rule banned `save()`/`restore()`/`rotate()`/`globalAlpha` on the blit path, citing a 21× regression from "transform/state machinery". Decomposed by the verifier, 300 px tile onto a 1280×720 canvas: baseline `drawImage` at an integer position 0.0218 ms; `+ save/restore` 0.0270 ms (**+0.005**); `+ translate` 0.0230 ms (+0.001); `+ globalAlpha` 0.0436 ms (+0.022); **`+ rotate 0.1 rad` 0.4268 ms (+0.405)**; **`drawImage` at (400.5, 200.5) 0.1819 ms (+0.160)**. It is the pixels, not the state machinery. **Corrected rule: blit axis-aligned at integer coordinates. `save`/`restore`/`translate` are free; rotation and sub-pixel placement are not.** Do not ban `save`/`restore` — it buys 0.005 ms and costs readability.

**Defect 3 — the ribbon's gutters are anisotropic.** `drawRibbon` computes `cw = (W - left) / weeks` and `cell = Math.min(cw - 2.5, (H - top - 14) / 7 - 2.5)`, then advances `x` by `cw` but `y` by `step = cell + 2.5`. At the measured desktop width `W = 1198` and the comp's fixed `H = 140`: `cw = 22.075`, `cell = 12.643`, so the horizontal gutter is **9.43 px** against a vertical gutter of **2.5 px**. The grid reads as columns of dashes rather than a lattice. The crossover is `W ≥ 830 px`, so it is a desktop-only defect and is invisible on a phone — which is exactly why it survived. The fix is to advance both axes by `cell + gap` and centre the block, and to grow the ribbon box from `140px` to `clamp(120px, 20vh, 200px)`.

**Defect 4 — the Gource projection's dead margins are absolute.** `drawGraph` bakes `const P = (r) => ({ x: 40 + r.px * (W - 80), y: 34 + r.py * (H - 74) })`. At the ≤720 px breakpoint the comp forces `.kw-graph{height:340px}` (line 44) — so 74/340 = **21.8 % of the canvas height is padding**. The forced heights also pin `ry` to its `0.38` cap while `rx` stays at `0.42`, flattening the repo ring until labels collide. Re-derive as `clamp(16px, 4%, 40px)` on each axis, and render a reduced repo set below 1080 px.

**Why the grid is two canvases and not one, arithmetically.** A five-year window is 261 week-columns. At the prototype's 11 px cell + 2 px gap that is `261 × 13 = 3,393 px` wide — wider than any laptop. The two-tier overview-strip + detail-ribbon split is **required**, not stylistic. The comp already ships both canvases (overview at line 76, ribbon at 83, graph at 97).

**Why canvas and not DOM (C-26, corrected, DEC-011).** The viz-runtime track argued 3,652 permanent DOM nodes; its verifier counted **1,827** (1,826 `<i>` plus a container) and re-measured DOM highlight-move at 0.0205 ms against the canvas blit + highlight at 0.0227 ms — statistically indistinguishable. **The per-frame cost argument is not decisive and must not be the justification.** The decisive arguments are the O(1) arithmetic hit-test against 1,826 event targets, and `shadowBlur` (used at `lv >= 8`) having no DOM or SVG equivalent. DEC-011 resolves the remaining tension by pairing the canvas with a visually-hidden `<table>` — that table is **KW-029's** file, not this ticket's.

**The grid bitmap is a cache, not a redraw.** Measured at 1,826 cells, flush-forced: `fillStyle` per cell 0.338 ms; batched into 10 runs 0.255 ms; **blit a cached bitmap + one `strokeRect` 0.0225 ms** — 11–15× better, and 0.13 % of a 16.7 ms budget. The highlight itself costs 0.0005–0.0007 ms. The bitmap is `3,393 × 91 px` at the prototype's cell size, well under the 16,384 px dimension cap.

**Scale (C-27).** The corpus is **13,453 unique paths across 51 repos**, not the 7,354 entities / ~20 repos the viz-runtime track assumed, and `Max repo circles 24` should be ~**56**. GT-6 corroborates the order of magnitude: `aiur-team/aiur` alone has 7,342 unique paths.

**Colour (DEC-009, GT-15/16/17).** The comp's own OKLCh sweep is replaced by the gruvbox-anchored ramp because it hits `--green-d` at level 6 and `--green` at level 7 exactly, so a token change propagates. GT-15 dissolved the competing contrast argument: no 10-step ramp can satisfy WCAG 1.4.11 adjacent (3⁹ = 19,683:1 required, sRGB maximum 21:1), and both candidate ramps score 1.22–1.50 adjacent. The ramp itself is **KW-007's** module; this ticket only paints with it.

**Lifespan and ghosts (DEC-010).** The prototype accumulates — `drawGraph` gates files on `if (!f.seen) return;` and the source comment at line 714 says *"the graph accumulates: once a repo is reached it stays on the ring"*. Under DEC-010 visibility is `birth <= T <= death`, files vanish, and repositories whose era has ended relative to the cursor render as **dimmed ghost outlines**. That classification is KW-008's `repoPhase`; this ticket paints the three phases.

**Determinism (DEC-016).** Render may need jitter — cluster blob placement, sprite dither — and must get it from `randomHash(a, b)`, never from `nextRng`/`rngValue`. Render is called a different number of times than `step`, so a stream draw inside render desynchronises replay and destroys KW-031's baselines.

**Benchmarking hazard.** Chromium **defers** canvas commands. Without a forced `ctx.getImageData(0, 0, 1, 1)` flush, every microbenchmark reports 0.0000 ms; an entire earlier benchmark round was invalidated for exactly this reason. Any timing an agent takes while working this ticket must force the flush. All the numbers quoted here are Chromium SwiftShader **software raster** — they are the pessimistic bound. Treat them as conservative and re-measure on GPU before turning any of them into a hard runtime cap.

Requirements this ticket carries:

- **REQ-002** — design fidelity: the instrument pane reproduces the comp's geometry and colour channels at 1560 px, with the four measured geometry defects corrected rather than transcribed.
- **REQ-005** — the visualization plays repository and file history in reverse with honest lifespan semantics: entities appear as the cursor walks back into their active era and disappear once it passes below their birth, and repositories whose era has ended render as ghosts rather than vanishing.
- **REQ-006** — the client runtime is deterministic and testable: the same inputs produce the same frame, so CI can assert draw-command sequences before it asserts pixels.
- **REQ-007** — wherever colour carries meaning the encoding is verifiable and survives greyscale and common colour-vision deficiencies; every colour channel this ticket paints is paired with a non-colour channel (partial-height fill for actor share, dashed ring plus hatch for private, stroke weight plus dash for actor).

Plan context, all pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772` (browse at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/`):

| What | Where |
|---|---|
| Pack index, and the `KW-01..KW-32` → `KW-001..KW-032` zero-padding map | `docs/build-orders/site-rewrite/README.md` (pack sibling, same planning commit) |
| Wave and graph analysis, verified topological levels, critical path, write-surface partition proof | `docs/research/2026-07-31-decomposition-synthesis.md` §6 |
| Decision registry `D-01..D-17` (published as `DEC-001..DEC-017`) | same document, §3 |
| Human gates `HG-1..HG-7` (published as `GATE-001..GATE-007`) | same document, §4 |
| This ticket's implementation pointers | same document, §5, wave 3, entry "KW-22" |
| Grid tiers, ramp, cached-bitmap decision, sprites, the `ctx.filter` trap, and the full performance budget | `docs/research/2026-07-31-viz-runtime.md` §3, §4, §5, §6, §7 |
| The corrections that override that document's body — filter rule, blit rule, DOM node count, corpus scale | same document, "Verification corrections" C1, C2, C5, C6, C7 |
| Ribbon internal geometry, the anisotropic-gutter bug, Gource pane geometry and ring layout, encoded channels | `docs/research/2026-07-31-design-comp-spec.md` §6.1, §6.2, §6.4 |
| Accessibility surface the canvas cannot provide on its own | `docs/research/2026-07-31-viz-runtime.md` §9 |

## Scope

- Create `lib/viz/render/budget.ts`: the shared module for this directory — `RenderView`, `RenderTheme`, `RenderMeta`, `GridSeries`, `Quality`, the quality ladder, `DPR_CAP`, the measured unit-cost table, the recording/enforcing context Proxy, and `FrameReport`.
- Create `lib/viz/render/graph.ts`: the reverse-Gource painter — viewport projection with `clamp(16px, 4%, 40px)` margins, repo ring, ghost outlines, file satellites and spokes, beams, actor sprites, and the 27×31 ASCII sprite data with its gruvbox palette map.
- Create `lib/viz/render/ribbon.ts`: the detail contribution ribbon — integer device-pixel geometry with isotropic gutters, a cached offscreen bitmap, the playhead column wash plus hairline, weekday and month chrome, the agent birth rule, and the arithmetic hit-test.
- Create `lib/viz/render/overview.ts`: the five-year strip — cached bitmap, year rules and labels, the window brush, the birth rule, and the playhead hairline.
- Create `lib/viz/render/cluster.ts`: the private-repo cluster — build the blurred tile under exactly one filtered draw call, blit it axis-aligned at integer coordinates, feature-detect `ctx.filter`, and fall back to the hatch treatment.
- Correct the four measured geometry defects: the ribbon's anisotropic gutters, the Gource projection's absolute dead margins, the `ry`/`rx` cap flattening below 1080 px, and the uncapped per-frame `shadowBlur` and `fillText` counts.
- Instrument every frame and make the `ctx.filter`, blit-alignment, draw-call and cost invariants throw in development and test builds.
- Declare, locally and deliberately, the two ingest shapes this directory accepts — `GridSeries` and `RenderMeta` — so the renderer does not depend on the bundle codec.

## Non-goals

- No `requestAnimationFrame`, no accumulator, no clock, no `matchMedia`, no `?viz-test=1` harness; `lib/viz/driver.ts` and `lib/viz/testHarness.ts` are KW-024's write surface and exactly one file in the repository may call rAF.
- No simulation: `lib/viz/sim/step.ts` and `lib/viz/sim/layout.ts` are KW-021's files. This ticket never advances `tick`, `cursorDay`, `alpha`, `heat`, `beamLife`, `repoX/repoY` or the RNG.
- No changes to `lib/viz/sim/**` or `eslint.config.mjs`; both are KW-008's write surface.
- No colour data: `lib/viz/tokens/ramp.ts` and `lib/viz/tokens/level.ts` are KW-007's files, imported read-only.
- No React, no JSX, no `ResizeObserver`, no `<canvas>` element creation and no pointer or keyboard handlers; `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx` are KW-025's write surface.
- No transport controls, no `drawGame` port and no Bomberman residue to delete later; KW-026 owns the transport bar and audits this directory for game residue that must never have been written.
- No visually-hidden `<table>`, no `aria-label` text generation, no `role="img"`; DEC-011's text alternative is `components/viz/ContributionTable.tsx`, KW-029's file.
- No `vitest.config.mts`, no `test/setup.dom.ts`, no `test/canvas-recorder.ts`; those are KW-011's files and this ticket does not depend on KW-011.
- No committed test file. This ticket's write surface is five source modules; the enforcement it owns is the always-on runtime instrument in `budget.ts`, and the CI assertions that consume it belong to KW-024, KW-029 and KW-031.
- No dependency added and no npm script added: `package.json` and `package-lock.json` are frozen after KW-001 (DEC-003).
- No `public/data/**`, no `lib/bundle/**` import, no fetch, no network access of any kind.
- No screenshot baselines and no `e2e/**`; KW-031 owns visual regression.

## Existing owner and reuse target

`lib/viz/render/` **does not exist at the researched commit** — verified with `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772`, which lists no `lib/` path at all. This ticket creates the directory. There is no existing module to extend, so the reuse targets are upstream contracts and the prototype:

| Reuse target | Status at the researched commit | Who creates it |
|---|---|---|
| `docs/design/kevinweaver.dev.dc.html` | **Present**, 1,033 lines. This is the port source for all geometry, colour channels and draw ordering. | already committed |
| `public/images/kevin.png` | **Present**, 2,325 bytes, 270×310 8-bit RGBA (dimensions read from the IHDR: `0x0000010E × 0x00000136`). A 27×31 image stored at 10×. The sprite extraction source. | already committed |
| `lib/viz/sim/types.ts` — `SimState`, `PHASE_ABSENT`/`PHASE_LIVE`/`PHASE_GHOST`, `RepoPhase`, `MAX_BEAMS` | absent | **KW-008** (hard dependency) |
| `lib/viz/sim/cursor.ts` — `liveIdsAscending`, `repoPhase` | absent | **KW-008** (hard dependency) |
| `lib/viz/sim/rng.ts` — `randomHash` | absent | **KW-008** (hard dependency) |
| `lib/viz/tokens/ramp.ts` — `LV`, `AG`, `AG_SEMANTIC_MAX`, `PANE_SURFACE`, `rampColor`, `agentColor` | absent | **KW-007** (hard dependency) |
| `lib/viz/tokens/level.ts` — `Level`, `level`, `bandLabel`, `BAND_LABELS` | absent | **KW-007** (hard dependency) |
| `tsconfig.json`, `eslint.config.mjs`, `next@16.2.12`, `typescript`, `vitest@4.1.10` | absent (the tree is Next 10 / `.eslintrc.js` / `yarn.lock`) | **KW-001**, transitively via KW-007 and KW-008 |

Both hard dependencies are wave-2 tickets that merge before this one is picked up. Do not stub either of them: if `lib/viz/sim/types.ts` or `lib/viz/tokens/ramp.ts` is missing when this ticket is picked up, the dependency graph has been violated — stop and report it rather than writing a local copy, because a local copy of `SimState` is precisely the drift the contract/implementation split exists to prevent.

## Contract and invariants

This ticket is a **producer** for KW-024 (driver), KW-025 (instrument pane) and KW-029 (accessibility gate), and a **consumer** of KW-008 and KW-007. It quotes KW-008's and KW-007's sketches verbatim rather than restating their values, and it publishes the sketches below for its own consumers to quote verbatim in turn.

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

The exact `SimState` fields this directory reads, and nothing else:

`tick`, `cursorDay`, `cursorDayInt`, `entityCount`, `repoCount`, `dayCount`, `kind`, `repoOf`, `birth`, `death`, `alpha`, `heat`, `px`, `py`, `pr`, `repoAngle`, `repoX`, `repoY`, `repoR`, `repoAlpha`, `actorX`, `actorY`, `beamEnt`, `beamActor`, `beamKind`, `beamLife`, `beamHead`.

Everything the sim writes is in **unit space**. KW-021's producer contract fixes the four readings below; they are quoted here so this directory never guesses, and so the mapping to pixels lives in exactly one function:

- **`repoAngle[i]` is radians** on a viewport-independent unit circle. This module never re-derives the arc allocation; it reads the angle only to decide which side of a repo disc the label sits on (the prototype's `r.ang0`).
- **`repoX[i]`, `repoY[i]` are normalized `[0, 1]` of the canvas box**, easing toward `RING = { cx: 0.5, cy: 0.46, rx: 0.42, ry: 0.38, phase: 0.55 }`. The `0.46` vertical centre is the prototype's, not a typo for `0.5`.
- **`px[e]`, `py[e]` are `[-1, 1]` relative to the owning repo's unit disc** (centre `0,0`, radius `1`), and `pr[e]` is the file radius in those same unit-disc units. A file's field position is the repo's projected centre plus `(px, py)` scaled by the repo's projected disc radius. They are **not** field coordinates.
- **`repoR[i]` is the `packEnclose` result in file-radius units**, not pixels. `graphProjection` returns `repoRadiusScale`, and every repo disc radius in device pixels is `state.repoR[i] * proj.repoRadiusScale`; every file dot radius is `state.pr[e] * state.repoR[i] * proj.repoRadiusScale`.

Projection to device pixels is this ticket's job and nobody else's. If KW-021 changes any of the four, the fix goes in `graphProjection`, in this directory, in one place — never by re-deriving positions here and never by asking the sim for a viewport.

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

`AG` is **animation only** (C-6). It appears in the graph's actor tokens and in the ribbon's partial-height agent share indicator. It must never fill a grid cell: grid cells encode the combined human + agent count with `LV` alone.

### The shared surface this ticket publishes — `lib/viz/render/budget.ts`

```ts
import type { SimState } from '@/lib/viz/sim/types';
import type { Level } from '@/lib/viz/tokens/level';

/** The only 2D context type this directory names. */
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Clamp measured in the prototype (sizeAll, line 521) and re-justified by the dpr sweep. */
export const DPR_CAP = 2;

/**
 * The ONLY grid ingest shape lib/viz/render accepts. Declared locally and
 * deliberately: KW-022 does not depend on KW-012, so it must not import
 * lib/bundle/schema.ts. The adapter from the decoded bundle is written by
 * KW-024 in lib/viz/driver.ts.
 *
 * Day 0 is windowStartISO; indices increase with calendar time. dayCount is
 * read from the payload and is never a literal anywhere in this directory
 * (DEC-008).
 */
export interface GridSeries {
  readonly dayCount: number;
  readonly windowStartISO: string;
  /** Combined human + agent contribution count per day. Length dayCount. */
  readonly total: Uint16Array;
  /** Agent-only count per day. Length dayCount. Drives the partial-height fill. */
  readonly agent: Uint16Array;
  /** level(total[i]), precomputed by the caller with KW-007's level(). Length dayCount. */
  readonly level: Uint8Array;
  /** Day index of the agent's first commit, or -1 when it falls outside the window. */
  readonly agentBirthDay: number;
}

/**
 * Presentation metadata the sim does not carry. Also declared locally: the
 * bundle shape {id, short, actor, vol, stars, from, to, private, ext[]} is
 * KW-012's, and KW-024 adapts it to this.
 */
export interface RepoMeta {
  /** Display label, e.g. 'aiur'. For a private repo this MUST already be masked. */
  readonly short: string;
  /** 0 = human, 1 = agent, 2 = both. Drives the stroke colour and the beam dash. */
  readonly actor: 0 | 1 | 2;
  readonly stars: number;
  readonly isPrivate: boolean;
}

export interface RenderMeta {
  /** Length === state.repoCount, indexed by repo id. */
  readonly repos: readonly RepoMeta[];
  /**
   * File label for an entity id. MUST be pure and MUST return the mask
   * '••••••/•••••••' for any entity whose owning repo is private.
   */
  fileLabel(entityId: number): string;
  /**
   * Banner copy for the agent-birth moment, supplied from content/ by KW-024
   * (DEC-008: no copy literal in this directory). null suppresses the banner;
   * the purple birth rule still draws.
   */
  readonly agentBirthLabel: string | null;
  /** Sub-line under the banner, same rules. */
  readonly agentBirthSubLabel: string | null;
}

/**
 * Resolved design-system values. Every colour and every font size in this
 * directory comes from here; there are no colour or px literals in the
 * painters (the one exception is the sprite palette, which maps chars to
 * token NAMES, not to hexes).
 */
export interface RenderTheme {
  readonly lv: readonly string[];      // LV, verbatim from KW-007
  readonly ag: readonly string[];      // AG, verbatim from KW-007
  readonly paneSurface: string;        // PANE_SURFACE
  readonly token: Readonly<Record<TokenName, string>>;
  /** CSS px, resolved from --fs-micro / --fs-small / --fs-mono. */
  readonly fontPx: { readonly micro: number; readonly small: number; readonly mono: number };
  /** Resolved --mono font-family stack. */
  readonly fontFamily: string;
}

export type TokenName =
  | 'bgH' | 'bg0' | 'bg1' | 'bg2' | 'bg3' | 'bg4'
  | 'fg0' | 'fg1' | 'fg2' | 'fg3' | 'fg4' | 'gray'
  | 'green' | 'greenD' | 'aqua' | 'aquaD'
  | 'purple' | 'purpleD' | 'yellow' | 'yellowD' | 'red' | 'blue';

/**
 * The ONLY function in lib/viz/render/** that touches the DOM. Called once
 * per mount and once per theme change by KW-025, never by a render* function.
 * Named so that `grep -rn getComputedStyle lib/viz/render` returns exactly
 * one hit, in this file.
 */
export function resolveRenderTheme(el: Element): RenderTheme;

/** Adaptive degradation. Read by render/ only, NEVER by sim/ — quality changes must not affect determinism. */
export interface Quality {
  readonly name: 'full' | 'no-file-labels' | 'no-spokes' | 'no-shadows' | 'dpr1' | 'half-files';
  readonly dpr: number;
  readonly fileLabels: boolean;
  readonly spokes: boolean;
  readonly shadows: boolean;
  readonly maxFiles: number;
  readonly clusterMode: 'blur' | 'hatch';
}

/** Six rungs, in degradation order. QUALITY_LADDER[0] is 'full'. */
export const QUALITY_LADDER: readonly Quality[];
export function degrade(current: Quality): Quality;

export interface Viewport {
  /** CSS pixels, from getBoundingClientRect(). */
  readonly cssWidth: number;
  readonly cssHeight: number;
  /** Math.min(DPR_CAP, devicePixelRatio || 1), resolved by KW-025. */
  readonly dpr: number;
  /** Backing-store size: Math.round(cssWidth * dpr), Math.round(cssHeight * dpr). */
  readonly pxWidth: number;
  readonly pxHeight: number;
}

/** Everything a painter needs that is not SimState and not the ctx. Pure data. */
export interface RenderView {
  readonly viewport: Viewport;
  readonly theme: RenderTheme;
  readonly quality: Quality;
  readonly meta: RenderMeta;
  readonly budget: FrameBudget;
  /** Day index the ribbon should paint a keyboard focus ring on, or -1. Owned by KW-025. */
  readonly focusedDay: number;
}

/** Measured unit costs, microseconds. Chromium SwiftShader software raster: a pessimistic bound. */
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
  /** Empty when the frame is legal. Non-empty means at least one CAPS entry was breached. */
  readonly violations: readonly string[];
}

export interface FrameBudget {
  /** Zeroes the counters. Called once per frame by KW-024's driver, before any painter. */
  begin(): void;
  /** Seals the counters and returns the report. Also stored on `last`. */
  end(): FrameReport;
  /** The most recent sealed report, or null. KW-024's inspect() surfaces .drawCalls from here. */
  readonly last: FrameReport | null;
}

export function createFrameBudget(enforce: boolean): FrameBudget;

/**
 * Returns a Proxy over `ctx` that counts every draw call, tracks whether
 * `filter` is set at the moment of each call, and — when the budget was
 * created with enforce = true — throws on the first CAPS breach with the
 * violating call named.
 *
 * Production passes the RAW ctx: instrumentation is dev/test only and costs
 * nothing when it is not installed.
 */
export function instrumentContext(ctx: Ctx2D, budget: FrameBudget): Ctx2D;

/** Throws when report.violations is non-empty. Used by KW-024's harness and KW-031's e2e. */
export function assertFrameBudget(report: FrameReport): void;
```

### The painters

```ts
// lib/viz/render/overview.ts
export interface OverviewGeometry {
  readonly weeks: number;   // Math.ceil(grid.dayCount / 7)
  readonly cwPx: number;    // pxWidth / weeks — NOT rounded: the strip is a minimap
  readonly chPx: number;    // (pxHeight - labelStripPx) / 7
  readonly labelStripPx: number;
}
export interface OverviewLayer {
  readonly grid: GridSeries;
  /** Cached cell bitmap; null until the first render or after invalidate(). */
  bitmap: OffscreenCanvas | HTMLCanvasElement | null;
  bitmapKey: string;        // `${pxWidth}x${pxHeight}x${themeVersion}`
}
export function createOverviewLayer(grid: GridSeries): OverviewLayer;
export function overviewGeometry(view: RenderView, grid: GridSeries): OverviewGeometry;
/** Maps a CSS-pixel x offset to a day index, clamped to [0, dayCount - 1]. Pure. KW-025's drag handler calls this. */
export function overviewDayAtX(geom: OverviewGeometry, view: RenderView, cssX: number): number;
export function renderOverview(
  state: SimState, ctx: Ctx2D, view: RenderView, layer: OverviewLayer, winStartDay: number,
): void;

// lib/viz/render/ribbon.ts
export const RIBBON_WEEKS = 53;          // 371 days; the comp's window everywhere
export const RIBBON_WINDOW_DAYS = 371;
export interface RibbonGeometry {
  readonly cellPx: number;   // INTEGER device px
  readonly gapPx: number;    // INTEGER device px
  readonly stepPx: number;   // cellPx + gapPx, used for BOTH axes
  readonly originXPx: number; // INTEGER device px
  readonly originYPx: number; // INTEGER device px
  readonly gutterPx: number;  // weekday label gutter
  readonly monthStripPx: number;
}
export interface RibbonLayer {
  readonly grid: GridSeries;
  bitmap: OffscreenCanvas | HTMLCanvasElement | null;
  bitmapKey: string;
  /** First day index of the visible window. Mutated by renderRibbon via nextWinStart. */
  winStartDay: number;
  /** false once the user drags the overview; renderRibbon then stops following the playhead. */
  followPlayhead: boolean;
}
export function createRibbonLayer(grid: GridSeries): RibbonLayer;
export function ribbonGeometry(view: RenderView): RibbonGeometry;
/** Hysteresis: only moves when the target drifts more than 3 weeks-of-day from the current window. Pure. */
export function nextWinStart(
  prevWinStart: number, cursorDayInt: number, dayCount: number, followPlayhead: boolean,
): number;
/** KW-025 calls this from its pointer handler; it also clears followPlayhead. */
export function setRibbonWindow(layer: RibbonLayer, dayIndex: number): void;
/** O(1) arithmetic hit-test. Returns a day index or -1. Replaces 1,826 event targets. */
export function ribbonHitTest(
  geom: RibbonGeometry, view: RenderView, layer: RibbonLayer, cssX: number, cssY: number,
): number;
export function renderRibbon(state: SimState, ctx: Ctx2D, view: RenderView, layer: RibbonLayer): void;

// lib/viz/render/graph.ts
export interface GraphProjection {
  readonly padXPx: number;  // clamp(16, 0.04 * cssWidth, 40) * dpr
  readonly padYPx: number;  // clamp(16, 0.04 * cssHeight, 40) * dpr
  readonly fieldWPx: number;
  readonly fieldHPx: number;
  readonly cx: number;      // field centre x, device px
  readonly cy: number;      // field centre y, device px (the comp's 0.46, not 0.5)
  readonly rx: number;      // ellipse semi-axis, device px
  readonly ry: number;
  /**
   * Converts SimState's file-radius units to device px:
   * repoDiscPx = state.repoR[i] * repoRadiusScale.
   * Chosen so the largest repo disc fits the ellipse gap without overlap.
   */
  readonly repoRadiusScale: number;
  /** Repo count to draw. Reduced below a 1080 px CSS width to stop label collision. */
  readonly repoBudget: number;
}
export interface GraphLayer {
  sprites: SpriteAtlas | null;
  cluster: ClusterTile | null;
  /** Scratch buffer for liveIdsAscending. Allocated once, length entityCount. */
  liveScratch: Int32Array;
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
/** True when ctx.filter is honoured. Detected by assignment round-trip, once per session. */
export function supportsCanvasFilter(ctx: Ctx2D): boolean;
/**
 * Builds the tile. EXACTLY ONE draw call runs while ctx.filter is set: the
 * blobs are accumulated into ONE path and filled ONCE, or drawn unfiltered
 * into a source canvas that is then blitted once under the filter.
 * Deterministic: blob placement comes from randomHash(seed, i), never from
 * the RNG stream (DEC-016).
 */
export function buildClusterTile(
  theme: RenderTheme, quality: Quality, sizePx: number, seed: number,
): ClusterTile;
/** Blits the tile. xPx and yPx MUST be integers; the function asserts it in dev. */
export function renderCluster(
  ctx: Ctx2D, tile: ClusterTile, xPx: number, yPx: number, view: RenderView, labelledBy: string,
): void;
```

### Invariants

- **R-1 — the painters are pure.** `renderGraph`, `renderRibbon`, `renderOverview` and `renderCluster` read only their arguments. They call no clock (`Date.now`, `performance.now`, `new Date`), no `Math.random`, no `nextRng`/`rngValue`, no `requestAnimationFrame`, no timer, no `getComputedStyle`, no `document`, no `window`. The strengthened property that is actually asserted is: given the same `(state, ctx, view, layer)`, two consecutive calls emit an identical draw-command sequence. The `layer` argument is the *declared* mutable surface — the caches — and is part of the input.
- **R-2 — at most one draw call while `ctx.filter` is set, and zero per frame (C-25).** The only place in this directory that assigns `ctx.filter` is `buildClusterTile`, which runs on resize, on data change and on quality change — roughly five times per session. `ctx.filter` is restored to `'none'` in a `finally`. The instrument counts `filteredDrawCalls` and the per-frame cap is `0`.
- **R-3 — every blit is axis-aligned at integer device coordinates (C-25).** `drawImage` destination coordinates are integers; no `rotate` and no non-integer `translate` is in effect on any blit path. `save`/`restore`/`translate` are otherwise free and are used freely. The instrument counts `nonIntegerBlits` and `rotatedBlits`, and the cap on both is `0`.
- **R-4 — the ribbon lattice is isotropic at every width.** `ribbonGeometry` computes one integer `cellPx` and one integer `gapPx`, then advances **both** axes by `stepPx = cellPx + gapPx`. There is no `cw` and no separate `step`. The property `stepX === stepY` is structural, not asserted after the fact.
- **R-5 — all grid geometry is integer device pixels.** Cell size, gap, step and both origins are integers in the backing store. CSS-pixel values exist only inside `ribbonHitTest` and `overviewDayAtX`, which divide by `dpr` at the boundary. This is what makes R-3 free rather than fragile.
- **R-6 — visibility is read, never computed.** Files are drawn if and only if `isLive(state, id)`; repositories are drawn according to `repoPhase(state, id, state.cursorDayInt)`. There is no `seen` flag, no `entered` flag and no accumulation anywhere in this directory (DEC-010). Draw order for files comes from `liveIdsAscending` into `layer.liveScratch`, never from `state.live`, whose order is path-dependent (KW-008's invariant I-3).
- **R-7 — no payload literal.** `dayCount`, `windowStartISO` and every contribution figure come from `GridSeries` (DEC-008). `1826`, `2038`, `261`, `370`, `13453`, `4817`, `2021-08-01` and every contribution total are forbidden in this directory. `RIBBON_WEEKS = 53` and `RIBBON_WINDOW_DAYS = 371` are window-shape constants, not data, and are the only calendar numbers allowed.
- **R-8 — colour is never the only channel (REQ-007).** Actor share is a partial-height fill, not a hue. Private repositories carry a dashed ring and a hatch fill, not just a colour. Agent beams carry `lineWidth 2.2` plus `setLineDash([5, 4])` against human beams at `1.4` solid. Level 0 cells carry a 1 px inner stroke so an empty grid reads as a grid.
- **R-9 — quality never reaches the sim.** `Quality` is a field on `RenderView`, is read only inside this directory, and is never written to `SimState`. Degrading quality must not change a single value the digest covers.
- **R-10 — one allocation policy.** All caches (`bitmap`, `sprites`, `cluster`, `liveScratch`) hang off a `*Layer` object created once. A painter may allocate only the strings it passes to `fillText`.

## Refreshable implementation notes

Every path below is a full repository path. Everything is refreshable against `e664d73a195facd64db58ba10952170ff01b4772`.

### Files

| File | Contents |
|---|---|
| `lib/viz/render/budget.ts` | ~320 lines. All shared types above, `DPR_CAP`, `UNIT_COST_US`, `CAPS`, `QUALITY_LADDER`, `degrade`, `resolveRenderTheme`, `createFrameBudget`, `instrumentContext`, `assertFrameBudget`. No painting. |
| `lib/viz/render/cluster.ts` | ~140 lines. `supportsCanvasFilter`, `buildClusterTile`, `renderCluster`. Imports from `budget.ts` only. |
| `lib/viz/render/overview.ts` | ~190 lines. `createOverviewLayer`, `overviewGeometry`, `overviewDayAtX`, `renderOverview`, plus the private `buildOverviewBitmap`. |
| `lib/viz/render/ribbon.ts` | ~260 lines. `createRibbonLayer`, `ribbonGeometry`, `nextWinStart`, `setRibbonWindow`, `ribbonHitTest`, `renderRibbon`, plus the private `buildRibbonBitmap`. |
| `lib/viz/render/graph.ts` | ~450 lines. `createGraphLayer`, `graphProjection`, `project`, `renderGraph`, the private `drawRepo`/`drawGhost`/`drawFiles`/`drawBeams`/`drawActors`, and the sprite block (`SPRITE_W`, `SPRITE_H`, `EVERDRED_PXA`, `APPLEKID_PXA`, `SPRITE_PALETTE`, `createSpriteAtlas`). |

**These five files are the entire write surface.** Do not add a sixth file to `lib/viz/render/`. The sprite grids live as string arrays inside `graph.ts` because there is no sprite file in the surface; that is deliberate, and it is also what makes a recolour a one-line palette diff.

### `budget.ts` — the instrument

`instrumentContext` returns a `Proxy` with a `get`/`set` trap:

```ts
const DRAW_CALLS = new Set([
  'fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect',
  'fillText', 'strokeText', 'drawImage', 'putImageData',
]);

export function instrumentContext(ctx: Ctx2D, budget: FrameBudget): Ctx2D {
  const b = budget as InternalBudget;
  return new Proxy(ctx, {
    set(target, prop, value) {
      if (prop === 'filter') b.filterActive = value !== 'none';
      if (prop === 'shadowBlur') b.shadowActive = (value as number) > 0;
      Reflect.set(target, prop, value);
      return true;
    },
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function' || !DRAW_CALLS.has(prop as string)) {
        return typeof v === 'function' ? v.bind(target) : v;
      }
      return (...args: unknown[]) => {
        b.count(prop as string, args);
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  }) as Ctx2D;
}
```

`b.count` increments `drawCalls`, increments `filteredDrawCalls` when `filterActive`, increments `shadowPrimitives` when `shadowActive`, and for `drawImage` checks that the destination arguments are integers (`Number.isInteger`) and that the current transform has no rotation (`ctx.getTransform().b === 0 && ctx.getTransform().c === 0`). On a breach, with `enforce` true, it throws `Error('KW-022 frame budget: ' + violation)` naming the offending call.

`estimatedMs` is `(arcFills * 1.21 + lines * 2.55 + fillTextCalls * 1.57 + blits * 20.2 + filteredDrawCalls * 5440 + shadowPrimitives * 1.5 * 4.3) / 1000`. This is a cost *model*, not a timer — it is stable in CI, where wall-clock timing is not, and it is calibrated against the measured full scene: 20 repo circles + 800 file circles + 40 beams + 20 labels + 1 blurred cluster + a full-canvas clear = **3.952 ms at dpr 1** (23.7 % of 16.7 ms), 4.920 ms at dpr 1.5, 7.036 ms at dpr 2, 10.596 ms at dpr 3. Scaling is sub-quadratic in dpr because path setup is CPU geometry; clamping at `DPR_CAP = 2` saves 34 % against dpr 3, which is the measured justification for the prototype's `Math.min(2, window.devicePixelRatio || 1)` at line 521.

`QUALITY_LADDER` degrades in this order, from viz-runtime §7.3: (1) drop file labels, (2) drop spokes, (3) drop `shadowBlur`, (4) drop dpr to 1, (5) halve `maxFiles` to 1,000. Rung 0 is `full`. KW-024 owns the rolling-median trigger (12 ms for 30 consecutive frames); this ticket only owns the ladder and the flags.

`resolveRenderTheme(el)` calls `getComputedStyle(el)` once and reads `--bg-h`, `--bg0`…`--bg4`, `--fg0`…`--fg4`, `--gray`, `--green`, `--green-d`, `--aqua`, `--aqua-d`, `--purple`, `--purple-d`, `--yellow`, `--yellow-d`, `--red`, `--blue`, `--mono`, `--fs-micro`, `--fs-small`, `--fs-mono`. It falls back to KW-007's `LV`/`AG`/`PANE_SURFACE` for the ramp, which are already exact token values. **Canvas font sizes come from `theme.fontPx`, never from a `9px` literal** — the comp hardcodes `'700 9px "JetBrains Mono", monospace'` in five places and every one of them must become `` `700 ${theme.fontPx.micro}px ${theme.fontFamily}` ``.

### `ribbon.ts` — the geometry fix, worked

The prototype (`drawRibbon`, lines 575–577):

```js
const weeks = 53, left = 28, top = 20;
const cw = (W - left) / weeks, cell = Math.min(cw - 2.5, (H - top - 14) / 7 - 2.5), step = cell + 2.5;
// x = left + w * cw          y = top + d * step        <-- the bug
```

The replacement, in device pixels, integers throughout:

```ts
export function ribbonGeometry(view: RenderView): RibbonGeometry {
  const { pxWidth, pxHeight, dpr } = view.viewport;
  const gutterPx = Math.round(28 * dpr);       // weekday labels: mon / wed / fri
  const monthStripPx = Math.round(20 * dpr);   // month labels
  const footerPx = Math.round(14 * dpr);       // birth-rule label
  const gapPx = Math.max(1, Math.round(2.5 * dpr));

  const byWidth = Math.floor((pxWidth - gutterPx) / RIBBON_WEEKS) - gapPx;
  const byHeight = Math.floor((pxHeight - monthStripPx - footerPx) / 7) - gapPx;
  const cellPx = Math.max(1, Math.min(byWidth, byHeight));
  const stepPx = cellPx + gapPx;               // ONE step, BOTH axes

  const blockWPx = RIBBON_WEEKS * stepPx;
  const originXPx = gutterPx + Math.max(0, Math.floor((pxWidth - gutterPx - blockWPx) / 2));
  const originYPx = monthStripPx;
  return { cellPx, gapPx, stepPx, originXPx, originYPx, gutterPx, monthStripPx };
}
```

Worked numbers at the measured desktop width, `dpr = 1`:

| | prototype, `H = 140` | this ticket, `H = 200` (`clamp(120px, 20vh, 200px)` at 1080p) |
|---|---|---|
| `W` | 1198 | 1198 |
| horizontal advance | `cw = 22.075` | `stepPx = 22` |
| vertical advance | `step = 15.143` | `stepPx = 22` |
| cell | `12.643` | `19` |
| horizontal gutter | **9.43 px** | **3 px** |
| vertical gutter | **2.5 px** | **3 px** |
| verdict | columns of dashes | square lattice |

At `W = 360` (a 320–414 px phone plus chrome), `dpr = 3`, `H = 120`: `gutterPx = 84`, `gapPx = 8`, `byWidth = floor((1080 - 84) / 53) - 8 = 18 - 8 = 10`, `byHeight = floor((360 - 60 - 42) / 7) - 8 = 36 - 8 = 28`, so `cellPx = 10`, `stepPx = 18`, `blockWPx = 954`, `originXPx = 84 + floor((1080 - 84 - 954) / 2) = 84 + 21 = 105`. Isotropic, integer, centred. The crossover between width-bound and height-bound moves, but isotropy never does — that is the point of R-4.

**The height change lives in CSS, not here.** `ribbonGeometry` reads whatever `pxHeight` it is given. The `clamp(120px, 20vh, 200px)` box is KW-025's `components/viz/Ribbon.tsx`; record it in this ticket's PR description so KW-025 picks it up.

**The cached bitmap.** `buildRibbonBitmap(layer, geom, theme)` paints the whole corpus at ribbon resolution into an `OffscreenCanvas` of `ceil(grid.dayCount / 7) * stepPx` by `7 * stepPx`. At the prototype's 13 px step and a five-year window that is exactly the measured `3,393 × 91 px`; at `stepPx = 22` it is `261 × 22 = 5,742 px` wide, still far under `CAPS.maxBitmapEdgePx = 16384`, and under it again at dpr 2. **Guard the cap anyway**: when `weeks * stepPx > CAPS.maxBitmapEdgePx`, set `layer.bitmap = null` and paint the visible 371 cells directly each frame — 371 `fillRect` calls is ~0.07 ms, still inside budget. The bitmap key is `` `${pxWidth}x${pxHeight}x${stepPx}` ``; rebuild only when the key changes or the grid changes.

Per frame, on top of the blit: one `drawImage` at `sx = weekOffset * stepPx` (an integer by R-5), then the playhead — a column wash `rgba(fg0, .05)` over the week column and a 1 px `strokeRect` at `rgba(fg0, .42)` on the exact day cell. That is the prototype's approach at lines 612–618 and it is right: *a soft column plus a hairline, never a jumping box.* Measured cost of the highlight: 0.0005–0.0007 ms.

**Window hysteresis** (`nextWinStart`): the prototype only moves the window when it drifts more than 3 days — `if (Math.abs(w - this.winStart) > 3)` inside `loop`. Keep the rule; the target is `clamp(cursorDayInt - 185, 0, dayCount - RIBBON_WINDOW_DAYS)`. When `followPlayhead` is false the window is frozen: the prototype latches `userWin = true` on drag and offers **no way to un-latch**, which is a defect — `setRibbonWindow` sets the latch and KW-025 must ship a visible "follow playhead" affordance plus `Esc` to release it.

**Chrome to port**: the weekday gutter (`mon`/`wed`/`fri` at rows 0/2/4), the month-label strip with the 26 px minimum label spacing from the prototype's `lastLabelX` guard, the per-cell agent band `fillRect(x, y + cell * (1 - share), cell, cell * share)` with the `rgba(bgH, .5)` 1 px separator when the day also has human contributions, the green breathing ring on today's cell, and the purple birth rule with its `◆ agent initialized` label. The breathing ring's phase comes from `state.tick`, **never** from `performance.now()` as the prototype does.

**`ribbonHitTest`** replaces `hover` (line 686). Same arithmetic, one division per axis, no event targets:

```ts
const xPx = cssX * view.viewport.dpr, yPx = cssY * view.viewport.dpr;
const w = Math.floor((xPx - geom.originXPx) / geom.stepPx);
const d = Math.floor((yPx - geom.originYPx) / geom.stepPx);
if (w < 0 || w >= RIBBON_WEEKS || d < 0 || d > 6) return -1;
const i = layer.winStartDay + w * 7 + d;
return i >= 0 && i < layer.grid.dayCount ? i : -1;
```

The tooltip content it feeds — date, `total` contributions, `bandLabel(level)`, per-actor split — is KW-025's DOM, not this ticket's.

### `overview.ts`

Port `drawOverview` (537–568) largely as-is; it is the one method with no measured defect. Weeks is `Math.ceil(grid.dayCount / 7)`; `cw = pxWidth / weeks`; `ch = (pxHeight - labelStrip) / 7`; cells are drawn gapless with `fillRect(x, y, max(1, cw - 0.4), max(1, ch - 0.4))`. **The overview strip is exempt from R-4** — it is a ~1,305 px minimap in a 50 px strip and its cells are deliberately not square; only the ribbon carries the isotropy invariant.

Cache the cells as a bitmap on the same key rule as the ribbon. Per frame draw, in this order: blit; year rules (`rgba(bg2, .85)` 1 px) and year labels; the purple birth rule at `agentBirthDay`; the window brush (two `rgba(15,16,17,.6)` scrims either side of `[winStartDay, winStartDay + RIBBON_WINDOW_DAYS]` and a `rgba(fg0, .75)` 1.5 px `strokeRect`); the playhead hairline at `rgba(fg0, .9)`.

**The year labels are the only place a calendar year appears.** Derive them from `grid.windowStartISO` by counting days, not by constructing `Date.UTC(y, 0, 1)` — this directory does no date arithmetic (KW-008's invariant I-7 for the sim, extended here for the same reason). If the caller needs real year boundaries, KW-024 supplies them on `GridSeries`; if that turns out to be necessary, add `readonly yearBoundaryDays: Int32Array` to `GridSeries` in this file and tell KW-024. Do not import a date library and do not call `new Date`.

### `graph.ts`

**Projection.** Replace the comp's `const P = (r) => ({ x: 40 + r.px * (W - 80), y: 34 + r.py * (H - 74) })` with:

```ts
const padXPx = clamp(16 * dpr, 0.04 * pxWidth, 40 * dpr);
const padYPx = clamp(16 * dpr, 0.04 * pxHeight, 40 * dpr);
```

At the measured desktop field (1194 × 602 CSS at a 1080p viewport, from `1560 − 28 − 14 − 320 − 4` wide and `100vh − 60 − 274 − 14 − 32 − 38` tall, aspect ≈ 1.98:1) this reproduces the comp's 40 px. At the ≤720 px breakpoint's forced 340 px height it yields 16 px instead of 74 px of vertical dead space — recovering 17 % of the canvas.

**Ring caps.** The prototype recomputes `rx = min(0.42, rpx / (W - 80))` and `ry = min(0.38, rpx / (H - 74) * 0.82)` inside `drawGraph`, which is what pins `ry` to its cap at the forced 340 px and 420 px heights and flattens the ring until labels collide. **Do not port that computation.** KW-021 owns the ring as the fixed normalized `RING = { cx: 0.5, cy: 0.46, rx: 0.42, ry: 0.38 }` and writes eased `repoX`/`repoY` in `[0, 1]`; this module only multiplies by `fieldWPx`/`fieldHPx` and offsets by the padding. `proj.rx`/`proj.ry` are therefore derived (`RING.rx * fieldWPx`, `RING.ry * fieldHPx`) and are exported for label placement and for the reduced-set decision, not for layout. Below a **1080 px CSS width**, set `proj.repoBudget` to the 12 most-recently-active repositories and skip the rest — the synthesis's "render a reduced repo set" — rather than shrinking labels below `theme.fontPx.micro`.

**Draw order**, matching the prototype so the visual reads the same: clear to `theme.paneSurface` → beams → repositories (ghost, then live) → file satellites and spokes → repo labels and star counts → the private cluster → actors → the convergence line. The prototype's `flash` overlay and its `'its-applekid initialized'` banner are **content**, not chrome — they are driven by `state.cursorDayInt` crossing the agent birth day, and the copy comes from `content/` (KW-006), not from a literal here. Take the strings from `view.meta.agentBirthLabel` and `view.meta.agentBirthSubLabel`; when either is `null`, draw the rule and omit that line rather than hardcoding the sentence.

**Ghosts (DEC-010).** `repoPhase(state, id, state.cursorDayInt)`:

- `PHASE_ABSENT` → draw nothing.
- `PHASE_LIVE` → full treatment: radial-gradient fill from `theme.lv[lvv]` at `3a` alpha to `rgba(bgH, .92)`; stroke `--purple-d` for an agent repo, `--yellow-d` for both, `--aqua-d` for a human repo, `lineWidth 1.5`; the cream prestige halo at `R + 6` when `prestige > 0.05`, where `prestige = clamp((log10(stars + 1) - 2) / 2.2, 0, 1)`. The halo is a **separate channel from volume** — reputation is a halo, not a bigger circle.
- `PHASE_GHOST` → a 1 px dashed outline at `rgba(bg4, .45)`, no fill, no halo, no files, no label beyond the repo short name at `--bg4`. This is the honest alternative to the prototype's accumulation and it is the visible difference a reviewer will look for first.

**Files.** Enumerate with `liveIdsAscending(state, layer.liveScratch)`, take the first `min(count, quality.maxFiles)` after sorting by `state.heat` descending — the cap is `CAPS.maxFileCircles = 2000`, measured at 2.45 ms, against a modelled peak live set of 869. Position is `repoCentre + (state.px[e], state.py[e]) * discPx` where `discPx = state.repoR[repoOf[e]] * proj.repoRadiusScale`, and the dot radius is `state.pr[e] * discPx` floored at 1 px. `px`/`py` are unit-disc coordinates in `[-1, 1]`, not field coordinates — projecting them as if they were field coordinates piles every file into the top-left corner, which is the first thing to check if the graph looks wrong. Draw a spoke only when `state.heat[e] > 0.15`; the prototype draws one spoke per *visible* file, uncapped, and long lines cost by **length** (2.55 µs at ~640 px), so this is the single most expensive uncapped thing in the scene. Draw a file label only when `state.heat[e] > 0.55` and `quality.fileLabels`, capped at `CAPS.maxFillText = 200`. Apply `shadowBlur` only when `state.heat[e] > 0.3` and `quality.shadows`, capped at `CAPS.maxShadowPrimitives = 48` — `shadowBlur` carries a measured **5.3×** penalty and the prototype applies it per-file with no cap at all.

**Beams.** Read the fixed ring buffer `state.beamEnt`/`beamActor`/`beamKind`/`beamLife`/`beamHead`, capacity `MAX_BEAMS = 256` from KW-008. Kind colours from the theme: commit `--aqua`, pr `--purple`, issue `--yellow`, review `--blue`. Agent beams `lineWidth 2.2` with `setLineDash([5, 4])`; human beams `1.4` solid. That dash is the primary actor differentiator on the graph and is the non-colour channel R-8 requires. **Never decrement `beamLife` here** — that is `step`'s job in KW-021.

**Sprites.** The prototype's `drawActor` (828–847) draws an aqua circle labelled `kw` and a **rotated** purple square labelled `ak`; the rotated square is a path draw so it does not violate R-3, but the ticket replaces both with blitted sprites, and a blitted sprite must not be rotated. `public/images/kevin.png` is 270 × 310, 2,325 bytes, 8-bit RGBA, non-interlaced, with a GCD of 10 on every colour run length on both axes and zero non-uniform pixels inside the 10×10 blocks — it is a **27 × 31 image stored at 10×**. Its 11 opaque colours (`#ffffff #090909 #271d14 #100a05 #070201 #a87468 #cca68e #ebc0a8 #facabc #ffded2 #794d43`) contain **no gruvbox token**, and at the r ≈ 11 px draw size a 270 px bitmap either turns to mush with smoothing or aliases without it.

Ship instead a 27 × 31 ASCII grid plus a palette that maps each character to a **token name**, so a non-gruvbox colour cannot enter by accident:

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

`createSpriteAtlas(theme, dpr)` walks each grid once and `fillRect(x, y, 1, 1)`s into a 27 × 31 `OffscreenCanvas`, then keeps one pre-scaled copy per integer zoom (1×, 2×, 3×) with `imageSmoothingEnabled = false`. Per-frame cost is one `drawImage` — measured at 0.0202 ms for a 300 px tile, and a 27 px sprite is strictly cheaper. The grid plus palette is 868 + 96 = **964 bytes raw** per sprite against 2,325 for the PNG, and it gzips to nearly nothing because it is mostly repeated characters.

Produce `EVERDRED_PXA` by re-running the PNG extraction: read `public/images/kevin.png`, decode, sample every 10th pixel on both axes, and map each of the 11 opaque colours to the nearest gruvbox token by CIEDE2000. **Do this with a throwaway script outside the repository** (`/tmp/extract-sprite.mjs`); `scripts/**` is not in this ticket's write surface and the PNG stays in the repository as provenance. Hand-author `APPLEKID_PXA` against the extracted human grid as a proportion reference — shoulders start at row 18, the head occupies rows 4–17, body width 21 px — so the two read as a matched pair at 22 px. If hand-authoring stalls, derive it programmatically by replacing the face region with a filled rect and remapping the palette; the silhouette then matches by construction at the cost of a less characterful head.

Fallback when `typeof OffscreenCanvas === 'undefined'`: rasterize into a detached `document.createElement('canvas')` — but that reads `document`, which R-1 forbids in a painter, so it must happen inside `createSpriteAtlas`, which is a *factory* called by KW-025 at mount, not inside `renderGraph`. If neither is available, fall back to the prototype's primitives (`arc` + `fillText('kw')`, `fillRect` + `fillText('ak')`), which are path draws and need no blit at all.

The agent's idle animation is one palette index swapped on `(state.tick / 45) % 2` — the block cursor blinks, no second sprite. Under a reduced-motion static frame (KW-024 renders `tick = 0`) it simply does not blink.

### `cluster.ts` — the one place `ctx.filter` is allowed

```
build (on resize, on data change, on quality change — ~5 times per session):
  src: OffscreenCanvas(300, 300)
    ~60 filled circles in --bg2 / --bg3, positions and radii from randomHash(seed, i)
    radii proportional to the measured private volume per period
  tile: OffscreenCanvas(300, 300)
    ctx.filter = 'blur(9px)'
    ctx.drawImage(src, 0, 0)          <-- EXACTLY ONE draw call under the filter
    ctx.filter = 'none'               <-- in a finally
  measured cost: 0.196–0.243 ms, once

per frame:
  ctx.drawImage(tile, xInt, yInt)                            // 0.0202 ms
  ctx.setLineDash([6, 5]); ctx.strokeStyle = token.bg3; ctx.arc(...); ctx.stroke();
  ctx.fillText('private repos', ...)
```

Feature-detect once per session by assignment round-trip: `ctx.filter = 'blur(2px)'; const ok = ctx.filter === 'blur(2px)'; ctx.filter = 'none';`. When unsupported — or when `quality.clusterMode === 'hatch'` — build the hatch tile instead: the prototype already draws hatched diagonals clipped to a circle at `if (r.priv)` (line 771), measured at 0.702–0.743 ms, which is 4.2 % of budget. **The hatch is a legitimate primary, not just a fallback**: it needs no offscreen, no feature detection, and "redacted" reads better as a terminal texture than as a soft blur in a design system that is a tmux session. Ship blur as the default and hatch as the fallback; if the blur path costs a single turn more than it is worth, ship hatch only and record the choice in the PR body.

Bake alpha into the tile at build time. Drift the tile by animating `xInt`/`yInt` — **integers only** — never by re-blurring and never by rotating. Alpha on the blit costs a measured 0.022 ms and a half-pixel offset costs 0.160 ms; rotation costs 0.405 ms.

Security note to carry into the tooltip copy: this is **honest redaction**. `restrictedContributionsCount` gives private *volume* with no repository names and no paths, so the cluster is generated from a count, not from obscured real data. There is nothing to leak, and the tooltip should say so.

### Version pins

This ticket adds nothing. `package.json` and `package-lock.json` are frozen after KW-001 (DEC-003) and must be byte-identical in the diff. Everything below is already installed by KW-001: `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript` (KW-001's pin), `eslint@9.39.5`, `eslint-config-next@16.2.12`, `vitest@4.1.10`. `d3-hierarchy@3.1.2` is installed but is **KW-021's** dependency, not this ticket's — `lib/viz/render/**` must not import it. `d3-force` and `gsap` must not appear in the dependency tree at all.

## Acceptance and verification

### Agent gate

- `npm run typecheck` exits 0.
- `npm run lint` exits 0.
- `npm run build` exits 0.
- `grep -rnE "Math\.random|Date\.now|performance\.now|new Date|requestAnimationFrame|setTimeout|setInterval" lib/viz/render/` returns nothing.
- `grep -rn "getComputedStyle" lib/viz/render/` returns exactly one hit, inside `resolveRenderTheme` in `lib/viz/render/budget.ts`.
- `grep -rn "document\.\|window\." lib/viz/render/` returns hits only inside `resolveRenderTheme` and `createSpriteAtlas`, never inside a function whose name begins `render`.
- `grep -rnE "\.filter\s*=" lib/viz/render/` returns hits only in `lib/viz/render/cluster.ts`, and every one is inside `buildClusterTile` or `supportsCanvasFilter`.
- `grep -rniE "bomberman|drawGame|walkable|userPlay" lib/viz/render/` returns nothing.
- `grep -rnE "\b(1826|2038|13453|4817|261|370)\b" lib/viz/render/` returns nothing (DEC-008); `53` and `371` appear only as `RIBBON_WEEKS` and `RIBBON_WINDOW_DAYS`.
- `grep -rnE "[0-9]+px \\\"?JetBrains" lib/viz/render/` returns nothing — every canvas font string interpolates `theme.fontPx` and `theme.fontFamily`.
- `grep -rn "d3-hierarchy\|d3-force\|gsap" lib/viz/render/` returns nothing.
- A **throwaway** spec at `lib/viz/render/__gate__.test.ts`, run with `npx vitest run lib/viz/render/__gate__.test.ts` and **deleted before commit**, drives all five modules against a hand-rolled recording fake `CanvasRenderingContext2D` (an object literal implementing the `DRAW_CALLS` methods plus `getTransform`, `save`, `restore`, `translate`, `beginPath`, `arc`, `moveTo`, `lineTo`, `setLineDash`, `measureText`, `createRadialGradient`) and a synthetic 13,453-entity / 51-repo `SimState` fixture, and asserts:
  - two consecutive `renderGraph` / `renderRibbon` / `renderOverview` calls with the same `(state, ctx, view, layer)` produce identical command logs (R-1);
  - `report.filteredDrawCalls === 0` for every rendered frame, and `buildClusterTile` produces exactly **one** draw call while `filter !== 'none'` (R-2);
  - `report.nonIntegerBlits === 0` and `report.rotatedBlits === 0` (R-3);
  - `ribbonGeometry` returns `stepPx` used on both axes, and for every width in `[320, 360, 414, 720, 830, 1024, 1194, 1198, 1560, 2560]` × dpr in `[1, 2]` the horizontal and vertical gutters are equal and `cellPx >= 1` (R-4);
  - `cellPx`, `gapPx`, `stepPx`, `originXPx` and `originYPx` are all integers at every one of those widths (R-5);
  - a repository at `PHASE_GHOST` emits an outline and no fill, one at `PHASE_ABSENT` emits nothing, and no code path reads a `seen` or `entered` field (R-6);
  - `report.estimatedMs` for the reference scene is under `CAPS.frameBudgetMs = 8`, and `report.violations` is empty;
  - `nextWinStart` does not move the window for a 3-day drift and does move it for a 4-day drift, and returns `prevWinStart` unchanged when `followPlayhead` is false;
  - `ribbonHitTest` round-trips: for every day in the visible window, the centre of that day's cell maps back to that day index, and a point in the gutter returns `-1`;
  - `renderGraph` never calls `nextRng` or `rngValue` — asserted by importing `lib/viz/sim/rng.ts` and spying, or by `grep` if spying is unavailable.
- The extracted `EVERDRED_PXA` is exactly 31 strings of exactly 27 characters, every character is either `' '` or a key of `SPRITE_PALETTE`, and every value of `SPRITE_PALETTE` is a member of `TokenName` — asserted in the same throwaway spec.

### At-merge gate

- `ci-ok` is green on the exact PR head commit.
- The PR diff touches exactly five files, all under `lib/viz/render/`, and nothing else. In particular `package.json`, `package-lock.json`, `eslint.config.mjs`, `tsconfig.json`, `lib/viz/sim/**`, `lib/viz/tokens/**` and `test/**` are unmodified.
- No file under `lib/viz/render/` imports from `lib/bundle/**`, `app/**`, `components/**`, `content/**`, `scripts/**`, `react` or `next`.
- The five acceptance properties from the plan hold and are named in the PR body: `ctx.filter` set for at most one draw call; all blits axis-aligned at integer coordinates; ribbon cells square with isotropic gutters at every width; the frame budget instrumented and asserted; render modules pure functions of their inputs.
- The PR body records the two facts KW-025 must consume: the ribbon box becomes `clamp(120px, 20vh, 200px)`, and the canvas backing store is sized with `Math.min(2, devicePixelRatio || 1)`.
- The throwaway gate spec is absent from the diff.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.**

- `ctx.filter` unsupported, or `quality.clusterMode === 'hatch'` → the hatch tile, measured at 0.702–0.743 ms. Detected once per session by assignment round-trip, never per frame.
- `OffscreenCanvas` unavailable → `createSpriteAtlas` and the bitmap builders fall back to a detached `<canvas>` inside the factory; if that also fails, `layer.bitmap` stays `null` and the painter draws cells directly at ~0.07 ms for the visible window. No painter throws for a missing cache.
- Bitmap edge would exceed 16,384 px → skip the cache, draw directly, log nothing. Guarded explicitly rather than left to the browser.
- `grid.dayCount === 0`, `state.repoCount === 0`, or an empty live set → clear to `theme.paneSurface` and return. Never throw, never divide by zero: `overviewGeometry` guards `weeks < 1`.
- A `NaN` or `Infinity` reaching a coordinate → the instrument's integer/finite check on `drawImage` catches the blit case and the `violations` list catches the rest. In production the instrument is not installed and a `NaN` silently no-ops in canvas, which is the correct degradation: a missing primitive, not a crashed page.
- The frame budget is exceeded → this ticket only *reports* it. KW-024 owns the rolling-median trigger and calls `degrade`. A budget breach must never throw in production.

**Security.**

- No secrets, no network, no filesystem. This directory has no I/O of any kind.
- The private-repo cluster is synthesised from a **count** (`restrictedContributionsCount`), never from obscured real data. A 67-month sweep requesting `repository{nameWithOwner isPrivate}` on all four contribution connections leaked **zero** private repository names even as the repository owner with a repo-scoped token — GitHub structurally refuses. There is nothing here to de-blur.
- `RenderMeta.fileLabel` and `RepoMeta.short` must already be masked for private repositories (`••••••/•••••••`). This directory must not receive a real private path and must not attempt to mask one itself — masking at the render layer would mean the real string had already reached the client bundle.
- DEC-015: the phone number `<redacted-personal-phone>` must not appear in this directory, in code, in a comment, or in a sprite palette.

**Migration.** None. `lib/viz/render/` does not exist at the researched commit; nothing is being replaced, no data is being moved, and there is no compatibility window. The prototype is a design document, not shipped code.

**Accessibility.**

- Canvas is opaque to `axe` and to screen readers. The comp has **zero** `aria-*`, `role`, `tabindex` or `alt` attributes anywhere in the file, so everything a11y is new work — but the DEC-011 hidden `<table>`, the `role="img"` label and the `<input type="range">` behind the overview strip are **KW-029's** and **KW-025's** files. This ticket contributes three things and only three:
  1. `focusedDay` on `RenderView`. When it is `>= 0`, `renderRibbon` paints a 2 px `--fg0` focus ring on that day's cell, offset outward by `gapPx` so it is visible against every ramp level. Without this the keyboard focus KW-025 wires up would be invisible on canvas.
  2. R-8's non-colour channels, so nothing on any canvas is encoded by hue alone.
  3. A 1 px inner stroke on level-0 cells (DEC-009), so an empty grid reads as a grid at a 1.41:1 contrast ratio against the pane rather than disappearing.
- WCAG 1.4.11 adjacent-level contrast is **arithmetically unsatisfiable** for any 10-step ramp (3⁹ = 19,683:1 required, sRGB maximum 21:1). Do not attempt to fix it in the ramp and do not assert it. Conformance comes from the DEC-011 text alternative.
- No text is drawn below `theme.fontPx.micro`. The prototype's hardcoded `9px` strings are the thing being removed; if the resolved `--fs-micro` is 11 px, the canvas draws 11 px.
- `shadowBlur` is decorative in every use here. Quality rung 3 removes it and no meaning is lost — that is the test for whether a visual channel is decorative.
- Reduced motion is not handled here. KW-024 renders one static frame at `tick = 0` through this same painter path, which is exactly why there must be no second, simpler "static" code path in this directory.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, public/images/kevin.png, lib/viz/sim/types.ts, lib/viz/sim/cursor.ts, lib/viz/sim/rng.ts, lib/viz/tokens/ramp.ts, lib/viz/tokens/level.ts, docs/research/2026-07-31-viz-runtime.md, docs/research/2026-07-31-design-comp-spec.md, docs/research/2026-07-31-decomposition-synthesis.md, package.json, tsconfig.json
- Writes: lib/viz/render/graph.ts, lib/viz/render/ribbon.ts, lib/viz/render/overview.ts, lib/viz/render/cluster.ts, lib/viz/render/budget.ts
- Contracts: lib/viz/render/budget.ts#RenderView, lib/viz/render/budget.ts#RenderTheme, lib/viz/render/budget.ts#GridSeries, lib/viz/render/budget.ts#RenderMeta, lib/viz/render/budget.ts#Quality, lib/viz/render/budget.ts#FrameBudget, lib/viz/render/budget.ts#FrameReport, lib/viz/render/graph.ts#renderGraph, lib/viz/render/ribbon.ts#renderRibbon, lib/viz/render/ribbon.ts#ribbonHitTest, lib/viz/render/overview.ts#renderOverview, lib/viz/render/cluster.ts#buildClusterTile
- Safety: canvas-frame-budget-invariants, privacy:private-repo-cluster-synthesis

## Sibling boundaries and open gates

**Same wave (phase 3).** Eleven tickets run in this wave and every one owns a disjoint set of files (DEC-005). There are no `serializes_with` edges anywhere in this Build Order.

| Ticket | Owns | Boundary with KW-022 |
|---|---|---|
| KW-021 | `lib/viz/sim/step.ts`, `lib/viz/sim/layout.ts`, `test/viz/step.test.ts` | The tightest seam in the pack: KW-021 **writes** every `SimState` field this ticket **reads**, and the two run in parallel because both depend only on KW-008. Neither may create a file in the other's directory. The four unit readings in "Contract and invariants" are quoted from KW-021's producer contract — `repoAngle` radians, `repoX`/`repoY` normalized `[0, 1]`, `px`/`py` in `[-1, 1]` of the repo's unit disc, `repoR`/`pr` in file-radius units. `RING` and `RING_ENTRY_SCALE` are KW-021's exports; do not re-declare them here and do not port the prototype's per-frame `rx`/`ry` recomputation. If KW-021 changes a unit, the correction goes in `graphProjection`, never in `sim/`. |
| KW-015 | `lib/bundle/loader.ts` | This ticket must not import it. `GridSeries` and `RenderMeta` are declared locally and deliberately; KW-024 writes the adapter. |
| KW-013, KW-014 | `scripts/pipeline/**`, `data/.pipeline-state.json` | no shared file, no shared concept. |
| KW-016, KW-017, KW-018, KW-019, KW-020 | `app/regions/**` | no shared file. Region tickets never import `lib/viz/render/**`; only KW-025 does. |
| KW-023 | `playwright.config.ts`, `e2e/smoke.spec.ts`, `.github/workflows/e2e.yml` | no shared file. This ticket writes no e2e spec and no workflow. |

**Upstream, both hard dependencies, both merged before pickup.**

| Ticket | What this ticket consumes |
|---|---|
| KW-008 | `SimState`, `PHASE_ABSENT`/`PHASE_LIVE`/`PHASE_GHOST`, `RepoPhase`, `MAX_BEAMS`, `liveIdsAscending`, `repoPhase`, `isLive`, `randomHash`. Never `nextRng` or `rngValue` — a stream draw in render desynchronises replay. |
| KW-007 | `LV`, `AG`, `AG_SEMANTIC_MAX`, `PANE_SURFACE`, `rampColor`, `agentColor`, `Level`, `level`, `bandLabel`. Never a hex literal for a ramp stop. |

**Downstream, blocked on this ticket.**

| Ticket | Owns | What it consumes from here |
|---|---|---|
| KW-024 | `lib/viz/driver.ts`, `lib/viz/testHarness.ts` | Owns the single rAF call site, the fixed-timestep accumulator, `matchMedia` with a live `change` listener, `?viz-test=1`, the bundle→`GridSeries`/`RenderMeta` adapters, and the quality trigger. Calls `budget.begin()`, then the three painters, then `budget.end()`, and surfaces `last.drawCalls` through `inspect()`. Each harness command awaits a `getImageData` rasterization flush so Playwright cannot race the command buffer. |
| KW-025 | `app/regions/Instrument.tsx`, `components/viz/{Overview,Ribbon,Gource}.tsx` | Creates the canvases, owns `ResizeObserver` and DPR sizing, calls `resolveRenderTheme` once per mount, converts drag-to-scrub and hover to **Pointer Events** (the prototype is `onmousedown` plus window `mousemove`/`mouseup` with no touch path, so the overview strip is inert on phones), calls `overviewDayAtX` and `ribbonHitTest`, and applies the `clamp(120px, 20vh, 200px)` ribbon box. |
| KW-026 | `app/regions/TransportBar.tsx`, plus **deletions in `lib/viz/render/ribbon.ts`** | The one declared write-surface overlap in the pack. It is safe because KW-026 depends on KW-024, which depends on this ticket, so the pair is hard-ordered and never concurrent. Make KW-026's deletion a **no-op**: never port `drawGame` (637–684), its call site (633), `this.walkable`, `this.bot`, `this.userPlay`, or the `keydown` block (477–491). Do port the `rbGeom` concept — it becomes `RibbonGeometry` and the hover path depends on it. |
| KW-029 | `components/viz/ContributionTable.tsx` and the a11y gate | Uses `repoPhase`/`liveIdsAscending` for the hidden table, and re-audits the ramp this ticket paints. It also owns the WCAG verdict this ticket deliberately does not attempt. |
| KW-031 | `e2e/canvas.spec.ts`, `e2e/__screenshots__/**` | The determinism guaranteed by R-1 and the stability guaranteed by R-4/R-5 are what make pixel baselines viable at all. |

**Open gates.** None block this ticket, and none of the seven touch `lib/viz/render/**`. `GATE-002` (`workflow` OAuth scope on the push credential) blocks KW-001, KW-023, KW-028 and KW-031 at push time; this ticket writes no file under `.github/`. `GATE-003` (the SSO-authorized `CONTRIB_TOKEN`) affects the data half only; this ticket runs on fixtures and never fetches. `GATE-007` (the scanline treatment) is a `styles/` decision owned by KW-003 and does not reach canvas. Pick this ticket up as soon as KW-007 and KW-008 have both merged.

**If either dependency is unmerged when this is picked up.** Do not start, and do not stub. `SimState` and `LV` are the two contracts this entire directory is shaped around; a local copy of either would be re-declared in the one place the plan spent a whole ticket avoiding. Report the graph violation instead — the blocker gate only fires when an issue normalizes to `todo`, so a reworked upstream ticket can dispatch out of order, and KW-008 is specifically called out as a contract to watch for that.
