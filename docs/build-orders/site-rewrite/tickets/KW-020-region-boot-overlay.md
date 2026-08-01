# KW-020 — Region: boot overlay

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — One file, no new dependency and no algorithmic depth; the cost is the number of independent exit conditions (reduced motion, session flag, missing payload, unresolved token, click, Esc, any key, kill timer) that must every one of them fail closed, plus a small pure reduction over the grid payload.

**Risk:** medium — this is the only component on the site that legitimately paints a fixed full-cover layer over everything else, so a bug here is not a cosmetic defect, it is a blank site. Contained by a single-file write surface, by an unmount-on-dismiss rule, and by making every failure path render nothing rather than render the overlay.

**Phase hint:** 3

**Depends on:** KW-005, KW-006

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-009

**Decisions:** DEC-002, DEC-004, DEC-005, DEC-008

**Gates:** none

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

A first-time visitor sees a sixteen-line cold-start log play once, at 100 ms per line, entirely skippable by click, Esc or any key; a visitor with `prefers-reduced-motion: reduce` never sees it at all; a visitor who has already seen it in this tab never sees it again; and every figure in the log — contributions, days, repos, busiest day, mass point — comes out of the generated payload, so there is no number in `app/regions/BootOverlay.tsx` that can go stale.

## Context and evidence

### What the comp does today, measured

Re-measured this session against `docs/design/kevinweaver.dev.dc.html` at `e664d73a195facd64db58ba10952170ff01b4772` (1,033 lines, GT-13; the file is byte-identical between that commit and the current tip):

| What | Where in the comp | Measured behaviour |
|---|---|---|
| Overlay markup | `<sc-if value="{{ booting }}">`, comp:183-190 | `position:fixed;inset:0;z-index:90;background:var(--bg0);display:flex;align-items:center;justify-content:center;padding:24px;cursor:pointer` with `onClick="{{ onSkipBoot }}"` |
| Card | comp:185 | `.pane.focus` at `width:min(680px,100%)` |
| Bar | comp:186 | `.pane-bar` → `.dots` (three `<i>`) + `.pane-title` reading **`kevinweaver.dev — cold start`** |
| Body | comp:187 | `.pane-body` with `min-height:210px;font-size:12px;line-height:1.9;display:flex;flex-direction:column;gap:1px`, **empty in markup** — every line is appended imperatively |
| Reduced motion | comp:205-206 | `this.rm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;` then `booting: !this.rm && (p.startState \|\| 'idle') === 'boot'` |
| Line data | `prepBoot()`, comp:421-435 | **ten** hardcoded `[text, kind]` pairs, including `'  4,817 contributions · busiest 284 · 17 zero days'` and `'  quantile rejected: 156-day mass point at n=1'` |
| Cadence | `stepBoot(ts)`, comp:436-447 | `want = Math.floor((ts - this.bootT0) / 100)`; appends `<div>` nodes with `animation:kw-logIn .3s ease both;white-space:pre` and a per-kind colour; ends when `want > this.bootLines.length + 2` |
| Kill timer | comp:412 | `this.bootKill = setTimeout(() => this.endBoot(), 2200)` |
| Dismiss | `endBoot()`, comp:448 | flips `booting` false, then re-sizes and repaints the canvases |

Two properties of that implementation are good and are kept: the reduced-motion bypass is total (never shows boot, never starts the rAF loop — `design-comp-spec` §9.6 calls it "a genuinely good reduced-motion story", and its adversarial verifier independently reproduced "boot defaulting off"), and the 100 ms cadence sits comfortably inside the 2,200 ms kill timer.

Three properties are defects this ticket fixes:

1. **Every number is fabricated.** **C-4** (content-ia's verifier, and the correction wins over the body of its own doc) refuted the claim that `4,817 / 284 / 17 zero / 156-day mass point` are "the 370-day figures": measured over the trailing 370 days both actors produce **7,933 contributions · 3 zero days · 69 days at n=1**, and the strings `370`, `4,817` and `17 zero` appear nowhere in `docs/research/2026-07-31-measured-findings.md`. They are output of the comp's seeded mock generator. **C-1** then showed the whole family of candidate totals (10,001 / 10,006 / 13,360 / 13,147) are two different data sources being mixed, because **GT-1** proved the local `gh` token has no SAML grant for `ethereum-optimism`. **DEC-008** settles it permanently: no contribution figure is a literal anywhere in copy; every number reads from a payload that carries `generatedAt`, `windowStart`, `windowEnd`, `dayCount` and `repoCountDefinition` alongside it. **C-20** makes the same point for the repo count — **GT-7** gives five defensible values (77 / 77 / 50 / 85 / 22) and none of them is content-ia §9's "58", so the count *and its definition* travel in the payload.
2. **The only way to skip it is a mouse click.** `design-comp-spec` §9.5's control census: six of seven controls, `onSkipBoot` among them, are `<span onClick>` — not focusable, not keyboard-activatable, no role. The same register's row for this overlay reads: *"The `<sc-if>` boot overlay is a modal that traps nothing"* → `role="dialog" aria-modal="true"`, focus the skip control on mount, restore focus on dismiss, `Esc` to skip. This ticket takes that option rather than the register's alternative (`aria-hidden` + click-through), because the overlay genuinely covers the page and a covered page must be dismissible from the keyboard.
3. **It replays.** The comp has no session memory. content-ia §9: *"Show boot at most once per session (`sessionStorage`). A returning visitor watching the same 1.6 s log is a cost, not a feature."*

### Why the copy is not in this file

**DEC-005** (synthesis D-05) partitions every same-wave ticket by file so the fleet stays parallel and `serializes_with` stays empty — **C-11** established that `serializes_with` is the one edge type aiur does *not* enforce at runtime, so a plan that leans on it is both slower and unsafe. The consequence here is a clean producer/consumer split: **KW-006** owns all sixteen line templates in `content/boot.ts`, this ticket owns rendering them. It also means there is **no cross-cutting accessibility sweep ticket** — this region owns its own dialog semantics, focus management, motion behaviour and 320 px reflow, and KW-029 verifies rather than sweeps.

**DEC-002** (App Router, React Server Components, no `output:'export'`) is why this is the interesting file in the region set: KW-005 ships the shell with **zero** `'use client'` directives, and this ticket adds the first one. Everything imported from this file crosses the client boundary, which is the single most expensive mistake available here.

**DEC-004** (all control glyphs become inline SVG icons) covers one glyph on this surface: `U+283F ⠿`, the spinner marker on boot line 6, listed in KW-004's glyph table with **KW-020** as the consuming ticket. `design-comp-spec` C2 measured that `⠿` falls outside every `unicode-range` in the DS's JetBrains Mono, so it renders from the fallback stack. KW-004 is deliberately **not** a hard dependency (see "Sibling boundaries"); this ticket imports `components/icons` if it is there and degrades to a plain-text marker if it is not.

**Requirements this ticket serves.** REQ-002 (the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file), REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder, no invented employer, no hardcoded figure), REQ-009 (the page carries a correct heading outline, landmark structure and bypass affordance, and the shell renders with zero client JavaScript — this region is the one sanctioned exception, and it therefore owns proving that its client boundary stops at this file and that its dialog semantics are complete).

