# KW-016 — Region: man-page pane with a less(1)-style zero-client-JS pager

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — One exclusively-owned file, no new dependency and no algorithm: twelve roff sections plus one identity block rendered from typed data another ticket owns. The work is in the seams — a pager that ships zero client JavaScript yet is still keyboard-scrollable, a CSS-only abridged variant below 1080 px, and a heading outline that has to fit under a shell this ticket may not edit.

**Risk:** low — server-rendered text on a single-file write surface with a one-file revert. The two real failure modes are a client boundary sneaking in (which deletes the zero-JS indexable-text property this region exists for) and a scrollable pane no keyboard can reach.

**Phase hint:** 3

**Depends on:** KW-003, KW-005, KW-006

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-005, DEC-008

**Gates:** GATE-005

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The `#whoami` column renders the real `man kevinweaver` page — all twelve roff sections plus the `whoami` / `id` / `finger -l` block — inside a `less(1)`-style pager that ships **zero client JavaScript**, is scrollable from the keyboard, drops to an abridged section set below 1080 px, and never causes page-level horizontal scrolling at 320 px.

## Context and evidence

**Why this region exists at all.** The single strongest argument in the plan for App Router + React Server Components (**DEC-002**, synthesis D-02) is the content track's finding that the live site has **zero indexable text**: the current production page serves `<title>Hi.</title>` with `next-head-count 4`, no description and no server-rendered body copy. RSC delivers the resume as real HTML at zero client-JS cost. This pane is the largest block of that text. A `'use client'` directive anywhere in this file forfeits the reason the region was carved out.

**Why it is one file.** **DEC-005** (D-05) partitions the comp's seven structurally independent regions one-per-file so wave 3 runs eleven agents in parallel with no `serializes_with` edge — **C-11** established that `serializes_with` is the one edge type aiur does *not* enforce at runtime, so any plan leaning on it is both slower and unsafe. `app/regions/ManPage.tsx` is this ticket's exclusive property; every other file named below belongs to somebody else.

**What the comp gets wrong here.** Re-read at `e664d73a195facd64db58ba10952170ff01b4772`, the man pane is `docs/design/kevinweaver.dev.dc.html` lines 127–145: a `.pane` with `.pane-title` `man kevin-weaver` and a `.pane-body` holding three label/paragraph blocks — `NAME`, `DESCRIPTION`, `SEE ALSO`. That is 3 of 12 sections, and the design track's own audit marks the copy **placeholder that contradicts the authoritative resume** (`grep -ic optimism` over the comp → **0**; the current employer is entirely absent). None of that copy is this ticket's problem: **KW-006 owns every string** and lands it in `content/manpage.ts` and `content/identity.ts`. This ticket owns the rendering, the pager mechanics, the responsive behaviour and the accessibility of its own subtree.

**The one structural change to the comp.** The content track (§1.2) splits the `#whoami` left column into **two stacked panes** — a fixed-height `whoami` pane (~11 lines, no scroll) and a `man kevinweaver` pager pane (`overflow:auto`, `flex:1`) — because a full man page will not fit a single fixed pane. KW-006's own consumer note names this ticket as the renderer of both `MAN_PAGE` and the `IDENTITY` `whoami` / `id` / `finger` block, and no other ticket in the 32-ticket set renders `IDENTITY.whoami`, `.idLines`, `.finger`, `.project` or `.plan`. Both panes therefore live inside this one region file.

**The hard DS rule this ticket has to override.** `layers/pane.css` line 13 at the researched commit is `.pane-body{flex:1 1 auto;min-height:0;padding:var(--pane-pad);overflow:hidden;}`. A pager needs the explicit `overflow:auto` override on exactly that one pane. The synthesis states it plainly: KW-003 ships the class surface, **this ticket applies the override** — and it applies it through KW-005's `Pane` `bodyStyle` prop, never by editing a stylesheet.

