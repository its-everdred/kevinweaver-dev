---
title: Galaxy Single Disc - Plan
type: feat
date: 2026-08-06
topic: galaxy-single-disc
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Galaxy Single Disc - Plan

## Goal Capsule

- **Objective.** Replace the 60 scattered per-repo galaxies with one spiral galaxy covering the full GitHub history, where radius encodes recency, every file is a star that lights permanently when a contributor touches it, and the camera is user-controllable on desktop and touch.
- **Product authority.** The operator (Kevin Weaver). The live site at kevinweaver.dev is the only surface that counts; work reaches it by merging to `main`.
- **Open blockers.** Two budget conflicts must be resolved before implementation lands: the first-byte data payload has 479 bytes of headroom against a hard CI gate that full history will exceed, and the deferred-JS island chunk has 4,750 bytes of headroom against the camera-control and single-disc additions. See Outstanding Questions.

---

## Product Contract

### Summary

One spiral galaxy for the whole GitHub history: this week's work in the bright core, 2019 projects on the outer arms, every file a star that lights permanently the moment `kw` or `ak` zaps it. All repos stay labeled, and the viewer can rotate and zoom the disc.

### Problem Frame

The galaxy currently renders as 60 separate spiral galaxies scattered on a 6x4 rectangle. Two of them glow; the other 58 are invisible. The operator has reported this three rounds running as "I still just see kevinweaver-dev and aiur only."

Three independent causes produce that single symptom, and only the first has been correctly identified before now.

The dominant cause is data, not rendering. The instrument runtime boots by fetching one event chunk and nothing pumps the remaining 37. The scene therefore contains 2 repos and 507 file-stars out of 60 repos and 16,206 file-stars. Roughly 3% of the data has ever reached the page. No amount of color or camera work makes the other 58 repos appear, because they are not in the scene.

The second cause is contrast. Stars that no contribution has touched render at `0x5c6370` on a `0x1d2021` background under additive blending, which is effectively invisible. Only repos with a contribution at the current playback step are legible.

The third cause is framing and scale. Each galaxy's stars span two world units while galaxy centers span six by four, so the clusters overlap into a single smear; the camera at `z = 2.6` frames a fraction of even that.

Underneath the symptom is a representational problem the current design cannot solve. File counts per repo range from 1 to 7,449, with a median of 25. `aiur-team/aiur` alone holds 46% of every star. Any layout that sizes or places a repo by its volume gives one repo the whole frame.

### Key Decisions

- **One continuous disc, not 60 galaxies.** The universe renders as a single spiral galaxy whose arms are made of every repo's stars; repos read as density clumps along the arms rather than as separate objects. Directional sketches against real data showed the per-repo-galaxy shape degenerates into overlapping mush at 60 repos, while the continuous disc reads unmistakably as one galaxy. (session-settled: user-directed — chosen over discrete per-repo galaxies and over a solar-system treatment: the disc is the only variant that stays coherent at this repo count.)

- **Radius encodes recency, not size.** A repo's distance from the galactic center is set by its most recent activity: the newest work sits in the core, the oldest on the rim. This makes the galaxy readable as a timeline at a glance and defuses the `aiur` dominance problem, because volume no longer buys position. (session-settled: user-directed — chosen over size-ordered or hash-scattered placement: "cluster the most recently active repos near the center... older projects further out on arms".)

- **Every repo is labeled, always; collisions are acceptable.** Legibility of the full repo set outranks a clean frame. Recency ordering spreads labels radially, which limits collisions in practice, but overlap is explicitly tolerated rather than solved by hiding labels. (session-settled: user-directed — chosen over labeling only the largest repos or only the repos active on the current day: "all repos, colliding is okay".)

- **Zapped stars stay bright forever.** A star's brightness is cumulative history, not current state. Unzapped stars are dim but visible; a contribution promotes a star permanently. The playback therefore paints a brightening galaxy rather than a blinking one. (session-settled: user-directed — "stars should glow brighter once zapped, lets leave them bright".)

- **Drag rotates the camera, so scrubbing leaves the canvas.** The galaxy canvas currently maps a pointer's absolute x position to an absolute day index, so any press teleports the timeline. Camera drag and position-mapped scrubbing cannot share one surface. Seeking moves to the contribution graph, which already writes the shared timeline store. This is the one decision in this contract the operator has not explicitly ratified.

### Actors

