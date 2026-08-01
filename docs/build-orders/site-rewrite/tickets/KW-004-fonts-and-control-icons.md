# KW-004 — Self-host JetBrains Mono and the SVG control icon set

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Two small, independent artifacts (two font binaries plus nine SVG icon components) with no shared state, no data dependency and no sibling write surface; the only real subtleties are the `next/font/local` src-path resolution rule and the latin-only subset choice.

**Risk:** Medium. Both failure modes are silent rather than loud: an unwired `app/fonts.ts` builds green while shipping no webfont at all, and a control glyph left as text renders as tofu only on machines whose fallback stack lacks the codepoint.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-002, REQ-004, REQ-006

**Decisions:** DEC-003, DEC-004, DEC-005

**Gates:** none

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The site renders in JetBrains Mono with zero requests to any third-party font host, and every control affordance in the design comp that was a bare Unicode glyph is available as an inline SVG icon component that is `aria-hidden` by construction, so the accessible name always lives on the button.

## Context and evidence

The design comp `docs/design/kevinweaver.dev.dc.html` drives its entire UI chrome from bare Unicode glyphs. GT-12 measured the exact census and it was re-measured at `e664d73a195facd64db58ba10952170ff01b4772`: **16 distinct non-ASCII codepoints, zero Private Use Area**.

```
U+00B7 ·  x25    U+2014 —  x15    U+2022 •  x13    U+2013 –  x12
U+25C6 ◆  x7     U+25CF ●  x5     U+2192 →  x3     U+23F8 ⏸  x2
U+2630 ☰  x2     U+283F ⠿  x2     U+25C9 ◉  x2     U+23EE ⏮  x1
U+23ED ⏭  x1     U+2709 ✉  x1     U+2605 ★  x1     U+25B6 ▶  x1
```

C-28 is the contradiction this ticket closes. The `nextjs-upgrade` track proposed shipping the `latin` + `latin-ext` woff2 subsets; its verifier refuted that on two counts, and the verifier wins:

1. `next/font/local`'s `src` entries are typed `Array<{path, weight?, style?}>` — **there is no per-entry `unicode-range`**. Declaring `latin` and `latin-ext` as two entries with identical `weight`/`style` emits two `@font-face` rules that are indistinguishable to the font-matching algorithm; the browser picks one and preloads both. Ship **latin only**: one roman entry, one italic entry.
2. Subsetting does not solve the glyph problem at all. The design system's own `@font-face` declarations pin the `latin` range to `U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD` — note it enumerates `U+2191` and `U+2193` and **skips `U+2192`**.

Re-measured this session, against the real binary rather than the range declaration: the `latin` variable woff2 shipped by `@fontsource-variable/jetbrains-mono@5.3.0` has a `cmap` covering **229 codepoints**. Of the 16 comp glyphs, only four are present.

| Glyph | Present in the latin woff2 `cmap` |
|---|---|
| `·` U+00B7, `—` U+2014, `•` U+2022, `–` U+2013 | PRESENT |
| `◆` U+25C6, `●` U+25CF, `→` U+2192, `⏸` U+23F8, `☰` U+2630, `⠿` U+283F, `◉` U+25C9, `⏮` U+23EE, `⏭` U+23ED, `✉` U+2709, `★` U+2605, `▶` U+25B6 | ABSENT |

**DEC-004 (synthesis D-04)** is the resolution: replace the nine control glyphs `⏸ ⏮ ⏭ ▶ ✉ ☰ ⠿ ◉ ★` with inline SVG, keep `· — • – → ◆ ●` as text. This kills the subsetting rabbit hole, is required for accessible names anyway (a button whose only content is a glyph has no reliable accessible name), and takes DesignSync off the critical path.

