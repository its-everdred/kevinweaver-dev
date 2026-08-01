# KW-017 — Region: career git-log pane

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Two files and no data fetching, but the pane owns a data-derived graph model (lane columns, rail liveness, root suppression), a two-level disclosure, a below-720 px structural restructure and its own accessibility contract, and all of it must render with zero client JavaScript.

**Risk:** medium — this is the primary resume surface for the exact audience the site targets. Every failure mode is silent and visual: a rail column that detaches from its dots, a hue that drops under 4.5:1 on the pane surface, or a `<details>` fold that hides half the career from crawlers. Contained by a write surface of exactly two files, a content contract owned upstream by KW-006, and structural assertions that are greppable on the built HTML.

**Phase hint:** 3

**Depends on:** KW-003, KW-005, KW-006

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-004, DEC-005, DEC-008

**Gates:** GATE-005

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

An operator loading `/` sees the `#arc` pane render Kevin's whole career as a `git log --graph` — eight commit rows newest-first, roles as branches, the current role as the open branch HEAD sits on, a root commit at the bottom, and the education lane running beside the first consultancy in its own graph column. Every row expands in place to its full commit body with no JavaScript. Below 720 px the four pre-web3 rows fold behind one disclosure and the row layout restructures so the message is readable at 320 px. The region adds **zero** bytes of client JavaScript to the page.

## Context and evidence

The `#arc` pane is the site's primary resume surface. The content-IA track's allocation rule is the reason it is a separate region from the man page: *the man page is who he is, the git log is what he did.* That tense split is what keeps the two panes from duplicating each other, and it is why this ticket and KW-016 can run in parallel on disjoint files.

**Ground truth re-verified during authoring, at `e664d73a195facd64db58ba10952170ff01b4772`:**

- **GT-13 (comp line map).** The pane opens at `docs/design/kevinweaver.dev.dc.html:146` (`<div class="pane" id="arc" style="scroll-margin-top:44px">`), its bar is line 147, and its body runs to line 159. Re-counted this session: `grep -c 'class="commit"'` → **5**, `grep -c 'class="rail"'` → **4**. The DS convention "N rows means N `.commit` and N−1 `.rail`" holds in the comp.
- **GT-12 (glyph budget).** Re-ran the census (`Counter(ch for ch in comp if ord(ch) > 0x7f)`): **16** distinct non-ASCII codepoints, **zero** PUA. The three this ticket may use are all in that set and all in DEC-004's keep-as-text list: `•` U+2022 (×13), `●` U+25CF (×5), `◆` U+25C6 (×7). `◍` U+25CD is **not** in the set — KW-006's ticket says so explicitly and leaves the root glyph to this ticket.
- **GT-15 / hue contrast.** Recomputed this session with the WCAG 2.x relative-luminance formula against the true pane surface `--surface-pane` → `--bg-h` → `#1d2021` (verified in `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css` and `layers/pane.css`): yellow 9.67, green 7.94, aqua 7.79, orange 6.49, blue 6.09, purple 5.98, fg4 5.90, red 4.77 — and **`--gray #928374` = 4.47, which fails AA**. Digit-identical to KW-006's table. `--gray` is excluded from `LogHue` at the type level; this ticket must never reintroduce it.
- **The DS classes exist and are exactly as quoted.** `layers/data.css` lines 2–8 define `.commit`, `.commit .graph`, `.commit .hash`, `.commit .ref`, `.commit .cyear`, `.commit .cmsg` and `.rail`. `.commit .ref` is the **never-used** slot — zero matches in the comp — and this ticket is the first consumer.

**Contradictions this ticket inherits:**

- **C-18 (comp copy).** The verifier's correction stands: the comp's `#arc` pane has exactly **5** rows and grows to **8**, not 9 — the design track's own §7.2 heading says nine while its table is numbered 1–8. **Eight is the number.** The correction also establishes that the `2021–22 consensys · truffle` row is *correct* and that both GitHub contact tiles are correct; do not churn what is already right.
- **C-2 (Optimism evidence).** `ethereum-optimism/actions` is **public** with 2,984 commits and `its-everdred` as top contributor by an order of magnitude; the earlier "no public evidence / this branch is not merged" framing was an artefact of a token without a SAML grant. The Optimism row is the strongest node on the page, not the weakest. KW-006 already encodes this; this ticket must not reintroduce apologetic copy.
- **C-30 / line-citation accuracy.** Every comp line number in this document was re-`grep`ed this session rather than copied forward.

**Decisions that bind this ticket:**

- **DEC-002** — Next.js App Router with React Server Components. This region is a *synchronous* Server Component with no data fetching; it reads a static module. That is what makes zero client JS achievable and is also why the CI-testing track's constraint (async Server Components are unsupported by Vitest, so build-time data logic must live in **pure functions**, not in the component) is satisfied here by construction: all graph computation lives in exported pure functions.
- **DEC-003** — `package.json` and `package-lock.json` are frozen after KW-001. This ticket installs nothing and adds no dependency.
- **DEC-004** — control glyphs become inline SVG; `· — • – → ◆ ●` stay as text. The three graph glyphs this ticket picks are all on the keep-as-text side, so it needs nothing from `components/icons/**` and takes no dependency on KW-004.
- **DEC-005** — zero `serializes_with`. Every same-wave ticket owns a disjoint write surface, and **there is no accessibility sweep ticket and no mobile sweep ticket**. This region owns its own heading levels, focus states, disclosure semantics and 320 px reflow. Nobody comes back for it.
- **DEC-008** — no contribution figure is ever a literal in code. The figures live in `content/`; this component contains no thousands-separated integer.

**Gate:** **GATE-005** (HG-5) is the content-decisions gate — job title, Twitter handle, email, podcast name, availability, and *whether the side-project lane appears at all*. It blocks KW-006 directly and this ticket transitively. It does not block pickup once KW-006 has merged, but it changes one acceptance number: if the operator cuts the side lane, the `its-applekid` row is dropped and the log is **seven** rows, not eight. Read the row count from `CAREER_LOG.length`, never from a literal, and state the observed count in the PR description.

### Plan-context navigation

