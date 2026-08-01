# KW-029 — Accessibility gate: axe conformance, canvas text equivalent, and reduced-motion proof

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Three small files, no new dependency; the cost is knowing what the tooling cannot see: axe-core 4.12.1 ships 105 rules, none about canvas, so the three properties that matter most each need a hand-written proof.

**Risk:** medium — a gate's failure mode is a false green: a scan that passes because it never looked. Contained by a negative control on every assertion, by pinning the rule set, and by a three-file write surface no sibling owns.

**Phase hint:** 6

**Depends on:** KW-016, KW-017, KW-018, KW-019, KW-020, KW-023, KW-025, KW-026

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-004, DEC-005, DEC-008, DEC-009, DEC-011

**Gates:** none

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`npx playwright test e2e/a11y.spec.ts` and `npx vitest run lib/viz/tokens/contrast.test.ts` are both green against the assembled page, and together prove four things: axe reports zero violations on `/` for `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa`; a visually hidden `<table>` carries one cell per day in the published window and every number matches `public/data/v1/grid.json`; a `prefers-reduced-motion: reduce` session advances the simulation by exactly zero ticks across five seconds of faked clock; and every colour pair the canvas paints text with clears 4.5:1 against the pane surface, proven by a unit test that itself fails on a deliberately bad pair.

## Context and evidence

### The problem this ticket exists to solve, measured

Re-measured this session against `axe-core@4.12.1` and `@axe-core/playwright@4.12.1` (`npm view` + the published tarball, read with `axe.getRules()`).

| What | Measured | Consequence |
|---|---|---|
| Total rules in axe-core 4.12.1 | **105** | — |
| Rules mentioning canvas, in id or description | **0** | Re-confirms the synthesis's "no canvas rule in the Deque 4.10 index". A canvas is a black box to the scanner. |
| Rules that run under `['wcag2a','wcag2aa','wcag21a','wcag21aa']` | **69 of 105** | The other 36 — every `best-practice` and `experimental` rule — do **not** run under those tags. |
| `region` | tags `['cat.keyboard','best-practice','RGAAv4','RGAA-9.2.1']` | **best-practice, not WCAG.** |
| `page-has-heading-one`, `landmark-one-main` | tags `['cat.semantics','best-practice']` | **best-practice, not WCAG.** |
| `html-has-lang` | tags include `wcag2a`, `wcag311` | Runs under the WCAG tags. |
| `role-img-alt` | tags include `wcag2a`, `wcag111` | The exact rule that catches `role="img"` with no accessible name. |
| `blink`, `marquee` | the only two rules tagged `wcag222` | Neither can see a `requestAnimationFrame` loop. |

**This corrects `docs/research/2026-07-31-ci-testing.md` §7**, which names `html-has-lang`, `page-has-heading-one`, `region` and `landmark-one-main` as "cheap wins the design system will pass" and asserts them with `.withTags(WCAG)` alone. Three of the four are `best-practice` and would silently never execute. They are asserted here in a **second** `AxeBuilder` run pinned with `.withRules([...])`.

### The three things invisible to the scanner, and who proves each

From the synthesis §5 entry for **KW-29**:

1. **The canvas has no accessible name and no contents.** `role-img-alt` checks `role="img"` + `aria-label`; the *contents* are checkable by nothing. **DEC-011** answers with a visually hidden `<table>` — also the SSR/no-JS fallback and the SEO surface — specified by `docs/research/2026-07-31-viz-runtime.md` §9.4 and built here (Invariant 4).
2. **Canvas-painted text contrast is unreachable by `color-contrast`**, which reads computed CSS; `ctx.fillText` text has none. ci-testing §7 item 3 resolves it as a unit test over the token pairs the renderer uses (Invariant 3).
3. **`prefers-reduced-motion` and WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide) are not axe rules.** The only two `wcag222` rules, `blink` and `marquee`, are element checks; a rAF-driven canvas trips neither. Both are asserted in Playwright.

### Why this ticket verifies and does not sweep

**DEC-005** (synthesis D-05) partitions every same-wave ticket by file so `serializes_with` stays empty — **C-11**: that is the one edge type aiur does *not* enforce at runtime. Synthesis §8 rejected a cross-cutting a11y sweep for that reason and folded a11y into each region's acceptance criteria, with only the global primitives in KW-003. Every region therefore owns its own semantics, mapped file-by-file in Invariant 1. **KW-029 asserts all of it and fixes none of it**: a failure outside these three files is a P1 rework on the owning ticket, never a cross-file edit.

### Contrast ground truth, recomputed this session

Every ratio below was recomputed with the WCAG 2.x relative-luminance formula against `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css` (read on disk this session). `layers/pane.css:4` sets `.pane{background:var(--surface-pane)}`, `colors.css:22` aliases `--surface-pane:var(--bg-h)` = `#1d2021`, and `.pane-body` declares no background — so **every canvas in a pane sits on `#1d2021`**, which the gource canvas also paints itself (comp:709).

| Pair | Ratio | Verdict |
|---|---|---|
| `--gray #928374` on `--bg-h #1d2021` | **4.467** | ❌ below 4.5 |
| `--gray #928374` on `--bg0 #282828` | **4.016** | ❌ below 4.5 |
| `--bg4 #7c6f64` on `--bg-h` | **3.369** | ❌ below 4.5 |
| `--bg-h` on `--purple-d #b16286` | **3.873** | ❌ below 4.5 |
| `--fg4 #a89984` on `--bg-h` | 5.898 | ✅ |
| `--purple #d3869b` on `--bg-h` | 5.975 | ✅ |
| `--bg-h` on `--aqua-d #689d6a` | 5.168 | ✅ |
| `--fg0 #fbf1c7` on `--bg-h` | 14.451 | ✅ |

**Correction to the synthesis's KW-29 pointer, which the agent must apply.** It reads *"`gray #928374` on `bg0 #282828` is ~4.4:1"*, conflating two numbers: `--gray` on `--bg0` is **4.016**; `--gray` on `--bg-h` `#1d2021` is **4.467**. Both are under 4.5, so the conclusion — `--gray` may not carry normal-size text — is what this ticket pins. `design-comp-spec` C5 is authoritative: `#1d2021` is the correct surface.

**The scanline drag is invisible to axe, and matters here.** `design-comp-spec` §9.2 measured the overlay as `rgba(0,0,0,.16)` at `opacity:.35` with `mix-blend-mode:multiply` — a `1 − 0.16·0.35 = 0.944` multiplier on one of every three pixel rows, which `color-contrast` cannot see because a blend-mode sibling is in neither the element's computed colour nor its background stack. The unit test therefore asserts the canvas-text palette clean *and* under `.35`.

### Requirements this ticket serves

