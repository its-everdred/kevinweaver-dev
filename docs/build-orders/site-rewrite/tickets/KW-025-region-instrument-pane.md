# KW-025 — Region: instrument pane — three self-sizing canvases, pointer input, and the lazy viz island

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Four small React files with no algorithmic depth, but they are the only place in the codebase where the pure sim/render core meets the DOM: DPR bookkeeping, ResizeObserver lifecycle, Pointer Events, code-splitting and the canvas text alternative all land here, and three downstream gates (KW-029, KW-030, KW-031) assert against what this ticket mounts.

**Risk:** medium — this is the critical-path node between the viz driver and every wave-6 gate. The failure modes are silent rather than loud: a missing `setTransform` after resize renders a half-scale blurry canvas that still passes typecheck, a missed `setPointerCapture` makes the scrubber work on desktop and die on phones, and an eagerly-imported gource module fails no build while blowing KW-030's first-load budget. Contained by the fact that every file is new, no data or secret passes through it, and every failure above is assertable from a browser-mode unit test.

**Phase hint:** 5

**Depends on:** KW-005, KW-015, KW-024

**Serializes with:** none

**Requirements:** REQ-002, REQ-009, REQ-010

**Decisions:** DEC-002, DEC-003, DEC-005, DEC-011

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The instrument region renders three canvases — the 5-year overview strip, the 53-week ribbon and the gource repo graph — each owning its own `ResizeObserver` and its own DPR-correct backing store; drag-to-scrub and hover work with mouse, touch and pen; every canvas carries `role="img"` with an accessible name and a real text alternative; the gource module is a separate JS chunk that is not requested until it enters the viewport; and a state change anywhere outside this region produces zero canvas draw calls and zero React re-renders inside it.

## Context and evidence

This ticket exists because the prototype does canvas mounting exactly once, globally, for all three surfaces at the same time — and that single decision is what makes the comp impossible to port as-is.

**The measured defect.** `sizeAll()` (comp:520-529) loops over `[overRef, ribbonRef, graphRef]` in one pass and writes `c.width`/`c.height` for all three; `drawAll()` (comp:1029) and the rAF `loop()` (comp:900) repaint all three unconditionally every frame, *including while `playing === false`*. The overview strip repaints 1,826 `fillRect`s plus five year rules sixty times a second for a picture that only changes when `winStart` or `day` moves (design-comp-spec §4.5, **(M)**). The single `ResizeObserver` (comp:416) observes `r.current.parentElement` for all three refs and fires `sizeAll(); drawAll();` for any of them. The design track's own conclusion, §10: *"Splitting the three canvases into three components each owning its own `ResizeObserver` + DPR sizing is the single biggest structural improvement over the comp."* That split is this ticket.

**Pointer input is mouse-only and the affordance lies.** comp:509-517 binds `ov.onmousedown` plus `window` `mousemove`/`mouseup`. There is no `touchstart` and no `pointerdown`. The overview canvas declares `cursor:ew-resize` (comp:76) on a control that is completely inert on every phone and tablet. design-comp-spec §8.3 item 6 is unambiguous: **use Pointer Events** (`onpointerdown` + `setPointerCapture`) — one change covers mouse, touch and pen — and the ribbon's hover tooltip becomes tap-to-pin on touch.

**Geometry that has to be right.** Re-measured at a 1080p viewport (design-comp-spec §6.4, **(M)**): `.kw-graph` is `1560 − 28 (main pad) − 14 (gap) − 320 (tail) − 4 (borders) = 1194` wide and `100vh − 60 − 274 (contributions pane) − 14 (gap) − 32 (pane bar) − 38 (transport) = 602` tall, an aspect ratio of **≈ 1.98 : 1**. At the two declared breakpoints (comp:32-45, **(M)**) `.kw-graph` becomes a fixed `420px` (≤1080) then `340px` (≤720). The overview canvas is `width:100%` × `50px`; the ribbon is `width:100%` × `140px` today (comp:76, comp:83).

**DPR.** `Math.min(2, window.devicePixelRatio || 1)` (comp:521) is measured-correct, not folklore: viz-runtime §7.2 measured the full scene at 1280×720 as **3.952 / 4.920 / 7.036 / 10.596 ms** at dpr 1 / 1.5 / 2 / 3 — sub-quadratic, because path setup is CPU geometry independent of raster resolution — so clamping at 2 saves **34 %** against dpr 3 **(M)**. The budget target is 8 ms for all three canvases combined (viz-runtime §7.3), which means the backing store this ticket allocates is a first-order performance decision, not bookkeeping.

**`100vh` is wrong on mobile.** design-comp-spec §8.3 item 3: the root carries `min-height:100vh` (comp:48) and `.kw-instr` carries `height:calc(100vh - 60px)`; iOS Safari's collapsing URL bar adds ~60–110 px of dead scroll. The port uses `100dvh`. The stylesheet that expresses this belongs to KW-003 — this ticket verifies it and reports, and uses `dvh` in any inline sizing of its own.

**`rbGeom` must survive.** comp:577 assigns `this.rbGeom = {left, top, step, cell, cw, weeks}` inside `drawRibbon`, and `hover()` (comp:686-702) is its only consumer. The surrounding doc-comment claims *"the ribbon (and the board the game is played on)"* — that comment and `drawGame` go away in KW-026, but the geometry is the hit-test model for the tooltip and is not part of the deleted game. **C-30** applies to every citation in this document: the method name is authoritative, the line number is a convenience.

**DEC-011 (synthesis D-11).** Canvas for the interactive grid, plus a visually hidden `<table>` as text alternative. This resolves **C-26**, whose corrected justification is *the O(1) arithmetic hit-test against 1,826 event targets* and the absence of any DOM/SVG equivalent for `shadowBlur` — **not** the node count, which the verifier corrected from 3,652 to **1,827**. The consequence for this ticket is direct: axe has no canvas rule at all (KW-029), so anything painted into a canvas is invisible to automated tooling and the text alternative is the only conformance path.

**Laziness has to be structural, not aspirational.** ci-testing §7 is explicit: *"the canvas must mount behind `next/dynamic({ ssr: false })` + an `IntersectionObserver`, and the first sim step must be deferred to `requestIdleCallback`. Add a Playwright assertion that no `gource*.js` request is made before the canvas scrolls into view; that turns an architectural rule into a test."* KW-030 owns that assertion (`e2e/lazy-island.spec.ts`); this ticket owns the structure it asserts against.

**Decisions this ticket is bound by.** **DEC-002** (App Router + RSC, no `output:'export'`): the client boundary is pushed as far down the tree as it will go, so the region's pane chrome stays server-rendered and only the canvas leaves are `'use client'`. **DEC-003**: `package.json` and `package-lock.json` were frozen by KW-001; this ticket adds no dependency and edits no manifest. **DEC-005** (zero `serializes_with`; one region, one file): this ticket rewrites exactly one region file and creates files in one directory no wave-5 sibling writes. **DEC-011**: the hidden table.