**One correction to GT-5, measured at this commit.** GT-5 recorded `tokens/fonts.css` as absent from the repo. It is present now — commit `8dc8d7f` added it — at `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/fonts.css`, 12 `@font-face` rules (6 roman `font-weight:300 800`, 6 italic `font-weight:400`, every rule `font-display:swap` with a precise `unicode-range`). Read it; do not vendor it. `next/font` owns `@font-face` generation.

Ground truth and records this ticket rests on: GT-5 (design system files on disk, zero font binaries anywhere in the repo), GT-12 (codepoint census), C-28 (subset vs control glyphs), DEC-003 (`package.json` and `package-lock.json` are frozen after KW-001), DEC-004 (SVG icons), DEC-005 (zero `serializes_with`; disjoint write surfaces).

Requirements traced:

- **REQ-002 — design fidelity.** The comp's typeface and control affordances render identically to `docs/design/kevinweaver.dev.dc.html` at 1560 px.
- **REQ-004 — WCAG 2.2 AA.** No control affordance may depend on a glyph for its accessible name.
- **REQ-006 — hermetic build and performance budget.** `next build` must not depend on a live third-party fetch, and the runtime must issue zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`.

Plan-context navigation, pinned to `e664d73a195facd64db58ba10952170ff01b4772`:

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/research/2026-07-31-decomposition-synthesis.md` §6 "Wave diagram", "Verified topological levels", "Write-surface partition"
- Decision registry: `docs/research/2026-07-31-decomposition-synthesis.md` §3 (D-01..D-17) and §4 (human gates)
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, entry "KW-04 — Self-host JetBrains Mono + SVG control icon set"
- Supporting detail: `docs/research/2026-07-31-nextjs-upgrade.md` §7 and correction VC-6; `docs/research/2026-07-31-design-comp-spec.md` §2.5/§2.6/§2.7 and correction C2
- Browse any of these at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/`

## Scope

- Vendor exactly two JetBrains Mono woff2 binaries — one roman (variable `wght`), one italic — into `public/fonts/`, together with the OFL-1.1 licence text, and commit them.
- Create `app/fonts.ts` exporting a single `jetbrainsMono` loaded with `next/font/local`, `variable: "--font-jetbrains-mono"`, `display: "swap"`, `adjustFontFallback: false`, latin only.
- Create `components/icons/` holding a canonical `ICON_PATHS` record, an `Icon` primitive, and nine named icon components covering `⏸ ▶ ⏮ ⏭ ✉ ☰ ⠿ ◉ ★`.
- Make `aria-hidden="true"` and `focusable="false"` structurally unoverridable on the icon primitive, and remove `aria-label`, `aria-labelledby` and `role` from the icon prop type so a caller cannot put the accessible name on the icon.
- Export raw 24×24 path data alongside the components so canvas consumers can build a `Path2D` from the same source of truth.
- Document the vendor, version, licence, and the glyph-to-icon mapping in `components/icons/README.md`.

## Non-goals

- Applying `jetbrainsMono.variable` to `<html>`. `app/layout.tsx` is owned by KW-005; this ticket only publishes the export and the exact one-line wiring instruction.
- Bridging `--font-mono` / `--mono` into Tailwind. `app/globals.css` and `styles/**` are owned by KW-003.
- Replacing glyphs at their call sites. The region tickets (KW-016..KW-020, KW-025, KW-026) each swap their own file; this ticket touches no region.
- Adding, removing or upgrading any npm dependency. `package.json` and `package-lock.json` are frozen by DEC-003 and are not in this ticket's write surface.
- Converting `· — • – → ◆ ●` to icons. DEC-004 keeps these as text.
- Powerline separators. The design system draws them with CSS `clip-path`; GT-12 confirms zero PUA codepoints in the comp and none are to be introduced.
- Any test file. `test/**`, `vitest.config.mts`, `e2e/**` and `playwright.config.ts` belong to KW-011 and KW-023.
- Fetching, subsetting, or hand-authoring `@font-face` rules with `unicode-range`. `next/font/local` generates them.

## Existing owner and reuse target

There is no existing owner: the repository contains **zero font binaries** (`find . -iname '*.woff*'` is empty at `e664d73a195facd64db58ba10952170ff01b4772`, confirming GT-5) and no `components/icons/` directory. This ticket creates both.

What already exists and must be read, not modified:

- `docs/design/kevinweaver.dev.dc.html` — the comp. Verified present, 61 KB, 1,033 lines.
- `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/fonts.css` — the design system's 12 `@font-face` rules with their `unicode-range`s. Verified present at this commit.
- `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/typography.css:4` — `--mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;`. This is the token KW-003 will re-point at the generated font variable.

Created by a named upstream ticket:

- `app/` (App Router root), `tsconfig.json`, `eslint.config.mjs`, and `next@16.2.12` / `react@19.2.8` / `react-dom@19.2.8` in `node_modules` — all land in **KW-001**. If KW-001 is not merged when you pick this up, branch from KW-001's head rather than from `main`; do not scaffold `app/` yourself.
- `components/ds/{Pane,PaneBar,Meter,Scanline}.tsx` — **KW-005**. Not consumed here; noted so you do not create `components/` structure that collides.

Binary source, in priority order. Both are verified to exist:

1. **DesignSync project `583945d5-2203-4320-8a4e-b30afe61181d`**, files `assets/fonts/jetbrains-mono-latin.woff2` and `assets/fonts/jetbrains-mono-italic-latin.woff2`. Verified present via `DesignSync list_files` (the project ships all 12 subsets). These are the exact binaries the comp was authored against, so this path is byte-identical fidelity. Use it if the DesignSync tool is available in your workspace.
2. **`@fontsource-variable/jetbrains-mono@5.3.0`** (OFL-1.1, verified via `npm view`). Fetch with `npm pack`, which does **not** touch `package.json` or `package-lock.json`. This is the default path for an autonomous worker.

Do **not** use `@fontsource/jetbrains-mono@5.3.0`. It exists and is OFL-1.1, but it ships **static** per-weight files (`jetbrains-mono-latin-100-normal.woff2` … `-800-`), not a variable font. The design system needs the `300 800` weight range in one file; static 400 alone would force browser-synthesised bold everywhere the comp uses `font-weight:700`/`800`.

## Contract and invariants

This ticket is a producer for three consumers. Each interface below is the verbatim seam.

### Seam 1 — `app/fonts.ts` (consumed by KW-005, KW-003, KW-027, KW-032)

```ts
// app/fonts.ts — the only place next/font is called in this repository.
import type { NextFontWithVariable } from "next/dist/compiled/@next/font";

export declare const jetbrainsMono: NextFontWithVariable;
// jetbrainsMono.variable  -> "__variable_<hash>"  class that declares --font-jetbrains-mono
// jetbrainsMono.className -> "__className_<hash>" class that sets font-family directly
// jetbrainsMono.style     -> { fontFamily: "'__jetbrainsMono_<hash>', ui-monospace, ..." }
```

Wiring the consumers must perform, quoted verbatim into their own tickets:

- **KW-005**, in `app/layout.tsx`: `<html lang="en" className={jetbrainsMono.variable}>` with `import { jetbrainsMono } from "./fonts";`
- **KW-003**, in `app/globals.css` under `@theme inline`: `--font-mono: var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace;` and re-point the design-system token `--mono` at the same value.

**Invariant:** `--font-jetbrains-mono` is the single agreed variable name. It is declared exactly once, by `next/font`, on whatever element carries `jetbrainsMono.variable`. Nothing else in the repository may declare it.

**Freshness/failure semantics:** if no module imports `app/fonts.ts`, Next emits no `@font-face` and no `_next/static/media/*.woff2`, and the page silently renders in the fallback stack. That is why the at-merge gate below asserts the emitted media files, not just a green build.

### Seam 2 — `components/icons/paths.ts` (consumed by KW-018, KW-026 for DOM; KW-022, KW-024, KW-025 for canvas)

```ts
// components/icons/paths.ts
/**
 * SVG path data authored against a 24x24 viewBox, fill-rule "evenodd".
 * Every entry is safe to pass to `new Path2D(d)` and to `ctx.fill(path)`.
 */
