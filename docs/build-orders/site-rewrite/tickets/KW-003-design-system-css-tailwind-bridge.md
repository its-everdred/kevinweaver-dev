# KW-003 — Vendor the design system as web CSS, bridge it into Tailwind v4, and ship the global accessibility layer

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Nine stylesheets to vendor byte-identically plus one web re-derivation layer, a Tailwind v4 theme bridge, and four global accessibility primitives. Every edit is CSS inside one exclusively-owned directory, but the `@theme inline` bridge and the contrast re-derivation each have exactly one correct answer and a silent-failure mode.

**Risk:** Medium. Plain `@theme` instead of `@theme inline` silently breaks per-section `--accent` re-pointing and every wave-3 region inherits the defect with no visible symptom at build time. A wrong contrast token forces rework in five region tickets that will already have consumed it.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-002, REQ-003

**Decisions:** DEC-002, DEC-003, DEC-004, DEC-005

**Gates:** GATE-007

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`styles/ds/` holds the nine recovered design-system stylesheets plus one documented web re-derivation layer; `app/globals.css` bridges every design token into Tailwind v4 with `@theme inline`; and the global accessibility layer — focus ring, `.sr-only`, reduced-motion stop, horizontal-overflow guard — exists. The comp's chrome renders identically at 1560 px, every measured contrast failure is fixed at token level, and the root font size is relative so browser font-size preference works.

## Context and evidence

The current tree has no design system wired up. `styles/globals.scss` (22 lines, Tailwind v2 era) is deleted by KW-001, and `app/globals.css` is created by KW-001 as a blank-but-styled stub. Everything visual in waves 3–5 reads from the tokens this ticket lands, which is why it sits at the head of the widest wave.

Ground truth, re-measured at `e664d73a195facd64db58ba10952170ff01b4772`:

- **GT-5 / C-3** — the design-system files are **already on disk and committed**. `git ls-files docs/design` returns 12 paths; `find docs/design/_ds -type f` returns **10** CSS files under `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/`. There is nothing to fetch. GT-5 recorded 9 files because `tokens/fonts.css` landed later, in commit `8dc8d7f` ("Add missing font token file"). **This does not change the plan**: `tokens/fonts.css` is still not vendored (see Non-goals and DEC-004) because it `src`-references `../assets/fonts/*.woff2` and `find . \( -iname '*.woff*' -o -iname '*.ttf' -o -iname '*.otf' \) | wc -l` is **0** — there are no font binaries anywhere in this repository. KW-004 owns fonts.
- **GT-12** — the comp uses 16 non-ASCII codepoints and zero Private Use Area codepoints. Relevant here only as the reason `tokens/fonts.css` is out of scope (DEC-004).
- **C-16, corrected by the verifier** — the design system has **six** unguarded infinite animations, not five: `.rainbow`, `.hl`, `.uhl`, `.cursor` (`layers/type.css`), `.glow` (`layers/base.css`), and `.metric.rainbowfill .meter .fill` (`layers/data.css`, sitting immediately *above* the `prefers-reduced-motion: no-preference` block, so only the `.anim` variants are guarded). Verified by reading all three files at this commit. The acceptance count is six.
- **C-17, corrected by the verifier** — the scrollbar recommendation in the design track's own §9.7 is wrong twice over. Recomputed with the WCAG 2.x relative-luminance formula: current thumb `#504945` on track `#1d2021` = **1.858**; the recommended `--bg3 #665c54` = **2.517**, which **still fails** the 3:1 non-text requirement; only `--bg4 #7c6f64` = **3.369** clears it. Use `--bg4`.
- **C-5 correction (design track)** — there is a **sixth** contrast failure the original audit missed: `layers/pane.css` line 6 sets `.pane-bar{color:var(--text-faint)}` = `--fg4 #a89984` on `--surface-bar #3c3836` = **4.171**. That is the default colour of every one of the six pane bars.
- **DEC-002** — Tailwind 4.3.3 with the CSS-first config. `npm view tailwindcss version` → `4.3.3`; `npm view @tailwindcss/postcss@4.3.3 version` → `4.3.3`. No `tailwind.config.js` (KW-001 deletes it; v4 rejects `corePlugins`/`safelist`/`separator` in a JS config).
- **DEC-003** — `package.json` and `package-lock.json` are frozen after KW-001. This ticket adds no dependency and changes no npm script.
- **DEC-004** — all control glyphs become inline SVG icons, which is what removes `tokens/fonts.css` and the woff2 subsetting problem from this ticket entirely.
- **DEC-005** — zero `serializes_with` pairs; there is no cross-cutting accessibility sweep ticket. Only the **global** accessibility primitives live here. Each region ticket owns its own headings, ARIA, focus order and reflow, and KW-029 owns the gate.
- **GATE-007** — the scanline treatment decision (persisted toggle vs dropping `--scanline-opacity` from `.35` to `.20`) is an open operator decision. See "Sibling boundaries and open gates" for exactly what is and is not blocked.

Design evidence: DESIGN-001 is `evidence/kevinweaver.dev.dc.html`, a byte copy of `docs/design/kevinweaver.dev.dc.html` (60,626 bytes, 1,033 lines) carried inside the pack because design-evidence artifact paths reject `..`. That file is the visual acceptance target.

Plan-context navigation, pinned to the researched commit:

- Pack index — `docs/build-orders/site-rewrite/README.md` (pack-relative: `../README.md`).
- Wave and graph analysis — `2026-07-31-decomposition-synthesis.md` §6 "Wave diagram", "Verified topological levels", "Critical path", "Write-surface partition (proof of D-05)": https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md
- Decision registry — same document, §3 "Decision records" (`D-01`..`D-17`, rendered here as `DEC-001`..`DEC-017`) and §4 "Human gates" (`HG-1`..`HG-7`, rendered as `GATE-001`..`GATE-007`).
- This ticket's implementation pointers — same document, §5 "Wave 2 — the wide wave", entry **KW-03**.
- Primary supporting track — `2026-07-31-design-comp-spec.md` §1.1, §1.2, §3, §5.2, §5.3, §8.3, §9.1–§9.7, and its `## Verification corrections` C1, C5, C6, C7, C8: https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-design-comp-spec.md
- Tailwind bridge track — `2026-07-31-nextjs-upgrade.md` §4.1, §4.3, §6 and its `VC-1` and `VC-7` corrections: https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-nextjs-upgrade.md