All references pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- **Pack index:** `docs/build-orders/site-rewrite/README.md` — authority map and the KW-01…KW-32 → `KW-001`…`KW-032` ordinal mapping.
- **Wave and graph analysis:** `docs/research/2026-07-31-decomposition-synthesis.md` §6 — wave diagram, verified topological levels, critical path, and the write-surface partition table that proves this ticket's two files are owned by nobody else.
- **Decision registry:** same document §3 (D-01…D-17 → DEC-001…DEC-017) and §4 (HG-1…HG-7 → GATE-001…GATE-007).
- **This ticket's implementation pointers:** same document §5, "Wave 3", entry **KW-17**.
- **Track evidence:** `docs/research/2026-07-31-design-comp-spec.md` §2.5.2 (the comp's `#arc` pane), §3.4 (`.commit`/`.rail` and the upstream `CommitLog.jsx` contract), §5.3 (geometry re-derivation and the `.rail`-under-`.graph` fix), §7.2 (the eight-row table, hue-contrast rationale, root row, mobile fold), §8.3 item 2 (the below-720 px `.commit` restructure), plus the appended "Verification corrections" C1–C5. And `docs/research/2026-07-31-content-ia.md` §5.1–§5.4 (branch model, full log, collapsed rendering) with its appended corrections C1–C3.
- **Ground truth:** synthesis §1, rows GT-12, GT-13, GT-15.
- **Executor authority and the live gate register:** `docs/build-orders/site-rewrite/authority-envelope.md`.

**Requirements this ticket serves.** REQ-002 (the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file), REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder, no invented employer, no hardcoded figure), REQ-009 (the page carries a correct heading outline, landmark structure and bypass affordance, and the shell renders with zero client JavaScript).

## Scope

- Replace the KW-005 stub at `app/regions/CareerLog.tsx` with the real region: a synchronous Server Component that reads `CAREER_LOG`, `CAREER_LOG_PANE_TITLE` and `CAREER_LOG_HEAD` from `content/career-log.ts` and mounts one `CommitLog` inside a `Pane` with the region's `<h2>`, landmark and `aria-labelledby` wiring from `REGION_META.careerLog`.
- Create `components/ds/CommitLog.tsx`, the design-system commit-log primitive: it renders the DS `.commit` / `.graph` / `.hash` / `.ref` / `.cyear` / `.cmsg` / `.rail` structure, adds the `stack` chip row and the `root` behaviour the upstream `CommitLog.jsx` lacks, and makes `hue` drive both the `.graph` bullet and the `.hash` colour instead of hardcoding `var(--yellow)`.
- Own the graph model as exported pure functions: lane-to-column assignment, per-boundary rail liveness, root detection, and the pre-web3 partition. No graph logic inside the component body.
- Own the two-level disclosure: every row is a `<details>` whose `<summary>` is the oneline and whose body is the row's full commit body, and the four pre-web3 rows sit inside one outer `<details>` that is closed below 720 px and force-opened above it — all with native HTML and CSS only.
- Own the below-720 px structural restructure of the commit row (three fixed columns collapse to a two-line grid) and the derived rail alignment, shipped as component-scoped CSS from inside `components/ds/CommitLog.tsx` via React 19's `<style href precedence>` hoisting.
- Own this region's own accessibility contract per DEC-005: `<h2>`/`<h3>` levels beneath KW-005's `sr-only` `<h1>`, ordered-list semantics for the log, decorative graph glyphs kept out of the accessibility tree, an accessible name for the root commit, keyboard-reachable disclosures, and no horizontal scroll at 320 px.
- Add stable `data-kw-*` test hooks (`data-kw-commit`, `data-kw-rail`, `data-kw-rule`, `data-kw-lane`, `data-kw-root`, `data-kw-fold`) so this ticket, KW-029 and KW-031 can assert structure against built HTML without depending on class-attribute ordering.

## Non-goals

- Any file under `styles/**` or `app/globals.css`. KW-003 owns every stylesheet, including the `.commit`/`.rail` re-derivation, `.sr-only`, `.kw-hide-sm`, the `:focus-visible` ring and the reduced-motion stop. This ticket consumes those and writes none of them.
- Any content string, short SHA, hue token, `ref` decoration, `lane` value or commit body line. KW-006 owns `content/career-log.ts`; this ticket renders it and never edits, patches or locally overrides it.
- `app/page.tsx`, `app/layout.tsx`, `app/regions/_contract.ts`, `components/ds/Pane.tsx`, `components/ds/PaneBar.tsx`, `components/ds/Meter.tsx`, `components/ds/Scanline.tsx`. All KW-005, all frozen from this ticket's point of view.
- Any other region file. `ManPage.tsx` is KW-016, `Header.tsx`/`TmuxBar.tsx` are KW-018, `Contact.tsx` is KW-019, `BootOverlay.tsx` is KW-020, `Instrument.tsx` is KW-025, `TransportBar.tsx` is KW-026.
- `package.json` and `package-lock.json` (DEC-003). No new dependency, no `d3`, no markdown renderer, no animation library.
- Inline SVG icons, `components/icons/**`, fonts and `app/fonts.ts` — KW-004. This region's three glyphs are text and stay text (DEC-004).
- `/resume.txt`, `/kevinweaver.1`, the `metadata` export, the OG image and the `<noscript>` fallback — KW-027 generates all of those from `content/`, not from this component.
- axe wiring, Playwright specs, screenshot baselines and the perf budget — KW-023, KW-029, KW-030, KW-031.
- Any client-side interactivity: no `'use client'`, no `useState`, no `onClick`, no scroll spy, no JS-driven expand/collapse. Native `<details>` is the whole mechanism.
- Test files. The write surface is exactly two files; KW-011 owns `test/**` and `vitest.config.mts`. The pure functions are exported so a later ticket can test them without touching this component.

## Existing owner and reuse target

At `e664d73a195facd64db58ba10952170ff01b4772` the repository is still the pre-rewrite Pages Router site: `git ls-tree -r --name-only` shows `pages/`, `components/{HomeHero,Timeline,WriteCode}.js` and `styles/globals.scss`, and there is **no** `app/`, `components/ds/`, `content/` or `styles/ds/`. Every reuse target below is therefore created by a named upstream ticket, all three of which are hard dependencies of this one.

