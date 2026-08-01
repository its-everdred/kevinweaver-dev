# KW-031 — Visual regression baselines and determinism canary

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Three new files plus one surgical edit to a config another ticket owns, and every hard part is a measured no-op waiting to happen: the `--update-snapshots` guard, the snapshot path template, the pixel tolerance and the baseline-provenance check each have an obvious form that enforces nothing. The volume is small; the failure mode is a gate that reports green while asserting nothing.

**Risk:** Medium-high for the fleet, none for the product. This ticket ships no user-facing code and cannot break the deployed site. Three fleet-level hazards, all measured rather than assumed: Playwright's default comparison tolerance passes a full beam recolour (920 of a 1408.6 budget — see Contract), so a suite written to the defaults is decorative; a baseline written outside the pinned container makes every later run red for a reason nobody can reproduce; and a regeneration workflow that pushes with `GITHUB_TOKEN` leaves the pull request stuck on a stale red check forever, because `GITHUB_TOKEN`-triggered events do not start workflow runs. It is also the third file in the repository under `.github/workflows/**`, so it fails at *push* time — after all the work is done — until GATE-002 is closed.

**Phase hint:** 6

**Depends on:** KW-023, KW-024, KW-025

**Serializes with:** none

**Requirements:** REQ-008, REQ-010

**Decisions:** DEC-003, DEC-005, DEC-008, DEC-010, DEC-012, DEC-016

**Gates:** GATE-002

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`e2e/canvas.spec.ts` seeks the visualization to four fixed ticks through `window.__viz`, asserts the whole `VizFrameInfo` struct at each one — tick identity, calendar date, live repository set, highlight cell, RNG state and draw-call budget — and only then compares twelve pixel baselines that exactly one machine in the world is allowed to produce. A double-render canary proves two renders at the same tick are byte-identical before any baseline is trusted, `playwright.config.ts` refuses to write a baseline outside `mcr.microsoft.com/playwright:v1.62.1-noble` for every documented spelling of the update flag, and `.github/workflows/snapshots.yml` both regenerates baselines on an owner's `/update-snapshots` comment using a personal access token and fails any pull request that changes a baseline by any other route.

## Context and evidence

The visual gate is the last thing standing between an autonomous fleet and a site that renders wrongly while every check is green. KW-023 built the hermetic container job and deliberately shipped no screenshot; KW-024 built a driver whose entire design goal is that a frame is a pure function of `(SimInput, seed, tick)`; KW-025 mounted the three canvases. This ticket is the assertion that all three of those claims are true, expressed as bytes.

**C-23 — both container-enforcement mechanisms in the research are no-ops as written, and this ticket owns the half KW-023 could not.** The ci-testing track proposed `process.argv.includes('--update-snapshots')` as the guard that stops a baseline being authored outside the pinned image. Its verifier refuted that with a measured argv table: `-u` (the shorthand every developer types), `--update-snapshots=all` and `--update-snapshots=changed` all slip through. Re-confirmed here against the *installed* CLI definition rather than the docs, at `node_modules/playwright/lib/program.js:226`:

```
["-u, --update-snapshots [mode]",
 { description: 'Update snapshots with actual results. Running tests without the flag defaults to "missing"',
   choices: ["all", "changed", "missing", "none"], preset: "changed" }]
```

Three spellings, one shorthand, one optional `=mode` suffix, and a bare `-u` presets to `changed`. The corrected guard the synthesis mandates is therefore the only correct one:

```ts
process.argv.some(a => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='))
```

The verifier's belt-and-braces addition — *"a CI step that fails if `git diff --name-only origin/main...HEAD` touches `e2e/__screenshots__/**` in a PR whose commits were not authored by the `update-snapshots` workflow"* — is adopted, and it lives in this ticket's own workflow file rather than in KW-023's `e2e.yml`, because `.github/workflows/e2e.yml` is KW-023's exclusive write surface (DEC-005).

**C-22 — visual baselines must never come from a CDN-served preview.** This is the third of the three grounds the ci-testing verifier substituted for the track's false "new specs would not run" argument, and it is the only one of the three that is about *this* ticket rather than about KW-023's. It has one operative consequence here: nothing in `canvas.spec.ts` or `snapshots.yml` may set `BASE_URL`, subscribe to `repository_dispatch`, or read a Vercel deployment. Baselines are produced against a server this repository built, inside the pinned image, or they are not produced.

**C-24 / DEC-016 — the determinism this ticket measures rests on the RNG being a 32-bit integer field.** The ci-testing verifier found three defects that would each have made a screenshot suite flaky in ways no screenshot could explain: a closure RNG makes `step` impure, `structuredClone` throws on a function-valued state field, and `no-restricted-globals` without `{ checkGlobalObject: true }` misses `window.requestAnimationFrame`. All three are fixed upstream in KW-008 and KW-024. **The consequence for this ticket is that `VizFrameInfo.rngState` is one `number`, not the four-tuple the viz-runtime track sketched** — KW-024 states that supersession explicitly, and this document quotes the corrected shape.

**KW-024 resolved a contradiction inside the viz-runtime track specifically so this ticket could exist.** That track's §8.1 put `lastFrameMs` on `VizFrameInfo` while its §8.3 asserted `expect(b).toEqual(a)` on two `seekTick(3600)` results. Those cannot both hold: one is a wall-clock measurement. KW-024's resolution is that `VizFrameInfo` is deterministic by construction and carries no timing value, with timings moved to a separate `driver.perf()` accessor that tests never compare. This ticket depends on that resolution completely — its central assertion is `expect(b).toEqual(a)`.

**KW-024 invariant I-D4 constrains how every screenshot is taken.** `seekTick(t)` and `reset() + renderFrame(t)` are each deterministic but are *not* equal: `seekTick` produces the settled frame (`alpha = live ? 1 : 0`, `heat = live ? 0.32 : 0`, `beamHead = 0`, actors snapped), while free playback carries path-dependent transient motion by design. KW-024 states the rule for this ticket in one line: **KW-031 must take every screenshot through `seekTick`.** A baseline captured after `renderFrame` would be reproducible only by replaying the identical path and would flake the first time a frame budget shifted.

**DEC-008 forbids the obvious shortcut.** No contribution figure is a literal anywhere; every number reads from a `generatedAt`-stamped payload. That applies to test code as much as to copy. The spec therefore asserts *relations* — the tick it asked for is the tick it got, dates decrease monotonically into the past across the rewind, every live repository's era contains the cursor date, draw calls sit under an imported cap — and never a hardcoded date, day count or repository name.

**DEC-010 is what makes the live set assertable at all.** Lifespan-interval visibility with dimmed ghost outlines means `VizFrameInfo.liveRepos` at tick *t* is exactly the set whose `[from, to]` era contains the cursor date, and `ghostRepos` counts those whose era has ended. Under the rejected monotonic-accumulation alternative the live set would be a running union and the only assertable property would be that it never shrinks — a far weaker test.

**DEC-012 supplies the enforcement this ticket's own guard cannot.** KW-002 ships `.github/CODEOWNERS` with `/e2e/__screenshots__/    @its-everdred` and a ruleset carrying `require_code_owner_review: true`. A commit-message guard catches mistakes; code-owner review catches intent. Both ship, and the ticket is explicit about which does which.

**GATE-002 (HG-2) is open and blocks push, not work.** GT-10 measured the push credential's scopes as `admin:public_key, gist, read:org, repo` — no `workflow`. GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`, and the rejection lands after every file is written and every local check is green. Confirm with `gh auth status` before writing a line. This is the same gate that blocks KW-001, KW-023 and KW-028.