**No a11y sweep is coming.** **DEC-005** rejects both a cross-cutting accessibility ticket and a cross-cutting mobile ticket, because either would touch every region file and re-serialize the two widest waves. KW-029 *verifies*; it does not sweep. So this ticket owns its own heading levels (`h2`/`h3` under KW-005's `sr-only` `h1`), its own focus behaviour, and its own 320 px reflow. The comp scores `0 <h1> 0 <h2> 0 <h3> 0 aria-* 0 role= 0 tabindex` — there is nothing to inherit.

**GATE-005 (HG-5) is transitive, not direct.** Six facts no measurement can settle — the Twitter handle (**C-13**), the shipping email (**C-18**: the resume's `notkevinweaver@gmail` has no TLD and is not a valid `mailto:`), the job title (three conflicting variants), whether the `side` lane appears, whether the podcast is nameable, and the availability string — block **KW-006**, and reach this ticket only through that dependency. Three of them land inside copy this pane renders: the NAME gloss takes the resolved job title, the AUTHOR line takes the resolved email, and the `--podcast` OPTIONS block is deleted outright if there is no nameable podcast. By the time `depends_on` clears, `content/manpage.ts` already carries the resolved text. **Do not author, patch or second-guess any of it here.**

**DEC-008 in this region.** No contribution figure is a literal anywhere in copy. The man page contains no contribution counts by construction — the only figure in it is a historical star count (`truffle` ★13,923 measured; the source draft's "13,900" is corrected in KW-006), which the decision explicitly permits as stated evidence. This ticket's obligation is narrower and absolute: **it introduces no numeric literal of its own** and renders every string through `content/`.

Plan-context navigation (read these at the approved planning commit — the same commit the issue preamble links):

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/build-orders/site-rewrite/02-current-target-delta.md`, plus the authoritative topological table, critical path and write-surface partition proof in `docs/research/2026-07-31-decomposition-synthesis.md` §6
- Decision registry: `docs/build-orders/site-rewrite/03-technical-decisions.md` (DEC-002, DEC-003, DEC-005, DEC-008 are D-02, D-03, D-05, D-08 in the synthesis §3 table)
- This ticket's implementation pointers: the "Refreshable implementation notes" section below

Evidence readable at `researched_at_commit` today:
[docs/design/kevinweaver.dev.dc.html](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/design/kevinweaver.dev.dc.html) lines 32–40 and 127–145,
[docs/design/_ds/…/layers/pane.css](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/layers/pane.css),
[docs/design/_ds/…/tokens/colors.css](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css),
[docs/research/2026-07-31-content-ia.md](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-content-ia.md) §1.2, §4, §4.1 and §6,
[docs/research/2026-07-31-design-comp-spec.md](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-design-comp-spec.md) §2.5.1, §8 and §9.1.

**Requirements this ticket serves.** REQ-002 (the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file), REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder copy survives), REQ-009 (the page carries a correct heading outline, landmark structure and keyboard affordances, and the resume panes render with zero client JavaScript).

## Scope

- Replace the whole body of `app/regions/ManPage.tsx` with the real region: a `<section>` carrying the region's single `h2` accessible name and two stacked `Pane`s.
- Render the `whoami` pane from `IDENTITY`: the `$ whoami` one-word answer, the `$ id` lines, the `$ finger -l` field grid, and the `Project:` / `Plan:` blocks.
- Render the `man kevinweaver` pager from `MAN_PAGE`: all twelve roff sections in order, with `ManBlock.term` as a definition term, `ManBlock.indent` honoured as a 7- or 14-column roff indent, and `ManBlock.literal` blocks in `<pre>`.
- Render the roff running header and footer from `MAN_HEADER` and `MAN_FOOTER`, resolving `MAN_FOOTER.center`'s `{date}` token through `fill()` so no unresolved brace can ever reach a visitor.
- Apply the explicit `overflow` override to this one `.pane-body` through KW-005's `Pane` `bodyStyle` prop, and make the pager keyboard-scrollable and keyboard-reachable without any client JavaScript.
- Ship the abridged variant below 1080 px as a pure media query: sections with `abridged: false` are hidden and `MAN_ABRIDGED_HINT` becomes visible.
- Own the region's accessibility subtree: one `h2` for the region, one `h3` per pane title and per roff section, visible focus for the pager, and no page-level horizontal scrolling at 320 px.

## Non-goals

- Authoring, editing or "fixing" any copy. `content/manpage.ts`, `content/identity.ts` and `content/boot.ts` are KW-006's exclusive write surface, and GATE-005 governs six of the facts inside them.
- Any edit to `app/globals.css` or anything under `styles/**` — KW-003 owns the entire stylesheet surface, including `.sr-only`, the `:focus-visible` ring, `body{overflow-x:clip}`, the `.kw-*` layout classes and the 540/720/900/1080 breakpoint set.
- Any edit to `app/page.tsx`, `app/layout.tsx`, `app/regions/_contract.ts` or `components/ds/**` — KW-005 owns them; KW-032 owns the final page composition.
- Turning man-page text into hyperlinks. `ManBlock` carries no href metadata, auto-linking would need a parser and would break the 78-column roff grid, and KW-019 owns every real link on the site.
- Adding, removing or pinning any dependency, npm script or config file — KW-001 owns them and DEC-003 freezes `package.json` and `package-lock.json`.
- Any test file, `vitest.config.mts`, `playwright.config.ts` or `e2e/**` entry — KW-011, KW-023, KW-029 and KW-031 own the test surfaces.
- The career git-log pane, the contact pane, the header, the tmux bar, the boot overlay and the instrument pane — KW-017, KW-019, KW-018, KW-020 and KW-025.
- `/resume.txt`, `/kevinweaver.1`, the `<noscript>` fallback, metadata and the OG image — KW-027 generates all of them from the same `content/` modules, not from this component.

## Existing owner and reuse target

At `researched_at_commit` there is **no `app/` directory**: `git ls-tree` at `e664d73a195facd64db58ba10952170ff01b4772` shows the Pages Router (`pages/_app.js`, `pages/index.js`, `pages/api/hello.js`), `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `tailwind.config.js`, and both `yarn.lock` and a stale `package-lock.json`. KW-001 deletes all of it. Everything this ticket reuses is created by a named upstream ticket or is on disk in `docs/design/` today.

| Target | What this ticket uses it for | Guaranteed by |
|---|---|---|
| `app/regions/ManPage.tsx` | the stub whose body is replaced — a `Pane` with a `.ph` placeholder and the comment `KW-016 replaces this body. Edit no other file.` | **KW-005** (its write surface) |
| `app/regions/_contract.ts` → `ManPageProps`, `REGION_META.manPage` | props type; `landmark: 'section'`, `anchorId: 'whoami'`, `titleId: 'region-man-page-title'`, `accessibleName: 'man kevin-weaver'`, `headingLevel: 2` | **KW-005** |
| `components/ds/Pane.tsx` → `Pane`, `PaneProps` | pane chrome; the `bodyStyle`, `bodyClassName`, `titleAs`, `titleId`, `labelledBy`, `as` and `right` props | **KW-005** |
| `content/manpage.ts` → `MAN_PAGE`, `MAN_HEADER`, `MAN_FOOTER`, `MAN_ABRIDGED_HINT`, `MAN_WRAP_COLUMNS`, `ManSection`, `ManBlock`, `ManSectionId` | every string and every layout hint in the pager | **KW-006** |
| `content/identity.ts` → `IDENTITY` (`whoami`, `idLines`, `finger`, `project`, `plan`), `FingerField` | every string in the whoami pane | **KW-006** |
| `content/boot.ts` → `fill(template, values)` | resolving `MAN_FOOTER.center`'s `{date}` token; throws on an unresolved token | **KW-006** |
| `.pane`, `.pane-bar`, `.pane-title`, `.pane-body`, `.dots` | pane chrome classes, on disk today in `docs/design/_ds/…/layers/pane.css`, re-shipped for the web in `styles/ds/layers/pane.css` | on disk now (GT-5, C-3); **KW-003** |
| `.dim`, `.prompt` | `--text-faint` and accent-bold text utilities, on disk today in `docs/design/_ds/…/layers/type.css` | on disk now; **KW-003** |
| `.sr-only`, the global `:focus-visible` ring in `--fg0`, `body{overflow-x:clip}` | hidden region heading, pager focus ring, page-level reflow backstop | **KW-003** (`styles/kw.css`) |
| `.kw-2up`, `.kw-pad` and the 720/900/1080 breakpoints | the two-up grid that stacks below 1080 px; this ticket only matches the 1080 px number, it does not define it | **KW-003** (`styles/kw.css`); the comp's own rule is at `kevinweaver.dev.dc.html:32-40` |
| `--fs-mono`, `--fs-micro`, `--lh-code`, `--ls-caps`, `--fw-black`, `--fw-semibold`, `--pane-pad`, `--pane-gap`, `--text-muted`, `--text-faint`, `--text-body`, `--mono` | every value in the region's `<style>` block | `tokens/{colors,typography,spacing}.css` on disk now; re-derived to `rem`/`clamp()` by **KW-003** |
| `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3` | React 19 `<style>` hoisting, RSC, strict TS. All four re-verified as published versions on the registry this session. | **KW-001** under DEC-003 |

Not reusable, do not go looking: the DesignSync project ships `components/chrome/Pane.jsx` / `Pane.d.ts`, but **those files are not in this repository** at `researched_at_commit` and fetching them is off the critical path (DEC-004, GT-5). There is also **no `.kw-only-md` or `.pane-body.scroll` class anywhere in the design system** — KW-003's contract does not declare one, so the abridged toggle and the overflow override are this ticket's to express, by the two mechanisms specified below.

**If any of `app/regions/_contract.ts`, `components/ds/Pane.tsx`, `content/manpage.ts` or `content/identity.ts` is missing at pickup, stop and report.** All three dependencies are hard `depends_on` edges; a missing module means KW-003, KW-005 or KW-006 has not merged, and authoring a local substitute would fork a contract five other tickets consume.

## Contract and invariants

This ticket is a **consumer only**. It produces no interface any other ticket imports; its public seam is the named export `ManPage`, whose signature is fixed by KW-005 and must not change.

### Consumed interface — quoted verbatim from `app/regions/_contract.ts` (KW-005)

```ts
export interface RegionCommonProps {
  /** Fragment target for the header nav. Defaults to REGION_META[slot].anchorId. */
  id?: string
  /** Appended to the region's own class list; never replaces it. */
  className?: string
  /** Layout escape hatch used by the page shell only. */
  style?: CSSProperties
}

export interface ManPageProps extends RegionCommonProps {}

export const REGION_META = {
  // ...
  manPage: { landmark: 'section', anchorId: 'whoami', titleId: 'region-man-page-title', accessibleName: 'man kevin-weaver', headingLevel: 2 },
  // ...
} as const satisfies Record<RegionSlot, RegionMeta>
```

### Consumed interface — quoted verbatim from `content/manpage.ts` and `content/boot.ts` (KW-006)

```ts
export type ManSectionId =
  | 'NAME' | 'SYNOPSIS' | 'DESCRIPTION' | 'OPTIONS' | 'ENVIRONMENT' | 'FILES'
  | 'EXAMPLES' | 'DIAGNOSTICS' | 'SEE ALSO' | 'AUTHOR' | 'REPORTING BUGS' | 'BUGS';

export interface ManBlock {
  /** The option, path or variable being defined; null for a plain paragraph. */
  readonly term: string | null;
  /** Body lines wrapped at 78 columns. Leading indent is NOT included. */
  readonly lines: readonly string[];
  /** roff indent: 7 for section bodies, 14 for term bodies. */
  readonly indent: 7 | 14;
  /** true renders inside <pre> (shell transcripts under EXAMPLES). */
  readonly literal: boolean;
}

export interface ManSection {
  readonly id: ManSectionId;
  readonly blocks: readonly ManBlock[];
  /** false drops the section from the sub-1080px abridged variant. */
  readonly abridged: boolean;
}

export const MAN_PAGE: readonly ManSection[];
export const MAN_WRAP_COLUMNS: 78;
/** center carries the `{date}` token; resolve with fill(). */
export const MAN_HEADER: { readonly left: string; readonly center: string; readonly right: string };
export const MAN_FOOTER: { readonly left: string; readonly center: string; readonly right: string };
/** Abridged pane footer hint, e.g. '[ press m for full page ]'. */
export const MAN_ABRIDGED_HINT: string;

/**
 * Pure `{token}` substitution. Throws on an unresolved token so a missing payload
 * field fails the build instead of shipping `{contributions}` to a visitor.
 */
export function fill(
  template: string,
  values: Readonly<Partial<Record<BootToken, string>>>,
): string;
```

`BootToken` includes `'date'`, which is the only token this ticket ever resolves.

### Consumed interface — quoted verbatim from `content/identity.ts` (KW-006)

```ts
export interface FingerField {
  readonly label: string;        // 'Login' | 'Name' | 'Title' | 'Since' | ...
  readonly value: string;
}

export interface Identity {
  // ...
  /** `$ whoami` output — one word. */
  readonly whoami: string;                     // 'its-everdred'
  /** `$ id` output, pre-wrapped. */
  readonly idLines: readonly string[];
  /** `$ finger -l` header fields, two per rendered row. */
  readonly finger: readonly FingerField[];
  /** finger `Project:` block, one entry per line. */
  readonly project: readonly string[];
  /** finger `Plan:` block, one entry per line. */
  readonly plan: readonly string[];
  // ...
}

export const IDENTITY: Identity;
```

### Invariants

**Invariant 1 — zero client JavaScript.** `app/regions/ManPage.tsx` contains no `'use client'`, no event handler prop, no `useState`/`useEffect`/`useRef`, no `window`, no `document`, and no `next/dynamic`. The whole region is a synchronous React Server Component. If a behaviour cannot be expressed in HTML and CSS, it does not ship here — see Invariant 4.

**Invariant 2 — the component is a pure function of `content/`.** No `fetch`, no `fs`, no reading of `public/data/**`, no async component. The synthesis records this as a design constraint, not merely a test constraint: async Server Components are unsupported by Vitest, so every build-time data-reading path in the plan lives in a pure function, never in a component. Exactly one impure expression is permitted in this file — the module-scope revision date in note 6 — and it is evaluated once, at build time, outside the component.

**Invariant 3 — no copy, no numbers, no hexes.** Every visible string comes from `content/`. This file contains no prose literal beyond structural punctuation (`$ `, `:`), no numeric literal that is a fact about Kevin, and no colour literal — colours are `var(--token)` references only (KW-003 Invariant C). `MAN_WRAP_COLUMNS` is imported, never retyped as `78`.

**Invariant 4 — the pager is native.** Scrolling is the browser's, not a script's. The pane body is the scroll container; a focusable element inside it makes `Space`, `Shift+Space`, `PageDown`, `PageUp`, `ArrowDown`, `ArrowUp`, `Home` and `End` scroll it in every engine, with no JavaScript. The `j`/`k` vim aliases and the live `12%` / `(END)` position readout described in the content track's `less(1)` sketch **cannot exist without a client boundary and are therefore not shipped**; Invariant 1 outranks them. Do not add a key handler, a scroll listener, or a client leaf component to get them back.

**Invariant 5 — this region never writes a stylesheet.** The rules it needs live in a single React 19 hoisted `<style href precedence>` element inside this file, and every selector is prefixed `.kw-man`. Adding a rule to `app/globals.css` or `styles/**` is a write-surface violation (KW-003), and inline `style` attributes cannot express a media query, which is why the `<style>` element exists.

**Invariant 6 — heading outline.** Exactly one `<h2>` in this region, carrying `id="region-man-page-title"` and the region's accessible name, referenced by the section's `aria-labelledby`. Every pane title and every roff section header is an `<h3>`. No `<h1>` — `app/page.tsx` owns the page's single visually hidden `<h1>` (KW-005 Invariant 4).

**Invariant 7 — no duplicate `id`.** `app/page.tsx` already renders `<div className="kw-2up" id="whoami">` around this region and `CareerLog`. The KW-005 stub defaults `id` to `REGION_META.manPage.anchorId`, which would emit a **second** `id="whoami"` on the same page — an axe `duplicate-id` violation and a broken nav target. This ticket removes that default: `id` renders only when the shell explicitly passes one, and the shell does not.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-read the cited files at pickup; if a line number has moved, the named selector or symbol still governs. Every "verify" below belongs to an upstream ticket — if one is false, stop and report rather than fixing it here.

### 1. Verify the base

```bash
npm ci
test -f app/regions/ManPage.tsx && test -f app/regions/_contract.ts && test -f components/ds/Pane.tsx
test -f content/manpage.ts && test -f content/identity.ts && test -f content/boot.ts
grep -n '"@/\*"' tsconfig.json          # alias present -> use @/ imports; absent -> relative imports, do NOT edit tsconfig.json
grep -rn 'kw-2up' app/page.tsx          # confirms the #whoami anchor lives on the wrapper, not on this region
npm run typecheck && npm run lint && npm run build   # must be green BEFORE you change anything
```

### 2. The only file this ticket writes

```
app/regions/ManPage.tsx     (replace in full)
```

No other file. No `app/regions/ManPage.module.css`, no `components/ds/*`, no `content/*`, no test file, no barrel.

### 3. Imports — exactly these, nothing else

```tsx
import { Pane } from '@/components/ds/Pane'
import {
  MAN_PAGE,
  MAN_HEADER,
  MAN_FOOTER,
  MAN_ABRIDGED_HINT,
  MAN_WRAP_COLUMNS,
  type ManBlock,
  type ManSection,
} from '@/content/manpage'
import { IDENTITY, type FingerField } from '@/content/identity'
import { fill } from '@/content/boot'
import { REGION_META, type ManPageProps } from './_contract'
```

KW-005 Invariant 2 restricts *stubs* to three import sources; a real region additionally imports `content/**`, which is exactly what the dependency edges on KW-006 exist for. Nothing else may be imported: no `lib/**`, no sibling region, no `styles/**`.

### 4. Component shape

```tsx
const META = REGION_META.manPage
const WHOAMI_TITLE_ID = 'region-man-page-whoami-title'
const PAGER_TITLE_ID = 'region-man-page-pager-title'

export function ManPage({ id, className, style }: ManPageProps) {
  return (
    <section
      id={id}
      className={['kw-man', className].filter(Boolean).join(' ')}
      style={style}
      aria-labelledby={META.titleId}
    >
      <style href="kw-man" precedence="region">{KW_MAN_CSS}</style>
      <h2 id={META.titleId} className="sr-only">{META.accessibleName}</h2>
      <WhoamiPane />
      <ManPagerPane />
    </section>
  )
}
```

Note the missing default on `id` — that is Invariant 7 and it is deliberate. Keep `WhoamiPane` and `ManPagerPane` as module-local components in the same file (they are not exported; nothing else may import them).

### 5. The whoami pane

Fixed height, no scroll, `flex: 0 0 auto`. Structure follows the content track §6 transcript: a `$ whoami` prompt line and the one-word answer, a `$ id` prompt line and `IDENTITY.idLines`, then `$ finger -l {IDENTITY.whoami}` with the field grid, `Project:` and `Plan:`.

```tsx
function WhoamiPane() {
  const fingerRows: ReadonlyArray<readonly FingerField[]> = chunkPairs(IDENTITY.finger)
  return (
    <Pane
      as="article"
      className="kw-man-whoami"
      title="whoami"
      titleId={WHOAMI_TITLE_ID}
      titleAs="h3"
      labelledBy={WHOAMI_TITLE_ID}
    >
      <div className="kw-man-sh">
        <p className="kw-man-cmd"><span className="prompt">$</span> whoami</p>
        <p className="kw-man-out">{IDENTITY.whoami}</p>

        <p className="kw-man-cmd"><span className="prompt">$</span> id</p>
        <p className="kw-man-out">{IDENTITY.idLines.join('\n')}</p>

        <p className="kw-man-cmd"><span className="prompt">$</span> finger -l {IDENTITY.whoami}</p>
        <dl className="kw-man-finger">
          {fingerRows.map((row) =>
            row.map((f) => (
              <div className="kw-man-ff" key={f.label}>
                <dt>{f.label}:</dt>
                <dd>{f.value}</dd>
              </div>
            )),
          )}
        </dl>
        {/* Project: / Plan: — one <p> per source line, joined with \n under white-space: pre */}
      </div>
    </Pane>
  )
}
```

`chunkPairs` is a four-line pure helper in this file: it walks `IDENTITY.finger` in order and emits arrays of two, with a trailing odd field alone in its own row spanning both columns. **The pairing is whatever order KW-006 ships.** If the merged data pairs badly (for example `Title` landing beside `Since`), that is a one-line reorder in `content/identity.ts` under KW-006 — do not add per-field layout heuristics here.

### 6. The roff revision date

`MAN_FOOTER.center` carries the `{date}` token by contract. Resolve it once, at module scope, so the component itself stays a pure function of its inputs (Invariant 2):

```tsx
/**
 * roff footer revision date. Evaluated once when the module is first loaded —
 * i.e. at `next build` for this statically rendered route, which is exactly
 * roff semantics ("the date the page was last revised"). KW-028 rebuilds the
 * site daily, so it tracks the deploy. If a payload-driven date is wanted later,
 * swap this constant for the bundle manifest's `generatedAt` — the pager needs
 * no other change.
 */