| Target | Created by | What this ticket does with it |
|---|---|---|
| `app/regions/CareerLog.tsx` | **KW-005** (stub) | Replaced in full. Keep the exported function name `CareerLog` and the `CareerLogProps` signature. |
| `app/regions/_contract.ts` — `REGION_META.careerLog`, `CareerLogProps` | **KW-005** | Imported, never edited. |
| `components/ds/Pane.tsx` — `Pane`, `PaneProps` | **KW-005** | Imported. Uses `as`, `id`, `title`, `titleId`, `titleAs`, `labelledBy`, `right`, `bodyStyle`. |
| `content/career-log.ts` — `CAREER_LOG`, `CareerCommit`, `LogHue`, `CAREER_LOG_PANE_TITLE`, `CAREER_LOG_HEAD` | **KW-006** | Imported, never edited. |
| `styles/ds/layers/data.css` (`.commit`, `.rail`) and `styles/ds/web.css` deviation **D3** | **KW-003** | Consumed. The `.rail` `margin-left: calc(1.125rem / 2 - var(--bw-pane) / 2)` fix and the `.commit .graph{flex:0 0 1.125rem}` re-derivation are KW-003's D3 entry — **do not re-implement them in `styles/`**. |
| `styles/kw.css` — `.sr-only`, `.kw-hide-sm`, `:focus-visible` ring, reduced-motion stop | **KW-003** | Consumed by class name only. |

The upstream design-system component that motivates `components/ds/CommitLog.tsx` is `CommitLog.jsx` in DesignSync project `583945d5-2203-4320-8a4e-b30afe61181d`. It is **not** in this repository and must not be fetched: the design track measured its behaviour (`{hash, ref, year, message, hue, head}`, `.hash` hardcoded to `var(--yellow)`) and this ticket ships a superset in TypeScript. Treat that measurement as the historical contract, not as a file to copy.

**Verify at pickup, before writing code.** If any of these is false, stop and report it against the owning ticket rather than fixing it here:

```bash
test -f app/regions/CareerLog.tsx && test -f app/regions/_contract.ts
test -f components/ds/Pane.tsx && test -f content/career-log.ts
grep -n 'careerLog:' app/regions/_contract.ts
grep -n 'CAREER_LOG_PANE_TITLE\|CAREER_LOG_HEAD\|export const CAREER_LOG' content/career-log.ts
grep -n 'margin-left: calc(1.125rem / 2 - var(--bw-pane) / 2)' styles/ds/web.css   # KW-003 D3
grep -n '\.sr-only\|\.kw-hide-sm' styles/kw.css
grep -n '"@/\*"' tsconfig.json    # if absent, use relative imports; do NOT edit tsconfig.json
npm ci && npm run build           # must be green before you change anything
```

## Contract and invariants

### Consumed contract — `content/career-log.ts` (producer: KW-006)

Quoted verbatim from KW-006's ticket. Do not paraphrase it into a local type, do not widen it, do not add fields.

```ts
/** Contrast-verified against the pane surface #1d2021. 'gray' is deliberately absent. */
export type LogHue =
  | 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'fg4';

export interface CareerCommit {
  /** 7 lowercase hex chars. sha1(`${org}:${startMonth}`).slice(0, 7). */
  readonly hash: string;
  /** Rendered into the DS `.commit .ref` slot. null renders no slot. */
  readonly ref: string | null;
  /** `.cyear` column, e.g. '2025–26'. En dash U+2013 is inside the budget. */
  readonly years: string;
  /** `.cmsg` bold lead. */
  readonly title: string;
  /** `.cmsg` detail. */
  readonly detail: string;
  /** Chip row; [] renders no chips. */
  readonly stack: readonly string[];
  /** Drives both the `.graph` bullet colour and the `.hash` colour. */
  readonly hue: LogHue;
  readonly lane: 'main' | 'role' | 'side' | 'education';
  /** Root commit: renderer suppresses the trailing `.rail` and picks a root glyph. */
  readonly root: boolean;
  /** Expanded `<details>` body. One entry per line, already wrapped. */
  readonly body: readonly string[];
  /** Pre-web3 rows collapse behind `<details>` below 720px. */
  readonly preWeb3: boolean;
}

/** Newest first. Exactly eight entries. */
export const CAREER_LOG: readonly CareerCommit[];
export const CAREER_LOG_PANE_TITLE: string;   // 'git log --graph --decorate --all'
export const CAREER_LOG_HEAD: string;         // 'HEAD -> optimism'
```

Today's eight rows, newest first, with their deterministic hashes (`sha1(\`${org}:${startMonth}\`).slice(0, 7)`): `ee787a7` Optimism (`role`), `b85c3e3` its-applekid (`side`), `538d21c` Metropolis (`role`), `3437755` ConsenSys (`role`), `3cc4bc6` Stitch Fix (`role`, `preWeb3`), `79c6a5b` EMS Heroes (`role`, `preWeb3`), `4dc06be` Omni Developers (`role`, `preWeb3`), `9ee7ca6` Rowan University (`education`, `preWeb3`, `root: true`).

### Produced contract — `components/ds/CommitLog.tsx`

This is the seam this ticket publishes. It is consumed today only by `app/regions/CareerLog.tsx`, but it is a `components/ds/` primitive and must stand alone.

```ts
// components/ds/CommitLog.tsx
import type { CareerCommit } from '@/content/career-log'

export interface CommitLogProps {
  /** Newest first. Rendered in array order; the renderer never sorts. */
  readonly commits: readonly CareerCommit[]
  /** id of the element that names the log; forwarded to aria-labelledby on the <ol>. */
  readonly labelledBy?: string
  /** Summary text for the pre-web3 fold. Defaults to `… ${n} more commits`. */
  readonly foldSummary?: string
  readonly className?: string
}

/** Graph column for a lane. 0 is the trunk; 1 is the off-trunk lane. */
export type LaneColumn = 0 | 1

export interface GraphRow {
  readonly commit: CareerCommit
  readonly column: LaneColumn
  readonly glyph: '●' | '◆' | '•'
  /** Columns that draw a vertical rule in the rail BELOW this row. */
  readonly railColumns: readonly LaneColumn[]
  /** false only for the last row. */
  readonly hasRail: boolean
}

export interface GraphModel {
  readonly rows: readonly GraphRow[]
  readonly columnCount: 1 | 2
  /** Index of the first preWeb3 row, or rows.length when there is none. */
  readonly foldFrom: number
}

/** Pure. No DOM, no React, no I/O. Exported so KW-011 can unit-test it later. */
export function buildGraph(commits: readonly CareerCommit[]): GraphModel

export function CommitLog(props: CommitLogProps): React.ReactNode
```

### Invariants

**Invariant 1 — zero client JavaScript.** Neither written file contains `'use client'`, a React hook, or an event handler prop. The expand/collapse mechanism is native `<details>`; the responsive behaviour is CSS. The `First Load JS` figure `next build` prints for route `/` must be **byte-identical before and after this ticket**.

