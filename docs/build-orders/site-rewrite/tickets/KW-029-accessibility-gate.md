# KW-029 — Accessibility gate: axe conformance, canvas text equivalent, and reduced-motion proof

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Three small files and no new dependency, but the cost is knowing exactly what the tooling cannot see: axe-core 4.12.1 ships 105 rules and none of them is about canvas, so the three properties that matter most on this page are invisible to the scanner and each needs its own hand-written proof, in a different runner, against a different failure mode.

**Risk:** medium — this is a gate, so its failure mode is not a broken page but a false green: a scan that passes because it never looked. Contained by writing every assertion with an explicit negative control, by pinning the rule set rather than trusting the default, and by a write surface of three files that no sibling owns.

**Phase hint:** 6

**Depends on:** KW-016, KW-017, KW-018, KW-019, KW-020, KW-023, KW-025, KW-026

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-004, DEC-005, DEC-008, DEC-009, DEC-011

**Gates:** none

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`npx playwright test e2e/a11y.spec.ts` and `npx vitest run lib/viz/tokens/contrast.test.ts` are both green against the assembled page, and between them they prove four things a reviewer can check by reading one report: axe reports zero violations on `/` for `wcag2a`, `wcag2aa`, `wcag21a` and `wcag21aa`; a visually hidden `<table>` carries one cell for every day in the published window and every number in it matches `public/data/v1/grid.json`; a `prefers-reduced-motion: reduce` session advances the simulation by exactly zero ticks across five seconds of faked clock; and every colour pair the canvas paints text with clears 4.5:1 against the pane surface, asserted by a pure unit test that is itself proven to fail on a deliberately bad pair.

## Context and evidence

### The problem this ticket exists to solve, measured

Re-measured this session against `axe-core@4.12.1` and `@axe-core/playwright@4.12.1` (`npm view` + the published tarball, read with `axe.getRules()`):

| What | Measured | Consequence |
|---|---|---|
| Total rules in axe-core 4.12.1 | **105** | — |
| Rules mentioning canvas, in id or description | **0** | The synthesis's claim ("there is no canvas rule in the Deque 4.10 index") re-confirms at 4.12.1. A canvas is a black box to the scanner. |
| Rules that run under `['wcag2a','wcag2aa','wcag21a','wcag21aa']` | **69 of 105** | 36 rules — every `best-practice` and `experimental` rule — do **not** run under those four tags. |
| `region` | tags `['cat.keyboard','best-practice','RGAAv4','RGAA-9.2.1']` | **best-practice, not WCAG.** |
| `page-has-heading-one` | tags `['cat.semantics','best-practice']` | **best-practice, not WCAG.** |
| `landmark-one-main` | tags `['cat.semantics','best-practice']` | **best-practice, not WCAG.** |
| `html-has-lang` | tags include `wcag2a`, `wcag311` | Runs under the WCAG tags. |
| `role-img-alt` | tags include `wcag2a`, `wcag111` | This is the exact rule that catches `role="img"` with no accessible name. |
| `blink`, `marquee` | the only two rules tagged `wcag222` | Neither can see a `requestAnimationFrame` loop. |

**This corrects `docs/research/2026-07-31-ci-testing.md` §7.** That section names `html-has-lang`, `page-has-heading-one`, `region` and `landmark-one-main` in one breath as "cheap wins the design system will pass", and its sample spec asserts them with `.withTags(WCAG)` alone. Three of those four are `best-practice` and would silently never execute — the classic false green this ticket exists to prevent. They are asserted here in a **second** `AxeBuilder` run pinned with `.withRules([...])`, and the WCAG run stays tag-driven so a new axe release adds coverage rather than needing an allow-list edit.

### The three things that are invisible to the scanner, and who proves each

From the synthesis §5 entry for **KW-29**:

1. **The canvas has no accessible name and no contents.** `role="img"` plus `aria-label` is checkable by `role-img-alt`; the *contents* are not checkable by anything. **DEC-011** answers this with a visually hidden `<table>` that doubles as the SSR/no-JS fallback and the SEO surface. `docs/research/2026-07-31-viz-runtime.md` §9.4 specifies it: `<caption>`, one row per week, `<th scope="row">` week-of dates, cells reading `"2 November 2024: 12 contributions (level 4)"`, always in the DOM, never styled or animated. This ticket **builds** that table and asserts it matches the payload.
2. **Canvas-painted text contrast is unreachable by `color-contrast`.** axe reads computed CSS; text drawn with `ctx.fillText` has none. ci-testing §7 item 3 states the resolution plainly: a pure unit test over the token pairs the renderer uses. This ticket writes that test.
3. **`prefers-reduced-motion` and WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide) are not axe rules.** The only two `wcag222` rules are `blink` and `marquee`. Both are element checks; a rAF-driven canvas trips neither. This ticket asserts both behaviours in Playwright.

### Why this ticket verifies and does not sweep

**DEC-005** (synthesis D-05) partitions every same-wave ticket by file so `serializes_with` stays empty — **C-11** established that `serializes_with` is the one edge type aiur does *not* enforce at runtime, so a plan leaning on it is both slower and unsafe. The synthesis §8 records the direct consequence: *"A cross-cutting a11y sweep ticket and a cross-cutting mobile sweep ticket — DEC-005: both would touch every region file and serialize the two widest waves. Folded into each region's acceptance criteria, with only the global primitives in KW-003."*

So every region already owns its own semantics: KW-005 the heading outline, landmarks and bypass link; KW-003 the `:focus-visible` ring, `.sr-only`, `.skip` and the six-animation reduced-motion stop; KW-016 the pager's keyboard scrolling; KW-017 the commit-log semantics; KW-018 the `footer`/`contentinfo` and `progressbar` readouts; KW-019 accessible link names without `title=`; KW-020 the dialog semantics and focus restoration; KW-025 the canvas `role`/`aria-label`; KW-026 the control semantics and the pause affordance. **KW-029 asserts all of it and fixes none of it.** A failure outside this ticket's three files is a rework on the owning ticket, filed as P1, never a cross-file edit from here.

### Contrast ground truth, recomputed this session

Every ratio below was recomputed with the WCAG 2.x relative-luminance formula against the token values in `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css` (read on disk this session). `layers/pane.css:4` sets `.pane{background:var(--surface-pane)}` and `colors.css:22` aliases `--surface-pane:var(--bg-h)` = `#1d2021`, and `.pane-body` declares no background of its own — so **every canvas in a pane sits on `#1d2021`**, and the gource canvas paints that same value itself (comp:709, `g.fillStyle='#1d2021'; g.fillRect(0,0,W,H)`).

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

**Correction to the synthesis's own KW-29 pointer, which the agent must apply.** It reads *"`gray #928374` on `bg0 #282828` is ~4.4:1"*. Two numbers are conflated: `--gray` on `--bg0` is **4.016**, and it is `--gray` on `--bg-h` `#1d2021` that is **4.467**. Both are under 4.5, so the conclusion — `--gray` may not carry normal-size text — is unchanged and is the one this ticket pins. `design-comp-spec` C5 makes the same point in the other direction and its verdict is authoritative: `#1d2021` is the correct surface, and using `#282828` exaggerates failures rather than masking them.

**The scanline drag is invisible to axe, and matters here.** `design-comp-spec` §9.2 measured the overlay as `rgba(0,0,0,.16)` at `opacity:.35` with `mix-blend-mode:multiply`, i.e. a `1 − 0.16·0.35 = 0.944` multiplier on one of every three pixel rows. axe's `color-contrast` computes from the element's own computed colour and its background stack; an absolutely-positioned blend-mode sibling is in neither, so axe reports the clean ratio and never sees the drag. GATE-007 (HG-7) decides the treatment in **KW-003**, not here — but this ticket's unit test asserts the canvas-text palette under both the clean and the `.35` multiplier, and the measured result is that the approved palette clears AA in both regimes (worst approved pair `--bg-h` on `--aqua-d`: 5.168 clean, **4.743** under `.35`). GATE-007 therefore cannot block this ticket.

### Requirements this ticket serves

REQ-002 (the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file — this ticket is the proof that partitioning by file did not leave a hole between the regions); REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder, no invented employer, no hardcoded figure — the DEC-011 table is the text form of that claim and is asserted cell-by-cell against the payload); REQ-009 (the page carries a correct heading outline, landmark structure and bypass affordance — this ticket is where that requirement is finally measured rather than asserted).