const REVISION_DATE = new Date().toISOString().slice(0, 10)
const FOOTER_CENTER = fill(MAN_FOOTER.center, { date: REVISION_DATE })
```

`fill()` **throws** on an unresolved token. That is the intended failure mode: a `content/manpage.ts` that introduces a second token fails the build rather than shipping a literal `{date}` to a visitor. Do not wrap this in a `try`/`catch` and do not add a fallback string.

### 7. The pager pane and the overflow override

```tsx
function ManPagerPane() {
  return (
    <Pane
      as="article"
      className="kw-man-pane"
      title="man kevinweaver(1)"
      titleId={PAGER_TITLE_ID}
      titleAs="h3"
      labelledBy={PAGER_TITLE_ID}
      right={<span className="dim">{MAN_HEADER.right}</span>}
      bodyClassName="kw-man-body"
      bodyStyle={{ overflow: 'auto', padding: 0 }}
    >
      <article className="kw-man-doc" tabIndex={0} aria-labelledby={PAGER_TITLE_ID}>
        <p className="kw-man-chrome">
          <span>{MAN_HEADER.left}</span><span>{MAN_HEADER.center}</span><span>{MAN_HEADER.right}</span>
        </p>
        {MAN_PAGE.map((section) => <ManSectionView key={section.id} section={section} />)}
        <p className="kw-man-chrome">
          <span>{MAN_FOOTER.left}</span><span>{FOOTER_CENTER}</span><span>{MAN_FOOTER.right}</span>
        </p>
        <p className="kw-man-hint">{MAN_ABRIDGED_HINT}</p>
      </article>
    </Pane>
  )
}
```

Three things here are load-bearing and are the reason this ticket exists:

- **`bodyStyle={{ overflow: 'auto', padding: 0 }}`** is the explicit override of `layers/pane.css`'s hard `.pane-body{…overflow:hidden;}` rule. `padding: 0` moves the padding onto `.kw-man-doc` so the roff column scrolls under the pane border rather than leaving a padded dead strip. `Pane` must never default its body to `auto` — this is the one pane in the site that gets it.
- **`tabIndex={0}` on `.kw-man-doc`**, not on `.pane-body`. `components/ds/Pane.tsx` is KW-005's write surface and exposes no `bodyTabIndex` or `bodyRole` prop; **do not add one**. A focusable element *inside* a scroll container makes the container keyboard-scrollable in every engine, and it satisfies axe's `scrollable-region-focusable` rule, which passes when the scrollable element contains a focusable descendant. The global `:focus-visible` ring from KW-003's `styles/kw.css` matches `[tabindex]`, so the pager gets a visible ring for free — declare no focus styles here.
- **`right={<span className="dim">{MAN_HEADER.right}</span>}`** replaces the content track's live `12%` / `(END)` readout. Scroll position cannot be read without client JavaScript, and a static `(END)` would be a lie. Use `.dim` (`--text-faint` `#a89984`, **5.90:1** on the pane surface `#1d2021`) and **never** `.gray` (`--text-comment` `#928374`, **4.47:1** — a measured AA failure this plan exists to prevent).