**One operator precondition is *not* in the gate register and must be escalated.** `.github/workflows/snapshots.yml` needs a repository secret `SNAPSHOT_PUSH_TOKEN` holding a fine-grained PAT with `contents: write` on this repository only. It is not HG-1..HG-7. KW-002's ticket states the rule that puts it here: *"`AUTOMERGE_TOKEN` and `SNAPSHOT_PUSH_TOKEN` belong to the workflow tickets that need them."* Its absence does not block this ticket's merge — the guard job and the twelve baselines are fully functional without it — it blocks only the regeneration path, and the workflow is written to fail immediately with an actionable message rather than to push with `GITHUB_TOKEN` and appear to work.

**Plan-context navigation** (repository-relative paths; all research paths resolve at `e664d73a195facd64db58ba10952170ff01b4772`, e.g. `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research`):

- Pack index and the KW-01..KW-32 → KW-001..KW-032 identity mapping: `docs/build-orders/site-rewrite/README.md`.
- Ticket manifest, surfaces and graph edges: `docs/build-orders/site-rewrite/build-order.json`.
- Wave diagram, verified topological levels, critical path, write-surface partition proof: `docs/research/2026-07-31-decomposition-synthesis.md` §6. This ticket is wave 6, ties KW-029 at weight 3, and is interchangeable with it as the penultimate critical-path node.
- Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007): `docs/research/2026-07-31-decomposition-synthesis.md` §3 and §4, mirrored into `build-order.json` `decisions[]` and `external_gates[]`.
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, "KW-31 — Visual regression baselines + determinism canary", plus `docs/research/2026-07-31-ci-testing.md` §3.5, §5.4, §5.5, §5.6, §5.7, §6 and §10.5, and its "Verification corrections" C4/C5; plus `docs/research/2026-07-31-viz-runtime.md` §8.
- Producer contracts quoted here: `docs/build-orders/site-rewrite/tickets/KW-023-playwright-containerized-e2e.md` (project inventory, environment contract), `KW-024-viz-driver-harness-reduced-motion.md` (`VizFrameInfo`, `VizTestHarness`, invariants I-D1..I-D9), `KW-025-region-instrument-pane.md` (canvas markup, DPR geometry), `KW-022-viz-render-modules.md` (`CAPS`, `FrameReport`), `KW-012-bundle-schema-codec-contract.md` (`encodeBundle`, wire shapes), `KW-015-client-bundle-loader.md` (the `/data/v1` URL prefix).
- Executor authority and the live gate register: `docs/build-orders/site-rewrite/authority-envelope.md`.

**REQ-008** — the system is a deterministic function of its inputs: the same inputs produce byte-identical output on every run. *Trace:* this ticket is the terminal proof of the client-runtime half. It does not implement determinism; it makes a violation of it fail a pull request, at the only layer where a violation is actually visible to a human — the pixels.

**REQ-010** — the browser gate is version-locked end to end and the interactive instrument stays inside its measured frame budget. *Trace:* two ways. The baseline bytes are bound to one container tag and one npm package by the guard and the path template, so a dependency bump cannot silently re-render what CI is looking at; and every asserted frame carries `drawCalls.total` compared against `CAPS.maxDrawCalls` imported from KW-022, so a renderer that starts spending frames faster fails before a human notices jank.

## Scope

- Edit `playwright.config.ts` — the single follow-up edit KW-023's document explicitly reserves for this ticket — adding the corrected `--update-snapshots` container guard, `snapshotPathTemplate` with no platform segment, and the `expect.toHaveScreenshot` comparison settings. Change nothing else in that file.
- Create `e2e/canvas.spec.ts`: a deterministic fixture payload built in memory and served by `page.route`, an inventory guard over the three mounted canvases, four seeked ticks each asserting the full `VizFrameInfo` struct before any pixel comparison, a per-canvas screenshot at each tick, a double-render determinism canary, a seek-idempotency check, and a device-pixel-ratio backing-store assertion.
- Commit exactly twelve baseline PNGs under `e2e/__screenshots__/desktop-2x/canvas.spec.ts/`, produced inside `mcr.microsoft.com/playwright:v1.62.1-noble` and nowhere else.
- Create `.github/workflows/snapshots.yml` with two independent jobs: a `guard` job on `pull_request` that fails any baseline change lacking the container provenance trailer, and an `update` job on `issue_comment` that regenerates baselines inside the pinned container and pushes them back to the pull-request branch with `SNAPSHOT_PUSH_TOKEN`.
- Assert the baseline population bound in the spec itself: at most twelve PNGs under `e2e/__screenshots__/**`, and no Git LFS pointer or `.gitattributes` filter covering them.
- Prove the guard fires for every documented spelling of the update flag, and prove that a `GITHUB_TOKEN` push does not re-run `e2e` while a PAT push does — recording both observations in the pull-request body.

## Non-goals

- No accessibility assertion, no `@axe-core/playwright`, no `e2e/a11y.spec.ts`, no contrast unit test. KW-029 owns all of it, including the `reduced-motion` project.
- No bundle-size assertion, no `.size-limit.json`, no `scripts/ci/check-first-load.mjs`, no `e2e/lazy-island.spec.ts`, no Lighthouse CI. KW-030 owns those, including the "no gource chunk before scroll-into-view" proof.
- No edit to `.github/workflows/e2e.yml` or `.github/workflows/ci.yml`, and no change to the `e2e-ok` or `ci-ok` aggregators. The provenance guard lives in this ticket's own workflow.
- No promotion of any status context to required. `.github/rulesets/main.json` is KW-002's file and today requires exactly `ci-ok`. Promoting `e2e-ok` or a snapshot context is a governance change coordinated by the Executor.
- No edit to `package.json` or `package-lock.json` — frozen by DEC-003. In particular **do not add a `test:e2e:update` npm script**; KW-001's frozen script list is `dev build start lint format typecheck typegen test:unit test:e2e data:build size` and does not contain it. The local escape hatch is the raw `docker run` command written out below.
- No renaming, reordering, adding or removing of Playwright projects, and no weakening of `retries: 0`, `timezoneId: 'UTC'`, `locale: 'en-US'`, `colorScheme: 'dark'` or `forbidOnly`. KW-023 owns the project inventory and four gate tickets select projects by name.
- No application code. No `data-testid`, no element `id`, no `aria-*` attribute added to any canvas. If a stable selector is missing, that is a KW-025 defect to report, not a file to edit.
- No new file under `e2e/` other than `canvas.spec.ts` and the `__screenshots__` tree. The fixture payload is built in memory by the spec; it does not land on disk.
- No `merge_group:` trigger, no `repository_dispatch:` trigger, no `pull_request_target:` trigger, and no `BASE_URL` anywhere in this ticket's files.
- No baseline for any project other than `desktop-2x`, and no baseline captured from a Vercel preview.

## Existing owner and reuse target

`playwright.config.ts` **exists and is owned by KW-023**, which shipped it with a reserved comment block naming this ticket as the only legal author of the three additions below. Extend that file; do not create a second config, and do not move the existing keys around. Everything else in this ticket is new: `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772 -- .github e2e playwright.config.ts` returns nothing at the researched commit.

