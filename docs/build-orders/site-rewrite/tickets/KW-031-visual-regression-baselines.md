# KW-031 — Visual regression baselines and determinism canary

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Three new files plus one surgical edit to a config another ticket owns. Small in volume; the failure mode is a gate that reports green while asserting nothing, because the `--update-snapshots` guard, the snapshot path template, the pixel tolerance and the baseline-provenance check each have an obvious form that enforces nothing.

**Risk:** Medium-high for the fleet, none for the product: no user-facing code ships, so the deployed site cannot break. Three measured hazards, detailed below, plus one process one: it is the third file under `.github/workflows/**`, so it fails at *push* time — after all the work is done — until GATE-002 is closed.

**Phase hint:** 6

**Depends on:** KW-023, KW-024, KW-025

**Serializes with:** none

**Requirements:** REQ-008, REQ-010

**Decisions:** DEC-003, DEC-005, DEC-008, DEC-010, DEC-012, DEC-016

**Gates:** GATE-002

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`e2e/canvas.spec.ts` seeks the visualization to four fixed ticks through `window.__viz`, asserts the whole `VizFrameInfo` struct at each — tick, date, live repository set, highlight cell, RNG state, draw calls — and only then compares twelve pixel baselines that exactly one machine may produce. A double-render canary proves two renders at the same tick are byte-identical before any baseline is trusted; `playwright.config.ts` refuses to write a baseline outside `mcr.microsoft.com/playwright:v1.62.1-noble` for every documented spelling of the update flag; and `.github/workflows/snapshots.yml` regenerates baselines on an owner's `/update-snapshots` comment with a PAT, failing any pull request that changes a baseline by another route.

## Context and evidence

KW-023 built the hermetic container job and shipped no screenshot; KW-024 built a driver whose design goal is that a frame is a pure function of `(SimInput, seed, tick)`; KW-025 mounted the three canvases. This ticket asserts all three claims as bytes.

**C-23 — both container-enforcement mechanisms in the research are no-ops as written, and this ticket owns the half KW-023 could not.** The ci-testing track proposed `process.argv.includes('--update-snapshots')` as the guard against authoring a baseline outside the pinned image; `-u`, `--update-snapshots=all` and `--update-snapshots=changed` all slip through it. The installed CLI definition, `node_modules/playwright/lib/program.js:226`, is

```
["-u, --update-snapshots [mode]",
 { choices: ["all", "changed", "missing", "none"], preset: "changed" }]
```

— three spellings, one shorthand, one optional `=mode` suffix, and a bare `-u` presetting to `changed`. The corrected guard the synthesis mandates is `process.argv.some(a => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='))`, written out in File 1. The verifier's belt-and-braces addition — a CI step failing any PR whose commits touch `e2e/__screenshots__/**` without coming from the `update-snapshots` workflow — is adopted, and lives in this ticket's own workflow file, not KW-023's `e2e.yml` (DEC-005: that is KW-023's exclusive write surface).

**C-22 — visual baselines must never come from a CDN-served preview.** Nothing in `canvas.spec.ts` or `snapshots.yml` may set `BASE_URL`, subscribe to `repository_dispatch`, or read a Vercel deployment. Baselines come from a server this repository built, inside the pinned image, or they are not produced.

**C-24 / DEC-016 — `VizFrameInfo.rngState` is one 32-bit `number`, not the four-tuple the viz-runtime track sketched**; KW-024 states that supersession explicitly and this document quotes the corrected shape. Three upstream defects that would each have made this suite flaky — a closure RNG making `step` impure, `structuredClone` throwing on a function-valued state field, `no-restricted-globals` without `{ checkGlobalObject: true }` missing `window.requestAnimationFrame` — are fixed in KW-008 and KW-024.

**KW-024 resolved a contradiction in the viz-runtime track so this ticket could exist.** Its §8.1 put `lastFrameMs` on `VizFrameInfo` while §8.3 asserted `expect(b).toEqual(a)` on two `seekTick(3600)` results; one is a wall-clock measurement, so both cannot hold. Resolution: `VizFrameInfo` is deterministic by construction and carries no timing value, timings moved to `driver.perf()`, which tests never compare. This ticket's central assertion is `expect(b).toEqual(a)`.

**KW-024 invariant I-D4 constrains how every screenshot is taken.** `seekTick(t)` and `reset() + renderFrame(t)` are each deterministic but *not* equal: `seekTick` produces the settled frame (`alpha = live ? 1 : 0`, `heat = live ? 0.32 : 0`, `beamHead = 0`, actors snapped), while free playback carries path-dependent transient motion by design. Hence **KW-031 must take every screenshot through `seekTick`**; a `renderFrame` baseline would be reproducible only by replaying the identical path.

**DEC-008 forbids the obvious shortcut.** Every number reads from a `generatedAt`-stamped payload, in test code as much as in copy. The spec asserts *relations* — the tick it asked for is the tick it got, dates decrease monotonically into the past across the rewind, every live repository's era contains the cursor date, draw calls sit under an imported cap — never a hardcoded date, day count or repository name.

**DEC-010 makes the live set assertable.** Lifespan-interval visibility with dimmed ghost outlines means `VizFrameInfo.liveRepos` at tick *t* is exactly the set whose `[from, to]` era contains the cursor date, and `ghostRepos` counts those whose era has ended.

**DEC-012 supplies the enforcement this ticket's own guard cannot:** KW-002 ships `.github/CODEOWNERS` with `/e2e/__screenshots__/    @its-everdred` and a ruleset carrying `require_code_owner_review: true`.

**GATE-002 (HG-2) is open and blocks push, not work**, and **`SNAPSHOT_PUSH_TOKEN` is an operator precondition not in the gate register.** Both are stated in full under "Sibling boundaries and open gates"; confirm the first with `gh auth status` before writing a line.