- A1. `kw` — the human contributor (`its-everdred`), actor id 0. Rendered as a moving node that fires beams at the files committed on the current day.
- A2. `ak` — the agent contributor (`its-applekid`), actor id 1. Same behavior, distinct color.
- A3. The viewer — reads the galaxy, controls the camera, and seeks the timeline.

### Requirements

**Galaxy structure**

- R1. The universe renders as a single spiral galaxy with a dense core and sweeping arms, not as multiple discrete galaxies.
- R2. A repo's radial position is a function of its most recent contribution date: the most recently active repo sits nearest the center and the least recently active sits nearest the rim.
- R3. Every repo's stars are distributed along the arm at that repo's radius, smeared enough radially and angularly that adjacent repos blend into a continuous arm rather than forming a visible concentric ring.
- R4. Every file in every repo is a star in the scene, with no per-repo cap that silently drops files.
- R5. Every repo carries a text label positioned at its arm segment, rendered at all times regardless of contribution state. Label overlap is acceptable and must not trigger hiding or culling.
- R6. Star placement is deterministic: the same input data produces byte-identical geometry across renders, with no `Math.random` and no wall-clock input.

**Contribution playback**

- R7. A star that no contribution has touched renders visibly against the background — dim relative to a zapped star, but distinguishable from empty space.
- R8. A star that any contribution has touched at or before the current step renders permanently brighter than an untouched star, and does not revert as playback advances.
- R9. On each step, each actor with contributions that day renders a beam from its node to each file-star it touched, in that actor's color.
- R10. Every contribution on a step produces a beam. If a beam budget is imposed for performance, exceeding it must surface rather than silently drop beams.
- R11. Contributor nodes move to reflect where each actor is working on the current step.

**Camera and interaction**

- R12. On touch, the viewer can pinch to zoom and drag to rotate the galaxy.
- R13. On pointer devices, the viewer can drag to rotate, and zoom via on-screen controls.
- R14. A user-set camera position survives a viewport resize; resize adjusts only the projection aspect.
- R15. Camera controls are reachable by keyboard, matching the mouse and touch affordances.
- R16. Zoom controls meet the 24x24 CSS pixel minimum target size enforced by the accessibility suite.
- R17. The viewer retains a way to seek the timeline after drag-to-scrub is removed from the canvas.
- R18. Under `prefers-reduced-motion: reduce`, no camera motion runs on its own; user-initiated camera changes remain available.

**Data coverage and history**

- R19. The instrument loads every event chunk, so the scene contains all repos and all file-stars rather than only the boot chunk's contents.
- R20. Loading beyond the boot chunk is progressive and must not block first paint or regress the lazy-island chunk contract.
- R21. The published data bundle covers the full GitHub history rather than a window starting in 2021.
- R22. A data-loading failure at any chunk leaves the page rendered with whatever loaded successfully; it must not blank the instrument.

**Budgets and quality gates**

- R23. The first-byte data payload stays within its 12 KiB brotli budget after the history expansion.
- R24. Total client JavaScript stays within its 320 kB brotli budget, and the deferred galaxy island stays within its 115,000 byte cap.
- R25. Per-frame work does not scale linearly with total star count on every frame; recoloring all 16,206 stars every frame is not acceptable.
- R26. Scene teardown disposes geometries, materials, and label textures.

### Key Flows

- F1. Playback advances one day
  - **Trigger:** The shared timeline clock advances to the next step.
  - **Actors:** A1, A2
  - **Steps:** The frame resolves which files each actor touched that day; each toucher's node eases toward its work; a beam is drawn from each node to each file it touched; those stars promote to permanently bright.
  - **Outcome:** The galaxy is incrementally brighter than it was the previous step, and the day's activity is legible as beams.
  - **Covered by:** R8, R9, R10, R11

- F2. Viewer inspects a region
  - **Trigger:** The viewer drags or pinches on the canvas.
  - **Actors:** A3
  - **Steps:** The camera rotates or zooms; playback continues underneath; labels remain legible at the new camera position.
  - **Outcome:** The viewer can read an arm segment's repo labels without the camera resetting.
  - **Covered by:** R12, R13, R14

- F3. Instrument boots
  - **Trigger:** The galaxy island mounts.
  - **Actors:** A3
  - **Steps:** The boot chunk paints an initial galaxy; remaining chunks load progressively; the scene grows to the full star set as they arrive.
  - **Outcome:** The viewer sees a galaxy immediately and the complete galaxy shortly after.
  - **Covered by:** R19, R20, R22

### Acceptance Examples