### Plan-context navigation

All links pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- **Pack index:** `docs/build-orders/site-rewrite/README.md` (pack-relative `../README.md`) — authority map and the KW-01…KW-32 → `KW-001`…`KW-032` ordinal mapping.
- **Wave and graph analysis:** `docs/build-orders/site-rewrite/02-current-target-delta.md`, plus the authoritative topological table, critical path and write-surface partition proof in `docs/research/2026-07-31-decomposition-synthesis.md` §6. This ticket is wave 3 / level 3, off the critical path, one of eleven tickets dispatched in that wave.
- **Decision registry:** `docs/build-orders/site-rewrite/03-technical-decisions.md` (DEC-002, DEC-004, DEC-005 and DEC-008 are D-02, D-04, D-05 and D-08 in the synthesis §3 table).
- **This ticket's upstream pointers:** the synthesis §5 entry **"KW-20 — Region: boot overlay"**, expanded below in "Refreshable implementation notes".
- **Copy source of record:** `docs/research/2026-07-31-content-ia.md` §9 (the sixteen lines and the four rules), read together with its `## Verification corrections` C4 and C6 — where a correction contradicts the body, the correction wins.
- **Comp source of record:** `docs/design/kevinweaver.dev.dc.html` lines 183-190, 205-206, 412, 421-448; `docs/research/2026-07-31-design-comp-spec.md` §2.8 and §9.5.

## Scope

- Replace KW-005's `app/regions/BootOverlay.tsx` stub with the real region component, marked `'use client'`, exporting `BootOverlay(props: BootOverlayProps)`.
- Render all sixteen `BOOT_LINES` from `content/boot.ts` through `fill()`, with per-kind colour, the `spinner` / `agent` markers and the right-aligned `ok` badge.
- Resolve every `BootToken` from the generated payload at `/data/v1/manifest.json` and `/data/v1/grid.json` at runtime, behind a structural guard, and render nothing at all if any token cannot be resolved.
- Reveal lines on a `requestAnimationFrame` clock at a 100 ms cadence, auto-dismiss two lines past the end, and hold a 2,200 ms hard kill timer as a backstop.
- Dismiss on overlay click, on a real `<button>` skip control, on `Escape`, and on any non-modifier keypress.
- Bypass the overlay entirely — no fetch, no timer, no DOM — when `matchMedia('(prefers-reduced-motion: reduce)').matches`.
- Gate the overlay to once per browsing session with `sessionStorage`, set before the first frame so no dismissal path can cause a replay.
- Give the overlay `role="dialog"`, `aria-modal="true"` and an accessible name from KW-005's `REGION_META.bootOverlay.titleId`, move focus to the skip control on mount, and restore the previously focused element on dismiss.
- Unmount to `null` on dismiss so the DS's "at most one focused pane per view" rule stays true against KW-025's gource pane.

## Non-goals

- Editing `content/boot.ts` or any other file under `content/` — KW-006 owns the sixteen templates, the token vocabulary and `fill()`.
- Editing `app/page.tsx`, `app/layout.tsx` or `app/regions/_contract.ts` — KW-005 owns them and already mounts `<BootOverlay />` as the last child of the page fragment.
- Adding CSS to `app/globals.css` or `styles/**` — KW-003 owns every stylesheet, including the `kw-logIn` keyframe this component references.
- Adding a dependency or touching `package.json` / `package-lock.json` — DEC-003 freezes both after KW-001.
- Authoring anything under `components/icons/**` — KW-004 owns the icon module; this ticket imports it or degrades without it.
- Writing the payload, or any part of the pipeline that produces `public/data/v1/**` — KW-009, KW-010, KW-013 and KW-014 own that, and KW-012 owns the wire format.
- Reusing or reimplementing `lib/bundle/**` — this component performs a narrow read of two static JSON documents and must not import the codec (see "Contract and invariants" for why).
- Any Playwright, axe or visual-regression test — KW-023 builds the harness, KW-029 asserts the accessibility behaviour of this region, KW-031 owns snapshots.
- The freshness pill, the tmux position segment, the man page or any other surface that displays payload figures — KW-018, KW-016 and KW-025 own those and read the payload themselves.

## Existing owner and reuse target

`app/regions/BootOverlay.tsx` **is created by KW-005**, which is a hard dependency of this ticket. It does not exist at `e664d73a195facd64db58ba10952170ff01b4772` — that commit is still the pre-rewrite Pages Router site (`pages/index.js`, `components/HomeHero.js`, `styles/globals.scss`). KW-005's stub is deliberately inert:

> `BootOverlay` renders **nothing** in this ticket: `return null`, with the contract comment recording that KW-020 owns the once-per-session, fully skippable, reduced-motion-bypassed overlay and its `role="dialog" aria-modal="true"` semantics. A stub that paints a full-cover fixed layer would black out the page for every other wave-3 agent.

Replace that file wholesale. Nothing else in the repository changes.

The three modules this ticket consumes, all created by named upstream tickets:

| Symbol | Module | Created by | Status at pickup |
|---|---|---|---|
| `BootOverlayProps`, `REGION_META` | `app/regions/_contract.ts` | **KW-005** (hard dep) | must exist; if absent, stop |
| `Pane`, `PaneProps` | `components/ds/Pane.tsx` | **KW-005** (hard dep) | must exist; if absent, stop |
| `BOOT_LINES`, `BOOT_PANE_TITLE`, `BootLine`, `BootToken`, `fill` | `content/boot.ts` | **KW-006** (hard dep) | must exist; if absent, stop |
| `SpinnerIcon` | `components/icons` | **KW-004** (no edge) | optional; degrade to a text marker |
| `manifest.json`, `grid.json` wire shapes | `public/data/v1/**` | **KW-014** writes them, **KW-012** types them (no edge) | optional; overlay does not run without them |

If `content/boot.ts` or `app/regions/_contract.ts` is missing on the base branch, the upstream ticket has not merged. **Stop and report — do not create the file yourself.** Authoring a local copy of either would fork the contract five ways (KW-016, KW-017, KW-019, KW-020, KW-027 all consume `content/`).

## Contract and invariants

### Invariant 1 — the overlay is the last thing to render and the first thing to give up

Every one of the following makes the component return `null` and do nothing else. There is no partial state, no "reduced" variant, no retry:

