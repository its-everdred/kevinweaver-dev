# Executor authority envelope — kevinweaver.dev site rewrite

Recorded before any mutation, per `aiur-run/references/executor.md` §"Establish the
authority envelope". Answers are **reused from the operator's request**, not re-asked.

Source of authority (operator, 2026-07-31, verbatim):

> 1. fully deeply research the project, break it into tickets. 2. research all tickets,
> write docs, and create tickets. 3. drive aiur runs to have events implement all tickets.
> use /aiur-run, and background agents to /ce-code-review all PRs and merge them main.
> lets keep this as a next app so i dont have to change anything infra-wise. it's already
> connected to kevinweaver.dev. not sure if i have CI though

And (operator, 2026-07-31): *"switch agents to codex"*, clarified as *"once you run aiur,
use the model:codex tag and/or config setting"* — i.e. the fleet runs codex; the Executor's
own planning fan-out may remain on Claude.

| Decision | Value | Basis |
|---|---|---|
| Ticket scope / selector | Build Order `site-rewrite`, tickets KW-01..KW-32, repo `its-everdred/kevinweaver-dev` | goal items 1–3 |
| May create newly discovered tickets | **Yes**, bounded by the deferred-findings ledger. P0/P1 acceptance blockers may be promoted; P2/P3 and optimizations go to the ledger, not the active run. | goal item 2 ("create tickets") |
| May review and comment on PRs | **Yes** — explicitly, via background `ce-code-review` agents. | goal item 3 |
| May merge | **Yes**, to `main`. | goal item 3 ("merge them main") |
| Merge conditions | Required check `ci-ok` green on the exact PR head, `ce-code-review` run with findings resolved or explicitly dispositioned, base correct (`main`), no unresolved P0/P1. | D-12; executor.md §"Protect convergence" |
| **Wave-1 merge exception** | KW-01 and KW-02 ship the CI gate itself, so `ci-ok` cannot exist for them. The Executor merges these two on **verified-local-green evidence**: `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` executed and observed by the Executor, plus `ce-code-review`. Every subsequent ticket requires the real `ci-ok` status. | HG-6, corrected — this was previously and wrongly recorded as a human gate |
| May self-fix / take over worker tickets | **Yes**, under the bounded conditions in executor.md §"takeover": repeated no-progress cycles, unowned ticket, or a worker that cannot merge safely. Takeover is for fast safe convergence, not for making the Executor the default worker. | executor.md |
| Starting / max concurrency | Start 1 (aiur's ramp governor), max **8** (`.aiur/config: max_concurrent_agents`). Deliberately below the aiur-repo fleet's 32 because both share this 16-core host. | `.aiur/config` |
| Reporting cadence | Event-driven wakes plus a full status poll hourly. | executor.md |
| Debug mode | **Not authorized** — not requested. | default-deny |

## Escalate, do not decide

Per executor.md, these remain the operator's: product changes, architecture changes, scope
cuts, destructive actions, and anything outside the above.

Currently escalated and **open**:

- **HG-2** — `workflow` scope missing from the push credential. Blocks KW-01/23/28/31 at
  *push* time, after the work is done. Operator action: `gh auth refresh -s workflow`.
- **HG-3** — SSO-authorized PAT for `ethereum-optimism` as repo secret `CONTRIB_TOKEN`.
  Without it every grid figure publishes ~3,299 low across 2025-26.
- **HG-4** — Vercel dashboard: Node version, plan tier, auto-promotion, and whether a
  Root-Directory / build-command / install-command override exists. A dashboard override
  silently defeats `vercel.json`.
- **HG-5** — content facts no measurement can settle (email, Twitter handle, job title,
  whether the side-project lane appears, podcast name, availability string).
- **HG-7** — scanline treatment: persisted toggle vs dropping `--scanline-opacity` to .20.

Closed:

- **HG-1** — origin was SSH and SSH was broken. Switched to HTTPS via the `gh` credential
  helper; `main` now carries the design system, research, and `.aiur/`. **Closed 2026-07-31.**
- **HG-6** — was recorded as "operator must hand-merge wave 1". **Wrong**: the Executor holds
  review and merge authority. Reclassified above as a merge *condition*, not a human gate.
  **Closed 2026-07-31.**

## Terminal condition

The run ends when KW-01..KW-32 are merged to `main`, the site builds and deploys green on
Vercel, and the feature-acceptance capstone ticket passes. Discovered work goes to the
deferred ledger rather than extending this boundary.