- AE1. Untouched repo is visible
  - **Covers R4, R5, R7.**
  - **Given** a repo whose files have never been touched in the loaded window,
  - **When** the galaxy renders at step 0,
  - **Then** that repo's stars are visible against the background and its label is readable.

- AE2. Brightness is cumulative
  - **Covers R8.**
  - **Given** a file zapped at step 100,
  - **When** playback reaches step 500 without touching that file again,
  - **Then** the star is still rendered at zapped brightness.

- AE3. Camera survives resize
  - **Covers R14.**
  - **Given** the viewer has zoomed in and rotated the disc,
  - **When** the window is resized,
  - **Then** the camera keeps its position and orientation and only the aspect ratio changes.

- AE4. Reduced motion
  - **Covers R18.**
  - **Given** `prefers-reduced-motion: reduce`,
  - **When** the instrument mounts,
  - **Then** no camera drift or inertial damping runs, and pinch, drag, and zoom controls still respond.

- AE5. Partial data failure
  - **Covers R22.**
  - **Given** one event chunk fails to load,
  - **When** the instrument renders,
  - **Then** the galaxy shows the repos from the chunks that succeeded and the page does not blank.

### Scope Boundaries

- Per-star hover, tooltips, and click-through to GitHub. Repo identity comes from always-on labels; the galaxy stays ambient.
- Repo filtering, search, or a legend.
- Changes to the contribution graph, the git-log career table, or the man-page resume beyond whatever seek affordance R17 requires.
- The `/dag` page's single-repo visualization.
- Any change to hosting, framework, or the dependency set.

### Dependencies and Assumptions

- `package.json` and `package-lock.json` are frozen. Camera controls must come from the existing `three` dependency's shipped modules or be written in-repo; adding a package is out of bounds.
- The data pipeline's default window start was already moved to 2010-01-01, but the committed bundle still carries the 2021 window. Expanding history is a bundle regeneration, not a code change — with one caveat: the private-contribution series hard-codes a month count that matches a 2010-01-01 start exactly, so a different start date fails bundle validation.
- Git event extraction already runs unfiltered over full history, so no repo re-clone is needed for the events themselves. Calendar and private-contribution series do require re-fetching from the GitHub API.
- The galaxy canvas has no unit test, no browser test, and no visual baseline today. Interaction and rendering changes ship without an existing regression net.

### Outstanding Questions

**Resolve before planning**

- How does the first-byte payload stay under 12 KiB once full history adds event chunks? The measured payload is 11,809 of 12,288 bytes, and each added chunk costs roughly 69 bytes of incompressible integrity hashes in the manifest — about seven chunks of headroom. Options include moving the integrity map out of the first-byte set, or changing chunk granularity.
- What is the playback cadence over full history? At one day per second, roughly 6,000 days is a 100-minute pass, which makes the timeline decorative rather than watchable.

**Deferred to planning**

- Whether the disc gains thickness in z, given that rotation makes a perfectly flat disc disappear edge-on.
- How star brightness is stored and updated so that per-frame cost does not scale with total star count.
- Where the timeline seek affordance lives once the canvas stops scrubbing.
- Whether camera controls come from the `three` addons directory or a minimal in-repo implementation, judged on bundle cost against the 4,750-byte island headroom.

### Sources

- `packages/aiur-galaxy/src/galaxy.ts` — current sunflower layout of galaxy centers and per-repo star spirals.
- `packages/aiur-galaxy/src/galaxyScene.ts` — scene construction, per-galaxy `Points` objects, label sprites, camera, and per-frame recolor.
- `packages/aiur-galaxy/src/universeRender.ts` — the canvas-2D renderer, which already implements contributor beams and is the closest prior art for the zap mechanic.
- `packages/aiur-galaxy/src/universePlayback.ts` — frame model carrying `liveFiles`, `currentFiles`, and `currentContributions`.
- `components/viz/GalaxyUniverse.tsx` — render loop, pointer handlers, and the `STEP_MS` cadence.
- `components/viz/galaxyTimeline.ts` — the shared clock that the contribution graph, galaxy, and transport all read.
- `scripts/pipeline/calendar.ts`, `scripts/pipeline/private.ts`, `scripts/pipeline/encode-bundle.ts` — window derivation and the month-count constraint.
- `.size-limit.json`, `scripts/ci/check-first-load.mjs` — the budget gates.
- `AGENTS.md` — determinism, reduced-motion, accessibility, and bundle-budget rules.