### 8. Section and block rendering

```tsx
function sectionSlug(id: ManSection['id']): string {
  return `man-${id.toLowerCase().replace(/ /g, '-')}`   // 'SEE ALSO' -> 'man-see-also'
}

function ManSectionView({ section }: { section: ManSection }) {
  const headingId = `${sectionSlug(section.id)}-h`
  return (
    <section
      className={section.abridged ? 'kw-man-sec' : 'kw-man-sec kw-man-full'}
      aria-labelledby={headingId}
    >
      <h3 className="kw-man-h" id={headingId}>{section.id}</h3>
      {section.blocks.map((block, i) => <ManBlockView key={i} block={block} />)}
    </section>
  )
}

function ManBlockView({ block }: { block: ManBlock }) {
  const body = block.lines.join('\n')
  const indent = { paddingLeft: `${block.indent}ch` }
  if (block.term === null) {
    return block.literal
      ? <pre className="kw-man-pre" style={indent}>{body}</pre>
      : <p className="kw-man-b" style={indent}>{body}</p>
  }
  return (
    <dl className="kw-man-dl">
      <dt className="kw-man-dt">{block.term}</dt>
      <dd className="kw-man-dd" style={indent}>
        {block.literal ? <pre className="kw-man-pre">{body}</pre> : body}
      </dd>
    </dl>
  )
}
```