REQ-002 (App Router, UI partitioned into the comp's seven regions so no two tickets share a file — this ticket proves the partition left no hole); REQ-003 (every claim is the authoritative resume or measured data — the DEC-011 table is that claim in text, asserted cell-by-cell against the payload); REQ-009 (correct heading outline, landmark structure and bypass affordance — measured here rather than asserted).

### Plan-context navigation

All links pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`. This ticket is **wave 6 / level 6**, one of three gates, **on the critical path**: `KW-001 → KW-008 → KW-022 → KW-024 → KW-025 → KW-029 → KW-032`.

- **Pack index:** `docs/build-orders/site-rewrite/README.md` (`../README.md`) — authority map; KW-01…KW-32 → `KW-001`…`KW-032`.
- **Graph and wave analysis:** `docs/research/2026-07-31-decomposition-synthesis.md` §5 "Ticket set" (the **"KW-29 — Accessibility gate"** entry), §6 "Wave diagram", "Verified topological levels", "Write-surface partition (proof of D-05)".
- **Decision registry:** `docs/build-orders/site-rewrite/03-technical-decisions.md` (`../03-technical-decisions.md`), from synthesis §3 D-01…D-17 and §4 human gates HG-1…HG-7. DEC-002/003/004/005/008/009/011 are D-02/03/04/05/08/09/11.
- **Testing source of record:** `docs/research/2026-07-31-ci-testing.md` §7 "Accessibility testing", §5.4 `playwright.config.ts`, §4 `vitest.config.mts`, with `## Verification corrections` C3 and C4 — where a correction contradicts the body, the correction wins.
- **Canvas a11y source of record:** `docs/research/2026-07-31-viz-runtime.md` §9.1–§9.4. **Contrast and semantics:** `docs/research/2026-07-31-design-comp-spec.md` §9.1–§9.7 and corrections C5, C6, C7.
- **Comp source of record:** `docs/design/kevinweaver.dev.dc.html` — canvas `fillText` sites at lines 554–558, 580–584, 595, 630–631, 709, 807–809, 818–822, 836–837, 844–845, 863–866. Per **C-30** the named method governs; if a line number has moved, find `drawOverview` / `drawRibbon` / `drawGraph`.

## Scope

- Author `e2e/a11y.spec.ts`: eight Playwright tests — WCAG tag scan, pinned structure-rule scan, canvas text equivalent, reduced-motion halt, WCAG 2.2.2 pause control, bypass link, boot-overlay dialog semantics and reduced-motion bypass.
- Author `components/viz/ContributionTable.tsx`: the DEC-011 visually hidden `<table>`, a synchronous server component with no `'use client'`, one `<td>` per day with machine-checkable `data-day`, `data-count`, `data-level`.
- Author `lib/viz/tokens/contrast.test.ts`: a Vitest `node`-project unit test pinning the permitted canvas-text colour pairs against their WCAG thresholds, clean and under the measured scanline multiplier, with three negative controls.
- Attach the full axe JSON result to the Playwright report on every run, pass or fail; assert both scans are non-vacuous.
- Guard `lib/viz/render/**` against the three forbidden fills (`#928374`, `#7c6f64`, `#b16286`) with a source read inside the unit test.

## Non-goals

- Editing anything under `app/regions/**`, `components/ds/**` or `components/viz/{Overview,Ribbon,Gource}.tsx` — KW-016…KW-020, KW-025 and KW-026 own those subtrees; assert them from the outside.
- Editing `app/globals.css`, `styles/**`, or adding any CSS anywhere — KW-003 owns the whole stylesheet surface: `.sr-only`, `.skip`, the `:focus-visible` ring, the reduced-motion stop.
- Closing KW-005's `.skip` residual (note 9: "a bypass link that satisfies WCAG 2.4.1 but is invisible to sighted keyboard users", handed here "in KW-003's file"). Outside this write surface under DEC-005: **detect** it and file a P1 rework on KW-003.
- Editing `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/screenshot.css` or `.github/workflows/e2e.yml` — KW-023 owns the harness and `e2e-ok`.
- Editing `e2e/canvas.spec.ts` or anything under `e2e/__screenshots__/**` (KW-031), or `e2e/lazy-island.spec.ts` and `.size-limit.json` (KW-030).
- Editing `lib/viz/tokens/{ramp,level}.ts` or `test/viz/ramp-contrast.test.ts` — KW-007 owns the ramp data and its CIEDE2000 fixture; import, never restate.
- Asserting an adjacent-level WCAG floor on the ramp. GT-15 proved it unsatisfiable (3⁹ = 19,683 required, sRGB maximum 21); KW-007 calls it "a forbidden assertion".
- Taking or comparing any screenshot (KW-031 owns visual regression), or running Lighthouse CI (KW-030 hard-gates its accessibility and SEO categories at 1.0). A11y assertions are never pixels.
- Adding a dependency or touching `package.json` / `package-lock.json` — DEC-003 freezes both after KW-001, which already pins `@axe-core/playwright@4.12.1`.
- Writing, regenerating or committing anything under `public/data/v1/**` — KW-014 produces it, KW-028's workflow commits it.
- Adding a new `aria-live` region anywhere. `design-comp-spec` §9.5 flags an append-driven live log as "a firehose"; the DEC-011 table is static text, never announced.

## Existing owner and reuse target

None of the three files exists at `e664d73a195facd64db58ba10952170ff01b4772`: that commit is still the pre-rewrite Pages Router site (`pages/index.js`, `styles/globals.scss`, `yarn.lock`) with no `app/`, `lib/`, `e2e/` or `components/viz/`. All three are created here.

`lib/viz/tokens/contrast.test.ts` sits in a directory KW-007 owns (`ramp.ts`, `level.ts`) but is a distinct file, and KW-029 depends transitively on KW-007 via KW-025 → KW-024 → KW-022, so the ordering is hard. It is co-located rather than under `test/` on purpose: ci-testing §4's `vitest.config.mts` gives the `node` project `include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts']`, so it is picked up by `npx vitest run` with no config change — and config changes are KW-011's.

Symbols this ticket consumes. Each must exist at pickup; if any is absent, stop and report — the `<ContributionTable>` mount excepted.

| Symbol | Module | Created by |
|---|---|---|
| `level`, `bandLabel`, `Level`, `BAND_LABELS` | `lib/viz/tokens/level.ts` | **KW-007** |
| `PANE_SURFACE`, `LV` | `lib/viz/tokens/ramp.ts` | **KW-007** |
| `GridSeries`, `BundleMeta` (types only) | `lib/bundle/schema.ts` | **KW-012** |
| `VizFrameInfo`, `window.__viz` | `lib/viz/testHarness.ts` | **KW-024**, via KW-025 |
| The `<ContributionTable>` mount | `components/viz/Ribbon.tsx` or `app/regions/Instrument.tsx` | **KW-025** |
| `AxeBuilder` | `@axe-core/playwright@4.12.1`, in `package.json` | **KW-001** |
| `playwright.config.ts`, the `webServer` block, `e2e-ok` | KW-023's harness | **KW-023** |
| `public/data/v1/{manifest,grid}.json` | produced by KW-014 | **KW-028** commits it |

**The mount seam, and the three states you may find it in.** The synthesis assigns `components/viz/ContributionTable.tsx` to this ticket alone; KW-025's pointer reads *"Canvases get `role`/`aria-label` plus the D-11 hidden table"*. Run `grep -rn "ContributionTable" components/viz app/regions`:

1. **An import exists and resolves to a placeholder file.** Expected. Replace the body wholesale, keeping the exported name and the props KW-025 already passes.
2. **An import exists and the file does not.** Create it against the props at the call site.
3. **No import anywhere, and the table markup is inlined inside `components/viz/Ribbon.tsx`.** Author `components/viz/ContributionTable.tsx` anyway as the canonical implementation, point the e2e assertions at the rendered DOM, and **file a P1 rework on KW-025**. Do **not** edit `Ribbon.tsx` or delete the inline markup, and never ship two tables — if a second `table[data-testid="contribution-table"]` would appear, keep KW-025's and leave yours unmounted until the rework lands.

If `lib/viz/tokens/level.ts`, `lib/bundle/schema.ts`, `lib/viz/testHarness.ts` or `playwright.config.ts` is missing, an upstream ticket has not merged. **Stop and report — do not create any of them.**

## Contract and invariants

### Invariant 1 — this gate verifies; it never sweeps

Every assertion either passes, or fails and names the ticket that owns the fix. No third option, no cross-file edit. The remediation map is fixed in advance:

| Failing assertion | Owner | Remediation |
|---|---|---|
| `html-has-lang`, one `<h1>`, `landmark-one-main`, `region`, `bypass` | KW-005 | `app/layout.tsx` / `app/page.tsx` |
| `.skip` not visible when focused; `:focus-visible` ring absent | KW-003 | `app/globals.css` / `styles/**` |
| `color-contrast` on DOM text | KW-003 | the six measured pairs in `design-comp-spec` §9.1 + C5 |
| `role-img-alt` on a canvas | KW-025 | `components/viz/{Overview,Ribbon,Gource}.tsx` |
| `button-name`, `aria-input-field-name`, `label` on a transport control | KW-026 | `app/regions/TransportBar.tsx` |
| `aria-progressbar-name` on a tmux segment | KW-018 | `components/ds/TmuxBar.tsx` |
| `scrollable-region-focusable` on the pager | KW-016 | `app/regions/ManPage.tsx` |
| `link-name`, `link-in-text-block` in the contact row | KW-019 | `app/regions/Contact.tsx` |
| Dialog semantics, Esc, focus restoration on the overlay | KW-020 | `app/regions/BootOverlay.tsx` |
| The simulation advances under reduced motion | KW-024 | `lib/viz/driver.ts` |
| A forbidden fill in `lib/viz/render/**` | KW-022 | token swap per Invariant 3 |

### Invariant 2 — the scan is pinned in two halves, both proven non-vacuous

```ts
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const
// Measured: all four below are tagged `best-practice`, NOT wcag*, so .withTags(WCAG_TAGS) never
// runs them — yet ci-testing §7 names three of them as if the tag scan covered them.
const STRUCTURE_RULES = ['region', 'page-has-heading-one', 'landmark-one-main', 'heading-order'] as const
```

The tag run stays tag-driven so a future axe release adds coverage automatically; the rule run is pinned because a best-practice rule is opt-in forever. Both assert `violations` is `[]`, and both assert they were **not vacuous**: `results.passes.length > 0` on the tag run, and every id in `STRUCTURE_RULES` present in `passes` or `inapplicable` and none in `incomplete` on the rule run.

**No `.exclude()` is used, and no selector is invented.** ci-testing §7's sample excludes `#gource-surface *`; a `<canvas>` exposes no accessibility subtree, so there is nothing to exclude, and the element must still be scanned because `role-img-alt` catches an unnamed canvas. Every locator here is a role or accessible-name query, or the one `data-testid` this ticket owns.

### Invariant 3 — the canvas-text colour policy

Canvas text does not inherit CSS and is not reachable by `color-contrast` (`design-comp-spec` §5.5, ci-testing §7 item 3). Every glyph the renderer paints is 9, 11 or 13 px except one 20 px bold banner, so **the normal-text threshold of 4.5:1 applies to all of it** — no large-text exemption below 18.66 px bold / 24 px regular. The permitted set, recomputed this session against `--bg-h #1d2021`; `✅` means the comp already used the approved pair.

| id | Foreground | Background | Size | Clean | Under `.35` scanline | Comp site (and what it was) |
|---|---|---|---|---|---|---|
| `overview-year` | `--fg4 #a89984` | `--bg-h` | 9 px 700 | 5.898 | 5.399 | comp:558 — was `--gray` **4.467 ❌** |
| `ribbon-weekday` | `--fg4 #a89984` | `--bg-h` | 9 px 600 | 5.898 | 5.399 | comp:583-584 — was `--bg4` **3.369 ❌** |
| `ribbon-month` | `--fg4 #a89984` | `--bg-h` | 9 px 600 | 5.898 | 5.399 | comp:595 — was `--gray` **4.467 ❌** |
| `ribbon-agent-marker` | `--purple #d3869b` | `--bg-h` | 9 px 800 | 5.975 | 5.453 | comp:630-631 ✅ |
| `gource-file-label` | `--fg2 #d5c4a1` at α ≥ `MIN_LABEL_ALPHA` | `--bg-h` | 9 px 600 | 4.538 at α 0.62 | 4.5 at α 0.656 | comp:807-809 — `rgba(213,196,161, heat−0.35)` fades **through** the threshold |
| `gource-repo-label` | `--fg4 #a89984` | `--bg-h` | 11 px 600 | 5.898 | 5.399 | comp:818-821 ✅ |
| `gource-repo-label-focus` | `--fg0 #fbf1c7` | `--bg-h` | 13 px 800 | 14.451 | 13.118 | comp:818-821 ✅ |
| `gource-repo-label-private` | `--fg4 #a89984` | `--bg-h` | 11 px 600 | 5.898 | 5.399 | comp:820 — was `--gray` **4.467 ❌** |
| `gource-star-count` | `--fg4 #a89984` | `--bg-h` | 9 px 700 | 5.898 | 5.399 | comp:822 — was `--bg4` **3.369 ❌** |
| `actor-disc-human` | `--bg-h #1d2021` | `--aqua-d #689d6a` | 9 px 800 | 5.168 | 4.743 | comp:834-837 ✅ |
| `actor-disc-agent` | `--bg-h #1d2021` | `--purple #d3869b` | 9 px 800 | 5.975 | 5.453 | comp:840-845 — disc fill was `--purple-d` **3.873 ❌** |
| `agent-init-banner` | `--purple #d3869b` | `--bg-h` | 20 px 800 | 5.975 | 5.453 | comp:863-864 ✅ |
| `agent-init-subline` | `--fg4 #a89984` | `--bg-h` | 11 px 600 | 5.898 | 5.399 | comp:865-866 ✅ |

Three fills are **permanently forbidden as a canvas text foreground or as the background behind canvas text** — ratio on the pane surface, then substitute: `--gray #928374` (4.467) → `--fg4 #a89984` (5.898); `--bg4 #7c6f64` (3.369) → `--fg4 #a89984` (5.898); `--purple-d #b16286` as a disc fill under `--bg-h` text (3.873) → `--purple #d3869b` (5.975).

`--gray` is not banned from the codebase — only from carrying normal-size text. `layers/pane.css` uses it for the `.ph` placeholder stripe and `colors.css` aliases it as `--text-comment`; both are decorative and unpoliced here.

`MIN_LABEL_ALPHA` is **0.66**, bisected this session: the minimum alpha at which `rgba(213,196,161,α)` over `#1d2021` clears 4.5:1 is 0.6189 clean and 0.6555 under the `.35` scanline, so 0.66 clears both. The comp starts the fade at `heat − 0.35` = 0.65 and decays to zero, walking the label through the AA threshold; the fix is a clamp in KW-022.

### Invariant 4 — the DEC-011 table is a server-rendered artefact with three jobs

It is the accessible text equivalent, the no-JS fallback and the SEO surface — `viz-runtime` §9.4's "one artefact, three jobs". Therefore:

- **No `'use client'`.** Under DEC-002 (App Router, RSC, no `output:'export'`) a synchronous server component costs zero client JavaScript, and `curl -s localhost:3000 | grep -c 'data-day='` must return the full day count. A client component puts ~1,830 rows behind hydration.
- **It is always in the DOM**, never conditionally rendered, never inside a `<noscript>`, never `hidden` or `aria-hidden`; hidden visually by KW-003's `.sr-only` and nothing else. `viz-runtime` §9.4 on the node count: "1,826 `<td>` elements is 1,826 nodes — acceptable *because they are never styled or animated*."
- **It renders nothing when the payload is absent.** `dayCount === 0`, a length mismatch between `dayCount` and the series, or a missing prop returns `null` — never a partial or padded table.
- **No figure is a literal (DEC-008).** Every count, date and caption total derives from the props. The comp's `4,817 / 284 / 17 / 156 / 1,826` and content-ia §9's `10,001 / 2,038 / 375 / 58` are forbidden here; each has been measured wrong at least once (C-1, C-4, C-20).

### Producer interfaces consumed — quote verbatim, do not paraphrase

```ts
// lib/viz/tokens/level.ts — owned by KW-007
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const BAND_LOWER_BOUNDS: readonly [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];
export const BAND_LABELS: readonly [
  '0', '1', '2–3', '4–7', '8–15', '16–31', '32–63', '64–127', '128–255', '256+',
];
export function level(count: number): Level;
/** Text equivalent for a level, consumed by the DEC-011 hidden table and the tooltip. */
export function bandLabel(value: Level): string;