**Requirements this ticket serves.** **REQ-002** — the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file. **REQ-009** — the page carries correct semantics and keyboard/pointer parity, including a real text equivalent for every canvas surface. **REQ-010** — the interactive instrument stays inside its measured frame and payload budget, and its heavy canvas island is code-split and not requested before it is needed.

Plan-context navigation (read these at the approved planning commit — the same commit the issue preamble links):

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/build-orders/site-rewrite/02-current-target-delta.md`, and the authoritative topological table, critical path and write-surface partition proof in `docs/research/2026-07-31-decomposition-synthesis.md` §6
- Decision registry: `docs/build-orders/site-rewrite/03-technical-decisions.md` (DEC-002, DEC-003, DEC-005, DEC-011 are D-02, D-03, D-05, D-11 in the synthesis §3 table)
- This ticket's implementation pointers: the "Refreshable implementation notes" section below

Evidence readable at `researched_at_commit` today:
[docs/design/kevinweaver.dev.dc.html](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/design/kevinweaver.dev.dc.html) (1,033 lines; instrument region 68–125),
[docs/research/2026-07-31-design-comp-spec.md](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-design-comp-spec.md) §3.8, §4.5, §4.6, §6.1, §6.2, §6.4, §8.2, §8.3, §10,
[docs/research/2026-07-31-viz-runtime.md](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-viz-runtime.md) §7.2, §7.3, §8.1,
[docs/research/2026-07-31-ci-testing.md](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-ci-testing.md) §7.

## Scope

- Rewrite `app/regions/Instrument.tsx`, replacing KW-005's placeholder with the comp's real three-pane structure: the contributions pane (overview strip + caption row + ribbon + tooltip layer), the `.kw-lower` split holding the gource pane and the events tail pane, and the transport footer slot.
- Create `components/viz/useCanvasSurface.ts`, the single shared hook that owns canvas element refs, `ResizeObserver` lifecycle, clamped-DPR backing-store sizing, `setTransform` re-application, resolved CSS font tokens, and driver attach/detach.
- Create `components/viz/Overview.tsx` — the 5-year scrubber strip, including Pointer-Events drag-to-scrub with `setPointerCapture` and `touch-action: none`.
- Create `components/viz/Ribbon.tsx` — the 53-week detail grid, including pointer hover on fine pointers, tap-to-pin on coarse pointers, the tooltip layer, Escape-to-dismiss, and the DEC-011 visually hidden contribution table.
- Create `components/viz/Gource.tsx` — the repo-graph canvas, code-split behind `next/dynamic({ ssr: false })` and gated by an `IntersectionObserver`, with first attachment deferred to `requestIdleCallback`.
- Give every canvas `role="img"`, a payload-derived accessible name, and a text alternative in the accessibility tree; give the events tail pane `role="log"` live-region semantics.
- Read canvas type sizes from resolved CSS custom properties once per resize and hand them to the driver, so no 9 px literal survives the port.
- Prove the isolation property: an unrelated region's state change produces zero canvas draw commands and zero re-renders inside this region.

## Non-goals

- Any drawing code. `lib/viz/render/{graph,ribbon,overview,cluster,budget}.ts` belong to KW-022 and are read-only here; this ticket never opens a `CanvasRenderingContext2D` to paint, and never re-derives ribbon or projection geometry.
- Any call to `requestAnimationFrame`. KW-024's invariant is that exactly one file in the repository calls it, and that file is `lib/viz/driver.ts`.
- The transport bar, its keyboard bindings, the `Space` rebinding, the `fresh · Nh ago` pill, and the Bomberman deletion — all KW-026, in `app/regions/TransportBar.tsx` and `lib/viz/render/ribbon.ts`.
- Any stylesheet. `app/globals.css`, `styles/ds/**` and `styles/kw.css` belong to KW-003, including `.kw-instr`, `.kw-lower`, `.kw-graph`, `.kw-tail`, `.sr-only`, the focus ring and the reduced-motion stop. This ticket writes no CSS rule and adds no `<style>`.
- `app/layout.tsx`, `app/page.tsx` and `app/regions/_contract.ts` — KW-005 owns them, KW-027 appends only to the metadata export, KW-032 owns the final page composition.
- `components/viz/ContributionTable.tsx` — KW-029 creates that file when it extracts and widens the hidden table. Do not create it here.
- Any e2e or axe spec. `e2e/a11y.spec.ts` is KW-029, `e2e/lazy-island.spec.ts` is KW-030, `e2e/canvas.spec.ts` and `e2e/__screenshots__/**` are KW-031, `playwright.config.ts` is KW-023.
- Adding, removing or pinning a dependency, or editing `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs` or `vitest.config.mts` — DEC-003 freezes them.
- Bundle fetching, chunk prefetch, front-code decoding and 404 degradation — `lib/bundle/loader.ts` is KW-015's file and this ticket consumes it without reimplementing any of it.
- The boot overlay, the header, the tmux bar, the man page, the career log and the contact pane — KW-020, KW-018, KW-016, KW-017, KW-019.

## Existing owner and reuse target

There is **no `app/` directory, no `components/viz/` directory and no `lib/` directory at `researched_at_commit`.** `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772` shows the Pages Router (`pages/_app.js`, `pages/index.js`, `pages/api/hello.js`), `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `tailwind.config.js` and both lockfiles. None of it is a reuse target; KW-001 deletes all of it.

The reuse target for this ticket is `app/regions/Instrument.tsx` as KW-005 leaves it — a stub rendering `<section className="kw-instr">` with three `Pane`s (contributions, gource with `focus` and `footer={null}`, events tail), no `<canvas>`, no refs, no client directive. **Rewrite that file; do not create a second one.**

| Target | State at pickup | Guaranteed by |
|---|---|---|
| `app/regions/Instrument.tsx` | stub with the three-pane skeleton and `REGION_META.instrument` wiring | KW-005 (its write surface, verbatim) |
| `app/regions/_contract.ts` — `InstrumentProps`, `REGION_META`, `RegionCommonProps` | created, types-and-constants only | KW-005 |
| `components/ds/Pane.tsx` / `PaneBar.tsx` — `PaneProps` with `footer`, `as`, `labelledBy`, `bodyRef`, `bodyStyle`, `bodyClassName` | created, directive-free, usable from a client component | KW-005 |
| `lib/viz/driver.ts`, `lib/viz/testHarness.ts` | created; the only `requestAnimationFrame` call site; `window.__viz` behind `?viz-test=1` | KW-024 |
| `lib/viz/render/{graph,ribbon,overview}.ts` | created; pure `render(state, ctx)`; owns `rbGeom` and the projection | KW-022 (transitively, via KW-024) |
| `lib/bundle/loader.ts` | created; boot fetch of manifest + repos + grid + `ee-00` + `pd-00`; newest-first iterator; 404 degrades to "history ends here" | KW-015 |
| `.kw-instr`, `.kw-lower`, `.kw-graph`, `.kw-tail`, `.kw-pad`, `.pane*`, `.ph`, `.sr-only` | shipped as real stylesheet rules (the comp has them inline) | KW-003 |
| `test/canvas-recorder.ts` — the `ctx` recording Proxy, numbers rounded to 3 dp | created; used by the browser-mode Vitest project | KW-011 |

**Symbols this ticket consumes whose exact names are not fixed by any upstream document.** `lib/viz/driver.ts` and `lib/bundle/loader.ts` are guaranteed to exist by KW-024 and KW-015, and their *behaviour* is fixed by the synthesis, but neither ticket's export identifiers were pinned during planning. **Read the actual exports at pickup.** If they differ from the shape in "Contract and invariants" below, write the adapter inside `components/viz/` — your own files — and never edit `lib/viz/driver.ts`, `lib/viz/render/**` or `lib/bundle/loader.ts`. If the driver exposes no surface-attachment seam and no pointer intake at all, that is a blocking upstream gap: stop, record it, and escalate rather than adding an rAF loop here (doing so breaks KW-024's single-owner invariant and KW-031's determinism canary in one move).

Not reusable, do not go looking for it: the DesignSync project ships `components/chrome/*.jsx` and a `<CanvasPane>` concept is described in design-comp-spec §3.9, but **no such component exists in this repository at `researched_at_commit`** and fetching it is off the critical path (DEC-004, GT-5). Write `useCanvasSurface` from the measurements in this document.

## Contract and invariants

**Invariant 1 — one surface, one observer, one writer.** Each canvas component creates exactly one `ResizeObserver`, observes exactly one element, and is the only code in the repository that assigns to that canvas's `.width` and `.height`. There is no shared `sizeAll()`. Disconnecting one surface must not disturb another.

**Invariant 2 — zero `requestAnimationFrame` in this ticket's files.** `grep -rn "requestAnimationFrame" app/regions/Instrument.tsx components/viz/` must be empty. Paint scheduling belongs to `lib/viz/driver.ts`.

**Invariant 3 — paint never travels through React.** No canvas pixel is a function of React state. React state in these files is restricted to: island mounted (boolean), tooltip pinned cell (touch only), and reduced-motion (boolean). A resize, a scrub, a hover or a frame advance must produce **zero** React re-renders. This is what makes "no repaint when an unrelated region's state changes" true by construction rather than by discipline.

**Invariant 4 — Pointer Events only.** No `mousedown`, `mousemove`, `mouseup`, `mouseleave`, `touchstart`, `touchmove` or `touchend` listener appears anywhere in this ticket's files. Every interactive canvas sets `touch-action: none` so a horizontal drag scrubs instead of scrolling the page.

**Invariant 5 — no px type literal reaches a canvas.** Canvas font sizes are read from resolved CSS custom properties (`--fs-micro`, `--fs-small`, `--fs-mono`) once per resize and passed to the driver. A `9` in a `ctx.font` string anywhere in this repository is a defect (design-comp-spec §5.5: every `g.font` in the comp is a hardcoded literal, and 9 px is below every accessibility floor).

**Invariant 6 — `components/viz/**` imports nothing from `app/regions/**` and nothing from `content/**`.** The dependency direction is region → component → lib. A region may import a viz component; a viz component may not import a region.

**Invariant 7 — every canvas is named and has a text alternative.** `role="img"` plus a payload-derived `aria-label` on the element; the ribbon additionally carries the DEC-011 hidden table as a sibling in the accessibility tree. The tooltip is `aria-hidden="true"` — it is a pointer affordance, and duplicating it into a live region would fire on every pixel of mouse travel.

**Invariant 8 — the gource module is a separate chunk.** It is reachable only through `next/dynamic`. A static `import ... from '@/components/viz/Gource'` anywhere in the tree defeats KW-030's budget and its lazy-island test in one line.

### Producer interface — `components/viz/useCanvasSurface.ts`

This is the seam this ticket produces. `Overview.tsx`, `Ribbon.tsx` and `Gource.tsx` consume it verbatim; KW-029 quotes `CanvasSurfaceA11y` when it extracts the table. Do not paraphrase it into three local copies.

```ts
// components/viz/useCanvasSurface.ts
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'

/** Which of the three canvases this surface is. Matches the driver's surface keys. */
export type VizSurfaceId = 'overview' | 'ribbon' | 'gource'

