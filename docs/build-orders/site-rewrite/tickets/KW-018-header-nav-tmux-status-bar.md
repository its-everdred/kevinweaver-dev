# KW-018 — Region: sticky header/nav and tmux status bar

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Three small files, no algorithm and no data dependency, but the segment model has to encode the reflow budget correctly the first time and the region carries the page's only `banner` and `contentinfo` landmarks, which KW-029 gates.

**Risk:** medium — the tmux bar is the one element measured to break whole-page horizontal scrolling below ~470 px, and the header carries the site's only section navigation; both are cheap to revert (three files, no data, no secrets, no migration, no dependency change).

**Phase hint:** 3

**Depends on:** KW-003, KW-004, KW-005

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-009

**Decisions:** DEC-002, DEC-003, DEC-004, DEC-005, DEC-008, DEC-014

**Gates:** none

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The sticky top chrome and the tmux status footer render as real landmarks with a data-driven section nav, every readout is prop- or seam-driven rather than a hardcoded literal, segments shed by breakpoint instead of clipping, and at 320 px the bar's widest visible configuration measures 246 CSS px against a 320 px viewport — so the page has no horizontal scrollbar and the active section is identifiable without relying on colour.

## Context and evidence

This region is two of the comp's seven structurally independent regions (**DEC-005**, synthesis D-05): `<header>` at comp:52-64 and `.tmux` at comp:173-181 of `docs/design/kevinweaver.dev.dc.html`. KW-005 already mounted both as stubs and fixed their landmark, anchor and accessible-name metadata in `app/regions/_contract.ts`; this ticket replaces the two stub bodies and adds the one shared view component they need. Nothing else on the page is touched, which is what keeps the eleven wave-3 tickets parallel.

Four measured facts drive the work.

**1. The bar overflows the viewport and the page has no backstop.** Re-measured at this commit: `layers/tmux.css` gives `.tmux` no `overflow` and no wrapping, and every `.tmux .seg` is `white-space:nowrap`. The comp's six segments at `--fs-micro:11px` JetBrains Mono (0.6 em advance, so 6.6 px/char) carry `NORMAL` + ` main` + `kevinweaver.dev` + `☰ 1826/1826` + `100%` + `09:41` = 48 glyphs ≈ 317 px of text plus roughly 150 px of segment padding, i.e. a **~470–515 px minimum width**. Below that the bar overflows and, because nothing in the comp or the design system sets `overflow-x`, it produces a horizontal scrollbar on the whole document — a WCAG 1.4.10 Reflow failure at every real phone width (360–430 px). KW-003 lands `body { overflow-x: clip }` as the backstop; this ticket removes the cause.

**2. The nav has no non-colour affordance and vanishes on mobile.** The comp's nav links set `border:none` inline (comp:55-57), which deletes `layers/base.css`'s `a{border-bottom:1px solid color-mix(in oklab,var(--accent) 45%,transparent)}` — verified present at this commit — leaving the links with no non-colour channel at all. The active-section indicator is applied by script as `background:var(--aqua-d); color:var(--bg-h)` (comp:501-504), which is also colour-only. Worse, the whole `<nav>` carries `.kw-hide-sm`, and the comp's own media query is `@media (max-width:720px){.kw-hide-sm{display:none !important}}` — so below 720 px there is **no section navigation on the page at all**. The synthesis's fix is to mirror the nav into the tmux bar as tmux windows (`1:whoami 2:arc* 3:contact`) using the five design-system classes the comp never used.

**3. Those five classes exist and are unused.** Re-read at this commit, `layers/tmux.css` defines `.tmux .wins`, `.tmux .win`, `.tmux .win.active`, `.tmux .host` and `.tmux .chev`; the comp uses only `.seg .pl .plr .session .clock .spacer`. So the window-list model is already styled and only needs markup. Its default colour pairing, however, is a measured contrast failure — see the contract section.

**4. Powerline separators are `clip-path`, never glyphs.** `layers/tmux.css`'s own header comment at this commit states it: *"Powerline-style angled separators are drawn with CSS clip-path triangles, not U+E0B0 glyphs — Google-hosted JetBrains Mono ships no Nerd Font PUA range, so a glyph separator would render as tofu."* **GT-12** independently confirms the comp uses 16 non-ASCII codepoints and **zero** PUA. The same reasoning is why **DEC-004** (synthesis D-04) converts `U+2630 ☰` — the tmux position segment's glyph — to an inline SVG icon: the design track's verification pass (correction **C2**) enumerated every codepoint above `U+2000` in the comp against the `unicode-range` of each `@font-face` in `tokens/fonts.css` and found `☰ U+2630` (2 occurrences) outside *every* subset in the file.

Two further constraints shape the readouts.

- **DEC-008** (D-08, and the resolution of **C-1** and **C-20**): no contribution or window figure is a literal anywhere in copy. The comp hardcodes `☰ 1826/1826` in markup at comp:178, `100%` at comp:179 and `09:41` at comp:180. All three must go. `1826` is `dayCount`, a payload field; `09:41` is a wall clock that is wrong the instant the page is cached.
- **DEC-014** (D-14): the header's freshness pill stays, but it must be driven by the payload's `generatedAt`, not by the comp's `emitLive()` synthesiser. `emitLive()` re-rolls a random event every 2,600 ms and its deletion belongs to KW-026; this ticket ships the pill so that it renders **nothing** unless it is given a real freshness value, which means it can never claim data the site does not have.