Where a track's `## Verification corrections` section contradicts the body of its own document, the correction wins. That rule has already been applied above for C-16, C-17, C1, C5, C6 and C7.

## Scope

- Vendor the nine web-relevant design-system stylesheets from `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/` into `styles/ds/` as byte-identical copies, and record provenance plus every deliberate deviation in `styles/ds/README.md`.
- Add `styles/ds/web.css`, the single documented web re-derivation layer that converts the slide-scale type ladder and geometry to `rem` + `clamp()` over a 360→1560 px band, introduces `--fs-prose`, `--lh-prose` and `--lh-chrome`, and re-derives the four display steps (`--fs-h1`, `--fs-h2`, `--fs-hero`, `--fs-stat`) that the comp never overrode.
- Fix, at token level, the six measured text-contrast failure sites and the one non-text scrollbar failure, and record every before/after ratio in `styles/ds/README.md`.
- Bridge every design-system custom property into Tailwind v4 from `app/globals.css` using `@theme inline`, so that a section-scoped `--accent` override re-points `text-accent`, `bg-accent` and `border-accent` on descendants.
- Ship the global accessibility layer in `styles/kw.css`: a `:focus-visible` ring in `--fg0`, an `.sr-only` utility, a `prefers-reduced-motion: reduce` global stop covering all six unguarded infinite animations, and `overflow-x: clip` on `body`.
- Move the comp's seven `.kw-*` layout classes, its two `@keyframes`, its breakpoint set and its scrollbar rules out of inline styles and the `<helmet>` block into `styles/kw.css`, dropping every `!important`.
- Fold the comp's two `--pl-w` powerline seam-patch rules and the `.rail`-under-`.graph` alignment fix into `styles/ds/web.css` as numbered, ledgered deviations with their upstream target files named.

## Non-goals

- No font binaries, `@font-face` rules, `next/font` wiring or icon components. KW-004 owns `public/fonts/**`, `app/fonts.ts` and `components/icons/**`; `docs/design/_ds/.../tokens/fonts.css` is deliberately not vendored (DEC-004).
- No React components and no JSX. KW-005 owns `app/layout.tsx`, `app/page.tsx`, `app/regions/**` and `components/ds/**`; do not import or create any `.tsx` file.
- No dependency, npm-script, `postcss.config.mjs`, `next.config.ts` or `tsconfig.json` change. `package.json` and `package-lock.json` are frozen by KW-001 (DEC-003).
- No contribution-ramp colours, log2 band boundaries or CIEDE2000 fixtures. KW-007 owns `lib/viz/tokens/ramp.ts` and `lib/viz/tokens/level.ts`.
- No per-region accessibility work — headings, ARIA names, roles, keyboard handlers, live regions, the visually-hidden grid table, or region-level 320 px reflow. Each region ticket owns its own, and KW-029 owns the gate (DEC-005).
- No test-runner configuration and no committed test files. KW-011 owns `vitest.config.mts` and `test/setup.dom.ts`; this ticket's proofs are one-shot commands whose results are recorded in `styles/ds/README.md`.
- No scanline toggle control, no `localStorage` access and no persisted client state. This ticket ships the token and the `[data-scanline]` attribute hook only (GATE-007).
- No canvas font sizing. The comp's hardcoded `g.font` px literals are the viz renderer's problem (KW-022) and are read from the resolved custom properties this ticket defines.

## Existing owner and reuse target

Everything named here was verified to exist at `e664d73a195facd64db58ba10952170ff01b4772`, or is created by a named upstream ticket.

**Read-only sources, on disk now:**

| Path | Lines | Role |
|---|---|---|
| `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css` | 30 | gruvbox base palette + semantic aliases + the `--accent` re-pointing contract |
| `.../tokens/typography.css` | 21 | the 1920×1080 slide scale — the thing being re-derived |
| `.../tokens/spacing.css` | 12 | slide-scale geometry |
| `.../tokens/effects.css` | 17 | `--scanline`, `--scanline-opacity`, `--shadow-focus`, `--shadow-inset-track`, `--pl-w`, motion durations |
| `.../tokens/fonts.css` | 15 | **not vendored** (DEC-004) |
| `.../layers/base.css` | 21 | `*{box-sizing}` reset, `a{}` / `a:hover{}`, `.glow` |
| `.../layers/type.css` | 25 | `.rainbow`, `.hl`, `.uhl`, `.cursor` |
| `.../layers/pane.css` | 19 | `.pane`, `.pane-bar`, `.dots`, `.pane-title`, `.pane-body`, `.ph` |
| `.../layers/tmux.css` | 28 | `.tmux`, `.seg`, `.pl`, `.plr`, `.session`, `.clock` |
| `.../layers/data.css` | 20 | `.commit`, `.graph`, `.hash`, `.ref`, `.cyear`, `.cmsg`, `.rail`, `.meter`, `.metric` |
| `docs/design/kevinweaver.dev.dc.html` | 1,033 | the comp; the visual acceptance target |

**Created upstream by KW-001, extended here:**

- `app/globals.css` — KW-001 creates it as the blank-but-styled App Router entry stylesheet. This ticket replaces its contents with the Tailwind import, the design-system imports and the `@theme inline` bridge.
- `postcss.config.mjs` — KW-001 creates it as exactly `export default { plugins: { "@tailwindcss/postcss": {} } };`. Read-only here.
- `tailwindcss@4.3.3` and `@tailwindcss/postcss` — installed by KW-001 (DEC-003). Do not install anything.

**Deleted upstream by KW-001, do not resurrect:** `styles/globals.scss`, `tailwind.config.js`, `postcss.config.js`, `.eslintrc.js`, `pages/**`, `components/{HomeHero,Timeline,WriteCode}.js`, and the `sass`, `autoprefixer` and `postcss-import` dependencies.