### Plan-context navigation

All links pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- **Pack index:** `docs/build-orders/site-rewrite/README.md` (pack-relative `../README.md`) — authority map and the KW-01…KW-32 → `KW-001`…`KW-032` ordinal mapping.
- **Graph and wave analysis:** `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md` §5 "Ticket set", §6 "Wave diagram", "Verified topological levels", "Write-surface partition (proof of D-05)". This ticket is **wave 6 / level 6**, one of three gates, and it sits **on the critical path**: `KW-001 → KW-008 → KW-022 → KW-024 → KW-025 → KW-029 → KW-032`.
- **Decision registry:** `docs/build-orders/site-rewrite/03-technical-decisions.md` (pack-relative `../03-technical-decisions.md`), sourced from the synthesis §3 decision table D-01…D-17 and §4 human gates HG-1…HG-7. DEC-002, DEC-003, DEC-004, DEC-005, DEC-008, DEC-009 and DEC-011 are D-02, D-03, D-04, D-05, D-08, D-09 and D-11.
- **This ticket's upstream pointers:** the synthesis §5 entry **"KW-29 — Accessibility gate"**, expanded below in "Refreshable implementation notes".
- **Testing source of record:** `docs/research/2026-07-31-ci-testing.md` §7 "Accessibility testing", §5.4 `playwright.config.ts`, §4 `vitest.config.mts`, read together with its `## Verification corrections` C3 and C4 — where a correction contradicts the body, the correction wins. §7's rule-tag claim is corrected above by direct measurement of the shipped package.
- **Canvas a11y source of record:** `docs/research/2026-07-31-viz-runtime.md` §9.1–§9.4.
- **Contrast and semantics source of record:** `docs/research/2026-07-31-design-comp-spec.md` §9.1–§9.7 and its corrections C5, C6, C7.
- **Comp source of record:** `docs/design/kevinweaver.dev.dc.html` — canvas `fillText` sites at lines 554–558, 580–584, 595, 630–631, 709, 807–809, 818–822, 836–837, 844–845, 863–866. Per **C-30**, the named method or selector governs; if a line number has moved, find `drawOverview` / `drawRibbon` / `drawGraph` and read from there.

## Scope

- Author `e2e/a11y.spec.ts`: eight Playwright tests covering the WCAG tag scan, the pinned structure-rule scan, the canvas text equivalent, the reduced-motion halt, the WCAG 2.2.2 pause control, the bypass link, the boot overlay's dialog semantics, and the boot overlay's reduced-motion bypass.
- Author `components/viz/ContributionTable.tsx`: the DEC-011 visually hidden `<table>`, a synchronous server component with no `'use client'`, rendering one `<td>` per day in the published window with machine-checkable `data-day`, `data-count` and `data-level` attributes.
- Author `lib/viz/tokens/contrast.test.ts`: a Vitest `node`-project unit test that pins the permitted canvas-text colour pairs, asserts each against its WCAG threshold both clean and under the measured scanline multiplier, and proves the assertion has teeth with three negative controls.
- Attach the full axe JSON result to the Playwright report on every run, pass or fail, so a reviewer can read what was scanned rather than trusting that something was.
- Assert the two scans are non-vacuous: the WCAG run must report a non-zero `passes` count and the structure run must report all four pinned rules as `passes` or `inapplicable`, never `incomplete`.
- Guard `lib/viz/render/**` against the three forbidden fills (`#928374`, `#7c6f64`, `#b16286`) with a source read inside the unit test.

## Non-goals

- Editing any file under `app/regions/**`, `components/ds/**` or `components/viz/{Overview,Ribbon,Gource}.tsx` — KW-016 through KW-020, KW-025 and KW-026 own their region subtrees and this ticket asserts them from the outside.
- Editing `app/globals.css`, `styles/**`, or adding any CSS anywhere — KW-003 owns the entire stylesheet surface, including `.sr-only`, `.skip`, the `:focus-visible` ring and the reduced-motion stop.
- Closing KW-005's `.skip` residual. KW-005's implementation note 9 hands "a bypass link that satisfies WCAG 2.4.1 but is invisible to sighted keyboard users" to this ticket "in KW-003's file". That is outside this ticket's write surface as fixed by the synthesis and by DEC-005. This ticket **detects** it and files a P1 rework on KW-003; it does not edit a stylesheet.
- Editing `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/screenshot.css` or `.github/workflows/e2e.yml` — KW-023 owns the harness and the `e2e-ok` context.
- Editing `e2e/canvas.spec.ts` or anything under `e2e/__screenshots__/**` (KW-031), or `e2e/lazy-island.spec.ts` and `.size-limit.json` (KW-030).
- Editing `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts` or `test/viz/ramp-contrast.test.ts` — KW-007 owns the ramp data and its CIEDE2000 fixture. This ticket imports from them and never restates their values.
- Asserting an adjacent-level WCAG floor on the ramp. GT-15 proved it is arithmetically unsatisfiable (3⁹ = 19,683 required, sRGB maximum 21). KW-007 calls it "a forbidden assertion"; it stays forbidden here.
- Taking or comparing any screenshot — KW-031 owns visual regression, and a11y assertions must never be expressible as pixels.
- Running or configuring Lighthouse CI — KW-030 hard-gates the LHCI accessibility and SEO categories at 1.0.
- Adding a dependency or touching `package.json` / `package-lock.json` — DEC-003 freezes both after KW-001, which already pins `@axe-core/playwright@4.12.1`.
- Writing, regenerating or committing anything under `public/data/v1/**` — KW-014 produces it and KW-028's workflow commits it.
- Adding a new `aria-live` region anywhere. `design-comp-spec` §9.5 flags an append-driven live log as "a firehose"; the DEC-011 table is static text and is deliberately not announced.

## Existing owner and reuse target

None of the three files exists at `e664d73a195facd64db58ba10952170ff01b4772`. That commit is still the pre-rewrite Pages Router site — `pages/index.js`, `components/HomeHero.js`, `styles/globals.scss`, `yarn.lock` — with no `app/`, no `lib/`, no `e2e/` and no `components/viz/`. All three are created by this ticket, on top of a tree that eight upstream tickets have already built.

| Path | Status | Owner |
|---|---|---|
| `e2e/a11y.spec.ts` | created here | KW-029 |
| `components/viz/ContributionTable.tsx` | created here | KW-029 |
| `lib/viz/tokens/contrast.test.ts` | created here | KW-029 |