Rules that must not be relaxed:

- **Never reflow.** Lines arrive pre-wrapped at `MAN_WRAP_COLUMNS` (78) and every line container uses `white-space: pre`. A reflowed man page reads as broken — that is the content track's explicit register note.
- **`term` sits at 7 columns, its body at `block.indent`.** `.kw-man-dt` carries a fixed `padding-left: 7ch`; only the `<dd>` takes `block.indent`, which the contract fixes at `14` for term bodies and `7` for section bodies.
- **Worked shape.** `MAN_PAGE` entry for `OPTIONS`, block 2, renders exactly this DOM:

  ```json
  { "term": "--podcast",
    "lines": ["Serial podcaster. Opens an audio stream, records ninety minutes,",
              "ships forty. Implies --teach."],
    "indent": 14, "literal": false }
  ```

  ```html
  <dl class="kw-man-dl">
    <dt class="kw-man-dt">--podcast</dt>
    <dd class="kw-man-dd" style="padding-left:14ch">Serial podcaster. Opens an audio stream, records ninety minutes,
  ships forty. Implies --teach.</dd>
  </dl>
  ```

  If GATE-005 (e) resolved to "no nameable podcast", this block simply is not in `MAN_PAGE` and nothing here changes. That is the whole point of the split.
- **JSX whitespace under `white-space: pre`.** JSX drops whitespace-only text between elements that contains a newline, so ordinary formatting is safe — but never write `{' '}`, a literal blank line, or a multi-line template string inside a `.kw-man-*` element. Build the body with `lines.join('\n')` and nothing else.
- **Codepoint budget.** GT-12 measured the comp at exactly 16 non-ASCII codepoints and **zero** PUA. This file introduces none of its own; every glyph comes from `content/`.

### 9. The region stylesheet — React 19 hoisted `<style>`