If `app/globals.css` does not exist when this ticket is picked up, KW-001 has not merged; stop and wait rather than creating the toolchain yourself.

## Contract and invariants

This ticket is the **producer** of three contracts that KW-016, KW-017, KW-018, KW-019, KW-020, KW-025 and KW-026 consume. Consumers quote these verbatim.

### Contract 1 — the CSS custom-property token surface

Stable names. Values may be re-derived; names may not be renamed, and no consumer may hardcode a hex literal.

```ts
/** Not a runtime module — the authoritative list of custom properties
 *  guaranteed to resolve on `:root` after `app/globals.css` is loaded. */
type DesignTokens = {
  // colours — base palette (tokens/colors.css, vendored byte-identical)
  '--bg-h' | '--bg0' | '--bg1' | '--bg2' | '--bg3' | '--bg4' | '--gray':          string;
  '--fg0' | '--fg1' | '--fg2' | '--fg3' | '--fg4':                                string;
  '--red' | '--green' | '--yellow' | '--blue' | '--purple' | '--aqua' | '--orange': string;
  '--red-d' | '--green-d' | '--yellow-d' | '--blue-d' | '--purple-d'
    | '--aqua-d' | '--orange-d':                                                  string;
  // colours — semantic aliases (what UI code must use)
  '--surface-deck' | '--surface-slide' | '--surface-pane' | '--surface-bar'
    | '--surface-raised':                                                         string;
  '--text-strong' | '--text-body' | '--text-muted' | '--text-dim'
    | '--text-faint' | '--text-comment':                                          string;
  '--border-pane' | '--border-hard' | '--border-dashed':                          string;
  '--status-ok' | '--status-warn' | '--status-bad':                               string;
  '--diff-add' | '--diff-del' | '--diff-mod':                                     string;
  // accent — RE-POINTABLE per section, inline. This is the load-bearing one.
  '--accent' | '--accent-d':                                                      string;
  // type scale — rem + clamp() after this ticket, NEVER absolute px
  '--fs-micro' | '--fs-small' | '--fs-mono' | '--fs-body' | '--fs-prose'
    | '--fs-lead' | '--fs-h3' | '--fs-h2' | '--fs-h1' | '--fs-hero'
    | '--fs-stat':                                                                string;
  '--lh-tight' | '--lh-heading' | '--lh-body' | '--lh-code'
    | '--lh-prose' | '--lh-chrome':                                               string;
  '--fw-light' | '--fw-regular' | '--fw-medium' | '--fw-semibold'
    | '--fw-bold' | '--fw-black':                                                 string;
  '--ls-display' | '--ls-heading' | '--ls-caps':                                  string;
  '--mono' | '--font-ui':                                                         string;
  // geometry — rem + clamp() after this ticket
  '--sp-1' | '--sp-2' | '--sp-3' | '--sp-4' | '--sp-5' | '--sp-6' | '--sp-7'
    | '--sp-8' | '--sp-9':                                                        string;
  '--bar-h' | '--tmux-h' | '--pane-gap' | '--pl-w' | '--dot-size' | '--dot-gap':  string;
  '--pane-pad' | '--pane-pad-canvas' | '--pane-pad-tight'
    | '--pane-bar-pad' | '--pane-bar-gap':                                        string;
  '--r-pane' | '--r-chip' | '--r-ph' | '--bw-pane' | '--bw-hard':                 string;
  // effects
  '--scanline' | '--scanline-opacity' | '--shadow-focus' | '--shadow-inset-track'
    | '--glow-blur' | '--glow-opacity' | '--ease-out'
    | '--dur-reveal' | '--dur-meter' | '--dur-rainbow' | '--dur-blink'
    | '--stagger':                                                                string;
};
```

**Invariant A — accent re-pointing.** `tokens/colors.css` documents that `--accent` / `--accent-d` are *"re-pointed per slide or per section, inline"*. A consumer writes `<section style={{ '--accent': 'var(--red)' }}>` and every descendant using `var(--accent)` **or** the Tailwind `text-accent` / `bg-accent` / `border-accent` utility recolours. This only works under `@theme inline`. Breaking it is the single highest-risk defect in this ticket.

**Invariant B — no absolute root font size.** `html { font-size: 100% }` and nothing anywhere sets `font-size` in `px` on `html` or `:root`. Every `--fs-*` value is `rem`-based.

**Invariant C — no hex literals downstream.** Consumers reference tokens or Tailwind utilities. `styles/ds/README.md` is the only place a hex value is written outside the vendored files.

### Contract 2 — the Tailwind v4 theme namespace

```css
/* app/globals.css — the bridge. `inline` is MANDATORY. */
@theme inline {
  --color-accent: var(--accent);   /* → .text-accent { color: var(--accent) } */
  --color-bg-h:   var(--bg-h);
  /* … one --color-* per palette and semantic alias … */
  --font-mono:  var(--font-jetbrains-mono, var(--mono));
  --text-micro: var(--fs-micro);
  /* … one --text-* per --fs-* step … */
  --leading-chrome: var(--lh-chrome);
  --tracking-caps:  var(--ls-caps);
}
```

Verified empirically against `tailwindcss@4.3.3` by compiling both forms from identical input (`:root{--aqua:#8ec07c;--accent:var(--aqua)}`):

```css
/* @theme        */  @layer utilities { .text-accent { color: var(--color-accent) } }
/* @theme inline */  @layer utilities { .text-accent { color: var(--accent)       } }
```

Plain `@theme` freezes the lookup at `:root`; only `inline` emits the live reference. **The authoritative verification signal is the emitted utility body, nothing else.** In the same probe, plain `@theme` also emitted `--color-accent: var(--accent)` into `@layer theme { :root, :host }` while `inline` did not — but the decomposition synthesis records a case where 4.3.3 emitted it under `inline` too, so treat that declaration's presence or absence as unreliable and check the utility body.

Because regions re-point `--accent` at runtime rather than through class names, Tailwind's source scanner cannot see the accent utilities. Force-generate them with the v4 safelist replacement, verified working at 4.3.3:

```css
@source inline("{text,bg,border}-{accent,accent-d}");
```