`lib/viz/tokens/contrast.test.ts` sits in a directory KW-007 owns (`lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts`) but is a distinct file, and KW-029 depends transitively on KW-007 through KW-025 → KW-024 → KW-022 → KW-007, so the ordering is hard. It is co-located rather than placed under `test/` on purpose: ci-testing §4's `vitest.config.mts` gives the `node` project `include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts']`, so a file at `lib/viz/tokens/contrast.test.ts` is picked up by `npx vitest run` with no config change — and config changes are KW-011's.

The symbols this ticket consumes, all created by named upstream tickets:

| Symbol | Module | Created by | Status at pickup |
|---|---|---|---|
| `level`, `bandLabel`, `Level`, `BAND_LABELS` | `lib/viz/tokens/level.ts` | **KW-007** (transitive dep) | must exist; if absent, stop |
| `PANE_SURFACE`, `LV` | `lib/viz/tokens/ramp.ts` | **KW-007** (transitive dep) | must exist; if absent, stop |
| `GridSeries`, `BundleMeta` (types only) | `lib/bundle/schema.ts` | **KW-012** (transitive dep) | must exist; if absent, stop |
| `VizFrameInfo`, `window.__viz` | `lib/viz/testHarness.ts` | **KW-024** (transitive dep, via KW-025) | must exist; if absent, stop |
| The `<ContributionTable>` mount | `components/viz/Ribbon.tsx` or `app/regions/Instrument.tsx` | **KW-025** (hard dep) | see the three pickup states below |
| `AxeBuilder` | `@axe-core/playwright@4.12.1` | **KW-001** (frozen devDependency) | must be in `package.json`; if absent, stop |
| `playwright.config.ts`, the `webServer` block, `e2e-ok` | KW-023 | **KW-023** (hard dep) | must exist; if absent, stop |
| `public/data/v1/{manifest,grid}.json` | KW-014, committed by KW-028 | **KW-028** (transitive dep) | must be present in the checkout |

**The mount seam, and the three states you may find it in.** KW-025's synthesis pointer reads *"Canvases get `role`/`aria-label` plus the D-11 hidden table"*, and the synthesis assigns `components/viz/ContributionTable.tsx` to this ticket alone. Run `grep -rn "ContributionTable" components/viz app/regions` at pickup:

1. **An import exists and resolves to a placeholder file.** Expected. Replace the file body wholesale, keeping the exported name and the props KW-025 already passes. This is the KW-005-stub pattern one level down.
2. **An import exists and the file does not.** Create it against the props KW-025 passes at the call site. (KW-025's branch would not have built in this state, so it is unlikely, but it is harmless.)
3. **No import anywhere, and the table markup is inlined inside `components/viz/Ribbon.tsx`.** Author `components/viz/ContributionTable.tsx` anyway as the canonical implementation, point `lib/viz/tokens/contrast.test.ts` and the e2e assertions at the rendered DOM (which is what the acceptance is written against), and **file a P1 rework on KW-025** to replace the inline markup with the import. Do **not** edit `Ribbon.tsx`, do not delete the inline markup, and do not ship two tables — if a second `table[data-testid="contribution-table"]` would appear, keep KW-025's and mark yours unmounted until the rework lands.

If `lib/viz/tokens/level.ts`, `lib/bundle/schema.ts`, `lib/viz/testHarness.ts` or `playwright.config.ts` is missing on the base branch, an upstream ticket has not merged. **Stop and report — do not create any of them.** Each is a contract that between two and eight other tickets already build against, and a local copy forks it.

## Contract and invariants

### Invariant 1 — this gate verifies; it never sweeps

Every assertion in this ticket either passes, or fails and names the ticket that owns the fix. There is no third option and no cross-file edit. The remediation map is fixed in advance so a failing run is a one-line rework, not an investigation:

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
| Dialog semantics, Esc, focus restoration on the boot overlay | KW-020 | `app/regions/BootOverlay.tsx` |
| The simulation advances under reduced motion | KW-024 | `lib/viz/driver.ts` |
| A forbidden fill appears in `lib/viz/render/**` | KW-022 | token swap per the table in Invariant 3 |

### Invariant 2 — the scan is pinned in two halves, and both halves are proven non-vacuous

```ts
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] as const

// Measured: these four are tagged `best-practice`, NOT wcag*, so .withTags(WCAG_TAGS)
// never runs them. ci-testing §7 names three of them as if the tag scan covered them.
const STRUCTURE_RULES = ['region', 'page-has-heading-one', 'landmark-one-main', 'heading-order'] as const
```

The tag run stays tag-driven so a future axe release adds coverage automatically. The rule run is explicitly pinned because a best-practice rule is opt-in forever. Both runs assert `violations` is `[]`, and both additionally assert they were **not vacuous**: the tag run must report `results.passes.length > 0`, and the rule run must report every id in `STRUCTURE_RULES` present in `passes` or `inapplicable` and none of them in `incomplete`. A scan that inspected nothing is the failure this ticket is most likely to ship, and it is the one nobody notices.

**No `.exclude()` is used, and no selector is invented.** ci-testing §7's sample excludes `#gource-surface *`. A `<canvas>` element exposes no accessibility subtree at all, so there is nothing under it to exclude; the element itself must still be scanned, because `role-img-alt` is the rule that catches an unnamed canvas. Every locator in this spec is a role or an accessible-name query, or the one `data-testid` this ticket owns.

### Invariant 3 — the canvas-text colour policy

Canvas text does not inherit CSS and is not reachable by `color-contrast` (`design-comp-spec` §5.5, ci-testing §7 item 3). Every glyph the renderer paints is 9 px, 11 px or 13 px except one 20 px bold banner, so **the normal-text threshold of 4.5:1 applies to all of it** — there is no large-text exemption to claim below 18.66 px bold / 24 px regular. The permitted set, with the comp site each entry replaces and the ratio recomputed this session against `--bg-h #1d2021`:

| id | Foreground | Background | Size | Clean | Under `.35` scanline | Comp site (and what it was) |
|---|---|---|---|---|---|---|
| `overview-year` | `--fg4 #a89984` | `--bg-h` | 9 px 700 | 5.898 | 5.399 | comp:558 — was `--gray`, **4.467 ❌** |
| `ribbon-weekday` | `--fg4 #a89984` | `--bg-h` | 9 px 600 | 5.898 | 5.399 | comp:583-584 — was `--bg4`, **3.369 ❌** |
| `ribbon-month` | `--fg4 #a89984` | `--bg-h` | 9 px 600 | 5.898 | 5.399 | comp:595 — was `--gray`, **4.467 ❌** |
| `ribbon-agent-marker` | `--purple #d3869b` | `--bg-h` | 9 px 800 | 5.975 | 5.453 | comp:630-631 — unchanged ✅ |
| `gource-file-label` | `--fg2 #d5c4a1` at α ≥ `MIN_LABEL_ALPHA` | `--bg-h` | 9 px 600 | 4.538 at α 0.62 | 4.5 at α 0.656 | comp:807-809 — `rgba(213,196,161, heat−0.35)` fades **through** the threshold |
| `gource-repo-label` | `--fg4 #a89984` | `--bg-h` | 11 px 600 | 5.898 | 5.399 | comp:818-821 — unchanged ✅ |
| `gource-repo-label-focus` | `--fg0 #fbf1c7` | `--bg-h` | 13 px 800 | 14.451 | 13.118 | comp:818-821 — unchanged ✅ |
| `gource-repo-label-private` | `--fg4 #a89984` | `--bg-h` | 11 px 600 | 5.898 | 5.399 | comp:820 — was `--gray`, **4.467 ❌** |
| `gource-star-count` | `--fg4 #a89984` | `--bg-h` | 9 px 700 | 5.898 | 5.399 | comp:822 — was `--bg4`, **3.369 ❌** |
| `actor-disc-human` | `--bg-h #1d2021` | `--aqua-d #689d6a` | 9 px 800 | 5.168 | 4.743 | comp:834-837 — unchanged ✅ |
| `actor-disc-agent` | `--bg-h #1d2021` | `--purple #d3869b` | 9 px 800 | 5.975 | 5.453 | comp:840-845 — disc fill was `--purple-d`, **3.873 ❌** |
| `agent-init-banner` | `--purple #d3869b` | `--bg-h` | 20 px 800 | 5.975 | 5.453 | comp:863-864 — unchanged ✅ |
| `agent-init-subline` | `--fg4 #a89984` | `--bg-h` | 11 px 600 | 5.898 | 5.399 | comp:865-866 — unchanged ✅ |

Three fills are **forbidden as a canvas text foreground or as the background behind canvas text**, permanently:

| Forbidden | Ratio on the pane surface | Substitute |
|---|---|---|
| `--gray #928374` | 4.467 | `--fg4 #a89984` (5.898) |
| `--bg4 #7c6f64` | 3.369 | `--fg4 #a89984` (5.898) |
| `--purple-d #b16286` as a disc fill under `--bg-h` text | 3.873 | `--purple #d3869b` (5.975) |

`--gray` is not banned from the codebase — it is banned from carrying normal-size text. `layers/pane.css` uses it for the `.ph` placeholder stripe and `colors.css` aliases it as `--text-comment`; both are non-text or decorative uses that this test does not police.

`MIN_LABEL_ALPHA` is **0.66**, derived by bisection this session: the minimum alpha at which `rgba(213,196,161,α)` composited over `#1d2021` clears 4.5:1 is 0.6189 clean and 0.6555 under the `.35` scanline, so 0.66 clears both with margin. The comp starts the fade at `heat − 0.35` = 0.65 and decays to zero, which walks the label straight through the AA threshold; the fix is a clamp, and it belongs to KW-022.

### Invariant 4 — the DEC-011 table is a server-rendered artefact with three jobs

It is the accessible text equivalent, the `<noscript>`/no-JS fallback and the SEO surface — `viz-runtime` §9.4's "one artefact, three jobs". Therefore:

- **No `'use client'` in `components/viz/ContributionTable.tsx`.** Under DEC-002 (App Router, RSC, no `output:'export'`) a synchronous server component costs zero client JavaScript, and `curl -s localhost:3000 | grep -c 'data-day='` must return the full day count. A client component would put ~1,830 table rows behind hydration and defeat all three jobs at once.
- **It is always in the DOM**, never conditionally rendered, never inside a `<noscript>`, never `hidden`, never `aria-hidden`. It is hidden visually by KW-003's `.sr-only` and by nothing else. `viz-runtime` §9.4 justifies the node count: "1,826 `<td>` elements is 1,826 nodes — acceptable *because they are never styled or animated*."
- **It renders nothing when the payload is absent.** `dayCount === 0`, a length mismatch between `dayCount` and the series, or a missing prop returns `null`. It never renders a partial or padded table, because a wrong text equivalent is worse than none.
- **No figure is a literal (DEC-008).** Every count, every date and the caption's totals derive from the props. The comp's `4,817 / 284 / 17 / 156 / 1,826` and content-ia §9's `10,001 / 2,038 / 375 / 58` are forbidden in this file, and each has already been measured wrong at least once (C-1, C-4, C-20).

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

KW-007's own contract names this ticket as a consumer and says each consumer "quotes the sketch below verbatim rather than restating the values". `bandLabel` exists specifically for this table — use it, do not format band ranges here.

```ts
// lib/bundle/schema.ts — owned by KW-012. TYPE-ONLY import; nothing is pulled at runtime.
export type IsoDay = string;     // 'YYYY-MM-DD'
export type IsoSecond = string;  // 'YYYY-MM-DDTHH:MM:SSZ', second resolution, always 'Z'

export interface BundleMeta {
  v: typeof BUNDLE_VERSION;
  generatedAt: IsoSecond;
  commit: string;
  windowStart: IsoDay;             // oldest day in the window
  windowEnd: IsoDay;               // newest day in the window; this is day index 0
  dayCount: number;                // inclusive
  repoCount: number;
  repoCountDefinition: RepoCountDefinition;
  actors: readonly Actor[];
  degraded: readonly string[];
}

/** grid.json. NOTE the axis flip: grid arrays run FORWARD in time from `start`. */
export interface GridSeries {
  start: IsoDay;                       // OLDEST day — NOT windowEnd
  dayCount: number;                    // must equal BundleMeta.dayCount
  human: readonly number[];            // actors[0] daily contributionCount, length dayCount
  agent: readonly number[];            // actors[1] daily contributionCount, length dayCount
  privateMonthly: readonly number[];   // restrictedContributionsCount, MONTHLY buckets
  privateStart: IsoMonth;              // e.g. '2021-01'
  bands: readonly number[];            // length BAND_COUNT; values owned by KW-007
}
```

**The axis flip is the trap.** `GridSeries.start` is the **oldest** day and `human`/`agent` run forward in time from it, while `BundleEvent.day` indexes 0 as `windowEnd` and increases into the past. This table only ever walks forward from `start`. Do not copy an index convention out of `lib/viz/**`.

```ts
// lib/viz/testHarness.ts — owned by KW-024, exposed on window behind `?viz-test=1`
export interface VizFrameInfo {
  date: string
  liveRepos: readonly string[]
  highlightCell: number | null
  rngState: number
  drawCalls: number
}
// window.__viz: { pause, reset, renderFrame, seekTick, seekDate, inspect, setQuality }
```

`inspect()` returns `VizFrameInfo`; each harness command awaits a `getImageData` rasterization flush so Playwright cannot race the command buffer. KW-024 is not a direct dependency of this ticket, but KW-025 is, and KW-025 depends on KW-024 — so the harness is guaranteed present at pickup. If the exported type name differs at pickup, declare the same structural type locally in the spec rather than editing `lib/viz/testHarness.ts`.

**Do not use `window.__kwDebug`.** ci-testing §7's sample reduced-motion test reads `(window as any).__kwDebug?.cursorMs`. That name predates the KW-024 contract and does not exist; worse, the optional chain makes the test pass silently when the harness is absent, comparing `undefined` to `undefined`. The synthesis's `window.__viz` / `inspect()` shape is authoritative, and this spec asserts the harness is present before reading it.

### Producer interface this ticket owns

```ts
// components/viz/ContributionTable.tsx
import type { BundleMeta, GridSeries } from '@/lib/bundle/schema'

export interface ContributionTableProps {
  /** The decoded grid series. Comes from KW-015's `boot()` -> `BundleHead.grid`. */
  grid: GridSeries
  /** Window metadata. Comes from KW-015's `boot()` -> `BundleHead.manifest`. */
  meta: Pick<BundleMeta, 'windowStart' | 'windowEnd' | 'dayCount' | 'generatedAt'>
  /** Element id for the <table>, so a sibling can point aria-describedby at it. */
  id?: string
  /** Appended to `sr-only`; never replaces it. */
  className?: string
}