React 19.2.8 hoists a `<style>` element into `<head>`, de-duplicates it by `href` and orders it by `precedence`, and this works from a Server Component. That is what lets a region-scoped media query live inside the region's own file without touching KW-003's write surface.

```tsx
const KW_MAN_CSS = `
.kw-man{display:flex;flex-direction:column;gap:var(--pane-gap);min-width:0;}
.kw-man-whoami{flex:0 0 auto;}
.kw-man-pane{flex:1 1 auto;min-height:0;}
.kw-man-doc{padding:var(--pane-pad);min-width:${MAN_WRAP_COLUMNS}ch;font-family:var(--mono);
  font-size:var(--fs-mono);line-height:var(--lh-code);color:var(--text-muted);}
.kw-man-sh{font-size:var(--fs-mono);line-height:var(--lh-code);color:var(--text-muted);}
.kw-man-cmd,.kw-man-out,.kw-man-b,.kw-man-dt,.kw-man-dd,.kw-man-pre,.kw-man-chrome{white-space:pre;}
.kw-man-h{margin:1.4em 0 .35em;font-size:var(--fs-micro);font-weight:var(--fw-black);
  letter-spacing:var(--ls-caps);color:var(--text-faint);}
.kw-man-sec:first-of-type .kw-man-h{margin-top:0;}
.kw-man-b{margin:0 0 .8em;}
.kw-man-dl{margin:0;}
.kw-man-dt{margin:0;padding-left:7ch;color:var(--text-body);font-weight:var(--fw-semibold);}
.kw-man-dd{margin:0 0 .8em;}
.kw-man-pre{margin:0;font:inherit;}
.kw-man-cmd{margin:.9em 0 0;color:var(--text-faint);}
.kw-man-sh>.kw-man-cmd:first-child{margin-top:0;}
.kw-man-out{margin:0;}
.kw-man-finger{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 2ch;margin:0;}
.kw-man-ff{display:flex;gap:1ch;min-width:0;}
.kw-man-ff dt{color:var(--text-faint);}
.kw-man-ff dd{margin:0;min-width:0;}
.kw-man-chrome{display:flex;gap:2ch;margin:0 0 1.2em;color:var(--text-faint);}
.kw-man-chrome>:nth-child(2){flex:1 1 auto;text-align:center;}
.kw-man-doc>.kw-man-chrome:last-of-type{margin:1.6em 0 0;}
.kw-man-hint{display:none;margin:1.2em 0 0;padding-left:7ch;color:var(--text-faint);}
@media (max-width:1080px){
  .kw-man-full{display:none;}
  .kw-man-hint{display:block;}
}
`
```

- The 1080 px number is the comp's own `.kw-2up` stacking breakpoint (`kevinweaver.dev.dc.html:32-40`, `.kw-2up{grid-template-columns:1fr !important}`) and is in KW-003's declared breakpoint set (540 / 720 / 900 / 1080). Do not invent a different value and do not add `!important` — KW-003 removed every one of them.
- **Verify the hoist**: after `npm run build && npm start`, `curl -s localhost:3000 | grep -c 'kw-man-full'` must be ≥ 1 and the rule must appear inside `<head>`. If React does not hoist it in your Next version, drop the `precedence` prop; the element then renders in place and still applies. Do not solve it by adding the rules to `app/globals.css`.
- **Colours are tokens.** `--text-muted` is `--fg2 #d5c4a1`, measured **9.56:1** against the pane surface `--surface-pane` → `--bg-h #1d2021` — comfortably AA for 13 px body text. `--text-faint` is `--fg4 #a89984` at **5.90:1**. `--text-comment` / `.gray` (`#928374`, 4.47:1) is forbidden anywhere in this region.
- `--fs-prose` and `--lh-prose` are new steps KW-003 adds; the pager deliberately does **not** use them. A man page is a monospace column on a fixed character grid — it uses `--fs-mono` and `--lh-code` so `ch` indents stay true.

### 10. Reflow, 320 px, and what "no horizontal scroll" means here

The measured widest rendered line in the source copy at `researched_at_commit` is **82 columns** (`content-ia` §4, the `SYNOPSIS` line at indent 7); the abridged variant's widest line is also 82. At `--fs-mono` 13 px JetBrains Mono that is roughly 640 px, so at a 320 px viewport the roff column **must** scroll horizontally. That is intended: the content track's register note is explicit that a man page scrolls rather than reflows.

What must **not** happen is page-level horizontal scrolling (WCAG 1.4.10). Two mechanisms guarantee it and both must hold:

1. `.pane-body` is the scroll container (note 7), so the overflow is contained.
2. `.pane{…overflow:hidden;…}` (`layers/pane.css` line 4) means the pane's CSS *automatic minimum size* resolves to `0` rather than `min-content` — a grid item whose `overflow` is not `visible` does not get an automatic minimum size — so the 82-column column cannot push the `.kw-2up` grid wider than the viewport. `.kw-man{min-width:0}` keeps the same property on the region wrapper.

KW-003's `body{overflow-x:clip}` is a backstop, not the fix. The assertion to run is `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 320 × 568.

### 11. Deliberate deviations, recorded so nobody "fixes" them

| Sketched in research | Shipped here | Why |
|---|---|---|
| `j`/`k` vim scroll keys, `q` collapses the pane | native `Space`/`PageDown`/arrows/`Home`/`End` via a focusable scroll container | Invariant 1. `j`/`k` and `q` need a key listener, i.e. a client boundary, which forfeits the zero-JS indexable-text property this region exists to deliver. |
| live `12%` / `(END)` position readout in the pane bar | static `MAN_HEADER.right` (`KEVINWEAVER(1)`) in `.dim` | Scroll position is unreadable without client JS; a hardcoded `(END)` would be false. |
| separately-worded abridged copy (content track §4.1) | the same NAME / SYNOPSIS / DESCRIPTION sections, with `abridged: false` sections hidden | `ManSection.abridged` is a boolean drop flag; the merged contract has no second copy variant. Shorter wording is a `content/manpage.ts` change under KW-006, never a renderer change. |
| `[ press m for full page ]` as an interactive hint | rendered verbatim as static text | KW-006 owns the string. **This ticket must not implement an `m` keypress.** If the merged string promises a keystroke, raise it as a one-line reword for KW-006 (for example `[ full page: curl -sL kevinweaver.dev/kevinweaver.1 ]`, which KW-027 makes real) and ship the text unchanged meanwhile. |
| man-page text auto-linked | plain text | `ManBlock` carries no href metadata; linking needs a parser and breaks the column grid. KW-019 owns links. |