**Invariant D — one family seam.** `--font-mono` uses a CSS fallback: `var(--font-jetbrains-mono, var(--mono))`. `--font-jetbrains-mono` is produced by KW-004's `app/fonts.ts` via `next/font/local`'s `variable` option. KW-004 is a wave-2 **sibling, not a dependency** — the fallback is what lets this ticket land and render correctly whether or not KW-004 has merged. Do not add a dependency edge to KW-004 and do not create `app/fonts.ts`.

### Contract 3 — the global accessibility primitives

```css
/* styles/kw.css — consumed by every region ticket, defined only here. */
.sr-only { /* visually hidden, still in the accessibility tree */ }
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--fg0);
  outline-offset: 2px;
  border-radius: var(--r-chip);
}
body { overflow-x: clip; }
@media (prefers-reduced-motion: reduce) { /* global animation stop */ }
```

**Invariant E — regions do not redefine these.** A region ticket that needs a hidden heading writes `class="sr-only"`. A region ticket that needs a focus ring writes nothing. `--fg0 #fbf1c7` is the ring colour because it is the only value that clears 3:1 on every surface in the system: 14.451 on `--bg-h`, 12.994 on `--bg0`, 10.220 on `--bg1`, 7.777 on `--bg2` (all recomputed at this commit).

**Invariant F — `[data-scanline]` hook.** `styles/ds/web.css` declares the scanline opacity so that `html[data-scanline="off"]` sets `--scanline-opacity: 0`, and `@media (prefers-contrast: more)` sets it to `0` unconditionally. Whether anything ever writes that attribute is GATE-007's decision and is out of scope here.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; do not silently change scope if something has moved.

### File plan

Create:

```
styles/ds/README.md                 provenance + numbered deviation ledger + contrast table
styles/ds/tokens/colors.css         byte-identical copy
styles/ds/tokens/typography.css     byte-identical copy
styles/ds/tokens/spacing.css        byte-identical copy
styles/ds/tokens/effects.css        byte-identical copy
styles/ds/layers/base.css           byte-identical copy
styles/ds/layers/type.css           byte-identical copy
styles/ds/layers/pane.css           byte-identical copy
styles/ds/layers/tmux.css           byte-identical copy
styles/ds/layers/data.css           byte-identical copy
styles/ds/web.css                   the ONLY web re-derivation layer
styles/kw.css                       site layout + breakpoints + keyframes + a11y layer
```

Modify: `app/globals.css` (created by KW-001).

Vendor with a plain copy so the result is `diff`-provable:

```bash
DS=docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d
mkdir -p styles/ds/tokens styles/ds/layers
cp "$DS"/tokens/{colors,typography,spacing,effects}.css styles/ds/tokens/
cp "$DS"/layers/{base,type,pane,tmux,data}.css          styles/ds/layers/
# tokens/fonts.css is intentionally NOT copied — DEC-004, KW-004 owns fonts.
```

Vendoring byte-identically and putting **every** change in `styles/ds/web.css` is what keeps the design system re-syncable from its upstream project (`583945d5-2203-4320-8a4e-b30afe61181d`, "SWE·RTS Terminal Design System"). `base.css` is vendored **in full**, including the deck-only `deck-stage` and `.slide` rules, because `.glow` lives there and is one of the six animations the reduced-motion stop must demonstrably cover. Those rules are inert without the `deck-stage` custom element.

### `styles/ds/web.css` — the deviation layer

Numbered so `styles/ds/README.md` can reference each one against its upstream target file.

**D1 — type scale (upstream `tokens/typography.css`).** The DS ladder is authored for a 1920×1080 slide (`--fs-hero:200px`) and its header comment says *"never re-tune per viewport"* — void for a website. The comp patched six of ten steps to fixed px on one root `<div>` (comp:48) and left `--fs-h1`, `--fs-h2`, `--fs-hero`, `--fs-stat` inheriting 108/72/200/240 px. Replace with the ladder below: `clamp(min, intercept + slope·vw, max)` over a **360→1560 px** band, `slope = (max − min)/1200`, `intercept = min − slope·360`, all in `rem`. 1560 px is `<main>`'s `max-width` (comp:66) and the comp's `$preview.width` (comp:193).

```css
:root {
  /* terminal chrome: dense, barely grows */
  --fs-micro: clamp(0.625rem,  0.6062rem + 0.0833vw, 0.6875rem); /* 10   → 11   px */
  --fs-small: clamp(0.6875rem, 0.6687rem + 0.0833vw, 0.75rem);   /* 11   → 12   px */
  --fs-mono:  clamp(0.75rem,   0.7219rem + 0.125vw,  0.8438rem); /* 12   → 13.5 px */
  --fs-body:  clamp(0.8125rem, 0.7844rem + 0.125vw,  0.9063rem); /* 13   → 14.5 px */
  /* NEW step: readable prose — man-page paragraphs, commit messages */
  --fs-prose: clamp(0.9375rem, 0.9094rem + 0.125vw,  1.0313rem); /* 15   → 16.5 px */
  /* display ladder, re-derived for the web */
  --fs-lead:  clamp(1rem,      0.9437rem + 0.25vw,   1.1875rem); /* 16   → 19   px */
  --fs-h3:    clamp(1.125rem,  1.0125rem + 0.5vw,    1.5rem);    /* 18   → 24   px */
  --fs-h2:    clamp(1.375rem,  1.1875rem + 0.8333vw, 2rem);      /* 22   → 32   px */
  --fs-h1:    clamp(1.75rem,   1.45rem + 1.3333vw,   2.75rem);   /* 28   → 44   px */
  --fs-hero:  clamp(2.125rem,  1.5625rem + 2.5vw,    4rem);      /* 34   → 64   px */
  --fs-stat:  clamp(2.5rem,    1.75rem + 3.3333vw,   5rem);      /* 40   → 80   px */
  --lh-prose: 1.65;   /* NEW */
  --lh-chrome: 1.55;  /* NEW — the comp's root line-height */
}
html { font-size: 100%; }   /* never set px on :root — WCAG 1.4.4 */
```

