# Agent Handoff: Galaxy Round 5

Use this as your starting context for the kevinweaver.dev galaxy-universe work.
Read it fully before touching anything, then follow AGENTS.md in the repo root
(that file is canonical and governs every rule below).

## The site

kevinweaver.dev is a Next.js App Router app deployed on Vercel, Kevin Weaver's
personal resume/dashboard. The centerpiece is an "instrument" region with four
parts: a contribution graph (GitHub-style green squares), a git-log career
table, a man-page resume, and a three.js "galaxy universe" showing every repo
as a spiral galaxy. The live site at kevinweaver.dev is what the operator looks
at; changes only matter once they reach `main` and Vercel deploys.

## Current branch and state

- Branch: `feat/galaxy-round5` (pushed to origin, tracking set).
- Base: `origin/main` at `994acc4` (round-4 merge).
- One commit on the branch: `a6e7c42 Restore GitHub green squares contribution graph`.
- Working tree is clean except for root-owned junk dirs you cannot delete:
  `playwright-report-*`, `test-results-root-*`. They are untracked; leave them.

## What the operator asked for (round 5)

Two fixes, then the operator will direct specifics. Only fix 1 is implemented.

### Fix 1 (DONE, committed as a6e7c42): contributions pane broke into lines

Symptom: the contributions pane used to be GitHub-style green squares. Round 4
rewrote `components/viz/Ribbon.tsx` into a full-width strip where every day is
a thin vertical bar (`cellW = canvas.width / dayCount`, so with ~2038 days the
whole graph is hundreds of 0.5 px lines). The operator called it "just lines"
and asked to revert to green squares.

Done in `components/viz/Ribbon.tsx`:
- Rewrote the draw loop to a real GitHub-style lattice: 7 weekday rows, one
  column per week, square cells sized to fit the pane width (capped so the
  7-row grid fits the pane height), centered. Empty days use `#504945`,
  density bands are the GitHub greens (`#0e4429`/`#006d32`/`#26a641`/`#39d353`).
- Kept the shared-clock integration: highlight outline tracks
  `getGalaxyTimeline().step`; click/drag still scrubs the timeline; the date
  pill is bottom-right; month labels are drawn from `formatDayISO(windowStart, day)`.
- Uses concrete hex colors, never CSS `var()` tokens, because the canvas 2D API
  does not resolve `var()`. (That was a round-4 bug: `fillStyle = 'var(--bg2)'`
  silently rendered black.)

Gate status for fix 1: typecheck clean; `npm run typecheck` and the
`instrument-surfaces.browser.test.ts` unit test pass. NOT yet: lint, full unit
suite, build, size, e2e. The old round-4 e2e baselines
(`e2e/__screenshots__/desktop-2x/canvas.spec.ts/ribbon-t*.png`) WILL now fail
because the ribbon pixels changed; they must be regenerated in the pinned
Playwright container (see the container rules below) with a commit subject
exactly `Regenerate visual baselines in container`. Do this as part of fix 1's
verification if you keep this branch.

### Fix 2 (DIAGNOSED, NOT implemented): galaxy shows only kevinweaver-dev and aiur

Symptom: "I still just see kevinweaver-dev and aiur only, I should see all
repos. Instead of having repos appear as they are contributed to, just render
all of them from the beginning."