| Condition | Detected by | Result |
|---|---|---|
| Server render / first client render | no `useEffect` has run yet | `null` — this is what keeps SSR output and hydration identical |
| `prefers-reduced-motion: reduce` | `matchMedia('(prefers-reduced-motion: reduce)').matches` | `null`, **before** any fetch is issued |
| Already seen this session | `sessionStorage.getItem(SESSION_KEY) !== null` | `null` |
| `sessionStorage` unavailable or throws | `try/catch` around the read | `null` — fail closed, a partitioned or blocked storage context means we cannot promise "once", so we promise "never" |
| `manifest.json` or `grid.json` non-200, unparseable, or slower than `FACTS_TIMEOUT_MS` | `fetch` + `AbortController` | `null` |
| Payload fails the structural guard | `isManifestWire` / `isGridWire` | `null` |
| Any `fill()` call throws on an unresolved token | `try/catch` around the whole sixteen-line map | `null` |
| Dismissed by click / Esc / any key / kill timer | state | `null`, and the effect cleanup clears the rAF handle and both listeners |

**The overlay never renders a raw `{token}` and never renders a partial log.** `fill()` throwing is a *feature* — KW-006 specified it as "a missing payload field fails the build instead of shipping `{contributions}` to a visitor" — and here it downgrades to "fails the overlay instead of shipping `{contributions}` to a visitor".

### Invariant 2 — no payload figure is a literal in this file

DEC-008, restated for a renderer. The synthesis's acceptance line reads "no integer literal in the component"; scoped by DEC-008 that means **no payload figure**. The permitted-literals list is exhaustive and is what the agent gate checks against:

| Permitted | Values |
|---|---|
| Named timing constants | `LINE_MS = 100`, `TAIL_LINES = 2`, `KILL_MS = 2200`, `FACTS_TIMEOUT_MS = 400` |
| Structural comparisons and indices | `0`, `1` |
| CSS values, written as quoted strings | `'24px'`, `'12px'`, `'210px'`, `'1.9'`, `'1px'`, `'min(680px, 100%)'`, and `zIndex: 90` |

Forbidden, without exception: any contribution count, day count, active/zero-day count, streak, mass-point count, window length, repo count, per-actor total, or busiest-day figure. Every one of them arrives as a pre-formatted string from the payload derivation. The comp's `4,817`, `284`, `17`, `156`, `1,826` and content-ia §9's `10,001`, `2,038`, `1,179`, `375`, `58` are all forbidden, and every one of them has already been measured wrong at least once (C-1, C-4, C-6).

### Invariant 3 — the client boundary stops at this file

This is the only `'use client'` file in `app/regions/` after wave 3. Everything it imports is compiled into the client graph. Therefore:

- Import **only** `react`, `./_contract`, `@/components/ds/Pane`, `@/content/boot`, and optionally `@/components/icons`.
- Never import another `content/` module. `content/resume.ts`, `content/manpage.ts` and `content/career-log.ts` are the entire résumé and man page; pulling one in would ship the site's whole text corpus as client JavaScript to a visitor who may never see the overlay.
- Never import `lib/**`. `lib/bundle/codec.ts` (KW-012) carries the front-coded dictionary decoder and the event chunk decoder; this component needs neither, and importing it would put the entire codec in the client bundle for two `JSON.parse` calls.
- Never add `'use client'` to `app/page.tsx` or `app/layout.tsx`. Importing a client component from a server component is exactly how this is supposed to work; the boundary is declared in the leaf.

### Producer interface consumed from KW-005 — quote verbatim, do not paraphrase

```ts
// app/regions/_contract.ts — owned by KW-005
export interface RegionCommonProps {
  /** Fragment target for the header nav. Defaults to REGION_META[slot].anchorId. */
  id?: string
  /** Appended to the region's own class list; never replaces it. */
  className?: string
  /** Layout escape hatch used by the page shell only. */
  style?: CSSProperties
}

export interface BootOverlayProps extends RegionCommonProps {}

export const REGION_META = {
  // ...
  bootOverlay: { landmark: 'div', anchorId: null, titleId: 'region-boot-overlay-title', accessibleName: 'kevinweaver.dev — cold start', headingLevel: 2 },
} as const satisfies Record<RegionSlot, RegionMeta>
```

`REGION_META.bootOverlay.landmark` is `'div'`, which is exactly right for a `role="dialog"` container: the overlay is not a landmark, it is a modal layer. `REGION_META.bootOverlay.accessibleName` is byte-identical to `BOOT_PANE_TITLE` in `content/boot.ts` (`kevinweaver.dev — cold start`), so the visible pane title *is* the accessible name and `aria-labelledby` is the correct wiring — do not add an `aria-label` that would silently win over it.

```ts
// components/ds/Pane.tsx — owned by KW-005, the props this ticket uses
export interface PaneProps {
  title?: ReactNode
  titleId?: string
  titleAs?: 'span' | 'h2' | 'h3'
  dots?: boolean
  right?: ReactNode
  focus?: boolean
  style?: CSSProperties
  bodyStyle?: CSSProperties
  children?: ReactNode
}
export function Pane(props: PaneProps): ReactNode
```

`.pane-body{overflow:hidden}` is a hard DS rule (`layers/pane.css:13`, measured on disk). Do **not** pass an overflow override: the whole log is sized to fit, and a scrollbar inside a 1.6-second animation is a defect, not a feature.

### Producer interface consumed from KW-006 — quote verbatim, do not paraphrase

```ts
// content/boot.ts — owned by KW-006
export type BootKind = 'cmd' | 'ok' | 'warn' | 'dim' | 'agent';

export interface BootLine {
  readonly kind: BootKind;
  /** Leading marker slot. The renderer supplies ⠿ / ◆ or an SVG icon (DEC-004). */
  readonly marker: 'spinner' | 'agent' | null;
  /** ASCII template. Every value is a `{token}`; DEC-008 forbids literals. */
  readonly template: string;
  /** true renders the right-aligned `ok` badge. */
  readonly badge: boolean;
}

export type BootToken =
  | 'contributions' | 'days' | 'repos' | 'zeroDays'
  | 'activeDays' | 'busiestCount' | 'busiestDate' | 'massPointDays'
  | 'actors' | 'privateVolumes' | 'agentSince' | 'windowStart'
  | 'repoCountDefinition' | 'date';

/** Exactly sixteen entries, in play order. */
export const BOOT_LINES: readonly BootLine[];
export const BOOT_TOKENS: readonly BootToken[];
export const BOOT_PANE_TITLE: string;          // 'kevinweaver.dev — cold start'

/**
 * Pure `{token}` substitution. Throws on an unresolved token so a missing payload
 * field fails the build instead of shipping `{contributions}` to a visitor.
 */
export function fill(
  template: string,
  values: Readonly<Partial<Record<BootToken, string>>>,
): string;
```