At 1560 px the four preserved chrome steps land within 0.5 px of the comp's hand-tuned values (11 / 12 / 13.5 / 14.5 vs 11 / 12 / 13 / 14), so **nothing on desktop changes visually**. Adjacent display-step ratios stay 1.22–1.33 across the band; chrome→prose is a deliberate 1.14× jump.

**D2 — geometry (upstream `tokens/spacing.css`).**

```css
:root {
  --bar-h:    clamp(1.75rem,   1.675rem + 0.3333vw, 2rem);        /* 28 → 32 px */
  --tmux-h:   clamp(1.375rem,  1.3rem + 0.3333vw,   1.625rem);    /* 22 → 26 px */
  --pane-gap: clamp(0.625rem,  0.55rem + 0.3333vw,  0.875rem);    /* 10 → 14 px */
  --pl-w:     clamp(0.625rem,  0.5875rem + 0.1667vw, 0.75rem);    /* 10 → 12 px */
  --sp-1:     clamp(0.25rem,   0.2125rem + 0.1667vw, 0.375rem);   /*  4 →  6 px */
  --sp-2:     clamp(0.625rem,  0.55rem + 0.3333vw,  0.875rem);    /* 10 → 14 px */
  --sp-3:     clamp(0.8125rem, 0.7188rem + 0.4167vw, 1.125rem);   /* 13 → 18 px */
  --sp-4:     clamp(1.125rem,  0.975rem + 0.6667vw, 1.625rem);    /* 18 → 26 px */
  --sp-5:     clamp(1.5rem,    1.3125rem + 0.8333vw, 2.125rem);   /* 24 → 34 px */
  --pane-pad:        var(--sp-2) var(--sp-3);
  --pane-pad-canvas: var(--sp-2) var(--sp-2);
  --pane-pad-tight:  4px var(--sp-2) var(--sp-2);
  --pane-bar-pad:    0 var(--sp-3);
  --pane-bar-gap:    var(--sp-2);
  --dot-size:        clamp(0.4375rem, 0.4rem + 0.1667vw, 0.5625rem); /* 7 → 9 px */
  --dot-gap:         clamp(0.3125rem, 0.2938rem + 0.0833vw, 0.375rem);
  --r-pane: 6px;
}
```

`--tmux-h` is currently **dead** in the comp: `.tmux{height:var(--tmux-h)}` is beaten by an inline `height:24px` on comp:173. Re-deriving it makes the token live again, which is what KW-018 needs.

**D3 — slide-scale leaks (upstream `layers/pane.css`, `layers/data.css`).** `.dots i` is 14 px with a 9 px gap = 60 px of traffic lights inside a 32 px bar. `.commit{gap:24px}` and `.rail{height:30px}` were never overridden by the comp.

```css
.pane-bar { gap: var(--pane-bar-gap); padding: var(--pane-bar-pad); min-height: var(--bar-h); height: auto; }
.pane-body { padding: var(--pane-pad); }
.dots   { gap: var(--dot-gap); }
.dots i { width: var(--dot-size); height: var(--dot-size); }
.commit { gap: var(--sp-2); }
.commit .graph { flex: 0 0 1.125rem; }   /* 22px  → 18px */
.commit .hash  { flex: 0 0 5.75rem;  }   /* 132px → 92px (the comp already did this inline) */
.commit .cyear { flex: 0 0 5.5rem;   }   /* 96px  → 88px (ditto) */
.rail { height: clamp(14px, 1.25rem, 20px);
        margin-left: calc(1.125rem / 2 - var(--bw-pane) / 2); }
.tmux { min-height: var(--tmux-h); height: auto; }
```

`.rail`'s `margin-left` is now **derived from `.graph`'s width**, so the two can never drift apart again — the DS's literal `10px` silently assumed `.graph:22px` with `--bw-pane:2px`. Changing `height` to `min-height` on `.pane-bar` and `.tmux` is the WCAG 1.4.12 text-spacing fix: both are `overflow:hidden` with a fixed height and would clip under the 1.5× line-height bookmarklet.

**D4 — powerline seam patch (upstream `layers/tmux.css`).** The comp keeps these two rules outside the DS (comp:28-29). They are a genuine bug fix, not a comp hack, and they will bite again at any `--pl-w`:

```css
.tmux .seg.pl::after  { left:  calc(100% - 1px); width: calc(var(--pl-w) + 1.5px); }
.tmux .seg.plr::before{ right: calc(100% - 1px); width: calc(var(--pl-w) + 1.5px); }
```

Also encode the segment-after-an-arrow padding as a formula rather than the comp's magic `16`: `padding-left: calc(var(--pl-w) + 4px)`. Keep the clip-path triangles — `layers/tmux.css`'s own header comment explains that a `U+E0B0` glyph separator would render as tofu because the Google-hosted JetBrains Mono ships no Nerd Font PUA range.

**D5 — contrast fixes.** All ratios below were recomputed at this commit with the WCAG 2.x relative-luminance formula; the "after" column is the value the acceptance gate asserts.

| # | Site | Pair | Before | Fix | After |
|---|---|---|---|---|---|
| 1 | ribbon weekday labels `mon/wed/fri` (comp:583) | `--bg4 #7c6f64` on `--bg-h #1d2021` | **3.369** ❌ | use `--fg4` | **5.898** ✅ |
| 2 | ribbon month + overview year labels, `now → 2021 · drag to scrub`, `reach me` | `--gray #928374` on `--bg-h` | **4.467** ❌ | use `--fg4` | **5.898** ✅ |
| 3 | transport `⏮ 2021` (comp:111) | `--fg4 #a89984` on `--bg1 #3c3836` | **4.171** ❌ | text → `--fg3` | **5.323** ✅ |
| 4 | transport `◆ init` (comp:112) | `--purple #d3869b` on `--bg1` | **4.226** ❌ | lift transport-bar surface `--bg1` → `--bg-h` | **5.975** ✅ |
| 5 | tmux `☰ 1826/1826` segment (comp:178) | `--fg3 #bdae93` on `--bg2 #504945` | **4.050** ❌ | text → `--fg1` on `--bg2` | **6.432** ✅ |
| 6 | **every** `.pane-bar` default (`layers/pane.css:6`) and comp:147 `HEAD → main` | `--text-faint` (`--fg4`) on `--surface-bar` (`--bg1`) | **4.171** ❌ | `--text-faint` → `--text-dim` | **5.323** ✅ |
| 7 | scrollbar thumb (comp:26-27), **non-text**, needs 3:1 | `--bg2 #504945` on `--bg-h #1d2021` | **1.858** ❌ | `--bg4 #7c6f64` | **3.369** ✅ |