**Plan-context navigation** (repository-relative; research paths resolve at `e664d73a195facd64db58ba10952170ff01b4772`). In `docs/build-orders/site-rewrite/`: `README.md`, `build-order.json` (manifest, surfaces, graph edges, `decisions[]`, `external_gates[]`), `authority-envelope.md` (Executor authority, live gate register), and the producer contracts quoted here under `tickets/` — `KW-023-playwright-containerized-e2e.md`, `KW-024-viz-driver-harness-reduced-motion.md`, `KW-025-region-instrument-pane.md`, `KW-022-viz-render-modules.md`, `KW-012-bundle-schema-codec-contract.md`, `KW-015-client-bundle-loader.md`. In `docs/research/`: `2026-07-31-decomposition-synthesis.md` §3–§4 (D-01..D-17 → DEC-001..DEC-017, HG-1..HG-7 → GATE-001..GATE-007), §5 (this ticket's pointers), §6 (waves; this ticket is wave 6, weight 3); `2026-07-31-ci-testing.md` §3.5, §5.4–§5.7, §6, §10.5 and "Verification corrections" C4/C5; `2026-07-31-viz-runtime.md` §8.

**REQ-008** — the system is a deterministic function of its inputs: the same inputs produce byte-identical output on every run. *Trace:* the terminal proof of the client-runtime half. It does not implement determinism; it makes a violation fail a pull request, at the only layer where a violation is visible to a human — the pixels.

**REQ-010** — the browser gate is version-locked end to end and the interactive instrument stays inside its measured frame budget. *Trace:* the guard and the path template bind the baseline bytes to one container tag and one npm package, so a dependency bump cannot silently re-render what CI looks at; and every asserted frame compares `drawCalls.total` against `CAPS.maxDrawCalls` imported from KW-022, so a renderer that starts spending frames faster fails before a human notices jank.

## Scope

- Edit `playwright.config.ts` — the single follow-up edit KW-023 reserves for this ticket — adding the corrected `--update-snapshots` container guard, `snapshotPathTemplate` with no platform segment, and the `expect.toHaveScreenshot` comparison settings. Change nothing else in that file.
- Create `e2e/canvas.spec.ts`: a deterministic fixture payload built in memory and served by `page.route`; an inventory guard over the three mounted canvases; four seeked ticks each asserting the full `VizFrameInfo` struct before any pixel comparison; a per-canvas screenshot at each tick; a double-render determinism canary; a seek-idempotency check; a device-pixel-ratio backing-store assertion.
- Commit exactly twelve baseline PNGs under `e2e/__screenshots__/desktop-2x/canvas.spec.ts/`, produced inside `mcr.microsoft.com/playwright:v1.62.1-noble` and nowhere else.
- Create `.github/workflows/snapshots.yml` with two independent jobs: `guard` on `pull_request`, failing any baseline change that lacks the container provenance trailer; `update` on `issue_comment`, regenerating baselines inside the pinned container and pushing them to the pull-request branch with `SNAPSHOT_PUSH_TOKEN`.
- Assert the baseline population bound in the spec itself: at most twelve PNGs under `e2e/__screenshots__/**`, and no Git LFS pointer or `.gitattributes` filter covering them.
- Prove the guard fires for every documented spelling of the update flag, and that a `GITHUB_TOKEN` push does not re-run `e2e` while a PAT push does — recording both in the pull-request body.

## Non-goals

- No accessibility assertion, no `@axe-core/playwright`, no `e2e/a11y.spec.ts`, no contrast unit test — KW-029 owns all of it, including the `reduced-motion` project.
- No bundle-size assertion, no `.size-limit.json`, no `scripts/ci/check-first-load.mjs`, no `e2e/lazy-island.spec.ts`, no Lighthouse CI — KW-030 owns those, including the "no gource chunk before scroll-into-view" proof.
- No edit to `.github/workflows/e2e.yml` or `ci.yml`, and no change to the `e2e-ok` or `ci-ok` aggregators; the provenance guard lives in this ticket's own workflow.
- No promotion of any status context to required. `.github/rulesets/main.json` is KW-002's and today requires exactly `ci-ok`; promoting `e2e-ok` or a snapshot context is a governance change coordinated by the Executor.
- No edit to `package.json` or `package-lock.json` — frozen by DEC-003. In particular **do not add a `test:e2e:update` npm script**; KW-001's frozen list is `dev build start lint format typecheck typegen test:unit test:e2e data:build size`. The local escape hatch is the raw `docker run` command below.
- No renaming, reordering, adding or removing of Playwright projects, and no weakening of `retries: 0`, `timezoneId: 'UTC'`, `locale: 'en-US'`, `colorScheme: 'dark'` or `forbidOnly`. KW-023 owns the inventory and four gate tickets select projects by name.
- No application code: no `data-testid`, no element `id`, no `aria-*` attribute on any canvas. A missing stable selector is a KW-025 defect to report, not a file to edit.
- No new file under `e2e/` other than `canvas.spec.ts` and the `__screenshots__` tree; the fixture is built in memory and never lands on disk.
- No `merge_group:`, `repository_dispatch:` or `pull_request_target:` trigger, and no `BASE_URL` anywhere in this ticket's files.
- No baseline for any project other than `desktop-2x`, and none captured from a Vercel preview.

## Existing owner and reuse target

`playwright.config.ts` **exists and is owned by KW-023**, which shipped it with a reserved comment block naming this ticket as the only legal author of the three additions below. Extend that file; do not create a second config or move existing keys. Everything else here is new: `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772 -- .github e2e playwright.config.ts` returns nothing at the researched commit.

| Target | Status |
|---|---|
| `playwright.config.ts` | **KW-023.** Its reserved comment block covers `snapshotPathTemplate`, the `toHaveScreenshot` tuning and the `-u` guard; replace the comment with the code. |
| Projects `desktop-2x`, `desktop-1x`, `mobile-1x`, `smoke`, `reduced-motion` | **KW-023.** `desktop-2x` is already `testMatch: /canvas\.spec\.ts/` with `deviceScaleFactor: 2`; the other four already exclude `canvas.spec.ts`. |
| `e2e/screenshot.css` and `expect.toHaveScreenshot.stylePath` | **KW-023**, inert until this ticket takes the first baseline. It neutralises the six unguarded infinite animations in the vendored design system and hides `.tmux .seg.clock`. Do not edit it. |
| `.github/workflows/e2e.yml`, the `pin` job, the `e2e-ok` context | **KW-023.** Read-only. The two shards already run `npx playwright test`, which picks up `canvas.spec.ts` with no workflow change. |
| `mcr.microsoft.com/playwright:v1.62.1-noble` and `@playwright/test@1.62.1` | **Exist**; see "Exact version pins". |
| `window.__viz` / `VizTestHarness` / `VizFrameInfo` | **KW-024**, in `lib/viz/testHarness.ts` and `lib/viz/driver.ts`, gated on `?viz-test=1`. |
| `DWELL_TICKS`, `tickMapping`, `cursorDayAtTick`, `formatDayISO` | **KW-024**, exported from `lib/viz/driver.ts`. |
| `CAPS`, `FrameReport`, `assertFrameBudget` | **KW-022**, in `lib/viz/render/budget.ts`; `CAPS.maxDrawCalls` is `3000`. **Import `CAPS` only:** `assertFrameBudget` takes a `FrameReport`, but the harness surfaces `drawCalls` as a plain count object, so the assertion is `info.drawCalls.total <= CAPS.maxDrawCalls`. If KW-024 later widens `VizFrameInfo` to carry the sealed report, switch to `assertFrameBudget`; do not widen it from here. |
| `<section className="kw-instr">` | **KW-005** stub, **rewritten by KW-025** with the three canvases inside it. The selector root. |
| Three canvases with `role="img"` and a payload-derived `aria-label` | **KW-025** (its Invariant 7). DOM order overview, ribbon, gource. |
| `encodeBundle`, `BundleInput`, `BundleMeta`, `RepoRecord`, `GridSeries`, `SortableEvent`, `chunkFileName`, `dictFileName` | **KW-012**, in `lib/bundle/{schema,codec}.ts`. Builds the fixture payload. |
| `BAND_LOWER_BOUNDS` | **KW-007**, in `lib/viz/tokens/level.ts`; it is the `GridSeries.bands` value KW-012's schema calls "owned by KW-007". Import it relatively (`../lib/viz/tokens/level`): the `@/` alias resolves through `vite-tsconfig-paths`, a Vitest concern, not a Playwright one. |
| Client URL prefix `/data/v1` | **KW-015**, as `DEFAULT_BASE_URL` — **not** `DATA_ROOT` (`public/data/v1`), a repository path that would 404. The `page.route` pattern must match the client URL. |
| `.github/CODEOWNERS` entry `/e2e/__screenshots__/` | **KW-002.** Read-only here; the enforcement half of baseline provenance. |
| `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/github-script@v9.0.0` | **Exist**; see "Exact version pins". |
| `SNAPSHOT_PUSH_TOKEN` | **Does not exist.** Operator precondition, not a declared gate. See "Sibling boundaries and open gates". |

## Contract and invariants

### The comparison settings, and why every value in the research is wrong

The load-bearing decision of the ticket, re-derived from the installed package, not the docs. Three measurements at `node_modules/playwright-core/lib/coreBundle.js`:

```js
// coreBundle.js:7551 — the default per-pixel tolerance
count = pixelmatch(expected.data, actual.data, diff.data, w, h, { threshold: options.threshold ?? 0.2 });

// coreBundle.js:6659 — pixelmatch squares it
const maxDelta = 35215 * options.threshold * options.threshold;

// coreBundle.js:7562 — the default pixel-count budget is ALREADY zero
maxDiffPixels = maxDiffPixels1 ?? maxDiffPixels2 ?? 0;
```

So the tolerance is `35215 × threshold²` of squared YIQ distance per pixel, and *any* pixel exceeding it fails unless `maxDiffPixels` or `maxDiffPixelRatio` was raised. For the palette this site paints:

Only `threshold: 0` catches every row below; every other value is blind to at least one.

| Change | Pair | Squared YIQ delta | Caught at `threshold: 0.2` (budget 1408.6) | at `0.15` (792.3) |
|---|---|---|---|---|
| A gource beam turns from aqua to green | `#8ec07c` → `#b8bb26` | 920.0 | **no** | yes |
| The DEC-009 ramp slips one level, L6 → L7 | `#98971a` → `#b8bb26` | 541.3 | **no** | **no** |
| The ramp slips one level, L5 → L6 | `#83881b` → `#98971a` | 138.6 | **no** | **no** |
| The ramp slips one level, L8 → L9 | `#d9d34a` → `#faeb77` | 442.2 | **no** | **no** |
| The ramp slips one level, L0 → L1 | `#3c3836` → `#404a2b` | 84.1 | **no** | **no** |
| Pane background swaps to page background | `#1d2021` → `#282828` | 40.3 | **no** | **no** |
| Muted text swaps to body text | `#928374` → `#a89984` | 231.3 | **no** | **no** |

Three conclusions, each contradicting something in the research:

1. **The Playwright defaults are decorative for this design system.** Every gruvbox pair is inside 3% of the maximum YIQ distance, the palette being *deliberately* low-contrast, so a whole canvas of beams recoloured aqua → green passes at `threshold: 0.2`.
2. **The ci-testing track's `threshold: 0.15` is a real improvement that still does not work.** It catches the one pair the track cited (920 > 792.3) and misses every adjacent contribution-ramp level; a grid rendered one ramp stop off would ship green.
3. **The ci-testing track's `maxDiffPixelRatio: 0.002` is a regression, not a tightening.** The default budget is already `0`; a ratio of 0.002 *raises* it to 2,048 pixels of a 1280×800 frame. Do not copy it. The synthesis's `maxDiffPixels: 0` is correct and is measurably the default — written explicitly as documentation of intent, not as a change.

Exact pixel equality is safe for a measured reason: pixelmatch classifies anti-aliased pixels separately and, with `includeAA` at its default, **excludes them from the count** (`coreBundle.js:6665`: `if (!options.includeAA && (antialiased(img1, ...) || antialiased(img2, ...)))` paints them in `aaColor` without incrementing the counter). Edge jitter on circles and glyphs is forgiven by the comparator itself, leaving nothing for a manual tolerance to absorb. The double-render canary licenses this: it proves bit-identity inside the container before any baseline is trusted, and if it ever fails, no tolerance would have saved the suite anyway.

The comparison contract, owned solely here and written into `playwright.config.ts` in File 1 below: `threshold: 0` (exact — `35215 * 0^2 = 0`, so any non-AA differing pixel counts), `maxDiffPixels: 0`, `animations: 'disabled'`, `caret: 'hide'`, `scale: 'css'`, `stylePath: './e2e/screenshot.css'` (KW-023 owns the file; that key already exists). Leave `maxDiffPixelRatio` unset: setting both makes Playwright take `Math.min` of the two (`coreBundle.js:7560`), which is harmless but invites a later edit to raise the wrong one.

### The snapshot path, and the platform segment that is not where the research says

The synthesis requires `snapshotPathTemplate` "without a platform segment". The installed default is:

```
// node_modules/playwright/lib/worker/workerProcessEntry.js:1254
'{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}'
```

There is no `{platform}` token in it; the platform arrives through `{-snapshotSuffix}`, which the auto-installed context fixture sets (`node_modules/playwright/lib/index.js:345`: `testInfo.snapshotSuffix = process.platform`). A default-configured baseline would land at `e2e/canvas.spec.ts-snapshots/gource-t0-desktop-2x-linux.png` — partitioned by platform, exactly wrong when there is one legal producer. The override:

```ts
snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
```

produces `e2e/__screenshots__/desktop-2x/canvas.spec.ts/gource-t0.png`. The path now asserts "these bytes are container bytes": a baseline rendered on Arch collides with the container's file instead of landing beside it, and the diff is loud.

**Do not also set `expect.toHaveScreenshot.pathTemplate`.** At 1.62.1 it takes precedence over `snapshotPathTemplate` (`workerProcessEntry.js:1257`), so setting both makes one of them dead config.

### The baseline inventory

Exactly twelve PNGs, all in one project, all under one directory: `e2e/__screenshots__/desktop-2x/canvas.spec.ts/{overview,ribbon,gource}-t{0,1,2,3}.png` — four ticks × three canvases. The tick labels are indices, not values, so an upstream `DWELL_TICKS` change does not rename twelve files; it invalidates their contents, which is what a regeneration is for. The ticks are derived, never literal:

```ts
import { DWELL_TICKS } from '../lib/viz/driver'   // 504 at FIXED_DT = 1/120 (KW-024)

const TICKS = [
  0,                     // t0: mid-dwell. I-D5 seed set: exactly the entities alive today.
  DWELL_TICKS,           // t1: last dwell tick; cursorDayAtTick returns day0 for p <= DWELL_TICKS,
                         //     the closed form's boundary condition.
  DWELL_TICKS + 3600,    // t2: 30 s into the rewind at 120 Hz.
  DWELL_TICKS + 12000,   // t3: 100 s in.
] as const
```

Invariant: **the population is bounded and asserted.** A test counts the files under `e2e/__screenshots__/**` and fails above twelve. The alternative to a bound is Git LFS, and the ci-testing track's §6 conclusion — no LFS on a portfolio site — is adopted.

### The consumed harness contract, quoted verbatim from KW-024

This ticket is a pure consumer of `window.__viz`. The shapes below are KW-024's, unparaphrased; if the real exports differ at pickup, report a KW-024 defect rather than silently adapting.

```ts
// lib/viz/testHarness.ts — KW-024 owns this
export interface VizTestHarness {
  pause(): Promise<void>;  play(): void;  reset(seed?: number): void;
  renderFrame(n?: number): Promise<VizFrameInfo>;
  seekTick(t: number): Promise<VizFrameInfo>;
  seekDate(iso: string): Promise<VizFrameInfo>;
  inspect(): VizFrameInfo;  setQuality(q: 'high' | 'low' | 'auto'): void;
}
declare global { interface Window { __viz?: VizTestHarness } }

// lib/viz/driver.ts — KW-024 owns this. DETERMINISTIC BY CONSTRUCTION:
// no wall-clock value may ever be added to it. Timings live on driver.perf().
export interface VizFrameInfo {
  readonly tick: number;  readonly cursorDay: number;  readonly cursorDayInt: number;
  readonly date: string;                  // 'YYYY-MM-DD', derived from windowStartISO
  readonly speedIndex: number;  readonly playing: boolean;  readonly reducedMotion: boolean;
  readonly settled: boolean;              // true iff the frame came from seekTick()
  readonly nLive: number;
  readonly liveRepos: readonly string[];  // ascending repo id, mapped through repoNames
  readonly ghostRepos: number;  readonly liveHash: number;
  readonly rngState: number;              // ONE 32-bit int (DEC-016), not a 4-tuple
  readonly rngDraws: number;  readonly winStart: number;  readonly beams: number;
  readonly highlightCell: { readonly week: number; readonly weekday: number } | null;
  readonly drawCalls: {
    readonly graph: number; readonly ribbon: number;
    readonly overview: number; readonly total: number;
  };
  readonly qualityTier: VizQualityTier;
}
```

Three consumption rules, all from KW-024's invariants:

- **I-D4 — every screenshot is taken through `seekTick`.** Assert `info.settled === true` before comparing pixels; `false` means the baseline came from free playback and is not reproducible.
- **I-D3 — `seekTick(t)` twice is `toEqual`-identical.** The semantic half of the determinism canary.
- **I-D6 — the harness await path contains no timers.** Commands resolve through microtasks and a synchronous `ctx.getImageData(0, 0, 1, 1)` flush on each attached canvas, so they do not deadlock under `page.clock.pauseAt`. **The application's own mount path does use `requestIdleCallback` and `IntersectionObserver` (KW-025), and those do not resolve under a paused clock** — see the pickup trap below.

### The canvas selector contract

KW-025 ships three canvases inside `<section class="kw-instr">`, each with `role="img"` and a payload-derived `aria-label`, none with an `id` or `data-testid`. The spec resolves them structurally, in the comp's DOM order:

```ts
const SURFACES = ['overview', 'ribbon', 'gource'] as const
type SurfaceId = (typeof SURFACES)[number]

/** Structural resolver. `section.kw-instr` is KW-005's; the canvases are KW-025's. */
function surface(page: Page, id: SurfaceId) {
  return page.locator('section.kw-instr canvas').nth(SURFACES.indexOf(id))
}
```

**Known unpinned assumption, stated so it fails loudly.** No upstream ticket contractually pins the canvases' DOM *order*; it is derived from the comp (overview at `docs/design/kevinweaver.dev.dc.html:76`, ribbon `:83`, gource `:97`) and from KW-025's structure, which keeps the contributions pane above `.kw-lower`. A reorder would swap the twelve baselines' identities and surface as three simultaneous pixel diffs with no obvious cause. The inventory test therefore also asserts an order-independent *shape* discriminator from `getBoundingClientRect()`: overview is the shortest of the three, gource the tallest. A mismatch fails with "canvas order changed — KW-025 reordered the instrument panes; regenerate baselines".

Invariant: the inventory test runs first and fails with an actionable message naming KW-025 if the count is not exactly three or if any lacks `role="img"` or has an empty accessible name. **Do not add a selector hook to KW-025's files to make this easier.** If KW-025 later ships a stable attribute, prefer it — but propose that there.

Naming divergence at pickup: KW-024 calls the graph canvas `graph` (`VizCanvasId = 'graph' | 'ribbon' | 'overview'`), KW-025 calls it `gource` (`VizSurfaceId = 'overview' | 'ribbon' | 'gource'`). It does not affect this ticket, which never names a surface to the driver — it only reads `drawCalls.total`, which both agree on. Use `gource` in file names, matching the comp's pane title.

### The fixture payload contract, and why the live bundle cannot be used

`public/data/v1/**` is regenerated and committed **daily** by KW-028 (at minimum a `generatedAt` bump, DEC-017), so any baseline rendered from it is invalid within a day and the DEC-014 freshness pill changes text hourly. The suite renders from a payload frozen inside the test, built in memory with KW-012's real encoder and served by `page.route`, so no fixture file lands on disk and the encoder is exercised:

```ts
import { encodeBundle } from '../lib/bundle/codec'
import type { BundleInput } from '../lib/bundle/codec'

// Small on purpose: this suite tests determinism and geometry, not scale.
// KW-022's __gate__ test owns the 13,453-entity scale case.
const FIXTURE: BundleInput = {
  meta: {
    v: 1,
    generatedAt: '2026-06-01T00:00:00Z',        // frozen; matches the faked clock
    commit: '0'.repeat(40),
    windowStart: '2024-06-01',
    windowEnd: '2026-06-01',
    dayCount: 731,                               // dayIndex('2024-06-01','2026-06-01') + 1
    repoCount: 3,
    repoCountDefinition: 'ownerPublicNonFork',
    actors: [
      { id: 0, login: 'its-everdred', kind: 'human' },
      { id: 1, login: 'its-applekid', kind: 'agent' },
    ],
    degraded: [],
  },
  repos: [
    // ids dense 0..n-1, ordered by `name` ascending — encodeBundle throws otherwise.
    { id: 0, ghId: 101, name: 'its-everdred/alpha', short: 'alpha', actor: 0, vol: 240,
      stars: 3, from: '2024-06-01', to: '2026-06-01', private: false, ext: ['ts'], status: 'ok' },
    { id: 1, ghId: 102, name: 'its-everdred/bravo', short: 'bravo', actor: 1, vol: 120,
      stars: 0, from: '2025-01-01', to: '2026-06-01', private: false, ext: ['ts','css'], status: 'ok' },
    { id: 2, ghId: 103, name: 'its-everdred/charlie', short: 'charlie', actor: 0, vol: 60,
      stars: 31, from: '2024-06-01', to: '2025-03-01', private: false, ext: ['md'], status: 'gone' },
  ],
  grid: {
    start: '2024-06-01',                         // OLDEST day; grid arrays run FORWARD
    dayCount: 731,
    human: humanSeries,                          // length 731, deterministic generator below
    agent: agentSeries,                          // length 731
    privateMonthly: privateSeries,               // length 25
    privateStart: '2024-06',
    bands: BAND_LOWER_BOUNDS,                    // imported from KW-007, never inlined
  },
  events: EVENTS,                                // ~400 SortableEvent, generated; encodeBundle
}                                                // sorts them canonically

const encoded = encodeBundle(FIXTURE)            // -> { files: Map<'manifest.json'|..., string>, ... }
```

The route handler maps the client URL prefix onto those keys. **The prefix is `/data/v1`, not `DATA_ROOT`** — KW-015's "single most likely mistake":

```ts
await page.route('**/data/v1/**', async (route) => {
  const key = new URL(route.request().url()).pathname.replace(/^\/data\/v1\//, '')
  const body = encoded.files.get(key)
  if (body === undefined) return route.fulfill({ status: 404, body: '' })
  return route.fulfill({ status: 200, contentType: 'application/json', body })
})
```

Invariants on the fixture:

- **Every series is produced by a pure integer generator seeded in the spec** — no `Math.random`, no `Date.now`, no array literal of 731 numbers. A one-line generator such as `(i) => (i * 37 + 11) % 23` suffices and is trivially reproducible.
- **No band value, no ramp colour and no contribution total is written by hand.** `BAND_LOWER_BOUNDS` is imported from KW-007's `lib/viz/tokens/level.ts`, so a band or ramp change invalidates the baselines through the same path a production change would. Do not import KW-007's `ramp.ts` (`LV`, `AG`, `PANE_SURFACE`): the ramp reaches the pixels through the render modules, not the fixture.
- **The fixture's `windowEnd` matches the faked clock's date.** Otherwise the freshness pill computes a nonzero age that drifts with the wall clock even under a fixed `generatedAt`.

### The baseline-provenance contract

Two mechanisms, and the ticket is explicit about which is which.

- **Hygiene** — every commit touching `e2e/__screenshots__/**` must carry the trailer `Snapshot-Container: mcr.microsoft.com/playwright:v1.62.1-noble`, checked by the `guard` job of `.github/workflows/snapshots.yml`. Defeatable by anyone who types the trailer; catches mistakes.
- **Enforcement** — `.github/CODEOWNERS` → `/e2e/__screenshots__/  @its-everdred`, plus `require_code_owner_review: true` on the main ruleset (KW-002, DEC-012). Not defeatable from inside a pull request; catches intent.

Only the `update` job writes the trailer, and the guard's failure message names the correct procedure.

## Refreshable implementation notes

Verify everything below against `origin/main` at pickup; the base will have moved well past `e664d73a195facd64db58ba10952170ff01b4772`.

### Pre-flight — sixty seconds, saves an afternoon

```bash
gh auth status                                        # GATE-002: 'workflow' MUST be in the scopes
test -f playwright.config.ts && grep -n 'KW-031' playwright.config.ts   # KW-023's reserved block
node -p "require('./package.json').devDependencies['@playwright/test']" # expect 1.62.1
grep -n 'desktop-2x' playwright.config.ts             # the project must already exist
ls lib/viz/testHarness.ts lib/viz/driver.ts lib/viz/render/budget.ts lib/bundle/codec.ts
grep -n 'e2e/__screenshots__' .github/CODEOWNERS      # KW-002's enforcement half
gh secret list | grep SNAPSHOT_PUSH_TOKEN || echo 'ABSENT — regeneration path is blocked'
```

If `workflow` is absent, **stop and escalate GATE-002 before writing anything**: the push is rejected after the work is complete.

### The pickup trap that will cost you a turn if you skip it

`page.clock.install()` fakes `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `Date` and `performance`, and afterwards the clock is **paused** — the injected controller only tracks wall time once `resume()` is called (`packages/injected/src/clock.ts`: `_syncRealTime` is a no-op until `_realTime` is set). KW-025 mounts the gource island behind `next/dynamic({ ssr: false })` + `IntersectionObserver` and defers first attachment to `requestIdleCallback`, which is faked and never fires on a paused clock. So `install` → `goto` → `waitForFunction(() => Boolean(window.__viz))` hangs forever.

Advance the virtual clock once after navigation, with `await page.clock.runFor(2_000)` before `waitForFunction`, to flush rIC + `IntersectionObserver`; then `await page.evaluate(() => document.fonts.ready)`, so text never renders in a fallback face. After that, KW-024's I-D6 guarantees no harness command needs the clock again. The corrected sequence is `boot()` in File 2.

Use `runFor`, never `fastForward`: `fastForward` fires each due timer at most once and drops rAF frames. This suite does not rely on rAF — the harness is paused — but the habit matters; KW-023's smoke spec already proves `runFor` behaves here.

`IntersectionObserver` is not a timer and is delivered by the rendering pipeline, so `runFor` is not what unblocks it; `waitForFunction` is. Keep both. If `window.__viz` still never appears, the island did not come into view at 1280×800 — scroll it in with `await surface(page, 'gource').scrollIntoViewIfNeeded()` **before** waiting, and record it: it also means KW-030's lazy-island assertion has a different shape than assumed.

### File 1 — `playwright.config.ts` (edit; KW-023 owns the file)

Replace KW-023's reserved comment block with the guard and fill in the two keys it reserved; nothing else in the file changes.

```ts
import { defineConfig, devices } from '@playwright/test'

// C-23 / ci-testing verifier C4b. `process.argv.includes('--update-snapshots')` is a
// no-op for three of the four documented spellings (program.js:226): `-u`,
// `--update-snapshots=all` and `--update-snapshots=changed` must all be caught.
const UPDATING = process.argv.some(
  (a) => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='),
)

if (UPDATING && process.env.KW_IN_CONTAINER !== '1') {
  throw new Error(
    'Refusing to write screenshots outside the pinned container.\n' +
      'Exactly one image produces baselines. Run:\n' +
      '  docker run --rm --ipc=host -v "$PWD":/w -w /w -e KW_IN_CONTAINER=1 \\\n' +
      '    mcr.microsoft.com/playwright:v1.62.1-noble \\\n' +
      '    sh -c "npm ci --no-audit --no-fund && npm run build && npx playwright test --project=desktop-2x -u"\n' +
      'or comment /update-snapshots on the pull request.',
  )
}

export default defineConfig({
  testDir: './e2e',

  // KW-031. No OS/arch segment: there is exactly one legal producer of these bytes. The
  // 1.62.1 default partitions by platform through {-snapshotSuffix} (index.js:345 sets
  // snapshotSuffix = process.platform), not through a {platform} token.
  // Do NOT also set expect.toHaveScreenshot.pathTemplate: it wins over this key (1257).
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',

  // ... every other key exactly as KW-023 left it (fullyParallel, forbidOnly, retries: 0,
  //     workers, reporter, webServer, use, projects); do not reorder or reformat.

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // KW-031, measured — see "The comparison settings". 0.2 is blind to a full
      // aqua->green beam recolour; AA pixels are excluded from the count (6665).
      threshold: 0,
      // Already the default (7562), stated so a future edit has to argue with it.
      // Do NOT add maxDiffPixelRatio: 0.002 — that RAISES the budget from 0 to ~2048 pixels.
      maxDiffPixels: 0,
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      stylePath: './e2e/screenshot.css',   // KW-023 owns the file
    },
  },
})
```

### File 2 — `e2e/canvas.spec.ts` (new)

Structure, in order; every test runs only in `desktop-2x`, already scoped to this file by KW-023.

```ts
import { test, expect, type Page } from '@playwright/test'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DWELL_TICKS } from '../lib/viz/driver'
import { CAPS } from '../lib/viz/render/budget'
import { encodeBundle, type BundleInput } from '../lib/bundle/codec'
import { BAND_LOWER_BOUNDS } from '../lib/viz/tokens/level'   // KW-007 owns the band ladder.