export function ContributionTable(props: ContributionTableProps): ReactNode
```

That named export is the entire public surface. No default export, no second export, no `'use client'`.

The rendered DOM contract, which the e2e assertions quote and which KW-025 must not reshape:

```html
<table id="contribution-table" class="sr-only" data-testid="contribution-table">
  <caption>Contributions by day, 1 August 2021 – 31 July 2026. 10,001 contributions across 1,826 days.</caption>
  <thead>
    <tr>
      <th scope="col">Week</th>
      <th scope="col">Sunday</th><th scope="col">Monday</th><th scope="col">Tuesday</th>
      <th scope="col">Wednesday</th><th scope="col">Thursday</th><th scope="col">Friday</th>
      <th scope="col">Saturday</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Week of 31 October 2021</th>
      <td></td>
      <td data-day="2021-11-01" data-count="12" data-level="4">1 November 2021: 12 contributions (level 4, band 8–15)</td>
      <!-- … six more … -->
    </tr>
  </tbody>
</table>
```

Four properties of that markup are load-bearing:

1. **`data-day` is the assertion seam.** `page.locator('[data-testid="contribution-table"] td[data-day]')` must count exactly `meta.dayCount`. Padding cells at the head of the first week and the tail of the last carry no `data-*` attributes and are empty, so they are excluded by the attribute selector and cannot inflate the count. At most 12 padding cells exist.
2. **Row headers and column headers both exist**, so axe's `th-has-data-cells`, `td-has-header` and `td-headers-attr` (all `wcag2a`/`wcag131`, all in the 69-rule WCAG set) pass without `headers`/`id` wiring. A `<caption>` is present, so `table-fake-caption` cannot fire.
3. **Cell text is a whole sentence, not a number.** A screen reader reading a bare "12" out of a 1,826-cell grid learns nothing; the date, the count and the band label together are the text equivalent WCAG 1.4.11 needs, which GT-15 proved no ten-step ramp can supply through colour.
4. **Dates are UTC-pinned and rendered in one locale.** `Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })`. The default locale renders `November 1, 2021` for a US visitor and `01/11/2021` elsewhere, and the default time zone moves days across boundaries west of UTC — which would make the e2e assertion pass locally and fail in the container, or vice versa.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-read the cited files at pickup; if a comp line number has moved, the named method still governs (C-30, selector first, line number second).

### Step 0 — verify the base

```bash
test -f playwright.config.ts && test -f e2e/smoke.spec.ts                 # KW-023 merged
test -f lib/viz/tokens/level.ts && test -f lib/viz/tokens/ramp.ts         # KW-007 merged
test -f lib/bundle/schema.ts                                             # KW-012 merged
test -f lib/viz/testHarness.ts && test -f lib/viz/driver.ts               # KW-024 merged
test -f app/regions/Instrument.tsx && test -f app/regions/TransportBar.tsx # KW-025, KW-026 merged
test -f public/data/v1/manifest.json && test -f public/data/v1/grid.json  # KW-028 committed the bundle
grep -n '"@axe-core/playwright"' package.json                            # KW-001 froze it in at 4.12.1
grep -rn "ContributionTable" components/viz app/regions                  # which mount state are you in?
grep -n "lib/\*\*/\*.test.ts" vitest.config.mts                          # the node project picks up co-located tests
npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build
```

The build must be green **before** you change anything. Any missing file above means an upstream ticket has not merged: stop and report. If `@axe-core/playwright` is absent from `package.json`, that is an upstream defect in KW-001's frozen dependency set — **stop and report; do not `npm install` it.** DEC-003 freezes both manifests after KW-001 and a lockfile edit from wave 6 poisons every other agent's prewarm.

The payload is **committed to the repository** by KW-028's daily workflow. Do not run `npm run data:build` to produce it: that path needs `CONTRIB_TOKEN` (GATE-003), and regenerating it here would put a `public/data/v1/**` diff in this PR, which is KW-014's write surface and this ticket's declared safety surface.

### The three files to create

```
e2e/a11y.spec.ts                        (new)
components/viz/ContributionTable.tsx    (new, or replaces KW-025's placeholder — see mount states)
lib/viz/tokens/contrast.test.ts         (new)
```

Nothing else. Not `playwright.config.ts`, not a stylesheet, not a region, not a workflow, not `package.json`.

### Step 1 — `components/viz/ContributionTable.tsx`

```tsx
import type { ReactNode } from 'react'

import type { BundleMeta, GridSeries } from '@/lib/bundle/schema'
import { bandLabel, level } from '@/lib/viz/tokens/level'

export interface ContributionTableProps {
  grid: GridSeries
  meta: Pick<BundleMeta, 'windowStart' | 'windowEnd' | 'dayCount' | 'generatedAt'>
  id?: string
  className?: string
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** UTC-pinned, one locale, everywhere. See Invariant 4 property 4. */
const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
})
const NUM = new Intl.NumberFormat('en-US')