export const ICON_PATHS = {
  pause:     "M8 5h3v14H8zM13 5h3v14h-3z",
  play:      "M8 5l12 7-12 7z",
  skipStart: "M5 5h3v14H5zM20 5l-11 7 11 7z",
  skipEnd:   "M4 5l11 7-11 7zM16 5h3v14h-3z",
  menu:      "M3 6h18v2H3zM3 11h18v2H3zM3 16h18v2H3z",
  mail:      "M2 5h20v14H2ZM4 7h16v10H4ZM5.4 7.6 12 12.5l6.6-4.9v2.4L12 15 5.4 10.1Z",
  spinner:   "M10 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM10 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM10 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  commit:    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  star:      "M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4 6.2 20.5l1.1-6.5-4.7-4.6 6.5-.9z",
} as const;

export type IconName = keyof typeof ICON_PATHS;
```

Canvas consumers use it like this — this is the pattern KW-022 must copy for the `★` at `docs/design/kevinweaver.dev.dc.html:822`, which is drawn with `g.fillText('★ ' + …)` and therefore **cannot** use a React component:

```ts
import { ICON_PATHS } from "@/components/icons/paths";

const starPath = new Path2D(ICON_PATHS.star); // build once, outside the frame loop

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, px: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(px / 24, px / 24);
  ctx.fillStyle = "#fbf1c7";
  ctx.fill(starPath, "evenodd");
  ctx.restore();
}
```

**Invariant:** `ICON_PATHS` is the single source of truth. The React components read from it; they do not carry their own inline `d` strings. `IconName` is derived from the record via `keyof typeof`, so adding a component without a path is a type error.

### Seam 3 — `components/icons/index.ts` (consumed by KW-018, KW-026, and any region that needs a control glyph)

```tsx
// components/icons/Icon.tsx
import type { SVGProps } from "react";
import { ICON_PATHS, type IconName } from "./paths";