const SEED = 1
const EPOCH = new Date('2026-06-01T00:00:00.000Z')
const TICKS = [0, DWELL_TICKS, DWELL_TICKS + 3600, DWELL_TICKS + 12000] as const
const SNAPSHOT_DIR = join(__dirname, '__screenshots__')
const MAX_BASELINES = 12

const FIXTURE: BundleInput = /* the worked shape in Contract and invariants */ null as never
const ENCODED = encodeBundle(FIXTURE)

// SURFACES, SurfaceId and surface() exactly as in "The canvas selector contract".

/** goto + freeze + fixture + harness ready. Every test starts here. */
async function boot(page: Page) {
  await page.clock.install({ time: EPOCH })
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (r) => r.abort())
  await page.route('**/data/v1/**', async (route) => { /* fulfill from ENCODED.files */ })
  await page.goto(`/?viz-test=1&seed=${SEED}`)
  await page.clock.runFor(2_000)
  await page.waitForFunction(() => Boolean(window.__viz))
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.__viz!.pause())
  await page.evaluate(() => window.__viz!.setQuality('high'))
}
```

Then eight test bodies:

1. **`canvas inventory`** — `expect(page.locator('section.kw-instr canvas')).toHaveCount(3)`; for each, `getAttribute('role') === 'img'` and a non-empty `aria-label`; plus the order discriminator `overview.height < ribbon.height < gource.height` from `boundingBox()`. The failure message must name KW-025: "three canvases with role=img are KW-025's Invariant 7; do not add hooks here."
2. **`frame semantics at each tick`** — loop over `TICKS`; for each, `const info = await page.evaluate((t) => window.__viz!.seekTick(t), t)`, then assert, before any pixel comparison:
   - `info.tick === t` and `info.settled === true` (I-D4);
   - `info.date` matches `/^\d{4}-\d{2}-\d{2}$/` and lies inside `[FIXTURE.meta.windowStart, FIXTURE.meta.windowEnd]`;
   - `Number.isInteger(info.rngState)` and `info.rngState >>> 0 === info.rngState` (DEC-016: one 32-bit int, not a tuple);
   - `info.liveRepos` is strictly ascending and every entry's `[from, to]` era contains `info.date` (DEC-010), and `info.ghostRepos` counts the repos whose `to` precedes `info.date`;
   - `info.highlightCell` is either `null` or `{week: 0..52, weekday: 0..6}`;
   - `info.drawCalls.total <= CAPS.maxDrawCalls` and equals `graph + ribbon + overview`;
   - `info.qualityTier === 0` (the `setQuality('high')` pin, so degradation can never move a baseline).
3. **`dates walk backwards across the rewind`** — dates at `TICKS[1..3]` are non-increasing and `TICKS[2] > TICKS[1]` gives a strictly earlier date: the reverse-playback requirement with no literal in it.
4. **`baselines`** — for each tick index `i` and surface `s`, `await expect(surface(page, s)).toHaveScreenshot(\`${s}-t${i}.png\`)`. Runs after (2) in the same test so the semantic assertion fails first.
5. **`seek idempotency`** — `seekTick(TICKS[2])` twice; `expect(b).toEqual(a)` (I-D3). Seek to `TICKS[0]` in between, to prove path independence rather than caching.
6. **`double-render determinism canary`** — two raw `screenshot()` buffers of the gource canvas at the same tick, `expect(Buffer.compare(a, b)).toBe(0)`. This licenses `threshold: 0`; the failure message must say that if it fails, no other visual result in the suite means anything.
7. **`backing store honours devicePixelRatio`** — for each surface, read `{ w, h, cssW, cssH, dpr }` from the element and assert `w === Math.round(cssW * Math.min(2, dpr))` and likewise for height. Comment that `desktop-2x` runs at `deviceScaleFactor: 2`, so this asserts the *arithmetic* but not the *clamp*; the clamp at dpr 3 is KW-025's browser-mode Vitest test, and duplicating it would need a new project, which KW-023 owns.
8. **`baseline population is bounded and unLFS'd`** — walk `SNAPSHOT_DIR`, assert at most `MAX_BASELINES` files, every one a `.png` starting with the PNG magic `89 50 4E 47` rather than `version https://git-lfs`, and that no `.gitattributes` declares a filter over `e2e/__screenshots__`.

### File 3 — `.github/workflows/snapshots.yml` (new)

```yaml
name: snapshots

on:
  pull_request:
    branches: [main]
  issue_comment:
    types: [created]

# No merge_group (C-21: no merge queue exists on a User-owned repo).
# No repository_dispatch (C-22: baselines never come from a preview).
# No pull_request_target: the update job checks out and RUNS pull-request code.

concurrency:
  group: snapshots-${{ github.event.pull_request.number || github.event.issue.number || github.ref }}
  cancel-in-progress: false        # never cancel a job that is mid-push

permissions:
  contents: read

jobs:
  # Hygiene. Fails a PR whose baseline change did not come from the update job.
  guard:
    if: github.event_name == 'pull_request'
    name: snapshot-provenance
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0           # required for origin/main...HEAD
      - name: Every baseline commit must carry the container trailer
        shell: bash
        run: |
          set -euo pipefail
          TRAILER='Snapshot-Container: mcr.microsoft.com/playwright:v1.62.1-noble'
          base=$(git merge-base origin/${{ github.base_ref }} HEAD)
          touched=$(git diff --name-only "$base"...HEAD -- 'e2e/__screenshots__/**' || true)
          if [ -z "$touched" ]; then echo 'no baseline change'; exit 0; fi
          bad=0
          for sha in $(git rev-list "$base"..HEAD -- 'e2e/__screenshots__/**'); do
            if ! git show -s --format=%B "$sha" | grep -qF "$TRAILER"; then
              echo "::error::commit $sha changes a baseline without the container trailer."
              echo "::error::Regenerate by commenting /update-snapshots on this pull request."
              bad=1
            fi
          done
          [ "$bad" = 0 ]

  # The agent's regeneration path. Owner comments /update-snapshots on the PR.
  update:
    if: >-
      github.event_name == 'issue_comment' &&
      github.event.issue.pull_request != null &&
      contains(github.event.comment.body, '/update-snapshots') &&
      github.event.comment.author_association == 'OWNER'
    name: update-snapshots
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      contents: write
      pull-requests: write
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
      options: --user root --ipc=host
    env:
      HOME: /root
      KW_IN_CONTAINER: '1'
      NEXT_TELEMETRY_DISABLED: '1'
      NEXT_PUBLIC_TEST_HOOKS: '1'
    steps:
      - name: Require the push credential up front
        shell: bash
        env:
          TOKEN: ${{ secrets.SNAPSHOT_PUSH_TOKEN }}
        run: |
          if [ -z "${TOKEN:-}" ]; then
            echo '::error::SNAPSHOT_PUSH_TOKEN is not configured. A GITHUB_TOKEN push does'
            echo '::error::NOT re-run e2e, so the PR would sit on a stale red check forever.'
            echo '::error::Mint a fine-grained PAT with contents:write on this repository.'
            exit 1
          fi

      - uses: actions/github-script@v9.0.0
        id: pr
        with:
          script: |
            const { data } = await github.rest.pulls.get({
              ...context.repo, pull_number: context.issue.number });
            if (data.head.repo.full_name !== `${context.repo.owner}/${context.repo.repo}`) {
              core.setFailed('Refusing to build a fork head with a write credential.');
              return;
            }
            core.setOutput('ref', data.head.ref);

      - uses: actions/checkout@v7.0.1
        with:
          ref: ${{ steps.pr.outputs.ref }}
          token: ${{ secrets.SNAPSHOT_PUSH_TOKEN }}   # PAT: a GITHUB_TOKEN push never re-runs e2e

      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci --no-audit --no-fund
      - run: npm run build
      # The image ships the browsers; never run `playwright install` here.
      - run: npx playwright test --project=desktop-2x --update-snapshots=changed
        continue-on-error: true      # a diff is the POINT; the commit step decides

      - name: Commit and push with provenance
        shell: bash
        run: |
          set -euo pipefail
          git config user.name  'its-everdred'
          git config user.email 'its-everdred@users.noreply.github.com'
          git add -A e2e/__screenshots__
          if git diff --cached --quiet; then echo 'baselines already current'; exit 0; fi
          git commit -m 'chore(e2e): regenerate visual baselines' \
                     -m 'Snapshot-Container: mcr.microsoft.com/playwright:v1.62.1-noble'
          git push
```

Four things about this file that are deliberate and must not be "simplified":

- **`issue_comment` workflows run the default-branch copy of the workflow.** That is the point: a pull request cannot rewrite the rules by which its baselines are regenerated.
- **The author gate is `author_association == 'OWNER'` only.** The ci-testing draft also allowed `github.event.comment.user.login == 'its-applekid'`; `.aiur/config` records that `its-applekid` is **not** a collaborator (`GET /repos/its-everdred/kevinweaver-dev/collaborators/its-applekid` → 404) and that `bot_account` is `its-everdred`. A non-collaborator's comment must not start a job that runs pull-request code with a write credential. If `its-applekid` gains push access later, widen the condition then, saying why.
- **`continue-on-error: true` on the test step, not `|| true` inside it.** `|| true` also swallows a crash, a missing browser and a webServer timeout; `continue-on-error` keeps the step's conclusion visible while letting the commit step decide.
- **`--project=desktop-2x`.** Unfiltered, `smoke`, `desktop-1x`, `mobile-1x` and `reduced-motion` would run under `-u` too — slower, and if KW-029 or KW-030 later add a screenshot, theirs would be silently regenerated.

### Exact version pins used by this ticket

| Thing | Pin | How verified |
|---|---|---|
| Container | `mcr.microsoft.com/playwright:v1.62.1-noble` | MCR tag list returns twelve `v1.62.1*` tags including `-noble` |
| `@playwright/test` | `1.62.1` (installed by KW-001, DEC-003) | `npm view @playwright/test version` → `1.62.1`, current `latest` |
| `actions/checkout` | `v7.0.1` | `gh api repos/<action>/releases/latest`, 2026-07-20 |
| `actions/setup-node` | `v7.0.0` | same, 2026-07-14 |
| `actions/github-script` | `v9.0.0` | same, 2026-04-09 |
| Runner | `ubuntu-latest` (= Ubuntu 24.04 x64, matching `-noble`) | `actions/runner-images` README |

### While a dependency is unmerged

All three dependencies are hard; each blocks a different half of the ticket.

- **KW-023 unmerged** — no `playwright.config.ts` to edit, no `desktop-2x` project, no `e2e/screenshot.css`. Nothing is startable. Do not create the config; that surface is KW-023's permanently.
- **KW-024 unmerged** — `window.__viz` does not exist and no frame can be seeked. `.github/workflows/snapshots.yml` and the `playwright.config.ts` edit remain writable and testable: `npx playwright test -u` must throw, and the `guard` job can be exercised on a scratch pull request. Land nothing that commits a baseline until the harness exists.
- **KW-025 unmerged** — `section.kw-instr` contains no canvas, so the inventory test fails by design. Same partial mode.

If `window.__viz` exists but `VizFrameInfo.drawCalls` is a `number` rather than `{graph, ribbon, overview, total}`, or `rngState` is a four-tuple, that is a KW-024 regression against its own published contract: report it and stop. Do not write an adapter — it would hide the exact drift this ticket exists to catch.

## Acceptance and verification

### Agent gate

- `npx playwright test --project=desktop-2x` is green locally against a container-built server, with zero skipped tests and zero retries consumed.
- The container guard throws for all four spellings and passes only inside the container: `npx playwright test` with each of `-u`, `--update-snapshots`, `--update-snapshots=all`, `--update-snapshots=changed` exits non-zero with `Refusing to write screenshots outside the pinned container`, and the same command inside `docker run ... -e KW_IN_CONTAINER=1 mcr.microsoft.com/playwright:v1.62.1-noble` proceeds.
- The double-render canary passes: two raw `screenshot()` buffers of the gource canvas at the same tick give `Buffer.compare(...) === 0`.
- Seek idempotency passes: `seekTick(t)`, `seekTick(TICKS[0])`, `seekTick(t)` yields two `toEqual`-identical `VizFrameInfo` values, including `rngState`, `liveHash` and `drawCalls`.
- Every asserted frame reports `settled === true`, `qualityTier === 0`, `Number.isInteger(rngState)`, and `drawCalls.total <= CAPS.maxDrawCalls` with `total === graph + ribbon + overview`.
- The date sequence across the four ticks is non-increasing and strictly decreases at least once, with no calendar literal anywhere in the spec.
- `ls e2e/__screenshots__/desktop-2x/canvas.spec.ts/ | wc -l` is exactly `12`, every file is a real PNG (`file e2e/__screenshots__/**/*.png` reports `PNG image data`, not `ASCII text`), and `git check-attr filter -- e2e/__screenshots__/desktop-2x/canvas.spec.ts/gource-t0.png` reports `filter: unspecified`.
- Deleting one baseline and re-running fails with a missing-snapshot error rather than silently writing it: the suite never self-heals in CI.
- Corrupting one baseline by a single pixel and re-running fails, proving `threshold: 0` and `maxDiffPixels: 0` are live rather than overridden by a project-level `expect` block.
- `npm run typecheck` and `npm run lint` exit 0 with no new diagnostics.
- `git status --porcelain` shows one modified path (`playwright.config.ts`) and fourteen added (`e2e/canvas.spec.ts`, `.github/workflows/snapshots.yml`, twelve PNGs) — and no modification to `package.json`, `package-lock.json`, `.github/workflows/{ci,e2e}.yml`, `.github/rulesets/main.json`, `e2e/screenshot.css`, or anything under `app/`, `components/` or `lib/`.

### At-merge gate

- `ci-ok` (KW-001) and `e2e-ok` (KW-023) are both green on the exact pull-request head, with the twelve comparisons running inside the container job and no baseline regenerated during the run.
- The `snapshot-provenance` job runs on this pull request and passes, with the twelve baseline commits carrying `Snapshot-Container: mcr.microsoft.com/playwright:v1.62.1-noble`.
- A deliberate negative test is recorded: a scratch commit touching a baseline without the trailer makes `snapshot-provenance` fail with the "regenerate by commenting /update-snapshots" message, and the scratch commit is dropped before merge.
- The pull request is observed to require code-owner review because it touches `e2e/__screenshots__/**`, while a scratch pull request touching only `e2e/canvas.spec.ts` is not — proving the KW-002 CODEOWNERS scope covers the baselines and only those.
- The `GITHUB_TOKEN`-versus-PAT experiment is run once and both halves recorded in the pull-request body: a baseline commit pushed with `GITHUB_TOKEN` produces **no** new `e2e` run on the pushed head (leaving a stale check), and the same push with `SNAPSHOT_PUSH_TOKEN` does. If the secret is not yet provisioned, record the first half plus the workflow's fail-fast message and escalate to the Executor rather than merging a workflow that silently uses `GITHUB_TOKEN`.
- `gh api repos/its-everdred/kevinweaver-dev/rulesets` still lists exactly one required status check, `ci-ok`. Adding a context in this pull request is a review-blocking change.
- `git diff --name-only origin/main...HEAD` lists only `playwright.config.ts`, `e2e/canvas.spec.ts`, `.github/workflows/snapshots.yml` and the twelve files under `e2e/__screenshots__/desktop-2x/canvas.spec.ts/`.
- `grep -RnE 'merge_group|repository_dispatch|pull_request_target|BASE_URL|maxDiffPixelRatio|test:e2e:update' .github/workflows/snapshots.yml playwright.config.ts e2e/canvas.spec.ts` returns no match.
- The aggregate pull-request diff adds under 1 MiB of binary content, and `git lfs ls-files` is empty.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. Two operator actions are preconditions rather than evidence, neither satisfiable by an agent: GATE-002 closed before the branch can be pushed, and `SNAPSHOT_PUSH_TOKEN` provisioned before the regeneration path is usable.

## Failure, security, migration, and accessibility cases

**Failure — a gate that enforces nothing is the default outcome here, and it is silent.** Four guards ship against it: `threshold: 0` with a deliberate one-pixel corruption in the agent gate; the corrected `some(...)` update guard with all four spellings exercised; the path-template override, so a locally-rendered PNG collides with the container's; and the trailer/CODEOWNERS split, whose scope the pull request proves by observation.

**Failure — a flaky baseline destroys trust in the whole suite, permanently.** The mitigation is ordering, not tolerance: semantics are asserted before pixels, so a failure says *what* broke; `retries: 0` is inherited from KW-023 and must not be weakened; and the double-render canary runs in the same file, so a determinism break fails first and names the cause. If the canary fails, do not raise a tolerance — treat it as a KW-024 or KW-022 regression.

**Failure — daily data regeneration would invalidate every baseline.** The `page.route` fixture is what keeps baselines stable against KW-028's daily `generatedAt` bump; a suite rendering from `public/data/v1/**` would be red every morning and disabled within a week. Never swap the fixture for the live bundle "because it is more realistic".

**Failure — the regeneration workflow deadlocking a pull request.** A `GITHUB_TOKEN` push to a PR branch creates no workflow run (GitHub Actions security documentation, re-confirmed in ci-testing §10.5), so `e2e` never re-runs and the PR keeps a stale red check with no way forward but a manual empty commit. The workflow therefore fails fast when `SNAPSHOT_PUSH_TOKEN` is absent instead of falling back, and says why.

**Security — this ticket introduces the first workflow in the repository that runs pull-request code with a write credential, and that is the whole security story.** Four containments, all encoded in File 3: `issue_comment` rather than `pull_request_target`; `author_association == 'OWNER'`; a head-repository check before checkout, refusing fork heads; and workflow-level `permissions: contents: read` widened only on `update`, so the fork-reachable `guard` job never holds a write token. `SNAPSHOT_PUSH_TOKEN` must be a fine-grained PAT scoped to this repository with `contents: write` and nothing else; it reaches `actions/checkout` and `git push` only, and is never echoed. The PNGs render a synthetic fixture — no email, phone number, real contribution figure or token in a pixel — so DEC-015's phone-number prohibition is satisfied trivially.

**Migration.** None. The three files are additive and the `playwright.config.ts` edit only fills in reserved keys, so no existing test changes behaviour. Rollback is `git revert`, and since this ticket promotes no status context to required, a revert cannot strand an open pull request — the hazard that keeps promotion out of scope.

**Accessibility.** Not applicable as a product surface: no markup, no styling, no user-facing behaviour, no attribute added to any canvas. Two obligations are still discharged so KW-029 can work without touching these files: the inventory test asserts all three canvases carry `role="img"` with a non-empty accessible name (KW-025's Invariant 7, a precondition for KW-029's axe run, caught earlier here than in the a11y gate); and the suite never touches the `reduced-motion` project, keeping KW-029's evidence independent — the gates must be able to fail separately, because "the animation stopped" and "the animation looks right" are different claims.

## Surfaces

- Reads: `lib/viz/driver.ts`, `lib/viz/testHarness.ts`, `lib/viz/render/budget.ts`, `lib/viz/tokens/level.ts`, `lib/bundle/codec.ts`, `lib/bundle/schema.ts`, `app/regions/Instrument.tsx`, `components/viz/Gource.tsx`, `components/viz/Ribbon.tsx`, `components/viz/Overview.tsx`, `e2e/screenshot.css`, `.github/workflows/e2e.yml`, `.github/CODEOWNERS`, `package.json`, `.nvmrc`, `docs/research/2026-07-31-ci-testing.md`, `docs/research/2026-07-31-viz-runtime.md`, `docs/research/2026-07-31-decomposition-synthesis.md`
- Writes: `playwright.config.ts`, `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, `.github/workflows/snapshots.yml`
- Contracts: `playwright.config.ts#snapshotPathTemplate`, `playwright.config.ts#expect.toHaveScreenshot`, `e2e/__screenshots__/desktop-2x/canvas.spec.ts/**`, `commit-trailer:Snapshot-Container`, `slash-command:/update-snapshots`, `env:KW_IN_CONTAINER`, `secret:SNAPSHOT_PUSH_TOKEN`
- Safety: `visual-baseline-provenance:e2e/__screenshots__`, `container-pin:mcr.microsoft.com/playwright`, `write-credential:snapshots-workflow`

## Sibling boundaries and open gates

**Open gate.** GATE-002 (HG-2) blocks pickup. The push credential's scopes are `admin:public_key, gist, read:org, repo` (GT-10) with no `workflow`, and GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`. Confirm with `gh auth status` before writing a line; the failure lands after the work is complete. GATE-002 also blocks KW-001, KW-023 and KW-028, so the Executor closes it once for all four.

**Open operator precondition, not a declared gate.** `SNAPSHOT_PUSH_TOKEN` — a fine-grained PAT with `contents: write` on `its-everdred/kevinweaver-dev` only — is required by the `update` job. It is not HG-1..HG-7 and does not block merge: the twelve baselines, the container guard and the `guard` job all work without it. Escalate it to the Executor (`GITHUB_TOKEN` pushes do not re-run workflows) rather than working around it.

**KW-023 owns** `playwright.config.ts` as a file, `e2e/smoke.spec.ts`, `e2e/screenshot.css` and `.github/workflows/e2e.yml`. This ticket makes the one edit KW-023 reserves and nothing else: the project inventory, `retries: 0`, `webServer`, `use` defaults and the `e2e-ok` aggregator are off limits. If `e2e/screenshot.css` needs a new selector — KW-026's freshness pill, a deliberate omission there — propose it against KW-023.

**KW-024 owns** `lib/viz/driver.ts` and `lib/viz/testHarness.ts`. This ticket consumes `window.__viz`, `VizFrameInfo`, `DWELL_TICKS` and nothing else, and never imports the driver into browser code. If a frame is not reproducible, the fix is in KW-024's files.

**KW-025 owns** `app/regions/Instrument.tsx` and `components/viz/**`, including all canvas markup, `role`, `aria-label` and DPR sizing — asserted against here, never modified. The DPR *clamp* at dpr 3 is KW-025's own browser-mode test; this ticket asserts the backing-store arithmetic at dpr 2.

**KW-022 owns** `lib/viz/render/**`, including `CAPS`, `FrameReport` and `assertFrameBudget`. `CAPS.maxDrawCalls` is imported, never inlined, so a deliberate budget change propagates into this gate.

**KW-002 owns** `.github/CODEOWNERS` and `.github/rulesets/main.json`. The `/e2e/__screenshots__/` entry already exists there; this ticket relies on it, must not duplicate, narrow or widen it, and must not promote any context to required.

**Wave-6 siblings.** KW-029 owns `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx` and `lib/viz/tokens/contrast.test.ts`; KW-030 owns `e2e/lazy-island.spec.ts`, `.size-limit.json` and `scripts/ci/check-first-load.mjs`. No file is shared, and all three consume the same `e2e-ok` context and project names. None may rename a project, weaken `retries: 0`, raise a comparison tolerance, or add a `merge_group` trigger. If KW-029 or KW-030 later add a screenshot assertion, the baseline budget here is the shared limit and raising it is a change to this file, negotiated here.

**KW-028 owns** `.github/workflows/data-bundle.yml` and the daily regeneration that makes the live payload unusable as a test input. The two workflows never interact; if a baseline changes because the data changed, the fixture interception has been removed and that is the defect.

**KW-032 owns** the capstone verification and depends on this ticket, consuming only the green `e2e-ok` context and the existence of the baselines — no symbol, no file.