Two consequences that are easy to get wrong:

- `marker` is `'spinner' | 'agent' | null`, **not** a glyph. KW-006 deliberately keeps `⠿` and `◆` out of the template strings so this ticket can choose SVG or text. Resolve the marker here.
- `kind` maps to colour here, not there. The map is `cmd → --fg1`, `ok → --green`, `warn → --yellow`, `dim → --fg4`, `agent → --purple`, exactly as content-ia §9 specifies and exactly as the comp's `stepBoot` colour table does for the first four (comp:443).

### Producer interface consumed from the payload — a runtime read, not a module import

This component reads two static documents that **KW-014** writes and **KW-012** types. Neither is a hard dependency, because a region must never be blocked on the pipeline: it reads them over HTTP at runtime and does not exist for the compiler. The keys below are the *wire* form as published by KW-012's worked production shape; quote this block into the file as the guard's shape and nothing more.

```ts
// public/data/v1/manifest.json — long keys. Only the fields this region reads.
interface ManifestWire {
  generatedAt: string            // 'YYYY-MM-DDTHH:MM:SSZ'
  windowStart: string            // 'YYYY-MM-DD', oldest day in the window
  dayCount: number               // inclusive day count of the window
  repoCount: number
  repoCountDefinition: 'ownerPublic' | 'ownerPublicNonFork' | 'withMemberAffiliations' | 'repositoriesContributedTo'
  actors: readonly { login: string; kind: 'human' | 'agent' }[]
}

// public/data/v1/grid.json — SHORT keys, and the arrays run FORWARD in time from `start`.
interface GridWire {
  start: string                  // 'YYYY-MM-DD', the OLDEST day, not windowEnd
  n: number                      // === ManifestWire.dayCount
  e: readonly number[]           // actors[0] (human) daily contribution counts, length n
  a: readonly number[]           // actors[1] (agent) daily contribution counts, length n
  p: readonly number[]           // restricted/private contributions, MONTHLY buckets
  pStart: string                 // 'YYYY-MM'
}
```

The axis flip is the trap: `grid.start` is the **oldest** day and the arrays run forward, while the viz layer indexes day 0 as `windowEnd` and counts backwards. This component only ever walks forward from `start`, so it never needs the flip — but do not copy an index convention out of `lib/viz/**`.

### Producer interface this ticket owns

```ts
// app/regions/BootOverlay.tsx
export function BootOverlay(props: BootOverlayProps): ReactNode
```

That named export is the entire public surface. `app/page.tsx` already imports it as `import { BootOverlay } from './regions/BootOverlay'`. Do not add a default export, do not rename it, do not add a second export — `app/page.tsx` belongs to KW-005 and is not editable from here.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-read the cited files at pickup; if a comp line number has moved, the named selector or method still governs (per C-30, selector first, line number second).

### Step 0 — verify the base

```bash
test -f app/regions/_contract.ts && test -f components/ds/Pane.tsx   # KW-005 merged
test -f content/boot.ts                                              # KW-006 merged
grep -n "BootOverlay" app/page.tsx                                   # the mount point exists
grep -n '"@/\*"' tsconfig.json                                       # path alias; if absent use relative imports
npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build
```

The build must be green **before** you change anything. If `content/boot.ts` or `app/regions/_contract.ts` is missing, an upstream hard dependency has not merged: stop and report. If the `@/*` alias is absent, use relative imports (`../../content/boot`) rather than editing `tsconfig.json` — that file belongs to KW-001 and DEC-003 freezes the manifest set.

### The single file to modify

```
app/regions/BootOverlay.tsx        (replace KW-005's `return null` stub)
```

Nothing else. Not a test file, not a stylesheet, not a barrel, not a fixture under `public/`.

### Step 1 — module head and constants

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Pane } from '@/components/ds/Pane'
import { BOOT_LINES, BOOT_PANE_TITLE, fill } from '@/content/boot'
import type { BootKind, BootToken } from '@/content/boot'

import { REGION_META } from './_contract'
import type { BootOverlayProps } from './_contract'

/** comp:438 — `want = Math.floor((ts - this.bootT0) / 100)`. */
const LINE_MS = 100
/** comp:446 — `want > this.bootLines.length + 2`. */
const TAIL_LINES = 2
/** comp:412 — `setTimeout(() => this.endBoot(), 2200)`. Backstop only. */
const KILL_MS = 2200
/** A boot log that starts after the page is already painted is worse than none. */
const FACTS_TIMEOUT_MS = 400

const SESSION_KEY = 'kw.boot.v1'
const MANIFEST_URL = '/data/v1/manifest.json'
const GRID_URL = '/data/v1/grid.json'

/** content-ia §9 colour table; `agent` is the one kind the comp does not have. */
const KIND_COLOR: Record<BootKind, string> = {
  cmd: 'var(--fg1, #ebdbb2)',
  ok: 'var(--green, #b8bb26)',
  warn: 'var(--yellow, #fabd2d)',
  dim: 'var(--fg4, #a89984)',
  agent: 'var(--purple, #d3869b)',
}

/** GT-7 gives five defensible repo counts; the payload says which one it used. */
const REPO_COUNT_LABEL: Record<string, string> = {
  ownerPublic: 'public',
  ownerPublicNonFork: 'public non-fork',
  withMemberAffiliations: 'public + member',
  repositoriesContributedTo: 'contributed-to',
}

type BootFacts = Readonly<Record<BootToken, string>>
```

`var(--token, literal)` with a literal fallback is the pattern KW-005 Invariant 5 establishes for regions: DS custom properties, never a bare hex. The fallbacks are the measured gruvbox values from `docs/design/_ds/.../tokens/colors.css:5-11`, so the component is correct even if KW-003 has not merged.

### Step 2 — the payload read and the derivation

Both functions are pure except for `fetch`. Keep them module-scope, above the component, so they are trivially reviewable.

```tsx
function isManifestWire(v: unknown): v is ManifestWire { /* typeof checks on the six fields */ }
function isGridWire(v: unknown): v is GridWire { /* typeof + Array.isArray + g.n === g.e.length === g.a.length */ }

