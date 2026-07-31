# kevinweaver.dev rewrite — measured findings

Date: 2026-07-31. Everything marked **(M)** was measured directly (authenticated `gh`, npm
registry, or local shell) rather than estimated or recalled. Numbers without a mark are
extrapolated from measured values.

## Contribution data (M)

Combined `its-everdred` + `its-applekid`, 2021-01-01 → 2026-07-31 (2,038 days lived):

- **10,001 total contributions** — its-everdred 8,515, its-applekid 1,486
- 1,179 active days (58% of days lived), 859 zero days
- Median active day: 3 contributions. Busiest day: **284** on 2026-05-17
- Longest gap: 46 days, ending 2022-05-03. Consistency improves sharply over time —
  the last 12 months have only 20 zero days.

`its-applekid` was created **2026-01-29** and has 1,486 contributions in ~6 months
(730 commits, 603 PRs, 129 issues, 15 reviews, 0 private). It appears mid-timeline.

### Colour scale: use log2 bands, not quantiles (M)

Quantile binning **fails** — 156 days sit at exactly 1 contribution, a mass point that
swallows 3–4 bins and leaves them empty. Log2 doubling bands give 9 live levels + zero:

| Level | Contributions | Days (5yr) |
|---|---|---|
| 0 | 0 | 859 |
| 1 | 1 | 375 |
| 2 | 2–3 | 263 |
| 3 | 4–7 | 196 |
| 4 | 8–15 | 204 |
| 5 | 16–31 | 85 |
| 6 | 32–63 | 33 |
| 7 | 64–127 | 17 |
| 8 | 128–255 | 5 |
| 9 | 256+ | 1 |

### Public/private split (M)

| Year | Total | Private |
|---|---|---|
| 2021 | 318 | 105 |
| 2022 | 233 | 86 |
| 2023 | 1,279 | 1,028 |
| 2024 | 2,454 | 2,360 |
| 2025 | 1,443 | 998 |

`restrictedContributionsCount` gives private volume with **no repo names or paths**, so the
redacted "Private repos" blob can be sourced without the backend ever fetching private
detail. Note the authenticated contribution calendar already includes private totals.

## GitHub API (M)

- **GraphQL cannot return commit file lists.** The `Commit` type has no `files` connection —
  only `changedFilesIfAvailable` (a count). PR files are available.
- **The REST 300-file commit cap is silent.** Measured on `aiur` HEAD:
  `changedFilesIfAvailable: 332` vs `files[].length: 300`. Any REST path must paginate.
- **GraphQL PR batching is nearly free:** 100 PRs aliased into one query returned 1,472 file
  paths for **rate-limit cost 1**. Limiter is nodeCount, not cost.
- `contributionsCollection` is capped at 1 year per query; cost 1 each.
- **Blobless clone beats the API outright** for owned repos:
  `git clone --filter=blob:none --no-checkout` (950 ms, 28 MB) + `git log --all --name-only`
  (14.5 s) → 3,611 commits, 25,679 file-touch events, 7,334 unique files, **0 API calls**,
  no 300-file cap.
- **Events API latency is 30s–6h**, not 5 minutes ("not built to serve real-time use cases").
  The 5-minute figure applies only to the public timeline. Caps: 300 events / 30 days.
- **User-level webhooks do not exist.** Webhooks attach to a repo, org, Marketplace/Sponsors
  account, or GitHub App. Polling is the only path for activity in others' repos.
- Authenticated conditional requests returning **304 are free** against the rate limit —
  but only with an `Authorization` header. Honor `X-Poll-Interval` (~60s, raised under load).

### Corpus size

~**2,944 public commits across ~45 public repos** over five years; `aiur-team/aiur` alone is
59%. Full file-level backfill ≈ 3,080 API calls (~3.5 min) via REST, or **0 API calls** via
clone. Daily delta: <25 rate-limit units, <10 seconds.

### Repo trees (M)

| Repo | Entries | Raw JSON | Paths-only gz | Truncated |
|---|---|---|---|---|
| aiur-team/aiur | 2,487 | 619 KB | 16.6 KB | false |
| ConsenSys/truffle | 3,003 | 795 KB | 14.9 KB | false |
| ethereum/ethereum-org-website | 51,141 | **15.2 MB** | 163 KB | **true** |

Docs claim a 7 MB limit; measurement contradicts it (15.2 MB body, still truncated). Always
check the `truncated` flag. Full trees for upstream repos are not worth their payload.

## Payload encoding (M)

Real columnar encoding of aiur's full history (16,955 events, 6,874 paths, 11 actors):