### 12. Formatting and lint

Run `npm run format` (KW-001 declares it) before committing rather than hand-fighting quote style. `npm run lint` runs `eslint-config-next@16.2.12` flat config. `npm run typecheck` is `next typegen && tsc --noEmit`; `next typegen` **must** run first or typed-route checks fail — never invoke a bare `tsc`. `tsconfig.json` sets `strict` and `noUncheckedIndexedAccess`, so index into `IDENTITY.finger` through the `chunkPairs` helper rather than with raw subscripts.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on Node 24.
- The region ships zero client JavaScript: `grep -c "use client" app/regions/ManPage.tsx` returns `0`, and `grep -nE "useState|useEffect|useRef|onClick|onKeyDown|addEventListener|window\.|document\.|next/dynamic" app/regions/ManPage.tsx` returns nothing.
- All twelve roff sections are present in the server HTML: with `npm run build && npm start` running, `curl -s http://localhost:3000 | grep -oE 'NAME|SYNOPSIS|DESCRIPTION|OPTIONS|ENVIRONMENT|FILES|EXAMPLES|DIAGNOSTICS|SEE ALSO|AUTHOR|REPORTING BUGS|BUGS' | sort -u | wc -l` returns `12`.
- The whoami block is present in the server HTML: `curl -s http://localhost:3000 | grep -c 'finger -l'` returns at least `1`.
- No unresolved template token reaches the page: `curl -s http://localhost:3000 | grep -cE '\{(date|days|repos|contributions|zeroDays)\}'` returns `0`.
- Heading outline is correct: the rendered page has exactly one `<h1>`, the region contributes exactly one `<h2>` carrying `id="region-man-page-title"`, and `curl -s http://localhost:3000 | grep -o '<h3' | wc -l` accounts for two pane titles plus twelve section headings.
- No duplicate anchor: `curl -s http://localhost:3000 | grep -o 'id="whoami"' | wc -l` returns exactly `1` (the `.kw-2up` wrapper in `app/page.tsx`).
- The pager is a real scroll container with a focusable descendant: `curl -s http://localhost:3000 | grep -c 'class="kw-man-doc"'` returns `1` and that element carries `tabindex="0"`.
- Reflow and the abridged variant are proven in a browser with a throwaway script kept **outside the repository** (`@playwright/test@1.62.1` is already installed by KW-001; run `npx playwright install chromium` first if the binary is missing). Write `/tmp/kw016-check.mjs` to load `http://localhost:3000`, and assert: at 320 × 568 `document.documentElement.scrollWidth <= document.documentElement.clientWidth`; at 320 × 568 and at 1024 × 768 every `.kw-man-full` computes `display: none`; at 1280 × 800 no `.kw-man-full` computes `display: none` and `.kw-man-hint` does; `.kw-man-doc` receives focus from `Tab` and its scrolling ancestor's `scrollTop` increases after pressing `PageDown`. Do not commit the script.
- Design-system discipline holds: `grep -nE '#[0-9a-fA-F]{3,8}\b' app/regions/ManPage.tsx` returns nothing, `grep -c 'class="gray"\|className="gray"' app/regions/ManPage.tsx` returns `0`, and `grep -c '!important' app/regions/ManPage.tsx` returns `0`.
- No link, no tooltip: `grep -cE '<a |title=' app/regions/ManPage.tsx` returns `0`.
- The diff touches exactly one file: `git diff --name-only origin/main...HEAD` prints `app/regions/ManPage.tsx` and nothing else.

### At-merge gate

- `ci-ok` is green on the exact PR head, i.e. KW-001's `.github/workflows/ci.yml` ran `typegen`, `typecheck`, `lint` and `build` on Node 24.
- The PR diff touches no file owned by a sibling: none of `app/globals.css`, `styles/**`, `content/**`, `components/ds/**`, `app/page.tsx`, `app/layout.tsx`, `app/regions/_contract.ts`, any other `app/regions/*.tsx`, `package.json` or `package-lock.json` (DEC-003, DEC-005).
- `git diff --stat origin/main...HEAD -- package.json package-lock.json` is empty — no dependency was added for a media query, a pager or an icon.
- After a production build, the privacy scrub still holds: `grep -rn '<redacted-personal-phone>' .next public` returns nothing (DEC-015).
- Rebasing onto current `main` produces no conflict outside `app/regions/ManPage.tsx`.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.** The region performs no I/O and has no runtime failure mode. Three build-time failure modes exist and all are intended to be loud: `fill()` throws if `content/manpage.ts` introduces a token this file does not resolve, so a copy-schema drift fails `next build` instead of shipping `{date}` to a visitor; a missing `content/` module means an upstream dependency has not merged and the correct response is to stop, not to author a local substitute; and a `Pane` that has lost `bodyStyle` or `titleAs` means KW-005's contract changed under this ticket, which is a plan revision, not a local patch. The one silent failure worth naming is the React 19 `<style>` hoist: if it does not emit, the abridged variant simply never activates and nothing else breaks — hence the explicit `grep` for `kw-man-full` in the agent gate.

**Security.** No user input, no secrets, no network calls, no `dangerouslySetInnerHTML` — and none is ever permitted in a region that renders `content/` verbatim. **DEC-015** stands: the phone number `<redacted-personal-phone>` must never reach the repository or the build output. This file introduces no personal data of its own; every string it prints comes from `content/`, which KW-006 greps clean, and the at-merge gate re-greps the built output. The AUTHOR and REPORTING BUGS sections carry an email address chosen under GATE-005 (b) — render it as text, never as a `mailto:` link, because link ownership belongs to KW-019 and an unresolved gate must not leak a personal recovery address into an `href`.

**Migration.** None. The site has exactly one route, `/`, before and after. This ticket replaces a placeholder region body created in the same plan; there is no persisted state, no URL change and no data format to migrate.

**Accessibility.** This is the ticket's substantive risk surface, because DEC-005 guarantees nobody else will sweep it.

