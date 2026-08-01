# KW-026 — Transport bar controls, keyboard bindings, and arcade-game removal

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — One new client component plus a residue deletion in one renderer file; no algorithm and no data contract of its own. The subtleties are all boundary rules: the exact driver seam it consumes, keeping `Space` off `window`, and not absorbing the four sibling-owned files the comp mixes into the same 38 px strip.

**Risk:** Medium. Every failure mode here is silent rather than loud: a `window`-scoped key handler regresses page scroll for the whole document, a `Date.now()` read during render produces a hydration mismatch that only appears in production, and an unstyled `input[type=range]` looks broken instead of throwing.

**Phase hint:** 5

**Depends on:** KW-024, KW-004, KW-005

**Serializes with:** none

**Requirements:** REQ-002, REQ-003, REQ-004

**Decisions:** DEC-003, DEC-004, DEC-005, DEC-008, DEC-014

**Gates:** none

**Workstream:** chrome

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

The 38 px playback strip under the gource pane is built from real interactive elements — one `<button>` for play/pause, one `<input type="range">` for seeking, and one `<button>` each for jump-to-start, jump-to-agent-birth, jump-to-live and speed — every one of them reachable by Tab, operable by Enter/Space, and carrying an accessible name that does not depend on a glyph. `Space` toggles playback when focus is inside the strip and scrolls the page everywhere else. The cut arcade game leaves no trace in the codebase, and the freshness readout states only what the data payload actually says.

## Context and evidence

Three separate problems land in the same 38 px strip, which is why the synthesis put them in one ticket.

**1 — Six of seven controls in the comp are not controls.** Measured at `e664d73a195facd64db58ba10952170ff01b4772` against `docs/design/kevinweaver.dev.dc.html`:

| Comp line | Element | Handler | Status |
|---|---|---|---|
| 106 | `<button onClick={onToggle} ref={playRef}>⏸` | play/pause | a real `<button>`, but its only content is `U+23F8` |
| 107–110 | `<div onClick={onSeek}>` + two absolutely positioned `<div>`s | seek | not focusable, no role, no value |
| 111 | `<span onClick={onJumpStart}>⏮ 2021` | jump to window start | not focusable |
| 112 | `<span onClick={onJumpBirth}>◆ init` | jump to agent birth | not focusable |
| 113 | `<span onClick={onJumpLive}>⏭ live` | jump to today | not focusable |
| 114 | `<span onClick={onSpeed} ref={speedRef}>12 days/sec` | cycle speed | not focusable |

The `docs/research/2026-07-31-design-comp-spec.md` a11y audit (§10, "6 of 7 controls are `<span onClick>`") records the same census and prescribes the same fix: `<button>` for the four jump/speed spans, and `input[type=range]` for the seek track, "which gets arrow-key seeking, `aria-valuetext` and drag for free".

**2 — `Space` is hijacked on `window`, unconditionally.** Comp lines 477–491 register a single `window` `keydown` listener whose first branch is:

```js
if (e.code === 'Space') {
  e.preventDefault();
  this.userPlay = !this.userPlay;
  return;
}
```

`this.userPlay` is the Bomberman player-control flag, **not** playback. The verifier of `2026-07-31-design-comp-spec.md` reproduced this independently ("`Space` `preventDefault` being unconditional" is in its confirmed list). Two consequences, both real bugs: the one genuine `<button>` at comp:106 cannot be activated with `Space`, and the page cannot be paged down anywhere. `2026-07-31-viz-runtime.md` §9.3 reaches the same verdict — "that is an accessibility bug being removed, not a feature".

**3 — The arcade game is cut by the operator.** The synthesis §8 records it: "Bomberman / arcade game — Cut by the user. KW-026 deletes the ~65 lines and frees Space." Re-measured at this commit, the exact extent is:

| Comp lines | Symbol | Note |
|---|---|---|
| 637–684 | `drawGame(g, gm)` | 48 lines, the whole game |
| 633 | `this.drawGame(g, {left, top, step, cell, cw, weeks})` | the sole call site, at the end of `drawRibbon` |
| 642 | `this.walkable = walk` | assigned inside `drawGame`, read by the keydown block |
| 643–661 | `this.bot`, `this.boomAt` | game state, referenced only inside `drawGame` |
| 477–491 | `window.addEventListener('keydown', …)` | the only `keydown` handler in the comp — `Space`, arrows, `x` |
| 570 | `/* ---------------- the ribbon (and the board the game is played on) ---------------- */` | misleading doc comment |
| 636 | `/* the ribbon IS the level: 0 = wall, 1–3 = floor, 4+ = destructible */` | misleading doc comment |

**`this.rbGeom` at comp:577 must survive** — `hover()` at comp:687 reads it for tooltip hit-testing, and KW-025 depends on that. So does the `this.live` breathing ring at comp:620–626, which DEC-014 explicitly keeps.

Also confirmed dead at this commit and therefore never to be ported: `clockRef` (declared comp:200, written comp:982, passed comp:995, and **bound to no element** — the census of `ref="{{ … }}"` bindings in the markup returns 18 names and `clockRef` is not one of them; `barClockRef` at comp:180 is the live one); `infoOpen` / `onInfoIn` / `onInfoOut` (comp:206, 989–991, bound to nothing); and `.kw-hide-md` (defined once at comp:39, applied to zero elements — `grep -c kw-hide-md` returns 1, all of it the rule itself, against 3 for `kw-hide-sm`).

**4 — DEC-014 (synthesis D-14): the pill must stop lying.** `emitLive()` at comp:948–959 is a purely local synthesiser on a 2600 ms `setInterval` (comp:460). It picks a random event from `this.days[N-1]`, re-rolls a random file, and pushes a fake log line. The verifier of `2026-07-31-viz-runtime.md` corrected the attribution table specifically to record that **2 of the 6 `Math.random` sites live in `emitLive` (comp:952, 953)**. The operator cut the live transport; DEC-014 keeps the *freshness signal* and deletes the *fabrication*. `2026-07-31-design-comp-spec.md` §4.8 proposes the exact replacement — `fresh · 2h ago` driven by a `generatedAt` field, dot turning `--yellow` past 24 h.