| Target | Status |
|---|---|
| `playwright.config.ts` | **Created by KW-023.** Carries a comment block reserving `snapshotPathTemplate`, the `toHaveScreenshot` tuning and the `-u` guard for this ticket. Replace the comment with the code. |
| Projects `desktop-2x`, `desktop-1x`, `mobile-1x`, `smoke`, `reduced-motion` | **Created by KW-023.** `desktop-2x` is already declared `testMatch: /canvas\.spec\.ts/` with `deviceScaleFactor: 2`, and the other four already exclude `canvas.spec.ts`. This spec therefore runs in exactly one project with no config change. |
| `e2e/screenshot.css` and `expect.toHaveScreenshot.stylePath` | **Created by KW-023**, deliberately inert until this ticket takes the first baseline. It neutralises the six unguarded infinite animations in the vendored design system and hides `.tmux .seg.clock`. Do not edit it; if a new time-dependent selector is needed, report it to KW-023's owner. |
| `.github/workflows/e2e.yml`, the `pin` job, the `e2e-ok` context | **Created by KW-023.** Read-only here. The two shards already run `npx playwright test`, which picks up `canvas.spec.ts` with no workflow change. |
| `mcr.microsoft.com/playwright:v1.62.1-noble` | **Exists.** `curl -s https://mcr.microsoft.com/v2/playwright/tags/list` returns twelve `v1.62.1*` tags, `v1.62.1-noble` among them. Re-measured during authoring. |
| `@playwright/test@1.62.1` | **Exists**, installed by KW-001 under DEC-003. `npm view @playwright/test version` → `1.62.1`, current `latest`. |
| `window.__viz` / `VizTestHarness` / `VizFrameInfo` | **Created by KW-024** in `lib/viz/testHarness.ts` and `lib/viz/driver.ts`, gated on `?viz-test=1`. KW-024's document names this ticket as the consumer and quotes the Playwright call sequence verbatim. |
| `DWELL_TICKS`, `tickMapping`, `cursorDayAtTick`, `formatDayISO` | **Created by KW-024**, exported from `lib/viz/driver.ts`. `DWELL_TICKS` is imported by the spec so the chosen ticks carry no magic number. |
| `CAPS`, `FrameReport`, `assertFrameBudget` | **Created by KW-022** in `lib/viz/render/budget.ts`. `CAPS.maxDrawCalls` is `3000`. KW-022's document says `assertFrameBudget` is *"Used by KW-024's harness and KW-031's e2e"* — **this ticket imports `CAPS` only.** `assertFrameBudget` takes a `FrameReport`, and the harness surfaces `drawCalls` as a plain count object on `VizFrameInfo` rather than a `FrameReport`, so the e2e assertion is `info.drawCalls.total <= CAPS.maxDrawCalls`. If KW-024 later widens `VizFrameInfo` to carry the sealed report, switch to `assertFrameBudget`; do not widen it from here. |
| `<section className="kw-instr">` | **Created by KW-005** as the instrument region stub, **rewritten by KW-025** with the three canvases inside it. This is the selector root. |
| Three canvases with `role="img"` and a payload-derived `aria-label` | **Created by KW-025** (its Invariant 7). DOM order is overview, ribbon, gource — the comp's order at `docs/design/kevinweaver.dev.dc.html:76`, `:83`, `:97`. |
| `encodeBundle`, `BundleInput`, `BundleMeta`, `RepoRecord`, `GridSeries`, `SortableEvent`, `chunkFileName`, `dictFileName` | **Created by KW-012** in `lib/bundle/{schema,codec}.ts`. Used by the spec to build the fixture payload with the real encoder. |
| `BAND_LOWER_BOUNDS` | **Created by KW-007** in `lib/viz/tokens/level.ts`, alongside `Level`, `BAND_LABELS`, `level(count)` and `bandLabel(level)`. It is the `GridSeries.bands` value KW-012's schema describes as "owned by KW-007". Import it relatively (`../lib/viz/tokens/level`); the `@/` alias resolves through `vite-tsconfig-paths`, which is a Vitest concern, not a Playwright one. |
| Client URL prefix `/data/v1` | **Created by KW-015** as `DEFAULT_BASE_URL`. KW-015's document is explicit that this is **not** `DATA_ROOT` (`public/data/v1`), which is a repository path and would 404 on every request. The `page.route` pattern must match the client URL. |
| `.github/CODEOWNERS` entry `/e2e/__screenshots__/` | **Created by KW-002.** Read-only here. It is the enforcement half of the baseline-provenance story. |
| `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/github-script@v9.0.0` | **Exist.** `gh api repos/<action>/releases/latest` → `v7.0.1` (2026-07-20), `v7.0.0` (2026-07-14), `v9.0.0` (2026-04-09). |
| `SNAPSHOT_PUSH_TOKEN` | **Does not exist.** Operator precondition, not a declared gate. See "Sibling boundaries and open gates". |

## Contract and invariants

### The comparison settings, and why every value in the research is wrong

This is the load-bearing decision of the ticket, and it was re-derived from the installed package rather than from documentation. Three measurements, all reproducible at `node_modules/playwright-core/lib/coreBundle.js`:

```js
// coreBundle.js:7551 — the default per-pixel tolerance
count = pixelmatch(expected.data, actual.data, diff.data, w, h, { threshold: options.threshold ?? 0.2 });

// coreBundle.js:6659 — pixelmatch squares it
const maxDelta = 35215 * options.threshold * options.threshold;

// coreBundle.js:7562 — the default pixel-count budget is ALREADY zero
maxDiffPixels = maxDiffPixels1 ?? maxDiffPixels2 ?? 0;
```

So the tolerance is `35215 × threshold²` of squared YIQ distance per pixel, and *any* pixel exceeding it fails unless `maxDiffPixels` or `maxDiffPixelRatio` was raised. Computing the squared YIQ distance for the palette this site actually paints:

| Change | Pair | Squared YIQ delta | Caught at `threshold: 0.2` (budget 1408.6) | at `0.15` (792.3) | at `0` |
|---|---|---|---|---|---|
| A gource beam turns from aqua to green | `#8ec07c` → `#b8bb26` | 920.0 | **no** | yes | yes |
| The DEC-009 ramp slips one level, L6 → L7 | `#98971a` → `#b8bb26` | 541.3 | **no** | **no** | yes |
| The ramp slips one level, L5 → L6 | `#83881b` → `#98971a` | 138.6 | **no** | **no** | yes |
| The ramp slips one level, L8 → L9 | `#d9d34a` → `#faeb77` | 442.2 | **no** | **no** | yes |
| The ramp slips one level, L0 → L1 | `#3c3836` → `#404a2b` | 84.1 | **no** | **no** | yes |
| Pane background swaps to page background | `#1d2021` → `#282828` | 40.3 | **no** | **no** | yes |
| Muted text swaps to body text | `#928374` → `#a89984` | 231.3 | **no** | **no** | yes |

Three conclusions, and every one of them contradicts something in the research:

1. **The Playwright defaults are decorative for this design system.** A whole canvas of beams recoloured from aqua to green passes at `threshold: 0.2`. Every gruvbox pair in the palette is inside 3% of the maximum YIQ distance, because the palette is *deliberately* low-contrast.
2. **The ci-testing track's `threshold: 0.15` is a real improvement that still does not work.** It catches the one pair the track cited (920 > 792.3) and misses every adjacent contribution-ramp level. An entire grid rendered one ramp stop off would ship green.
3. **The ci-testing track's `maxDiffPixelRatio: 0.002` is a regression, not a tightening.** The default budget is already `0`; adding a ratio of 0.002 *raises* it to 2,048 pixels of a 1280×800 frame. Do not copy it. The synthesis's `maxDiffPixels: 0` is correct and is also, measurably, the default — it is written explicitly here as documentation of intent, not as a change.

The only setting that catches every meaningful regression is `threshold: 0`, i.e. exact pixel equality. That is safe here for a reason that is also measured: pixelmatch classifies anti-aliased pixels separately and, with `includeAA` left at its default, **excludes them from the count** (`coreBundle.js:6665`: `if (!options.includeAA && (antialiased(img1, ...) || antialiased(img2, ...)))` paints them in `aaColor` and does not increment the counter). Edge jitter on circles and glyphs is therefore forgiven by the comparator itself, so nothing is left for a manual tolerance to absorb. The double-render canary below is what licenses this: it proves bit-identity inside the container before any baseline is trusted, and if it ever fails, no tolerance value would have saved the suite anyway.

```ts
// The comparison contract. Quoted verbatim by nothing; owned solely here.
expect: {
  toHaveScreenshot: {
    threshold: 0,        // exact. 35215 * 0^2 = 0, so any non-AA differing pixel counts.
    maxDiffPixels: 0,    // the default; stated so a future edit has to argue with it.
    animations: 'disabled',
    caret: 'hide',
    scale: 'css',
    stylePath: './e2e/screenshot.css',   // KW-023 owns the file; this key already exists
  },
}
```