`--bg3 #665c54` measures **2.517** and does **not** clear 3:1 — C-17. Do not use it.

Every fix lands ≥ 5.0 clean, which matters because of the scanline: the overlay is `rgba(0,0,0,.16)` at `opacity:.35` with `mix-blend-mode:multiply`, an effective `1 − 0.16·0.35 = 0.944` multiplier on one of every three pixel rows, which drags borderline pairs ~6–7% down (fg4/bg1 4.171 → 3.905; bg4/bg-h 3.369 → 3.146). At ≥ 5.0 clean the worst case stays ≥ 4.7 even at `--scanline-opacity:.35`, so **the contrast work is independent of GATE-007**.

Sites 3 and 4 are region-owned markup (KW-025/KW-026); this ticket lands the tokens and records the required pairing in `styles/ds/README.md`, it does not edit region files.

**D6 — scanline token (upstream `tokens/effects.css`).**

```css
:root { --scanline-opacity: .20; }                       /* GATE-007 default; see below */
html[data-scanline="off"] { --scanline-opacity: 0; }
@media (prefers-contrast: more) { :root { --scanline-opacity: 0; } }
```

### `styles/kw.css` — site layout and the global accessibility layer

Move the seven `.kw-*` classes out of the comp's inline styles (`.kw-instr`, `.kw-lower`, `.kw-graph`, `.kw-tail`, `.kw-2up`, `.kw-pad`, `.kw-hide-sm`; `.kw-hide-md` is defined but never applied and is retained for the tmux `kevinweaver.dev` segment KW-018 will hide). Base values move into rules, which removes the sole reason `!important` appears in the comp at all. Port the comp's two keyframes verbatim (`kw-pulse`, `kw-logIn`), the `::selection` rule (`#8ec07c` on `#1d2021` = 7.79:1, already passing), and the scrollbar rules with fix D5.7. Breakpoint set: 540, 720, 900, 1080 — the 900 step exists because `.kw-2up` going straight from `1fr 2fr` to `1fr` skips the comfortable intermediate. Use `100dvh`, not `100vh`, on the app root.

The accessibility layer:

```css
/* focus — the design system has ZERO :focus or :focus-visible rules anywhere,
   and the comp has zero focus/aria/role/tabindex matches. Verified at this commit. */
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--fg0);
  outline-offset: 2px;
  border-radius: var(--r-chip);
}
@supports not selector(:focus-visible) {
  :where(a, button, input, select, textarea, summary, [tabindex]):focus {
    outline: 2px solid var(--fg0); outline-offset: 2px;
  }
}

/* screen-reader-only utility — the shared primitive for every region's hidden text */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
.sr-only-focusable:not(:focus):not(:focus-within) {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}

/* reflow — the tmux bar needs ~470-515px and the comp sets no overflow-x anywhere,
   so below ~470px it produces whole-page horizontal scrolling (WCAG 1.4.10). */
body { overflow-x: clip; }

/* motion — the global stop. Covers all SIX unguarded infinite animations:
   .rainbow, .hl, .uhl, .cursor (layers/type.css), .glow (layers/base.css),
   .metric.rainbowfill .meter .fill (layers/data.css). */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

The four `!important` declarations inside the reduced-motion block are the one permitted exception — they must beat the DS's own `animation` shorthands. Nothing else in `styles/kw.css` may use `!important`.

### `app/globals.css` — the bridge

`@import` rules must precede all other statements. Exact order:

```css
@import "tailwindcss";

/* Vendored verbatim from design-system project 583945d5-2203-4320-8a4e-b30afe61181d.
   Do not hand-edit these nine files.
   All web re-derivations live in styles/ds/web.css. See styles/ds/README.md. */
@import "../styles/ds/tokens/colors.css";
@import "../styles/ds/tokens/typography.css";
@import "../styles/ds/tokens/spacing.css";
@import "../styles/ds/tokens/effects.css";
@import "../styles/ds/layers/base.css";
@import "../styles/ds/layers/type.css";
@import "../styles/ds/layers/pane.css";
@import "../styles/ds/layers/tmux.css";
@import "../styles/ds/layers/data.css";
@import "../styles/ds/web.css";
@import "../styles/kw.css";

/* Regions re-point --accent at runtime via inline style, so the scanner never
   sees these class names. v4's safelist replacement force-generates them. */
@source inline("{text,bg,border}-{accent,accent-d}");