- **1.3.1 Info and Relationships** — the roff structure is real markup: `<section>` + `<h3>` per man section, `<dl>`/`<dt>`/`<dd>` for OPTIONS, ENVIRONMENT and FILES, `<pre>` for `literal` blocks. `ManBlock.term` and `ManSection.id` exist in the contract precisely so this region can have a real heading outline; the comp has zero headings.
- **2.1.1 Keyboard** and axe's `scrollable-region-focusable` — the pager's scroll container has a focusable descendant (`.kw-man-doc[tabindex="0"]`), so it is reachable and scrollable with `Tab` then `Space` / `PageDown` / arrows / `Home` / `End`. This is the criterion the whole pager design bends around, and it is why `overflow: auto` and `tabIndex` sit on different elements.
- **2.4.7 Focus Visible** — the pager inherits the first `:focus-visible` rule that has ever existed in this design system, shipped by KW-003 in `--fg0 #fbf1c7` (14.451:1 on the pane surface). Declare no focus styles here and do not set `outline: none`.
- **1.4.3 Contrast (Minimum)** — body text is `--text-muted` (`#d5c4a1`) on `--surface-pane` (`#1d2021`) at **9.56:1**; section headers and chrome are `--text-faint` (`#a89984`) at **5.90:1**. `--text-comment` / `.gray` (`#928374`, **4.47:1**) is banned in this region. No hex is written here — only tokens, so KW-003's fixes propagate.
- **1.4.4 Resize Text** — all sizes are `--fs-*` tokens, which KW-003 re-derives to `rem` + `clamp()`; nothing here sets a `px` font size, so browser font-size preference works and the `ch` indents scale with it.
- **1.4.10 Reflow** — no page-level horizontal scrolling at 320 px, guaranteed by the contained scroll container and by `.pane{overflow:hidden}` zeroing the grid item's automatic minimum size. The pager's own horizontal scroll is deliberate and falls under the standard's exception for content requiring two-dimensional layout: a man page's column grid is meaning-bearing, and reflowing it reads as broken.
- **2.2.2 Pause, Stop, Hide** and **prefers-reduced-motion** — not applicable: this region has no animation, no transition and no timed content. The global reduced-motion stop is KW-003's.
- **Residual, deliberately left open for the operator and for KW-029 to observe rather than for this ticket to fix:** the `j`/`k` and `q` bindings from the `less(1)` sketch are not shipped (Invariant 4), and `MAN_ABRIDGED_HINT` is rendered verbatim even if its merged wording promises a keystroke this region cannot honour. The correct fix is a one-line reword in `content/manpage.ts` under KW-006, not a client component here.

## Surfaces

- Reads: content/manpage.ts, content/identity.ts, content/boot.ts, app/regions/_contract.ts, components/ds/Pane.tsx, app/page.tsx, styles/kw.css, styles/ds/layers/pane.css, docs/design/kevinweaver.dev.dc.html, docs/research/2026-07-31-content-ia.md, docs/research/2026-07-31-design-comp-spec.md
- Writes: app/regions/ManPage.tsx
- Contracts: app/regions/ManPage.tsx
- Safety: man-page region accessibility subtree (heading outline, focus order, keyboard scrolling), zero-client-JavaScript guarantee for app/regions/ManPage.tsx

## Sibling boundaries and open gates

**Upstream dependencies — what this ticket consumes and what to do if one is late.** All three are hard `depends_on` edges, and aiur's dispatch policy blocks a `todo` issue whose dependencies are non-terminal, so at pickup all three are merged. Verify anyway (note 1) and **stop and report** rather than substituting:

- **KW-003** ships `styles/ds/**`, `styles/kw.css` and `app/globals.css` — `.sr-only`, the `:focus-visible` ring, `body{overflow-x:clip}`, the `.kw-2up` / `.kw-pad` layout classes, the 540/720/900/1080 breakpoint set and every `--fs-*` / colour token this region references. If `.sr-only` is missing, the region `h2` renders visibly; that is a KW-003 defect, not a reason to inline a hiding style.
- **KW-005** ships `app/regions/ManPage.tsx` (the stub), `app/regions/_contract.ts` (`ManPageProps`, `REGION_META`) and `components/ds/Pane.tsx` (`bodyStyle`, `bodyClassName`, `titleAs`, `titleId`, `labelledBy`, `as`, `right`). Do not extend `PaneProps`.
- **KW-006** ships `content/manpage.ts`, `content/identity.ts` and `content/boot.ts` with every string resolved against GATE-005.

**Same-wave siblings (wave 3, eleven tickets, all disjoint write surfaces).** None of these files may appear in this PR:

- **KW-017** replaces `app/regions/CareerLog.tsx` and creates `components/ds/CommitLog.tsx`. It renders the *career* facts; this pane renders *who he is*. That tense-based split — the man page is identity, the git log is history — is what keeps the two panes non-duplicating, and it is also why education lands in the man page's `FILES` section and employers do not.
- **KW-018** replaces `app/regions/Header.tsx` and `app/regions/TmuxBar.tsx`; **KW-019** replaces `app/regions/Contact.tsx` and owns every link on the site; **KW-020** replaces `app/regions/BootOverlay.tsx`.
- **KW-013**, **KW-014**, **KW-015**, **KW-021**, **KW-022**, **KW-023** touch `scripts/**`, `lib/**`, `playwright.config.ts` and `.github/workflows/**` only.

**Downstream consumers.**

- **KW-027** depends on this ticket and generates `/resume.txt`, `/kevinweaver.1`, the metadata export, the OG card and the `<noscript>` fallback **from `content/`**, not from this component — so no export here is part of its contract. It also makes `curl -sL kevinweaver.dev/kevinweaver.1 | man -l -` real, which is the honest replacement for the abridged pane's "full page" hint.
- **KW-029** runs axe over `/`, asserts the reduced-motion halt and proves 320 px reflow in a real browser. It verifies this region; it does not modify it. Everything in the accessibility section above is written so that gate passes on the first run.
- **KW-032** composes the final page and owns operator-level evidence.

**Open gates.** **GATE-005 (HG-5)** is listed on this ticket because the synthesis records it as blocking KW-006 "and transitively KW-016/17/19/27" — three of its six questions (job title, email, podcast) land inside copy this pane renders. It is **discharged upstream**: by the time KW-006 merges, `content/manpage.ts` carries the resolved text and this ticket needs no further input. GATE-002 (workflow scope) and GATE-003 (SSO PAT) do not touch this region. GATE-007 (scanline treatment) is absorbed by KW-003 at token level and changes nothing here.