**5 — The strip's own colours fail AA.** All ratios recomputed this session with the WCAG 2.x relative-luminance formula against the transport bar's real surface `--bg1 #3c3836` (correction C5 of `2026-07-31-design-comp-spec.md` establishes that the transport bar sits on `#3c3836`, not `#1d2021`), at the comp's 11 px font size, so the AA threshold for text is 4.5:1:

| Comp site | Foreground | Ratio on `#3c3836` | Verdict |
|---|---|---|---|
| `⏮ 2021` (111) | `--fg4 #a89984` | **4.171** | FAIL |
| `◆ init` (112) | `--purple #d3869b` | **4.226** | FAIL as text |
| `⏭ live` (113) | `--aqua #8ec07c` | 5.511 | pass |
| `12 days/sec` (114) | `--fg3 #bdae93` | 5.323 | pass |
| play button (106) | `--bg-h #1d2021` on `--aqua #8ec07c` | 7.793 | pass |
| seek track (107) | `--bg-h #1d2021` on `#3c3836` | **1.414** | FAIL 1.4.11 (3:1) |

The fix design-comp-spec prescribes is `--text-faint → --text-dim` (4.17 → 5.32). `--purple` is retained but demoted to a decorative, `aria-hidden` mark where 4.226:1 clears the 3:1 non-text threshold, with the readable label in `--text-dim`. The seek track gets a 1 px `--fg4` border: 4.171:1 against the bar and 5.898:1 against the track interior, both above 3:1.