Diagnosis (verified against the code and live payload):
- The payload has 60 repos (`public/data/v1/repos.json`, manifest `repoCount: 54`
  for owned + more from orgs), including 0xmetropolis/*, ConsenSys-archive/*,
  ethereum-optimism/*, its-everdred/*, etc.
- `components/viz/GalaxyUniverse.tsx:57` builds the universe from
  `viz.head.repos.map(...)` - ALL repos. `buildUniverse` -> `layoutUniverse`
  lays every repo out on a sunflower spiral. `createGalaxyScene` adds a Points
  object AND a label sprite for every galaxy. So all repos ARE in the scene.
- Why only 2 are legible: `packages/aiur-galaxy/src/galaxyScene.ts` ->
  `updateStarColors` colors each star as `currentStar` (green) if it was touched
  today, `liveStar` (blue) if touched so far in playback, else `star` (dim gray
  `0x5c6370`). On the dark background with additive blending, the dim-gray
  non-live stars are effectively invisible. Only repos with current/live
  contributions glow, which at the current day is kevinweaver-dev and aiur.
  Additionally the label sprites are small (`sprite.scale.set(1.4, 0.175, 1)`)
  and the camera at `z = 2.6` fov 60 frames a limited window, so edge galaxies
  and their labels may be off-screen or unreadable.

Fix direction (use your judgment, verify visually in a production build):
- Make every repo's galaxy and label clearly visible from step 0, independent
  of contribution state. Simplest: raise the base star color/brightness so all
  60 galaxies read as visible clusters, keep current/live stars as accents
  (brighter + colored) rather than the only visible thing.
- Frame the camera to fit the whole field. Compute the galaxy field extent
  (`(galaxy.x - 0.5) * 6`, `(galaxy.y - 0.5) * 4`, so x in [-3, 3], y in [-2, 2])
  and set `camera.position.z` (or a target/zoom) so the full cluster plus label
  margin is in view at the canvas aspect. Current `z = 2.6` is too close.
- Consider label size/positioning so 60 labels do not overlap into noise.
- "Render all of them from the beginning" is the operator's explicit direction:
  do not gate star visibility on whether a repo has contributed yet.

## Hard rules (AGENTS.md is canonical)

- npm only, exactly one lockfile (`package-lock.json`). Never yarn/pnpm.
  `package.json` and `package-lock.json` are FROZEN - do not edit, and do not
  add a dependency. Use `npm ci` not `npm install`. If you need a new dependency,
  stop and escalate; do not vendor one into `lib/`.
- Next.js App Router on Vercel stays. No Astro/Vite/Remix/other host, no
  `output: 'export'`, no infrastructure changes.
- The gate before opening a PR:
  `npm run typecheck && npm run lint && npm run test && npm run build` plus
  `npm run size` and `node scripts/ci/check-first-load.mjs`. Zero new lint
  warnings / TS errors. `npm run build` is the most important.
- Branch naming: `aiur/<issue-number>[-slug]` or keep `feat/galaxy-round5`.
  Base is `main`. Do not reconstruct the ref.
- Commit messages: 3-7 words, imperative mood, subject line only. No AI
  attribution, no `Co-Authored-By`, no ticket IDs like KW-xxx.
- Write-surface discipline: each ticket owns disjoint files; don't edit files
  another ticket owns. If you find a real defect outside your surface, report
  it, don't fix it.
- Pure logic in `lib/` must be DOM-free and unit-tested. Mock at boundaries.
  Determinism: seed RNGs, inject clocks.
- A data failure must not blank the page.
- Visual baselines must be regenerated in the pinned container only:
  `docker run --rm --ipc=host -v "$PWD":/w -w /w -e KW_IN_CONTAINER=1 mcr.microsoft.com/playwright:v1.62.1-noble sh -c "npm run build && npx playwright test --project=desktop-2x -u"`
  Any commit touching `e2e/__screenshots__/**` must have subject exactly
  `Regenerate visual baselines in container`.
- Container builds leave root-owned `.next` and `test-results`/`playwright-report`.
  Before a local rebuild, move them aside: `mv .next /tmp/stale-next-<tag>`,
  and rename `test-results`/`playwright-report` to a sibling name (in-parent
  rename works; deletion of root-owned files fails). You cannot sudo.

## Operator instruction that overrides the PR flow

The operator said: "every time i ask you to make changes, just merge them into
main because i can only see on kevinweaver.dev." So after a fix is verified
(gate green), merge it to `main` directly so the production site reflects it.
Do NOT leave work on a branch waiting for a PR review. If you opened a PR for
round 4's predecessor, that pattern still merged to main.

## Verification workflow used for this work

- Local production build + `npx next start -p <port>` + Playwright page scripts
  in `/tmp` for pixel-level verification (e.g. read canvas `getImageData`,
  screenshot regions, count non-background pixels). Dev server lazy-mounts the
  galaxy, so use a production build to see it.
- e2e: `npx playwright test` (CI runs the authoritative suite). Note: the
  `lazy-island.spec.ts` `networkidle` test is a known pre-existing flake in
  this repo (passes in isolation, times out under parallel load); CI reruns it.
- After editing the Ribbon/galaxy, re-run the canvas.spec e2e and regenerate
  baselines in the container if pixels changed.

## Files most likely to change for fix 2

- `packages/aiur-galaxy/src/galaxyScene.ts` (camera framing, base star color,
  label scale) and its test `packages/aiur-galaxy/test/galaxyScene.test.ts`.
- Possibly `components/viz/GalaxyUniverse.tsx` if you need to pass metrics.
- `packages/aiur-galaxy/src/universePlayback.ts` if "render all from the start"
  needs a playback change (it should not: the scene already contains all repos).
- Do NOT touch `components/viz/Ribbon.tsx` (fix 1, already committed) unless
  the operator directs a change to it.