/** '2021-11-01' -> epoch-day integer. No Date arithmetic on local time, ever. */
function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function addDays(base: Date, n: number): Date {
  return new Date(base.getTime() + n * 86_400_000)
}
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function dayLabel(d: Date): string {
  return DAY_FMT.format(d)
}

export function ContributionTable({ grid, meta, id, className }: ContributionTableProps): ReactNode {
  // Fail closed. A wrong text equivalent is worse than none.
  if (
    !grid || !meta ||
    grid.dayCount !== meta.dayCount ||
    grid.dayCount <= 0 ||
    grid.human.length !== grid.dayCount ||
    grid.agent.length !== grid.dayCount
  ) {
    return null
  }

  const start = toUtcDate(grid.start)
  const leading = start.getUTCDay()                       // 0..6 padding cells before day 0
  const total = leading + grid.dayCount
  const weeks = Math.ceil(total / 7)

  let sum = 0
  for (let i = 0; i < grid.dayCount; i += 1) sum += grid.human[i] + grid.agent[i]

  return (
    <table id={id} data-testid="contribution-table" className={['sr-only', className].filter(Boolean).join(' ')}>
      <caption>
        {`Contributions by day, ${dayLabel(toUtcDate(meta.windowStart))} – ${dayLabel(toUtcDate(meta.windowEnd))}. `}
        {`${NUM.format(sum)} contributions across ${NUM.format(grid.dayCount)} days.`}
      </caption>
      <thead>
        <tr>
          <th scope="col">Week</th>
          {WEEKDAYS.map((w) => <th key={w} scope="col">{w}</th>)}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: weeks }, (_, w) => {
          const weekStart = addDays(start, w * 7 - leading)
          return (
            <tr key={isoDay(weekStart)}>
              <th scope="row">{`Week of ${dayLabel(weekStart)}`}</th>
              {WEEKDAYS.map((name, k) => {
                const i = w * 7 + k - leading
                if (i < 0 || i >= grid.dayCount) return <td key={name} />
                const day = addDays(start, i)
                const count = grid.human[i] + grid.agent[i]
                const lv = level(count)
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

Five things in that file are deliberate:

1. **`leading = start.getUTCDay()`** aligns the first row to a Sunday so `<th scope="row">Week of …</th>` is honest. Padding cells are bare `<td />` with no `data-*`, which is what keeps `td[data-day]` an exact count of `dayCount`.
2. **`level()` and `bandLabel()` are imported, never reimplemented.** KW-007 owns the log2 ladder; DEC-009 says quantile binning provably fails because a large mass of days sit at exactly 1 contribution.
3. **`grid.human[i] + grid.agent[i]` is the combined count**, matching the single combined-actor grid ramp DEC-009 specifies. `grid.privateMonthly` is deliberately **not** in the table: it is a monthly aggregate with no per-day resolution, and content-ia §11.5 requires it be labelled as a count and never associated with an organisation.
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

function channel(hex: string, i: number): number {
  return Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
}
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
function underScanline(hex: string): string {
  return `#${[0, 1, 2].map((i) => Math.round(channel(hex, i) * SCANLINE_MULTIPLIER).toString(16).padStart(2, '0')).join('')}`
}
function composite(fg: string, alpha: number, bg: string): string {
  return `#${[0, 1, 2]
    .map((i) => Math.round(channel(fg, i) * alpha + channel(bg, i) * (1 - alpha)).toString(16).padStart(2, '0'))
    .join('')}`
}

interface CanvasTextPair {
  readonly id: string
  readonly fg: string
  readonly bg: string
  readonly px: number
  readonly bold: boolean
  readonly where: string
}

/** WCAG large text: >= 24px, or >= 18.66px bold. Everything else is 4.5:1. */
function threshold(p: CanvasTextPair): number {
  return p.px >= 24 || (p.bold && p.px >= 18.66) ? AA_LARGE : AA_NORMAL
}

const FORBIDDEN_FILLS = ['#928374', '#7c6f64', '#b16286'] as const

const CANVAS_TEXT: readonly CanvasTextPair[] = [ /* the 13 rows of Invariant 3 */ ]
```

The suite, six blocks:

```ts
describe('canvas text contrast (axe cannot see any of this)', () => {
  it.each(CANVAS_TEXT)('$id clears its WCAG threshold on a clean surface', (p) => {
    expect(contrastRatio(p.fg, p.bg)).toBeGreaterThanOrEqual(threshold(p))
  })

  it.each(CANVAS_TEXT)('$id still clears under the .35 scanline', (p) => {
    expect(contrastRatio(underScanline(p.fg), underScanline(p.bg))).toBeGreaterThanOrEqual(threshold(p))
  })

  // Negative controls: the assertion above is worthless unless these three fail the same check.
  it.each([
    ['--gray on the pane surface', '#928374', PANE_SURFACE, 4.467],
    ['--bg4 on the pane surface', '#7c6f64', PANE_SURFACE, 3.369],
    ['pane-surface text on --purple-d', PANE_SURFACE, '#b16286', 3.873],
  ])('%s is below AA and is therefore forbidden', (_n, fg, bg, expected) => {
    expect(contrastRatio(fg, bg)).toBeCloseTo(expected, 3)
    expect(contrastRatio(fg, bg)).toBeLessThan(AA_NORMAL)
  })

  it('pins the formula itself', () => {
    expect(contrastRatio('#a89984', '#1d2021')).toBeCloseTo(5.898, 3)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(PANE_SURFACE).toBe('#1d2021')                 // the KW-007 anchor
  })

  it('the fading gource file label is clamped above the threshold', () => {
    expect(contrastRatio(composite('#d5c4a1', MIN_LABEL_ALPHA, PANE_SURFACE), PANE_SURFACE))
      .toBeGreaterThanOrEqual(AA_NORMAL)
    expect(contrastRatio(
      underScanline(composite('#d5c4a1', MIN_LABEL_ALPHA, PANE_SURFACE)), underScanline(PANE_SURFACE),
    )).toBeGreaterThanOrEqual(AA_NORMAL)
    // The comp's own starting alpha is 0.65 and it decays to 0 — it walks through the floor.
    expect(contrastRatio(composite('#d5c4a1', 0.5, PANE_SURFACE), PANE_SURFACE)).toBeLessThan(AA_NORMAL)
  })

  it('no forbidden fill appears anywhere in lib/viz/render', () => {
    const dir = join(process.cwd(), 'lib/viz/render')
    const sources = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    expect(sources.length).toBeGreaterThan(0)             // non-vacuous
    for (const file of sources) {
      const text = readFileSync(join(dir, file), 'utf8').toLowerCase()
      for (const fill of FORBIDDEN_FILLS) {
        expect(text, `${file} paints with ${fill}`).not.toContain(fill)
      }
    }
  })
})
```

`toBeCloseTo(expected, 3)` on the negative controls is what makes this a *regression* test and not a tautology: if someone "fixes" the failure by loosening `contrastRatio`, the pinned values move and the suite goes red. Do **not** replace them with `toBeLessThan` alone.

**Do not add a CIEDE2000 assertion, an adjacent-level ramp assertion, or a `LV` monotonicity assertion here.** All three belong to `test/viz/ramp-contrast.test.ts` (KW-007), and the adjacent-WCAG form is forbidden outright by GT-15.

### Step 3 — `e2e/a11y.spec.ts`

```ts
import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']
/** Measured: all four are `best-practice`, so .withTags(WCAG_TAGS) never runs them. */
const STRUCTURE_RULES = ['region', 'page-has-heading-one', 'landmark-one-main', 'heading-order']

interface VizFrameInfo {
  date: string
  liveRepos: readonly string[]
  highlightCell: number | null
  rngState: number
  drawCalls: number
}
declare global {
  interface Window { __viz?: { inspect(): VizFrameInfo } }
}

async function readPayload(page: Page) {
  const [m, g] = await Promise.all([
    page.request.get('/data/v1/manifest.json'),
    page.request.get('/data/v1/grid.json'),
  ])
  expect(m.ok(), 'manifest.json must be committed by KW-028').toBeTruthy()
  expect(g.ok(), 'grid.json must be committed by KW-028').toBeTruthy()
  return { manifest: await m.json(), grid: await g.json() }
}
```

Eight tests, in this order. Tests 1 and 2 are the two `AxeBuilder` runs in the block above; tests 3 through 8 follow:

```ts
test.describe('axe', () => {
  // Scan a stopped page: axe's own DOM traversal must not race the rAF loop (ci-testing §7).
  test.use({ reducedMotion: 'reduce' })

  test('no WCAG A/AA violations on / @a11y', async ({ page }, testInfo) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    await testInfo.attach('axe-wcag', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
    expect(results.violations).toEqual([])
    expect(results.passes.length, 'a scan that inspected nothing is not a pass').toBeGreaterThan(0)
  })

  test('page structure rules pass @a11y', async ({ page }, testInfo) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze()
    await testInfo.attach('axe-structure', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
    expect(results.violations).toEqual([])
    const seen = new Set([...results.passes, ...results.inapplicable].map((r) => r.id))
    for (const id of STRUCTURE_RULES) expect(seen, `${id} did not run`).toContain(id)
    expect(results.incomplete).toEqual([])
  })
})
```

3. **`canvas exposes a name and a real text equivalent @a11y`** — under reduced motion, on `/`:
   - `await expect(page.getByRole('img', { name: /contribution/i })).toBeVisible()` and assert `evaluate(el => el.tagName)` is `CANVAS`, so a real `<canvas>` is what carries the name.
   - `const table = page.getByTestId('contribution-table')`; assert `table.locator('caption')` matches `/contributions by day/i`; assert `table.locator('td[data-day]')` has count exactly `manifest.dayCount`.
   - Spot-check the payload: pick `i = Math.floor(grid.dayCount / 2)`, compute the ISO day by adding `i` days to `grid.start` in UTC, and assert that cell's `data-count` equals `grid.human[i] + grid.agent[i]` and its text contains the formatted count. **One cell checked exactly beats 1,826 checked loosely.**
   - Assert the table is server-rendered: `expect((await page.request.get('/')).text()).resolves.toContain('data-day=')`.

4. **`reduced motion halts the simulation @a11y`** — this is the only test that uses the harness:
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
   `runFor`, never `fastForward` — C4/ci-testing §5.6: `fastForward` fires each timer at most once and therefore drops rAF frames, which would make this test pass for the wrong reason. Asserting the whole `VizFrameInfo` (not just `date`) proves `drawCalls` and `rngState` are frozen too, i.e. the driver did not repaint. The `expect.poll` on `window.__viz` is what stops the test passing vacuously when the harness is absent.

5. **`WCAG 2.2.2 — playback can be paused from the keyboard @a11y`**:
```ts
test('a pause control exists and stops the animation @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()
  await page.goto('/?viz-test=1')
  await expect.poll(() => page.evaluate(() => Boolean(window.__viz))).toBe(true)
  const control = page.getByRole('button', { name: /pause|play/i })
  await expect(control).toBeVisible()
  await page.clock.runFor(2000)
  const moving = await page.evaluate(() => window.__viz!.inspect())
  await page.clock.runFor(2000)
  expect(await page.evaluate(() => window.__viz!.inspect())).not.toEqual(moving)  // it really is animating
  await control.focus()
  await expect(control).toBeFocused()
  await page.keyboard.press('Enter')
  await page.clock.runFor(1000)
  const paused = await page.evaluate(() => window.__viz!.inspect())
  await page.clock.runFor(5000)
  expect(await page.evaluate(() => window.__viz!.inspect())).toEqual(paused)
})
```
   The `not.toEqual` step is the negative control: without it, a driver that never starts would pass this test. `Enter` rather than `Space` because KW-026 scopes `Space` to the transport region and the comp's unconditional window-level `preventDefault` (comp:478-482) is exactly what KW-026 deletes — a test that depends on `Space` reaching the button would encode the bug.

6. **`the bypass link is the first tab stop and is visible when focused @a11y`** — on `/`, `page.keyboard.press('Tab')`, assert the focused element's accessible name matches `/skip/i` and its `href` is `#whoami`, then read `boundingBox()` while focused and assert `width > 40 && height > 12`. axe's `bypass` rule (`wcag2a`, `wcag241`) covers presence; nothing in axe covers *visible on focus*, and KW-005 note 9 explicitly names that residual. If this fails, the fix is KW-003's `.skip:focus-visible` rule — file a P1 rework, do not add CSS here.

7. **`the boot overlay is a real dialog @a11y`**:
```ts
test('boot overlay dialog semantics @a11y', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install()                       // freezes the 100ms cadence and the 2200ms kill timer
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  if (await dialog.count() === 0) test.skip(true, 'no payload -> KW-020 fails closed by design')
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog).toHaveAccessibleName(/cold start/i)
  await expect(page.getByRole('button', { name: /skip/i })).toBeFocused()
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  await testInfo.attach('axe-boot', { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
  expect(results.violations).toEqual([])
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
})
```
   KW-020 renders `null` whenever the payload is unreadable, so `count() === 0` is a legitimate state and `test.skip` is correct there — but only there. Do not wrap any other assertion in a conditional.

8. **`reduced motion suppresses the boot overlay entirely @a11y`** — `emulateMedia({ reducedMotion: 'reduce' })`, clear `sessionStorage`, `goto('/')`, assert `getByRole('dialog')` has count 0 **and** that no request to `/data/v1/manifest.json` was issued from the overlay path (`page.on('request', …)` collected before `goto`). KW-020's contract is that reduced motion is checked *before* the fetch; this is the assertion that keeps it true.

### Worked fixture

Serve this pair from `public/data/v1/` locally to develop the table against — **do not commit it**; `public/data/v1/**` is KW-014's write surface and this ticket's declared safety surface. Restore the committed bundle with `git checkout -- public/data/v1` before opening the PR.

```jsonc
// manifest.json (only the fields this ticket reads)
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

`2021-11-01` is a Monday, so `leading = 1` and the table is exactly **3 rows** (1 padding cell + 14 days + 6 trailing padding cells = 21 = 3 × 7). Daily totals are `[3,0,1,11,5,0,0, 2,2,0,0,1,0,12]`, summing to **37**. The rendered output must be byte-identical to:

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
row 2 header: Week of 7 November 2021
  Sunday    7 November 2021: 0 contributions (level 0, band 0)
  …
  Saturday  13 November 2021: 0 contributions (level 0, band 0)
row 3 header: Week of 14 November 2021
  Sunday    14 November 2021: 12 contributions (level 4, band 8–15)
  Monday .. Saturday (empty, no data-day)
```

`td[data-day]` count is **14**, empty `<td>` count is **7**. Note the singular "1 contribution" on 3 November and the EN DASH `–` in `2–3` and `8–15`, which comes from `BAND_LABELS` — do not retype it as a hyphen.

### Exact commands

```bash
npx vitest run lib/viz/tokens/contrast.test.ts
npm run build && npx playwright test e2e/a11y.spec.ts --project=reduced-motion
npx playwright test e2e/a11y.spec.ts                       # every project that matches the file
npx playwright show-report                                 # read the three attached axe JSON blobs
```

### Version pins

`@axe-core/playwright@4.12.1` (depends on `axe-core@~4.12.1`, peer `playwright-core >= 1.0.0`), `@playwright/test@1.62.1`, `vitest@4.1.10`, `next@16.2.12`, `react@19.2.8` — all installed by KW-001 and all re-confirmed on the npm registry this session. The e2e container is `mcr.microsoft.com/playwright:v1.62.1-noble`, pinned by KW-023. **Add nothing** (DEC-003).

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green, and `npx prettier --check e2e/a11y.spec.ts components/viz/ContributionTable.tsx lib/viz/tokens/contrast.test.ts` reports no drift.
- `git diff --name-only origin/main...HEAD` lists exactly three paths — `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx`, `lib/viz/tokens/contrast.test.ts` — and `package.json`, `package-lock.json` and everything under `public/data/v1/` are byte-identical to `main`.
- `npx playwright test e2e/a11y.spec.ts` passes with all eight tests reported, and the HTML report carries three attached axe JSON blobs (`axe-wcag`, `axe-structure`, `axe-boot`).
- The WCAG scan is clean **and** non-vacuous: `results.violations` is `[]` and `results.passes.length > 0` for `['wcag2a','wcag2aa','wcag21a','wcag21aa']` on `/`.
- The four `best-practice` structure rules provably ran: every id in `['region','page-has-heading-one','landmark-one-main','heading-order']` appears in `passes` or `inapplicable`, none appears in `incomplete`, and `violations` is `[]`.
- The canvas carries its name: `page.getByRole('img', { name: /contribution/i })` resolves to an element whose `tagName` is `CANVAS`.
- The DEC-011 table is complete and payload-accurate: `td[data-day]` count equals `manifest.dayCount`, and the mid-window spot-check cell's `data-count` equals `grid.human[i] + grid.agent[i]` read from `public/data/v1/grid.json` in the same run.
- The table is server-rendered with zero client JavaScript: `npm run build && npm start`, then `curl -s localhost:3000 | grep -c 'data-day='` returns `manifest.dayCount`, and `grep -c "use client" components/viz/ContributionTable.tsx` returns `0`.
- Reduced motion provably halts the sim: `window.__viz.inspect()` — the whole `VizFrameInfo`, including `drawCalls` and `rngState` — is deep-equal across five seconds of `page.clock.runFor`, and the test fails if `window.__viz` is absent rather than skipping.
- WCAG 2.2.2 is proven in both directions: the frame info **changes** across two seconds before the pause control is activated, and is **unchanged** across five seconds after `Enter` on a focused `role=button` named `/pause|play/i`.
- `npx vitest run lib/viz/tokens/contrast.test.ts` passes, and its three negative controls pin `--gray`/`#1d2021` at 4.467, `--bg4`/`#1d2021` at 3.369 and `#1d2021`/`--purple-d` at 3.873, each asserted `< 4.5`. Temporarily adding `{ id: 'probe', fg: '#928374', bg: '#1d2021', px: 9, bold: false }` to `CANVAS_TEXT` turns the suite red; revert it before committing.
- No forbidden fill reaches the renderer: `grep -rniE '#928374|#7c6f64|#b16286' lib/viz/render/` is empty, and the same assertion runs inside the unit test with a non-vacuous file-count guard.
- No literal payload figure in the table: `grep -nE '4,?817|10,?001|13,?360|1,?826|2,?038|\b284\b|\b156\b|\b58\b' components/viz/ContributionTable.tsx` returns nothing, and the only numeric literals are the seven weekday indices, `7`, `86_400_000`, `0`, `1`, `2` and `10`.
- No sibling surface was touched: `git diff --name-only origin/main...HEAD -- app/ styles/ playwright.config.ts .github/ lib/viz/tokens/ramp.ts lib/viz/tokens/level.ts lib/viz/render/ components/ds/ components/viz/Overview.tsx components/viz/Ribbon.tsx components/viz/Gource.tsx` is empty.

### At-merge gate

- `ci-ok` is green on the exact PR head — the required status published by KW-001's `.github/workflows/ci.yml`.
- `e2e-ok` is green on the exact PR head — KW-023's containerized context, run inside `mcr.microsoft.com/playwright:v1.62.1-noble`. A green local run is not evidence: the container is the only environment whose font stack and Chromium build the gate is defined against.
- The PR body records the three axe run summaries (rule counts for `passes` / `violations` / `incomplete` on each of the three scans) and the observed `manifest.dayCount` the table was checked against.
- No change to `package.json` or `package-lock.json` (DEC-003), and no file under `app/`, `styles/`, `.github/`, `public/data/`, `components/ds/`, `lib/viz/render/` or any sibling `components/viz/*.tsx` was touched.
- Every assertion that failed during development and was resolved by a change **outside** these three files is filed as a P1 rework issue against the owning ticket from the Invariant 1 remediation table, linked from the PR body, and is green before merge. A gate that was made to pass by weakening its own assertions is a review-blocking defect.
- A reviewer confirms the two scans are pinned as specified: the WCAG half tag-driven with no `disableRules` call anywhere in the file, and the structure half rule-driven with the four ids listed verbatim.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. The one behaviour a human would otherwise be asked to check — that a screen reader reads the grid as text rather than silence — is covered structurally by the `td[data-day]` count assertion plus the server-render `curl` check, and any residual is KW-032's operator pass.

## Failure, security, migration, and accessibility cases

**Failure.** This ticket's dangerous failure is a false green, not a red run. Each mode and its structural defence:

- **A scan that inspected nothing.** An `AxeBuilder` pointed at a page that 404ed, or a `.exclude()` that swallowed the document, reports zero violations. Defended by `results.passes.length > 0` on the WCAG run and by requiring all four ids to have actually run on the structure run.
- **Best-practice rules silently skipped.** The measured cause: `region`, `page-has-heading-one` and `landmark-one-main` are not WCAG-tagged. Defended by the second, rule-pinned run and by asserting `incomplete` is empty.
- **A harness that is not there.** `(window as any).__kwDebug?.cursorMs` compares `undefined` to `undefined` and passes forever. Defended by `expect.poll(() => Boolean(window.__viz)).toBe(true)` before any read, and by asserting the full `VizFrameInfo` struct.
- **A sim that never started.** The reduced-motion test alone cannot distinguish "correctly halted" from "never ran". Defended by the pause test's `not.toEqual` step, which proves the animation moves before it is asked to stop.
- **`fastForward` instead of `runFor`.** C4/ci-testing §5.6, measured: `fastForward` fires each due timer at most once, so rAF frames are dropped and a broken driver looks frozen. Never call it in this file.
- **The payload is missing from the checkout.** The table renders `null`, the `td[data-day]` count is 0, and the test fails loudly on `expect(m.ok()).toBeTruthy()` rather than passing against an empty table. Do not add a fallback.
- **A flaky axe run.** `playwright.config.ts` sets `retries: 0` (KW-023) on purpose — a flaky gate must fail, not be retried into green. If a scan is genuinely racing the page, the fix is `await page.evaluate(() => document.fonts.ready)` and the reduced-motion project, both already specified, not a retry.

**Security and privacy.** The e2e spec issues only same-origin requests to the local server and reads only two static JSON documents. It must never be given `VERCEL_AUTOMATION_BYPASS_SECRET` or pointed at a preview URL — C-22 disqualifies preview-based e2e as a gate, and a scan against a CDN-served deployment proves nothing about the PR head. The DEC-011 table renders only per-day contribution counts and dates: no repository name, no organisation, no employer, no path. `grid.privateMonthly` is deliberately excluded, and D-15's phone number, HG-5's email and every identity string live in `content/` and never reach this component. The three axe JSON attachments are Playwright report artifacts containing DOM snippets of a public page — safe to attach, and nothing else is attached.

**Migration.** None. Three new files on a tree that eight upstream tickets have already built. No route changes, no URL changes, no cache keys, no data migration. `public/data/v1/` is version-pathed by KW-012, so a future wire-format change lands as `v2/` and `ContributionTableProps` moves with `GridSeries` in a follow-up, not by editing this component in place.

**Accessibility.** This ticket *is* the accessibility surface, so the interesting cases are the ones where doing accessibility work would make things worse:

- **The table is not announced.** It is static text with no `aria-live`, no `role="status"` and no `role="log"`. `design-comp-spec` §9.5 flags an append-driven live log as "a firehose"; `viz-runtime` §9.4 throttles the canvas `aria-label` to at most once per simulated week for the same reason. A 1,826-cell live region is a screen-reader denial of service.
- **The table is hidden by `.sr-only` and by nothing else.** Not `hidden`, not `aria-hidden`, not `display:none`, not inside `<noscript>` — all four remove it from the accessibility tree, which destroys the only thing it is for. axe's visibility helpers treat the standard `clip: rect(0 0 0 0)` pattern as not visible on screen, so `color-contrast` does not evaluate it; that behaviour is KW-003's to preserve, and this ticket does not depend on it beyond noting it.
- **1.4.11 non-text contrast is not satisfiable and is not asserted.** GT-15: a ten-step ramp needs 3⁹ = 19,683:1 and sRGB tops out at 21:1. Both candidate ramps score identically, the disagreement dissolves, and DEC-011's table is the conformance route. Asserting an adjacent-level WCAG floor here would be asserting something known to be false.
- **Reduced motion is total, not slower.** `viz-runtime` §9.1: no rAF loop at all, one static frame at `tick = 0` through the same `renderFrame(0)` path the tests use. The assertion is deep equality of the whole frame struct, which is the only form that catches "the same animation, slower".
- **The pause control stays enabled under reduced motion.** `viz-runtime` §9.1 is explicit that reduced motion is a default, not a prohibition. This ticket therefore never asserts that controls are disabled — only that they exist, are focusable, are named, and work.
- **Canvas text has no large-text exemption.** Every measured `fillText` size in the comp is 9, 11, 13 or 20 px; only the 20 px bold banner clears the 18.66 px bold threshold, and it passes 4.5:1 anyway. The unit test encodes the rule rather than the shortcut.
- **The scanline drag is real and invisible to axe** (`design-comp-spec` §9.2, `1 − 0.16·0.35 = 0.944`). The unit test asserts the canvas palette under it; the DOM half is GATE-007's, in KW-003.

## Surfaces

- Reads: `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts`, `lib/bundle/schema.ts`, `lib/viz/testHarness.ts`, `lib/viz/render/**`, `components/viz/Ribbon.tsx`, `components/viz/Gource.tsx`, `app/regions/Instrument.tsx`, `app/regions/TransportBar.tsx`, `app/regions/BootOverlay.tsx`, `app/page.tsx`, `app/layout.tsx`, `playwright.config.ts`, `vitest.config.mts`, `package.json`, `tsconfig.json`, `public/data/v1/manifest.json`, `public/data/v1/grid.json`, `docs/design/kevinweaver.dev.dc.html`, `docs/design/_ds/**`, `docs/research/2026-07-31-ci-testing.md`, `docs/research/2026-07-31-viz-runtime.md`, `docs/research/2026-07-31-design-comp-spec.md`, `docs/research/2026-07-31-decomposition-synthesis.md`
- Writes: `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx`, `lib/viz/tokens/contrast.test.ts`
- Contracts: `components/viz/ContributionTable.tsx::ContributionTable`, the rendered `table[data-testid="contribution-table"]` DOM contract (`caption`, `th[scope]`, `td[data-day|data-count|data-level]`), the pinned axe rule set (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` by tag; `region`, `page-has-heading-one`, `landmark-one-main`, `heading-order` by id), the permitted canvas-text colour policy in `lib/viz/tokens/contrast.test.ts`
- Safety: site-wide WCAG 2.2 A/AA conformance gate, canvas text-equivalent completeness against the published payload, `prefers-reduced-motion` halt and WCAG 2.2.2 pause affordance, canvas-painted text contrast floor

## Sibling boundaries and open gates

**Open gates: none.** No GATE-nnn blocks pickup. GATE-007 (HG-7, the scanline treatment) lands in **KW-003**, not here, and cannot change this ticket's outcome: the approved canvas-text palette clears AA under both candidate treatments (worst pair `--bg-h` on `--aqua-d`: 5.168 clean, 4.743 at `--scanline-opacity: .35`, 4.928 at `.20`), and the DOM-side pairs GATE-007 affects are KW-003's acceptance criteria. GATE-002 (HG-2, `workflow` push scope) blocks KW-023 and KW-031 at push time because they ship `.github/workflows/**`; this ticket ships no workflow file and is unaffected. GATE-003 (HG-3, `CONTRIB_TOKEN`) blocks the pipeline half that produces the payload — by the time this wave-6 gate runs, KW-028 has already committed a bundle, and this ticket must not regenerate one.

**Upstream, and what to do while it is unmerged.** Every entry below is a hard or transitive dependency, so none of them should be missing. If one is, the answer is always the same: stop and report.

| Ticket | What this ticket consumes | If it has not merged |
|---|---|---|
| **KW-023** (hard dep) | `playwright.config.ts`, its `webServer` block and the `reduced-motion` project, `e2e-ok` | Stop. Do not author a config; KW-030 and KW-031 build on the same one. |
| **KW-025** (hard dep) | the canvas `role="img"` + `aria-label`, and the `<ContributionTable>` mount | Stop for the mount; see the three pickup states in "Existing owner and reuse target". |
| **KW-026** (hard dep) | the transport bar's real `<button>` controls and the pause affordance | Stop. There is no WCAG 2.2.2 assertion to make against `<span onClick>`. |
| **KW-016…KW-020** (hard deps) | the region subtrees the axe scan walks | Stop. A scan of a page with unfinished regions produces violations that are not this ticket's to fix. |
| **KW-007** (transitive) | `level`, `bandLabel`, `BAND_LABELS`, `PANE_SURFACE` | Stop. Do not reimplement the log2 ladder — DEC-009 forbids quantile binning and the boundaries are load-bearing. |
| **KW-012** (transitive) | `GridSeries`, `BundleMeta` — **type-only** | Stop. Do not restate the wire shape locally; the axis flip is exactly the thing a local copy gets wrong. |
| **KW-024** (transitive, via KW-025) | `window.__viz`, `inspect()`, `VizFrameInfo` | Stop. Do not fall back to `__kwDebug`, which does not exist. |
| **KW-028** (transitive) | the committed `public/data/v1/**` bundle | Stop. Do not run `npm run data:build` and do not commit a fixture. |
| **KW-003** (transitive) | `.sr-only`, `.skip`, `:focus-visible` | Ship anyway for the table (an unstyled `.sr-only` renders the table visibly, which is ugly but not a failure); fail the bypass-link test and file a P1 rework on KW-003. Never add CSS. |

**Same-wave siblings whose write surfaces are off limits.** Wave 6 dispatches three gates in parallel and they share the `e2e/` directory by file, not by directory. **KW-030** owns `.size-limit.json`, `scripts/ci/check-first-load.mjs` and `e2e/lazy-island.spec.ts`, and it — not this ticket — hard-gates Lighthouse CI's accessibility and SEO categories at 1.0. **KW-031** owns `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, the snapshot block in `playwright.config.ts` and `.github/workflows/snapshots.yml`; it also owns the `-u`/`--update-snapshots=` argv guard (C-23) and the PAT-push rule for baselines. This ticket takes no screenshot and adds no snapshot, which is what keeps the two files independent. Do not add an `a11y` assertion to either sibling's spec, and do not move any assertion out of `e2e/a11y.spec.ts` to "share setup" — a shared fixture file would be a fourth write surface and a fourth owner.

**Named residuals this ticket detects but does not close.**

- **KW-005 note 9, the `.skip` focus treatment.** KW-005 hands "a bypass link that satisfies WCAG 2.4.1 but is invisible to sighted keyboard users" to KW-029 "in KW-003's file". The synthesis fixes this ticket's write surface at three files and DEC-005 forbids cross-file sweeps, so the disposition is: assert it in test 6, and if it fails, file a P1 rework on KW-003 with the measured bounding box. That is the correct reading of "KW-029's to close" for a gate ticket.
- **Canvas text colours in `lib/viz/render/**`.** The three forbidden fills are detected by the unit test's source guard and remediated by a one-token swap in KW-022's files, per the Invariant 3 substitution table.
- **The fading `gource-file-label` alpha.** `MIN_LABEL_ALPHA = 0.66` is specified here and clamped in KW-022. If the renderer still fades to zero, the test that fails is the alpha-floor case, and the rework is a `Math.max` in `lib/viz/render/graph.ts`.

**Downstream.** **KW-032** is the only ticket that depends on this one. Its capstone verifies the assembled page against the live production deployment and requires all gates green; it will not re-open any of these three files. `components/viz/ContributionTable.tsx` is the durable artefact — the e2e spec and the unit test are gates, but the table is the site's text equivalent, its no-JS fallback and, together with KW-027's `/resume.txt` and `<noscript>` block, its indexable content.