/**
 * Everything the render layer needs to paint one canvas, recomputed only when the
 * element's content box or the device pixel ratio actually changes.
 */
export interface SurfaceGeometry {
  /** CSS pixels. The coordinate space every render module and hit test works in. */
  readonly cssWidth: number
  readonly cssHeight: number
  /** Backing store, device pixels. cssWidth * dpr, rounded. */
  readonly deviceWidth: number
  readonly deviceHeight: number
  /** Math.min(2, devicePixelRatio || 1). Never the raw ratio. */
  readonly dpr: number
  /** Resolved from CSS custom properties on the surface element, in CSS px. */
  readonly font: { readonly micro: number; readonly small: number; readonly mono: number }
}

/** The a11y payload the surface publishes. KW-029 quotes this when it widens the table. */
export interface CanvasSurfaceA11y {
  /** Short alt text. Concise on purpose: the long form lives in the sibling table. */
  readonly label: string
  /** id of the element carrying the long text alternative, or null when there is none. */
  readonly describedById: string | null
}

export interface UseCanvasSurfaceOptions {
  readonly id: VizSurfaceId
  /** Short accessible name; recomputed by the caller when the payload changes. */
  readonly label: string
  readonly describedById?: string | null
  /** Skip attaching to the driver until true. Gource passes its in-view flag. */
  readonly enabled?: boolean
}

export interface CanvasSurfaceHandle {
  /** Attach to the <canvas>. */
  readonly ref: RefObject<HTMLCanvasElement | null>
  /**
   * Latest geometry, or null before first measure. This is a mutable ref, NOT state:
   * reading it never schedules a render (Invariant 3).
   */
  readonly geometry: RefObject<SurfaceGeometry | null>
  /** Spread onto the <canvas>: role, aria-label, aria-describedby, style. */
  readonly canvasProps: {
    role: 'img'
    'aria-label': string
    'aria-describedby'?: string
    style: CSSProperties
  }
  /** Convert a pointer event to surface-local CSS pixels. Null if not yet measured. */
  readonly toLocal: (event: ReactPointerEvent<HTMLCanvasElement>) => { x: number; y: number } | null
  /** Ask the driver to repaint this surface only. Coalesced; never paints inline. */
  readonly invalidate: () => void
}

