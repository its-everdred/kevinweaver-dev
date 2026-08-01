# KW-005 — App shell, region slot contract, and seven region stubs

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Fourteen small files with no algorithmic depth, but the region props contract is the seam eight downstream tickets build against, so the interface has to be right the first time.

**Risk:** medium — a missing or wrong slot type reworks eight later tickets (KW-016, KW-017, KW-018, KW-019, KW-020, KW-025, KW-026, KW-027); the files themselves are trivial to revert and carry no data, no secrets and no runtime behaviour.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-002, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-005

**Gates:** none

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`app/page.tsx` composes seven named region slots, each region is its own file with a typed props contract, every stub renders labelled placeholder chrome, and `npm run typecheck && npm run lint && npm run build` is green — so a wave-3 agent can replace exactly one region file and touch nothing else.

## Context and evidence

This ticket exists because of **DEC-005** (synthesis D-05: zero `serializes_with` pairs; every same-wave ticket owns a disjoint write surface). The alternative shape — three large tickets each editing `app/page.tsx` — would force serialization across the two widest waves (10 and 11 tickets), and **C-11** established that `serializes_with` is the one edge type aiur does *not* enforce at runtime, so a plan that leans on it is both slower and unsafe. The synthesis calls this out explicitly: "KW-05 as a shell with seven stubs. Five region tickets become independent single-file jobs in the same wave."