Leave `maxDiffPixelRatio` unset. Setting both makes Playwright take `Math.min` of the two (`coreBundle.js:7560`), which is harmless but invites a later edit to raise the wrong one.

### The snapshot path, and the platform segment that is not where the research says

The synthesis requires `snapshotPathTemplate` "without a platform segment". Measured at the installed version, the default screenshot template is:

```
// node_modules/playwright/lib/worker/workerProcessEntry.js:1254
'{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}'
```

There is no `{platform}` token in it. The platform arrives through `{-snapshotSuffix}`, because the auto-installed context fixture sets it (`node_modules/playwright/lib/index.js:345`: `testInfo.snapshotSuffix = process.platform`). A default-configured baseline for this spec would land at `e2e/canvas.spec.ts-snapshots/gource-t0-desktop-2x-linux.png` — partitioned by platform, which is a coping mechanism for multi-platform teams and is exactly wrong when there is precisely one legal producer. The override:

```ts
snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
```

produces `e2e/__screenshots__/desktop-2x/canvas.spec.ts/gource-t0.png`. The path now asserts "these bytes are container bytes", and a baseline rendered on Arch has nowhere else to go — it collides with the container's file and the diff is loud.

**Do not also set `expect.toHaveScreenshot.pathTemplate`.** At 1.62.1 it takes precedence over `snapshotPathTemplate` (`workerProcessEntry.js:1257`), so setting both silently makes one of them dead config.

### The baseline inventory

Exactly twelve PNGs, all in one project, all under one directory:

```
e2e/__screenshots__/desktop-2x/canvas.spec.ts/
  overview-t0.png  ribbon-t0.png  gource-t0.png
  overview-t1.png  ribbon-t1.png  gource-t1.png
  overview-t2.png  ribbon-t2.png  gource-t2.png
  overview-t3.png  ribbon-t3.png  gource-t3.png
```

Four ticks × three canvases. The tick labels are indices, not values, so a change to `DWELL_TICKS` upstream does not rename twelve files — it invalidates their contents, which is what a regeneration is for. The four ticks are derived, never literal:

```ts
import { DWELL_TICKS } from '../lib/viz/driver'   // 504 at FIXED_DT = 1/120 (KW-024)

const TICKS = [
  0,                     // t0: mid-dwell. I-D5 seed set: exactly the entities alive today.
  DWELL_TICKS,           // t1: the last dwell tick. cursorDayAtTick returns day0 for p <= DWELL_TICKS,
                         //     so this is the closed form's boundary condition.
  DWELL_TICKS + 3600,    // t2: 30 s into the rewind at 120 Hz.
  DWELL_TICKS + 12000,   // t3: 100 s in.
] as const
```

Invariant: **the population is bounded and asserted.** A test counts the files under `e2e/__screenshots__/**` and fails above twelve. The bound exists because the alternative to a bound is Git LFS, and the ci-testing track's §6 conclusion — no LFS on a portfolio site — is adopted. A 1280×800 gruvbox canvas PNG compresses well; twelve of them is a few hundred kilobytes, not a repository problem.

### The consumed harness contract, quoted verbatim from KW-024

This ticket is a pure consumer of `window.__viz`. The shapes below are KW-024's, copied without paraphrase; if the real exports differ at pickup, that is a KW-024 defect to report, not a shape to adapt to silently.

```ts
// lib/viz/testHarness.ts — KW-024 owns this
export interface VizTestHarness {
  pause(): Promise<void>;
  play(): void;
  reset(seed?: number): void;
  renderFrame(n?: number): Promise<VizFrameInfo>;
  seekTick(t: number): Promise<VizFrameInfo>;
  seekDate(iso: string): Promise<VizFrameInfo>;
  inspect(): VizFrameInfo;
  setQuality(q: 'high' | 'low' | 'auto'): void;
}
declare global { interface Window { __viz?: VizTestHarness } }

// lib/viz/driver.ts — KW-024 owns this. DETERMINISTIC BY CONSTRUCTION:
// no wall-clock value may ever be added to it. Timings live on driver.perf().
export interface VizFrameInfo {
  readonly tick: number;
  readonly cursorDay: number;
  readonly cursorDayInt: number;
  readonly date: string;                  // 'YYYY-MM-DD', derived from windowStartISO
  readonly speedIndex: number;
  readonly playing: boolean;
  readonly reducedMotion: boolean;
  readonly settled: boolean;              // true iff the frame came from seekTick()
  readonly nLive: number;
  readonly liveRepos: readonly string[];  // ascending repo id, mapped through repoNames
  readonly ghostRepos: number;
  readonly liveHash: number;
  readonly rngState: number;              // ONE 32-bit int (DEC-016), not a 4-tuple
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
```

Three consumption rules, all from KW-024's invariants:

- **I-D4 — every screenshot is taken through `seekTick`.** Assert `info.settled === true` on every frame before comparing pixels; a `false` here means the baseline was captured from free playback and is not reproducible.
- **I-D3 — `seekTick(t)` twice is `toEqual`-identical.** This is the semantic half of the determinism canary.
- **I-D6 — the harness await path contains no timers.** Commands resolve through microtasks and a synchronous `ctx.getImageData(0, 0, 1, 1)` flush on each attached canvas, so they do not deadlock under `page.clock.pauseAt`. **The application's own mount path does use `requestIdleCallback` and `IntersectionObserver` (KW-025), and those do not resolve under a paused clock** — see the pickup trap in the implementation notes.

### The canvas selector contract

KW-025 ships three canvases inside `<section class="kw-instr">`, each with `role="img"` and a payload-derived `aria-label`, and no `id` or `data-testid`. The spec therefore resolves them structurally, in the comp's DOM order:

```ts
const SURFACES = ['overview', 'ribbon', 'gource'] as const
type SurfaceId = (typeof SURFACES)[number]

/** Structural resolver. `section.kw-instr` is KW-005's; the three canvases are KW-025's.
 *  DOM order is fixed by the comp: overview (comp:76), ribbon (comp:83), gource (comp:97). */
function surface(page: Page, id: SurfaceId) {
  return page.locator('section.kw-instr canvas').nth(SURFACES.indexOf(id))
}
```

**Known unpinned assumption, stated so it fails loudly rather than silently.** No upstream ticket contractually pins the *order* of the three canvases in the DOM. It is derived from the comp — overview at `docs/design/kevinweaver.dev.dc.html:76`, ribbon at `:83`, gource at `:97`, which resolve at the researched commit — and from KW-025's structure, which keeps the contributions pane above `.kw-lower`. If KW-025 ever reorders them, the twelve baselines swap identities and the failure is three simultaneous pixel diffs with no obvious cause. The inventory test therefore also asserts a *shape* discriminator that is independent of order: the overview canvas is the shortest of the three and the gource canvas is the tallest, checked from `getBoundingClientRect()`. A mismatch there fails with "canvas order changed — KW-025 reordered the instrument panes; regenerate baselines" rather than with a pixel diff.

Invariant: an inventory test runs first and fails with an actionable message naming KW-025 if the count is not exactly three or if any of the three lacks `role="img"` or has an empty accessible name. **Do not add a selector hook to KW-025's files to make this easier.** If KW-025 later ships a stable attribute, prefer it — but that is a KW-025 change, proposed there, not made here.

Note the naming divergence to expect at pickup: KW-024 calls the graph canvas `graph` (`VizCanvasId = 'graph' | 'ribbon' | 'overview'`) while KW-025 calls it `gource` (`VizSurfaceId = 'overview' | 'ribbon' | 'gource'`). Both documents flag it. It does not affect this ticket, which never names a surface to the driver — it only reads `drawCalls.total`, which both spellings agree on. Use `gource` in file names, matching the comp's pane title.

### The fixture payload contract, and why the live bundle cannot be used