// lib/viz/tokens/ramp.ts — owned by KW-007
/** The surface every grid cell is painted on: --surface-pane -> --bg-h. */
export const PANE_SURFACE: '#1d2021';
export const LV: readonly [/* ten lowercase six-digit hex stops, index === Level */];
```

KW-007's contract requires each consumer to quote the sketch verbatim rather than restate the values. `bandLabel` exists for this table — use it, do not format band ranges here.

```ts
// lib/bundle/schema.ts — owned by KW-012. TYPE-ONLY import; nothing is pulled at runtime.
export type IsoDay = string;     // 'YYYY-MM-DD'
export type IsoSecond = string;  // 'YYYY-MM-DDTHH:MM:SSZ', always 'Z'

export interface BundleMeta {    // also v, commit, repoCount, repoCountDefinition, actors[], degraded[]
  generatedAt: IsoSecond;
  windowStart: IsoDay;   // oldest day in the window
  windowEnd: IsoDay;     // newest day; this is day index 0
  dayCount: number;      // inclusive
}

/** grid.json. NOTE the axis flip: grid arrays run FORWARD in time from `start`. */
export interface GridSeries {
  start: IsoDay;              // OLDEST day — NOT windowEnd
  dayCount: number;           // must equal BundleMeta.dayCount
  human: readonly number[];   // actors[0] daily contributionCount, length dayCount
  agent: readonly number[];   // actors[1] daily contributionCount, length dayCount
  privateMonthly: readonly number[];  // restrictedContributionsCount, MONTHLY buckets
  privateStart: IsoMonth;     // e.g. '2021-01'
  bands: readonly number[];   // length BAND_COUNT; values owned by KW-007
}
```

**The axis flip is the trap.** `GridSeries.start` is the **oldest** day and `human`/`agent` run forward from it, while `BundleEvent.day` indexes 0 as `windowEnd` and increases into the past. This table only walks forward from `start`. Do not copy an index convention out of `lib/viz/**`.

```ts
// lib/viz/testHarness.ts — owned by KW-024, exposed on window behind `?viz-test=1`
export interface VizFrameInfo {
  date: string; liveRepos: readonly string[]; highlightCell: number | null
  rngState: number; drawCalls: number
}
// window.__viz: { pause, reset, renderFrame, seekTick, seekDate, inspect, setQuality }
```

`inspect()` returns `VizFrameInfo`; each harness command awaits a `getImageData` rasterization flush so Playwright cannot race the command buffer. KW-025 depends on KW-024, so the harness is guaranteed present. If the exported type name differs, declare the same structural type locally rather than editing `lib/viz/testHarness.ts`.

**Do not use `window.__kwDebug`** — ci-testing §7's sample reads `(window as any).__kwDebug?.cursorMs`, a name that predates the KW-024 contract and does not exist. `window.__viz` / `inspect()` is authoritative.

### Producer interface this ticket owns

```ts
// components/viz/ContributionTable.tsx
import type { BundleMeta, GridSeries } from '@/lib/bundle/schema'

export interface ContributionTableProps {
  grid: GridSeries    // from KW-015 boot() -> BundleHead.grid
  meta: Pick<BundleMeta, 'windowStart' | 'windowEnd' | 'dayCount' | 'generatedAt'>  // -> BundleHead.manifest
  id?: string         // element id for the <table>, for a sibling's aria-describedby
  className?: string  // appended to `sr-only`; never replaces it
}

export function ContributionTable(props: ContributionTableProps): ReactNode
```

That named export is the entire public surface: no default export, no second export, no `'use client'`.

The rendered DOM contract, which the e2e assertions quote and KW-025 must not reshape:

```html
<table id="contribution-table" class="sr-only" data-testid="contribution-table">
<caption>Contributions by day, 1 August 2021 – 31 July 2026. 10,001 contributions across 1,826 days.</caption>
<thead><tr><th scope="col">Week</th><th scope="col">Sunday</th>…<th scope="col">Saturday</th></tr></thead>
<tbody><tr><th scope="row">Week of 31 October 2021</th><td></td>
<td data-day="2021-11-01" data-count="12" data-level="4">1 November 2021: 12 contributions (level 4, band 8–15)</td>
… six more …</tr></tbody></table>
```

Four properties are load-bearing:

1. **`data-day` is the assertion seam.** `page.locator('[data-testid="contribution-table"] td[data-day]')` must count exactly `meta.dayCount`. Padding cells (at most 12) are empty and carry no `data-*`, so the attribute selector excludes them.
2. **Row headers and column headers both exist**, so axe's `th-has-data-cells`, `td-has-header` and `td-headers-attr` (all `wcag2a`/`wcag131`, all in the 69-rule set) pass without `headers`/`id` wiring. A `<caption>` is present, so `table-fake-caption` cannot fire.
3. **Cell text is a whole sentence, not a number.** A bare "12" out of a 1,826-cell grid tells a screen reader nothing; date + count + band label are the text equivalent WCAG 1.4.11 needs, which GT-15 proved no ten-step ramp can supply through colour.
4. **Dates are UTC-pinned and rendered in one locale**, `Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })`. The default locale renders `November 1, 2021` for a US visitor and `01/11/2021` elsewhere, and the default time zone moves days west of UTC — so the e2e assertion would pass locally and fail in the container.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-read the cited files at pickup; if a comp line has moved, the named method still governs (C-30).

### Step 0 — verify the base

```bash
test -f playwright.config.ts && test -f e2e/smoke.spec.ts          # KW-023
test -f lib/viz/tokens/level.ts && test -f lib/viz/tokens/ramp.ts  # KW-007
test -f lib/bundle/schema.ts                                       # KW-012
test -f lib/viz/testHarness.ts && test -f lib/viz/driver.ts        # KW-024
test -f app/regions/Instrument.tsx && test -f app/regions/TransportBar.tsx  # KW-025/026
test -f public/data/v1/manifest.json && test -f public/data/v1/grid.json    # KW-028
grep -n '"@axe-core/playwright"' package.json    # KW-001 froze it at 4.12.1
grep -rn "ContributionTable" components/viz app/regions   # which mount state?
grep -n "lib/\*\*/\*.test.ts" vitest.config.mts  # node project takes co-located tests
npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build
```

The build must be green **before** you change anything. Any missing file above means an upstream ticket has not merged: stop and report. If `@axe-core/playwright` is absent from `package.json`, that is a defect in KW-001's frozen dependency set — **stop and report; do not `npm install` it.** DEC-003 freezes both manifests after KW-001, and a wave-6 lockfile edit poisons every other agent's prewarm.

The payload is **committed** by KW-028's daily workflow. Never run `npm run data:build`: it needs `CONTRIB_TOKEN` (GATE-003), and regenerating puts a `public/data/v1/**` diff — KW-014's surface — in this PR.

### The three files to create

`e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx` (new, or replacing KW-025's placeholder — see mount states), `lib/viz/tokens/contrast.test.ts`. Nothing else: no config, stylesheet, region, workflow or `package.json`.

### Step 1 — `components/viz/ContributionTable.tsx`

Imports: `type { ReactNode } from 'react'`, `type { BundleMeta, GridSeries } from '@/lib/bundle/schema'`, `{ bandLabel, level } from '@/lib/viz/tokens/level'`. `ContributionTableProps` is exactly as declared in "Producer interface this ticket owns".

```tsx
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
const DAY_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const NUM = new Intl.NumberFormat('en-US')

/** No Date arithmetic on local time, ever. */
function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
const addDays = (base: Date, n: number): Date => new Date(base.getTime() + n * 86_400_000)
const isoDay = (d: Date): string => d.toISOString().slice(0, 10)
const dayLabel = (d: Date): string => DAY_FMT.format(d)