The partition is possible because the comp is already seven structurally independent regions. Re-measured this session against `docs/design/kevinweaver.dev.dc.html` at `e664d73a195facd64db58ba10952170ff01b4772` (1,033 lines; this refines GT-13's line map by ±3 lines — per **C-30**, cite the selector first and the line number second):

| # | Region | Comp selector | Comp lines | Later owner |
|---|---|---|---|---|
| 1 | Header | `<header>` sticky + `<nav>` + live pill | 52–64 | KW-018 |
| 2 | Instrument | `<section class="kw-instr">` (contributions pane 69–88; `.kw-lower` 89–124 = gource `.pane.focus` 90–117 + `.kw-tail` events pane 118–123) | 68–125 | KW-025, transport footer 105–116 by KW-026 |
| 3 | ManPage | first `.pane` inside `.kw-2up#whoami` | 128–145 | KW-016 |
| 4 | CareerLog | `.pane#arc` | 146–159 | KW-017 |
| 5 | Contact | `.pane#contact` | 162–170 | KW-019 |
| 6 | TmuxBar | `.tmux` | 173–181 | KW-018 |
| 7 | BootOverlay | `<sc-if value={booting}>` full-cover pane | 183–190 | KW-020 |

Two further inputs shape the file set:

- **DEC-003** (D-03): `package.json` and `package-lock.json` are frozen after KW-001. This ticket adds no dependency and edits no manifest. Everything below is buildable from what KW-001 already installs (`next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3` — all three verified present on the registry this session).
- **DEC-002** (D-02): App Router, React Server Components, no `output:'export'`. The reason the shell matters is **content-ia's** finding that the current site has zero indexable text; RSC delivers the man page and git log at zero client JS. This ticket therefore ships **no** `'use client'` directive anywhere — each region ticket adds the directive to its own file only if it genuinely needs one.

Accessibility ground truth from the design track's element census (M) over the comp: `0 <h1> 0 <h2> 0 <h3> 0 <footer> 0 alt= 0 aria-* 0 role=`. There is **no cross-cutting a11y sweep ticket** (DEC-005 rejects one, because it would touch every region file and re-serialize the wave). So the *global* outline — one visually hidden `<h1>`, the landmark assignment, the bypass link, and the `aria-labelledby` wiring on every pane — is established here, once, and every region ticket owns its own subtree beneath it. KW-029 verifies, it does not sweep.

**Requirements this ticket serves.** REQ-002 (the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file), REQ-009 (the page carries a correct heading outline, landmark structure and bypass affordance, and the shell renders with zero client JavaScript).

Plan-context navigation (read these at the approved planning commit — the same commit the issue preamble links):

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/build-orders/site-rewrite/02-current-target-delta.md`, and the authoritative topological table, critical path and write-surface partition proof in `docs/research/2026-07-31-decomposition-synthesis.md` §6
- Decision registry: `docs/build-orders/site-rewrite/03-technical-decisions.md` (DEC-002, DEC-003, DEC-005 are D-02, D-03, D-05 in the synthesis §3 table)
- This ticket's implementation pointers: the "Refreshable implementation notes" section below

Evidence readable at `researched_at_commit` today:
[docs/design/kevinweaver.dev.dc.html](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/design/kevinweaver.dev.dc.html),
[docs/design/_ds/…/layers/pane.css](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/layers/pane.css),
[docs/research/2026-07-31-design-comp-spec.md](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-design-comp-spec.md) §3 and §9.5.

## Scope

- Rewrite `app/layout.tsx` so the document shell renders `<html lang="en">`, a `kw-root` hook class on `<body>`, the fixed scanline overlay, and `{children}` — preserving KW-001's existing `metadata`, `viewport` and font-loader statements byte-for-byte.
- Rewrite `app/page.tsx` to compose exactly the seven region slots in comp document order, with the bypass link, the single visually hidden `<h1>`, and the `#whoami` / `#arc` / `#contact` anchors the header nav targets.
- Author `app/regions/_contract.ts` exporting `RegionSlot`, `RegionCommonProps`, one props interface per slot (plus `TransportBarProps` for KW-026), the `REGION_META` record, and `NAV_SECTIONS`.
- Ship seven placeholder region components at `app/regions/{Header,Instrument,ManPage,CareerLog,Contact,TmuxBar,BootOverlay}.tsx`, each a named export with the region's own name, each rendering its landmark, its heading and a DS `.ph` placeholder body.
- Port the four shared DS chrome primitives into `components/ds/{Pane,PaneBar,Meter,Scanline}.tsx` as directive-free components that both server and client regions can import.
- Establish the page-wide heading outline, landmark assignment and pane `aria-labelledby` wiring that every region ticket extends beneath.

## Non-goals

- Real copy, resume facts, contribution figures or any `content/**` module — KW-006 owns those, and GATE-005 still gates several of them.
- Any edit to `app/globals.css` or anything under `styles/**` — KW-003 owns the entire CSS surface, including `.sr-only`, `.skip`, the focus ring, the reduced-motion stop and every token.
- Adding, removing or pinning a dependency, an npm script, `tsconfig.json`, `next.config.ts` or `eslint.config.mjs` — KW-001 owns them and DEC-003 freezes them.
- Creating `app/regions/TransportBar.tsx`, `components/ds/CommitLog.tsx` or `components/ds/TmuxBar.tsx` — KW-026, KW-017 and KW-018 create those files themselves.
- Self-hosted font binaries, `app/fonts.ts` or any SVG icon component — KW-004 owns them under DEC-004.
- Canvas mounting, `ResizeObserver`, DPR sizing, pointer handling or any `requestAnimationFrame` call — KW-025 and KW-024 own those; KW-024's invariant is that exactly one file in the repo calls `requestAnimationFrame`.
- Metadata expansion, OG image, `/resume.txt`, `/kevinweaver.1`, `noscript` fallback and the final page composition — KW-027 and KW-032.

## Existing owner and reuse target

There is **no `app/` directory at `researched_at_commit`**. `git ls-files` at `e664d73a195facd64db58ba10952170ff01b4772` shows the Pages Router (`pages/_app.js`, `pages/index.js`, `pages/api/hello.js`), `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `tailwind.config.js` and both `yarn.lock` and a stale `package-lock.json`. None of it is a reuse target: **KW-001 deletes all of it** and creates the App Router scaffold this ticket extends.

Reuse targets, and who guarantees them:

| Target | State at pickup | Guaranteed by |
|---|---|---|
| `app/layout.tsx`, `app/page.tsx`, `app/globals.css` | created as a blank-but-styled placeholder | KW-001 (its write surface, verbatim) |
| `tsconfig.json` with `"paths": {"@/*": ["./*"]}` | created; **verify at pickup** | KW-001 |
| npm scripts `typegen typecheck lint build` | pre-declared | KW-001 under DEC-003 |
| `.pane` / `.pane-bar` / `.pane-title` / `.pane-body` / `.dots` / `.ph` / `.metric` / `.meter` / `.m-row` / `.m-pct` class names | CSS ported to `styles/ds/**` in the same wave; class names are stable today in `docs/design/_ds/…/layers/{pane,data}.css` | on disk now (GT-5, C-3), re-shipped by KW-003 |
| `--scanline`, `--scanline-opacity`, `--shadow-focus`, `--shadow-inset-track` | defined today in `docs/design/_ds/…/tokens/effects.css`; re-shipped for the web by KW-003 | on disk now |
| `.sr-only` and the `:focus-visible` ring | **not yet on disk**; both are named in KW-003's stated outcome (global a11y layer) | KW-003 (parallel sibling) |
| `.skip` (bypass link, visible on focus) | **not on disk and not named by any ticket** — no rule guarantees it; see implementation note 9 for the deliberate degradation and who closes it | nobody — tracked residual |

Not reusable, do not go looking for them: the DesignSync project ships `components/chrome/Pane.jsx` and `Pane.d.ts` (and `PaneBar.jsx`, `CommitLog.jsx`), and the design track quotes their signatures — but **those files are not in this repository at `researched_at_commit`** and fetching them is explicitly off the critical path (DEC-004, GT-5). Write the primitives from the CSS that *is* on disk, using the documented prop names below so the shapes stay compatible.

## Contract and invariants

**Invariant 1 — one region, one file, no barrel.** `app/page.tsx` imports each region by its own path. There is no `app/regions/index.ts`. Replacing `app/regions/ManPage.tsx` wholesale must never require an edit to `app/page.tsx`, to any sibling region, or to `_contract.ts`. This is the property that keeps waves 3–5 parallel; it is checked in the agent gate.

**Invariant 2 — stubs import three things and nothing else.** A region stub may import from `react`, from `./_contract`, and from `@/components/ds/*`. It must not import `content/**`, `lib/**`, `styles/**`, or another region. None of those modules exist yet, and a stub that reaches for them turns a wave-2 ticket into a wave-3 ticket.

**Invariant 3 — the shell ships zero client JavaScript.** No file written by this ticket contains `'use client'`. Regions that need interactivity (Instrument, BootOverlay, TransportBar) add the directive to their own file in their own ticket.

**Invariant 4 — heading outline and landmarks are fixed here.** Exactly one `<h1>` on the page, visually hidden, first child of `<main>`. Every region exposes an accessible name via `aria-labelledby` pointing at its pane title, and the pane title renders as an `<h2>`. Region tickets may add `<h3>` and below inside their own subtree; they may not add a second `<h1>` and they may not change their landmark element without changing `REGION_META`.

**Invariant 5 — KW-005 never writes CSS.** Where a stub needs a visual, it uses a DS class name that already exists on disk, or an inline `style` that references only DS custom properties with a literal fallback. It never adds a rule to `app/globals.css` or `styles/**`.

### Producer interface — `app/regions/_contract.ts`

This is the seam. Consumers (KW-016, KW-017, KW-018, KW-019, KW-020, KW-025, KW-026) quote it verbatim; do not paraphrase it into a local type.

```ts
// app/regions/_contract.ts
import type { CSSProperties } from 'react'

/** The seven top-level regions app/page.tsx mounts, in comp document order. */
export type RegionSlot =
  | 'header'
  | 'instrument'
  | 'manPage'
  | 'careerLog'
  | 'contact'
  | 'tmuxBar'
  | 'bootOverlay'

/**
 * The envelope every region accepts. No region requires any prop: a region
 * reads its own data and owns its own layout, so the page shell stays a pure
 * composition and one region can be swapped without touching page.tsx.
 */
export interface RegionCommonProps {
  /** Fragment target for the header nav. Defaults to REGION_META[slot].anchorId. */
  id?: string
  /** Appended to the region's own class list; never replaces it. */
  className?: string
  /** Layout escape hatch used by the page shell only. */
  style?: CSSProperties
}

export interface HeaderProps extends RegionCommonProps {}
export interface InstrumentProps extends RegionCommonProps {}
export interface ManPageProps extends RegionCommonProps {}
export interface CareerLogProps extends RegionCommonProps {}
export interface ContactProps extends RegionCommonProps {}
export interface TmuxBarProps extends RegionCommonProps {}
export interface BootOverlayProps extends RegionCommonProps {}

/**
 * KW-026 creates app/regions/TransportBar.tsx and mounts it in the Instrument
 * region's Pane `footer` slot (comp:105-116). The type lives here because
 * _contract.ts is owned exclusively by KW-005 and must not be edited later.
 */
export interface TransportBarProps extends RegionCommonProps {}

export interface RegionMeta {
  /** Landmark element the region must render as its outermost node. */
  readonly landmark: 'header' | 'section' | 'footer' | 'div'
  /** Fragment id, or null when the region is not a nav target. */
  readonly anchorId: string | null
  /** id of the element carrying the region's accessible name. */
  readonly titleId: string
  /** Region-level accessible name. Nested panes carry their own titles. */
  readonly accessibleName: string
  /** Heading level of the region title. Regions own h3 and below. */
  readonly headingLevel: 2
}

export const REGION_META = {
  header:      { landmark: 'header',  anchorId: null,      titleId: 'region-header-title',       accessibleName: 'site header',                             headingLevel: 2 },
  instrument:  { landmark: 'section', anchorId: null,      titleId: 'region-instrument-title',   accessibleName: 'contribution instrument',                 headingLevel: 2 },
  manPage:     { landmark: 'section', anchorId: 'whoami',  titleId: 'region-man-page-title',     accessibleName: 'man kevin-weaver',                        headingLevel: 2 },
  careerLog:   { landmark: 'section', anchorId: 'arc',     titleId: 'region-career-log-title',   accessibleName: 'git log --graph --oneline --since=2021',  headingLevel: 2 },
  contact:     { landmark: 'section', anchorId: 'contact', titleId: 'region-contact-title',      accessibleName: 'reach me',                                headingLevel: 2 },
  tmuxBar:     { landmark: 'footer',  anchorId: null,      titleId: 'region-tmux-bar-title',     accessibleName: 'status bar',                              headingLevel: 2 },
  bootOverlay: { landmark: 'div',     anchorId: null,      titleId: 'region-boot-overlay-title', accessibleName: 'kevinweaver.dev — cold start',            headingLevel: 2 },
} as const satisfies Record<RegionSlot, RegionMeta>

export interface NavSection {
  readonly index: number
  readonly id: string
  readonly label: string
}

/** comp:55-57 — the header nav renders these as tmux window numbers. */
export const NAV_SECTIONS = [
  { index: 1, id: 'whoami', label: 'whoami' },
  { index: 2, id: 'arc', label: 'arc' },
  { index: 3, id: 'contact', label: 'contact' },
] as const satisfies readonly NavSection[]
```

### Producer interface — `components/ds/Pane.tsx`

Prop names `title`, `dots`, `titleColor`, `right`, `focus`, `bleed` are the DesignSync `Pane` contract as documented by the design track; `footer`, `as`, `labelledBy`, `bodyRef` are the four additions design-comp-spec §3.1 specifies for this site (`footer` for the 38 px transport bar, `bodyRef` for the log/boot bodies, `as`/`labelledBy` for landmark semantics). `titleId`, `titleAs` and `bodyClassName` are added here so the heading outline can be expressed without a second component.

```ts
// components/ds/Pane.tsx
import type { CSSProperties, ReactNode, Ref } from 'react'

export interface PaneProps {
  title?: ReactNode
  titleId?: string
  titleAs?: 'span' | 'h2' | 'h3'
  dots?: boolean
  titleColor?: string
  right?: ReactNode
  focus?: boolean
  bleed?: boolean
  footer?: ReactNode
  as?: 'div' | 'section' | 'article' | 'aside'
  labelledBy?: string
  bodyRef?: Ref<HTMLDivElement>
  id?: string
  className?: string
  style?: CSSProperties
  bodyStyle?: CSSProperties
  bodyClassName?: string
  children?: ReactNode
}

export function Pane(props: PaneProps): ReactNode
```

Pane invariants, all traceable to `layers/pane.css` on disk:

- The bar renders only when `title != null || dots || right != null` (the DesignSync behaviour).
- `.pane-body{overflow:hidden}` is a **hard DS rule**. A scrollable pager (KW-016) passes `bodyStyle={{ overflowY: 'auto' }}` to that one pane; the component must never default to `auto`.
- `.pane-body{min-height:0}` is what makes the `100dvh` instrument column work. Never drop it, never override it from a region.
- `focus` renders `.pane.focus`. The DS comment says **at most one focused pane per view**; the comp satisfies this because the gource pane and the boot overlay are never on screen together (boot is a fixed full-cover layer). Keep that true.
- `dots` renders `<div class="dots" aria-hidden="true">` with three `<i>` children — the `<i>` elements are decorative and must stay out of the accessibility tree.
- `right` takes a raw `ReactNode` with no wrapper styling. The upstream `PaneBar` hardcoded `className="gray"` on that slot; the comp's right slots are aqua/tabular-nums and fg4, and `--gray` is a measured 4.47:1 contrast failure on the pane surface (KW-003 fixes the token usage). Do not reintroduce the wrapper.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify the four "verify at pickup" items before writing code; if any is false, stop and report rather than fixing it here — every one of them belongs to KW-001.

1. **Verify the base.** `git ls-files pages | wc -l` must be `0` (a surviving `pages/index.js` plus `app/page.tsx` is a hard Next 16 route conflict). `test -f app/layout.tsx && test -f app/page.tsx && test -f app/globals.css`. `grep -n '"@/\*"' tsconfig.json` — if the alias is absent, use relative imports (`../../components/ds/Pane`) rather than editing `tsconfig.json`. `npm ci && npm run build` must be green *before* you change anything.

2. **`app/layout.tsx` — surgical rewrite, not a replacement.** Keep every existing import, `export const metadata`, `export const viewport` and font-loader statement exactly as KW-001 left them (KW-027 later expands the metadata export; KW-004 later swaps the font loader). Change only the returned JSX:

   ```tsx
   // app/layout.tsx — only the returned tree changes.
   import { Scanline } from '@/components/ds/Scanline'
   // ...KW-001's existing imports, metadata and viewport exports stay untouched...

   export default function RootLayout({
     children,
   }: Readonly<{ children: React.ReactNode }>) {
     return (
       <html lang="en">
         <body className="kw-root">
           <Scanline />
           {children}
         </body>
       </html>
     )
   }
   ```

   `lang="en"` is required — the live site serves none. `kw-root` is a styling hook for KW-003's root token block (comp:48 sets `--bar-h`, `--fs-*`, `--pane-pad`, `--pane-gap`, `--accent` on the outer element); it is additive, so KW-003 scoping to `:root` or `body` instead costs nothing. Keep whatever `className` KW-001 put on `<html>` (the font variable class) — deleting it silently drops the typeface.

3. **`components/ds/Scanline.tsx`** — the comp's fixed overlay (comp:50), expressed with tokens so GATE-007 (HG-7, scanline treatment) is a token change and not a code change:

   ```tsx
   export function Scanline() {
     return (
       <div
         aria-hidden="true"
         style={{
           position: 'fixed',
           inset: 0,
           pointerEvents: 'none',
           zIndex: 80,
           background: 'var(--scanline)',
           opacity: 'var(--scanline-opacity, .35)',
           mixBlendMode: 'multiply',
         }}
       />
     )
   }
   ```

   The literal `.35` fallback is mandatory: if `--scanline-opacity` is undefined the declaration becomes invalid-at-computed-value-time and `opacity` falls back to `1`, painting a near-black page. Both tokens exist today in `docs/design/_ds/…/tokens/effects.css` (`--scanline-opacity:.35`).

4. **`components/ds/Pane.tsx` / `PaneBar.tsx`.** Implement the signature quoted above. Sketch:

   ```tsx
   export function Pane({
     as: Tag = 'div', title, titleId, titleAs = 'span', dots = false, titleColor,
     right, focus = false, bleed = false, footer, labelledBy, bodyRef, id,
     className, style, bodyStyle, bodyClassName, children,
   }: PaneProps) {
     const hasBar = title != null || dots || right != null
     return (
       <Tag
         id={id}
         className={['pane', focus && 'focus', className].filter(Boolean).join(' ')}
         style={style}
         aria-labelledby={labelledBy}
       >
         {hasBar ? (
           <PaneBar title={title} titleId={titleId} titleAs={titleAs} dots={dots}
                    titleColor={titleColor} right={right} />
         ) : null}
         <div
           ref={bodyRef}
           className={['pane-body', bleed && 'bleed', bodyClassName].filter(Boolean).join(' ')}
           style={bodyStyle}
         >
           {children}
         </div>
         {footer}
       </Tag>
     )
   }
   ```

   If `tsc --noEmit` rejects the union-typed `Tag` in JSX position, narrow it (`const Tag: ElementType = as`) rather than widening `PaneProps.as`. `PaneBar` renders `<div class="pane-bar">`, then the optional `.dots` block, then the title element chosen by `titleAs` with `id={titleId}` and `className="pane-title"`, then `right` inside a `<span style={{ flex: 1 }} />`-separated slot. Do not add `padding-left:2px` inline hacks; that is KW-003's `--pane-bar-pad` work.

5. **`components/ds/Meter.tsx`.** `.metric` / `.m-row` / `.m-pct` / `.meter` / `.fill` exist in `layers/data.css` and are unused by the comp; ship the primitive so no later ticket has to add a file to `components/ds/`. Signature `Meter({ label, value, display, rainbow, from, to, className })`; clamp `value` to 0–100; write `--val`, `--g1`, `--g2` through a `style` object cast to `CSSProperties`; put `role="progressbar"` with `aria-valuenow/min/max` on `.meter`. Do **not** set the `.anim` class and do **not** use `rainbow` in a stub — `.metric.rainbowfill .meter .fill` is one of the **six** unguarded infinite animations (C-16) and KW-003 owns the global stop.

6. **`app/regions/_contract.ts`.** Exactly the module quoted in "Contract and invariants", nothing more. It is a types-and-constants module: no JSX, no React import beyond `import type`, no runtime logic.

7. **The seven stubs.** One file each, identical shape. Worked example — every other stub is this file with the slot name, the meta key and the owning ticket changed:

   ```tsx
   // app/regions/ManPage.tsx
   import { Pane } from '@/components/ds/Pane'
   import { REGION_META, type ManPageProps } from './_contract'

   const META = REGION_META.manPage

   export function ManPage({ id = META.anchorId ?? undefined, className, style }: ManPageProps) {
     return (
       <Pane
         as="section"
         id={id}
         className={className}
         style={style}
         title={META.accessibleName}
         titleId={META.titleId}
         titleAs="h2"
         labelledBy={META.titleId}
       >
         {/* KW-016 replaces this body. Edit no other file. */}
         <p className="ph">
           <span>man page — KW-016</span>
         </p>
       </Pane>
     )
   }
   ```

   Per-slot deviations, all of them structural rather than cosmetic:
   - `Header` renders `as="header"`-equivalent markup directly (a `<header>` element, not a `Pane` — the comp's header is bare chrome, comp:52-64) with the `<nav>` skeleton driven by `NAV_SECTIONS`, and leaves the live pill to KW-018.
   - `Instrument` renders `<section className="kw-instr">` containing three `Pane`s — contributions, gource (`focus`, and it passes `footer={null}` with a comment naming KW-026's `TransportBar` as the eventual occupant), and the events tail pane. Stub bodies only; no `<canvas>`, no refs, no client directive.
   - `CareerLog` uses `anchorId: 'arc'`; the `#whoami` anchor belongs to the `.kw-2up` wrapper in `page.tsx`, matching comp:127.
   - `TmuxBar` renders a `<footer>` with `role="contentinfo"` implied by the element, not a `Pane`.
   - `BootOverlay` renders **nothing** in this ticket: `return null`, with the contract comment recording that KW-020 owns the once-per-session, fully skippable, reduced-motion-bypassed overlay and its `role="dialog" aria-modal="true"` semantics. A stub that paints a full-cover fixed layer would black out the page for every other wave-3 agent.

8. **`app/page.tsx`.** Pure composition, comp document order:

   ```tsx
   import { BootOverlay } from './regions/BootOverlay'
   import { CareerLog } from './regions/CareerLog'
   import { Contact } from './regions/Contact'
   import { Header } from './regions/Header'
   import { Instrument } from './regions/Instrument'
   import { ManPage } from './regions/ManPage'
   import { TmuxBar } from './regions/TmuxBar'

   export default function Page() {
     return (
       <>
         <a className="skip sr-only" href="#whoami">
           skip the animation
         </a>
         <Header />
         <main className="kw-pad">
           <h1 className="sr-only">Kevin Weaver</h1>
           <Instrument />
           <div className="kw-2up" id="whoami">
             <ManPage />
             <CareerLog />
           </div>
           <Contact />
         </main>
         <TmuxBar />
         <BootOverlay />
       </>
     )
   }
   ```

   The `<h1>` text is deliberately just the name. The job title is one of the three conflicting variants under GATE-005 (HG-5) and no measurement can settle it; KW-032's final composition swaps in `content/identity.ts` once the gate clears. Do not invent a title here and do not copy the one KW-001 put in `metadata` — that string is KW-027's problem.

9. **Bypass link degradation, stated so nobody "fixes" it.** `.skip` and `.sr-only` are shipped by KW-003 in the same wave. Until KW-003 merges, the bypass link and the `<h1>` render visibly. That is expected. Do not inline styles to hide them (Invariant 5), and do not add the rules to `app/globals.css`. If `.skip` is never given a visible-on-focus treatment, the residual — a bypass link that satisfies WCAG 2.4.1 but is invisible to sighted keyboard users — is KW-029's to close, in KW-003's file.

10. **Formatting and lint.** Match whatever Prettier config KW-001 shipped by running `npm run format` (declared script) before committing; do not hand-fight quote style or semicolons. `npm run lint` uses `eslint-config-next@16.2.12` flat config; `next typegen` must run before `tsc --noEmit`, which is why the contract is `npm run typecheck` (KW-001 defines it as `next typegen && tsc --noEmit`) and not a bare `tsc`.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on Node 24.
- `app/page.tsx` mounts all seven regions: `grep -c "from './regions/" app/page.tsx` returns `7`, and `ls app/regions/*.tsx | wc -l` returns `7`.
- `app/regions/_contract.ts` exports `RegionSlot`, `RegionCommonProps`, `REGION_META`, `NAV_SECTIONS` and one props interface per slot plus `TransportBarProps`; `REGION_META` type-checks against `Record<RegionSlot, RegionMeta>` via `satisfies`.
- Single-file replaceability holds: there is no `app/regions/index.ts`, and `grep -rn "^import" app/regions/*.tsx | grep -v "_contract\|@/components/ds\|from 'react'"` is empty.
- No client boundary is introduced: `grep -rl "use client" app components` is empty.
- The page has exactly one `<h1>`, it carries `sr-only`, and every region title element id in the rendered HTML is referenced by an `aria-labelledby`: `npm run build && grep -c "<h1" .next/server/app/index.html` (or the equivalent RSC output inspected with `npm start` and `curl -s localhost:3000 | grep -c '<h1'`) returns `1`.
- No file outside the declared write surface is touched: `git diff --name-only origin/main...HEAD` is a subset of the "Writes" list, and `git diff --stat origin/main...HEAD -- package.json package-lock.json app/globals.css` is empty (DEC-003, DEC-005).
- `git ls-files pages | wc -l` is `0` and `curl`-free `npm run build` emits no "Conflicting app and page file" warning.

### At-merge gate

- `ci-ok` is green on the exact PR head, with `typegen`, `typecheck`, `lint` and `build` all run by KW-001's `.github/workflows/ci.yml`.
- The PR diff touches no file owned by a wave-2 sibling — specifically none of `app/globals.css`, `styles/**`, `app/fonts.ts`, `components/icons/**`, `lib/**`, `content/**`, `scripts/**`, `package.json`, `package-lock.json`.
- Rebasing onto current `main` produces no conflict in `app/layout.tsx` beyond the JSX tree this ticket rewrote — evidence that KW-001's `metadata`, `viewport` and font statements were preserved rather than regenerated.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.** The shell renders no data and performs no I/O, so it has no runtime failure mode of its own. The two build-time failure modes are both structural: a surviving `pages/` route colliding with `app/page.tsx`, and a stub importing a module that a sibling ticket has not merged yet. Both are covered by the agent gate. `BootOverlay` returning `null` is deliberate — a stub that painted the comp's fixed full-cover layer would black out every screenshot taken by every parallel agent in waves 3–5.

**Security.** No user input, no secrets, no network calls, no `dangerouslySetInnerHTML` anywhere in the shell — and none is ever permitted in it. Under DEC-015 the phone number `856-723-2521` must not appear in the repository or the build output; this ticket ships no personal data at all, so the constraint is satisfied trivially and must stay that way when the `<h1>` is later swapped for `content/identity.ts`.

**Migration.** This is the Pages-Router-to-App-Router cutover's second half. KW-001 deletes `pages/**`; this ticket assumes that deletion has landed and asserts it. There is no data migration, no persisted state and no URL change: the site has exactly one route, `/`, before and after.

**Accessibility.** This is the ticket's substantive risk surface, because the comp scores `0 <h1> 0 <h2> 0 <footer> 0 aria-* 0 role=` and there is no a11y sweep ticket (DEC-005). Fixed here: `<html lang="en">`; one visually hidden `<h1>` as the first child of `<main>`; `banner` / `main` / `contentinfo` landmarks via `<header>`, `<main>`, `<footer>`; every pane named through `aria-labelledby` → `.pane-title` rendered as `<h2>`; decorative `.dots` and the scanline marked `aria-hidden="true"` (the DS uses `<i>` as a decorative box, which otherwise carries an implicit emphasis semantic); and a bypass link as the first focusable element, because the first tab stop would otherwise be a nav link in front of roughly 600 px of canvas. Deferred by design and named here so KW-029 can find them: the focus-ring, `.sr-only` and `.skip` rules (KW-003), the boot overlay's dialog semantics and focus restoration (KW-020), canvas `role="img"` plus the DEC-011 visually hidden table (KW-025, KW-029), and control semantics for the transport bar (KW-026).

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/design/_ds/**, app/globals.css, tsconfig.json, package.json
- Writes: app/layout.tsx, app/page.tsx, app/regions/_contract.ts, app/regions/Header.tsx, app/regions/Instrument.tsx, app/regions/ManPage.tsx, app/regions/CareerLog.tsx, app/regions/Contact.tsx, app/regions/TmuxBar.tsx, app/regions/BootOverlay.tsx, components/ds/Pane.tsx, components/ds/PaneBar.tsx, components/ds/Meter.tsx, components/ds/Scanline.tsx
- Contracts: app/regions/_contract.ts, components/ds/Pane.tsx
- Safety: page heading outline and landmark structure, region file ownership boundary

## Sibling boundaries and open gates

Same wave (KW-003 … KW-012), all depending only on KW-001, all with disjoint write surfaces:

- **KW-003** owns every stylesheet — `app/globals.css`, `styles/ds/**`, `styles/kw.css` — including `.sr-only`, `.skip`, the `:focus-visible` ring in `--fg0`, the six-animation reduced-motion stop, `body{overflow-x:clip}`, the contrast fixes and the `@theme inline` bridge. This ticket consumes those class names and writes none of them.
- **KW-004** owns `public/fonts/**`, `app/fonts.ts` and `components/icons/**`. **Open coordination item for the Executor:** self-hosting the typeface requires swapping the font loader inside `app/layout.tsx`, which the synthesis's partition assigns to KW-005 while assigning the font module to KW-004. Neither ticket can do both halves alone. Recommended resolution: sequence KW-004 after KW-005 and let it make that one-line change under a declared conflict exception on `app/layout.tsx` (a write-surface overlap is a warning, never an error). KW-005 must not delete the existing font wiring in anticipation — doing so drops the typeface outright.
- **KW-006** owns `content/**`. No stub imports it. GATE-005 (HG-5: email, Twitter handle, job title, side lane, podcast, availability) blocks KW-006, not this ticket, but it is the reason the `<h1>` here is a bare name.
- **KW-007**, **KW-008**, **KW-009**, **KW-010**, **KW-011**, **KW-012** touch `lib/**`, `scripts/**`, `test/**` and config only — no overlap.

Downstream consumers of this contract, in dependency order:

- **KW-016** replaces `app/regions/ManPage.tsx`; it applies the `overflow:auto` override to its own pane body via `bodyStyle` and owns its `h3` sub-structure.
- **KW-017** replaces `app/regions/CareerLog.tsx` and creates `components/ds/CommitLog.tsx`.
- **KW-018** replaces `app/regions/Header.tsx` and `app/regions/TmuxBar.tsx` and creates `components/ds/TmuxBar.tsx`; it consumes `NAV_SECTIONS`.
- **KW-019** replaces `app/regions/Contact.tsx`. **KW-020** replaces `app/regions/BootOverlay.tsx`.
- **KW-025** replaces `app/regions/Instrument.tsx` and creates `components/viz/**`. **KW-026** creates `app/regions/TransportBar.tsx` and mounts it in the Instrument pane's `footer` slot, consuming `TransportBarProps`.
- **KW-027** appends to `app/layout.tsx`'s metadata export only. **KW-032** owns the final composition of `app/page.tsx`.

Open gates: **none block pickup of this ticket.** GATE-002 (HG-2, `workflow` scope) touches only tickets that write `.github/workflows/**`; GATE-005 (HG-5) blocks KW-006; GATE-007 (HG-7, scanline treatment) is absorbed by reading `--scanline-opacity` from the token rather than hardcoding `.35`.