@theme inline {
  /* one --color-* per base palette entry and per semantic alias (Contract 2) */
  --color-accent: var(--accent);
  --color-accent-d: var(--accent-d);
  --color-bg-h: var(--bg-h);
  /* … --color-bg0 … --color-orange-d, --color-surface-*, --color-text-*,
       --color-border-*, --color-status-* … */

  --font-mono: var(--font-jetbrains-mono, var(--mono));

  --text-micro: var(--fs-micro);
  --text-small: var(--fs-small);
  --text-mono:  var(--fs-mono);
  --text-body:  var(--fs-body);
  --text-prose: var(--fs-prose);
  --text-lead:  var(--fs-lead);
  --text-h3:    var(--fs-h3);
  --text-h2:    var(--fs-h2);
  --text-h1:    var(--fs-h1);
  --text-hero:  var(--fs-hero);
  --text-stat:  var(--fs-stat);

  --leading-tight: var(--lh-tight);
  --leading-heading: var(--lh-heading);
  --leading-body: var(--lh-body);
  --leading-code: var(--lh-code);
  --leading-prose: var(--lh-prose);
  --leading-chrome: var(--lh-chrome);
  --tracking-display: var(--ls-display);
  --tracking-heading: var(--ls-heading);
  --tracking-caps: var(--ls-caps);
}
```

Naming collision to be aware of, not a bug: `--text-body` (a Tailwind font-size) and `--color-text-body` (a colour) live in different Tailwind namespaces, so `text-body` is the font-size utility and `text-text-body` is the colour utility. Note it in `styles/ds/README.md` so no downstream agent burns turns on it.

The `--text-*` values in `2026-07-31-nextjs-upgrade.md` §4.3 are **superseded** by the D1 ladder above — that section's px literals predate the §5.2 re-derivation. Take the colour bridge shape from §4.3 and the scale values from D1.

### Worked fixture — the contrast ledger

`styles/ds/README.md` must contain this table, regenerated by the command in the agent gate. Reproduce these exact numbers:

```
pair                                          before   after
bg4  #7c6f64 on bg-h #1d2021  (weekday)        3.369   5.898  (--fg4)
gray #928374 on bg-h #1d2021  (month/year)     4.467   5.898  (--fg4)
fg4  #a89984 on bg1  #3c3836  (transport)      4.171   5.323  (--fg3 on --bg1)
purple #d3869b on bg1 #3c3836 (init)           4.226   5.975  (--purple on --bg-h)
fg3  #bdae93 on bg2  #504945  (tmux pos)       4.050   6.432  (--fg1 on --bg2)
fg4  #a89984 on bg1  #3c3836  (.pane-bar)      4.171   5.323  (--text-dim)
bg2  #504945 on bg-h #1d2021  (scrollbar,3:1)  1.858   3.369  (--bg4)
focus ring fg0 #fbf1c7 on bg-h/bg0/bg1/bg2     —       14.451 / 12.994 / 10.220 / 7.777
```

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` exits 0 on Node 24.
- `diff -r docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens styles/ds/tokens --exclude fonts.css` and the equivalent for `layers` both report no differences, proving the nine vendored files are byte-identical and that every web change lives in `styles/ds/web.css`.
- `grep -c '^@theme inline {' app/globals.css` returns 1 and `grep -c '^@theme {' app/globals.css` returns 0.
- After `npm run build`, `grep -rA1 '\.text-accent' .next/static/css/` shows the utility body as `color: var(--accent)` — **not** `var(--color-accent)`. This is the `@theme inline` proof and the only reliable one; the utility is emitted at all because of the `@source inline("{text,bg,border}-{accent,accent-d}")` directive. Use the frozen toolchain for this — do not `npx @tailwindcss/cli`, which is not in the KW-001 dependency set (`tailwindcss@4.3.3` ships no bin; the CLI is a separate package).
- A node one-liner recomputing WCAG 2.x relative-luminance ratios reports every one of the six fixed text sites at ≥ 5.0:1 and the scrollbar thumb at ≥ 3.0:1, and the resulting table is committed verbatim into `styles/ds/README.md`.
- `grep -rnE '(^|[^-])(html|:root)[^{]*\{[^}]*font-size: *[0-9.]+px' styles app/globals.css` returns nothing, and `html { font-size: 100% }` is present exactly once.
- The `@media (prefers-reduced-motion: reduce)` global stop is present in `styles/kw.css`, and all six unguarded infinite-animation selectors — `.rainbow`, `.hl`, `.uhl`, `.cursor`, `.glow`, `.metric.rainbowfill .meter .fill` — are still present in the vendored files, so the stop provably covers all six.
- `body { overflow-x: clip }` is present, and `grep -c '!important' styles/kw.css` returns exactly 4, all four inside the reduced-motion block.
- `:focus-visible` and `.sr-only` are each defined exactly once, in `styles/kw.css`, with the ring colour `var(--fg0)`.
- `git diff --name-only origin/main...HEAD` lists only paths matching `styles/**` or `app/globals.css`.
- `styles/ds/README.md` records, per vendored file, the upstream source path, the vendoring date, and every numbered deviation D1–D6 with its upstream target file named.

### At-merge gate

- The required `ci-ok` status is green on the exact PR head.
- `git diff origin/main...HEAD -- package.json package-lock.json` is empty — the DEC-003 freeze holds and no dependency or npm script changed.
- No file outside `styles/**` and `app/globals.css` is added, modified or deleted; in particular `app/layout.tsx`, `app/page.tsx`, `app/fonts.ts`, `components/**`, `lib/**` and `.github/**` are untouched.
- Code review completed with every finding resolved or explicitly dispositioned.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. GATE-007 is an operator decision, not evidence produced by this ticket — see "Sibling boundaries and open gates".

## Failure, security, migration, and accessibility cases

**Failure modes.**

1. *Plain `@theme` instead of `@theme inline`.* The build stays green, every page renders, and per-section `--accent` re-pointing is silently dead. Six wave-3 region tickets would consume the broken contract before anyone noticed. The compiled-utility check in the agent gate is the only reliable detector.
2. *Editing a vendored file in place.* Breaks re-syncability from the upstream design-system project and makes the deviation ledger a lie. The `diff -r` gate catches it.
3. *Reaching for `--bg3` on the scrollbar* because the design track's §9.7 recommends it. It measures 2.517 and fails. C-17 supersedes §9.7.
4. *Missing the sixth animation.* `.metric.rainbowfill .meter .fill` sits immediately above the `prefers-reduced-motion: no-preference` block in `layers/data.css` and reads as if it were inside it. The universal-selector stop covers it regardless; the gate counts six.
5. *Missing the sixth contrast site.* `.pane-bar{color:var(--text-faint)}` is the **default** for all six pane bars and is easy to skip because no single markup line shows it.
6. *Browser floor.* Tailwind v4 requires Safari 16.4+, Chrome 111+, Firefox 128+ (`@property`, `color-mix()`); Next 16 requires Firefox 111+, so Tailwind is the binding constraint. `layers/base.css` already uses `color-mix(in oklab, …)` in its `a{}` rule, so the floor is inherent to the design system, not introduced here. Record it in `styles/ds/README.md`.

**Security.** None apply. This ticket ships static CSS only: no user input, no network request, no secret, no token, no server code, no third-party asset. It adds no dependency, so it adds no supply-chain surface.