`public/data/v1/**` is regenerated and committed **daily** by KW-028's scheduled workflow, which always commits at minimum a `generatedAt` bump (DEC-017). Every baseline that renders from it would therefore be invalidated every day, and the freshness pill DEC-014 requires would change text every hour. The visual suite must render from a payload frozen inside the test.

The fixture is built in memory with KW-012's real encoder and served by `page.route`, so no fixture file lands on disk and the encoder itself is exercised:

```ts
import { encodeBundle } from '../lib/bundle/codec'
import type { BundleInput } from '../lib/bundle/codec'

// One worked shape. Small on purpose: the suite is testing determinism and geometry,
// not scale. KW-022's __gate__ test owns the 13,453-entity scale case.
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
  events: EVENTS,                                // ~400 SortableEvent, generated, then sorted
                                                 // canonically by encodeBundle
}

const encoded = encodeBundle(FIXTURE)            // -> { files: Map<'manifest.json'|..., string>, ... }
```

The route handler maps the client URL prefix onto those keys. **The prefix is `/data/v1`, not `DATA_ROOT`** — KW-015 calls this "the single most likely mistake":

```ts
await page.route('**/data/v1/**', async (route) => {
  const key = new URL(route.request().url()).pathname.replace(/^\/data\/v1\//, '')
  const body = encoded.files.get(key)
  if (body === undefined) return route.fulfill({ status: 404, body: '' })
  return route.fulfill({ status: 200, contentType: 'application/json', body })
})
```

Invariants on the fixture:

- **Every series is produced by a pure integer generator seeded in the spec** — no `Math.random`, no `Date.now`, no array literal of 731 numbers. A one-line generator such as `(i) => (i * 37 + 11) % 23` is sufficient and is trivially reproducible by a reviewer.
- **No band value, no ramp colour and no contribution total is written by hand.** `BAND_LOWER_BOUNDS` is imported from KW-007's `lib/viz/tokens/level.ts`, so a band or ramp change invalidates the baselines through the same path a production change would. KW-007's `ramp.ts` exports `LV`, `AG` and `PANE_SURFACE`; none of those are imported here, because the ramp reaches the pixels through the render modules, not through the fixture.
- **The fixture's `windowEnd` matches the faked clock's date.** Otherwise the freshness pill computes a nonzero age that drifts with the wall clock even under a fixed `generatedAt`.

### The baseline-provenance contract

Two mechanisms, and the ticket is explicit about which is enforcement and which is hygiene.

```
Hygiene   : every commit touching e2e/__screenshots__/** must carry the trailer
              Snapshot-Container: mcr.microsoft.com/playwright:v1.62.1-noble
            checked by the `guard` job of .github/workflows/snapshots.yml.
            Defeatable by anyone who types the trailer. Catches mistakes.

Enforcement: .github/CODEOWNERS  ->  /e2e/__screenshots__/  @its-everdred
            plus require_code_owner_review: true on the main ruleset (KW-002, DEC-012).
            Not defeatable from inside a pull request. Catches intent.
```

The `update` job writes the trailer; a human or an agent regenerating baselines by any other route does not, and the guard says so with a message naming the correct procedure.

## Refreshable implementation notes

Verify all of the following against `origin/main` at pickup; the base will have moved a long way past `e664d73a195facd64db58ba10952170ff01b4772`.

### Pre-flight — sixty seconds, saves an afternoon

```bash
gh auth status                                        # GATE-002: 'workflow' MUST be in the scope list
test -f playwright.config.ts && grep -n 'KW-031' playwright.config.ts   # KW-023's reserved block
node -p "require('./package.json').devDependencies['@playwright/test']" # expect 1.62.1
grep -n 'desktop-2x' playwright.config.ts             # the project must already exist
ls lib/viz/testHarness.ts lib/viz/driver.ts lib/viz/render/budget.ts lib/bundle/codec.ts
grep -n 'e2e/__screenshots__' .github/CODEOWNERS      # KW-002's enforcement half
gh secret list | grep SNAPSHOT_PUSH_TOKEN || echo 'ABSENT — regeneration path is blocked'
```

If `workflow` is absent from the scope list, **stop and escalate GATE-002 before writing anything.** The push is rejected after the work is complete.

### The pickup trap that will cost you a turn if you skip it

`page.clock.install()` fakes `setTimeout`, `setInterval`, `requestAnimationFrame`, `requestIdleCallback`, `Date` and `performance`, and after `install` the clock is **paused** — the injected controller only starts tracking wall time once `resume()` is called, which is why `resume`, `runFor` and `fastForward` exist as separate methods at all (`playwright-core/lib/coreBundle.js`, `packages/injected/src/clock.ts` → `_syncRealTime` is a no-op until `_realTime` is set). KW-025 mounts the gource island behind `next/dynamic({ ssr: false })` + `IntersectionObserver` and defers first attachment to `requestIdleCallback`. The `requestIdleCallback` half is faked and will never fire on a paused clock, so this sequence hangs forever:

```ts
await page.clock.install({ time: EPOCH })
await page.goto('/?viz-test=1&seed=1')
await page.waitForFunction(() => Boolean(window.__viz))   // never resolves: rIC never fires
```

Advance the virtual clock once, after navigation, to flush the mount path. After that, KW-024's I-D6 guarantees no harness command needs the clock again:

```ts
await page.clock.install({ time: EPOCH })
await page.goto('/?viz-test=1&seed=1')
await page.clock.runFor(2_000)                            // flush rIC + IntersectionObserver
await page.waitForFunction(() => Boolean(window.__viz))
await page.evaluate(() => document.fonts.ready)           // never render text in a fallback
```

Use `runFor`, never `fastForward`: `fastForward` fires each due timer at most once and therefore drops rAF frames. This suite does not rely on rAF — the harness is paused — but the habit matters and KW-023's smoke spec already proves `runFor` behaves in this environment.

`IntersectionObserver` is not a timer and is delivered by the rendering pipeline rather than by the faked clock, so `runFor` is not what unblocks it; `waitForFunction` is. Keep both. If `window.__viz` still never appears, the island did not come into view at 1280×800 — scroll the instrument section into view with `await surface(page, 'gource').scrollIntoViewIfNeeded()` **before** waiting, and record it, because it also means KW-030's lazy-island assertion has a different shape than it assumed.

### File 1 — `playwright.config.ts` (edit; KW-023 owns the file)

Replace KW-023's reserved comment block at the top with the guard, and fill in the two keys it reserved. Nothing else in the file changes.

