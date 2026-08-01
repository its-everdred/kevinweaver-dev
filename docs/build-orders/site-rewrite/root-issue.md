# Build Order: kevinweaver.dev site rewrite

> Approved planning authority: [`<APPROVED_SHA>`](https://github.com/its-everdred/kevinweaver-dev/commit/<APPROVED_SHA>)

<!-- aiur-planning-issue
{"schema":2,"logical_id":"its-everdred/kevinweaver-dev:site-rewrite","plan_version":1,"approved_planning_commit":"<APPROVED_SHA>"}
-->

## Scope

### Objective

Rebuild `kevinweaver.dev` as a Next.js App Router application on a currently supported
toolchain, partitioned into the seven independent regions of the approved design comp, with
every repository and contribution figure derived from measured GitHub data at generation
time rather than written as a literal.

The repository has not been pushed since 2021-05-31. The tree at the researched commit is a
`create-next-app --example with-tailwindcss` scaffold — Next 10.1.3, React 17, Tailwind 2,
ESLint 7, Pages Router — and it **cannot build on any Node runtime Vercel offers**. Node
16.20.2 succeeds; 20.19.5, 22.14.0 and 24.18.0 all fail identically inside PostCSS during
config load. That measurement is the reason the toolchain moves as one atomic change.

Planning evidence is pinned at `e664d73a195facd64db58ba10952170ff01b4772` and browsable at
`/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/`.

### Non-goals

- No infrastructure change. The project stays on Vercel and stays connected to the existing
  domain; no new hosting, no new CDN, no new framework.
- No static export. `output: 'export'` is rejected on `headers` for JSON cache-control and
  remote-avatar optimization.
- No live event transport. The freshness signal survives as an honest `generatedAt`-driven
  pill; the synthesised "live" event stream does not.
- No Vercel Cron. Scheduled regeneration runs on GitHub Actions.
- No merge queue. It is structurally unavailable on a User-owned repository.
- No phone number in the repository or the build output.

### Boundary

- **32 tickets**, `KW-001` through `KW-032`, one document each under
  `docs/build-orders/site-rewrite/tickets/`.
- **70 hard `depends_on` edges**, zero `serializes_with` pairs. Every same-wave ticket owns a
  disjoint write surface, so the graph parallelises without serialization edges.
- **5 workstreams**: `platform`, `chrome`, `content`, `data`, `viz`.
- **11 requirements** (`REQ-001`…`REQ-011`), all dispositioned to tickets.
- **17 decision records** (`DEC-001`…`DEC-017`), all accepted and all cited by at least one
  ticket.
- **7 external gates** (`GATE-001`…`GATE-007`), of which 5 are open.

### Wave profile

Computed from the dependency graph as longest-path levels: **2 / 10 / 11 / 3 / 2 / 3 / 1**.

| Wave | Tickets | Count | Theme |
|---|---|---|---|
| 1 | KW-001, KW-002 | 2 | Toolchain re-scaffold, green CI gate, repository governance |
| 2 | KW-003 … KW-012 | 10 | Design system, fonts, app shell, content, viz contract, pipeline A/B, test scaffolding, bundle codec |
| 3 | KW-013 … KW-023 | 11 | Pipeline C/D, bundle loader, five rendered regions, sim reducer, render modules, browser gate |
| 4 | KW-024, KW-027, KW-028 | 3 | Viz driver, SEO and text routes, scheduled data workflow |
| 5 | KW-025, KW-026 | 2 | Instrument pane and lazy viz island, transport controls |
| 6 | KW-029, KW-030, KW-031 | 3 | Accessibility gate, performance budgets, visual-regression baselines |
| 7 | KW-032 | 1 | Capstone: full-page integration and production deploy verification |

### Critical path

`KW-001` → `KW-008` → `KW-022` → `KW-024` → `KW-025` → `KW-029` → `KW-032`

Foundation → viz contract → render modules → driver → instrument pane → accessibility gate →
capstone.

Seven nodes. The graph holds twelve distinct seven-node chains; this one is a
maximum-complexity chain at **21 of the plan's 77 points**. It ties on weight with the chain
that substitutes `KW-031` (visual-regression baselines) for `KW-029`, so wave 6 has two
equally paced terminal gates rather than one. The first five nodes are shared by every
maximum-weight chain and are the segment that actually paces the run.

### Human gates

| Gate | Was | Blocks | Status |
|---|---|---|---|
| `GATE-001` | HG-1 | Everything — agents clone `main` | **Closed 2026-07-31.** `origin` switched from SSH to HTTPS through the `gh` credential helper; `main` now carries the design system, research and `.aiur/`. |
| `GATE-002` | HG-2 | KW-001, KW-023, KW-028, KW-031 | **Open.** Push credential scopes are `admin:public_key, gist, read:org, repo` — no `workflow`. GitHub rejects any HTTPS push touching `.github/workflows/**`, and it fails at push time, after the work is done. |
| `GATE-003` | HG-3 | KW-010, KW-014, KW-028 | **Open.** Needs an SSO-authorized PAT with `read:user`, authorized for `ethereum-optimism`, stored as repository secret `CONTRIB_TOKEN`. Without it the API returns empty results instead of errors and the site publishes figures ~3,299 low across 2025-26. |
| `GATE-004` | HG-4 | KW-001 deploy verification, KW-032 | **Open.** Dashboard-only facts: Vercel Node version, plan tier, auto-promotion, and whether a Root-Directory / build-command / install-command override exists. An install-command override silently defeats `vercel.json`. |
| `GATE-005` | HG-5 | KW-006, transitively KW-016, KW-017, KW-019, KW-027, KW-032 | **Open.** Content facts no measurement can settle: Twitter handle, which email ships, job title, whether the side-project lane appears, podcast naming, and the contact availability string. |
| `GATE-006` | HG-6 | KW-001, KW-002 only | **Closed 2026-07-31.** Reclassified from a human gate to a merge *condition*: the CI gate ships in the pull requests that would need it, so wave 1 merges on verified-local-green evidence plus code review. Every later ticket requires the real `ci-ok` status. |
| `GATE-007` | HG-7 | KW-003 | **Open.** Scanline treatment: a persisted user toggle, or drop `--scanline-opacity` from .35 to .20. The always-on scanline drags five borderline contrast pairs across the AA line. |

Two of seven are closed. `GATE-002` is the one to clear first: it is the only gate whose
failure mode is silent until push time, on the very first ticket in the graph.

### Terminal condition

The run ends when `KW-001` through `KW-032` are merged to `main`, the site builds and
deploys green on Vercel, the production origin is verified live serving that build, and the
`KW-032` capstone's acceptance evidence is recorded. Discovered work goes to the
deferred-findings ledger rather than extending this boundary.