**Invariant 2 — the renderer never invents content.** Every visible string comes from `content/career-log.ts` or from `REGION_META`. The only strings this component may originate are the three graph glyphs, the fold summary (derived from `commits.length`), the visually hidden `root commit` label, and the em dash separating `title` from `detail`. No employer, no year, no figure.

**Invariant 3 — hue is exhaustive and gray-free.** The hue map is typed `Record<LogHue, string>`. If KW-006 ever adds `'gray'` to `LogHue`, `tsc --noEmit` fails here rather than shipping a 4.47:1 row. No hex literal appears in either file.

**Invariant 4 — rail alignment is derived, never assumed.** `.graph`'s slot width and the rail rule's offset are both expressed from a single custom property `--cl-graph-w`. The DS's literal `margin-left: 10px` silently assumed `.graph: 22px` with `--bw-pane: 2px`; KW-003's D3 replaced it with `calc(1.125rem / 2 - var(--bw-pane) / 2)`. Inside `.kw-clog` the same arithmetic is re-expressed against `--cl-graph-w` so a multi-column rail stays centred under its dots at every breakpoint. `--cl-graph-w` must equal KW-003's `1.125rem`; the agent gate greps both.

**Invariant 5 — structure is data-derived and countable.** `rows.length === commits.length`. A rail element is emitted after every row except the last (`N` rows → `N − 1` rails), matching the DS convention the comp obeys. The **number of vertical rules inside** a given rail is `railColumns.length`, which is data-derived and may be zero. The last row must satisfy `root === true`; if it does not, `buildGraph` throws at build time rather than rendering a headless log.

**Invariant 6 — the fold is contiguous.** `preWeb3` rows must form a suffix of the array. `buildGraph` throws if `commits.findIndex(c => c.preWeb3) !== commits.filter(c => !c.preWeb3).length`. This turns a content mistake into a red build instead of a silently reordered career.

**Invariant 7 — the pane body does not become scrollable.** `.pane-body { overflow: hidden }` is a hard DS rule and KW-016 is the *only* region that overrides it to `auto` (for its `less(1)` pager). This region grows its pane instead: it passes no `overflowY` and expanded bodies wrap rather than scroll.

### Lane and rail model, worked against today's data

Column assignment: `lane === 'main' || lane === 'role'` → column **0** (the trunk); `lane === 'side' || lane === 'education'` → column **1**. `columnCount` is `2` when any row lands in column 1, else `1`.

Rail liveness is computed **per lane**, not per column: lane *L* draws a rule in the rail below row *i* iff *L* owns a row at index ≤ *i* **and** a row at index ≥ *i+1*. Applied to today's eight rows (0-indexed):

| i | commit | lane | column | glyph | rail below i | rules drawn |
|---|---|---|---|---|---|---|
| 0 | `ee787a7` Optimism | role | 0 | `●` | yes | `[0]` |
| 1 | `b85c3e3` its-applekid | side | 1 | `◆` | yes | `[0]` |
| 2 | `538d21c` Metropolis | role | 0 | `●` | yes | `[0]` |
| 3 | `3437755` ConsenSys | role | 0 | `●` | yes | `[0]` |
| 4 | `3cc4bc6` Stitch Fix | role | 0 | `●` | yes | `[0]` |
| 5 | `79c6a5b` EMS Heroes | role | 0 | `●` | yes | `[0]` |
| 6 | `4dc06be` Omni Developers | role | 0 | `●` | yes | `[]` |
| 7 | `9ee7ca6` Rowan University | education | 1 | `•` | no (last) | — |

Two consequences, both deliberate and both to be stated in the PR description so a reviewer does not read them as bugs:

1. **The rail between Omni and Rowan draws no rule.** `role`'s last row is index 6, so the trunk terminates there; `education` owns only index 7, so it starts there. The empty rail element still occupies its height, preserving vertical rhythm, and the visual discontinuity is the honest rendering of what content-IA §5.2 encodes in Rowan's own commit body — the education branch overlapped the Omni branch by two years and *the merge was not clean*. This is the "two live parallel lanes" moment the synthesis calls out, expressed with a second graph column rather than with a fake merge commit.
2. **The `its-applekid` row is a branch tip in column 1** while the trunk rule continues past it in column 0. That is exactly `git log --graph`'s rendering of an unmerged single-commit branch.