| Format | Raw | Gzipped |
|---|---|---|
| Naive `{ts, path, actor, repo}` objects | 1.84 MB | 112 KB |
| **Columnar + path dictionary + delta-encoded days** | 585 KB | **75 KB** |
| ↳ event columns alone | 148 KB | 25 KB (1.49 B/event) |
| Directory-level rollup (depth 2) | 108 KB | 2.1 KB |

**Full corpus projects to ~200–250 KB gzipped.** No chunking needed for v1. The **path
dictionary dominates**, not the event stream — optimize paths, not history. If it ever
needs splitting, split **per-repo** (matches the zoom-in interaction), not per-year.

## Netlify (2026 credit model)

Free plan is **credit-based: 300 credits/month, hard pause at zero** — all projects serve
`Site not available`, static assets included, and Free **cannot auto-recharge**. The legacy
pre-2025-09-04 plans were not force-migrated; **migration is irreversible**.

| Meter | Rate |
|---|---|
| Bandwidth | 20 credits/GB |
| Web requests | 2 cr / 10,000 |
| Functions compute | 10 cr / GB-hour |
| **Production deploy** | **15 credits each** |
| Edge function invocations | billed as requests, **no compute meter** |

Counter-intuitive consequences:

- **A page load costs ~4.7× more than three minutes of 30s polling.** Page weight is the
  lever; poll cadence is a rounding error.
- **20 production deploys exhausts the free plan with zero traffic.**
- **CDN cache hits still cost bandwidth + web requests** — a static JSON file and a cached
  function cost the same. Cache only saves *compute*. Regenerating a static file requires a
  15-credit deploy, which disqualifies the "static snapshot" approach.
- Break point ≈ **765 sessions/day**. A 50k-visitor day ≈ 470 credits — the site goes dark
  for the rest of the billing month.

Scheduled functions: all plans, 30s max, standard cron; no documented minimum interval.
Blobs: no published credit rate; ≤60s eventual propagation, `consistency: "strong"` available.

## Library decisions (M — versions/licenses verified against live npm)

- **No off-the-shelf library does circular hierarchical containment.** Cytoscape compound
  parents are **rectangles only** (`ellipse` silently coerced; ~1,200 nodes → 20 FPS).
  `@cosmograph/cosmos` reverted MIT → **CC-BY-NC-4.0 on 3.4.0, 2026-07-30**. WebCola is
  rectangles-only and unreleased since 2019. react-force-graph has no nesting concept.
- **No licensed, playable contribution-graph game exists.** `abozanona/pacman-contribution-graph`
  and `platane/snk` both have **no LICENSE file** (all rights reserved), and both are SVG/SMIL
  animation generators with AI-driven players — a code search for `keydown` in the former
  returns zero results. Build it: plain canvas + rAF, ~500 LOC, ~2 days.
- Cytoscape is **MIT** (v3.34.0) — an earlier report claiming LGPL was wrong.
- GSAP is cleared; the "no competing SaaS platforms" restriction is blog-propagated inference,
  not license text. Pin a copy of the license text with the version.

### Chosen architecture

`d3.packSiblings`/`packEnclose` for file placement in repo-local coords, `forceSimulation`
over **repos only** (~20 nodes), single Canvas 2D, GSAP tweening plain objects. **Files are
never simulation nodes** — that is what keeps it under the 2–3k-node tick ceiling regardless
of file count. Viz runtime ≈ **35 KB gzip** (vs 245 KB PIXI, 131 KB cytoscape).

Register the containment clamp **last** — d3 applies forces in registration order, so a
`collide` after it pushes nodes back out. `pack()` is not stable under insertion: sort on a
stable key and tween to new targets rather than teleporting.

## Local environment (M)

- `gh` authenticated as `its-everdred`; token scopes `repo, read:org, gist, admin:public_key`
- Tailscale up; this machine is **orangekid / 100.89.62.105** — dev server reachable at
  `http://orangekid:<port>` from any tailnet device
- Node 24.18.0, npm 11.16.0, yarn 1.22.22, pnpm 11.18.0. No Netlify CLI installed.

## Existing repo

Nothing to salvage content-wise — `Timeline.js` is unmodified Tailwind UI boilerplate with
placeholder data; `WriteCode` is commented out. Two assets are valuable:

- `public/images/kevin.png` — pixel-art avatar, the actor token. Pixel art unifies the arcade
  grid and the graph into one visual world. `its-applekid` needs a matching agent sprite.
- The `HomeHero` animated 8-stop gradient — an existing personal palette:
  `#64296d #d2869a #d75949 #dcaf4e #b7bb39 #90be7d #82a598 #126578`

**Live bug:** `package.json` says `"next": "latest"` while `package-lock.json` pins **10.1.3**
(not Next 11). Both `yarn.lock` and `package-lock.json` are committed; Netlify's detection
prefers `yarn.lock` silently. Delete both, regenerate with npm.
