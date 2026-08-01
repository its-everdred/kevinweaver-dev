# KW-007 — Contribution ramp, log2 bands, and contrast fixtures

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 1 — Two constant modules and one self-contained unit test; every colour value is already measured and independently reproduced, so no design work remains.

**Risk:** low — pure data with no runtime dependency and no shared file with any wave-2 sibling; the only coupling is the hex table that KW-022 paints and KW-029 re-audits.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-006, REQ-007

**Decisions:** DEC-003, DEC-008, DEC-009, DEC-011, DEC-016

**Gates:** none

**Workstream:** viz

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The contribution colour scale ships as two frozen TypeScript modules under `lib/viz/tokens/`, and a single unit test proves — on every pull request — that adjacent ramp stops stay perceptually distinguishable, that contrast against the pane surface stays monotone, that levels 6 and 7 are still the exact gruvbox `--green-d` / `--green` tokens read from the design system's own stylesheet, and that `level(n)` returns the right band at every boundary. A future recolour that breaks any of those properties fails the build instead of shipping.

## Context and evidence

The site's contribution grid is the one surface where colour carries meaning, so the ramp is data, not styling. Two research tracks proposed different ramps and the disagreement was resolved by re-measurement:

- **C-6 / DEC-009.** The design comp ships an OKLCh sweep (`#32302f … #ffe87c`, built by `buildColors()` in the comp) and the visualization track proposed a gruvbox-anchored ramp (`#3c3836 … #faeb77`). The tie-breaker is **GT-17**: the gruvbox ramp lands on `--green-d #98971a` at level 6 and `--green #b8bb26` at level 7 *exactly*, so a token change propagates; the comp ramp hits no token and would silently drift from the design system. The gruvbox ramp wins. Level 0 becomes `#3c3836` (`--bg1`), which is also marginally better against the pane surface (1.41:1 versus `#32302f`'s 1.25:1).
- **GT-15 kills the obvious acceptance criterion.** The design track recorded "no adjacent level pair reaches 3:1" as a WCAG 1.4.11 failure of the comp ramp. It is not a property of any ramp: a 10-step chain at 3:1 per step needs `3^9 = 19,683:1` and sRGB tops out at 21:1. **Both candidate ramps score 1.22–1.50 adjacent.** So this ticket must assert **CIEDE2000**, never adjacent WCAG. 1.4.11 conformance comes from **DEC-011**'s visually-hidden `<table>`, owned by KW-029.
- **GT-16 / C-6.** The agent companion ramp `AG` clips out of sRGB at levels 7–9. It does not appear in grid cells at all — grid cells are the *combined* human + agent count — so it survives only in the gource animation, where it tags large-area actor tokens. It must therefore never encode magnitude above index 6.
- **The bands are log2 doubling, not quantile.** Quantile binning provably collapses: a large mass of days sit at exactly 1 contribution (measured at 156 days over the comp's window and at 375 days over the 2,038-day window), which swallows three to four bins and leaves them empty. The doubling ladder is `0 / 1 / 2–3 / 4–7 / 8–15 / 16–31 / 32–63 / 64–127 / 128–255 / 256+`.
- **C-1 / GT-3 bound what may be asserted.** Every band-population histogram in the research was measured through a token that lacks the `ethereum-optimism` SAML grant and is therefore ~3,299 low across 2025–26. Band *boundaries* are ground truth; band *populations* are not. **DEC-008** already forbids contribution literals in copy; this ticket extends that discipline to the fixture — it asserts the ladder, never the histogram.
- **DEC-003** freezes `package.json` and `package-lock.json` after KW-001. There is no colour-science dependency in the pre-installed set, so the CIEDE2000 and WCAG math is implemented inside the test file and validated against published reference vectors.

Requirements this ticket serves:

- **REQ-006** — the contribution surface encodes measured GitHub data in a design-system-anchored scale, with no invented figures and no hand-tuned colour that can drift from the tokens.
- **REQ-007** — wherever colour carries meaning the encoding is verifiable and survives greyscale and common colour-vision deficiencies; the non-colour channel that completes WCAG conformance is owned downstream.

**Plan context** — repository-relative paths inside the approved planning pack, pinned to the approved planning commit named in this issue's authority preamble:

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/build-orders/site-rewrite/build-order.json` (`feature_boundary`, `tickets[].depends_on`, `tickets[].phase_hint`)
- Decision registry: `decisions[]` in the same file (DEC-001 … DEC-017)
- This ticket's implementation pointers: the "Refreshable implementation notes" section below.

Research evidence, all present at `e664d73a195facd64db58ba10952170ff01b4772`:

- [`docs/research/2026-07-31-decomposition-synthesis.md`](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md) — the KW-07 entry at lines 349–358, C-6 at 80–86, GT-15/16/17 at 43–45, DEC-009 at 223
- [`docs/research/2026-07-31-viz-runtime.md`](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-viz-runtime.md) — §3.2 at lines 359–432 (the ramp table), and the verification corrections at lines 1081–1085, where the adversarial verifier reproduced the entire table from scratch and called it "the most solid section in the doc"
- [`docs/research/2026-07-31-design-comp-spec.md`](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-design-comp-spec.md) — §6.3 at lines 1003–1032 (the comp's ramp, `BINS`, and the `level()` ladder)
- [`docs/research/2026-07-31-data-pipeline.md`](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-data-pipeline.md) — line 130 (the `bands` array in the payload schema) and lines 523–535 (the `1 + floor(log2(n))` merge formula)
- [`docs/research/2026-07-31-ci-testing.md`](https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-ci-testing.md) — line 495 puts log2 band boundaries in the `node` test project and calls out the mass-point case by name

## Scope

- Create `lib/viz/tokens/ramp.ts` exporting the frozen 10-stop `LV` grid ramp, the animation-only `AG` companion ramp, the `PANE_SURFACE` constant, and index-safe accessors.
- Create `lib/viz/tokens/level.ts` exporting the `Level` type, `BAND_LOWER_BOUNDS`, `BAND_LABELS`, `level(count)` and `bandLabel(level)` as a float-free log2 doubling ladder.
- Create `test/viz/ramp-contrast.test.ts` with a self-contained CIEDE2000 and WCAG 2.x implementation, validated against published Sharma reference vectors before it is used on the ramp.
- Assert the distinguishability invariants: every adjacent CIEDE2000 step at or above 3, every non-adjacent pair at or above 3, and contrast against the pane surface strictly increasing across all ten stops.
- Assert the gruvbox anchors by parsing the design system's own `colors.css` rather than by repeating a literal, so the DEC-009 rationale is enforced rather than asserted.
- Assert `level(n)` at both edges of all ten bands, at the defensive inputs, and against the pipeline's `1 + floor(log2(n))` formula.
- If and only if a superseded `lib/contrib-scale.ts` scaffold is present on the base branch at pickup and nothing imports it, delete it together with `lib/contrib-scale.test.ts`, so the tree never carries two contribution ramps.

## Non-goals

- No canvas, DOM, React or rendering code — KW-022 owns `lib/viz/render/**` and is the consumer of these constants.
- No edit to `vitest.config.mts`, `test/setup.dom.ts` or `test/canvas-recorder.ts` — KW-011 owns the runner configuration.
- No CSS, no Tailwind `@theme inline` bridge and no token export into `app/globals.css` — KW-003 owns `styles/**` and `app/globals.css`.
- No new npm dependency and no edit to `package.json` or `package-lock.json` — DEC-003 freezes both after KW-001.
- No band-population histogram, no contribution totals and no `generatedAt` handling — those numbers are payload fields owned by KW-010 and KW-014 under DEC-008.
- No visually-hidden contribution table, no axe run and no token-pair contrast audit — DEC-011 and KW-029 own `components/viz/ContributionTable.tsx` and `lib/viz/tokens/contrast.test.ts`.
- No separate human/agent colour encoding inside grid cells — grid cells are the combined count, per C-6.

## Existing owner and reuse target

There is no existing owner: `lib/` and `test/` do not exist at `e664d73a195facd64db58ba10952170ff01b4772` (`git ls-files` returns 49 tracked files; the tree is `pages/`, `components/`, `styles/`, `public/`, `docs/` and root config). This ticket creates `lib/viz/tokens/` and `test/viz/` and is their sole and permanent owner for the rest of the plan.

Verified reuse targets:

- **`docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css`** — exists and is committed (GT-5: nine of ten design-system stylesheets are on disk; C-3 resolved the "the directory is empty" claim as false). It is a single `:root` block. The four values this ticket depends on are `--bg-h:#1d2021`, `--bg1:#3c3836`, `--green:#b8bb26` and `--green-d:#98971a`, plus `--surface-pane:var(--bg-h)` and `--fg0:#fbf1c7`. This file is the anchor oracle for the test.
- **`docs/design/kevinweaver.dev.dc.html`** — exists. `level(n)` at lines 253–264 is the exact doubling ladder and should be ported verbatim in shape; `this.BINS` at line 249 is the band-label array. `buildColors()` at lines 240–251 is the ramp that DEC-009 **replaces** — read it for the `BINS` labels only, and do not copy `this.LV` or `this.AG` from it.
- **`styles/ds/tokens/colors.css`** — created by KW-003, a wave-2 sibling. Treated as optional by this ticket's test: if present, the vendored values must agree with the design-system source; if absent, the test uses the design-system source alone and never skips.
- **KW-001** supplies the toolchain this ticket runs on: `typescript@5.9.3` and `vitest@4.1.10` as pinned by C-15 and pre-installed under DEC-003, plus `tsconfig.json`, `eslint.config.mjs`, and the pre-declared `typecheck`, `typegen`, `lint` and `test:unit` scripts.

**Superseded scaffold — check for this first.** A pre-App-Router-rewrite scaffold named `lib/contrib-scale.ts` (with `lib/contrib-scale.test.ts` alongside) may be present on the base branch at pickup. It is not present at `e664d73a195facd64db58ba10952170ff01b4772`, so treat this paragraph as a conditional. It exports `CONTRIB_LEVELS`, `ContribLevel`, `contribLevel(count)`, `CONTRIB_RAMP` and `contribColor(count)`, and it carries the same ten gruvbox hexes. It is superseded by this ticket on four counts: it bins with `Math.floor(Math.log2(count)) + 1`, which is implementation-approximated arithmetic; it returns level 0 for `Infinity`, where an open top band must return 9; it asserts the anchors as literals rather than against the design-system token file, so the DEC-009 propagation argument is not actually enforced; and it has no CIEDE2000 fixture at all, which is the entire point of this ticket. It also sits outside the `lib/viz/tokens/**` partition that the write-surface proof assigns to this ticket.

Handling, in order:

1. `grep -rn "contrib-scale" --include='*.ts' --include='*.tsx' --include='*.mts' . | grep -v node_modules`
2. If the only hits are the two scaffold files themselves, delete both in this PR and say so in the PR body. Two ramps in one tree is precisely the drift DEC-009 exists to prevent.
3. If any other file imports it, delete nothing and edit nothing — record the importer on this issue so the owning ticket migrates it, and ship the new modules alongside.

## Contract and invariants

This ticket is a producer. KW-022 (render modules), KW-025 (instrument pane) and KW-029 (accessibility gate) are the consumers, and each of them quotes the sketch below verbatim rather than restating the values.

```ts
// lib/viz/tokens/level.ts — the band ladder and its labels.

/** Ramp index. There are exactly ten levels; index === Level, always. */
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** Inclusive lower bound of each band. log2 doubling (DEC-009), never quantile. */
export const BAND_LOWER_BOUNDS: readonly [0, 1, 2, 4, 8, 16, 32, 64, 128, 256];

/** Human-readable band label, one per level. The separators are U+2013 EN DASH. */
export const BAND_LABELS: readonly [
  '0', '1', '2–3', '4–7', '8–15', '16–31', '32–63', '64–127', '128–255', '256+',
];

/**
 * Combined (human + agent) contribution count -> ramp level.
 * Total ordering, no floats, no Math.log2: bit-identical on every engine.
 * NaN and counts <= 0 return 0; fractional counts are floored; the top band is open.
 */
export function level(count: number): Level;

/** Text equivalent for a level, consumed by the DEC-011 hidden table and the tooltip. */
export function bandLabel(value: Level): string;
```

```ts
// lib/viz/tokens/ramp.ts — the frozen colour data.

/** The surface every grid cell is painted on: --surface-pane -> --bg-h. */
export const PANE_SURFACE: '#1d2021';

/** Combined-actor grid ramp. Ten entries, lowercase six-digit hex, index === Level. */
export const LV: readonly [
  '#3c3836', // 0   0          = --bg1
  '#404a2b', // 1   1
  '#4d5b21', // 2   2–3
  '#5e6a1f', // 3   4–7
  '#70791d', // 4   8–15
  '#83881b', // 5   16–31
  '#98971a', // 6   32–63      = --green-d  (exact gruvbox anchor)
  '#b8bb26', // 7   64–127     = --green    (exact gruvbox anchor)
  '#d9d34a', // 8   128–255
  '#faeb77', // 9   256+
];

/**
 * Agent (its-applekid) companion ramp. ANIMATION ONLY (C-6): the gource actor
 * tokens and the partial-fill share indicator. Never a second grid ramp.
 * Levels 8 and 9 carry a saturated 'ff' channel — the OKLCh source clips out of
 * sRGB at 7–9 (GT-16) — so AG must not encode magnitude above AG_SEMANTIC_MAX.
 */
export const AG: readonly [
  '#3c3836', '#5a3b43', '#764251', '#8b4c5f', '#a1586d',
  '#b6637c', '#cc708b', '#f98cac', '#ffa6c6', '#ffc5e1',
];

/** Highest AG index that may carry meaning; above it, use a pattern fill. */
export const AG_SEMANTIC_MAX: 6;

/** Grid cell fill for a level. */
export function rampColor(value: Level): string;

/** Actor-token fill for a level, capped at AG_SEMANTIC_MAX. */
export function agentColor(value: Level): string;
```

Invariants that hold for the life of the plan:

1. **Index equals level.** `LV`, `AG`, `BAND_LABELS` and `BAND_LOWER_BOUNDS` are all exactly ten entries and are indexed by the same `Level`.
2. **The anchors are load-bearing.** `LV[0]` is `--bg1`, `LV[6]` is `--green-d`, `LV[7]` is `--green`, `PANE_SURFACE` is `--bg-h`. If the design system changes those tokens the ramp changes with it, and the test is what makes that true.
3. **Distinguishability is the acceptance metric, not contrast.** Adjacent stops are separated by CIEDE2000, not by WCAG ratio. Asserting an adjacent WCAG floor of 3:1 is arithmetically impossible (GT-15) and is a forbidden assertion in this file.
4. **Monotone luminance.** Contrast against `PANE_SURFACE` strictly increases from level 0 to level 9, which is what lets the ramp survive greyscale and colour-vision deficiency.
5. **The grid uses `LV` only.** Cells encode the combined human + agent count; `AG` never appears in a grid cell.
6. **The data is frozen.** Changing any hex requires updating the characterization table in `test/viz/ramp-contrast.test.ts` in the same commit; that is the intended friction.
7. **No populations.** The fixture asserts band boundaries and never a day-count histogram (C-1 / GT-3).

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify the three paths below at pickup; if any has moved, report it on the issue rather than widening scope.

### Files to create — exactly three

1. `lib/viz/tokens/level.ts`
2. `lib/viz/tokens/ramp.ts`
3. `test/viz/ramp-contrast.test.ts`

Use **relative imports** in the test (`../../lib/viz/tokens/ramp`). The `@/` path alias resolves through `vite-tsconfig-paths`, which arrives with KW-011 and may not be present when this ticket is picked up.

### `lib/viz/tokens/level.ts`

Port the shape of the comp's `level()` (`docs/design/kevinweaver.dev.dc.html:253-264`). Keep it a comparison ladder — do **not** ship `Math.min(9, 1 + Math.floor(Math.log2(n)))`. `Math.log2` is implementation-approximated in ECMA-262, and this codebase is committed to bit-identical arithmetic (DEC-016 makes the same call for the RNG). The log2 form is the pipeline's documented formula and appears in the test only, as a cross-check.

```ts
export type Level = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const BAND_LOWER_BOUNDS = [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] as const;

export const BAND_LABELS = [
  '0', '1', '2–3', '4–7', '8–15', '16–31', '32–63', '64–127', '128–255', '256+',
] as const;

export function level(count: number): Level {
  if (Number.isNaN(count) || count <= 0) return 0;
  const n = Math.floor(count);
  if (n === 1) return 1;
  if (n <= 3) return 2;
  if (n <= 7) return 3;
  if (n <= 15) return 4;
  if (n <= 31) return 5;
  if (n <= 63) return 6;
  if (n <= 127) return 7;
  if (n <= 255) return 8;
  return 9;
}

export function bandLabel(value: Level): string {
  return BAND_LABELS[value];
}
```

`Infinity` falls through every comparison and returns 9, which is correct for an open top band. `NaN` and negatives return 0.

### `lib/viz/tokens/ramp.ts`

Exactly the ten `LV` hexes and ten `AG` hexes from the contract sketch above, as `as const` tuples, lowercase, six digits. Import `type Level` from `./level`; do not re-declare it. Keep the per-line comments — they are the only place the band and the gruvbox token appear next to the hex.

```ts
import type { Level } from './level';

export const PANE_SURFACE = '#1d2021' as const;
export const AG_SEMANTIC_MAX = 6 as const;

export function rampColor(value: Level): string {
  return LV[value];
}

export function agentColor(value: Level): string {
  return AG[Math.min(value, AG_SEMANTIC_MAX) as Level];
}
```

### `test/viz/ramp-contrast.test.ts`

Roughly 200 lines, `node` environment, zero dependencies beyond `vitest` and `node:fs`.

**Colour maths, implemented in this file.** Use exactly this pipeline or the reference numbers below will not reproduce to two decimal places:

- sRGB channel to linear: `c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4`
- Relative luminance: `0.2126 R + 0.7152 G + 0.0722 B` on linear channels; contrast is `(Lmax + 0.05) / (Lmin + 0.05)`
- Linear sRGB to XYZ, D65: rows `[0.4124564, 0.3575761, 0.1804375]`, `[0.2126729, 0.7151522, 0.0721750]`, `[0.0193339, 0.1191920, 0.9503041]`
- XYZ to CIELab with white point `Xn = 0.95047, Yn = 1.0, Zn = 1.08883` and `f(t) = t > (6/29)^3 ? cbrt(t) : t / (3 * (6/29)^2) + 4/29`
- CIEDE2000 with `kL = kC = kH = 1`, the standard `G`, `T`, `S_L`, `S_C`, `S_H` and `R_T` terms

**Validate the CIEDE2000 implementation before trusting it.** Expose a Lab-taking entry point (`ciede2000Lab(L1, a1, b1, L2, a2, b2)`) and assert these published Sharma reference pairs to four decimal places — all three were re-computed against this exact pipeline and pass:

| Lab 1 | Lab 2 | ΔE00 |
|---|---|---|
| `50.0000, 2.6772, -79.7751` | `50.0000, 0.0000, -82.7485` | `2.0425` |
| `50.0000, -1.3802, -84.2814` | `50.0000, 0.0000, -82.7485` | `1.0000` |
| `60.2574, -34.0099, 36.2677` | `60.4626, -34.1751, 39.4387` | `1.2644` |

**Reference values for the ramp.** Every number below was reproduced independently for this ticket and matches the research table to two decimal places:

| Level | Hex | Contrast vs `#1d2021` | ΔE00 vs previous |
|---|---|---|---|
| 0 | `#3c3836` | 1.41 | — |
| 1 | `#404a2b` | 1.74 | 16.61 |
| 2 | `#4d5b21` | 2.21 | 8.45 |
| 3 | `#5e6a1f` | 2.78 | 6.25 |
| 4 | `#70791d` | 3.47 | 6.43 |
| 5 | `#83881b` | 4.30 | 6.49 |
| 6 | `#98971a` | 5.29 | 6.06 |
| 7 | `#b8bb26` | 7.94 | 10.58 |
| 8 | `#d9d34a` | 10.44 | 6.85 |
| 9 | `#faeb77` | 13.44 | 6.68 |

Aggregates: adjacent ΔE00 min **6.06**, max **16.61**, mean **8.27**; non-adjacent minimum **12.55**; level 0 versus the pane ΔE00 **9.23**; level 9 versus `--fg0 #fbf1c7` ΔE00 **13.12**; `AG` adjacent minimum **5.29**; minimum `LV`-to-`AG` separation at equal level **31.94**. For the record, adjacent WCAG ratios are `[1.23, 1.27, 1.26, 1.25, 1.24, 1.23, 1.50, 1.31, 1.29]` — this is the vector that must **not** be gated at 3:1.

**Anchor oracle.** Parse the token file rather than repeating literals:

```ts
import { existsSync, readFileSync } from 'node:fs';

const DS_TOKENS =
  'docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css';
const VENDORED_TOKENS = 'styles/ds/tokens/colors.css';

function readTokens(file: string): Record<string, string> {
  const css = readFileSync(file, 'utf8');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})/g)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}
```

If `tsconfig.json` enables `noUncheckedIndexedAccess`, `m[1]` and `m[2]` are `string | undefined` and `npm run typecheck` will fail: destructure the match (`const [, name, hex] = m;`) and guard, or assert. The tuple accesses (`LV[value]`, `BAND_LABELS[value]`) need no such treatment — a literal-union index into an `as const` tuple resolves to a literal union, never `undefined`.

`readTokens(DS_TOKENS)` yields `{'bg-h': '#1d2021', 'bg1': '#3c3836', 'green': '#b8bb26', 'green-d': '#98971a', 'fg0': '#fbf1c7', ...}` — the file is a single `:root` block, so there is no cascade to resolve and `--surface-pane:var(--bg-h)` is correctly skipped by the hex-only pattern. Paths resolve from `process.cwd()`, which Vitest sets to the project root. If `DS_TOKENS` is missing the test must **fail**, never skip. When `existsSync(VENDORED_TOKENS)` is true, assert the vendored values equal the design-system values for `bg-h`, `bg1`, `green` and `green-d`; when it is false, skip only that one comparison.

**Assertions, grouped:**

1. *CIEDE2000 self-test* — the three Sharma pairs above.
2. *Shape* — `LV`, `AG`, `BAND_LABELS` and `BAND_LOWER_BOUNDS` all have length 10; every `LV`/`AG` entry matches `/^#[0-9a-f]{6}$/`; the ten `LV` entries are distinct.
3. *Anchors* — `LV[0] === tokens['bg1']`, `LV[6] === tokens['green-d']`, `LV[7] === tokens['green']`, `PANE_SURFACE === tokens['bg-h']`.
4. *Distinguishability* — for `i` in 0..8, `ΔE00(LV[i], LV[i+1]) >= 3`; for every pair at distance 2 or more, `ΔE00 >= 3`; `AG` adjacent `ΔE00 >= 3`; for `i` in 1..9, `ΔE00(LV[i], AG[i]) >= 10`.
5. *Monotone contrast* — `contrast(LV[i], PANE_SURFACE)` strictly increases for `i` in 0..9; `ΔE00(LV[9], '#fbf1c7') >= 3`.
6. *Characterization* — the ΔE00 column and the contrast column above asserted with `toBeCloseTo(value, 2)`, so an intentional recolour has to update one visible table.
7. *Bands* — `level()` at both edges of all ten bands: `(0,0) (1,1) (2,2) (3,2) (4,3) (7,3) (8,4) (15,4) (16,5) (31,5) (32,6) (63,6) (64,7) (127,7) (128,8) (255,8) (256,9) (1_000_000,9)`.
8. *Band table consistency* — for every level `L`, `level(BAND_LOWER_BOUNDS[L]) === L`, and for `L` in 0..8, `level(BAND_LOWER_BOUNDS[L + 1] - 1) === L`.
9. *Defensive inputs* — `level(NaN) === 0`, `level(-5) === 0`, `level(0.5) === 0`, `level(Infinity) === 9`.
10. *Formula cross-check* — for every integer `n` in 1..1000, `level(n) === Math.min(9, 1 + Math.floor(Math.log2(n)))`, which is the pipeline's documented merge formula.
11. *Labels* — `bandLabel(2) === '2–3'` and `bandLabel(9) === '256+'`; assert the en dash is U+2013 (`'2–3'.charCodeAt(1) === 0x2013`) so a well-meaning ASCII rewrite is caught.

### Commands

```bash
npx vitest run test/viz/ramp-contrast.test.ts   # the fixture
npm run typegen && npm run typecheck            # next typegen before tsc --noEmit (C-15)
npm run lint
```

If `vitest.config.mts` does not exist yet, Vitest's default include (`**/*.{test,spec}.?(c|m)[jt]s?(x)`) and default `node` environment pick the file up with no configuration. If a `vitest.config.mts` is already on the base branch, run `npx vitest run` and confirm this file is collected.

**Collection hazard.** A positional path on the Vitest CLI *filters* the files that `include` already matched; it does not add one. So if the base branch carries a config whose include is scoped away from `test/**` — an include such as `['{lib,sim,scripts}/**/*.{test,spec}.{ts,mts}']` is the shape to look for — the command above reports "No test files found" and the fixture silently never runs. Do **not** edit `vitest.config.mts`; KW-011 owns it. Instead:

```bash
# temporary config, OUTSIDE the repository, never committed
printf "export default { test: { environment: 'node', include: ['test/viz/**/*.test.ts'] } }\n" > /tmp/vitest.kw007.mjs
npx vitest run -c /tmp/vitest.kw007.mjs
```

That proves the fixture locally. Then record the include-glob gap on the KW-011 issue, because the at-merge gate requires the repository's own `npx vitest run` to collect this file.

## Acceptance and verification

### Agent gate

- `npx vitest run test/viz/ramp-contrast.test.ts` is green, with no `.skip`, `.only`, `.todo` or `.fixme` anywhere in the file.
- The three Sharma CIEDE2000 reference pairs pass to four decimal places, proving the colour maths before it is applied to the ramp.
- Temporarily setting `LV[6]` to `#98971b` makes the anchor assertion fail; temporarily setting `LV[4]` to `#83881b` makes the adjacent-CIEDE2000 assertion fail. Both breaks are demonstrated and both are reverted before the PR is opened.
- `npm run typegen && npm run typecheck` and `npm run lint` are clean.
- `git status --porcelain` lists exactly `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts` and `test/viz/ramp-contrast.test.ts`, plus at most the deletion of the superseded `lib/contrib-scale.ts` and `lib/contrib-scale.test.ts` scaffold, and nothing else.
- `grep -rn "contrib-scale" --include='*.ts' --include='*.tsx' --include='*.mts' . | grep -v node_modules` is empty at the end of the ticket, or every remaining hit is recorded on the issue with its importing file named.
- The file contains no adjacent-WCAG floor assertion; the only WCAG assertion is the strictly-increasing contrast series against `PANE_SURFACE`.

### At-merge gate

- `ci-ok` is green on the exact PR head, with the unit job running the fixture against the current base.
- The diff touches no `package.json`, `package-lock.json`, `vitest.config.mts`, `app/**`, `styles/**` or `.github/**` file.
- `npx vitest run` on the merge base collects `test/viz/ramp-contrast.test.ts`; if a merged `vitest.config.mts` scopes its `node` project away from `test/**` the file is reported on the KW-011 issue and is not fixed here.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure.** `level()` is total: `NaN` and counts at or below zero return 0, fractional counts are floored, and `Infinity` returns 9 because the top band is open. The fixture must fail loudly, never skip, if the design-system token file is missing — a silently skipped anchor check is the exact failure mode this ticket exists to prevent. Comparing the vendored `styles/ds/tokens/colors.css` is conditional on its existence, because KW-003 is a parallel sibling; that conditional is the only permitted branch in the test.

**Security.** None apply. No network access, no secrets, no user input, no runtime data. The fixture reads two repository-local files and nothing else.

**Migration.** Three new files, and one conditional removal: the superseded `lib/contrib-scale.ts` scaffold and its test, deleted only when nothing imports them, as set out under "Existing owner and reuse target". Note also that the comp's ramp (`#32302f … #ffe87c`, built by `buildColors()` in `docs/design/kevinweaver.dev.dc.html`) is superseded by DEC-009 and must not be carried across. The comp's `level()` ladder and `BINS` labels **are** carried across, unchanged.

**Accessibility.** WCAG 1.4.11 cannot be satisfied by any 10-step ramp — `3^9 = 19,683:1` is required and sRGB provides at most 21:1 (GT-15) — so conformance for the grid is delivered by DEC-011's visually-hidden `<table>` and the non-colour channel, both owned by KW-029, not by colour choice here. What this ticket does contribute: the ramp is a lightness ramp first and a hue ramp second, with strictly monotone contrast 1.41 → 13.44 against the pane, so it survives greyscale and the common colour-vision deficiencies; level 9 stays ΔE00 13.12 away from body text `--fg0`; and `BAND_LABELS` is the text equivalent the hidden table and the tooltip both consume. Level 0's 1px inner stroke, which keeps the empty grid legible as a grid at 1.41:1, is drawn by KW-022 and is not this ticket's code.

## Surfaces

- Reads: docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css, docs/design/kevinweaver.dev.dc.html, styles/ds/tokens/colors.css, tsconfig.json, package.json
- Writes: lib/viz/tokens/ramp.ts, lib/viz/tokens/level.ts, test/viz/ramp-contrast.test.ts, lib/contrib-scale.ts, lib/contrib-scale.test.ts
- Contracts: lib/viz/tokens/ramp.ts, lib/viz/tokens/level.ts
- Safety: test/viz/ramp-contrast.test.ts

## Sibling boundaries and open gates

`lib/viz/tokens/**` belongs to this ticket alone for the life of the plan. The one exception is `lib/viz/tokens/contrast.test.ts`, which KW-029 adds in a later phase for the design-system token-pair audit; KW-029 sits downstream of this ticket through KW-025 → KW-024 → KW-022 → KW-007, so the two never run in parallel.

No ticket in the plan owns `lib/contrib-scale.ts` or `lib/contrib-scale.test.ts` — the pre-rewrite scaffold predates the write-surface partition table, and it is the only file pair outside `lib/viz/tokens/**` this ticket may touch, and then only to delete it under the conditions above.

Adjacent ownership, none of which this ticket may write:

- **KW-003** — `styles/**`, `app/globals.css`, the Tailwind `@theme inline` bridge and the global accessibility layer. It vendors the design-system CSS this ticket reads.
- **KW-008** — `lib/viz/sim/**` and `test/viz/cursor.test.ts` / `test/viz/rng.test.ts`. Same wave, disjoint files. Do not import from `lib/viz/sim/`; the tokens module has no dependency on the simulation.
- **KW-011** — `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts`, coverage thresholds and the `unit` job wiring.
- **KW-022** — `lib/viz/render/**`. The primary consumer: it imports `LV`, `PANE_SURFACE`, `rampColor` and `level`, and it owns the cached grid bitmap, the level-0 inner stroke and the `shadowBlur` treatment above level 8.
- **KW-025** — `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx`, including the hover tooltip that renders `bandLabel()`.
- **KW-029** — `components/viz/ContributionTable.tsx` (the DEC-011 hidden table), `e2e/a11y.spec.ts` and `lib/viz/tokens/contrast.test.ts`.

**Gates.** No gate blocks pickup: this ticket needs no token, no workflow-scope credential, no content decision and no dashboard access. GATE-007 (scanline treatment — a persisted toggle versus dropping `--scanline-opacity` from .35 to .20) composites over painted pixels and so shifts *effective* on-screen ratios; this fixture measures nominal token values, which is the same basis every measurement in the research used. Re-checking composited values is KW-029's token-pair audit, not this ticket's.