The glyph rule: `root` → `•` U+2022; `column === 1 && !root` → `◆` U+25C6 (the comp's agent marker, `docs/design/kevinweaver.dev.dc.html:169`); otherwise `●` U+25CF. All three are inside GT-12's 16-codepoint census and inside DEC-004's keep-as-text list, so this region needs no icon component and takes no dependency on KW-004.

### Rendered DOM shape (one authoritative sketch)

```html
<section class="pane" id="arc" aria-labelledby="region-career-log-title">
  <div class="pane-bar">
    <h2 id="region-career-log-title" class="pane-title">git log --graph --decorate --all</h2>
    <span style="flex:1"></span>
    <span class="kw-hide-sm" style="color:var(--text-faint)">HEAD -&gt; optimism</span>
  </div>
  <div class="pane-body">
    <div class="kw-clog" style="--cl-graph-w:1.125rem;--cl-lane-count:2">
      <ol class="kw-clog-rows" aria-labelledby="region-career-log-title">
        <li>
          <details data-kw-commit="ee787a7">
            <summary>
              <div class="commit">
                <span class="graph" aria-hidden="true"><i data-kw-lane="0">●</i><i data-kw-lane="1"></i></span>
                <span class="hash" style="color:var(--red)">ee787a7</span>
                <span class="ref">(HEAD -&gt; optimism, tag: role/optimism)</span>
                <span class="cyear">2025–26</span>
                <span class="cmsg"><span class="ctitle">Optimism · Actions SDK</span> — technical architect …</span>
              </div>
              <ul class="cstack" aria-label="stack">
                <li>typescript</li><li>hono</li><li>vite</li><li>react</li><li>solidity</li><li>kubernetes</li>
              </ul>
            </summary>
            <pre class="cbody">OP Labs. May 2025 - present. Remote, America/Los_Angeles.
…</pre>
          </details>
          <div class="rail" data-kw-rail aria-hidden="true"><i data-kw-rule="0"></i></div>
        </li>
        <!-- rows 2 … 4 -->
      </ol>
      <details class="kw-clog-fold" data-kw-fold>
        <summary>… 4 more commits</summary>
        <ol class="kw-clog-rows" start="5" aria-label="earlier commits">
          <!-- rows 5 … 8; the last carries data-kw-root="true" and no trailing rail -->
        </ol>
      </details>
    </div>
  </div>
</section>
```

Notes on that shape, all load-bearing:

- The log is an **ordered list**. `git log` is ordered and the order is the information. `start="5"` on the folded list keeps the numbering honest.
- `.rail` lives **inside** the `<li>` it follows, because `<ol>` may only contain `<li>`. It is `aria-hidden` — decorative, and the branch structure is redundantly available as text in `.ref` and in the row order.
- The root row carries `data-kw-root="true"` and a visually hidden label: `<span class="sr-only">root commit</span>` immediately after `.ref`. The glyph alone is not an accessible name.
- `.graph` renders one `<i>` per lane column so the dots and the rail rules share one grid. Empty slots are empty elements, not spaces.
- `.cstack` is a `<ul>` so the stack reads as a list, not as a run-on sentence. It is inside the `<summary>` because it is part of the oneline, not part of the expanded body.
- `<summary>` keeps its default `display: list-item`; the disclosure affordance is a CSS-drawn triangle on `summary::before` positioned in the list's left gutter, so it costs no font glyph and depends on no Nerd Font.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify the "verify at pickup" block above before writing code.

**Toolchain, verified with `npm view` during authoring:** `next@16.2.12`, `react@19.2.8`, `tailwindcss@4.3.3`, `typescript@5.9.3` all resolve. KW-001 installs them and freezes the lockfile (DEC-003). This ticket adds nothing.

### File 1 — `app/regions/CareerLog.tsx` (replace the KW-005 stub)

```tsx
// app/regions/CareerLog.tsx
import { CommitLog } from '@/components/ds/CommitLog'
import { Pane } from '@/components/ds/Pane'
import {
  CAREER_LOG,
  CAREER_LOG_HEAD,
  CAREER_LOG_PANE_TITLE,
} from '@/content/career-log'
import { REGION_META, type CareerLogProps } from './_contract'

const META = REGION_META.careerLog

export function CareerLog({
  id = META.anchorId ?? undefined,
  className,
  style,
}: CareerLogProps) {
  return (
    <Pane
      as="section"
      id={id}
      className={className}
      // comp:146 sets scroll-margin-top:44px so the sticky header does not
      // cover the #arc anchor. KW-018 owns the header height; if it ever
      // tokenises it, replace the literal with that token.
      style={{ scrollMarginTop: '44px', ...style }}
      title={CAREER_LOG_PANE_TITLE}
      titleId={META.titleId}
      titleAs="h2"
      labelledBy={META.titleId}
      right={
        <span className="kw-hide-sm" style={{ color: 'var(--text-faint)' }}>
          {CAREER_LOG_HEAD}
        </span>
      }
    >
      <CommitLog commits={CAREER_LOG} labelledBy={META.titleId} />
    </Pane>
  )
}
```

**Documented deviation from `REGION_META`.** `REGION_META.careerLog.accessibleName` is the string `'git log --graph --oneline --since=2021'` — the comp's title, which the design track measured as *wrong*: `--since=2021` describes a log that reaches 2008. KW-006 supplies the corrected `CAREER_LOG_PANE_TITLE = 'git log --graph --decorate --all'`, and this region renders that into the `<h2>` carrying `META.titleId`. Because the region is named through `aria-labelledby` → that `<h2>`, the effective accessible name is the corrected title and `META.accessibleName` is never rendered. `app/regions/_contract.ts` is KW-005's file and is frozen; **do not edit it**. Record the stale constant in the PR description and in `docs/build-orders/site-rewrite/deferred-findings.md` so KW-029 and KW-032 see it.

### File 2 — `components/ds/CommitLog.tsx`

Structure the module in this order: imports, the hue map, `buildGraph` and its helpers, the component-scoped stylesheet constant, then `CommitLog`.

```tsx
// components/ds/CommitLog.tsx
import type { ReactNode } from 'react'
import type { CareerCommit, LogHue } from '@/content/career-log'

/**
 * Every value clears 4.5:1 against the pane surface --bg-h #1d2021
 * (yellow 9.67, green 7.94, aqua 7.79, orange 6.49, blue 6.09,
 *  purple 5.98, fg4 5.90, red 4.77). --gray is 4.47 and is absent
 * from LogHue by design; this Record makes that a type error, not a
 * visual regression.
 */
const HUE_VAR: Record<LogHue, string> = {
  red: 'var(--red)',
  orange: 'var(--orange)',
  yellow: 'var(--yellow)',
  green: 'var(--green)',
  aqua: 'var(--aqua)',
  blue: 'var(--blue)',
  purple: 'var(--purple)',
  fg4: 'var(--fg4)',
}

const TRUNK_LANES = new Set<CareerCommit['lane']>(['main', 'role'])

export function buildGraph(commits: readonly CareerCommit[]): GraphModel {
  if (commits.length === 0) throw new Error('CommitLog: commits must not be empty')
  if (!commits[commits.length - 1].root) {
    throw new Error('CommitLog: the last commit must carry root: true')
  }

  const lead = commits.filter((c) => !c.preWeb3).length
  if (commits.findIndex((c) => c.preWeb3) !== -1 && commits.findIndex((c) => c.preWeb3) !== lead) {
    throw new Error('CommitLog: preWeb3 rows must form a contiguous suffix')
  }

  const columnOf = (c: CareerCommit): LaneColumn => (TRUNK_LANES.has(c.lane) ? 0 : 1)

  // lane -> [firstIndex, lastIndex]
  const span = new Map<CareerCommit['lane'], [number, number]>()
  commits.forEach((c, i) => {
    const s = span.get(c.lane)
    span.set(c.lane, s ? [s[0], i] : [i, i])
  })

  const rows = commits.map((commit, i) => {
    const column = columnOf(commit)
    const hasRail = i < commits.length - 1
    const railColumns: LaneColumn[] = []
    if (hasRail) {
      for (const [lane, [first, last]] of span) {
        if (first <= i && last >= i + 1) {
          const col = columnOf({ ...commit, lane })
          if (!railColumns.includes(col)) railColumns.push(col)
        }
      }
      railColumns.sort()
    }
    const glyph = commit.root ? '•' : column === 1 ? '◆' : '●'
    return { commit, column, glyph, railColumns, hasRail }
  })

  const columnCount: 1 | 2 = rows.some((r) => r.column === 1) ? 2 : 1
  return { rows, columnCount, foldFrom: lead }
}
```

`buildGraph` is pure and DOM-free, which is the whole point: the CI-testing track recorded verbatim from the Next docs that *async Server Components are unsupported by Vitest*, so anything a unit test must reach has to live outside the component. Keep it that way.

**The component-scoped stylesheet.** This ticket may not write `styles/**`, so the responsive rules ship from inside the component using React 19's stylesheet support — a `<style>` element with `href` and `precedence` is deduplicated and hoisted into `<head>` by React 19 (`react@19.2.8`, confirmed). Emit it once, at the top of `CommitLog`'s return:

```tsx
<style href="kw-commit-log" precedence="medium">{CSS}</style>
```

If hoisting ever misbehaves, the element still renders in the body and the rules still apply — `<style>` in body is valid HTML5 — so there is no failure mode that needs a fallback branch.

Every selector in `CSS` is prefixed with `.kw-clog`. That is a hard rule: it keeps this component out of KW-003's global `.commit`/`.rail` namespace, and the extra class raises specificity to `(0,2,0)`/`(0,3,0)` so the intended overrides win without `!important`.

```css
.kw-clog { --cl-graph-w: 1.125rem; --cl-marker-w: 0.9em; display: flex; flex-direction: column; }
.kw-clog-rows { list-style: none; margin: 0; padding-left: var(--cl-marker-w); }
.kw-clog-rows > li { list-style: none; }

/* disclosure affordance: a CSS triangle in the list gutter, no font glyph */
.kw-clog summary { list-style: none; cursor: pointer; position: relative; }
.kw-clog summary::-webkit-details-marker { display: none; }
.kw-clog summary::before {
  content: ""; position: absolute; left: calc(-1 * var(--cl-marker-w)); top: .45em;
  width: 0; height: 0; opacity: .6;
  border-left: .35em solid currentColor;
  border-top: .28em solid transparent;
  border-bottom: .28em solid transparent;
}
.kw-clog details[open] > summary::before { transform: rotate(90deg); }

/* graph gutter: one slot per lane column, shared by dots and rails */
.kw-clog .commit .graph {
  flex: 0 0 calc(var(--cl-graph-w) * var(--cl-lane-count, 1));
  display: grid; grid-auto-flow: column; grid-auto-columns: var(--cl-graph-w);
  text-align: center;
}
.kw-clog .rail {
  margin-left: 0; border-left: 0;
  display: grid; grid-auto-flow: column; grid-auto-columns: var(--cl-graph-w);
  height: clamp(14px, 1.25rem, 20px);
}
.kw-clog .rail > i[data-kw-rule] {
  border-left: var(--bw-pane, 2px) solid var(--border-pane);
  margin-left: calc(var(--cl-graph-w) / 2 - var(--bw-pane, 2px) / 2);
}

.kw-clog .ctitle { color: var(--text-strong); font-weight: var(--fw-bold, 700); }
.kw-clog .cstack {
  list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap;
  gap: var(--sp-1, 6px); color: var(--text-faint); font-size: var(--fs-micro);
}
.kw-clog .cbody {
  margin: 0; font: inherit; color: var(--text-muted);
  white-space: pre-wrap; overflow-wrap: anywhere;
  padding: var(--sp-1, 6px) 0 var(--sp-1, 6px)
           calc(var(--cl-graph-w) * var(--cl-lane-count, 1) + var(--sp-2, 14px));
}

/* >= 721px: the pre-web3 fold is not a disclosure, it is just more rows */
@media (min-width: 721px) {
  .kw-clog-fold > summary { display: none; }
  .kw-clog-fold::details-content { content-visibility: visible; block-size: auto; }
}

/* <= 720px: 22 + 92 + 88 + 3 gaps is 274px of fixed columns before .cmsg
   gets any width, which leaves ~66px inside a 360px viewport. Restructure. */
@media (max-width: 720px) {
  .kw-clog .commit {
    display: grid;
    grid-template-columns: auto auto 1fr;
    grid-template-areas: "graph hash year" "ref ref ref" "msg msg msg";
    gap: 2px var(--sp-1, 6px);
    align-items: baseline;
  }
  .kw-clog .commit .graph { grid-area: graph; }
  .kw-clog .commit .hash  { grid-area: hash;  flex: none; }
  .kw-clog .commit .cyear { grid-area: year;  flex: none; margin-left: auto; }
  .kw-clog .commit .ref,
  .kw-clog .commit .cmsg  { padding-left: calc(var(--cl-graph-w) * var(--cl-lane-count, 1) + var(--sp-1, 6px)); }
  .kw-clog .commit .ref   { grid-area: ref; }
  .kw-clog .commit .cmsg  { grid-area: msg; }
  .kw-clog .rail { height: 12px; }
}
```

**The `::details-content` decision, stated so nobody "fixes" it.** The fold is authored **closed** and force-opened at ≥ 721 px. That direction is deliberate: markup that is closed by default is still fully present in the DOM, so crawlers and screen readers get all eight rows regardless, and the small-screen default needs no JavaScript. `::details-content` is supported by all three engines (Chromium 131+, Safari 18.4+, Firefox 139+). On an engine without it the desktop layout degrades to a visible `… 4 more commits` disclosure the user opens once — degraded, never broken, and every row is still in the DOM. Do **not** attempt to solve this by rendering the rows twice; duplicate career text would poison both the accessibility tree and KW-027's SEO surface.

**`--cl-lane-count`** is written as an inline custom property on `.kw-clog` from `graph.columnCount`, cast through `as React.CSSProperties`. `--cl-graph-w` is declared in the stylesheet, not inline, so KW-003 retains the ability to retune it from `styles/ds/web.css` if the type ladder moves; its value must stay equal to KW-003's D3 literal `1.125rem`.

**Formatting and lint.** Run `npm run format` before committing (KW-001 declares the script). `npm run lint` uses `eslint-config-next@16.2.12` flat config. `npm run typecheck` is `next typegen && tsc --noEmit`; run the script, not a bare `tsc`.

### While a dependency is unmerged

All three dependencies are wave-2 and merge before this ticket is dispatched, so the normal case is that they are present. If the fleet dispatches early:

- **KW-006 missing** (`content/career-log.ts` absent) — **stop**. There is no acceptable local fixture: inventing rows would ship invented career facts, which is the exact failure REQ-003 exists to prevent. Report against KW-006 and GATE-005.
- **KW-005 missing** (`_contract.ts` or `Pane.tsx` absent) — **stop**. The props envelope and the pane primitive are the seam; a local re-implementation would collide with KW-005 on merge.
- **KW-003 missing** (`styles/ds/web.css` D3 absent) — you may proceed. The component's own rules are self-consistent because `.graph` and `.rail` both derive from `--cl-graph-w`; the row will render with the DS's slide-scale `gap: 24px` and `height: 30px` until KW-003 lands. Note it in the PR and do not add the rules to `styles/`.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on Node 24.
- Zero client JavaScript: `grep -rl "use client" app/regions/CareerLog.tsx components/ds/CommitLog.tsx` is empty, `grep -nE "useState|useEffect|useRef|useMemo|onClick|onChange|addEventListener" app/regions/CareerLog.tsx components/ds/CommitLog.tsx` is empty, and the `First Load JS` figure `next build` prints for route `/` is unchanged from the pre-change baseline recorded in the PR description.
- Eight rows, all hashes valid hex: with the production server running, `curl -s localhost:3000 > /tmp/kw017.html`; `grep -o 'data-kw-commit="[^"]*"' /tmp/kw017.html | wc -l` equals `CAREER_LOG.length` (**8** with GATE-005 unresolved-as-planned, 7 if the side lane is cut), and every captured value matches `^[0-9a-f]{7}$` — `grep -o 'data-kw-commit="[^"]*"' /tmp/kw017.html | sed 's/.*="//;s/"//' | grep -cvE '^[0-9a-f]{7}$'` returns `0`.
- A root-commit row is present, is last, and is named: `grep -c 'data-kw-root="true"' /tmp/kw017.html` returns `1`, it is the final `data-kw-commit` in document order, and `grep -c 'root commit' /tmp/kw017.html` returns at least `1`.
- Rails obey the DS convention and the lane model: `grep -o 'data-kw-rail' /tmp/kw017.html | wc -l` equals `CAREER_LOG.length - 1` (**7**), and `grep -o 'data-kw-rule' /tmp/kw017.html | wc -l` equals **6** for today's data — the one rail that draws no rule is the one between `4dc06be` (Omni) and `9ee7ca6` (Rowan).
- Rail alignment is derived from one source: `grep -c -- '--cl-graph-w' components/ds/CommitLog.tsx` is at least `4` (declaration, `.graph` width, rail offset, `.cmsg` indent), `grep -n 'margin-left: *10px' components/ds/CommitLog.tsx` is empty, and `grep -n '1.125rem' styles/ds/web.css` still matches KW-003's D3 value.
- `--gray` is never used and no colour literal appears: `grep -nE 'var\(--gray\)|#[0-9a-fA-F]{6}' app/regions/CareerLog.tsx components/ds/CommitLog.tsx` is empty, and `HUE_VAR` is declared `Record<LogHue, string>`.
- No contribution figure is a literal (DEC-008): `grep -nE '[0-9],[0-9]{3}' app/regions/CareerLog.tsx components/ds/CommitLog.tsx` is empty. The only numeric literals permitted in these two files are CSS lengths, the `720`/`721` breakpoint pair, and the lane column indices `0`/`1`; list them in the PR description.
- The glyph budget holds: every non-ASCII codepoint in the two files is a member of GT-12's 16-codepoint census — `python3 -c "import sys;print(sorted({hex(ord(c)) for f in sys.argv[1:] for c in open(f,encoding='utf-8').read() if ord(c)>0x7f}))" app/regions/CareerLog.tsx components/ds/CommitLog.tsx` prints a subset of `0x2022 0x2013 0x2014 0x25c6 0x25cf 0x00b7 0x2192`.
- The fold exists and is authored closed: `grep -c 'data-kw-fold' /tmp/kw017.html` returns `1`, the emitted stylesheet contains both `@media (min-width: 721px)` with `::details-content` and `@media (max-width: 720px)` with `grid-template-areas`, and the four `preWeb3` hashes (`3cc4bc6`, `79c6a5b`, `4dc06be`, `9ee7ca6`) all appear inside it.
- Reflow safety is structural: `grep -nE 'white-space: *nowrap|width: *[0-9]{3,}px|min-width: *[0-9]{3,}px' components/ds/CommitLog.tsx` is empty, and `.cbody` declares `white-space: pre-wrap` with `overflow-wrap: anywhere`.
- The write surface is exactly two files: `git diff --name-only origin/main...HEAD` returns exactly `app/regions/CareerLog.tsx` and `components/ds/CommitLog.tsx`, and `git diff --stat origin/main...HEAD -- package.json package-lock.json styles content app/page.tsx app/layout.tsx app/regions/_contract.ts` is empty.

### At-merge gate

- `ci-ok` is green on the exact PR head, with `typegen`, `typecheck`, `lint` and `build` all run by KW-001's `.github/workflows/ci.yml`.
- The PR diff touches no file owned by a wave-3 sibling or by any upstream ticket: none of `app/regions/{Header,Instrument,ManPage,Contact,TmuxBar,BootOverlay}.tsx`, `app/regions/_contract.ts`, `app/page.tsx`, `app/layout.tsx`, `components/ds/{Pane,PaneBar,Meter,Scanline}.tsx`, `components/icons/**`, `content/**`, `styles/**`, `lib/**`, `scripts/**`, `package.json`, `package-lock.json`.
- After rebasing onto current `main`, `npm run typecheck` is still green — evidence that no exported symbol from `content/career-log.ts` or `app/regions/_contract.ts` was renamed underneath this branch.
- The PR description records: the observed `CAREER_LOG.length`, whether GATE-005 cut the side lane, the `First Load JS` before/after pair, the deliberate empty rail between Omni and Rowan, and the `REGION_META.careerLog.accessibleName` staleness.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.** The region performs no I/O, reads no network, holds no state and has no runtime failure mode. Its two failure modes are both at build time and both are intentional hard stops: `buildGraph` throws when the last commit is not `root`, and when the `preWeb3` rows are not a contiguous suffix. Both indicate that `content/career-log.ts` was edited into an inconsistent state, and a red build is strictly better than a career log rendered in the wrong order. A third, softer failure — GATE-005 cutting the side lane — is handled by deriving every count from `CAREER_LOG.length` rather than from a literal.

**Security.** No user input, no secrets, no network calls, and **no `dangerouslySetInnerHTML` anywhere** — commit bodies are rendered as text children of `<pre>`, never as HTML. Under DEC-015 the phone number `856-723-2521` must never reach the repository or the build output; this ticket originates no personal data at all, and `grep -r '856-723-2521' .` including `.next/` must stay empty.

**Migration.** None. There is one route, `/`, before and after; this ticket replaces a stub component's body. No persisted state, no URL change, no data format.

**Accessibility.** This is the ticket's real risk surface, and DEC-005 means nobody sweeps it later.

- **Heading outline.** The pane title renders as `<h2 id="region-career-log-title">` under KW-005's visually hidden `<h1>`. This region introduces no `<h3>`; each commit's title lives inside `<summary>`, which is a control, not a heading, and must not be marked up as one.
- **Structure.** The log is an `<ol>` named by `aria-labelledby`; the folded remainder is a second `<ol start="5">` with its own `aria-label`. `.graph` and `.rail` are `aria-hidden="true"` because they are decorative — the branch structure is redundantly available as text through `.ref` and through row order, which is why WCAG 1.4.11 does not bind them. That matters: `--border-pane` (`--bg2 #504945`) measures **1.86:1** against the pane surface, so if the rails were ever load-bearing they would fail. Record this in `deferred-findings.md` for KW-029 rather than silently recolouring a KW-003 token.
- **Colour.** Every `LogHue` clears 4.5:1 on `#1d2021` (lowest is `red` at 4.77). `--gray` at 4.47 is excluded at the type level. Hue is never the sole carrier of meaning: the row's identity is its hash, its years and its title.
- **Keyboard.** `<summary>` is natively focusable and operable with Enter and Space. This ticket adds no `tabindex`, no roving focus and no keyboard handler. The focus ring comes from KW-003's `:where(… summary …):focus-visible` rule in `styles/kw.css`; do not restyle it locally.
- **Reflow (WCAG 1.4.10).** At 320 px the three-column row is 274 px of fixed columns before `.cmsg` gets any width, so the `@media (max-width: 720px)` grid restructure is mandatory, not cosmetic. `.cbody` wraps with `pre-wrap` + `overflow-wrap: anywhere` so a long path in a commit body cannot force horizontal scroll. `body { overflow-x: clip }` from KW-003 is a backstop, not the fix.
- **Motion.** No animation, no transition, no `@keyframes`. The `summary::before` triangle rotates via a static `transform` under `[open]`, which is a state change and not an animation, so `prefers-reduced-motion` has nothing to suppress here.
- **Text spacing (WCAG 1.4.12).** Nothing in this component sets a fixed height on a text container, so the 1.5× line-height bookmarklet cannot clip it.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/design/_ds/**, app/regions/_contract.ts, components/ds/Pane.tsx, content/career-log.ts, styles/ds/layers/data.css, styles/ds/web.css, styles/kw.css
- Writes: app/regions/CareerLog.tsx, components/ds/CommitLog.tsx
- Contracts: components/ds/CommitLog.tsx
- Safety: career-log region accessibility semantics, career-log hue contrast budget

## Sibling boundaries and open gates

**Upstream, all merged before pickup.**

- **KW-003** owns every stylesheet: `app/globals.css`, `styles/ds/**`, `styles/kw.css`. It ships the `.commit`/`.rail` re-derivation (deviation **D3**, including the derived `.rail` margin), `.sr-only`, `.kw-hide-sm`, the `:focus-visible` ring in `--fg0`, the six-animation reduced-motion stop and `body { overflow-x: clip }`. This ticket consumes those by class name and writes **no** CSS file. Its own responsive rules are namespaced under `.kw-clog` and ship from inside the component, so they cannot collide with KW-003's global selectors; the two deliberate overrides — `.kw-clog .commit .graph` and `.kw-clog .rail` — are declared here and in the PR description.
- **KW-005** owns `app/regions/_contract.ts`, `app/page.tsx`, `app/layout.tsx` and `components/ds/{Pane,PaneBar,Meter,Scanline}.tsx`. This ticket replaces only its own stub file and adds one new file to `components/ds/`.
- **KW-006** owns `content/**`. Every string, hash, hue, `ref`, `lane` and body line is its property. If a fact looks wrong, file it against KW-006 and GATE-005; do not patch it here.

**Same wave, disjoint surfaces — do not touch.** KW-013/KW-014/KW-015 (`scripts/pipeline/**`, `lib/bundle/**`), KW-016 (`app/regions/ManPage.tsx` — it is the only region that overrides `.pane-body` to `overflow: auto`; this one must not), KW-018 (`app/regions/{Header,TmuxBar}.tsx`, `components/ds/TmuxBar.tsx` — it owns the sticky header whose height the `scroll-margin-top: 44px` literal here compensates for), KW-019 (`app/regions/Contact.tsx`), KW-020 (`app/regions/BootOverlay.tsx`), KW-021/KW-022 (`lib/viz/**`), KW-023 (`playwright.config.ts`, `e2e/**`, `.github/workflows/e2e.yml`).

**Downstream consumers of this ticket.**

- **KW-027** generates `/resume.txt`, `/kevinweaver.1`, the `metadata` export and the `<noscript>` fallback. It reads `content/**`, **not** this component — it depends on KW-017 so that the rendered pane and the text surfaces agree, not so that it can import `CommitLog`.
- **KW-029** is the accessibility gate. It runs axe, the reduced-motion checks and the reflow checks over this region and expects the `data-kw-*` hooks this ticket ships. It verifies; it does not sweep (DEC-005).
- **KW-031** takes the visual-regression baselines. The rail alignment at 320 / 720 / 900 / 1080 / 1560 px and the fold's open/closed states are its screenshots to own.
- **KW-032** is the capstone and owns the final composition of `app/page.tsx`.

**Open gates.** **GATE-005** (HG-5) is the only gate on this ticket, and it reaches it transitively through KW-006. It does not block pickup once KW-006 has merged; its residual effect is that clause (d) — whether the side-project lane appears at all — decides whether `CAREER_LOG` has eight rows or seven. Derive every count from the data. GATE-002 (`workflow` scope) touches only tickets that write `.github/workflows/**`; GATE-007 (scanline treatment) is absorbed by KW-003's `--scanline-opacity` token. Neither blocks this ticket.
