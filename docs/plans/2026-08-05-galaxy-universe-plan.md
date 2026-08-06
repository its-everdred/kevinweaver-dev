---
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
title: Galaxy Universe - Plan
date: 2026-08-05
---

# Galaxy Universe - Plan

## Goal Capsule

- **Objective**: Replace the hand-rolled Canvas 2D galaxy visualization with a three.js WebGL renderer that matches the reference sites (particle-simulator-webgl, galaxy-portfolio); fix the layout (man page 1/3 beside git log 2/3, contact under git log, dates format, git log font, man page overflow); make the full galaxy view drag-to-scrub or click-to-pick-day at full page width; slow playback to exactly 1 day per second with kw/AK drawing lines each day; keep the events list showing the currently highlighted day's contributions; and verify everything works end-to-end.
- **Product authority**: Operator (repo owner). Direct execution via CE loop; this plan is the HOW after the brainstorm confirmed the WHAT.
- **Open blockers**: None. The package.json freeze is explicitly lifted by the operator for adding `three` (documented override; the repo's own freeze rule says escalate when a dependency is genuinely needed).

## Product Contract

### Requirements

- R1: Render the contribution universe as a WebGL galaxy cluster where each repo is a galaxy and each file is a star, matching the visual quality of the referenced three.js galaxy demos (spiral arms, star sprites, additive glow).
- R2: Every repo renders as a visible, labeled galaxy regardless of star count (small repos are not lost next to aiur/kevinweaver-dev).
- R3: kw (actor 0) and AK (actor 1) appear as contributor nodes that travel to the current day's contributions, drawing visible lines/beams to the files each actor touched that day.
- R4: Playback advances exactly 1 day per second in forward order from the window start; forward/backward toggle and start/end jumps remain.
- R5: The full galaxy view is the scrubber: drag horizontally or click to choose a specific day; no separate "drag to scrub" preview strip. The view uses the full pane width, expanding to show multiple years on wide screens and compressing to months on mobile.
- R6: The events list shows every contribution of the currently highlighted day, synced to galaxy playback; each row links to the file on the host.
- R7: Layout: man page occupies a 1/3 pane beside the git log in a 2/3 pane; the contact ("reach me") region sits under the git log inside the 2/3 column; the git log uses the same font size as the rest of the page; the man page text is contained with visible inline overflow (scrolls), not clipped hidden.
- R8: Git log dates render as "Mmm YY - Mmm YY" (e.g. "May 2025 - present", "Sep 22 - Apr 25") per the operator's example, with role lines "Org / Title".
- R9: Everything is verified working (rendered, interactive, synced) before the PR is marked done; verification uses automated probes (pixel analysis, e2e) since the operator's environment can capture the live site.

### Session-settled decisions

- The package.json / package-lock.json freeze is lifted for this PR to add `three` (session-settled, user-directed). The operator explicitly chose "three.js + galaxy package". Research found no maintained npm galaxy package; the visual reference (galaxy-portfolio) is a full app under a personal-use license, not installable. Therefore the renderer is built on three.js directly using the standard galaxy-generator technique (Points + custom shader), and the galaxy-portfolio / particle-simulator repos serve as visual references only.
- WebGL is chosen over Canvas 2D (session-settled, user-directed). The current Canvas 2D renderer cannot reach the referenced quality.
- The `aiur-dag` package remains a self-contained, separate, embeddable package; it gains a three.js-based renderer in addition to (not replacing) its pure core. The app imports it by path (no workspace wiring).

## Implementation Units

### U1: Add three.js and a WebGL galaxy renderer in aiur-dag

- **File list**:
  - `package.json`, `package-lock.json` (add `three`; the one-time documented freeze override)
  - `packages/aiur-dag/package.json` (declare `three` as a peer/optional dependency so extraction later is clean)
  - `packages/aiur-dag/src/galaxyScene.ts` (new: three.js scene, camera, Points star fields, contributor nodes)
  - `packages/aiur-dag/src/galaxyShader.ts` (new: custom star shader with size attenuation + additive blending)
  - `packages/aiur-dag/src/universeRender.ts` (replace Canvas 2D draw with a three.js render call; keep the pure layout/contributor resolution)
  - `packages/aiur-dag/src/index.ts` (export the scene renderer)
- **Follow**: three.js `webgl_points_galaxy` example technique (Points geometry, BufferGeometry with position/color/scale attributes, ShaderMaterial with size attenuation, AdditiveBlending). Galaxy layout keeps the golden-angle sunflower from the current `galaxy.ts`.
- **Decision**: three.js `Points` per galaxy (60 points objects) vs one merged buffer. Start with one Points per galaxy for per-galaxy opacity/visibility control; merge later only if the draw call budget shows a need.
- **Tests**: `packages/aiur-dag/test/galaxyScene.test.ts` verifying the scene builds N galaxies, each with the correct star count; `galaxyShader` material uses additive blending; contributor nodes exist for the actors in the current frame.
- **Test scenarios**:
  1. Building a scene from a 3-repo snapshot yields 3 galaxy Points objects.
  2. Each galaxy Points has exactly `repo.files.length` vertices.
  3. Setting the frame to a step where actor 0 has contributions yields a kw node at the correct centroid.
  4. Empty snapshot yields zero galaxies without throwing.
  5. Scene disposal releases geometry/material resources (no leak) and stops the rAF loop.

### U2: Contributor lines + 1-day-per-second playback in the embed

- **File list**:
  - `components/viz/GalaxyUniverse.tsx` (drive the three.js scene; STEP_MS = 1000; draw kw/AK lines to current-day stars)
  - `components/viz/GalaxyUniverseIsland.tsx` (unchanged lazy gate)
  - `components/viz/galaxyTimeline.ts` (unchanged shared store; verify publish fires every step change)
- **Follow**: current `resolveContributors` + `easedContributors` easing; render lines from contributor node to each current star each frame.
- **Decision**: STEP_MS = 1000 (exactly 1 day/sec). Forward starts at day 0; backward from the newest day.
- **Tests**: extend `packages/aiur-dag/test/universeRender.test.ts`; e2e `e2e/dag.spec.ts` covers 1/sec stepping and line presence via pixel probe.
- **Test scenarios**:
  1. After 3 seconds of playback the step advanced exactly 3 (pixel probe on the date label).
  2. Forward then backward from a mid step returns to the original step.
  3. Pixel probe at an active day finds contributor-colored pixels (blue kw / purple AK) and beam-colored pixels between node and stars.

### U3: Full-view drag-to-scrub and adaptive time window

- **File list**:
  - `components/viz/GalaxyUniverse.tsx` (pointer drag-to-scrub + click-to-pick-day on the galaxy canvas; remove the separate Overview preview from the pane)
  - `app/regions/Instrument.tsx` (remove the Overview preview pane; keep Ribbon or remove per layout decision)
  - `components/viz/Overview.tsx` (keep the component file; no longer mounted in the instrument, or repurposed as the year-rule overlay)
  - `styles/kw.css` (full-width graph pane; adaptive height)
- **Follow**: existing pointer handlers in GalaxyUniverse; the current `scrubTo`-style mapping (pointer x fraction -> day index) already exists conceptually in `Overview`.
- **Decision**: the galaxy canvas itself is the scrubber: pointer-down/drag maps x to a day via the timeline; click picks a day. The overview preview strip is removed from the pane. Time window adapts: wide screens show the full multi-year span; mobile shows fewer months (the galaxy cluster naturally uses full width).
- **Tests**: e2e `e2e/dag.spec.ts` + `e2e/a11y.spec.ts` updates.
- **Test scenarios**:
  1. Dragging the galaxy canvas from left to right advances the date label monotonically.
  2. Clicking a position selects that day (date label matches the clicked fraction).
  3. The overview preview strip is no longer in the DOM (a11y canvas count drops from 3 to 2, or the strip is removed deliberately and tests updated).
  4. Mobile viewport: the galaxy canvas spans full width and the time window compresses (no horizontal scroll at 320 px).

### U4: Layout - man page 1/3, git log 2/3 with contact under it, dates format, font, overflow

- **File list**:
  - `app/page.tsx` (grid: man page 1/3 beside a 2/3 column containing git log then contact)
  - `styles/kw.css` (kw-man-log grid becomes man 1fr / (git log + contact) 2fr column)
  - `app/regions/CareerLog.tsx`, `components/ds/CommitLog.tsx` (dates "Mmm YY - Mmm YY", role "Org / Title", font size to match page)
  - `content/career-log.ts` (exact dates per operator example: May 2025 - present, Sep 22 - Apr 25, Sep 2021 - Sep 2022, Dec 2017 - Sep 2021, Mar 2014 - Dec 2017, Feb 2010 - Mar 2014)
  - `app/regions/ManPage.tsx`, `styles/kw.css` (man page text contained with visible inline overflow / scroll, not clipped hidden)
  - `app/regions/_contract.ts` (nav/region anchors unchanged; contact still has an anchor)
- **Follow**: the existing `kw-man-log` grid; the contact Pane renders under CareerLog inside the 2/3 column.
- **Decision**: dates are short month + 2-digit year per the operator's example ("Sep 22 - Apr 25"); the current role uses "present". Role lines are "Org / Title". The git log font matches `--fs-mono` (same as man page). Man page overflow: `overflow-y: auto` on the doc so text visibly scrolls.
- **Tests**: e2e smoke + a11y (grid ratio 1:2, dates render, man page scrollable, contact under git log).
- **Test scenarios**:
  1. The man page pane is 1/3 width and the git log column 2/3 on desktop; both stack on mobile.
  2. Contact renders below the git log inside the 2/3 column (DOM order + geometry).
  3. Git log rows render dates as "Mmm YY - Mmm YY" and roles as "Org / Title".
  4. The man page doc scrolls vertically when its content exceeds the pane height (overflow-y auto, not hidden).

### U5: Events list per-day sync + verification

- **File list**:
  - `components/viz/EventsTail.tsx` (verify it subscribes to galaxyTimeline and renders all current-day contributions with file links)
  - `components/viz/galaxyTimeline.ts` (unchanged)
  - `e2e/dag.spec.ts` (extend: events rows update when the galaxy day changes)
- **Follow**: current EventsTail rewrite from the previous PR; verify publish fires on step change (not every frame).
- **Tests**: e2e pixel/DOM checks.
- **Test scenarios**:
  1. At an active day the events list shows rows equal to that day's contribution count.
  2. Advancing one day changes the events rows (no stale rows from the prior day).
  3. Each event row is a link to `https://github.com/{repo}/blob/main/{file}`.

### U6: Frozen-manifest override + gate + CI

- **File list**: `package.json`, `package-lock.json` (add `three`, `@types/three` if types are needed; document the override in the PR body)
- **Follow**: the AGENTS.md escalation rule; the operator explicitly lifted the freeze for this PR.
- **Tests**: full gate `npm ci && npm run typecheck && npm run lint && npm run test && npm run build`; `npm run size`; e2e all projects; CI green.
- **Test scenarios**:
  1. `npm ci` resolves `three` without touching anything else in the lockfile beyond the three addition.
  2. Size budget holds (three.js is large; the galaxy chunk is lazy-loaded so it should not blow the first-load budget; verify `npm run size`).
  3. CI (e2e shards, verify, snapshot-provenance) all green.

## Risks / Open Questions

- **Bundle size**: three.js is ~600 kB unminified / ~150 kB gzipped. The galaxy renderer must be in the lazy island chunk (it already is via `GalaxyUniverseIsland`), so it should not affect first-load. Confirm with `npm run size` (the size-limit config measures `.next/static/chunks/**/*.js`; the lazy chunk counts toward the 295 kB total — three could push it over, requiring the galaxy chunk to be split or the budget revisited with the operator).
- **No pre-existing galaxy npm package**: verified. The renderer is built on three.js directly; galaxy-portfolio is a visual reference only (personal-use license, full app).
- **Snapshot-provenance**: no baseline PNG changes are expected (the galaxy canvas is not a driver surface with baselines), but if any baseline shifts, regenerate in the pinned container with the required commit subject.
- **Events sync timing**: `publishGalaxyTimeline` must fire once per step change, not per frame, to avoid React re-render churn. Verify.

## How This Work Fits Together

The galaxy visualization (U1-U3) is the centerpiece: three.js replaces the Canvas 2D renderer while the pure universe model (galaxy.ts, universePlayback, resolveContributors) stays intact and unit-tested. The embed (U2) drives playback at 1 day/sec and draws contributor lines. Layout (U4) reorganizes the lower panes (man 1/3, git log + contact 2/3). Events (U5) stays synced via the shared timeline store. U6 is the manifest override + gate. Order: U1 (renderer) -> U2 (playback+lines) -> U3 (scrub+width) -> U4 (layout) -> U5 (events verify) -> U6 (gate/CI).

## Sources

- Reference visuals: https://github.com/Im-Rises/particle-simulator-webgl, https://github.com/techinz/galaxy-portfolio, https://galaxym.ovh (visual targets only)
- Operator's live-site feedback (7 items) and the three.js + galaxy-package decision.