async function readFacts(signal: AbortSignal): Promise<BootFacts | null> {
  const [m, g] = await Promise.all([
    fetch(MANIFEST_URL, { signal }).then((r) => (r.ok ? r.json() : null)),
    fetch(GRID_URL, { signal }).then((r) => (r.ok ? r.json() : null)),
  ])
  if (!isManifestWire(m) || !isGridWire(g)) return null
  if (g.n !== m.dayCount) return null           // two payload halves out of step
  return derive(m, g)
}
```

`derive` is the only arithmetic in the file. It walks the daily series once:

| Token | Derivation | Formatted with |
|---|---|---|
| `contributions` | `sum(e) + sum(a) + sum(p)` | `NUM.format` |
| `days` | `m.dayCount` | `NUM.format` |
| `activeDays` | count of `i` where `e[i] + a[i] > 0` | `NUM.format` |
| `zeroDays` | count of `i` where `e[i] + a[i] === 0` | `NUM.format` |
| `busiestCount` | `max(e[i] + a[i])` | `NUM.format` |
| `busiestDate` | `addDays(g.start, argmax)` | `dayLabel` |
| `massPointDays` | count of `i` where `e[i] + a[i] === 1` | `NUM.format` |
| `actors` | `m.actors.length` | `NUM.format` |
| `repos` | `m.repoCount` | `NUM.format` |
| `repoCountDefinition` | `REPO_COUNT_LABEL[m.repoCountDefinition]`; **unknown key ⇒ return `null`** | — |
| `privateVolumes` | `g.p.some((v) => v > 0) ? '1' : '0'` — the count of redacted volumes mounted, never a repository or employer name | — |
| `agentSince` | `addDays(g.start, firstIndexWhere(a[i] > 0))`; no agent activity ⇒ return `null` | `dayLabel` |
| `windowStart` | `m.windowStart` verbatim (ISO) | — |
| `date` | day part of `m.generatedAt` | `dayLabel` |

```tsx
const NUM = new Intl.NumberFormat('en-US')
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })

/** '2026-05-17' -> '17 may 2026'. UTC-pinned so the label never shifts by timezone. */
function dayLabel(iso: string): string {
  const [y, mo, d] = iso.split('-').map(Number)
  return DAY.format(new Date(Date.UTC(y, mo - 1, d))).toLowerCase()
}
```

`Intl.DateTimeFormat` is pinned to `'en-GB'` and `timeZone: 'UTC'` on purpose: the default locale would render `May 17, 2026` for a US visitor and `17/05/2026` elsewhere, and the default timezone would move the busiest day across a date boundary west of UTC. Everything else on the page is UTC-pinned by the pipeline, so this must be too.

**Worked fixture.** Drop this into `public/data/v1/` locally to develop against — do **not** commit it (`public/data/v1/**` is KW-014's surface and is a safety surface of this ticket):

```jsonc
// manifest.json
{"v":1,"generatedAt":"2026-07-31T16:39:00Z","commit":"e664d73",
 "windowStart":"2026-07-27","windowEnd":"2026-07-31","dayCount":5,
 "repoCount":58,"repoCountDefinition":"ownerPublicNonFork",
 "actors":[{"id":0,"login":"its-everdred","kind":"human"},
           {"id":1,"login":"its-applekid","kind":"agent"}],
 "degraded":[],"chunkSize":1500,"chunks":1,"events":12,"integrity":{}}

// grid.json
{"start":"2026-07-27","n":5,"e":[3,0,1,9,4],"a":[0,0,0,2,1],
 "p":[6],"pStart":"2026-07","bands":[0,1,2,4,8,16,32,64,128,256]}
```

Daily totals are `[3, 0, 1, 11, 5]`, so `derive` must produce exactly:

```
contributions '26'   days '5'          activeDays '4'      zeroDays '1'
busiestCount '11'    busiestDate '30 jul 2026'             massPointDays '1'
actors '2'           repos '58'        repoCountDefinition 'public non-fork'
privateVolumes '1'   agentSince '30 jul 2026'
windowStart '2026-07-27'               date '31 jul 2026'
```

and the sixteen rendered lines must read:

```
$ boot --target=kevinweaver.dev
  swe-rts-terminal · gruvbox dark medium · jetbrains mono                 ok
$ mount /dev/github its-everdred its-applekid
  2 actors · 58 public non-fork repos · 1 redacted volume                 ok
$ fetch contributions --since=2026-07-27 --merge=sum-per-day
⠿ 26 contributions across 5 days                                          ok
  4 active · busiest 11 on 30 jul 2026
$ bin --log2 --steps=10
  quantile rejected: 1-day mass point at n=1
  doubling bands accepted                                                 ok
$ seek --to=now --reverse
  playback runs backwards. newest first.
  the longer you stay, the further back you get
◆ its-applekid online since 30 jul 2026
$ render whoami arc contact
  ready.
```

If your output differs by one character from the above on that fixture, the derivation is wrong — fix it before touching the animation.

### Step 3 — the component

```tsx
export function BootOverlay({ id, className, style }: BootOverlayProps) {
  const [lines, setLines] = useState<readonly string[] | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [done, setDone] = useState(false)
  const skipRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<Element | null>(null)

  const dismiss = useCallback(() => setDone(true), [])

  // 1. decide, once, on mount
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) !== null) return
      window.sessionStorage.setItem(SESSION_KEY, '1')   // set BEFORE the first frame
    } catch {
      return                                           // storage blocked -> never run
    }
    const ac = new AbortController()
    const timer = window.setTimeout(() => ac.abort(), FACTS_TIMEOUT_MS)
    readFacts(ac.signal)
      .then((facts) => {
        if (ac.signal.aborted || facts === null) return
        try {
          setLines(BOOT_LINES.map((l) => fill(l.template, facts)))
        } catch {
          /* unresolved token: DEC-008 says show nothing rather than a brace */
        }
      })
      .catch(() => {})
      .finally(() => window.clearTimeout(timer))
    return () => { window.clearTimeout(timer); ac.abort() }
  }, [])

  // 2. the clock — rAF, matching comp:436-447
  useEffect(() => { /* ... see below ... */ }, [lines, dismiss])

  // 3. dismissal keys — Esc and any non-modifier key
  useEffect(() => { /* ... see below ... */ }, [lines, done, dismiss])

  // 4. focus in, focus back
  useEffect(() => { /* ... see below ... */ }, [lines, done])

  if (lines === null || done) return null
  return (/* ... markup ... */)
}
```

The clock, transcribed from `stepBoot` with the frame-rate dependence removed (it is already time-based, unlike the viz decay constants KW-021 has to fix):

```tsx
useEffect(() => {
  if (lines === null) return
  let raf = 0
  let t0 = 0
  const step = (ts: number) => {
    if (t0 === 0) t0 = ts
    const want = Math.floor((ts - t0) / LINE_MS)
    if (want > lines.length + TAIL_LINES) { dismiss(); return }
    setRevealed((prev) => (want > prev ? Math.min(want, lines.length) : prev))
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  const kill = window.setTimeout(dismiss, KILL_MS)
  return () => { cancelAnimationFrame(raf); window.clearTimeout(kill) }
}, [lines, dismiss])
```

`setRevealed` is called with a functional updater that returns the previous value unchanged when the count has not moved, so React bails out and there is no re-render on the ~5 of 6 frames that reveal nothing.

Keys, per content-ia §9's rule "add `Esc` and any keypress":

```tsx
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta']
// ...
const onKey = (ev: KeyboardEvent) => { if (!MODIFIERS.includes(ev.key)) dismiss() }
window.addEventListener('keydown', onKey)
```

Bare modifier presses are excluded so that a visitor reaching for `Cmd`/`Ctrl` on the way to a browser shortcut does not lose the overlay mid-chord; `Escape` is covered by the general case and needs no special branch. Do **not** call `preventDefault` — the comp's unconditional `Space` `preventDefault` on `window` (comp:478-482) is a known defect being deleted by KW-026, and reintroducing that shape here would be a regression.

Focus, per `design-comp-spec` §9.5's register row for this overlay:

```tsx
useEffect(() => {
  if (lines === null || done) return
  restoreRef.current = document.activeElement
  skipRef.current?.focus()
  return () => {
    const el = restoreRef.current
    if (el instanceof HTMLElement && document.contains(el)) el.focus()
  }
}, [lines, done])
```

There is **no focus trap and none is wanted**: `Tab` is a key, and any key dismisses, so the first attempt to leave the dialog closes it. Adding a trap would be strictly worse — a trap plus a 1.6-second lifetime is how you strand a keyboard user. Say so in a comment so a later reviewer does not "fix" it.

### Step 4 — the markup

```tsx
const meta = REGION_META.bootOverlay

return (
  <div
    id={id}
    className={className}
    role="dialog"
    aria-modal="true"
    aria-labelledby={meta.titleId}
    onClick={dismiss}
    style={{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'var(--bg0, #282828)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', cursor: 'pointer',
      ...style,
    }}
  >
    <Pane
      focus
      dots
      title={BOOT_PANE_TITLE}
      titleId={meta.titleId}
      titleAs="h2"
      right={
        <button ref={skipRef} type="button" onClick={dismiss}
                style={{ background: 'none', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
          skip
        </button>
      }
      style={{ width: 'min(680px, 100%)' }}
      bodyStyle={{ minHeight: '210px', fontSize: '12px', lineHeight: '1.9',
                   display: 'flex', flexDirection: 'column', gap: '1px' }}
    >
      {lines.map((text, i) => (
        <div key={BOOT_LINES[i].template}
             style={{
               whiteSpace: 'pre', color: KIND_COLOR[BOOT_LINES[i].kind],
               visibility: i < revealed ? 'visible' : 'hidden',
               animation: i < revealed ? 'kw-logIn .3s ease both' : undefined,
               display: 'flex', gap: '1ch',
             }}>
          {/* marker slot, then text, then the right-aligned ok badge */}
        </div>
      ))}
    </Pane>
  </div>
)
```

Five things in that block are deliberate and are the reason it is written out here:

1. **All sixteen lines are in the DOM from the first frame**; unrevealed ones are `visibility: 'hidden'`. This does three jobs at once — assistive technology gets the complete log immediately instead of a sixteen-step live-region firehose (`design-comp-spec` §9.5 flags exactly that failure on the event log), the pane's height is stable so there is no cumulative layout shift as lines land, and the `key` can be the template string because the list never changes identity. The comp's `el.appendChild` growth is not reproduced.
2. **`animation: 'kw-logIn ...'` references KW-003's keyframe by name** (comp:31, ported verbatim into `styles/kw.css` by KW-003). KW-003 is not a dependency of this ticket, so before it merges the animation silently does nothing and the line simply appears. That is a correct degradation — do not inline a `@keyframes` here and do not add one to any stylesheet.
3. **`...style` spreads last** so the page shell's layout escape hatch wins, per `RegionCommonProps`.
4. **The skip control is a real `<button type="button">`** in the pane bar's `right` slot, so it is the first focusable element inside the dialog and is reachable without a mouse. This is the fix for `design-comp-spec` §9.5's "6 of 7 controls are `<span onClick>`". Its click handler does not need `stopPropagation` — the parent handler dismisses too.
5. **`zIndex: 90`** matches comp:184 and sits above both the tmux bar and the z-80 scanline (`design-comp-spec` §2.1, measured: the scanline is "above every pane and above the tmux bar (z 70), below the boot overlay (z 90)"). Do not raise it, and do not try to suppress the scanline from here — it is KW-003's, under GATE-007.

The marker slot:

```tsx
{line.marker === 'spinner' ? <SpinnerIcon aria-hidden="true" /> : line.marker === 'agent' ? '◆' : null}
```

`SpinnerIcon` comes from `@/components/icons` (KW-004). **KW-004 is not a dependency of this ticket.** If `components/icons/index.ts` does not exist on the base branch, render the plain text `⠿` for `spinner` — it is one of the sixteen GT-12 codepoints, so it is inside the allowed character set. Be honest about what that costs: `design-comp-spec` C2 measured `U+283F` outside every `unicode-range` in the DS's JetBrains Mono, so it renders from the `ui-monospace, SFMono-Regular, Menlo, monospace` fallback stack and its cross-platform appearance is unverified. That is a degraded but non-blocking presentation on a decorative surface; KW-004's SVG is the real fix. Do not author an icon file here — KW-004 owns `components/icons/**`, and KW-032's composition pass picks up the icon if the timing goes the other way. `◆` U+25C6 stays text under DEC-004 ("deliberately not replaced").

The `ok` badge is a right-aligned `<span style={{ marginLeft: 'auto', color: KIND_COLOR.ok }}>ok</span>` rendered when `BOOT_LINES[i].badge` is true — that is why the parent row is a flex row with `marginLeft: 'auto'` on the badge rather than the comp's column-padded ASCII alignment, which breaks at any width the comp did not test.

### Step 5 — manual smoke, exact steps

```bash
npm run dev            # http://localhost:3000
```

Chrome DevTools → ⋮ → More tools → Rendering:

1. **Emulate CSS media feature `prefers-reduced-motion: reduce`** → hard reload. No overlay. Network tab shows **no** request to `/data/v1/manifest.json` or `/data/v1/grid.json`. This is the DEC-008-adjacent property that matters most: reduced motion is checked before the fetch, not after.
2. Set it back to **no-preference**, clear `sessionStorage` (Application → Session Storage → delete `kw.boot.v1`), hard reload → the overlay plays, lines land at ~100 ms, it self-dismisses under 2 s, and the page underneath is interactive afterwards.
3. Replay, press **Esc** on the third line → gone immediately, and focus returns to `<body>` (or to whatever had it).
4. Reload the same tab → **no overlay**. Open a new tab → overlay again. That is "once per session".
5. Tab to the pane bar → the `skip` control is focused on mount and activating it with `Enter` or `Space` dismisses.
6. Resize to **320 px** → no horizontal scrollbar; the card is `min(680px, 100%)` inside 24 px of padding.
7. Delete `public/data/v1/grid.json` and reload → no overlay, no console error, page otherwise identical.

Record the result of steps 1-4 in the PR body.

### Version pins

`next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8` — installed by KW-001, verified present on the npm registry this session. **Add nothing.** DEC-003 freezes `package.json` and `package-lock.json` after KW-001; a boot overlay that needs a dependency is a boot overlay that is wrong.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green, and `npx prettier --check app/regions/BootOverlay.tsx` reports no drift.
- `git diff --name-only origin/main...HEAD` lists exactly one path, `app/regions/BootOverlay.tsx`; `package.json` and `package-lock.json` are byte-identical to `main`.
- No payload figure is a literal: `grep -nE '[0-9][0-9,]{2,}' app/regions/BootOverlay.tsx` returns only the lines declaring `LINE_MS`, `KILL_MS` and `FACTS_TIMEOUT_MS` and the quoted CSS strings `'210px'` and `'min(680px, 100%)'`, and `grep -nE '4,?817|1,?826|2,?038|10,?001|13,?360|\b284\b|\b156\b|\b58\b' app/regions/BootOverlay.tsx` returns nothing.
- The client boundary is exactly one file: `grep -c "^'use client'" app/regions/BootOverlay.tsx` is `1`, and `grep -rn "use client" app/page.tsx app/layout.tsx app/regions/_contract.ts components/ds/` returns nothing.
- The import list is closed: every `import` in the file resolves to `react`, `./_contract`, `@/components/ds/Pane`, `@/content/boot`, or `@/components/icons` — verified by reading `grep -n "^import" app/regions/BootOverlay.tsx`; there is no import from `lib/`, from `content/` other than `content/boot`, or from another region.
- All sixteen lines render from the contract, not from copy in this file: `grep -c "BOOT_LINES" app/regions/BootOverlay.tsx` is at least `1` and `grep -nE "boot --target|swe-rts-terminal|doubling bands|ready\." app/regions/BootOverlay.tsx` returns nothing.
- The reduced-motion and session guards precede the fetch: in the mount effect, the `matchMedia('(prefers-reduced-motion: reduce)')` early return and the `sessionStorage` early return both appear textually before the first `fetch(` call in the file.
- The dialog contract is present: the file contains `role="dialog"`, `aria-modal="true"`, `aria-labelledby={` bound to `REGION_META.bootOverlay.titleId`, a `<button type="button">` skip control, and a `keydown` listener on `window`; it contains no `aria-label=` on the dialog container and no focus-trap loop.
- The derivation matches the worked fixture: with the two-document fixture from "Refreshable implementation notes" placed in `public/data/v1/`, the rendered log is byte-identical to the sixteen lines quoted there, checked by reading the DOM in the browser.
- Static output carries no boot copy: after `npm run build`, `grep -rl "boot --target" .next/server` returns nothing — the overlay is client-only and must not leak into the prerendered HTML that KW-027 owns as the SEO surface.

### At-merge gate

- `ci-ok` is green on the exact PR head — the required status published by KW-001's `.github/workflows/ci.yml`.
- The PR body records the manual smoke result for steps 1-4 of "Step 5 — manual smoke": reduced-motion bypass with no payload fetch, one play per session, Esc dismissal, no replay on reload in the same tab.
- No change to `package.json` or `package-lock.json` (DEC-003), and no file under `content/`, `styles/`, `app/globals.css`, `components/icons/`, `public/data/` or any sibling region was touched.
- A reviewer confirms the four permitted-literal categories in "Invariant 2" are the only numeric literals in the file.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. KW-029 owns the runtime accessibility proof for this region — Esc dismissal, the reduced-motion bypass and WCAG 2.2.2 are asserted there in Playwright, against the merged component, not here.

## Failure, security, migration, and accessibility cases

**Failure.** Every failure mode of this component resolves to "render nothing", and that is the design:

- **Payload absent or 404.** Expected for most of wave 3 — KW-014 does not write `public/data/v1/**` until wave 4. The overlay simply never appears, the page is otherwise identical, and nothing is logged to the console. Do not add a placeholder overlay, a spinner or a retry.
- **Payload present but stale or partially written.** The `g.n !== m.dayCount` check catches the half-written case where the two documents came from different runs. KW-014 writes them together and asserts monotonicity, but a torn CDN cache is cheap to defend against and expensive to debug.
- **Unknown `repoCountDefinition`.** GT-7 enumerates five definitions and KW-012 types four; a value outside `REPO_COUNT_LABEL` means the pipeline changed its mind about what it is counting. Render nothing rather than print a raw enum key into copy.
- **Unresolved `{token}`.** `fill()` throws; the catch swallows it and the overlay does not run. A visible `{contributions}` on the production site is the exact outcome DEC-008 exists to prevent.
- **The overlay fails to dismiss.** The worst outcome available in this file — a permanently blank site. Three independent kills defend it: the rAF loop's `want > lines.length + TAIL_LINES` exit, the `KILL_MS` timeout, and any user input. Do not make any of them conditional on the others.
- **Slow network.** `FACTS_TIMEOUT_MS` aborts the fetch at 400 ms. A boot animation that starts after the page has already painted is a flash of unexpected content, not an intro.

**Security and privacy.** The component reads two same-origin static documents and sends nothing. It must never associate a private contribution volume with an organisation name: `{privateVolumes}` renders a count only, and `content-ia` §11.5 is explicit that the cluster is labelled `private repos` and never an employer. `sessionStorage` holds a single value, `'1'`, under `kw.boot.v1` — no identifier, no timestamp, no fingerprint, nothing that survives the tab, and therefore nothing that needs a consent banner. Do not switch it to `localStorage`: cross-session persistence turns a UX nicety into durable client-side state about a visitor.

**Migration.** None. `app/regions/BootOverlay.tsx` is a KW-005 stub that returns `null`; this ticket replaces its body. No data migrates, no route changes, no URL changes, no cache key changes. `public/data/v1/` is versioned in its path (KW-012), so a future wire-format change lands as `v2/` and this component keeps working against `v1/` until it is deliberately moved.

**Accessibility.** This is the ticket's substantive risk surface, because the overlay covers the entire page and DEC-005 leaves it to this ticket to get right:

- **Dialog semantics.** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → the pane title, which renders as the region's `<h2>` under KW-005's `sr-only <h1>`. `REGION_META.bootOverlay.accessibleName` and `BOOT_PANE_TITLE` are the same string, so the visible name and the accessible name match — a WCAG 2.5.3 (label in name) property that is free here and easy to break by adding an `aria-label`.
- **Keyboard.** The skip control is a real `<button>`, is focused on mount, and is the first focusable element in the dialog. Any key dismisses, so there is no keyboard trap; `document.activeElement` is captured before the move and restored on unmount.
- **Motion.** WCAG 2.2.2 exempts auto-updating content that stops inside five seconds, and this stops at ~1.8 s — but the reduced-motion bypass is total anyway: no fetch, no timer, no DOM, per comp:205-206's behaviour and `design-comp-spec` §9.6. Reduced motion must never be satisfied by "the same animation, slower".
- **Announcement.** All sixteen lines are in the DOM at once with only `visibility` toggling, so a screen reader gets the log as static text and no live region fires sixteen times. `design-comp-spec` §9.5 flags `aria-live="polite"` on an append-driven log as "a firehose"; this shape avoids the problem structurally rather than by suppressing it.
- **Contrast.** Computed this session against the pane surface `--surface-pane` = `--bg-h` = `#1d2021` (not `#282828` — the alias is measured in `tokens/colors.css:22`): `--fg1` 11.95:1, `--yellow` 9.67:1, `--green` 7.94:1, `--purple` 5.98:1, `--fg4` 5.90:1. All five boot kinds clear AA for normal text with headroom against the ~0.27 drag that KW-003 measured from the always-on scanline, so GATE-007's outcome cannot push any of them below 4.5:1. Never colour a boot line `--gray` (`#928374`, 4.47:1 on this surface — the failure KW-003 exists to prevent).
- **Reflow.** `min(680px, 100%)` inside `padding: 24px` produces no horizontal scroll at 320 px. The log lines use `white-space: pre`, which can overflow the card horizontally — the DS's `.pane{overflow:hidden}` clips it rather than scrolling the page, which is the correct trade for a 1.6 s decorative surface; the same copy is available as real text in the man page and the hidden table (DEC-011).
- **Not this ticket's problem, named so nobody chases it:** the global `:focus-visible` ring and the `.sr-only` / `.skip` rules are KW-003's (there is currently not one focus state in the entire design system), and the runtime axe/keyboard sweep is KW-029's.

## Surfaces

- Reads: `app/regions/_contract.ts`, `components/ds/Pane.tsx`, `content/boot.ts`, `components/icons/index.ts`, `app/page.tsx`, `docs/design/kevinweaver.dev.dc.html`, `docs/design/_ds/**`, `docs/research/2026-07-31-content-ia.md`, `docs/research/2026-07-31-design-comp-spec.md`, `docs/research/2026-07-31-decomposition-synthesis.md`, `package.json`, `tsconfig.json`
- Writes: `app/regions/BootOverlay.tsx`
- Contracts: `app/regions/BootOverlay.tsx::BootOverlay`, boot-token resolution from `public/data/v1/manifest.json` and `public/data/v1/grid.json` wire fields
- Safety: page-blocking boot overlay dismissal and prefers-reduced-motion bypass, `sessionStorage` key `kw.boot.v1`

## Sibling boundaries and open gates

**Open gates: none.** No GATE-nnn blocks pickup. GATE-005 (HG-5) blocks **KW-006**, not this ticket — by the time `content/boot.ts` exists, the operator has already answered the six content questions, and none of them changes anything in this file. GATE-007 (HG-7, the scanline treatment) lands in KW-003's tokens and cannot move any boot-line colour below AA (see the contrast figures above).

**Upstream, and what to do while it is unmerged.**

| Ticket | What this ticket consumes | If it has not merged |
|---|---|---|
| **KW-005** (hard dep) | `BootOverlayProps`, `REGION_META.bootOverlay`, `Pane` / `PaneProps`, and the `<BootOverlay />` mount in `app/page.tsx` | Stop and report. Do not create `_contract.ts` or `Pane.tsx`; eight tickets build on that seam. |
| **KW-006** (hard dep) | `BOOT_LINES`, `BOOT_PANE_TITLE`, `BootLine`, `BootKind`, `BootToken`, `fill` | Stop and report. Do not inline the sixteen lines; five tickets consume `content/`. |
| **KW-003** (no edge) | the `kw-logIn` keyframe and the DS token values | Ship anyway. `var(--token, literal)` fallbacks cover the colours and the missing keyframe degrades to "the line appears". Do not add CSS. |
| **KW-004** (no edge) | `SpinnerIcon` from `components/icons` | Ship the plain `⠿` text marker. Do not author an icon file — KW-004 owns `components/icons/**` and a second copy breaks the partition. |
| **KW-012 / KW-014** (no edge) | the `manifest.json` / `grid.json` wire fields and the published payload | Ship anyway. The overlay simply never runs until the payload exists. Do not import `lib/bundle/**` and do not commit a fixture under `public/`. |

**Same-wave siblings whose write surfaces are off limits.** Wave 3 dispatches eleven tickets in parallel and DEC-005 partitions them by file — this is the property that makes that possible, so treat it as hard. KW-013, KW-014 own `scripts/pipeline/**`; KW-015 owns `lib/bundle/loader.ts`; KW-016 owns `app/regions/ManPage.tsx`; KW-017 owns `app/regions/CareerLog.tsx` and `components/ds/CommitLog.tsx`; KW-018 owns `app/regions/Header.tsx`, `app/regions/TmuxBar.tsx` and `components/ds/TmuxBar.tsx`; KW-019 owns `app/regions/Contact.tsx`; KW-021 owns `lib/viz/sim/{step,layout}.ts`; KW-022 owns `lib/viz/render/**`; KW-023 owns `playwright.config.ts`, `e2e/**` and `.github/workflows/e2e.yml`. Every one of those is a file this ticket must not open.

**Adjacent surfaces that display the same numbers, and why they are not this ticket.** KW-018's tmux bar reads its figures directly from the payload and explicitly does not depend on `content/` — do not add tmux copy here or factor a shared helper into a sibling's file. KW-025's instrument pane and its DEC-011 visually hidden table are the accessible, indexable presentation of the contribution data; the boot log is decorative and duplicative by design, which is exactly why it is allowed to fail closed.

**Deferred finding to record in `deferred-findings.md` rather than fix here.** The grid reduction in `derive()` (contributions, active days, busiest day, mass point) is the first of what will probably be two or three consumers of the same aggregate. It is deliberately local, ~30 lines, and inside this ticket's write surface. **If a second consumer appears** — a `<noscript>` summary in KW-027, or an `aria-label` for KW-025's canvas — promote it to a pure `lib/bundle/stats.ts` owned by KW-012 in a follow-up ticket, and make this file import it. Do not pre-emptively create that module here: it would be a write-surface violation and a wave-3 ticket editing a wave-2 ticket's directory.

**Downstream.** KW-029's accessibility gate depends on this ticket and asserts the dialog semantics, the Esc path and the reduced-motion bypass at runtime. KW-032's capstone composition is the last thing to touch `app/page.tsx`. Neither of them will re-open this file; the component's shape is the contract.