export function ContributionTable({ grid, meta, id, className }: ContributionTableProps): ReactNode {
  // Fail closed. A wrong text equivalent is worse than none.
  if (!grid || !meta || grid.dayCount !== meta.dayCount || grid.dayCount <= 0 ||
      grid.human.length !== grid.dayCount || grid.agent.length !== grid.dayCount) return null

  const start = toUtcDate(grid.start)
  const leading = start.getUTCDay()                   // 0..6 padding cells before day 0
  const weeks = Math.ceil((leading + grid.dayCount) / 7)
  let sum = 0
  for (let i = 0; i < grid.dayCount; i += 1) sum += grid.human[i] + grid.agent[i]

  return (
    <table id={id} data-testid="contribution-table" className={['sr-only', className].filter(Boolean).join(' ')}>
      <caption>{`Contributions by day, ${dayLabel(toUtcDate(meta.windowStart))} – ${dayLabel(toUtcDate(meta.windowEnd))}. ${NUM.format(sum)} contributions across ${NUM.format(grid.dayCount)} days.`}</caption>
      <thead><tr><th scope="col">Week</th>{WEEKDAYS.map((w) => <th key={w} scope="col">{w}</th>)}</tr></thead>
      <tbody>
        {Array.from({ length: weeks }, (_, w) => {
          const weekStart = addDays(start, w * 7 - leading)
          return (
            <tr key={isoDay(weekStart)}>
              <th scope="row">{`Week of ${dayLabel(weekStart)}`}</th>
              {WEEKDAYS.map((name, k) => {
                const i = w * 7 + k - leading
                if (i < 0 || i >= grid.dayCount) return <td key={name} />
                const day = addDays(start, i), count = grid.human[i] + grid.agent[i], lv = level(count)
                return (
                  <td key={name} data-day={isoDay(day)} data-count={count} data-level={lv}>
                    {`${dayLabel(day)}: ${NUM.format(count)} contribution${count === 1 ? '' : 's'} (level ${lv}, band ${bandLabel(lv)})`}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

Five things are deliberate:

1. **`leading = start.getUTCDay()`** aligns the first row to a Sunday so `<th scope="row">Week of …</th>` is honest. Padding cells are bare `<td />` with no `data-*`, keeping `td[data-day]` an exact count of `dayCount`.
2. **`level()` and `bandLabel()` are imported, never reimplemented** — KW-007 owns the log2 ladder, and DEC-009 rules out quantile binning.
3. **`grid.human[i] + grid.agent[i]` is the combined count**, per DEC-009's single combined-actor ramp. `grid.privateMonthly` is deliberately **not** in the table: a monthly aggregate with no per-day resolution, which content-ia §11.5 requires be labelled as a count and never tied to an organisation.
4. **`className` appends to `sr-only`**, never replaces it. KW-003 owns that class.
5. **No `'use client'`, no `useEffect`, no `fetch`.** The props come from KW-025, which already has `BundleHead` from KW-015's `boot()`.

### Step 2 — `lib/viz/tokens/contrast.test.ts`

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PANE_SURFACE } from './ramp'

const AA_NORMAL = 4.5
const AA_LARGE = 3
/** design-comp-spec §9.2, measured: rgba(0,0,0,.16) at opacity .35, mix-blend-mode multiply. */
const SCANLINE_MULTIPLIER = 1 - 0.16 * 0.35        // 0.944
/** Bisected this session: 0.6189 clean, 0.6555 under the scanline. 0.66 clears both. */
const MIN_LABEL_ALPHA = 0.66

const channel = (hex: string, i: number): number => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
const hex2 = (n: number): string => Math.round(n).toString(16).padStart(2, '0')
function linear(c: number): number {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export function relativeLuminance(hex: string): number {
  return 0.2126 * linear(channel(hex, 0)) + 0.7152 * linear(channel(hex, 1)) + 0.0722 * linear(channel(hex, 2))
}
export function contrastRatio(a: string, b: string): number {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)]
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
// underScanline(hex): per channel, hex2(channel(hex, i) * SCANLINE_MULTIPLIER), rejoined as '#rrggbb'.
// composite(fg, alpha, bg): per channel, hex2(channel(fg,i)*alpha + channel(bg,i)*(1-alpha)).

interface CanvasTextPair {
  readonly id: string; readonly fg: string; readonly bg: string
  readonly px: number; readonly bold: boolean; readonly where: string
}
/** WCAG large text: >= 24px, or >= 18.66px bold. Everything else is 4.5:1. */
const threshold = (p: CanvasTextPair): number =>
  p.px >= 24 || (p.bold && p.px >= 18.66) ? AA_LARGE : AA_NORMAL

const FORBIDDEN_FILLS = ['#928374', '#7c6f64', '#b16286'] as const
const CANVAS_TEXT: readonly CanvasTextPair[] = [ /* the 13 rows of Invariant 3 */ ]
```

One `describe('canvas text contrast (axe cannot see any of this)', …)` with six blocks. The first, in full:

```ts
it.each(CANVAS_TEXT)('$id clears its WCAG threshold on a clean surface', (p) => {
  expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(threshold(p))
})
```

The other five:

2. `'$id still clears under the .35 scanline'` — the same `it.each(CANVAS_TEXT)` with both sides put through `underScanline()`.
3. Negative controls — `it.each([['--gray on the pane surface', '#928374', PANE_SURFACE, 4.467], ['--bg4 on the pane surface', '#7c6f64', PANE_SURFACE, 3.369], ['pane-surface text on --purple-d', PANE_SURFACE, '#b16286', 3.873]])('%s is below AA and is therefore forbidden', …)`, asserting both `toBeCloseTo(expected, 3)` and `toBeLessThan(AA_NORMAL)`. The blocks above are worthless unless these three fail.
4. `'pins the formula itself'` — `contrastRatio('#a89984', '#1d2021')` `toBeCloseTo(5.898, 3)`, `contrastRatio('#ffffff', '#000000')` `toBeCloseTo(21, 5)`, and `expect(PANE_SURFACE).toBe('#1d2021')` as the KW-007 anchor.
5. `'the fading gource file label is clamped above the threshold'` — `contrastRatio(composite('#d5c4a1', MIN_LABEL_ALPHA, PANE_SURFACE), PANE_SURFACE)` and the same pair through `underScanline()` are both `toBeGreaterThanOrEqual(AA_NORMAL)`, while `composite('#d5c4a1', 0.5, PANE_SURFACE)` is `toBeLessThan(AA_NORMAL)` — the comp's own alpha starts at 0.65 and decays to 0, walking through the floor.
6. `'no forbidden fill appears anywhere in lib/viz/render'` — `readdirSync(join(process.cwd(), 'lib/viz/render'))` filtered to `.ts`, `expect(sources.length).toBeGreaterThan(0)` as the non-vacuous guard, then for every file `expect(readFileSync(…, 'utf8').toLowerCase(), \`${file} paints with ${fill}\`).not.toContain(fill)` for each of `FORBIDDEN_FILLS`.

Keep `toBeCloseTo(expected, 3)` on the negative controls — pinning the values makes this a *regression* test, not a tautology, so loosening `contrastRatio` turns the suite red. Never use `toBeLessThan` alone.

**Do not add a CIEDE2000 assertion, an adjacent-level ramp assertion, or a `LV` monotonicity assertion here.** All three belong to `test/viz/ramp-contrast.test.ts` (KW-007); the adjacent-WCAG form is forbidden by GT-15.

### Step 3 — `e2e/a11y.spec.ts`

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
/** Measured: all four are `best-practice`, so .withTags(WCAG_TAGS) never runs them. */
const STRUCTURE_RULES = ['region', 'page-has-heading-one', 'landmark-one-main', 'heading-order']

// VizFrameInfo: declare a structural copy of the KW-024 interface quoted above.
declare global { interface Window { __viz?: { inspect(): VizFrameInfo } } }

async function readPayload(page: Page) {          // both must be ok(); message names KW-028
  const [m, g] = await Promise.all([
    page.request.get('/data/v1/manifest.json'), page.request.get('/data/v1/grid.json'),
  ])
  expect(m.ok(), 'manifest.json must be committed by KW-028').toBeTruthy()
  expect(g.ok(), 'grid.json must be committed by KW-028').toBeTruthy()
  return { manifest: await m.json(), grid: await g.json() }
}
```

Eight tests follow, in this order. Tests 1 and 2 sit in a `test.describe('axe', …)` block carrying `test.use({ reducedMotion: 'reduce' })` — scan a stopped page, because axe's DOM traversal must not race the rAF loop (ci-testing §7).

1. **`no WCAG A/AA violations on / @a11y`** — `goto('/')`, `await page.evaluate(() => document.fonts.ready)`, `const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()`, `await testInfo.attach('axe-wcag', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })`, then `expect(results.violations).toEqual([])` and `expect(results.passes.length, 'a scan that inspected nothing is not a pass').toBeGreaterThan(0)`. Tests 2 and 7 attach their results the same way.
2. **`page structure rules pass @a11y`** — `goto('/')`, `new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze()`, attach as `axe-structure`, `expect(results.violations).toEqual([])`, then `const seen = new Set([...results.passes, ...results.inapplicable].map((r) => r.id))` and `for (const id of STRUCTURE_RULES) expect(seen, `${id} did not run`).toContain(id)`, and `expect(results.incomplete).toEqual([])`.

3. **`canvas exposes a name and a real text equivalent @a11y`** — under reduced motion, on `/`: `await expect(page.getByRole('img', { name: /contribution/i })).toBeVisible()` and assert `evaluate(el => el.tagName)` is `CANVAS`; on `const table = page.getByTestId('contribution-table')`, assert `table.locator('caption')` matches `/contributions by day/i` and `table.locator('td[data-day]')` counts exactly `manifest.dayCount`; spot-check at `i = Math.floor(grid.dayCount / 2)` by adding `i` days to `grid.start` in UTC and asserting that cell's `data-count` equals `grid.human[i] + grid.agent[i]` (**one cell checked exactly beats 1,826 checked loosely**); assert server rendering with `expect((await page.request.get('/')).text()).resolves.toContain('data-day=')`.

4. **`reduced motion halts the simulation @a11y`** — the only test that uses the harness, and the worked example the next two follow:
```ts
test('reduced motion halts the simulation @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/?viz-test=1')
  await page.evaluate(() => document.fonts.ready)
  await expect.poll(() => page.evaluate(() => Boolean(window.__viz))).toBe(true)
  await page.clock.runFor(3000)
  const before = await page.evaluate(() => window.__viz!.inspect())
  await page.clock.runFor(5000)
  expect(await page.evaluate(() => window.__viz!.inspect())).toEqual(before)
})
```
   `runFor`, never `fastForward` (C4/ci-testing §5.6: it fires each timer at most once, dropping rAF frames). Asserting the whole `VizFrameInfo`, not just `date`, proves `drawCalls` and `rngState` are frozen too; the `expect.poll` stops the test passing vacuously when the harness is absent.

5. **`a pause control exists and stops the animation @a11y`** (WCAG 2.2.2) — same opening as test 4 but `reducedMotion: 'no-preference'`. Take `const control = page.getByRole('button', { name: /pause|play/i })`, assert `toBeVisible()`; `runFor(2000)`, capture `moving = inspect()`, `runFor(2000)`, assert the fresh `inspect()` is **`not.toEqual(moving)`**; then `control.focus()`, assert `toBeFocused()`, `keyboard.press('Enter')`, `runFor(1000)`, capture `paused = inspect()`, `runFor(5000)`, assert `inspect()` `toEqual(paused)`.
   The `not.toEqual` step is the negative control: without it a driver that never starts would pass. `Enter` not `Space`, because KW-026 scopes `Space` to the transport region and deletes the comp's window-level `preventDefault` (comp:478-482) — a test depending on `Space` reaching the button would encode the bug.

6. **`the bypass link is the first tab stop and is visible when focused @a11y`** — on `/`, `page.keyboard.press('Tab')`, assert the focused element's accessible name matches `/skip/i` and its `href` is `#whoami`, then read `boundingBox()` while focused and assert `width > 40 && height > 12`. axe's `bypass` rule (`wcag2a`, `wcag241`) covers presence only; *visible on focus* is the residual KW-005 note 9 names. If it fails, the fix is KW-003's `.skip:focus-visible` rule — file a P1 rework, do not add CSS.

7. **`boot overlay dialog semantics @a11y`** — `reducedMotion: 'no-preference'`, `page.clock.install()` (freezes the 100 ms cadence and 2200 ms kill timer), `goto('/')`. `const dialog = page.getByRole('dialog')`; `if (await dialog.count() === 0) test.skip(true, 'no payload -> KW-020 fails closed by design')`. Assert `dialog` `toHaveAttribute('aria-modal', 'true')` and `toHaveAccessibleName(/cold start/i)`, and `page.getByRole('button', { name: /skip/i })` `toBeFocused()`; run `new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()`, attach as `axe-boot`, assert `violations` is `[]`; then `keyboard.press('Escape')` and assert `dialog` `toHaveCount(0)`.
   KW-020 renders `null` whenever the payload is unreadable, so `count() === 0` is a legitimate state and `test.skip` is correct there — but only there. Do not wrap any other assertion in a conditional.

8. **`reduced motion suppresses the boot overlay entirely @a11y`** — `reducedMotion: 'reduce'`, clear `sessionStorage`, `goto('/')`, assert `getByRole('dialog')` has count 0 **and** that no request to `/data/v1/manifest.json` came from the overlay path (`page.on('request', …)` collected before `goto`). KW-020 checks reduced motion *before* the fetch.

### Worked fixture

Serve this pair from `public/data/v1/` locally to develop against — **do not commit it** (KW-014's write surface). Restore the committed bundle with `git checkout -- public/data/v1` before opening the PR.

```jsonc
// manifest.json
{"v":1,"generatedAt":"2026-07-31T16:39:00Z","windowStart":"2021-11-01","windowEnd":"2021-11-14",
 "dayCount":14,"repoCount":58,"repoCountDefinition":"ownerPublicNonFork",
 "actors":[{"id":0,"login":"its-everdred","kind":"human"},{"id":1,"login":"its-applekid","kind":"agent"}],
 "degraded":[]}

// grid.json
{"start":"2021-11-01","dayCount":14,
 "human":[3,0,1,9,4,0,0, 2,2,0,0,1,0,7],
 "agent":[0,0,0,2,1,0,0, 0,0,0,0,0,0,5],
 "privateMonthly":[21],"privateStart":"2021-11",
 "bands":[0,1,2,4,8,16,32,64,128,256]}
```

`2021-11-01` is a Monday, so `leading = 1` and the table is exactly **3 rows** (1 + 14 + 6 = 21 = 3 × 7). Daily totals are `[3,0,1,11,5,0,0, 2,2,0,0,1,0,12]`, summing to **37**. The rendered output must be byte-identical to:

```
caption: Contributions by day, 1 November 2021 – 14 November 2021. 37 contributions across 14 days.
row 1 header: Week of 31 October 2021
  Sunday    (empty, no data-day)
  Monday    1 November 2021: 3 contributions (level 2, band 2–3)
  Tuesday   2 November 2021: 0 contributions (level 0, band 0)
  Wednesday 3 November 2021: 1 contribution (level 1, band 1)
  Thursday  4 November 2021: 11 contributions (level 4, band 8–15)
  Friday    5 November 2021: 5 contributions (level 3, band 4–7)
  Saturday  6 November 2021: 0 contributions (level 0, band 0)
row 2 header: Week of 7 November 2021 — 7 to 13 November, same format
row 3 header: Week of 14 November 2021 — 12 contributions (level 4, band 8–15), then six empties
```

`td[data-day]` count is **14**, empty `<td>` count is **7**. Note the singular "1 contribution" on 3 November and the EN DASH `–` in `2–3` and `8–15`, which comes from `BAND_LABELS` — never a hyphen.

### Exact commands

```bash
npx vitest run lib/viz/tokens/contrast.test.ts
npm run build && npx playwright test e2e/a11y.spec.ts --project=reduced-motion
npx playwright test e2e/a11y.spec.ts    # every project matching the file
npx playwright show-report              # read the three attached axe JSON blobs
```

### Version pins

`@axe-core/playwright@4.12.1` (depends on `axe-core@~4.12.1`, peer `playwright-core >= 1.0.0`), `@playwright/test@1.62.1`, `vitest@4.1.10`, `next@16.2.12`, `react@19.2.8` — all installed by KW-001, all re-confirmed on npm this session. The e2e container is `mcr.microsoft.com/playwright:v1.62.1-noble`, pinned by KW-023. **Add nothing** (DEC-003).

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green, and `npx prettier --check e2e/a11y.spec.ts components/viz/ContributionTable.tsx lib/viz/tokens/contrast.test.ts` reports no drift.
- `git diff --name-only origin/main...HEAD` lists exactly those three paths, and `package.json`, `package-lock.json` and `public/data/v1/**` are byte-identical to `main`.
- `npx playwright test e2e/a11y.spec.ts` passes with all eight tests reported, and the HTML report carries three attached axe JSON blobs (`axe-wcag`, `axe-structure`, `axe-boot`).
- The WCAG scan is clean **and** non-vacuous: `results.violations` is `[]` and `results.passes.length > 0` for `['wcag2a','wcag2aa','wcag21a','wcag21aa']` on `/`.
- The four `best-practice` structure rules provably ran: every id in `['region','page-has-heading-one','landmark-one-main','heading-order']` appears in `passes` or `inapplicable`, none in `incomplete`, and `violations` is `[]`.
- The canvas carries its name: `page.getByRole('img', { name: /contribution/i })` resolves to an element whose `tagName` is `CANVAS`.
- The DEC-011 table is complete and payload-accurate: `td[data-day]` count equals `manifest.dayCount`, and the mid-window spot-check cell's `data-count` equals `grid.human[i] + grid.agent[i]` from `public/data/v1/grid.json` in the same run.
- The table is server-rendered with zero client JavaScript: `npm run build && npm start`, then `curl -s localhost:3000 | grep -c 'data-day='` returns `manifest.dayCount`, and `grep -c "use client" components/viz/ContributionTable.tsx` returns `0`.
- Reduced motion provably halts the sim: the whole `VizFrameInfo` from `window.__viz.inspect()`, `drawCalls` and `rngState` included, is deep-equal across five seconds of `page.clock.runFor`, and the test fails rather than skips if `window.__viz` is absent.
- WCAG 2.2.2 is proven in both directions: the frame info **changes** across two seconds before the pause control is activated, and is **unchanged** across five seconds after `Enter` on a focused `role=button` named `/pause|play/i`.
- `npx vitest run lib/viz/tokens/contrast.test.ts` passes, and its three negative controls pin `--gray`/`#1d2021` at 4.467, `--bg4`/`#1d2021` at 3.369 and `#1d2021`/`--purple-d` at 3.873, each asserted `< 4.5`. Temporarily adding `{ id: 'probe', fg: '#928374', bg: '#1d2021', px: 9, bold: false }` to `CANVAS_TEXT` turns the suite red; revert before committing.
- No forbidden fill reaches the renderer: `grep -rniE '#928374|#7c6f64|#b16286' lib/viz/render/` is empty, and the same assertion runs in the unit test with a non-vacuous file-count guard.
- No literal payload figure in the table: `grep -nE '4,?817|10,?001|13,?360|1,?826|2,?038|\b284\b|\b156\b|\b58\b' components/viz/ContributionTable.tsx` returns nothing, and the only numeric literals are the seven weekday indices, `7`, `86_400_000`, `0`, `1`, `2` and `10`.
- No sibling surface was touched: `git diff --name-only origin/main...HEAD -- app/ styles/ playwright.config.ts .github/ lib/viz/tokens/ramp.ts lib/viz/tokens/level.ts lib/viz/render/ components/ds/ components/viz/Overview.tsx components/viz/Ribbon.tsx components/viz/Gource.tsx` is empty.

### At-merge gate

- `ci-ok` is green on the exact PR head — the required status from KW-001's `.github/workflows/ci.yml`.
- `e2e-ok` is green on the exact PR head — KW-023's containerized context, inside `mcr.microsoft.com/playwright:v1.62.1-noble`. A green local run is not evidence: the container is the only environment whose font stack and Chromium build the gate is defined against.
- The PR body records the three axe run summaries (`passes` / `violations` / `incomplete` counts per scan) and the observed `manifest.dayCount` the table was checked against.
- No change to `package.json` or `package-lock.json` (DEC-003), and nothing under `app/`, `styles/`, `.github/`, `public/data/`, `components/ds/`, `lib/viz/render/` or any sibling `components/viz/*.tsx` was touched.
- Every assertion that failed during development and was resolved **outside** these three files is filed as a P1 rework against the owning ticket from the Invariant 1 table, linked from the PR body, and is green before merge. A gate made to pass by weakening its own assertions is a review-blocking defect.
- A reviewer confirms the scans are pinned as specified: the WCAG half tag-driven with no `disableRules` call anywhere in the file, the structure half rule-driven with the four ids verbatim.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. The one behaviour a human would otherwise check — that a screen reader reads the grid as text rather than silence — is covered by the `td[data-day]` count assertion plus the server-render `curl` check.

## Failure, security, migration, and accessibility cases

**Failure.** The dangerous failure is a false green, not a red run:

- **A scan that inspected nothing** — an `AxeBuilder` on a 404, or an `.exclude()` that swallowed the document. Caught by `results.passes.length > 0` and by requiring all four structure ids to have run.
- **Best-practice rules silently skipped**, because `region`, `page-has-heading-one` and `landmark-one-main` are not WCAG-tagged. Caught by the rule-pinned run and by asserting `incomplete` is empty.
- **A harness that is not there.** `__kwDebug?.cursorMs` compares `undefined` to `undefined` forever. Caught by `expect.poll(() => Boolean(window.__viz)).toBe(true)` before any read.
- **A sim that never started** — indistinguishable from "correctly halted" in the reduced-motion test alone. Caught by the pause test's `not.toEqual`.
- **`fastForward` instead of `runFor`** (C4/ci-testing §5.6, measured): it fires each due timer at most once, so rAF frames drop and a broken driver looks frozen.
- **The payload is missing.** The table renders `null` and the test fails on `expect(m.ok()).toBeTruthy()`. Never add a fallback.
- **A flaky axe run.** `playwright.config.ts` sets `retries: 0` (KW-023) on purpose. The fix for a genuine race is `document.fonts.ready` plus the reduced-motion project — never a retry.

**Security and privacy.** The spec makes only same-origin requests to the local server and reads two static JSON documents. Never give it `VERCEL_AUTOMATION_BYPASS_SECRET` or point it at a preview URL — C-22 disqualifies preview-based e2e as a gate. The DEC-011 table renders only per-day counts and dates: no repository name, organisation, employer or path. `grid.privateMonthly` is excluded; D-15's phone number, HG-5's email and every identity string live in `content/` and never reach this component. The three axe attachments are DOM snippets of a public page; nothing else is attached.

**Migration.** None. Three new files; no route, URL, cache-key or data migration. `public/data/v1/` is version-pathed by KW-012, so a future wire-format change lands as `v2/`, with `ContributionTableProps` moving alongside `GridSeries`.

**Accessibility.** This ticket *is* the accessibility surface, so the interesting cases are where doing accessibility work would make things worse:

- **The table is not announced** — no `aria-live`, `role="status"` or `role="log"`. `design-comp-spec` §9.5 calls an append-driven live log "a firehose"; `viz-runtime` §9.4 throttles the canvas `aria-label` to once per simulated week. A 1,826-cell live region is a denial of service.
- **The table is hidden by `.sr-only` and nothing else** — not `hidden`, `aria-hidden`, `display:none` or `<noscript>`, all of which remove it from the accessibility tree. axe treats `clip: rect(0 0 0 0)` as not visible on screen, so `color-contrast` skips it; preserving that is KW-003's.
- **1.4.11 non-text contrast is not satisfiable and is not asserted.** GT-15: a ten-step ramp needs 3⁹ = 19,683:1 and sRGB tops out at 21:1, so DEC-011's table is the conformance route.
- **Reduced motion is total, not slower** (`viz-runtime` §9.1): no rAF loop, one static frame at `tick = 0` through the same `renderFrame(0)` path. Deep equality of the whole frame struct is the only assertion that catches "the same animation, slower".
- **The pause control stays enabled under reduced motion** — a default, not a prohibition (`viz-runtime` §9.1). Never assert controls are disabled; only that they exist, are focusable, are named, and work.
- **Canvas text has no large-text exemption.** Measured `fillText` sizes are 9, 11, 13 and 20 px; only the 20 px bold banner clears 18.66 px bold, and it passes 4.5:1 anyway.
- **The scanline drag is real and invisible to axe** (`design-comp-spec` §9.2, `0.944`). The unit test asserts the canvas palette under it; the DOM half is GATE-007's, in KW-003.

## Surfaces

- Reads: `lib/viz/tokens/{ramp,level}.ts`, `lib/bundle/schema.ts`, `lib/viz/testHarness.ts`, `lib/viz/render/**`, `components/viz/{Ribbon,Gource}.tsx`, `app/regions/{Instrument,TransportBar,BootOverlay}.tsx`, `app/{page,layout}.tsx`, `playwright.config.ts`, `vitest.config.mts`, `package.json`, `tsconfig.json`, `public/data/v1/{manifest,grid}.json`, `docs/design/{kevinweaver.dev.dc.html,_ds/**}`, `docs/research/2026-07-31-{ci-testing,viz-runtime,design-comp-spec,decomposition-synthesis}.md`
- Writes: `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx`, `lib/viz/tokens/contrast.test.ts`
- Contracts: `components/viz/ContributionTable.tsx::ContributionTable`; the rendered `table[data-testid="contribution-table"]` DOM contract (`caption`, `th[scope]`, `td[data-day|data-count|data-level]`); the pinned axe rule set (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` by tag; `region`, `page-has-heading-one`, `landmark-one-main`, `heading-order` by id); the canvas-text colour policy in `lib/viz/tokens/contrast.test.ts`
- Safety: site-wide WCAG 2.2 A/AA conformance gate, canvas text-equivalent completeness against the published payload, `prefers-reduced-motion` halt, WCAG 2.2.2 pause affordance, canvas text contrast floor

## Sibling boundaries and open gates

**Open gates: none.** GATE-007 (HG-7, the scanline treatment) lands in **KW-003** and cannot change this outcome: the approved canvas-text palette clears AA under both candidate treatments (worst pair `--bg-h` on `--aqua-d`: 5.168 clean, 4.743 at `--scanline-opacity: .35`, 4.928 at `.20`), and the DOM-side pairs it affects are KW-003's criteria. GATE-002 (HG-2, `workflow` push scope) blocks KW-023 and KW-031 because they ship `.github/workflows/**`; this ticket ships none. GATE-003 (HG-3, `CONTRIB_TOKEN`) blocks the pipeline half that produces the payload — by wave 6, KW-028 has already committed a bundle, and this ticket must not regenerate one.

**Upstream, and what to do while it is unmerged.** Every entry is a hard or transitive dependency, so none should be missing. If one is, stop and report.

| Ticket | What this ticket consumes | Note |
|---|---|---|
| **KW-023** (hard) | `playwright.config.ts`, its `webServer` block, the `reduced-motion` project, `e2e-ok` | Never author a config; KW-030 and KW-031 share this one. |
| **KW-025** (hard) | the canvas `role="img"` + `aria-label`, and the `<ContributionTable>` mount | For the mount, see the three pickup states above. |
| **KW-026** (hard) | the transport bar's real `<button>` controls and the pause affordance | No WCAG 2.2.2 assertion is possible against `<span onClick>`. |
| **KW-016…KW-020** (hard) | the region subtrees the axe scan walks | Violations from unfinished regions are not this ticket's. |
| **KW-007** (transitive) | `level`, `bandLabel`, `BAND_LABELS`, `PANE_SURFACE` | Never reimplement the log2 ladder — DEC-009 forbids quantile binning and the boundaries are load-bearing. |
| **KW-012** (transitive) | `GridSeries`, `BundleMeta` — **type-only** | Never restate the wire shape locally; the axis flip is what a local copy gets wrong. |
| **KW-024** (via KW-025) | `window.__viz`, `inspect()`, `VizFrameInfo` | Never fall back to `__kwDebug`, which does not exist. |
| **KW-028** (transitive) | the committed `public/data/v1/**` bundle | Never run `npm run data:build`; never commit a fixture. |
| **KW-003** (transitive) | `.sr-only`, `.skip`, `:focus-visible` | The one exception to "stop": ship the table anyway (unstyled `.sr-only` renders it visibly — ugly, not a failure), fail the bypass-link test, file a P1 rework. Never add CSS. |

**Same-wave siblings whose write surfaces are off limits.** Wave 6 dispatches three gates in parallel, sharing `e2e/` by file, not by directory. **KW-030** owns `.size-limit.json`, `scripts/ci/check-first-load.mjs`, `e2e/lazy-island.spec.ts` and the Lighthouse CI accessibility/SEO hard gate at 1.0. **KW-031** owns `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, the snapshot block in `playwright.config.ts`, `.github/workflows/snapshots.yml`, the `-u`/`--update-snapshots=` argv guard (C-23) and the PAT-push rule for baselines. Never add an `a11y` assertion to either sibling's spec, or move an assertion out of `e2e/a11y.spec.ts` to "share setup" — a shared fixture would be a fourth write surface.

**Named residuals this ticket detects but does not close.**

- **KW-005 note 9, the `.skip` focus treatment**, handed here "in KW-003's file" — but this write surface is three files and DEC-005 forbids cross-file sweeps. Assert it in test 6; if it fails, file a P1 rework on KW-003 with the measured bounding box.
- **Canvas text colours in `lib/viz/render/**`** — detected by the unit test's source guard, remediated by a one-token swap in KW-022 per the Invariant 3 substitutions.
- **The fading `gource-file-label` alpha.** `MIN_LABEL_ALPHA = 0.66` is specified here and clamped in KW-022. If the renderer still fades to zero, the alpha-floor case fails and the rework is a `Math.max` in `lib/viz/render/graph.ts`.

**Downstream.** **KW-032** is the only ticket that depends on this one; its capstone verifies the assembled page against the live production deployment, requires all gates green, and will not re-open these files. `components/viz/ContributionTable.tsx` is the durable artefact — the spec and unit test are gates, but the table is the site's text equivalent, its no-JS fallback and, with KW-027's `/resume.txt` and `<noscript>`, its indexable content.
