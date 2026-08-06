---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
title: Galaxy Universe Round 4 - Plan
date: 2026-08-05
---

# Galaxy Universe Round 4 - Plan

## Goal Capsule

- **Objective**: Fix the 8 operator-reported issues on the shipped three.js galaxy universe: unify the current-day clock so the ribbon, galaxies, and events log all highlight the same day at 1 day/sec; make the galaxy scene render labeled, visible repos with kw/AK; move playback controls into the contributions pane; make the contributions strip full-width/adaptive; fix the events log; fix the man page (content + overflow); restore the git log's Description/Dates/Languages columns; and place the events pane at 1/6 width to the right of the galaxies.
- **Product authority**: Operator. This is a refinement round on the merged galaxy universe (PR #143).
- **Open blockers**: None.

## Product Contract

### Requirements

- R1: One source of truth for the current day: a single timeline store that the contributions highlight, the galaxy highlights, and the events log all read. Playback advances exactly 1 day/sec. The footer must not show a stale "12 days/sec" from a second clock.
- R2: The galaxy scene renders all repos as visible, labeled galaxies; kw (blue) and AK (purple) nodes appear and travel to the current day's contributions with beams.
- R3: Playback controls (pause/play, scrub, start/end) live in the contributions pane, not the galaxy pane footer.
- R4: The contributions green-square strip spans the full pane width and expands/contracts with width (multi-year on wide screens, fewer months on mobile), highlighting the current day.
- R5: The events log shows the current day's contributions, driven by the same clock as the contributions highlight and the galaxy.
- R6: Man page: text contained within the 1/3 pane (no right overflow); delete SYNOPSIS, EXIT STATUS, and SEE ALSO sections; shorten DESCRIPTION.
- R7: Git log restores Description, Dates, and Languages columns (currently dropped in the "Org / Title" rewrite).
- R8: Events pane sits at 1/6 width to the right of the galaxies pane (5/6), not stacked below.

### Session-settled decisions

- The single-source-of-truth design is settled: the galaxy timeline store becomes the one clock; the ribbon and events both subscribe to it. (user-directed: "there should only be 1 source of truth for the current day")
- three.js WebGL renderer remains (operator-approved in round 3); this round fixes its framing/labels.
- The frozen-manifest override for three.js and the deferred-JS budget raise remain in force from round 3.

## Implementation Units

### U1: Unify the current-day clock (the keystone; covers R1, R4, R5)

- **File list**:
  - `components/viz/galaxyTimeline.ts` (make it the authoritative store: `getGalaxyTimeline`, `subscribeGalaxyTimeline`, `publishGalaxyTimeline`, plus `seekGalaxyTimeline` for scrubbing)
  - `components/viz/GalaxyUniverse.tsx` (keep STEP_MS = 1000; publish step/date; stop driving a separate clock; read scrubs from the store)
  - `components/viz/Ribbon.tsx` (rewrite to render the full-width adaptive strip from the grid and highlight `getGalaxyTimeline().step`, replacing the lib/viz driver-driven 53-week window)
  - `components/viz/useRibbonInteraction.ts` (drive from galaxyTimeline, not the lib/viz driver)
  - `app/regions/TransportBar.tsx` (move to contributions pane; remove the stale "12 days/sec" SPEEDS readout; use galaxyTimeline for play/pause/scrub)
  - `app/regions/Instrument.tsx` (move TransportBar into the contributions pane; remove it from the galaxy pane footer)
- **Follow**: the existing `galaxyTimeline` store pattern; the ribbon's grid data is already in `useInstrumentRuntime` (`viz.head.grid`).
- **Decision**: `galaxyTimeline` is the single clock. `GalaxyUniverse` owns playback (advances step every 1000 ms and publishes); Ribbon and EventsTail subscribe. `seekGalaxyTimeline(step)` lets the ribbon/transport scrub. The lib/viz driver is no longer the ribbon's clock.
- **Tests**: `test/viz/galaxyTimeline.test.ts` (new: publish/subscribe/seek); e2e `e2e/dag.spec.ts` + `e2e/a11y.spec.ts`.
- **Test scenarios**:
  1. Publishing a new step notifies subscribers; publishing the same step does not re-notify.
  2. Seeking sets the step and notifies exactly once.
  3. The contributions strip highlight equals `getGalaxyTimeline().step` (pixel/DOM check).
  4. The events log day equals the ribbon highlight day and the galaxy date.
  5. The footer no longer shows "12 days/sec" (the stale lib/viz speed is gone).
  6. Playback advances exactly 1 day/sec (3 days in ~3 s).

### U2: Fix the galaxy scene framing, labels, and contributors (R2)

- **File list**:
  - `packages/aiur-galaxy/src/galaxyScene.ts` (camera framing so the full cluster is in view; contributor nodes at proper world positions; repo labels)
  - `packages/aiur-galaxy/src/galaxyShader.ts` (unchanged or minor)
  - `packages/aiur-galaxy/src/galaxy.ts` (unchanged layout; verify galaxy positions span the camera frustum)
  - `packages/aiur-galaxy/test/galaxyScene.test.ts` (extend)
- **Follow**: the round-3 scene; the official three.js galaxy example's framing.
- **Decision**: set camera distance/aspect so all galaxies fit; draw repo labels via a DOM overlay or three.js sprite per galaxy; ensure kw/AK contributor meshes are visible and move to the current-day centroid (not stuck at center). The "pink dot centered" symptom is the contributor node rendering at the camera origin with no visible galaxies/labels.
- **Tests**: package unit + e2e pixel probe.
- **Test scenarios**:
  1. The scene camera frustum contains all galaxy positions (unit test).
  2. A screenshot at an active day shows repo label pixels and both contributor colors (kw blue, AK purple), not a single centered dot.
  3. Contributor nodes move to the current-day contribution centroid across steps.

### U3: Move playback controls into the contributions pane (R3)

- **File list**:
  - `app/regions/Instrument.tsx` (TransportBar inside the contributions Pane, above the Ribbon)
  - `app/regions/TransportBar.tsx` (control galaxyTimeline; remove SPEEDS readout)
  - `styles/kw.css` (contributions pane gains the transport strip; galaxy pane footer removed)
- **Follow**: Pane composition in `Instrument`.
- **Decision**: TransportBar moves to the contributions pane; it toggles pause/play and scrubs via `seekGalaxyTimeline`. The stale speed display is removed (or shows a static "1 day/sec").
- **Tests**: e2e a11y + smoke (control visible in contributions pane, not galaxy footer).
- **Test scenarios**:
  1. Pause/play button is inside the contributions pane (DOM geometry).
  2. The galaxy pane footer no longer contains the transport.
  3. Toggling pause stops the date from advancing; resume continues.

### U4: Full-width adaptive contributions strip (R4)

- **File list**:
  - `components/viz/Ribbon.tsx` (rewrite to render the full grid compressed to pane width, highlight current day, no fixed 53-week cap)
  - `styles/kw.css` (ribbon container spans pane width; height adapts)
- **Follow**: the removed Overview's full-window scaling approach; the ribbon's grid data.
- **Decision**: the strip renders all `dayCount` days across the pane width (expand/contract with width); the current day is highlighted from `galaxyTimeline`.
- **Tests**: e2e canvas/geometry checks at desktop and mobile widths.
- **Test scenarios**:
  1. At 1280 px the strip shows multiple years; at 320 px it compresses (no horizontal scroll).
  2. The highlighted column tracks `getGalaxyTimeline().step`.

### U5: Events log shows current-day contributions (R5)

- **File list**:
  - `components/viz/EventsTail.tsx` (verify it renders rows from `galaxyTimeline().step`; fix if empty)
- **Follow**: round-3 EventsTail (subscription already present).
- **Decision**: the empty-log symptom is the desync (the galaxy publishes to galaxyTimeline but the ribbon/driver clock confused the day). After U1 unifies, verify rows populate for active days.
- **Tests**: e2e DOM checks.
- **Test scenarios**:
  1. At an active day, the events list shows that day's contributions.
  2. Advancing one day updates the rows.

### U6: Man page content + overflow (R6)

- **File list**:
  - `content/manpage.ts` (delete SYNOPSIS, EXIT STATUS, SEE ALSO; shorten DESCRIPTION)
  - `app/regions/ManPage.tsx` (CSS: text wraps within the 1/3 pane, no right overflow)
- **Follow**: round-3 man page CSS.
- **Decision**: keep NAME, DESCRIPTION (shortened), OPTIONS, AUTHOR. The overflow fix already reduced `min-width` to 0; ensure `white-space` allows wrapping in the 1/3 pane.
- **Tests**: e2e smoke + a11y; man page text route.
- **Test scenarios**:
  1. The man page has no horizontal scrollbar at 414 px pane width.
  2. SYNOPSIS, EXIT STATUS, SEE ALSO are absent; DESCRIPTION is shorter.
  3. The text/kevinweaver.1 route reflects the reduced content.

### U7: Restore git log Description, Dates, Languages columns (R7)

- **File list**:
  - `components/ds/CommitLog.tsx` (table with Organization, Role, Dates, Description, Languages columns)
  - `content/career-log.ts` (dates already "Mmm YY - Mmm YY"; stack present)
- **Follow**: the round-1 CommitLog table before the "Org / Title" rewrite.
- **Decision**: render a table with columns for org/role, description, dates, and languages, keeping the improved "Mmm YY - Mmm YY" date format. The round-3 "Org / Title" two-line list is replaced by the fuller table.
- **Tests**: e2e smoke + a11y.
- **Test scenarios**:
  1. The git log renders Description, Dates, and Languages columns.
  2. Dates use "Mmm YY - Mmm YY" format.
  3. No click-to-expand (all rows visible).

### U8: Events pane at 1/6 width to the right of galaxies (R8)

- **File list**:
  - `app/regions/Instrument.tsx` (kw-lower: galaxies 5/6, events 1/6, side by side)
  - `styles/kw.css` (`.kw-lower` grid/flex to 5fr 1fr)
- **Follow**: round-3 `.kw-lower` (currently column-stacked).
- **Decision**: galaxies pane flex 5, events pane flex 1, side by side at desktop; stack on mobile.
- **Tests**: e2e geometry check.
- **Test scenarios**:
  1. At 1280 px, galaxies ~5/6 width and events ~1/6 width, side by side.
  2. At 320 px they stack.

### U9: Gate + CI + review

- **File list**: all above.
- **Tests**: full gate `npm run typecheck && npm run lint && npm run test && npm run build`; `npm run size`; first-load budget; e2e all projects; ce-code-review.
- **Test scenarios**:
  1. Typecheck, lint, unit (300+), build, size, first-load all green.
  2. e2e all pass.
  3. Code review finds no new regressions.

## Risks / Open Questions

- **Ribbon rewrite coupling**: replacing the driver-driven Ribbon with a galaxyTimeline-driven one touches `useCanvasSurface`/`useRibbonInteraction`. Verify the a11y text-equivalent (ContributionTable) still works and the canvas still exposes a name.
- **Bundle budget**: the round-3 raises (deferred 115 kB, size 320 kB) must hold; no new large deps.
- **Man page overflow**: ensure `white-space` wrapping in the 1/3 pane; verify with the actual pane width.
- **Events emptiness**: if rows remain empty after U1, the day mapping (newest-relative vs absolute) needs a targeted check.

## How This Work Fits Together

U1 is the foundation (single clock), enabling U3 (controls move), U4 (strip highlight), and U5 (events sync). U2 fixes the galaxy scene visual. U6-U8 are independent content/layout fixes. U9 is the gate. Order: U1 -> U2 -> U3 -> U4 -> U5 -> U6 -> U7 -> U8 -> U9.

## Sources

- Operator feedback (8 items) on the merged galaxy universe (PR #143).
- Existing plan: `docs/plans/2026-08-05-galaxy-universe-plan.md`.