```ts
import { defineConfig, devices } from '@playwright/test'

// C-23 / ci-testing verifier C4b. `process.argv.includes('--update-snapshots')` is a
// no-op for three of the four documented spellings. Measured against the installed CLI
// definition, node_modules/playwright/lib/program.js:226 —
//   ["-u, --update-snapshots [mode]", { choices: ["all","changed","missing","none"],
//                                       preset: "changed" }]
// so `-u`, `--update-snapshots=all` and `--update-snapshots=changed` must all be caught.
const UPDATING = process.argv.some(
  (a) => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='),
)

if (UPDATING && process.env.KW_IN_CONTAINER !== '1') {
  throw new Error(
    'Refusing to write screenshots outside the pinned container.\n' +
      'Baselines are produced by exactly one image: mcr.microsoft.com/playwright:v1.62.1-noble.\n' +
      'Run:\n' +
      '  docker run --rm --ipc=host -v "$PWD":/w -w /w -e KW_IN_CONTAINER=1 \\\n' +
      '    mcr.microsoft.com/playwright:v1.62.1-noble \\\n' +
      '    sh -c "npm ci --no-audit --no-fund && npm run build && npx playwright test --project=desktop-2x -u"\n' +
      'or comment /update-snapshots on the pull request.',
  )
}

export default defineConfig({
  testDir: './e2e',

  // KW-031. No OS/arch segment: there is exactly one legal producer of these bytes.
  // The 1.62.1 default is
  //   '{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}{-projectName}{-snapshotSuffix}{ext}'
  // (worker/workerProcessEntry.js:1254) and index.js:345 sets snapshotSuffix = process.platform,
  // so the default DOES partition by platform — through the suffix, not through {platform}.
  // Do NOT also set expect.toHaveScreenshot.pathTemplate: it wins over this key (1257).
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',

  // ... every other key exactly as KW-023 left it: fullyParallel, forbidOnly, retries: 0,
  //     workers, reporter, webServer, use, projects. Do not reorder or reformat them.

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // KW-031. Measured: coreBundle.js:6659 maxDelta = 35215 * threshold^2, and the whole
      // gruvbox palette lives inside 3% of max YIQ distance — an adjacent DEC-009 ramp level
      // scores 84-541, so anything above ~0.05 is blind to a one-stop ramp slip and 0.2 is
      // blind to a full aqua->green beam recolour (920 < 1408.6). pixelmatch already excludes
      // anti-aliased pixels from the count (6665), so exact equality is not flaky.
      threshold: 0,
      // Already the default (coreBundle.js:7562). Stated so a future edit has to argue with it.
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

Structure, in order. Every test runs only in `desktop-2x`, which KW-023 already scoped to this file.

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
const SURFACES = ['overview', 'ribbon', 'gource'] as const
type SurfaceId = (typeof SURFACES)[number]
const TICKS = [0, DWELL_TICKS, DWELL_TICKS + 3600, DWELL_TICKS + 12000] as const
const SNAPSHOT_DIR = join(__dirname, '__screenshots__')
const MAX_BASELINES = 12

const FIXTURE: BundleInput = /* the worked shape in Contract and invariants */ null as never
const ENCODED = encodeBundle(FIXTURE)

function surface(page: Page, id: SurfaceId) {
  return page.locator('section.kw-instr canvas').nth(SURFACES.indexOf(id))
}

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

1. **`canvas inventory`** — `expect(page.locator('section.kw-instr canvas')).toHaveCount(3)`; for each of the three, `getAttribute('role') === 'img'` and a non-empty `aria-label`; and the order discriminator, `overview.height < ribbon.height < gource.height` from `boundingBox()`. On failure the message must name KW-025 and say "three canvases with role=img are KW-025's Invariant 7; do not add hooks here."
2. **`frame semantics at each tick`** — a loop over `TICKS`. For each, `const info = await page.evaluate((t) => window.__viz!.seekTick(t), t)` then assert, before any pixel comparison:
   - `info.tick === t` and `info.settled === true` (I-D4);
   - `info.date` matches `/^\d{4}-\d{2}-\d{2}$/` and lies inside `[FIXTURE.meta.windowStart, FIXTURE.meta.windowEnd]`;
   - `Number.isInteger(info.rngState)` and `info.rngState >>> 0 === info.rngState` (DEC-016: one 32-bit int, not a tuple);
   - `info.liveRepos` is strictly ascending and every entry's `[from, to]` era contains `info.date` (DEC-010 lifespan semantics), and `info.ghostRepos` counts the repos whose `to` is before `info.date`;
   - `info.highlightCell` is either `null` or `{week: 0..52, weekday: 0..6}`;
   - `info.drawCalls.total <= CAPS.maxDrawCalls` and equals `graph + ribbon + overview`;
   - `info.qualityTier === 0` (the `setQuality('high')` pin, so degradation can never move a baseline).
3. **`dates walk backwards across the rewind`** — the dates at `TICKS[1..3]` are non-increasing and `TICKS[2] > TICKS[1]` produces a strictly earlier date. This is the reverse-playback product requirement expressed as a test with no literal in it.
4. **`baselines`** — for each tick index `i` and each surface `s`, `await expect(surface(page, s)).toHaveScreenshot(\`${s}-t${i}.png\`)`. Runs after (2) in the same test so the semantic assertion is the first thing to fail.
5. **`seek idempotency`** — `seekTick(TICKS[2])` twice; `expect(b).toEqual(a)` (I-D3). Also seek to `TICKS[0]` in between, to prove path independence rather than caching.
6. **`double-render determinism canary`** — two raw `screenshot()` buffers of the gource canvas at the same tick, `expect(Buffer.compare(a, b)).toBe(0)`. This is the test that licenses `threshold: 0`; if it fails, no other visual result in the suite means anything, and the ticket says so in the failure message.
7. **`backing store honours devicePixelRatio`** — for each surface, read `{ w, h, cssW, cssH, dpr }` from the element and assert `w === Math.round(cssW * Math.min(2, dpr))` and the same for height. Note in a comment that `desktop-2x` runs at `deviceScaleFactor: 2`, so this asserts the *arithmetic* but not the *clamp*; the clamp at dpr 3 is asserted by KW-025's browser-mode Vitest test, and duplicating it here would require adding a project, which KW-023 owns.
8. **`baseline population is bounded and unLFS'd`** — walk `SNAPSHOT_DIR`, assert at most `MAX_BASELINES` files, every one a `.png`, every one starting with the PNG magic `89 50 4E 47` rather than `version https://git-lfs` , and assert no `.gitattributes` in the repository declares a filter over `e2e/__screenshots__`.

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
  # ---------------------------------------------------------------------------
  # Hygiene. Fails a PR whose baseline change did not come from the update job.
  # ---------------------------------------------------------------------------
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
          echo "baselines touched:"; echo "$touched"
          bad=0
          for sha in $(git rev-list "$base"..HEAD -- 'e2e/__screenshots__/**'); do
            if ! git show -s --format=%B "$sha" | grep -qF "$TRAILER"; then
              echo "::error::commit $sha changes a baseline without the container trailer."
              echo "::error::Regenerate by commenting /update-snapshots on this pull request."
              bad=1
            fi
          done
          [ "$bad" = 0 ]

  # ---------------------------------------------------------------------------
  # The agent's regeneration path. Owner comments /update-snapshots on the PR.
  # ---------------------------------------------------------------------------
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
            echo '::error::SNAPSHOT_PUSH_TOKEN is not configured.'
            echo '::error::A GITHUB_TOKEN push does NOT re-run e2e, so the PR would sit on a'
            echo '::error::stale red check forever. Mint a fine-grained PAT with contents:write'
            echo '::error::on this repository and store it as SNAPSHOT_PUSH_TOKEN.'
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

- **`issue_comment` workflows run the copy of the workflow on the default branch.** That is not a limitation here, it is the point: a pull request cannot rewrite the rules by which its own baselines are regenerated.
- **The author gate is `author_association == 'OWNER'` only.** The ci-testing track's draft also allowed `github.event.comment.user.login == 'its-applekid'`. That is refuted by the repository's own configuration: `.aiur/config` records, with the measurement inline, that `its-applekid` is **not** a collaborator (`GET /repos/its-everdred/kevinweaver-dev/collaborators/its-applekid` → 404) and that `bot_account` is `its-everdred`. A non-collaborator's comment must not be able to start a job that runs pull-request code with a write credential. If `its-applekid` is granted push access later, widen the condition then, in a change that says why.
- **`continue-on-error: true` on the test step, not `|| true` inside it.** The ci-testing draft wrote `npx playwright test --update-snapshots || true`, which also swallows a crash, a missing browser and a webServer timeout. `continue-on-error` keeps the step's own conclusion visible in the run summary while letting the commit step decide.
- **`--project=desktop-2x`.** Regenerating with no project filter would attempt to run `smoke`, `desktop-1x`, `mobile-1x` and `reduced-motion` under `-u` as well, which is slower and, if KW-029 or KW-030 later add a screenshot, would silently regenerate theirs too.

### Exact version pins used by this ticket

| Thing | Pin | How verified |
|---|---|---|
| Container | `mcr.microsoft.com/playwright:v1.62.1-noble` | MCR tag list returns twelve `v1.62.1*` tags including `-noble` |
| `@playwright/test` | `1.62.1` (installed by KW-001, DEC-003) | `npm view @playwright/test version` → `1.62.1`, current `latest` |
| `actions/checkout` | `v7.0.1` | `gh api repos/actions/checkout/releases/latest`, 2026-07-20 |
| `actions/setup-node` | `v7.0.0` | `gh api repos/actions/setup-node/releases/latest`, 2026-07-14 |
| `actions/github-script` | `v9.0.0` | `gh api repos/actions/github-script/releases/latest`, 2026-04-09 |
| Runner | `ubuntu-latest` (= Ubuntu 24.04 x64, matching `-noble`) | `actions/runner-images` README |

### While a dependency is unmerged

All three dependencies are hard, and each blocks a different half of the ticket.

- **KW-023 unmerged** — there is no `playwright.config.ts` to edit, no `desktop-2x` project and no `e2e/screenshot.css`. Nothing here is startable. Do not create the config; that surface belongs to KW-023 permanently.
- **KW-024 unmerged** — `window.__viz` does not exist and no frame can be seeked. `.github/workflows/snapshots.yml` and the `playwright.config.ts` edit are still fully writable and testable: `npx playwright test -u` must throw, and the `guard` job can be exercised on a scratch pull request. Land nothing that commits a baseline until the harness exists.
- **KW-025 unmerged** — `section.kw-instr` contains no canvas, so the inventory test fails by design. Same partial mode as above.

If `window.__viz` exists but `VizFrameInfo.drawCalls` is a `number` rather than `{graph, ribbon, overview, total}`, or `rngState` is a four-tuple, that is a KW-024 regression against its own published contract: report it against KW-024 and stop. Do not write an adapter — an adapter here would hide the exact drift this ticket exists to catch.

## Acceptance and verification

### Agent gate

- `npx playwright test --project=desktop-2x` is green locally against a container-built server, with zero skipped tests and zero retries consumed.
- The container guard throws for all four spellings and passes only inside the container: `npx playwright test -u`, `npx playwright test --update-snapshots`, `npx playwright test --update-snapshots=all` and `npx playwright test --update-snapshots=changed` each exit non-zero with `Refusing to write screenshots outside the pinned container`, and the same command inside `docker run ... -e KW_IN_CONTAINER=1 mcr.microsoft.com/playwright:v1.62.1-noble` proceeds.
- The double-render canary passes: two raw `screenshot()` buffers of the gource canvas at the same tick compare equal with `Buffer.compare(...) === 0`.
- Seek idempotency passes: `seekTick(t)`, then `seekTick(TICKS[0])`, then `seekTick(t)` again yields two `VizFrameInfo` values that are `toEqual`-identical, including `rngState`, `liveHash` and `drawCalls`.
- Every asserted frame reports `settled === true`, `qualityTier === 0`, `Number.isInteger(rngState)`, and `drawCalls.total <= CAPS.maxDrawCalls` with `total === graph + ribbon + overview`.
- The date sequence across the four ticks is non-increasing and strictly decreases at least once, with no calendar literal anywhere in the spec.
- `ls e2e/__screenshots__/desktop-2x/canvas.spec.ts/ | wc -l` is exactly `12`, every file is a real PNG (`file e2e/__screenshots__/**/*.png` reports `PNG image data`, not `ASCII text`), and `git check-attr filter -- e2e/__screenshots__/desktop-2x/canvas.spec.ts/gource-t0.png` reports `filter: unspecified`.
- Deleting one baseline and re-running fails with a missing-snapshot error rather than silently writing it, proving the suite never self-heals in CI.
- Corrupting one baseline by a single pixel and re-running fails, proving `threshold: 0` and `maxDiffPixels: 0` are live rather than overridden by a project-level `expect` block.
- `npm run typecheck` and `npm run lint` exit 0 with no new diagnostics.
- `git status --porcelain` shows one modified path (`playwright.config.ts`) and fourteen added paths (`e2e/canvas.spec.ts`, `.github/workflows/snapshots.yml`, twelve PNGs) — and no modification to `package.json`, `package-lock.json`, `.github/workflows/{ci,e2e}.yml`, `.github/rulesets/main.json`, `e2e/screenshot.css`, or anything under `app/`, `components/` or `lib/`.

### At-merge gate

- `ci-ok` (KW-001) and `e2e-ok` (KW-023) are both green on the exact pull-request head, with the twelve comparisons running inside the container job and no baseline regenerated during the run.
- The `snapshot-provenance` job runs on this pull request and passes, with the twelve baseline commits carrying `Snapshot-Container: mcr.microsoft.com/playwright:v1.62.1-noble`.
- A deliberate negative test is recorded: a scratch commit that touches a baseline without the trailer makes `snapshot-provenance` fail with the "regenerate by commenting /update-snapshots" message, and the scratch commit is dropped before merge.
- The pull request is observed to require code-owner review because it touches `e2e/__screenshots__/**`, while a scratch pull request touching only `e2e/canvas.spec.ts` is not — proving the KW-002 CODEOWNERS scope covers the baselines and only the baselines.
- The `GITHUB_TOKEN`-versus-PAT experiment is run once and both halves are recorded in the pull-request body: a baseline commit pushed with `GITHUB_TOKEN` produces **no** new `e2e` workflow run on the pushed head (leaving the pull request on a stale check), and the same push with `SNAPSHOT_PUSH_TOKEN` does produce one. If `SNAPSHOT_PUSH_TOKEN` is not yet provisioned, record the first half plus the workflow's fail-fast message and escalate the secret to the Executor rather than merging a workflow that silently uses `GITHUB_TOKEN`.
- `gh api repos/its-everdred/kevinweaver-dev/rulesets` still lists exactly one required status check, `ci-ok`. Adding a context in this pull request is a review-blocking change.
- `git diff --name-only origin/main...HEAD` lists only `playwright.config.ts`, `e2e/canvas.spec.ts`, `.github/workflows/snapshots.yml` and the twelve files under `e2e/__screenshots__/desktop-2x/canvas.spec.ts/`.
- `grep -RnE 'merge_group|repository_dispatch|pull_request_target|BASE_URL|maxDiffPixelRatio|test:e2e:update' .github/workflows/snapshots.yml playwright.config.ts e2e/canvas.spec.ts` returns no match.
- The aggregate pull-request diff adds under 1 MiB of binary content, and `git lfs ls-files` is empty.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. Two operator actions surround this ticket and are preconditions rather than evidence: GATE-002 must be closed before the branch can be pushed at all, and `SNAPSHOT_PUSH_TOKEN` must exist before the regeneration path is usable. Neither is satisfied by anything an agent can do.

## Failure, security, migration, and accessibility cases

**Failure — a gate that enforces nothing is the default outcome here, and it is silent.** Four specific ways, each with the guard that this ticket ships. (1) The comparison tolerance: Playwright's defaults pass a whole-canvas recolour, so `threshold: 0` is set and a deliberate one-pixel corruption is part of the agent gate. (2) The update guard: `process.argv.includes` misses `-u`, so the corrected `some(...)` form ships and all four spellings are exercised. (3) The path template: the default partitions baselines by platform through `snapshotSuffix`, so a locally-rendered PNG would land beside the container's instead of colliding with it; the override removes the partition, and the collision becomes the diff. (4) The provenance check: a trailer is typeable by anyone, so the ticket does not claim it is enforcement — CODEOWNERS is, and the pull request proves the CODEOWNERS scope by observation rather than by assertion.

**Failure — a flaky baseline destroys trust in the whole suite, permanently.** The mitigation is ordering, not tolerance: semantics are asserted before pixels, so a failure says *what* broke rather than *that* something did; `retries: 0` is inherited from KW-023 and must not be weakened, because a retried visual test is how a flaky suite becomes a suite nobody reads; and the double-render canary runs in the same file, so if determinism itself has broken, the canary fails first and names the cause. If the canary ever fails, do not raise a tolerance — the correct response is to treat it as a KW-024 or KW-022 determinism regression.

**Failure — daily data regeneration would invalidate every baseline.** KW-028 commits a `generatedAt` bump every day. The fixture payload served by `page.route` is what makes the baselines stable across that; a suite that renders from `public/data/v1/**` would be red every morning and would be disabled within a week. The fixture must never be replaced with the live bundle "because it is more realistic".

**Failure — the regeneration workflow deadlocking a pull request.** A `GITHUB_TOKEN` push to a pull-request branch does not create a workflow run (GitHub Actions security documentation, re-confirmed in the ci-testing track §10.5), so `e2e` never re-runs and the pull request keeps its stale red check with no way forward except a manual empty commit. The workflow therefore fails fast when `SNAPSHOT_PUSH_TOKEN` is absent instead of falling back, and the failure message says exactly why.

**Security — this ticket introduces the first workflow in the repository that runs pull-request code with a write credential, and that is the whole security story.** Four containments, all present in the file. The trigger is `issue_comment`, not `pull_request_target`, so the workflow definition is read from the default branch and a pull request cannot rewrite its own regeneration rules. The author gate is `author_association == 'OWNER'`, narrowed from the research's draft because `its-applekid` is measurably not a collaborator; a drive-by comment cannot start the job. The head repository is checked against this repository before checkout, so a fork head is refused rather than built with a token that can write to `main`'s repository. And `permissions` is `contents: read` at workflow level, widened to `contents: write` + `pull-requests: write` only on the `update` job — the `guard` job, which runs on every pull request including from forks, never gets a write token. `SNAPSHOT_PUSH_TOKEN` must be a fine-grained PAT scoped to this repository with `contents: write` and nothing else; it is passed to `actions/checkout` and to `git push` and is never echoed. The baseline PNGs are renders of a synthetic fixture — no email, no phone number, no real contribution figure and no token appears in a pixel — which is also why DEC-015's phone-number prohibition is satisfied trivially here.

**Migration.** None. The three files are additive and the `playwright.config.ts` edit only fills in keys KW-023 left reserved, so no existing test changes behaviour. Rollback is `git revert`; because no status context is promoted to required by this ticket, a revert cannot strand an open pull request. The one ordering that would strand pull requests — promoting a snapshot context to required and then reverting — is precisely why promotion is not in scope.

**Accessibility.** Not applicable as a product surface: this ticket ships no markup, no styling and no user-facing behaviour, and it is explicitly forbidden from adding an attribute to any canvas. Two obligations are nonetheless discharged so KW-029 can work without touching these files. The inventory test asserts that all three canvases carry `role="img"` with a non-empty accessible name, which is KW-025's Invariant 7 and is a hard precondition for KW-029's axe run — catching a missing label here, at the pixel gate, is strictly earlier than catching it in the a11y gate. And the suite deliberately does not touch the `reduced-motion` project, so KW-029's reduced-motion evidence remains independent of anything asserted here; the two gates must be able to fail separately, because "the animation stopped" and "the animation looks right" are different claims.

## Surfaces

- Reads: `lib/viz/driver.ts`, `lib/viz/testHarness.ts`, `lib/viz/render/budget.ts`, `lib/viz/tokens/level.ts`, `lib/bundle/codec.ts`, `lib/bundle/schema.ts`, `app/regions/Instrument.tsx`, `components/viz/Gource.tsx`, `components/viz/Ribbon.tsx`, `components/viz/Overview.tsx`, `e2e/screenshot.css`, `.github/workflows/e2e.yml`, `.github/CODEOWNERS`, `package.json`, `.nvmrc`, `docs/research/2026-07-31-ci-testing.md`, `docs/research/2026-07-31-viz-runtime.md`, `docs/research/2026-07-31-decomposition-synthesis.md`
- Writes: `playwright.config.ts`, `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, `.github/workflows/snapshots.yml`
- Contracts: `playwright.config.ts#snapshotPathTemplate`, `playwright.config.ts#expect.toHaveScreenshot`, `e2e/__screenshots__/desktop-2x/canvas.spec.ts/**`, `commit-trailer:Snapshot-Container`, `slash-command:/update-snapshots`, `env:KW_IN_CONTAINER`, `secret:SNAPSHOT_PUSH_TOKEN`
- Safety: `visual-baseline-provenance:e2e/__screenshots__`, `container-pin:mcr.microsoft.com/playwright`, `write-credential:snapshots-workflow`

## Sibling boundaries and open gates

**Open gate.** GATE-002 (HG-2) blocks pickup. The push credential's scopes are `admin:public_key, gist, read:org, repo` (GT-10) with no `workflow`, and GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`. Confirm with `gh auth status` before writing a line; the failure lands after the work is complete. GATE-002 also blocks KW-001, KW-023 and KW-028, so the Executor closes it once for all four.

**Open operator precondition, not a declared gate.** `SNAPSHOT_PUSH_TOKEN` — a fine-grained PAT with `contents: write` on `its-everdred/kevinweaver-dev` only — is required by the `update` job. It is not HG-1..HG-7 and it does not block merge: the twelve baselines, the container guard and the `guard` job all work without it. Escalate it to the Executor with the KW-002 rationale (`GITHUB_TOKEN` pushes do not re-run workflows) rather than working around it.

**KW-023 owns** `playwright.config.ts` as a file, `e2e/smoke.spec.ts`, `e2e/screenshot.css` and `.github/workflows/e2e.yml`. This ticket makes the one edit KW-023's document reserves, and nothing else: the project inventory, `retries: 0`, `webServer`, `use` defaults and the `e2e-ok` aggregator are all off limits. If `e2e/screenshot.css` needs a new selector — for example KW-026's freshness pill, which KW-023's file names as a deliberate omission — propose it against KW-023, do not add it here.

**KW-024 owns** `lib/viz/driver.ts` and `lib/viz/testHarness.ts`. This ticket consumes `window.__viz`, `VizFrameInfo`, `DWELL_TICKS` and nothing else, and it never imports the driver into browser code. If a frame is not reproducible, the fix is in KW-024's files.

**KW-025 owns** `app/regions/Instrument.tsx` and `components/viz/**`, including all canvas markup, `role`, `aria-label` and DPR sizing. This ticket asserts against that markup and must not modify it. The device-pixel-ratio *clamp* at dpr 3 is asserted by KW-025's own browser-mode test; this ticket asserts the backing-store arithmetic at dpr 2 and says so.

**KW-022 owns** `lib/viz/render/**`, including `CAPS`, `FrameReport` and `assertFrameBudget`. `CAPS.maxDrawCalls` is imported, never inlined, so a deliberate budget change propagates into this gate instead of being contradicted by it.

**KW-002 owns** `.github/CODEOWNERS` and `.github/rulesets/main.json`. The `/e2e/__screenshots__/` entry already exists there; this ticket relies on it and must not duplicate, narrow or widen it, and must not promote any context to required.

**Wave-6 siblings.** KW-029 owns `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx` and `lib/viz/tokens/contrast.test.ts`; KW-030 owns `e2e/lazy-island.spec.ts`, `.size-limit.json` and `scripts/ci/check-first-load.mjs`. No file is shared with either, and all three consume the same `e2e-ok` context and the same project names. None of the three may rename a project, weaken `retries: 0`, raise a comparison tolerance, or add a `merge_group` trigger. If KW-029 or KW-030 later add a screenshot assertion, the baseline budget in this spec is the shared limit and raising it is a change to this file, negotiated here.

**KW-028 owns** `.github/workflows/data-bundle.yml` and the daily regeneration that makes the live payload unusable as a test input. The two workflows never interact; if a baseline ever changes because the data changed, the fixture interception has been removed and that is the defect.

**KW-032 owns** the capstone verification and depends on this ticket. It consumes only the green `e2e-ok` context and the existence of the baselines — no symbol, no file.