**Migration.** `styles/globals.scss`, `tailwind.config.js` and `postcss.config.js` are deleted by KW-001 before this ticket starts; there is no Sass left to migrate and no v2→v4 config translation to perform. Tailwind v4 has `postcss-import` and `autoprefixer` built in, so neither is reinstated. If any of those files still exists at pickup, KW-001 has not merged.

**Accessibility.** This ticket is the global accessibility floor for the whole site. Success criteria addressed here: **1.4.3 Contrast (Minimum)** — the six text sites, all ≥ 5.0:1 after fix; **1.4.11 Non-text Contrast** — the scrollbar thumb at 3.369:1 and the focus ring at 7.777–14.451:1; **1.4.4 Resize Text** — `html{font-size:100%}` plus a `rem`-based ladder replacing the comp's absolute `font-size:13px` root; **1.4.10 Reflow** — `body{overflow-x:clip}` as the backstop for the tmux bar's ~470–515 px minimum; **1.4.12 Text Spacing** — `height` → `min-height` on `.pane-bar` and `.tmux`; **2.4.7 Focus Visible** — the first `:focus-visible` rule that has ever existed in this design system (verified: zero `:focus` or `:focus-visible` rules across all nine files, and zero `focus`/`aria-`/`role=`/`tabindex` matches in the comp); **2.3.3 Animation from Interactions** — the six-animation global stop.

Explicitly **not** satisfiable here and deliberately deferred: WCAG 1.4.11 for the contribution grid's colour ramp. A 10-step sequential ramp would need `3^9 = 19,683:1` end-to-end and sRGB tops out at 21:1, so no ramp can pass. DEC-011 answers it with a visually-hidden `<table>` owned by KW-025, and KW-007 asserts CIEDE2000 separation instead of WCAG contrast. Do not attempt a ramp fix in this ticket.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/design/_ds/**, docs/research/2026-07-31-design-comp-spec.md, docs/research/2026-07-31-nextjs-upgrade.md, package.json, postcss.config.mjs
- Writes: styles/ds/**, styles/ds/README.md, styles/kw.css, app/globals.css
- Contracts: css custom property token contract, tailwind v4 theme inline namespace, global a11y primitives
- Safety: app/globals.css cascade order, styles/ds vendored design-system fidelity

## Sibling boundaries and open gates

**Upstream.** KW-001 is the only hard dependency. It creates `app/globals.css`, `postcss.config.mjs` and the frozen dependency set including `tailwindcss@4.3.3` and `@tailwindcss/postcss`, and deletes `styles/globals.scss`, `tailwind.config.js` and `postcss.config.js`. Consumed symbols: the `app/globals.css` file itself, the `@tailwindcss/postcss` plugin registration, and the `build` / `lint` / `typecheck` / `typegen` npm scripts.

**Wave-2 siblings — running in parallel, do not touch their files.**

| Ticket | Owns | Seam with this ticket |
|---|---|---|
| KW-004 | `public/fonts/**`, `app/fonts.ts`, `components/icons/**` | Sets `--font-jetbrains-mono` via `next/font/local`'s `variable`. This ticket bridges `--font-mono: var(--font-jetbrains-mono, var(--mono))`, so it renders correctly whether or not KW-004 has merged. Not a dependency. |
| KW-005 | `app/layout.tsx`, `app/page.tsx`, `app/regions/**`, `components/ds/**` | KW-005 imports `app/globals.css` and consumes `.sr-only`, `.pane`, `.pane-bar`, `.pane-body` and the `--pane-pad-*` variants. It must not edit `app/globals.css`. |
| KW-006 | `content/**` | No overlap. |
| KW-007 | `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts`, `test/viz/ramp-contrast.test.ts` | Owns all contribution-ramp colour work and the CIEDE2000 fixture. This ticket owns only chrome contrast. No shared file. |
| KW-008 / KW-009 / KW-010 / KW-011 / KW-012 | `lib/viz/sim/**`, `scripts/pipeline/**`, `vitest.config.mts`, `lib/bundle/**` | No overlap. In particular, do not add a test file or a test-runner config — KW-011 owns that. |

**Downstream consumers of this ticket's contracts.** KW-016 (man-page pane) applies the explicit `overflow:auto` override to one `.pane-body`; KW-017 (career git-log pane) consumes `.commit` / `.graph` / `.hash` / `.ref` / `.cyear` / `.cmsg` / `.rail` with the D3 re-derivation and must never colour a row `--gray` (4.467 on the pane surface — a contrast failure this ticket exists to prevent); KW-018 (header + tmux bar) consumes the D4 seam patch and the live `--tmux-h`; KW-019 (contact pane), KW-020 (boot overlay), KW-025 (instrument pane) and KW-026 (transport bar) consume the token contract and the accessibility primitives. KW-026 also owns the transport-bar surface lift that fix D5.4 depends on; this ticket lands the token and records the requirement, it does not edit the region file. KW-029 owns the runtime accessibility gate — axe, keyboard traversal and the real 320 px reflow proof — so this ticket's reflow evidence is the static `overflow-x: clip` guard, not a browser measurement.

**Open gate.**

- **GATE-007 — scanline treatment.** The operator must choose between a persisted user toggle (default on) and dropping `--scanline-opacity` from `.35` to `.20`. Both are legitimate; it is an aesthetic call with an accessibility consequence, because the always-on scanline drags five borderline pairs across the AA line (fg4/bg1 4.171 → 3.905; gray/bg0 4.016 → 3.739; bg4/bg-h 3.369 → 3.146).

  **This gate does not block pickup.** Every contrast fix in D5 lands at ≥ 5.0:1 clean, which keeps the worst case ≥ 4.7 even at `.35`, so the contrast half of the ticket is gate-independent. Implement D6 exactly as written: `--scanline-opacity: .20` as the default, `html[data-scanline="off"]` as the override hook, and `@media (prefers-contrast: more)` forcing `0`. That satisfies the "drop to .20" branch outright and leaves the "toggle" branch one attribute write away. If GATE-007 later resolves to the toggle, whichever region ticket the operator picks writes `data-scanline` on `<html>`; this ticket must not ship that control, any client state, or any `localStorage` access.