/**
 * The accessible name of an icon-only control lives on the CONTROL, never on
 * the icon. aria-label / aria-labelledby / role are removed from the prop type
 * so this is a compile error, not a review comment.
 */
export type IconProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "viewBox" | "aria-hidden" | "aria-label" | "aria-labelledby" | "role"
> & {
  name: IconName;
  /** Rendered edge length in CSS px. Default 16. */
  size?: number;
};

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      {...rest}
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICON_PATHS[name]} fillRule="evenodd" clipRule="evenodd" />
    </svg>
  );
}

export type NamedIconProps = Omit<IconProps, "name">;
```

Correct consumer usage, which KW-026 quotes back verbatim for the transport bar:

```tsx
import { PauseIcon, PlayIcon } from "@/components/icons";

<button type="button" aria-label={playing ? "Pause playback" : "Resume playback"} onClick={onToggle}>
  {playing ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
</button>
```

**Invariants:**

- `fill="currentColor"` — colour comes from the CSS cascade so the design system's per-section `--accent` re-pointing keeps working. Never hardcode a hex value inside an icon.
- `aria-hidden="true"` and `focusable="false"` are emitted **after** the prop spread, so they cannot be overridden even by an `any`-cast caller.
- No `"use client"` directive anywhere in `components/icons/`. These are pure, hook-free, event-handler-free components that must render inside React Server Components — KW-016's "zero client JS in the RSC payload" acceptance depends on it.
- Nine components, nine `ICON_PATHS` keys, one-to-one.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; do not silently change scope if something moved.

### Files to create

```
public/fonts/jetbrains-mono-latin-wght-normal.woff2   (binary, committed)
public/fonts/jetbrains-mono-latin-wght-italic.woff2   (binary, committed)
public/fonts/OFL.txt                                  (OFL-1.1 text, verbatim from the vendor)
app/fonts.ts
components/icons/paths.ts
components/icons/Icon.tsx
components/icons/index.ts
components/icons/README.md
```

Nothing else. No file outside `public/fonts/**`, `app/fonts.ts` and `components/icons/**` may appear in the diff.

### Step 1 — obtain the binaries

Default path, no dependency mutation:

```bash
cd "$(mktemp -d)"
npm pack @fontsource-variable/jetbrains-mono@5.3.0
tar xzf fontsource-variable-jetbrains-mono-5.3.0.tgz
# verified contents (measured 2026-07-31):
#   package/files/jetbrains-mono-latin-wght-normal.woff2   40404 bytes
#   package/files/jetbrains-mono-latin-wght-italic.woff2   42964 bytes
#   package/LICENSE                                        93 lines, SIL OFL 1.1
```

Measured SHA-256 of the two files as published in 5.3.0:

```
18be452724bfdc236c074ca94a249a7f41a86752c7d04ab258ce9ed5651f6a7e  jetbrains-mono-latin-wght-normal.woff2
a8afa085e9ca5e53434e2ee918ba6b65c7dd4dda56509976b36591478c99d62e  jetbrains-mono-latin-wght-italic.woff2
```

Copy the two woff2 into `public/fonts/` under exactly those names, and `package/LICENSE` to `public/fonts/OFL.txt`. Delete the tarball and the temp directory. Confirm `git status` shows no change to `package.json` or `package-lock.json`.

If you instead take the DesignSync path, the files are `assets/fonts/jetbrains-mono-latin.woff2` and `assets/fonts/jetbrains-mono-italic-latin.woff2`; keep the same destination filenames so `app/fonts.ts` does not fork, record the alternate provenance in `components/icons/README.md`, and note that the design system declares the italic face as `font-weight:400` rather than a `300 800` range — set the `weight` in `app/fonts.ts` accordingly.

Both roman and italic in `@fontsource-variable/jetbrains-mono@5.3.0` were confirmed this session to carry an `fvar` table, i.e. both are genuinely variable on `wght`.

### Step 2 — `app/fonts.ts`

```ts
import localFont from "next/font/local";

export const jetbrainsMono = localFont({
  variable: "--font-jetbrains-mono",
  display: "swap",
  // Local fonts accept only 'Arial' | 'Times New Roman' | false, and default to
  // 'Arial'. The whole design is monospace on a fixed grid, so Arial metrics
  // would be worse than none.
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  src: [
    {
      path: "../public/fonts/jetbrains-mono-latin-wght-normal.woff2",
      weight: "300 800",
      style: "normal",
    },
    {
      path: "../public/fonts/jetbrains-mono-latin-wght-italic.woff2",
      weight: "300 800",
      style: "italic",
    },
  ],
});
```

Three things that bite here:

- `src` paths resolve **relative to the directory containing the file that calls the loader**, not the project root. `app/fonts.ts` calling `../public/fonts/...` is correct. This is the single most common failure on this API.
- Exactly two `src` entries. A third entry with the same `weight`/`style` pair as an existing one produces a duplicate `@font-face` that the font-matching algorithm cannot distinguish, and both get preloaded (C-28, VC-6).
- Do not add `unicode-range` to an `src` entry — the type does not have that field. Do not import `next/font/google`.

### Step 3 — icons

Create `components/icons/paths.ts` and `components/icons/Icon.tsx` exactly as sketched in "Contract and invariants". The nine named wrappers live **in `Icon.tsx`**, below the `Icon` primitive, because they contain JSX and `index.ts` must stay JSX-free:

```tsx
// components/icons/Icon.tsx, continued below the Icon primitive
export const PauseIcon     = (p: NamedIconProps) => <Icon name="pause"     {...p} />;
export const PlayIcon      = (p: NamedIconProps) => <Icon name="play"      {...p} />;
export const SkipStartIcon = (p: NamedIconProps) => <Icon name="skipStart" {...p} />;
export const SkipEndIcon   = (p: NamedIconProps) => <Icon name="skipEnd"   {...p} />;
export const MenuIcon      = (p: NamedIconProps) => <Icon name="menu"      {...p} />;
export const MailIcon      = (p: NamedIconProps) => <Icon name="mail"      {...p} />;
export const SpinnerIcon   = (p: NamedIconProps) => <Icon name="spinner"   {...p} />;
export const CommitIcon    = (p: NamedIconProps) => <Icon name="commit"    {...p} />;
export const StarIcon      = (p: NamedIconProps) => <Icon name="star"      {...p} />;
```

The barrel is a pure re-export and contains no JSX, so it stays `.ts`:

```ts
// components/icons/index.ts
export {
  Icon,
  PauseIcon, PlayIcon, SkipStartIcon, SkipEndIcon,
  MenuIcon, MailIcon, SpinnerIcon, CommitIcon, StarIcon,
} from "./Icon";
export type { IconProps, NamedIconProps } from "./Icon";
export { ICON_PATHS } from "./paths";
export type { IconName } from "./paths";
```

Every one of the nine path strings above was rendered through `rsvg-convert` at 96 px and 200 px during planning and reads correctly as its intended mark under `fill-rule="evenodd"`; use them verbatim rather than re-deriving geometry.

The `mail` path uses `fill-rule: evenodd` deliberately: subpath 1 is the outer rectangle, subpath 2 is the inner rectangle (producing a 2 px frame), subpath 3 is the chevron which sits inside both and therefore has an odd containment count and fills. Do not switch it to `nonzero`.

### Step 4 — the glyph map, and who consumes what

`components/icons/README.md` must carry this table verbatim. Comp line numbers are measured at `e664d73a195facd64db58ba10952170ff01b4772`.

| Codepoint | Glyph | `ICON_PATHS` key / component | Comp site | Consuming ticket |
|---|---|---|---|---|
| U+23F8 | ⏸ | `pause` / `PauseIcon` | `:106` play button, `:1000` `onToggle` | KW-026 |
| U+25B6 | ▶ | `play` / `PlayIcon` | `:1000` `onToggle` paused state | KW-026 |
| U+23EE | ⏮ | `skipStart` / `SkipStartIcon` | `:111` `⏮ 2021` | KW-026 |
| U+23ED | ⏭ | `skipEnd` / `SkipEndIcon` | `:113` `⏭ live` | KW-026 |
| U+2630 | ☰ | `menu` / `MenuIcon` | `:178` and `:975` tmux `☰ 1826/1826` | KW-018 |
| U+2709 | ✉ | `mail` / `MailIcon` | `:167` contact tile | KW-019 |
| U+283F | ⠿ | `spinner` / `SpinnerIcon` | `:424`, `:426` boot console lines | KW-020 |
| U+25C9 | ◉ | `commit` / `CommitIcon` | `:700`, `:925` log-tail and commit rows | KW-017, KW-025 |
| U+2605 | ★ | `star` / `StarIcon` + `ICON_PATHS.star` | `:822` `g.fillText('★ ' …)` on canvas | KW-022 (canvas `Path2D`) |

Deliberately **not** replaced, per DEC-004: `·` U+00B7, `—` U+2014, `•` U+2022, `–` U+2013, `→` U+2192, `◆` U+25C6, `●` U+25CF. Record in the README that `→ ◆ ●` are outside the shipped `latin` subset's `cmap` and will render from the `ui-monospace, SFMono-Regular, Menlo, monospace` fallback stack; they carry no control semantics and appear inside running text, so this is accepted rather than fixed here.

### Version pins

`next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `typescript@5.9.3` — all installed by KW-001; do not change them. `@fontsource-variable/jetbrains-mono@5.3.0` is fetched via `npm pack`, never installed.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green with `app/fonts.ts` and `components/icons/**` present.
- `ls public/fonts/` lists exactly `jetbrains-mono-latin-wght-normal.woff2`, `jetbrains-mono-latin-wght-italic.woff2` and `OFL.txt`; both woff2 are committed (`git ls-files public/fonts` lists them) and each is under 64 KB.
- `grep -rn "fonts.googleapis.com\|fonts.gstatic.com\|next/font/google" app components public` returns nothing, and the same grep over `.next/` after `npm run build` returns nothing.
- `grep -rn "unicode-range" app components` returns nothing — `next/font` owns `@font-face` generation.
- `git diff --name-only origin/main...HEAD` lists only paths under `public/fonts/`, `app/fonts.ts` and `components/icons/`; `package.json` and `package-lock.json` are unchanged (DEC-003).
- `python3 -c "import pathlib,sys; bad={0x23F8,0x25B6,0x23EE,0x23ED,0x2709,0x2630,0x283F,0x25C9,0x2605}; hits=[(p,hex(ord(c))) for p in pathlib.Path('components/icons').rglob('*') if p.is_file() and p.suffix in {'.ts','.tsx'} for c in p.read_text(encoding='utf-8') if ord(c) in bad]; print(hits); sys.exit(1 if hits else 0)"` exits 0 — none of the nine replaced codepoints survives as a literal in the icon module's own source.
- `components/icons/index` exports exactly nine named icon components plus `Icon`, `ICON_PATHS`, `IconName`, `IconProps`, `NamedIconProps`; `Object.keys(ICON_PATHS).length === 9` and every key has a component.
- No `"use client"` string appears anywhere under `components/icons/`.

### At-merge gate

- `ci-ok` is green on the exact PR head (the required status published by KW-001's `.github/workflows/ci.yml`).
- After a production build, `find .next/static/media -name '*.woff2'` lists two files, and the generated font stylesheet contains `src:url(/_next/static/media/` with `font-display:swap` — this is what proves the font is actually emitted rather than tree-shaken away.
- `public/fonts/OFL.txt` is present and `components/icons/README.md` records vendor, exact version, licence and the full glyph-to-icon table.
- No new entry appears in `package.json` `dependencies` or `devDependencies`, and `package-lock.json` is byte-identical to `main`.

### Human/manual evidence

- In a browser against a production build: `await document.fonts.ready` resolves and `document.fonts.check('16px "JetBrains Mono"')` is true, with the Network panel recording zero requests to `fonts.googleapis.com` or `fonts.gstatic.com`. This assertion is re-run as an automated check by KW-023's e2e suite once Playwright exists, and KW-032 owns the feature-level operator evidence for the assembled page.

## Failure, security, migration, and accessibility cases

**Accessibility — the primary driver.** An icon-only control whose content is a bare glyph has no reliable accessible name; the comp's contact tiles rely on `title=`, which is not a dependable accessible name in assistive technology. The icon primitive therefore removes `aria-label`, `aria-labelledby` and `role` from its prop type and emits `aria-hidden="true"` after the spread, making "name on the icon" a compile error. Consumers must supply `aria-label` (or visible text) on the surrounding `<button>` / `<a>`. Icons inherit colour via `currentColor` so they never introduce a contrast pair of their own — the contrast obligation stays with the control's text colour, which KW-003 owns. Icons carry no motion; the `spinner` icon is a static six-dot mark and any animation applied to it by KW-020 must sit behind that ticket's `prefers-reduced-motion` guard.

**Failure — silent no-op.** If nothing imports `app/fonts.ts`, `next build` stays green and the site renders in the fallback stack with no visible error. The at-merge gate's `.next/static/media` assertion is the only thing that catches this; do not weaken it.

**Failure — tofu.** Any control glyph left as text will render as a missing-glyph box on a machine whose fallback stack lacks the codepoint. Sweeping for the nine codepoints is a permanent repository invariant, not a one-off: `grep -rnP '[\x{23F8}\x{25B6}\x{23EE}\x{23ED}\x{2709}\x{2630}\x{283F}\x{25C9}\x{2605}]' app components content lib` must stay empty after every region ticket lands. KW-029 (accessibility gate) is the natural place to make that a CI check; this ticket ships the command and the rationale.

**Security.** No new dependency enters the dependency tree, so no new supply-chain surface. `npm pack` downloads a tarball, is not executed, and does not run install scripts. The two woff2 are inert assets served from the site's own origin, which also removes the third-party request to Google's font CDN that the current design would otherwise make — a privacy improvement as well as a performance one.

**Licensing.** JetBrains Mono is SIL OFL-1.1. The licence requires the copyright notice and licence to accompany the font, so `public/fonts/OFL.txt` is mandatory, not optional. The reserved font name must not be used for a modified derivative; these binaries are shipped unmodified.

**Migration.** None. There is no incumbent font pipeline to migrate from — the repository has zero font binaries at `e664d73a195facd64db58ba10952170ff01b4772`, and the pre-rewrite `styles/globals.scss` is deleted by KW-001.

## Surfaces

- Reads: `docs/design/kevinweaver.dev.dc.html`, `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/fonts.css`, `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/typography.css`, `package.json`
- Writes: `public/fonts/**`, `app/fonts.ts`, `components/icons/**`
- Contracts: `app/fonts.ts`, `components/icons/index`, `components/icons/paths.ts`
- Safety: `third-party-font-licensing`

## Sibling boundaries and open gates

Wave 2 runs ten tickets in parallel behind KW-001 on strictly disjoint write surfaces (DEC-005). Stay inside yours.

- **KW-003** owns `app/globals.css`, `styles/**`, `styles/kw.css`. It performs the `@theme inline` bridge and re-points the design-system `--mono` token. Do not create or edit any stylesheet.
- **KW-005** owns `app/layout.tsx`, `app/page.tsx`, `app/regions/_contract.ts`, the seven region stubs, and `components/ds/**`. It applies `jetbrainsMono.variable` to `<html>`. Do not edit `app/layout.tsx`, and do not create anything under `components/ds/`.
- **KW-006** owns `content/**`. Boot-log copy lives there; the `⠿` marker must not be embedded in a content string — it is applied at render time by KW-020.
- **KW-001** owns `package.json` and `package-lock.json`, frozen after it merges (DEC-003). Any need for a new dependency is an escalation, not an edit.
- **KW-011** owns `vitest.config.mts` and `test/**`. This ticket ships no test file; its guards are grep and build assertions.
- Downstream consumers: **KW-018** (`☰`), **KW-026** (`⏸ ▶ ⏮ ⏭`), **KW-019** (`✉`), **KW-020** (`⠿`), **KW-017** and **KW-025** (`◉`), **KW-022** (`★` via `Path2D`). Only KW-018 and KW-026 declare a hard dependency on this ticket; the other five consume `components/icons/**` without one. They must **import**, never author, files under `components/icons/` — a region ticket that adds its own icon file breaks the write-surface partition. If this ticket has not merged when one of them starts, that ticket should leave the affordance as a plain-text placeholder and let KW-032's composition pass pick up the icon, rather than duplicating the module.

Open gates: **none block pickup.** HG-1 (push `origin/main`) is closed; `main` is at `e664d73a195facd64db58ba10952170ff01b4772` and carries the design system and research. HG-2 (`workflow` token scope) applies only to tickets touching `.github/workflows/**` — this ticket does not. The DesignSync fetch was explicitly recorded as a non-gate, dissolved by DEC-004 and the `@fontsource-variable` fallback. HG-7 (scanline treatment) is KW-003's, not this ticket's.