export function useCanvasSurface(options: UseCanvasSurfaceOptions): CanvasSurfaceHandle
```

Worked geometry, so the implementation is checkable against a number rather than a feeling. At a 1920×1080 viewport with the page at its 1560 px max width, `devicePixelRatio = 2`:

```jsonc
{
  "id": "gource",
  "cssWidth": 1194,        // 1560 - 28 (main pad) - 14 (gap) - 320 (tail) - 4 (borders)
  "cssHeight": 602,        // 1020 (100dvh) - 60 (header) - 274 (contributions) - 14 (gap)
                           //                - 32 (pane bar) - 38 (transport)
  "deviceWidth": 2388,     // 1194 * 2
  "deviceHeight": 1204,    // 602 * 2
  "dpr": 2,                // Math.min(2, 2)
  "font": { "micro": 11, "small": 12, "mono": 13.5 }
}
```

The font values are the resolved clamp scale at a 1920 px viewport, read from design-comp-spec §5.2's measured nine-checkpoint table (`fs-micro` 10.0 → 11.0, `fs-small` 11.0 → 12.0, `fs-mono` 12.0 → 13.5 across 360 → 1920 px). They are **read, never assumed**: at 360 px the same fields are `{ micro: 10, small: 11, mono: 12 }`, and a canvas that hardcodes either set is the defect this contract exists to prevent.

Aspect ratio 1194 / 602 = **1.983**. At the ≤1080 px breakpoint `cssHeight` is **420**; at ≤720 px it is **340**. On a 3× phone `dpr` is still **2** — that clamp is the 34 % saving, and a test asserts it (`deviceWidth === Math.round(cssWidth * 2)` at `deviceScaleFactor: 3`).

### Consumed interface — `lib/viz/driver.ts` (KW-024)

The shape this ticket binds to. **Verify the real export names at pickup; adapt on your side of the boundary if they differ.**

```ts
// consumed from lib/viz/driver.ts — KW-024 is the owner
export interface VizSurfaceAttachment {
  readonly id: VizSurfaceId
  readonly ctx: CanvasRenderingContext2D
  readonly geometry: SurfaceGeometry
}