**Requirements this ticket serves.** REQ-002 (the site is rebuilt as a Next.js App Router application whose UI is partitioned into the comp's seven independent regions, so region work runs in parallel and no two tickets share a file), REQ-003 (every claim on the site is the authoritative resume or measured data — no placeholder, no invented employer, no hardcoded figure), REQ-009 (the page carries a correct heading outline, landmark structure and bypass affordance).

Plan-context navigation (read these at the approved planning commit — the same commit the issue preamble links):

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/build-orders/site-rewrite/02-current-target-delta.md`, plus the authoritative topological table, critical path and write-surface partition proof in `docs/research/2026-07-31-decomposition-synthesis.md` §6
- Decision registry: `docs/build-orders/site-rewrite/03-technical-decisions.md` (DEC-002, DEC-003, DEC-004, DEC-005, DEC-008 and DEC-014 are D-02, D-03, D-04, D-05, D-08 and D-14 in the synthesis §3 table)
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, wave 3, the **KW-18** entry; and `docs/research/2026-07-31-design-comp-spec.md` §2.2 (header), §2.7 (tmux markup), §3.6 (tmux CSS and the React API), §8.3 (responsive gaps) and §9.1/§9.5 (contrast and semantics)

## Scope

- Replace the KW-005 stub at `app/regions/Header.tsx` with the real sticky banner: a brand link to `/`, section navigation rendered from `NAV_SECTIONS`, a restored non-colour link affordance, an `aria-current`-based active-section indicator, and the optional `generatedAt`-driven freshness pill.
- Create `components/ds/TmuxBar.tsx`: a presentational free-segment status-bar view over the design system's `.tmux/.seg/.pl/.plr/.session/.wins/.win/.win.active/.host/.clock/.chev` classes, with a `hideBelow` shed model, plus the shared `useActiveSection` scroll-spy hook both regions consume.
- Replace the KW-005 stub at `app/regions/TmuxBar.tsx` with the real `<footer>` status bar: session, window list mirroring the header nav, branch, host, spacer, position, percent and clock segments.
- Expose the position, percent and clock readouts as a documented `data-tmux-slot` DOM seam with indeterminate `progressbar` semantics, so KW-024's driver can fill them without editing this region.
- Resolve the dead `--tmux-h` carry: emit no inline `height` on the bar so KW-003's re-derived `--tmux-h` token drives it through `min-height`.
- Apply KW-003's contrast fix D5.5 to every `--text-dim`-on-`--surface-raised` site this region introduces, taking each from 4.050:1 to 6.432:1.
- Replace `U+2630 ☰` with KW-004's inline SVG icon and keep all three files' source pure ASCII.

## Non-goals

- Editing `app/page.tsx`, `app/layout.tsx` or `app/regions/_contract.ts` — KW-005 owns them and KW-032 owns the final composition. In particular, do not add a second skip link; `app/page.tsx` already renders one.
- Editing anything under `styles/**` or `app/globals.css` — KW-003 owns all CSS. This ticket adds no stylesheet, no CSS module and no `<style>` tag.
- Creating or editing `components/icons/**`, `app/fonts.ts` or `public/fonts/**` — KW-004 owns them.
- Reading or creating anything under `content/**` — KW-006 owns it. No resume claim, job title, email address, social handle or contribution figure enters this region.
- Building `app/regions/TransportBar.tsx`, the playback buttons, the `Space` rebinding, the Bomberman deletion or the `emitLive()` removal — KW-026 owns all of it.
- Writing anything under `lib/viz/**`, including the driver that fills the position, percent and clock readouts — KW-021, KW-022 and KW-024 own that.
- Reading `public/data/v1/**` or importing `lib/bundle/**` — KW-012 and KW-015 own the payload; this region takes freshness as a prop.
- Adding any test file, test-runner config, Playwright spec, workflow or size budget — KW-011, KW-023, KW-029, KW-030 and KW-031 own those surfaces.
- Adding or upgrading any dependency, or editing `package.json` or `package-lock.json` — frozen by DEC-003.
- The runtime 320 px reflow proof, the axe run and the keyboard traversal sweep — KW-029 owns the accessibility gate and depends on this ticket.

## Existing owner and reuse target

**Extend, do not create from scratch.** All three targets below were verified at `e664d73a195facd64db58ba10952170ff01b4772`.

| Target | Status at the researched commit | Who creates it |
|---|---|---|
| `app/regions/Header.tsx` | Does not exist in the repo yet | **KW-005** ships the stub. This ticket replaces its body. |
| `app/regions/TmuxBar.tsx` | Does not exist in the repo yet | **KW-005** ships the stub, rendering a `<footer>`. This ticket replaces its body. |
| `app/regions/_contract.ts` | Does not exist in the repo yet | **KW-005**. Read-only here: `NAV_SECTIONS`, `REGION_META`, `HeaderProps`, `TmuxBarProps`. |
| `components/ds/TmuxBar.tsx` | Does not exist anywhere | **This ticket creates it.** KW-005's non-goals name it explicitly: *"Creating `app/regions/TransportBar.tsx`, `components/ds/CommitLog.tsx` or `components/ds/TmuxBar.tsx` — KW-026, KW-017 and KW-018 create those files themselves."* |
| `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/layers/tmux.css` | **On disk, 2,276 bytes, committed** | Upstream design system. KW-003 vendors it byte-identically to `styles/ds/layers/tmux.css`. This ticket consumes its class names and never re-declares them. |
| `styles/kw.css` `.kw-hide-sm` / `.kw-hide-md`, `.sr-only`, `:focus-visible` ring | Does not exist yet | **KW-003**. Its ticket records that `.kw-hide-md` *"is retained for the tmux `kevinweaver.dev` segment KW-018 will hide"*. |
| `components/icons/**` | Does not exist yet | **KW-004**, per DEC-004. |

**A DesignSync `TmuxBar.jsx` is *not* available.** The design track quotes an upstream React API for it, but **GT-5** established that `_ds_bundle.js` was never recovered and `find docs/design/_ds -type f` returns only the ten CSS files listed above. Do not attempt to fetch, import or `npx` anything from DesignSync. The only on-disk authority for this component's behaviour is `layers/tmux.css`, and the free-segment API below supersedes the upstream `windows[]` model — the design track measured that the comp uses `.seg .pl .plr .session .clock .spacer` and never the `windows[]` shape, so a faithful port of the upstream props would not fit the comp at all.

## Contract and invariants

### Invariant 1 — three files, nothing else

The write surface is exactly `app/regions/Header.tsx`, `app/regions/TmuxBar.tsx` and `components/ds/TmuxBar.tsx`. `app/page.tsx` must not change: KW-005's composition already renders `<Header />` and `<TmuxBar />` with no props, and the region components must keep working with zero props. This is the property that keeps wave 3 parallel and it is checked in the agent gate with a `git diff --name-only`.

### Invariant 2 — no CSS is written, ever

Every visual comes from a design-system class that already exists on disk, or from an inline `style` whose values are `var(--token)` references. No hex literal, no colour literal, no length literal for any value that has a token, no media query (media queries are expressible only through KW-003's `.kw-hide-sm` / `.kw-hide-md` utilities), no `!important`, no `<style>` element.

Three literals are documented exceptions because the design system genuinely has no token for them, verified against `tokens/typography.css` and `tokens/spacing.css` at this commit: the chrome letter-spacing `.02em` (the header's and `.tmux`'s own value — the only tracking tokens are `--ls-display -.02em`, `--ls-heading -.01em` and `--ls-caps .16em`, and `--ls-caps` is three times too wide for this chrome), the pill's uppercase tracking `.1em` (comp:60), and the header's `1px` hairline bottom border (`--bw-pane` and `--bw-hard` are both `2px`). Use those three exact values; do not substitute a token that changes the rendering.

### Invariant 3 — the region is honest by construction

No integer, percentage or time literal that represents data may appear in these three files. The position, percent and clock segments render `--/--`, `--%` and `--:--` on the server and stay that way without JavaScript. The freshness pill renders `null` when it is given no value. This is DEC-008 and DEC-014 expressed as code, and it is grep-checkable.

### Invariant 4 — the source is pure ASCII

`grep -nP '[^\x00-\x7F]'` over all three files must return nothing. The `☰` comes from KW-004's SVG icon; the powerline arrows come from `clip-path`; the active-window marker is an ASCII `*`; the chevron is an ASCII `>`. This makes the tofu class of defect impossible rather than merely unlikely.

### Invariant 5 — the bar has no inline height

`layers/tmux.css` declares `.tmux{height:var(--tmux-h)}` and the comp defeats it with an inline `height:24px` at comp:173, which is why `--tmux-h` is dead today. KW-003's deviation D3 changes the rule to `.tmux { min-height: var(--tmux-h); height: auto; }`. This ticket therefore emits **no** `height` on the `<footer>`, so the token becomes live and the bar grows to fit its tallest child. That is what makes the 24 px touch targets below possible.

### Invariant 6 — `_contract.ts` is read-only, and props are widened locally

`HeaderProps` and `TmuxBarProps` in `app/regions/_contract.ts` are both empty extensions of `RegionCommonProps` and KW-005 owns that file permanently. Where this region needs an extra optional prop it declares a **local** superset in its own file. A local superset with only optional additions is still assignable to `(props: HeaderProps) => ReactNode`, so `app/page.tsx` continues to compile unchanged.

### Producer interface — `components/ds/TmuxBar.tsx`

This is the seam. KW-024 quotes the `data-tmux-slot` half verbatim; KW-032 quotes the `HeaderFreshness` half verbatim. Do not paraphrase either into a local type.

```ts
// components/ds/TmuxBar.tsx
'use client'

import type { ReactNode } from 'react'

/** Maps 1:1 onto a design-system class in styles/ds/layers/tmux.css. */
export type TmuxSegVariant = 'session' | 'wins' | 'plain' | 'host' | 'clock' | 'spacer'

/** 'right' renders .pl (arrow points right); 'left' renders .plr. */
export type TmuxSegArrow = 'right' | 'left' | 'none'

/** 'sm' maps to .kw-hide-sm (hidden <= 720px); 'md' maps to .kw-hide-md (<= 1080px). */
export type TmuxBreakpoint = 'sm' | 'md'

export interface TmuxSeg {
  /** React key. Also the value of data-tmux-slot when `slot` is true. */
  readonly key: string
  /** Default 'plain'. */
  readonly variant?: TmuxSegVariant
  /** Default 'none'. */
  readonly arrow?: TmuxSegArrow
  /** Omitted for variant 'spacer'. */
  readonly text?: ReactNode
  /** CSS custom-property reference only, e.g. 'var(--bg2)'. Never a hex literal. */
  readonly bg?: string
  readonly fg?: string
  readonly bold?: boolean
  /** Adds font-variant-numeric: tabular-nums, so a changing readout does not jitter. */
  readonly tabular?: boolean
  /** Sheds the whole segment at or below this breakpoint. */
  readonly hideBelow?: TmuxBreakpoint
  /** When true, emits data-tmux-slot={key} and wraps `text` in a <span data-tmux-value>. */
  readonly slot?: boolean
  readonly role?: 'progressbar'
  readonly ariaLabel?: string
  readonly ariaHidden?: boolean
  /** Inline padding shorthand; token references only. */
  readonly padding?: string
}

export interface TmuxBarViewProps {
  readonly segs: readonly TmuxSeg[]
  /** Re-points --accent for the whole bar, e.g. 'var(--aqua)'. Optional. */
  readonly accent?: string
  readonly id?: string
  readonly className?: string
  readonly 'aria-labelledby'?: string
}

export function TmuxBar(props: TmuxBarViewProps): ReactNode

/**
 * Scroll-spy shared by Header and TmuxBar. Returns the id of the section whose
 * top is at or above `offsetPx`, or null. Uses IntersectionObserver, tolerates
 * missing targets (wave-3 siblings may not have merged yet), and returns null
 * on the server so the server render carries no aria-current.
 */
export function useActiveSection(
  ids: readonly string[],
  offsetPx?: number,   // default 120, matching comp:498's `top <= 120`
): string | null
```

### Producer interface — the readout seam KW-024 writes into

The comp drove these three readouts by writing `textContent` onto refs (`barPosRef`, `barPctRef`, `barClockRef`, comp:971-984). That mechanism destroys any child element, which would erase the SVG icon. The replacement seam keeps the icon and the ARIA on the outer node and confines writes to an inner `[data-tmux-value]` span:

```html
<!-- rendered by app/regions/TmuxBar.tsx; filled later by lib/viz/driver.ts (KW-024) -->
<span class="seg plr kw-hide-sm" data-tmux-slot="position"
      role="progressbar" aria-label="playback position"
      aria-valuemin="0" aria-valuemax="100">
  <svg aria-hidden="true" focusable="false" ...>…</svg>
  <span data-tmux-value>--/--</span>
</span>
<span class="seg plr" data-tmux-slot="percent" aria-hidden="true">
  <span data-tmux-value>--%</span>
</span>
<span class="seg clock plr" data-tmux-slot="clock" aria-hidden="true">
  <span data-tmux-value>--:--</span>
</span>
```

The exact write KW-024 performs, which this ticket guarantees will keep working:

```ts
// lib/viz/driver.ts — KW-024, NOT this ticket
function syncTmux(dayIndex: number, dayCount: number): void {
  const pct = Math.round((dayIndex / (dayCount - 1)) * 100)
  const pos = document.querySelector<HTMLElement>('[data-tmux-slot="position"]')
  if (pos) {
    pos.querySelector('[data-tmux-value]')!.textContent = `${dayIndex + 1}/${dayCount}`
    pos.setAttribute('aria-valuenow', String(pct))
    pos.setAttribute('aria-valuetext', `day ${dayIndex + 1} of ${dayCount}`)
  }
  const pctEl = document.querySelector('[data-tmux-slot="percent"] [data-tmux-value]')
  if (pctEl) pctEl.textContent = `${pct}%`
}
```

Two ARIA rules that follow from this and must not be "simplified" later. The position segment is the **only** `progressbar`: it omits `aria-valuenow` until a driver sets it, which is the correct indeterminate state, and it is the sole node carrying the progress semantic. The percent segment renders the same value as text and is therefore `aria-hidden="true"` — announcing one quantity twice is noise, and the design track's recommendation of *"progressbar roles"* on both readouts is satisfied by one correctly-named node plus one silent visual duplicate.

The clock is `aria-hidden` for a different reason: the design track measured that `tickClock()` runs only inside the rAF loop, so under `prefers-reduced-motion` the comp's clock is frozen at the markup literal `09:41` forever. KW-024 owns moving it to an interval that runs in both modes. Until then `--:--` is the truthful render, and it must never be announced as a time.

### Producer interface — the freshness pill

```ts
// app/regions/Header.tsx — the DEC-014 seam. KW-032 supplies the value.
export type HeaderFreshnessTone = 'fresh' | 'stale' | 'static'

export interface HeaderFreshness {
  /** Short uppercase label rendered in the pill, e.g. 'fresh' or 'static'. */
  readonly label: string
  /** Drives the dot colour token only. Never the sole channel: `label` is text. */
  readonly tone: HeaderFreshnessTone
  /** Full accessible sentence, e.g. 'data regenerated 6 hours ago'. */
  readonly description: string
}

export interface HeaderOwnProps extends HeaderProps {
  /** Omit and the pill is not rendered at all. This is the honest default. */
  readonly freshness?: HeaderFreshness
}

export function Header(props: HeaderOwnProps): ReactNode
```

A worked value, for KW-032's build-time composition from `public/data/v1/manifest.json`'s `generatedAt` (DEC-008):

```json
{ "label": "fresh", "tone": "fresh", "description": "data regenerated 6 hours ago" }
```

Tone maps to the dot's background token only: `fresh` → `var(--green)`, `stale` → `var(--yellow)`, `static` → `var(--fg4)`. The label text always renders, so the state is never colour-only.

### Contrast contract

Every foreground/background pairing this region emits, recomputed with the WCAG 2.x relative-luminance formula at this commit. The "clean" column is the assertion; the last column is the same pair under KW-003's default `--scanline-opacity:.20` overlay, and every one of them stays above 4.5:1 even at the comp's original `.35`.

| Site | Pair | Clean | At `.20` | Verdict |
|---|---|---|---|---|
| header brand `kevinweaver.dev` | `--fg1` on `--bg-h` | 11.952 | — | pass |
| header nav idle link | `--fg4` on `--bg-h` | 5.898 | 5.611 | pass |
| header nav active link | `--bg-h` on `--accent-d` (`--aqua-d`) | 5.168 | 4.928 | pass |
| freshness pill text | `--fg3` on `--bg-h` | 7.526 | — | pass |
| bar default text | `--text-dim` on `--surface-bar` | 5.323 | 5.125 | pass |
| `session` and `clock` | `--bg-h` on `--accent` (`--aqua`) | 7.793 | 7.391 | pass |
| `wins` / `host` **as shipped by the DS** | `--text-dim` on `--surface-raised` | **4.050** | 3.923 | **fail — must be overridden** |
| `wins` / `host` / `position` after fix | `--fg1` on `--bg2` | 6.432 | 6.214 | pass |
| `win.active` | `--text-strong` on `--bg3` | 5.741 | 5.599 | pass |
| branch and percent segments | `--fg1` on `--bg3` | 4.748 | 4.639 | pass |

The `4.050` row is the failure KW-003 catalogued as deviation **D5.5** for the comp's `☰ 1826/1826` segment. Re-reading `layers/tmux.css` at this commit shows the same pairing is the *class default* for `.tmux .wins .win` and `.tmux .host`, not just for that one inline site. Because those two classes are unused by the comp, KW-003's audit could not have caught them at markup level. This ticket therefore applies the same `--fg1` override to all three sites via the `fg` field on the segment model. Do not "clean this up" by deleting the override.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; if something has moved, report it rather than silently changing scope.

### File plan

Create:

```
components/ds/TmuxBar.tsx      # 'use client'; TmuxBar view + useActiveSection hook
```

Replace the body of (both created as stubs by KW-005):

```
app/regions/Header.tsx         # 'use client'
app/regions/TmuxBar.tsx        # 'use client'
```

All three carry `'use client'`. KW-005's Invariant 3 forbids the directive in *KW-005's* files and states the mechanism for later work: *"Regions that need interactivity add the directive to their own file in their own ticket."* This region needs it for exactly one reason — the active-section indicator is scroll-derived and cannot be expressed in CSS from a file this ticket is allowed to write. Client components are still server-rendered, so the brand, the nav labels and every segment remain in the HTML and remain indexable; only the ~2 kB of observer code is client JS, well inside KW-030's 120 kB brotli app-shell budget.

### Toolchain

Everything is already installed and frozen by KW-001 under DEC-003. Confirmed available on the registry this session: `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3`, `eslint@9.39.5`, `tailwindcss@4.3.3`. Add nothing. The `@/` path alias is the one KW-005 already uses for `@/components/ds/*`.

### `components/ds/TmuxBar.tsx`

Render exactly one `<footer>`-agnostic element — the region decides the tag, the view renders a `<div>`-equivalent set of segments into whatever wrapper it is given. Concretely, `TmuxBar` renders:

```tsx
<div className={['tmux', className].filter(Boolean).join(' ')}
     id={id}
     aria-labelledby={props['aria-labelledby']}
     style={accent ? ({ '--accent': accent } as CSSProperties) : undefined}>
  {segs.map(renderSeg)}
</div>
```

`renderSeg` composes the class list from the variant and the arrow, never from ad-hoc strings:

| `variant` | classes | notes |
|---|---|---|
| `session` | `seg session` | DS supplies `background:var(--accent); color:var(--bg-h)` |
| `wins` | `seg wins` | container; its children are the `.win` anchors the region passes as `text` |
| `plain` | `seg` | |
| `host` | `seg host` | DS supplies `background:var(--surface-raised)` — override `fg` |
| `clock` | `seg clock` | DS supplies `background:var(--accent); color:var(--bg-h)` |
| `spacer` | `spacer` | no padding, no arrow, no text |

| `arrow` | class appended |
|---|---|
| `right` | `pl` |
| `left` | `plr` |
| `none` | — |

| `hideBelow` | class appended |
|---|---|
| `sm` | `kw-hide-sm` |
| `md` | `kw-hide-md` |

Inline style is assembled from `bg`, `fg`, `bold`, `tabular` and `padding` only:

```tsx
const style: CSSProperties = {
  ...(seg.bg ? { background: seg.bg } : null),
  ...(seg.fg ? { color: seg.fg } : null),
  ...(seg.bold ? { fontWeight: 'var(--fw-black)' } : null),
  ...(seg.tabular ? { fontVariantNumeric: 'tabular-nums' } : null),
  ...(seg.padding ? { padding: seg.padding } : null),
}
```

`background` must be set with the CSS `background` shorthand, not `backgroundColor`. `layers/tmux.css` relies on `background: inherit` on the `::after` / `::before` arrow pseudo-elements so each segment paints its own powerline triangle in its own colour with no bookkeeping; `backgroundColor` alone still satisfies `inherit`, but the shorthand is what the DS and the comp both use and it keeps the two in step.

`useActiveSection` — the whole hook:

```tsx
export function useActiveSection(ids: readonly string[], offsetPx = 120): string | null {
  const [active, setActive] = useState<string | null>(null)
  useEffect(() => {
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
    if (nodes.length === 0) return          // wave-3 siblings may not have merged yet
    const seen = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting)
        const hit = ids.filter((id) => seen.get(id))
        setActive(hit.length > 0 ? hit[hit.length - 1] : null)
      },
      { rootMargin: `-${offsetPx}px 0px 0px 0px`, threshold: 0 },
    )
    for (const n of nodes) io.observe(n)
    return () => io.disconnect()
  }, [ids, offsetPx])
  return active
}
```

`offsetPx` defaults to 120 because that is the comp's own threshold (`el.getBoundingClientRect().top <= 120`, comp:498). Use `IntersectionObserver`, not the comp's `scroll` listener plus per-frame `getBoundingClientRect` — the comp re-measures three elements on every scroll frame for a value that changes a handful of times per page.

### `app/regions/Header.tsx`

Port target is comp:52-64. Structure:

```tsx
<header id={id}
        aria-labelledby={REGION_META.header.titleId}
        className={className}
        style={{ position: 'sticky', top: 0, zIndex: 70, display: 'flex',
                 alignItems: 'stretch', padding: '0 var(--sp-2)',
                 background: 'var(--bg-h)',
                 borderBottom: '1px solid var(--bg1)',
                 minHeight: 'var(--bar-h)',
                 fontSize: 'var(--fs-micro)', letterSpacing: '.02em',
                 whiteSpace: 'nowrap' }}>
  <h2 id={REGION_META.header.titleId} className="sr-only">
    {REGION_META.header.accessibleName}
  </h2>
  <a href="/" style={{ …brand… }}>kevinweaver.dev</a>
  <nav aria-label="sections" className="kw-hide-sm" style={{ display: 'flex', alignItems: 'stretch', gap: '2px' }}>
    {NAV_SECTIONS.map((s) => (
      <a key={s.id} href={`#${s.id}`}
         aria-current={active === s.id ? 'location' : undefined}
         style={…}>
        <span aria-hidden="true" style={{ opacity: 0.55 }}>{s.index}</span>
        <span aria-hidden="true">{s.label}</span>
        <span className="sr-only">{`${s.index}: ${s.label}`}</span>
      </a>
    ))}
  </nav>
  <span style={{ flex: 1 }} />
  {freshness ? <FreshnessPill {…} /> : null}
</header>
```

Deviations from the comp, each deliberate:

- **`minHeight: 'var(--bar-h)'`, not `height: 32px`.** KW-003's D3 changes `.pane-bar` from `height` to `min-height` for WCAG 1.4.12 Text Spacing; the header is the same class of element and must not clip under the 1.5× line-height bookmarklet. `--bar-h` is `clamp(1.75rem, 1.675rem + 0.3333vw, 2rem)` = 28→32 px, so 1560 px is pixel-identical to the comp.
- **The brand becomes `<a href="/">`.** It is currently a `<span>`, which the design track flagged.
- **`border:none` is never emitted on a nav link.** That inline declaration is what deletes `base.css`'s `a{border-bottom:…}` — the only non-colour link affordance the design system has. Leave the border-bottom in place, and give the active link `borderBottomWidth: '2px'` so the active state has a **thickness** channel as well as `aria-current` and the colour swap. Three channels, only one of them colour.
- **`<i>` becomes `<span aria-hidden="true">`.** `<i>` carries implicit emphasis semantics; the workspace numerals are decoration. The design track's element census over the comp measured `0 aria-*` and `0 role=` on the whole page.
- **`aria-current="location"`, not `"page"`.** These are same-document fragment links; `location` is the token defined for the current position within an environment.
- **Label in Name (SC 2.5.3) is satisfied at both breakpoints.** The accessible name is always `"1: whoami"` because the `sr-only` span carries the full string and both visible spans are `aria-hidden`. The visible text is a prefix of the accessible name at every width.
- **No default active item on the server.** `useActiveSection` returns `null` during SSR, so the server HTML carries no `aria-current` at all. Without JavaScript there is no current section, and claiming one would be a lie.
- **The nav is rendered from `NAV_SECTIONS.map(...)`.** Do not hardcode three links. GATE-005 may add a fourth section (`side`), and when it does the change lands in `_contract.ts` alone.

The pill (comp:60-63) renders only when `freshness` is supplied:

```tsx
<span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-1)',
               padding: '0 var(--sp-2)', color: 'var(--fg3)',
               fontWeight: 'var(--fw-bold)', fontSize: 'var(--fs-micro)',
               letterSpacing: '.1em', textTransform: 'uppercase' }}>
  <span aria-hidden="true"
        style={{ width: '7px', height: '7px', borderRadius: '50%',
                 background: TONE[freshness.tone], display: 'block' }} />
  <span>{freshness.label}</span>
  <span className="sr-only">{freshness.description}</span>
</span>
```

Do **not** port the comp's `kw-pulse` animation onto the dot. It is an unguarded infinite animation; KW-003's global reduced-motion stop would clamp it, but a pulsing "live" indicator on data that is regenerated daily is exactly the dishonesty DEC-014 exists to remove.

### `app/regions/TmuxBar.tsx`

Port target is comp:173-181. Structure:

```tsx
<footer id={id} aria-labelledby={REGION_META.tmuxBar.titleId} className={className}
        style={{ position: 'sticky', bottom: 0, zIndex: 70 }}>
  <h2 id={REGION_META.tmuxBar.titleId} className="sr-only">
    {REGION_META.tmuxBar.accessibleName}
  </h2>
  <TmuxBarView segs={segs} />
</footer>
```

`<footer>` as a direct child of the page root is a `contentinfo` landmark by element alone; do not add `role="contentinfo"`. Emit **no** `height` and no `--tmux-h` override (Invariant 5).

The segment list, in order. `--fs-micro` resolves to 10 px at 360 px and 11 px at 1560 px under KW-003's D1 ladder; `--pl-w` to 10→12 px and `--sp-2` to 10→14 px under D2.

| # | `key` | variant | arrow | text | `bg` / `fg` | `hideBelow` | rationale |
|---|---|---|---|---|---|---|---|
| 1 | `session` | `session` | `right` | `NORMAL` | DS defaults | — | head of the chain; `--bg-h` on `--accent` = 7.793 |
| 2 | `wins` | `wins` | `right` | the three `.win` anchors | `fg: var(--fg1)` | — | the mobile nav; overrides the 4.050 default |
| 3 | `branch` | `plain` | `right` | ` main` | `bg: var(--bg3)`, `fg: var(--fg1)` | `sm` | 4.748; leading space is ASCII, there is no branch glyph |
| 4 | `host` | `host` | `none` | `kevinweaver.dev` | `fg: var(--fg1)` | `md` | overrides the 4.050 default; KW-003 kept `.kw-hide-md` for exactly this |
| 5 | `spacer` | `spacer` | `none` | — | — | — | `flex:1 1 auto` from the DS |
| 6 | `position` | `plain` | `left` | icon + `--/--` | `bg: var(--bg2)`, `fg: var(--fg1)` | `sm` | `slot`, `role="progressbar"`, `tabular`; 6.432 |
| 7 | `percent` | `plain` | `left` | `--%` | `bg: var(--bg3)`, `fg: var(--fg1)` | — | `slot`, `ariaHidden`, `tabular`; 4.748 |
| 8 | `clock` | `clock` | `left` | `--:--` | DS defaults | — | `slot`, `ariaHidden`, `tabular`; 7.793 |

Segment `padding` values, which the 320 px budget below depends on. `layers/tmux.css` defaults `.tmux .seg` to `0 18px`, which is the slide-scale value; the comp already overrode every segment inline and this ticket does the same, but as formulas rather than the comp's magic `16`. A `.pl` segment's arrow overhangs the segment *after* it, and a `.plr` segment's arrow overhangs the segment *before* it, so any segment sitting downstream of an arrow needs `padding` on that side of at least `--pl-w`.

| # | `key` | `padding` | at 320 px |
|---|---|---|---|
| 1 | `session` | `0 var(--sp-1) 0 var(--sp-2)` | 4 + 10 = 14 px |
| 2 | `wins` | DS default `calc(var(--pl-w) + 14px)` left, `0` right | 24 px |
| 3 | `branch` | `0 var(--sp-1) 0 calc(var(--pl-w) + 4px)` | 4 + 14 = 18 px |
| 4 | `host` | DS default `calc(var(--pl-w) + 8px)` left, `var(--sp-2)` right | 18 + 10 = 28 px |
| 6 | `position` | `0 var(--sp-1) 0 calc(var(--pl-w) + 4px)` | 4 + 14 = 18 px |
| 7 | `percent` | `0 var(--sp-1) 0 calc(var(--pl-w) + 4px)` | 4 + 14 = 18 px |
| 8 | `clock` | `0 var(--sp-2) 0 calc(var(--pl-w) + 8px)` | 10 + 18 = 28 px |

The window list passed as segment 2's `text`:

```tsx
{NAV_SECTIONS.map((s) => (
  <a key={s.id} href={`#${s.id}`}
     className={active === s.id ? 'win active' : 'win'}
     aria-current={active === s.id ? 'location' : undefined}
     style={{ padding: '0 var(--sp-2)', minHeight: '24px' }}>
    <span aria-hidden="true">{s.index}</span>
    <span aria-hidden="true" className="kw-hide-sm">{`:${s.label}`}</span>
    {active === s.id ? <span aria-hidden="true">*</span> : null}
    <span className="sr-only">{`${s.index}: ${s.label}`}</span>
  </a>
))}
```

Three things this encodes:

- **`minHeight: '24px'`** on each anchor. `--tmux-h` floors at 22 px, but Invariant 5 leaves the bar `height:auto`, so the 24 px child grows the bar to 24 px. Segment width is `6 px` of glyph plus `2 × 10 px` of padding = 26 px, so each target is 26 × 24 — clearing WCAG 2.2 SC 2.5.8's 24 × 24 minimum without a spacing exception. `.tmux .win`'s DS padding of `0 16px` is deliberately overridden inline; at 16 px the three windows alone would consume 114 px and the 320 px budget below would not close.
- **The trailing ASCII `*`** is the tmux active-window marker and is this region's second non-colour channel for the active state, alongside `aria-current`. `.win.active` also swaps to `--text-strong` on `--bg3` (5.741), so the state reads as weight, marker and colour together.
- **`.chev`** is available for a `>` separator between the session and the window list if the visual needs it. It is `aria-hidden` decoration; it is not required and it must not carry text meaning.

### The `☰` icon

DEC-004 replaces `U+2630 ☰` with an inline SVG. KW-004 owns `components/icons/**` and ships one component per glyph in D-04's list, each rendering `aria-hidden="true"` and `focusable="false"` with the accessible name carried by the enclosing control, never by the icon. At pickup, `ls components/icons/` and import the component that names the three-bar list glyph.

If `components/icons/` does not exist yet — KW-004 is a dependency, so it should, but verify rather than assume — **omit the icon entirely**. It is decorative and `aria-hidden`; the position segment reads `1826/1826` perfectly well without it, and the `[data-tmux-value]` seam is unaffected. Under no circumstances render the literal `☰`: `tokens/fonts.css`'s subsets have no coverage for `U+2630`, so it renders from the platform fallback stack or as tofu, and it would break Invariant 4.

### Reflow budget — the arithmetic the acceptance gate checks

Glyph advance for JetBrains Mono is 0.6 em. Widths below are the sum of segment text and segment padding; the powerline arrows are absolutely positioned pseudo-elements that overhang into the following segment and consume no layout width, which is why `.wins` and `.host` carry `padding-left: calc(var(--pl-w) + …)` in the design system.

| Viewport | `--fs-micro` | visible segments | measured width | headroom |
|---|---|---|---|---|
| 320 px | 10 px (clamp floor) | session, wins, spacer, percent, clock | **246 px** | 74 px |
| 720 px | ~10.3 px | + branch, position | **~393 px** | 327 px |
| 1080 px | ~10.6 px | + host | **~530 px** | 550 px |

The 320 px row in full: session `NORMAL` 6 × 6 = 36 px text + 14 px padding = 50; `wins` 24 px `padding-left` + 3 × 26 px = 102; percent `--%` 18 + 18 = 36; clock `--:--` 30 + 28 = 58. Total 246. The comp's unshed six-segment bar measures ~470–515 px against the same viewport, which is the defect this shed model removes.

Reproduce this table as a comment block at the top of `app/regions/TmuxBar.tsx`. It is the only durable record of *why* each `hideBelow` value is what it is, and the next person to add a segment needs it.

### Verification note on the runtime proof

Neither Vitest (KW-011) nor Playwright (KW-023) is a dependency of this ticket, so no test file may be added and no browser measurement is available here. The agent gate below is therefore structural and arithmetic. KW-029 depends on this ticket, owns `e2e/a11y.spec.ts`, and is where the real 320 px no-horizontal-scroll assertion, the axe run and the keyboard traversal live. This mirrors KW-003's precedent exactly.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` exits 0 on Node 24.
- `git diff --name-only origin/main...HEAD` lists exactly `app/regions/Header.tsx`, `app/regions/TmuxBar.tsx` and `components/ds/TmuxBar.tsx` — no more, no fewer.
- `git diff origin/main...HEAD -- package.json package-lock.json` is empty, proving the DEC-003 freeze holds.
- `grep -nP '[^\x00-\x7F]' app/regions/Header.tsx app/regions/TmuxBar.tsx components/ds/TmuxBar.tsx` returns nothing, proving Invariant 4 and that no glyph outside Basic Latin ships.
- `grep -nE '\b(1826|09:41|4817)\b|100 *%' app/regions/TmuxBar.tsx` returns nothing, and the three readouts render the literals `--/--`, `--%` and `--:--` — DEC-008 has no hardcoded figure to escape through.
- `grep -nE "border(Bottom)? *: *['\"]?none" app/regions/Header.tsx` returns nothing, proving the comp's affordance-deleting inline declaration was not carried over.
- `grep -nE "height *: *['\"]?(24px|var\(--tmux-h\))" app/regions/TmuxBar.tsx` returns nothing, proving Invariant 5 — the bar emits no inline height and `--tmux-h` drives it through KW-003's `min-height`.
- `grep -c 'kw-hide-sm\|kw-hide-md' app/regions/TmuxBar.tsx` is at least 1 and the segment table's `hideBelow` assignments match the shipped list: `branch` and `position` at `sm`, `host` at `md`, and session, wins, percent and clock never shed.
- `grep -c 'data-tmux-slot' app/regions/TmuxBar.tsx` returns 3, and each of those elements contains exactly one `data-tmux-value` child.
- Exactly one element in the region carries `role="progressbar"`, it has `aria-label`, `aria-valuemin` and `aria-valuemax`, and it does **not** carry `aria-valuenow` in the server render.
- `grep -rn "from '\./\|from \"\./" app/regions/Header.tsx app/regions/TmuxBar.tsx` shows imports only from `./_contract`; neither region imports the other, and neither imports `content/**`, `lib/**` or `styles/**`.
- `grep -c 'use client' app/regions/Header.tsx app/regions/TmuxBar.tsx components/ds/TmuxBar.tsx` returns 1 for each file, and `grep -rn 'use client' app/page.tsx app/layout.tsx app/regions/_contract.ts` returns nothing — the shell stayed a server component.
- `grep -rnE '#[0-9a-fA-F]{6}|!important|<style' app/regions/Header.tsx app/regions/TmuxBar.tsx components/ds/TmuxBar.tsx` returns nothing, proving Invariant 2.
- The reflow budget table is present verbatim as a comment in `app/regions/TmuxBar.tsx`, and the contrast table's `--fg1` overrides are present on the `wins`, `host` and `position` segments.
- A node one-liner recomputing WCAG 2.x relative-luminance ratios reproduces the contract's contrast table to three decimals, in particular `--text-dim` on `--surface-raised` = 4.050 before the override and `--fg1` on `--bg2` = 6.432 after.

### At-merge gate

- The required `ci-ok` status is green on the exact PR head.
- No file outside the three-file write surface is added, modified or deleted; `app/page.tsx`, `app/layout.tsx`, `app/regions/_contract.ts`, `styles/**`, `app/globals.css`, `components/icons/**`, `content/**`, `lib/**`, `test/**`, `e2e/**` and `.github/**` are all untouched.
- `app/page.tsx` still compiles against `<Header />` and `<TmuxBar />` with zero props, proving Invariant 1 and KW-005's swap-one-region property.
- Code review completed with every finding resolved or explicitly dispositioned.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure — missing anchor targets.** At pickup, `#whoami`, `#arc` and `#contact` may not exist: `#whoami` is set on the `.kw-2up` wrapper in `app/page.tsx` (KW-005) but the sections behind `#arc` and `#contact` land with KW-017 and KW-019, both wave-3 siblings that may merge after this one. `useActiveSection` must filter `getElementById` misses and return early when nothing resolves. It must never throw, and the nav links must still render — a fragment link to a not-yet-existing id is inert, not broken.

**Failure — empty `NAV_SECTIONS`.** If GATE-005 ever empties or reorders the list, both nav surfaces must render nothing rather than an empty flex box with padding. Guard with a length check.

**Failure — driver absent.** The three readouts are permanently `--/--`, `--%` and `--:--` when KW-024 has not merged, when JavaScript is off, and when the viz island has not loaded. That is a supported terminal state, not a degraded one; nothing in this region polls, retries or logs about it.

**Security.** No secrets, no network calls, no user input, no `dangerouslySetInnerHTML`, no `eval`, no `localStorage`. The only outbound link is `href="/"`. There is no attack surface here.

**Privacy.** The phone number `<redacted-personal-phone>` must not appear in the repo or the build output — that is a standing constraint on every file in this repository, owned and gated by KW-006 — and no email address or social handle enters this region at all — the contact tiles are KW-019's and their content is gated on GATE-005. The header brand and the tmux `host` segment carry only the site's own domain name, which is public by definition.

**Migration.** This replaces two KW-005 stub bodies; there is no persisted state, no cookie, no URL contract and no data format to migrate. Two behaviours from the comp are deliberately **not** carried forward and their removal is the migration: the inline `height:24px` that made `--tmux-h` dead, and the inline `border:none` that made nav links colour-only. Both must be absent from the diff.

**Accessibility.** This region is the page's `banner` and `contentinfo` landmarks and its primary navigation, so it is the most a11y-dense chrome on the site. Success criteria addressed, each with the mechanism:

- **1.3.1 Info and Relationships** — `<header>` and `<footer>` as landmark elements, `<nav aria-label="sections">`, `REGION_META`-driven `aria-labelledby` on both regions, `sr-only` `<h2>` titles at the level `_contract.ts` fixes.
- **1.4.1 Use of Color** — the active nav item is signalled by `aria-current="location"`, a 2 px border-bottom against the idle 1 px, and (in the tmux mirror) a trailing ASCII `*`. Colour is the fourth channel, never the only one. The freshness pill's tone drives only the dot; the label is text.
- **1.4.3 Contrast (Minimum)** — every pairing in the contract table, all ≥ 4.639:1 including the scanline penalty. The two design-system class defaults that measure 4.050:1 are overridden rather than shipped.
- **1.4.10 Reflow** — the `hideBelow` shed model, 246 px at a 320 px viewport with 74 px of headroom, backed by KW-003's `body { overflow-x: clip }`.
- **1.4.12 Text Spacing** — `min-height` rather than `height` on both the header and the bar, so neither clips under the 1.5× line-height bookmarklet.
- **2.4.7 Focus Visible** — inherited from KW-003's `:focus-visible` ring in `--fg0`, which measures 14.451 on `--bg-h`, 10.220 on `--bg1` and 7.777 on `--bg2`. This region adds no focus rule and must not suppress `outline` anywhere.
- **2.5.3 Label in Name** — the visible text of every nav and window link is a prefix of its accessible name at every breakpoint.
- **2.5.8 Target Size (Minimum)** — tmux window links at 26 × 24 CSS px, achieved by `minHeight: '24px'` on the anchor plus the bar's `height:auto`.
- **4.1.2 Name, Role, Value** — one correctly named `progressbar` in indeterminate state; the duplicate percent readout and the placeholder clock are `aria-hidden` so nothing is announced twice and no placeholder is announced as data.

Not addressed here and deliberately deferred: the runtime axe scan, the real-browser 320 px measurement and keyboard traversal, all of which belong to KW-029 and which depend on this ticket.

## Surfaces

- Reads: app/regions/_contract.ts, styles/kw.css, styles/ds/layers/tmux.css, styles/ds/layers/base.css, styles/ds/tokens/colors.css, styles/ds/tokens/spacing.css, styles/ds/tokens/effects.css, components/icons/**, docs/design/kevinweaver.dev.dc.html, docs/research/2026-07-31-design-comp-spec.md
- Writes: app/regions/Header.tsx, app/regions/TmuxBar.tsx, components/ds/TmuxBar.tsx
- Contracts: tmux free-segment view model, tmux readout dom seam, header freshness pill props, active-section navigation semantics
- Safety: site banner and contentinfo landmarks, section navigation affordance, tmux bar horizontal reflow budget

## Sibling boundaries and open gates

**Upstream — what this ticket consumes, and what to do while it is unmerged.**

| Ticket | Symbols consumed | If unmerged at pickup |
|---|---|---|
| KW-005 | `app/regions/_contract.ts`: `NAV_SECTIONS`, `REGION_META.header`, `REGION_META.tmuxBar`, `HeaderProps`, `TmuxBarProps`; the two stub files; `app/page.tsx`'s zero-prop mounts | **Hard blocker.** Do not create `_contract.ts` and do not invent `NAV_SECTIONS`. Stop and report. |
| KW-003 | `styles/kw.css`: `.sr-only`, `.kw-hide-sm`, `.kw-hide-md`, the `:focus-visible` ring, `body{overflow-x:clip}`; `styles/ds/layers/tmux.css` with deviations D3 (`.tmux{min-height:var(--tmux-h);height:auto}`) and D4 (the two `--pl-w` seam-patch rules); the re-derived `--fs-micro`, `--bar-h`, `--tmux-h`, `--pl-w`, `--sp-1`, `--sp-2` tokens | **Hard blocker for correctness.** Without D3 the bar keeps a fixed height and the 24 px targets fail; without `.kw-hide-md` the host segment cannot shed. Stop and report; do not add the CSS here. |
| KW-004 | one SVG icon component under `components/icons/` for `U+2630` | Omit the icon (it is decorative and `aria-hidden`) and note it in the PR body. Never render the literal glyph. Do not create the file. |

**Wave-3 siblings — running in parallel, do not touch their files.**

| Ticket | Owns | Seam with this ticket |
|---|---|---|
| KW-016 | `app/regions/ManPage.tsx` | Provides the `#whoami` content. This ticket only links to the anchor. |
| KW-017 | `app/regions/CareerLog.tsx`, `components/ds/CommitLog.tsx` | Provides `#arc`. Also creates a `components/ds/` file — different filename, no overlap. |
| KW-019 | `app/regions/Contact.tsx` | Provides `#contact`, and owns every email, handle and `rel="me"` link. None of that belongs in the header. |
| KW-020 | `app/regions/BootOverlay.tsx` | Sits at `z-index:90`, above this region's `z-index:70`. Do not change either value. |
| KW-013, KW-014, KW-015, KW-021, KW-022, KW-023 | `scripts/pipeline/**`, `lib/bundle/**`, `lib/viz/**`, Playwright | No overlap. Do not import from any of them. |

**Downstream consumers of this ticket's contracts.**

- **KW-024** fills `[data-tmux-slot="position"|"percent"|"clock"]` from `lib/viz/driver.ts` using the exact `syncTmux` shape quoted above. It writes only into `[data-tmux-value]` and onto the outer node's `aria-valuenow` / `aria-valuetext`; it never replaces the segment's children and it never edits this region's files. KW-024 also owns moving `tickClock()` out of the rAF loop so the clock ticks under `prefers-reduced-motion`.
- **KW-026** owns the transport bar, the `Space` rebinding and the deletion of `emitLive()`'s 2,600 ms interval and its two `Math.random` sites. Under DEC-014 it produces the freshness value; it must not edit `app/regions/Header.tsx` to deliver it.
- **KW-029** verifies this region rather than sweeping it: axe on `/`, the browser-measured 320 px reflow, keyboard traversal and the reduced-motion halt. It depends on this ticket.
- **KW-030** measures the client-bundle cost of the three `'use client'` files against the 120 kB brotli app-shell budget.
- **KW-032** performs the final composition and is the one place that may pass `freshness` to `<Header />`, reading `generatedAt` from `public/data/v1/manifest.json` at build time.

**Open gates.** None block pickup.

- **GATE-005** (content decisions) may add a fourth nav section — the `side` lane. Because both nav surfaces render from `NAV_SECTIONS.map(...)`, that change lands entirely in `_contract.ts` and needs no edit here. Re-check the 320 px budget if it does: a fourth window adds ~26 px at the floor, leaving ~48 px of headroom.
- **GATE-007** (scanline treatment) changes `--scanline-opacity` between `.20` and `.35`. Every pairing in the contrast table clears 4.5:1 at both values, so this region is gate-independent. Do not ship a scanline toggle control here; KW-003 owns the `html[data-scanline]` hook and the operator decides who writes it.