Ground truth and records this ticket rests on: GT-12 (the 16-codepoint census that makes DEC-004 necessary), GT-13 (`drawGame` 637–684, `drawRibbon` 571–636 — the line map used above), GT-14 (complexity 2 gets an 8-turn budget, which is why the scope stops where it does), C-28 (control glyphs are outside JetBrains Mono's shipped coverage), DEC-003 (`package.json` and `package-lock.json` are frozen after KW-001), DEC-004 (all control glyphs become inline SVG), DEC-005 (zero `serializes_with`; disjoint write surfaces), DEC-008 (no contribution or window figure is a literal in copy), DEC-014 (honest `generatedAt`-driven freshness readout; `emitLive` deleted).

Requirements traced:

- **REQ-002 — design fidelity.** The 38 px strip renders as `docs/design/kevinweaver.dev.dc.html:105-116` does at 1560 px: same height, same gaps, same order, same colour language.
- **REQ-003 — every claim on the site is the authoritative resume or measured data.** The freshness readout, the window-start year on the jump button and the seek `aria-valuetext` all read from the payload; none is a literal, and none renders at all when the underlying field is absent.
- **REQ-004 — WCAG 2.2 AA.** Every control is keyboard-operable with a name that does not depend on a glyph, `Space` no longer blocks page scroll, and the strip's own colour pairs clear 4.5:1 for text and 3:1 for non-text.

Plan-context navigation, pinned to `e664d73a195facd64db58ba10952170ff01b4772`:

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/research/2026-07-31-decomposition-synthesis.md` §6 "Wave diagram", "Verified topological levels", "Write-surface partition (proof of D-05)"
- Decision registry: `docs/research/2026-07-31-decomposition-synthesis.md` §3 (D-01..D-17) and §4 (human gates)
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, entry "KW-26 — Transport bar, keyboard controls, and Bomberman deletion"
- Supporting detail: `docs/research/2026-07-31-design-comp-spec.md` §2.4 (transport bar geometry), §4.6 (interaction surface), §4.7 (Bomberman deletion list), §4.8 (live → fresh), §10 (a11y audit), and corrections C2 and C5; `docs/research/2026-07-31-viz-runtime.md` §8.1 (driver/harness API) and §9.3 (keyboard), and its "Citation hygiene" correction on the `emitLive` `Math.random` sites
- Browse any of these at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/`

## Scope

- Create `app/regions/TransportBar.tsx` as a `'use client'` component that renders the comp's 38 px playback strip (`docs/design/kevinweaver.dev.dc.html:105-116`) and consumes `TransportBarProps` from `app/regions/_contract.ts`.
- Render all six transport affordances as native interactive elements: a play/pause `<button>` using `PauseIcon`/`PlayIcon`, a seek `<input type="range">` with `aria-valuetext`, and a `<button>` each for jump-to-window-start, jump-to-agent-birth, jump-to-live and speed cycling.
- Bind `Space` to play/pause with a React `onKeyDown` handler on the strip's own container element only — no `window` listener, no `document` listener, and no `preventDefault` that can reach an element outside the strip.
- Consume the playback state and mutators from `lib/viz/driver.ts` (KW-024) through `useSyncExternalStore`, with a single `getVizTransport()` call site so a rename is a one-line change.
- Render the DEC-014 freshness readout from the payload's `generatedAt` via a pure, exported helper, with no synthesised event stream, no `Math.random`, and no 2600 ms ticker.
- Raise the strip's own colour pairs to WCAG AA: `--text-faint → --text-dim` for the jump labels, `--purple` demoted to a decorative `aria-hidden` mark, and a 1 px `--fg4` border on the seek track.
- Add `app/regions/TransportBar.module.css` carrying only the rules that cannot be expressed inline — the `input[type=range]` pseudo-element restyle and the strip layout.
- Remove any arcade-game residue (`drawGame`, `walkable`, `bot`, `boomAt`, and the two misleading doc comments) from `lib/viz/render/ribbon.ts` while preserving the ribbon geometry export and the `this.live` breathing ring.
- Add `app/regions/TransportBar.test.tsx` asserting the rendered control set and the freshness helper through `react-dom/server`, with no new dependency.

## Non-goals

- `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx` — KW-025 owns them and owns mounting `<TransportBar />` into the gource `Pane`'s `footer` slot.
- `lib/viz/driver.ts`, the rAF loop, the reduced-motion path, the `window.__viz` test harness, and the bundle→`SimInput` adapter — KW-024 owns all of it.
- Canvas focus, canvas `tabindex`, canvas keyboard bindings and the DEC-011 visually hidden contribution table — KW-025 and KW-029 own those.
- The header freshness pill at `docs/design/kevinweaver.dev.dc.html:60-63` and the tmux status bar — KW-018 owns `app/regions/Header.tsx` and `app/regions/TmuxBar.tsx`.
- The boot overlay's `onSkipBoot` control at comp:184 — it is one of the six `<span onClick>` handlers the synthesis lists, but it lives in `app/regions/BootOverlay.tsx`, which KW-020 owns and converts.
- `app/globals.css`, `styles/**`, the global `:focus-visible` ring, `.sr-only` and the reduced-motion stop — KW-003 owns the global layer.
- `app/layout.tsx`, `app/page.tsx` and `app/regions/_contract.ts` — KW-005 owns them; `TransportBarProps` is already declared there and must not be edited.
- `package.json` and `package-lock.json` — frozen after KW-001 by DEC-003. This ticket adds no dependency.
- `e2e/**`, `axe`, Lighthouse and the a11y CI gate — KW-029 owns verification; this ticket owns correctness.
- Any change to the ribbon's live breathing ring, the agent-birth marker, or `rbGeom` beyond leaving them intact.

## Existing owner and reuse target

There is no existing transport bar. `app/regions/TransportBar.tsx` is a **new file** created by this ticket, and the synthesis's write-surface partition assigns it to KW-026 exclusively.

Verified to exist at `e664d73a195facd64db58ba10952170ff01b4772`:

- `docs/design/kevinweaver.dev.dc.html` — the design comp. Lines 105–116 are the strip's markup; 477–491, 570, 633, 636–684, 948–959 are the code to be removed; 60–63 is the header pill that belongs to KW-018. 1,033 lines total (GT-13).
- `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css` — the gruvbox token table (`--bg1 #3c3836`, `--bg-h #1d2021`, `--fg3 #bdae93`, `--fg4 #a89984`, `--aqua #8ec07c`, `--aqua-d #689d6a`, `--purple #d3869b`, `--green #b8bb26`, `--yellow #fabd2d`) and the semantic aliases `--surface-bar`, `--border-hard`, `--text-dim`, `--text-faint`.
- `.../tokens/effects.css` — `--shadow-inset-track: inset 0 0 0 1px rgba(0,0,0,.25)`, which the comp's seek track uses at comp:107.

Created by named upstream tickets, not by this one:

| Target | Created by | What this ticket consumes |
|---|---|---|
| `app/regions/_contract.ts` | KW-005 | `TransportBarProps` (already declared for this ticket, `extends RegionCommonProps`) |
| `components/icons/index.ts` | KW-004 | `PauseIcon`, `PlayIcon`, `SkipStartIcon`, `SkipEndIcon` |
| `components/ds/Pane.tsx` | KW-005 | the `footer?: ReactNode` slot this component is rendered into — read only; KW-025 does the mounting |
| `lib/viz/sim/types.ts` | KW-008 | `SPEEDS = [4, 8, 12, 20, 32] as const` |
| `lib/viz/driver.ts` | KW-024 | the transport seam — see "Contract and invariants" |
| `lib/viz/render/ribbon.ts` | KW-022 | the ported ribbon renderer; this ticket edits it for residue removal only |
| `vitest.config.mts`, the `node` test project | KW-011 | the runner for `app/regions/TransportBar.test.tsx` |

`KW-011` is not a declared dependency of this ticket but is a wave-2 ticket and will be merged long before dispatch. Verify at pickup with `npx vitest list`; if the `node` project is absent, the unit test still runs under a bare `npx vitest run app/regions/TransportBar.test.tsx`.

## Contract and invariants

### Consumed seam — `lib/viz/driver.ts` (producer: KW-024)

This is the only module boundary this component crosses at runtime. KW-024 owns the file; the shape below is what KW-026 requires of it. **Re-read `lib/viz/driver.ts` at pickup.** If the merged export names differ, adapt the single import line and the single `getVizTransport()` call — do not re-implement playback state locally, and do not add a second rAF owner. If a required capability is genuinely missing, that is a KW-024 follow-up, not a local workaround.

```ts
// lib/viz/driver.ts — the transport-facing slice consumed by KW-026.

export interface VizTransportSnapshot {
  /** false until a payload is decoded. Controls render but are aria-disabled. */
  readonly ready: boolean
  readonly playing: boolean
  /** true when prefers-reduced-motion is set. Play/pause stays operable. */
  readonly reducedMotion: boolean
  /** Integer day index, 0 .. dayCount - 1. 0 is the oldest day in the window. */
  readonly dayIndex: number
  /** From the payload manifest (DEC-008). 0 when !ready. */
  readonly dayCount: number
  /** Human label for dayIndex, e.g. '12 mar 2024'. Formatted by the driver. */
  readonly dateLabel: string
  /** Label for day 0, e.g. '2021'. Payload-derived, never a literal (DEC-008). */
  readonly windowStartLabel: string
  /** Index into SPEEDS. */
  readonly speedIndex: number
  /** Agent-initialization day index, or -1 when the payload does not carry one. */
  readonly birthDayIndex: number
  /** RFC3339 from the payload manifest, or null when absent. */
  readonly generatedAt: string | null
}

export interface VizTransport {
  /** useSyncExternalStore subscribe. Returns an unsubscribe function. */
  subscribe(onStoreChange: () => void): () => void
  /** MUST be referentially stable when nothing changed, or React loops. */
  getSnapshot(): VizTransportSnapshot
  /** Server/pre-hydration snapshot. ready:false, playing:false, dayCount:0. */
  getServerSnapshot(): VizTransportSnapshot
  toggle(): void
  /** Clamped by the driver to [0, dayCount - 1]. No-op when !ready. */
  seekToDay(dayIndex: number): void
  /** Clamped by the driver to [0, SPEEDS.length - 1]. No-op when !ready. */
  setSpeedIndex(speedIndex: number): void
}

/** Always returns a transport. Before a payload loads it is an inert stub. */
export function getVizTransport(): VizTransport
```

Two invariants this shape exists to enforce:

- **`getSnapshot()` returns a stable reference between changes.** React 19's `useSyncExternalStore` re-renders whenever the returned object is not `Object.is`-equal to the previous one. A driver that allocates a fresh snapshot object on every rAF frame turns the transport bar into a 60 Hz React render loop. The driver caches one snapshot object and replaces it only when a field actually changes.
- **`getServerSnapshot()` exists and returns `ready: false`.** Without it, `useSyncExternalStore` throws during server rendering, and `app/regions/TransportBar.test.tsx` cannot render the component in Node.

### Produced seam — `app/regions/TransportBar.tsx` (consumer: KW-025)

```tsx
// app/regions/TransportBar.tsx
import type { TransportBarProps } from './_contract'

/**
 * The 38 px playback strip. Rendered by KW-025 into the gource Pane's
 * `footer` slot:  <Pane focus footer={<TransportBar />} …>
 *
 * Self-contained: reads all playback state from lib/viz/driver.ts, takes no
 * data props, and holds no state that KW-025 needs to know about.
 */
export default function TransportBar(props: TransportBarProps): React.ReactNode

/** Pure. Exported for the unit test and for reuse if KW-018 needs it later. */
export function freshness(
  generatedAtISO: string | null | undefined,
  nowMs: number | null,
): FreshnessReadout | null

export type FreshnessTone = 'ok' | 'warn' | 'dim'

export interface FreshnessReadout {
  /** Rendered text. Always true of the data; never the word 'live'. */
  readonly label: string
  /** Drives the dot colour only. The label is always --text-dim. */
  readonly tone: FreshnessTone
  /** Full timestamp, for the element's `title`. */
  readonly title: string
}
```

`freshness` is a **total, pure function of its two arguments** — no `Date.now()` inside, no locale-dependent formatting, no `Intl`. That is what makes it unit-testable in Node and deterministic under Playwright's `page.clock` in KW-031.

| `generatedAtISO` | `nowMs` | Result |
|---|---|---|
| `null`, `undefined`, or unparseable | anything | `null` — the readout is not rendered at all |
| valid | `null` (server render, pre-mount) | `{ label: 'generated ' + iso.slice(0, 10), tone: 'ok' }` |
| valid | age < 1 h, or negative (clock skew) | `{ label: 'fresh · <1h ago', tone: 'ok' }` |
| valid | 1 h ≤ age < 24 h | `{ label: 'fresh · ' + h + 'h ago', tone: 'ok' }` |
| valid | 24 h ≤ age < 7 d | `{ label: d + 'd ago', tone: 'warn' }` |
| valid | age ≥ 7 d | `{ label: 'stale · ' + d + 'd ago', tone: 'dim' }` |

### Behavioural invariants

- **I-1 — no `window` or `document` keyboard listener exists in this file.** `Space` is handled by a React `onKeyDown` on the strip's own container. Keydown reaches it only by bubbling from a focused descendant, so when focus is outside the strip the browser's native page scroll is untouched. When the event target is a `<button>`, the handler returns immediately and lets native activation win.
- **I-2 — no `preventDefault()` outside the strip.** The handler calls it only after it has decided to toggle, and only for events that bubbled out of the strip's own subtree.
- **I-3 — every control is focusable and named.** Zero `<span onClick>`, zero `<div onClick>`, zero `role="button"`. Six controls: five `<button type="button">` and one `<input type="range">`. Icons are `aria-hidden` by construction (KW-004's `IconProps` removes `aria-label`, `aria-labelledby` and `role` from the prop type, so putting a name on an icon is a compile error), therefore the name lives on the control.
- **I-4 — `aria-disabled`, never `disabled`.** Before a payload loads, controls stay in the tab order and stay discoverable; they simply do nothing. A `disabled` attribute would remove them from the tab order and make the strip appear and disappear under a screen reader as data arrives.
- **I-5 — the component never reads a clock during render.** `Date.now()` is called only inside `useEffect`. Server render and first client render both use `nowMs === null`, so there is no hydration mismatch.
- **I-6 — no figure is a literal (DEC-008).** `dayCount`, `windowStartLabel`, `dateLabel`, `birthDayIndex` and `generatedAt` all arrive on the snapshot. `1826`, `2038`, `2021` and `2021-08-01` must not appear in this file. The `SPEEDS` values are UI configuration from `lib/viz/sim/types.ts`, not payload data, and are imported rather than retyped.
- **I-7 — the file contains exactly one timer and zero randomness.** One `setInterval(…, 60_000)` refreshing the relative age, cleared on unmount. `grep -n 'Math.random\|2600' app/regions/TransportBar.tsx` returns nothing (DEC-014).
- **I-8 — the edit to `lib/viz/render/ribbon.ts` is subtractive only.** The ribbon geometry (comp:577 `rbGeom` — whatever KW-022 named it) and the `this.live` breathing ring (comp:620–626) must still exist after the edit. If KW-022 ported neither the game nor the misleading comments, the correct diff for that file is empty; record that in the PR body rather than inventing a change.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; do not silently change scope if something moved.

### Files

```
app/regions/TransportBar.tsx           (create)
app/regions/TransportBar.module.css    (create)
app/regions/TransportBar.test.tsx      (create)
lib/viz/render/ribbon.ts               (edit — subtractive only, possibly empty)
```

Nothing else may appear in the diff. In particular: no `package.json`, no `package-lock.json`, no `app/globals.css`, no `app/regions/_contract.ts`, no `app/regions/Instrument.tsx`, no `app/regions/BootOverlay.tsx`.

### Step 1 — verify the upstream seams exist

```bash
test -f app/regions/_contract.ts   && grep -n 'TransportBarProps' app/regions/_contract.ts
test -f components/icons/index.ts  && grep -n 'PauseIcon\|PlayIcon\|SkipStartIcon\|SkipEndIcon' components/icons/index.ts
test -f lib/viz/sim/types.ts       && grep -n 'export const SPEEDS' lib/viz/sim/types.ts
test -f lib/viz/driver.ts          && grep -n '^export' lib/viz/driver.ts
```

The fourth command is the one that matters. Read the driver's real exports and reconcile them with the seam in "Contract and invariants" before writing a line of the component.

### Step 2 — `app/regions/TransportBar.tsx`

```tsx
'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { PauseIcon, PlayIcon, SkipEndIcon, SkipStartIcon } from '@/components/icons'
import { SPEEDS } from '@/lib/viz/sim/types'
import { getVizTransport } from '@/lib/viz/driver'
import type { TransportBarProps } from './_contract'
import styles from './TransportBar.module.css'

// The single driver contact point. A rename upstream is a one-line change here.
const transport = getVizTransport()

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

export type FreshnessTone = 'ok' | 'warn' | 'dim'

export interface FreshnessReadout {
  readonly label: string
  readonly tone: FreshnessTone
  readonly title: string
}

export function freshness(
  generatedAtISO: string | null | undefined,
  nowMs: number | null,
): FreshnessReadout | null {
  if (!generatedAtISO) return null
  const generatedMs = Date.parse(generatedAtISO)
  if (Number.isNaN(generatedMs)) return null
  const title = `data generated ${generatedAtISO}`
  if (nowMs === null) {
    return { label: `generated ${generatedAtISO.slice(0, 10)}`, tone: 'ok', title }
  }
  const age = Math.max(0, nowMs - generatedMs)
  if (age < HOUR_MS) return { label: 'fresh · <1h ago', tone: 'ok', title }
  if (age < DAY_MS) {
    return { label: `fresh · ${Math.floor(age / HOUR_MS)}h ago`, tone: 'ok', title }
  }
  const days = Math.floor(age / DAY_MS)
  if (days < 7) return { label: `${days}d ago`, tone: 'warn', title }
  return { label: `stale · ${days}d ago`, tone: 'dim', title }
}

export default function TransportBar({ id, className, style }: TransportBarProps) {
  const snap = useSyncExternalStore(
    transport.subscribe,
    transport.getSnapshot,
    transport.getServerSnapshot,
  )

  // I-5: the clock is read only after mount, so SSR and first hydration agree.
  const [nowMs, setNowMs] = useState<number | null>(null)
  useEffect(() => {
    setNowMs(Date.now())
    const handle = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(handle)
  }, [])

  // I-1/I-2: scoped to this subtree. No window listener, ever.
  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== ' ' && event.key !== 'Spacebar') return
    if ((event.target as HTMLElement).tagName === 'BUTTON') return // native activation
    event.preventDefault()
    transport.toggle()
  }, [])

  const maxDay = Math.max(0, snap.dayCount - 1)
  const pct = maxDay === 0 ? 0 : (snap.dayIndex / maxDay) * 100
  const birthPct =
    snap.birthDayIndex < 0 || maxDay === 0 ? null : (snap.birthDayIndex / maxDay) * 100
  const speed = SPEEDS[snap.speedIndex] ?? SPEEDS[0]
  const fresh = freshness(snap.generatedAt, nowMs)
  const idle = !snap.ready || undefined

  return (
    <div
      id={id}
      className={[styles.bar, className].filter(Boolean).join(' ')}
      style={style}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        className={styles.play}
        aria-label={snap.playing ? 'Pause playback' : 'Resume playback'}
        aria-pressed={snap.playing}
        aria-disabled={idle}
        onClick={() => snap.ready && transport.toggle()}
      >
        {snap.playing ? <PauseIcon size={11} /> : <PlayIcon size={11} />}
      </button>

      <div className={styles.seekWrap}>
        <input
          type="range"
          className={styles.seek}
          min={0}
          max={maxDay}
          step={1}
          value={snap.dayIndex}
          aria-label="Seek through the contribution history"
          aria-valuetext={
            snap.ready
              ? `${snap.dateLabel} · day ${snap.dayIndex + 1} of ${snap.dayCount}`
              : 'no data loaded'
          }
          aria-disabled={idle}
          onChange={(event) => transport.seekToDay(event.currentTarget.valueAsNumber)}
          style={{ '--kw-seek-pct': `${pct}%` } as CSSProperties}
        />
        {birthPct !== null && (
          <span
            aria-hidden="true"
            className={styles.birth}
            style={{ '--kw-seek-birth-pct': `${birthPct}%` } as CSSProperties}
          />
        )}
      </div>

      <button
        type="button"
        className={styles.jump}
        aria-label={`Jump to the start of the window, ${snap.windowStartLabel}`}
        aria-disabled={idle}
        onClick={() => transport.seekToDay(0)}
      >
        <SkipStartIcon size={11} />
        {snap.windowStartLabel}
      </button>

      {snap.birthDayIndex >= 0 && (
        <button
          type="button"
          className={styles.jumpBirth}
          aria-label="Jump to agent initialization"
          onClick={() => transport.seekToDay(snap.birthDayIndex)}
        >
          <span aria-hidden="true" className={styles.mark}>
            ◆
          </span>
          init
        </button>
      )}

      <button
        type="button"
        className={styles.jumpLive}
        aria-label="Jump to the most recent day"
        aria-disabled={idle}
        onClick={() => transport.seekToDay(maxDay)}
      >
        <SkipEndIcon size={11} />
        live
      </button>

      <button
        type="button"
        className={styles.speed}
        aria-label={`Playback speed: ${speed} days per second. Activate to change.`}
        aria-disabled={idle}
        onClick={() =>
          transport.setSpeedIndex((snap.speedIndex + 1) % SPEEDS.length)
        }
      >
        {speed} days/sec
      </button>

      {fresh !== null && (
        <span className={styles.pill} title={fresh.title}>
          <span aria-hidden="true" className={`${styles.dot} ${styles[fresh.tone]}`} />
          {fresh.label}
        </span>
      )}
    </div>
  )
}
```

Five things that bite here:

- **`tsconfig.json` sets `noUncheckedIndexedAccess: true`.** `SPEEDS[snap.speedIndex]` is `4 | 8 | 12 | 20 | 32 | undefined`; `SPEEDS[0]` on the `as const` tuple is the literal `4` and needs no guard. The `?? SPEEDS[0]` above is required, not defensive noise.
- **The `--kw-seek-pct` custom property needs the `as CSSProperties` cast.** React's `CSSProperties` does not index custom properties; the cast is the standard escape and is used in exactly the two places above.
- **`aria-disabled={idle}` where `idle` is `true | undefined`.** Passing `false` would emit `aria-disabled="false"`, which is legal but noisy; `undefined` omits the attribute.
- **`◆` is `U+25C6` and stays as text** per DEC-004 — it is not in KW-004's nine-icon set. It is outside the shipped `latin` subset's `cmap` (C-28) and renders from the `ui-monospace, SFMono-Regular, Menlo, monospace` fallback stack; it is decorative and `aria-hidden`, so that is accepted.
- **`getVizTransport()` is called at module scope, not in render.** One transport per module instance, which is what makes `subscribe`/`getSnapshot` referentially stable across renders.

### Step 3 — `app/regions/TransportBar.module.css`

A CSS Module rather than a global rule because `::-webkit-slider-thumb` and `::-moz-range-thumb` cannot be expressed as an inline `style`, and because `app/globals.css` and `styles/**` belong to KW-003 (DEC-005). The module is scoped to this file and cannot collide with the global layer.

```css
/* app/regions/TransportBar.module.css
   Geometry verbatim from docs/design/kevinweaver.dev.dc.html:105.
   Every colour is a design-system token; no literal hex in this file. */

.bar {
  flex: 0 0 auto;
  height: 38px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  background: var(--surface-bar);            /* --bg1 #3c3836 */
  border-top: 2px solid var(--border-hard);  /* --bg-h #1d2021 */
  font-size: 11px;
}

.play {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 800;
  width: 26px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--aqua);   /* --bg-h on --aqua = 7.79:1 */
  color: var(--bg-h);
  border: none;
  border-radius: var(--r-chip);
  cursor: pointer;
}

.seekWrap {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
}

/* 1px --fg4 border: 4.171:1 against the bar, 5.898:1 against the track
   interior. Both clear the 3:1 WCAG 1.4.11 non-text threshold, which the
   comp's bare --bg-h-on--bg1 track (1.414:1) does not. */
.seek {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 8px;
  margin: 0;
  border: 1px solid var(--fg4);
  border-radius: 4px;
  box-shadow: var(--shadow-inset-track);
  cursor: pointer;
  background: linear-gradient(
    90deg,
    var(--aqua-d) 0,
    var(--aqua) var(--kw-seek-pct, 0%),
    var(--bg-h) var(--kw-seek-pct, 0%),
    var(--bg-h) 100%
  );
}

.seek::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 4px;
  height: 16px;
  border: none;
  border-radius: 2px;
  background: var(--fg0);
}

.seek::-moz-range-thumb {
  width: 4px;
  height: 16px;
  border: none;
  border-radius: 2px;
  background: var(--fg0);
}

/* Purple agent-birth tick, decorative. 5.975:1 against the track interior. */
.birth {
  position: absolute;
  top: 50%;
  left: var(--kw-seek-birth-pct, 0%);
  transform: translateY(-50%);
  width: 2px;
  height: 14px;
  background: var(--purple);
  pointer-events: none;
}

.jump,
.jumpBirth,
.jumpLive,
.speed {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 2px;
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  color: var(--text-dim);    /* --fg3 on --bg1 = 5.323:1, was --fg4 at 4.171:1 */
}

/* Decorative mark only. 4.226:1 clears 3:1 for non-text; the readable
   label next to it stays --text-dim. */
.jumpBirth .mark {
  color: var(--purple);
}

.jumpLive {
  color: var(--aqua);        /* 5.511:1 */
}

.speed {
  font-weight: 700;
  min-width: 82px;
  justify-content: flex-end;
  text-align: right;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-dim);
  font-weight: 700;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: block;
}

.ok   { background: var(--green); }   /* 5.618:1 */
.warn { background: var(--yellow); }  /* 6.837:1 */
.dim  { background: var(--fg3); }     /* 5.323:1 — NOT --fg4, which is 4.171:1 */
```

The `:focus-visible` ring is deliberately absent: KW-003 owns the global focus layer and applies it to every focusable element. Do not add a local ring; verify the global one lands on all six controls and file a KW-003 follow-up if it does not.

### Step 4 — the residue removal in `lib/viz/render/ribbon.ts`

Run the census first, from the repository root:

```bash
grep -rniE 'bomberman|drawgame|walkable|userplay|boomat|\bbot\b|the board the game' \
  app components lib scripts e2e test 2>/dev/null
```

Delete every hit inside `lib/viz/render/ribbon.ts`. If the grep is already empty — the likely outcome, because KW-022 ported `drawRibbon` 571–636 and had no reason to port `drawGame` 637–684 — the diff for this file is empty and that is the correct result; say so explicitly in the PR body. Hits in **any other file** are a sibling's problem: report them, do not fix them.

What must survive the edit, verified against the comp:

- the ribbon geometry object built at comp:577 (`{ left, top, step, cell, cw, weeks }`) — `hover()` at comp:687 and KW-025's tooltip depend on it;
- the `this.live` breathing ring at comp:620–626 (`strokeRect` at `rgba(184,187,38, …)`), which DEC-014 explicitly keeps;
- the agent-birth column and `◆ agent initialized` label at comp:627–631.

Then confirm the keyboard census across the whole tree:

```bash
grep -rn "addEventListener('keydown'\|addEventListener(\"keydown\"" app components lib
```

Zero hits is the target. A React `onKeyDown` prop is not a `window` listener and does not appear in that grep.

### Step 5 — `app/regions/TransportBar.test.tsx`

`react-dom/server` is used deliberately: `react-dom@19.2.8` is already installed by KW-001, so the test needs no jsdom, no `@testing-library/react` and no `@vitest/browser` project, and therefore adds no dependency (DEC-003). It runs in Vitest's plain `node` environment.

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TransportBar, { freshness } from './TransportBar'

describe('freshness', () => {
  const gen = '2026-07-31T06:17:00Z'
  const at = (iso: string) => Date.parse(iso)

  it('renders nothing when the payload carries no generatedAt', () => {
    expect(freshness(null, at('2026-07-31T12:00:00Z'))).toBeNull()
    expect(freshness('not-a-date', at('2026-07-31T12:00:00Z'))).toBeNull()
  })

  it('states an absolute date before the clock is available', () => {
    expect(freshness(gen, null)).toEqual({
      label: 'generated 2026-07-31',
      tone: 'ok',
      title: 'data generated 2026-07-31T06:17:00Z',
    })
  })

  it('never claims the future under clock skew', () => {
    expect(freshness(gen, at('2026-07-31T00:00:00Z'))?.label).toBe('fresh · <1h ago')
  })

  it('walks ok -> warn -> dim', () => {
    expect(freshness(gen, at('2026-07-31T09:17:00Z'))).toMatchObject({
      label: 'fresh · 3h ago',
      tone: 'ok',
    })
    expect(freshness(gen, at('2026-08-02T06:17:00Z'))).toMatchObject({
      label: '2d ago',
      tone: 'warn',
    })
    expect(freshness(gen, at('2026-08-20T06:17:00Z'))).toMatchObject({
      label: 'stale · 20d ago',
      tone: 'dim',
    })
  })
})

describe('TransportBar markup', () => {
  const html = renderToStaticMarkup(<TransportBar />)

  it('emits no span or div click target', () => {
    expect(html).not.toMatch(/<span[^>]*onclick/i)
    expect(html).not.toMatch(/role="button"/i)
  })

  it('emits a real button for play/pause and a range input for seek', () => {
    expect(html).toMatch(/<button type="button"[^>]*aria-label="(Pause|Resume) playback"/)
    expect(html).toMatch(/<input type="range"[^>]*aria-valuetext="/)
  })

  it('never emits a bare control glyph', () => {
    for (const glyph of ['⏸', '▶', '⏮', '⏭']) {
      expect(html).not.toContain(glyph)
    }
  })

  it('carries no arcade residue and no fabricated live claim', () => {
    expect(html.toLowerCase()).not.toContain('bomberman')
    expect(html).not.toMatch(/>live<\/em>/)
  })
})
```

`renderToStaticMarkup` exercises `getServerSnapshot()`, so a driver that omits it fails this test rather than failing silently in production.

### Version pins

`next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `vitest@4.1.10` — all installed by KW-001 and frozen by DEC-003. This ticket installs nothing. `git status` must show no change to `package.json` or `package-lock.json`.

## Acceptance and verification

### Agent gate

- `npm run typecheck && npm run lint && npm run build` is green with the new files in place, and `git status --porcelain` shows changes only under `app/regions/TransportBar.*` and `lib/viz/render/ribbon.ts`.
- `npx vitest run app/regions/TransportBar.test.tsx` is green, including the `freshness` boundary cases at `<1h`, `3h`, `2d` and `20d` and the clock-skew case.
- `grep -rniE 'bomberman|drawgame|walkable|userplay|boomat|the board the game' app components lib scripts e2e test` returns no matches.
- `grep -rn "addEventListener('keydown'\|addEventListener(\"keydown\"" app components lib` returns no matches.
- `grep -n 'Math.random\|2600\|emitLive' app/regions/TransportBar.tsx` returns no matches, and the file contains exactly one `setInterval`, at 60000 ms, with a matching `clearInterval` in the same effect's cleanup.
- `grep -nE '<span[^>]*onClick|<div[^>]*onClick|role="button"' app/regions/TransportBar.tsx` returns no matches; the file contains exactly five `<button type="button"` occurrences plus one `<input` and no other interactive element.
- `grep -nE '\b(1826|2038|2021-08-01)\b' app/regions/TransportBar.tsx` returns no matches (DEC-008), and `grep -nE '#[0-9a-fA-F]{6}' app/regions/TransportBar.module.css` returns no matches.
- `lib/viz/render/ribbon.ts` still contains the ribbon geometry object and the live breathing-ring stroke after the edit; if the file needed no change, the PR body says so explicitly.
- `git diff --name-only origin/main...HEAD` lists no file under `app/globals.css`, `styles/`, `app/regions/Instrument.tsx`, `app/regions/BootOverlay.tsx`, `app/regions/_contract.ts`, `package.json` or `package-lock.json`.

### At-merge gate

- `ci-ok` is green on the exact PR head, on a base that includes KW-024, KW-004 and KW-005.
- The `unit` job runs `app/regions/TransportBar.test.tsx` and it passes on a clean `npm ci` — proving the test needs no dependency this branch added.
- A reviewer confirms `lib/viz/driver.ts` on the merge base actually exports the transport seam this component imports, and that `getSnapshot()` is documented as returning a stable reference between changes.
- The strip's colour pairs are checked against the table in "Context and evidence": no `--text-faint` / `--fg4` on a text node inside `app/regions/TransportBar.module.css`, and `--purple` appears only on `aria-hidden` marks.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. KW-029 owns the axe run, the reduced-motion pause-control test and the keyboard walkthrough that assert this ticket's behaviour under a real browser; KW-031 owns the frame snapshots that pin its pixels.

## Failure, security, migration, and accessibility cases

**Accessibility — the substantive risk surface, and the reason this ticket exists.**

- WCAG 2.2 SC 2.1.1 (keyboard): all six controls are natively operable. Enter and Space activate the five buttons; the range input gets Arrow, Home, End and Page Up/Down seeking from the platform at zero cost.
- SC 2.1.2 (no keyboard trap): the strip adds no focus management and no trap. Tab leaves it in document order.
- SC 2.2.2 (pause, stop, hide): the play/pause button is the site's pause control for the canvas animation. It must remain operable when `prefers-reduced-motion` is set — `reducedMotion` on the snapshot never disables the toggle. KW-029 asserts this end to end.
- SC 1.4.3 (contrast, minimum): every text node in the strip is `--text-dim` (5.323:1), `--aqua` (5.511:1) or `--bg-h` on `--aqua` (7.793:1) at 11 px, where the threshold is 4.5:1. `--fg4` at 4.171:1 and `--purple` at 4.226:1 are removed from text roles.
- SC 1.4.11 (non-text contrast): the seek track gains a 1 px `--fg4` border — 4.171:1 against the bar and 5.898:1 against the interior — because the comp's `--bg-h` track on `--bg1` is 1.414:1 and is invisible at 0 % fill. The purple birth tick is 5.975:1 against the track.
- SC 4.1.2 (name, role, value): the range input carries `aria-valuetext` built from `dateLabel` and `dayCount` so a screen reader announces "12 mar 2024 · day 940 of 1826" rather than "940". Icon-only and icon-plus-word buttons carry `aria-label`; KW-004's `IconProps` makes naming the icon instead a type error.
- Regression removed: the comp's unconditional `window` `Space` `preventDefault` (comp:478–479) blocked page-down scrolling for every keyboard user on every part of the page. Deleting it is the single largest accessibility win in this ticket.

**Failure cases.**

- **No payload yet.** `ready: false`, `dayCount: 0`. The strip renders with `aria-disabled` controls, `aria-valuetext="no data loaded"`, and no freshness readout at all. It never renders a zero, a placeholder date, or the word "live".
- **`generatedAt` absent or unparseable.** `freshness` returns `null` and the readout is omitted entirely. Rendering "fresh" without a timestamp is exactly the dishonesty DEC-014 exists to prevent.
- **Clock skew or a future `generatedAt`.** Age is clamped at zero; the label reads `fresh · <1h ago`, never a negative or future age.
- **Driver missing a capability.** A build error at `import { getVizTransport } from '@/lib/viz/driver'` is the desired failure — loud, at compile time, on the agent's own machine. Do not stub it out to make the build pass.
- **Hydration mismatch.** Prevented structurally by I-5: no clock read during render, and `getServerSnapshot()` supplies the pre-hydration state.
- **React render loop.** If the driver allocates a new snapshot object every frame, `useSyncExternalStore` re-renders at 60 Hz. Symptom: the strip is smooth but the React profiler shows continuous commits. Fix belongs in `lib/viz/driver.ts` (KW-024), not here.

**Security.** None applicable. This component reads no user input beyond a bounded integer from its own range input, issues no network request, renders no HTML from data, and touches no secret. `seekToDay` is clamped by the driver.

**Migration.** None. `app/regions/TransportBar.tsx` is a new file; there is no existing transport bar, no persisted state, and no stored user preference to migrate. The playback speed resets to the driver's default on every load, as in the comp.

## Surfaces

- Reads: docs/design/kevinweaver.dev.dc.html, docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/colors.css, docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/tokens/effects.css, app/regions/_contract.ts, components/icons/index.ts, lib/viz/driver.ts, lib/viz/sim/types.ts, tsconfig.json, package.json
- Writes: app/regions/TransportBar.tsx, app/regions/TransportBar.module.css, app/regions/TransportBar.test.tsx, lib/viz/render/ribbon.ts
- Contracts: app/regions/TransportBar.tsx
- Safety: transport keyboard bindings and page-scroll ownership, arcade-game residue removal

## Sibling boundaries and open gates

**Open gates: none.** This ticket is not blocked by any GATE-nnn. It touches no `.github/workflows/**` file (GATE-002 is irrelevant), needs no token (GATE-003), and reads no content string that GATE-005 governs.

**Upstream, and what to do while unmerged.** All three dependencies are hard blockers; do not start before they merge.

- **KW-024** produces `lib/viz/driver.ts`. This is the only genuinely uncertain seam: the shape in "Contract and invariants" is what KW-026 requires, not a name verified on disk at `e664d73a195facd64db58ba10952170ff01b4772`. Read the merged file first, reconcile, and keep all contact inside the single module-scope `getVizTransport()` call. If the driver exposes no `getServerSnapshot`, no `windowStartLabel` or no `birthDayIndex`, raise it as a KW-024 defect rather than re-deriving playback state in the region.
- **KW-004** produces `components/icons/index.ts`. Quote its consumer sketch verbatim: the accessible name goes on the `<button>`, never on the icon. `PauseIcon`, `PlayIcon`, `SkipStartIcon` and `SkipEndIcon` are the four this ticket uses; `◆` stays as text.
- **KW-005** produces `app/regions/_contract.ts`, which already declares `TransportBarProps extends RegionCommonProps` with the comment "KW-026 creates app/regions/TransportBar.tsx and mounts it in the Instrument region's Pane `footer` slot". Import the type; never redeclare or edit it.

**Same-level sibling.** KW-025 is the other level-5 ticket. It owns `app/regions/Instrument.tsx` and `components/viz/**`, and it performs the mount — `<Pane focus footer={<TransportBar />} …>`. The two write surfaces are disjoint by construction, which is what lets them run in parallel (DEC-005). Consequence to accept: if KW-025 merges first, its `footer` slot stays `null` until this ticket lands, and if this ticket merges first the component exists but is not yet on screen. Neither state is a build failure. **Do not "fix" it by editing `Instrument.tsx`.** KW-029 and KW-032 both depend on this ticket and on KW-025, and are where the composed result is verified.

**Downstream consumers.** KW-029 asserts this ticket's a11y behaviour (`axe` on `/`, the reduced-motion pause control, the keyboard walkthrough); KW-031 pins its pixels with `maxDiffPixels: 0` under `page.clock`, which is why `freshness` must be a pure function of `(generatedAtISO, nowMs)`; KW-032 verifies the assembled page in production.

**Adjacent surfaces this ticket deliberately does not touch.** The header freshness pill (comp:60–63) belongs to KW-018 — if it has already shipped one, this ticket does not remove it and does not share code with it. The boot overlay's `onSkipBoot` span (comp:184) belongs to KW-020, even though the synthesis lists it among the six unfocusable controls. The `.kw-hide-md` dead CSS rule (comp:39) belongs to KW-003's stylesheet vendoring; report it if it survived, do not delete it here.