export interface VizDriver {
  /** Register a canvas. Idempotent per id; re-attaching replaces the previous binding. */
  attach(attachment: VizSurfaceAttachment): void
  /** Unregister. Must be safe to call from a React cleanup during unmount. */
  detach(id: VizSurfaceId): void
  /** Geometry changed; re-derive and mark dirty. Does not paint inline. */
  resize(id: VizSurfaceId, geometry: SurfaceGeometry): void
  /** Mark one surface dirty. Coalesced into the next driver frame. */
  invalidate(id: VizSurfaceId): void
  /** Pointer position in surface-local CSS pixels, or null on leave. */
  setPointer(id: VizSurfaceId, point: { x: number; y: number } | null): void
  /** Absolute scrub: fraction 0..1 of the full day range, left = oldest. */
  scrubTo(fraction: number): void
  /** Read-only frame description. Never mutates. */
  inspect(): VizFrameInfo
}
```

`VizFrameInfo` is quoted verbatim from viz-runtime §8.1, with the one correction the synthesis applies: **DEC-016** replaces xorshift128 with mulberry32 carried as a single 32-bit integer field, so `rngState` is a `number`, not a 4-tuple. Everything this ticket needs from a frame is in here — read it, never recompute it:

```ts
interface VizFrameInfo {
  tick: number
  cursorDay: number
  date: string                 // 'YYYY-MM-DD'
  nLive: number
  liveRepos: string[]          // sorted, stable
  highlightCell: { week: number; weekday: number } | null
  winStart: number
  beams: number
  rngState: number             // DEC-016: mulberry32, one uint32
  drawCalls: number
  lastFrameMs: number
}
```

**Hit testing is not this ticket's arithmetic.** `rbGeom` lives inside `lib/viz/render/ribbon.ts` (KW-022), and the isotropic-gutter fix changes the inversion. This ticket sends surface-local CSS pixels via `setPointer` and reads `highlightCell` back from `inspect()`. Do not copy `Math.floor((x - gm.left) / gm.cw)` from comp:690 into a React component — two copies of that formula will drift the day the gutter fix lands.

### Consumed interface — `lib/bundle/loader.ts` (KW-015)

This ticket needs three things from the loader and nothing else: the boot payload (so it can build the accessible name and the hidden table), `generatedAt`/`windowStart`/`windowEnd`/`dayCount` from the manifest (DEC-008 — no figure is a literal), and a promise it can await before attaching the gource surface. It does **not** drive prefetch, decode chunks, or handle 404s; the loader already degrades to "history ends here" on a missing chunk.

### Producer interface — the lazy-chunk marker

KW-030's `e2e/lazy-island.spec.ts` needs a stable way to identify the gource chunk. Next 16 hashes chunk filenames, so asserting on `gource*.js` by name is fragile. `Gource.tsx` therefore exports a module-level marker string that the spec can grep for in response bodies:

```ts
// components/viz/Gource.tsx
/** Stable identifier for the code-split gource chunk. KW-030 asserts on this string. */
export const GOURCE_CHUNK_MARKER = 'kw-gource-island'
```

Keep the literal exactly as written and referenced at module scope so no minifier drops it.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify the "verify at pickup" items before writing code; if one is false, stop and report rather than fixing it here — every one of them belongs to an upstream ticket.

1. **Verify the base.**

   ```bash
   test -f app/regions/Instrument.tsx && test -f app/regions/_contract.ts && test -f components/ds/Pane.tsx
   test -f lib/viz/driver.ts && test -f lib/bundle/loader.ts
   grep -rn "^export" lib/viz/driver.ts lib/bundle/loader.ts   # the real names; adapt to these
   grep -rn "sr-only" styles/ app/globals.css                   # KW-003 shipped it
   npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build
   ```

   The build must be green *before* you change anything. `grep -rn "requestAnimationFrame" --include=*.ts --include=*.tsx .` should return exactly one file (`lib/viz/driver.ts`) at pickup and exactly one file when you are done.

2. **`components/viz/useCanvasSurface.ts` — the whole hook.** Implement the signature quoted above. The measured details that matter:

   ```ts
   'use client'

   const MAX_DPR = 2 // viz-runtime §7.2: dpr 3 costs 10.596 ms vs 7.036 ms at dpr 2 (M)

   function readDpr(): number {
     return Math.min(MAX_DPR, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1)
   }

   function readFontTokens(el: Element): SurfaceGeometry['font'] {
     const cs = getComputedStyle(el)
     const px = (token: string) => parseFloat(cs.getPropertyValue(token)) || 0
     return { micro: px('--fs-micro'), small: px('--fs-small'), mono: px('--fs-mono') }
   }
   ```

   - Observe the **canvas element itself**, not `parentElement`. The comp observes the parent (comp:417) because one observer served three canvases; with one observer per surface the element is the correct target and removes a whole class of "which parent" bugs.
   - Read the box from `entry.contentBoxSize[0].inlineSize / blockSize` when present, falling back to `entry.contentRect`. Do **not** call `getBoundingClientRect()` inside the callback — it forces a synchronous layout inside a layout callback and is the classic source of `ResizeObserver loop completed with undelivered notifications`, which Playwright surfaces as a page error and KW-023's smoke spec will fail on.
   - Bail on a zero box exactly as the comp does (`if (!b.width) return`, comp:524) — a display:none ancestor or a pre-layout first callback otherwise allocates a 0×0 backing store and every later draw silently no-ops.
   - Write `canvas.width`/`canvas.height` only when the rounded device size actually changed. Assigning `canvas.width` **resets the entire 2D context state**, so it must be followed unconditionally by `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` (comp:526). Forgetting the re-application after a *second* resize is the bug that renders correctly on first paint and half-scale after the user drags a window edge.
   - Re-read the DPR on a `matchMedia(\`(resolution: ${dpr}dppx)\`)` `change` event (viz-runtime §7.3) — a `ResizeObserver` does **not** fire when only the pixel ratio changes, which is exactly what happens when a laptop is plugged into an external monitor. Re-arm the listener on every change, because the query string itself depends on the current ratio.
   - `getContext('2d')` once and keep it; call it with `{ alpha: false }` only if you have measured it, otherwise take the default — the gource pane paints over `var(--bg-h)` and an opaque context changes the clear semantics KW-022 assumes.
   - `canvasProps.style` is `{ display: 'block', width: '100%', height: '100%' }` plus, for interactive surfaces, `touchAction: 'none'`. Nothing else; sizing of the *box* is the caller's job.
   - Cleanup: `observer.disconnect()`, `mediaQuery.removeEventListener('change', ...)`, `driver.detach(id)`. React 19 StrictMode double-invokes effects in development, so every one of these must be idempotent.

3. **`components/viz/Overview.tsx` — the scrubber.** `'use client'`. Canvas box is `var(--kw-overview-h, 50px)` tall, `width:100%` (comp:76). The drag handler, converted from comp:509-517 to Pointer Events:

   ```tsx
   const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
     e.currentTarget.setPointerCapture(e.pointerId)
     scrub(e)
   }
   const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
     if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e)
   }
   const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
     if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
   }
   const scrub = (e: React.PointerEvent<HTMLCanvasElement>) => {
     const p = surface.toLocal(e)
     const g = surface.geometry.current
     if (!p || !g) return
     driver.scrubTo(Math.min(1, Math.max(0, p.x / g.cssWidth)))
   }
   ```

   Bind `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel` — **`pointercancel` is mandatory**, because on touch the browser fires it instead of `pointerup` when it steals the gesture, and a handler that only listens for `pointerup` leaves the strip stuck in drag state forever. `setPointerCapture` is what replaces the comp's `window` `mousemove`/`mouseup` pair: the element keeps receiving events after the pointer leaves it, and the listeners unbind themselves when capture is released.

   The window arithmetic in comp:513-514 (`winStart = clamp(round(f * N) - 185, 0, N - 371)`, where 371 = 53 weeks and 185 centres the window) belongs to the driver, not here. Send the fraction; the driver owns `N`. Do not hardcode 1826 — DEC-008 forbids it and `dayCount` is in the manifest.

   Keep the caption row below the canvas (comp:77-80). `now → 2021 · drag to scrub` is a hover-only instruction on a control that is now touch-capable; change the copy to `drag to scrub` and let KW-003 fix the `--gray` on `--surface-pane` contrast (measured **4.47:1**, a fail). Do not change the token here.

4. **`components/viz/Ribbon.tsx` — hover, pin, tooltip, table.** `'use client'`. Box height is `var(--kw-ribbon-h, clamp(120px, 20vh, 200px))` — the comp's flat `140px` (comp:82) is what forces the anisotropic-gutter bug that KW-022 fixes on its side; giving the box room to grow is this ticket's half of that fix. Inline style with a literal fallback, never a new CSS rule (KW-003 owns stylesheets, and a `var()` with no fallback that resolves to nothing makes the declaration invalid at computed-value time and collapses the box).

   Pointer model, replacing comp:473-475:

   ```tsx
   const fine = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches
   // fine pointer: hover follows the pointer, leave clears.
   // coarse pointer: pointerup pins a cell; a second tap on the same cell, Escape, or a
   // tap outside unpins. Never rely on hover on touch (design-comp-spec §8.3 item 6).
   ```

   Tooltip element: absolutely positioned inside the ribbon's `position:relative` wrapper, `pointerEvents: 'none'`, `aria-hidden="true"`, `zIndex: 5` (comp:84). Position it with the comp's clamps, which are already correct: `left = Math.min(cssWidth - 200, Math.max(0, x + 14))`, `top = Math.max(0, y - 66)` (comp:696-697). Content is built from `driver.inspect().highlightCell` plus the grid payload — never from a recomputed cell index.

   **WCAG 1.4.13 (content on hover or focus)** requires the tooltip be dismissible without moving the pointer: bind `keydown` for `Escape` on the ribbon wrapper (not on `window` — KW-026 is removing the comp's unconditional `window` key handler and this ticket must not add another one) and clear the tooltip.

   **The DEC-011 hidden table.** Render it once, from the boot grid payload, memoized on the payload identity so a scrub or a hover never re-renders it (Invariant 3). Keep it in a single self-contained function so KW-029's extraction into `components/viz/ContributionTable.tsx` is mechanical:

   ```tsx
   /** DEC-011 text alternative. KW-029 extracts this verbatim into ContributionTable.tsx. */
   function ContributionTableInline({ grid, id }: { grid: GridPayload; id: string }) {
     return (
       <div id={id} className="sr-only">
         <table>
           <caption>
             Daily contributions, {grid.windowStart} to {grid.windowEnd} ({grid.dayCount} days)
           </caption>
           <thead>
             <tr><th scope="col">date</th><th scope="col">contributions</th><th scope="col">level</th></tr>
           </thead>
           <tbody>
             {grid.days.map((d) => (
               <tr key={d.date}>
                 <th scope="row">{d.date}</th>
                 <td>{d.total}</td>
                 <td>{d.level}</td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
     )
   }
   ```

   The canvas then carries a **short** name and points at the table as a sibling in the reading order — do **not** wire `aria-describedby` to the table, because the accessible-description algorithm flattens the whole thing into one enormous string:

   ```tsx
   <canvas
     {...surface.canvasProps}
     aria-label={`Contribution grid, 53 weeks ending ${manifest.windowEnd}. Full daily figures follow in the adjacent table.`}
   />
   ```

   Column/row shape is a judgement call KW-029 may revise; one row per day with a `<th scope="row">` date is the shape that survives a screen reader's table navigation, and it is the shape a search engine can read. If the rendered table pushes the document past a reasonable size, record it in the deferred-findings ledger rather than silently truncating — a truncated text alternative is a WCAG 1.1.1 failure, not an optimisation.

5. **`components/viz/Gource.tsx` — the island body.** `'use client'`. Export `GOURCE_CHUNK_MARKER` exactly as specified. The canvas fills `.kw-graph` (`flex:1; min-height:0`, comp:96) at `width:100%; height:100%`. This component is *only* the surface: the 40/34/40 px projection margins, the `clamp(16px, 4%, 40px)` re-derivation, the ellipse caps and the reduced repo set below 1080 px all live in `lib/viz/render/graph.ts` and belong to KW-022. Keep the legend block (comp:98-104) as plain DOM — it is text, it must be selectable and indexable, and painting it into the canvas would put four more strings out of axe's reach.

   Attachment is deferred twice: once by `next/dynamic` (the module is not fetched), once by `requestIdleCallback` (the first attach does not compete with hydration).

   ```tsx
   useEffect(() => {
     const idle =
       typeof window.requestIdleCallback === 'function'
         ? window.requestIdleCallback(attach, { timeout: 1000 })
         : window.setTimeout(attach, 0)
     return () => {
       if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle as number)
       else window.clearTimeout(idle as number)
     }
   }, [])
   ```

   `requestIdleCallback` is faked by Playwright's `page.clock` alongside `requestAnimationFrame` (ci-testing verification C3, re-confirmed against the Playwright Clock docs), so this deferral is deterministic under test rather than a source of flake.

6. **`app/regions/Instrument.tsx` — the region.** Keep it a **server component** if the loader boot can be initiated from the leaves; the pane chrome, the captions and the legend then cost zero client JS (DEC-002). If a single client owner is genuinely required to sequence the loader before all three attachments, mark **only** a `components/viz/` wrapper `'use client'` and keep `Instrument.tsx` server-side. Do not put `'use client'` at the top of the region file without first proving it is unavoidable — the region contains the events pane, both pane bars and the legend, and every one of those is static text.

   Structure, mapped 1:1 onto comp:68-125 and KW-005's stub:

   ```tsx
   <section className="kw-instr" aria-labelledby={META.titleId}>
     <Pane title="contributions" titleId={META.titleId} titleAs="h2" dots
           bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
       <Overview />         {/* comp:75-81  — strip + caption row */}
       <Ribbon />           {/* comp:82-86  — ribbon + tooltip + hidden table */}
     </Pane>

     <div className="kw-lower">
       <Pane focus as="section" title="gource — repo graph"
             right={<GraphDate />}                    /* comp:93 aqua tabular-nums date */
             bleed
             footer={/* KW-026's TransportBar, comp:105-116 — see note 10 */ null}>
         <div className="kw-graph">
           <GourceIsland />
         </div>
       </Pane>

       <Pane className="kw-tail" title="events — tail -f">
         <div id="kw-event-log" role="log" aria-live="polite" aria-relevant="additions"
              aria-label="recent contribution events" />
       </Pane>
     </div>
   </section>
   ```

   `dvh`, not `vh`, in any inline height you write here. `.kw-instr`'s own `height:calc(100dvh - 60px)` is KW-003's rule — verify it with `grep -n "kw-instr" styles/kw.css` and, if it still says `100vh`, record it as a finding against KW-003 rather than adding an override.

   The events pane container is in scope for its **semantics only** (`role="log"`, `aria-live="polite"`, `aria-relevant="additions"`, an accessible name, and a stable `id`). Populating it is not assigned to any ticket in the plan — see "Sibling boundaries and open gates".

7. **The lazy island wrapper.** `next/dynamic` with `ssr: false` **may not be called from a Server Component in the App Router** — it is a build-time error, not a warning. So the wrapper is the client boundary and it is as small as it can be:

   ```tsx
   // components/viz/GourceIsland.tsx is NOT a separate file — this lives at the top of
   // components/viz/Gource.tsx's sibling export inside Instrument's client wrapper.
   'use client'
   import dynamic from 'next/dynamic'

   const Gource = dynamic(() => import(/* webpackChunkName: "kw-gource" */ './Gource'), {
     ssr: false,
     loading: () => <div className="ph" aria-hidden="true" />,
   })
   ```

   Gate the render on an `IntersectionObserver` with `rootMargin: '200px'` and `threshold: 0` on the `.kw-graph` container, unobserving after the first intersection. The `.ph` striped placeholder is the DS's own loading treatment (design-comp-spec §3.7) and it already exists on disk.

   **Be honest about what this buys at each breakpoint.** At 1080p the gource pane's bottom edge sits exactly at the viewport bottom (274 + 14 + 32 + 602 + 38 = 960 = `100dvh − 60`), so the observer fires on the first callback after paint. The property that still holds — and the one KW-030 tests — is that the chunk is requested in a *second* network wave, after HTML, CSS and shell JS, rather than in the initial parallel wave. On a phone, where `.kw-instr` becomes auto-height and `.kw-graph` is a fixed 340 px below the contributions pane, the deferral is real and the chunk genuinely waits for a scroll. Write the acceptance at a 390×844 viewport for that reason.

8. **Canvas type tokens.** Read once per resize inside `useCanvasSurface` and publish through `SurfaceGeometry.font`; the driver hands them to the render modules. This is the port fix for design-comp-spec §5.5's `'700 9px'` / `'600 9px'` / `'800 13px'` literals. Verify with `grep -rnE "font\s*=\s*['\"\`][^'\"\`]*[0-9]+px" lib components app` returning nothing outside KW-022's files, which take the sizes as data.

9. **Reduced motion.** This ticket does not implement the reduced-motion path — KW-024 owns `settleStatic()` and the `matchMedia('(prefers-reduced-motion: reduce)')` `change` listener (the prototype reads the query once in its constructor and never updates). What this ticket must do is **not break it**: attach surfaces exactly the same way under reduced motion so the driver has somewhere to render its one static frame, and never gate attachment on `playing`.

10. **The transport-bar mount, and the one conditional in this ticket.** KW-026 creates `app/regions/TransportBar.tsx` and it does not depend on KW-025, so at pickup the file may or may not exist.

    - If `app/regions/TransportBar.tsx` **exists**: import it and pass it as the gource pane's `footer`. That is the comp's structure (comp:105-116, the third child of the gource `.pane`, 38 px tall).
    - If it **does not exist**: render `footer={null}` and leave the comment `{/* KW-026 mounts TransportBar here — comp:105-116 */}` on the exact line. KW-026 then makes a two-line change (one import, one prop) to `app/regions/Instrument.tsx` under a conflict exception declared on **KW-026's** record, not on this one. This mirrors the KW-004/KW-005 `app/layout.tsx` precedent already set in this pack; a write-surface overlap between hard-ordered or exception-declared tickets is a warning, never an error.

    Do not create, stub or re-export `TransportBar` from this ticket. A stub here and a real file there is a duplicate-symbol merge conflict in the narrowest wave of the plan.

11. **Formatting and lint.** Run `npm run format` (KW-001's declared script, Prettier + `prettier-plugin-tailwindcss`) before committing. `npm run typecheck` is `next typegen && tsc --noEmit` — run the whole script, not a bare `tsc`.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on Node 24.
- `grep -rn "requestAnimationFrame" app components lib --include=*.ts --include=*.tsx | cut -d: -f1 | sort -u` returns exactly `lib/viz/driver.ts` (KW-024's invariant, unbroken).
- `grep -rnE "on(mouse|touch)[a-z]*|addEventListener\(['\"](mouse|touch)" app/regions/Instrument.tsx components/viz/` is empty, and `grep -rn "setPointerCapture" components/viz/Overview.tsx` is non-empty (Invariant 4).
- A browser-mode Vitest test (KW-011's canvas project, real Chromium) asserts the DPR contract: with `deviceScaleFactor: 3`, a 1194×602 CSS box yields `canvas.width === 2388 && canvas.height === 1204` and `ctx.getTransform().a === 2` — proving both the `Math.min(2, …)` clamp and the `setTransform` re-application.
- The same test resizes the box a second time and re-asserts `ctx.getTransform().a === 2`, catching the "correct on first paint, half-scale after resize" regression.
- Isolation, using KW-011's `test/canvas-recorder.ts` Proxy: mount `<Ribbon>` under a parent that re-renders with an unrelated prop; assert **zero** new recorded draw commands and that the ribbon component's render count is unchanged (Invariant 3).
- Touch parity: a Vitest browser test dispatches a synthetic `pointerdown`/`pointermove`/`pointerup` sequence with `pointerType: 'touch'` on the overview canvas and asserts `driver.scrubTo` was called with a monotonically changing fraction; a `pointercancel` after `pointerdown` releases capture and leaves no drag state.
- `grep -rn "touch-action\|touchAction" components/viz/Overview.tsx` is non-empty.
- No canvas type literal survives: `grep -rnE "font\s*=\s*['\"\`][^'\"\`]*[0-9]+px" app components` is empty.
- Accessibility shape: every `<canvas>` in the tree matches `grep -c 'role="img"'`, every one has a non-empty `aria-label`, and the rendered ribbon contains a `.sr-only` `<table>` whose `<tbody>` row count equals `manifest.dayCount`.
- Laziness: `npm run build` then `grep -rl "kw-gource-island" .next/static/chunks/` returns at least one file, and that file is **not** the entry or main chunk — i.e. `grep -l "kw-gource-island" .next/static/chunks/main-*.js .next/static/chunks/app/layout-*.js` is empty.
- No static import of the island: `grep -rn "from '@/components/viz/Gource'\|from './Gource'" app components | grep -v "import(" ` is empty.
- Write-surface discipline: `git diff --name-only origin/main...HEAD` is a subset of the "Writes" list, and `git diff --stat origin/main...HEAD -- package.json package-lock.json app/globals.css styles/ app/page.tsx app/layout.tsx app/regions/_contract.ts lib/` is empty (DEC-003, DEC-005).

### At-merge gate

- `ci-ok` is green on the exact PR head, with `typegen`, `typecheck`, `lint`, `build` and the `unit` job (including the browser-mode canvas project) all run by KW-001's `.github/workflows/ci.yml`.
- `e2e-ok` is green: KW-023's smoke spec loads `/` in the pinned `mcr.microsoft.com/playwright:v1.62.1-noble` container with no page errors — in particular no `ResizeObserver loop completed with undelivered notifications`, which is the specific failure a `getBoundingClientRect()` call inside the observer callback produces.
- The PR diff touches no file owned by a wave-5 sibling — specifically not `app/regions/TransportBar.tsx`, not `lib/viz/render/**`, not `lib/viz/driver.ts`, not `components/viz/ContributionTable.tsx`.
- `npx size-limit --json` (KW-030's gate, if already merged) shows the canvas island under its 90 kB brotli budget and the app shell under 120 kB; if KW-030 has not merged, record the two measured numbers in the PR body so KW-030 can set its budget against a real baseline rather than a guess.
- Rebasing onto current `main` produces no conflict in `app/regions/Instrument.tsx` beyond the transport-footer line, evidence that KW-005's contract wiring and any already-merged KW-026 mount were preserved rather than regenerated.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.** Four runtime failure modes, all of them silent, all of them covered above. (1) A zero-size content box on first observation allocates a 0×0 backing store and every subsequent draw no-ops with no error — guarded by the early return, asserted by the DPR test. (2) `canvas.width` assignment resets the 2D context, so a missing `setTransform` after the *second* resize halves everything with no console output — asserted by the double-resize test. (3) `pointercancel` without a capture release strands the scrubber in drag state on touch — asserted directly. (4) `getBoundingClientRect()` inside a `ResizeObserver` callback produces an undelivered-notification loop that Playwright reports as a page error and Chromium reports as an uncaught exception — the implementation reads `contentBoxSize` instead. Degradation: if `lib/bundle/loader.ts` yields no payload, every canvas still mounts and sizes correctly and the driver renders an empty frame; the region must not throw, blank, or unmount, because it sits above every other region in the document.

**Security.** No user input crosses a trust boundary; no secret, no network call this ticket owns, no `dangerouslySetInnerHTML` anywhere in these files, and none is ever permitted in them — the comp builds its tooltip with `tip.innerHTML = '<div …>' + …` (comp:698-702) and that pattern must not be ported, because the strings interpolated into it are repository and file names from the bundle. Build the tooltip from JSX. Under DEC-015 the phone number `856-723-2521` must not appear in the repository or the build output; this ticket ships no personal data at all.

**Migration.** None. No persisted state, no URL change, no stored preference. The overview strip's `winStart` and the ribbon's pinned cell are in-memory only and reset on reload, which is the comp's behaviour today.

**Accessibility.** This is the ticket's substantive risk surface, and it is the one place on the site where automated tooling is structurally blind: there is **no canvas rule anywhere in the Deque axe 4.10 index**, so nothing painted here is visible to KW-029's axe run. What this ticket therefore owns explicitly: `role="img"` plus a payload-derived accessible name on all three canvases; the DEC-011 visually hidden table as the ribbon's text alternative, rendered once and never re-rendered; a tooltip marked `aria-hidden="true"` and dismissible with `Escape` (WCAG 1.4.13); Pointer Events so the scrubber is operable by touch and pen rather than declaring `cursor:ew-resize` at users who cannot use it; `touch-action: none` so scrubbing does not fight the page scroll; and `role="log"` with `aria-live="polite"` on the events pane so appended lines are announced without a live region firing on pointer movement. Deferred by design and named here so KW-029 can find them: extraction and possible widening of the hidden table into `components/viz/ContributionTable.tsx`, an SSR/`<noscript>` rendering of that table (it is client-rendered here, so it is present for screen readers but not for a JS-disabled crawler), the canvas-painted contrast assertion over the gruvbox token pairs (a unit test, because axe cannot do it), the `prefers-reduced-motion` halt proof, and the `--gray` on `--surface-pane` caption contrast failure measured at **4.47:1**, whose token fix belongs to KW-003.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, app/regions/_contract.ts, components/ds/Pane.tsx, lib/viz/driver.ts, lib/viz/render/**, lib/bundle/loader.ts, styles/kw.css, app/globals.css
- Writes: app/regions/Instrument.tsx, components/viz/Overview.tsx, components/viz/Ribbon.tsx, components/viz/Gource.tsx, components/viz/useCanvasSurface.ts
- Contracts: components/viz/useCanvasSurface.ts, canvas surface attachment seam with lib/viz/driver.ts
- Safety: canvas accessibility semantics and text alternative, single-rAF-owner invariant, lazy gource chunk boundary

The synthesis states this ticket's write surface as `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx`. `components/viz/useCanvasSurface.ts` is a fifth file inside the same exclusively-owned directory, added so the ResizeObserver/DPR/token logic exists once rather than three times; the only other ticket that writes anything under `components/viz/**` is KW-029, and it writes `ContributionTable.tsx`, which this ticket does not create.

## Sibling boundaries and open gates

Same level (KW-025, KW-026), disjoint write surfaces, one declared coordination point:

- **KW-026** owns `app/regions/TransportBar.tsx` and the deletions in `lib/viz/render/ribbon.ts` (`drawGame` comp:637-684, its call site comp:633, `this.walkable`, `this.bot`, `this.userPlay`, the `window` `keydown` block comp:477-491, `clockRef`, `infoOpen`/`onInfoIn`/`onInfoOut`, and `.kw-hide-md` — ~65 lines). **`this.rbGeom` (comp:577) survives that deletion**; this ticket's hit test depends on the geometry it describes. KW-026 also rebinds `Space` to play/pause *scoped to the transport region* — this ticket must not add any `window`-level key listener, or the two will fight. The transport mount into `app/regions/Instrument.tsx` is KW-026's two-line change under a conflict exception declared on KW-026's record; see implementation note 10.

Upstream, and exactly what is consumed:

- **KW-005** produces `app/regions/_contract.ts` (`InstrumentProps`, `REGION_META.instrument`, `RegionCommonProps`) and `components/ds/Pane.tsx` (`PaneProps`, including `footer`, `as`, `labelledBy`, `bodyStyle`, `bodyClassName`). Quote them; never redeclare them locally, and never edit `_contract.ts`. While unmerged: nothing in this ticket can be started — `Instrument.tsx` does not exist without it.
- **KW-024** produces `lib/viz/driver.ts` and `lib/viz/testHarness.ts`. Consumed: surface attach/detach/resize/invalidate, `setPointer`, `scrubTo`, and `inspect(): VizFrameInfo`. While unmerged: build `useCanvasSurface` and the three components against the interface sketch above with a local no-op driver stub *inside `components/viz/`*, and delete the stub before opening the PR — a shipped stub is a second rAF owner waiting to happen.
- **KW-022** (transitively) produces `lib/viz/render/{graph,ribbon,overview}.ts`. Consumed indirectly: ribbon geometry via `highlightCell`, and the isotropic-gutter and `clamp(16px, 4%, 40px)` projection fixes. Read-only. Never re-derive the cell inversion here.
- **KW-015** produces `lib/bundle/loader.ts`. Consumed: the boot payload and the manifest fields `generatedAt`, `windowStart`, `windowEnd`, `dayCount`, `repoCountDefinition` — every one of which DEC-008 requires the UI to read rather than hardcode. While unmerged: gate the hidden table and the accessible name behind a null payload and render the canvases empty.
- **KW-003** produces every stylesheet, including `.kw-instr`, `.kw-lower`, `.kw-graph`, `.kw-tail` and `.sr-only`, the `100dvh` correction, and the `--gray` contrast fix. This ticket consumes class names and writes no rule.

Downstream, and what they will assert against this ticket:

- **KW-029** runs axe on `/`, extracts and verifies the hidden table (`components/viz/ContributionTable.tsx`), and proves the reduced-motion halt. It verifies; it does not sweep (DEC-005). The `role="img"`, the accessible names and the table's existence are this ticket's to get right.
- **KW-030** asserts the size budgets and owns `e2e/lazy-island.spec.ts`, which greps for `GOURCE_CHUNK_MARKER` in requested chunk bodies before and after scrolling `.kw-graph` into view at a 390×844 viewport.
- **KW-031** seeks to fixed ticks, asserts the `VizFrameInfo` struct, and only then screenshots with `maxDiffPixels: 0`. Its DPR backing-store assertion is against the geometry contract above; a change to the clamp is a baseline-invalidating change.
- **KW-032** composes the final page and verifies production.

Unowned residual, recorded rather than absorbed: **populating the events tail pane** (`pushLog` comp:928-937, the `logLine` formatter, the `fit = max(8, floor((clientHeight − 16) / 20))` trim rule with its hardcoded 20 px line height, and the `.padStart(7,'0')` hash alignment fix) is named in the design track but assigned to no ticket in the plan. This ticket ships the container with correct live-region semantics and stops there. Open a deferred-findings entry so the Executor can promote it if the events pane is empty at capstone.

Open gates: **none block pickup of this ticket.** GATE-002 (HG-2, `workflow` scope) touches only tickets that write `.github/workflows/**`. GATE-003 (HG-3, `CONTRIB_TOKEN`) blocks the grid *figures*, not the mount — the canvases must render correctly against a payload whose numbers are provisional. GATE-005 (HG-5) blocks `content/**`, which this region does not import. GATE-007 (HG-7, scanline treatment) is a token change in KW-003's files.
