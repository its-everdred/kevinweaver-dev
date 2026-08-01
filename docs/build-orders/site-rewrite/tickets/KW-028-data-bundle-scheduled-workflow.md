# KW-028 — GitHub Actions daily data workflow and first-byte budget gate

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — one workflow file and one small Node CLI over contracts that four upstream tickets have already frozen; no wire-format design, no application code, no dependency change. The cost is operational correctness — least-privilege permissions, a cache that survives a failed run, an always-commit rule, and a budget number that has to be measured rather than asserted.

**Risk:** medium — this is the only automation that keeps the site's numbers true, and both of its failure modes are silent. A workflow that stops committing lets GitHub auto-disable the schedule after 60 days; a workflow that commits a bundle nobody measured ships an oversized first byte to production. Contained by the fact that every step is re-runnable via `workflow_dispatch`, Actions keeps permanent logs, and the pipeline itself refuses to promote a bundle it cannot prove.

**Phase hint:** 4

**Depends on:** KW-013, KW-014

**Serializes with:** none

**Requirements:** REQ-004, REQ-005, REQ-008, REQ-011

**Decisions:** DEC-003, DEC-006, DEC-007, DEC-008, DEC-017

**Gates:** GATE-002, GATE-003

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

An operator can press **Run workflow** on `data-bundle` and, a few minutes later, see a new commit on
`main` carrying a regenerated `public/data/v1/` bundle plus an updated `data/.pipeline-state.json`,
and a `vercel[bot]` production deployment built from that exact SHA. The same run repeats on its own
every day at 06:17 UTC. A run whose first-byte payload exceeds 12,288 bytes brotli fails and pushes
nothing, and a run over unchanged upstream data still produces a commit whose only semantic change
is `manifest.generatedAt`.

## Context and evidence

The site's central claim is that every figure on it is measured at generation time rather than typed
into copy (REQ-005, DEC-008). That claim decays the moment generation stops, so the scheduler is not
an optimisation — it is the mechanism that makes the claim true tomorrow.

**DEC-017 (D-17) picks GitHub Actions and rejects Vercel Cron.** C-29 is the contradiction behind
that choice, and its resolution is narrower than either source track claimed. Both verifiers refuted
the duration arguments: the data-pipeline track's 342.6 s cold-clone figure is an ~8x overstatement
(VC-1 re-measured 44.9 s and 40.0 s over the full 145 MB, 66-repository corpus, 0 failures), and the
vercel track's 60 s function ceiling is defeated by one `{"fluid": true}` line in the very
`vercel.json` it already recommends. **The verdict survives only on the non-configurable grounds:**
Hobby cron is capped at once per day with +/-59 min jitter, has no retries, has best-effort delivery
that can invoke the same run twice, keeps runtime logs for one hour, and writes into an immutable
read-only deployment filesystem. Actions gives 6 h jobs, permanent logs, manual re-runs and
`workflow_dispatch`, free on standard runners for public repositories. **Do not reintroduce a cron
route, `vercel.json` cron entry, Vercel Blob or Global Config.** Global Config alone caps at 1 MB and
100 writes/month on Hobby — roughly three writes a day.

**The 60-day trap is not hypothetical here; this repository is already sitting in it.** GitHub
auto-disables scheduled workflows in a public repository after 60 days with no repository activity,
and `origin/main` has had zero pushes since 2021-05-31 (GT-8). Re-verified at authoring:
`git rev-parse origin/main` is `e664d73a195facd64db58ba10952170ff01b4772`, and the newest recorded
Production deployment is `cefcffb`, created 2021-05-31, by `vercel[bot]` (C2 of the vercel track's
verification corrections; the same pass measured 5 Preview / 9 Production deployments in total, not
the 7/7 the body claimed). **The always-commit rule in DEC-017 exists to keep the workflow's own
clock alive**, and `workflow_dispatch` exists so a human can restart it after a lapse.

**DEC-006 (D-06) and GATE-003 decide which secret goes where.** GT-1/GT-3: the available `gh` token
has no SAML grant for `ethereum-optimism`, so authenticated GraphQL reports 2025 = 1,443 and
2026 = 2,791 where the public profile reports 2,695 and 4,838 — 3,299 contributions missing across
the two years, exactly when the Optimism role starts. C-10 closes the escape hatch: `GITHUB_TOKEN`
is a GitHub App installation token scoped to this repository and cannot carry a third-party
organization's SAML grant, so it will reproduce the deflation. The pipeline therefore splits by auth
surface: KW-013's clone half runs with **no token at all** (GT-2: the same Optimism repository is
public and clones anonymously in about 1.0 s), and KW-010's GraphQL half needs the SSO-authorized
PAT stored as repository secret `CONTRIB_TOKEN`. **This workflow is the only place both halves run
together, so it is the only place `CONTRIB_TOKEN` is injected — into one step, never job-wide.**

**DEC-007 (D-07) and C-9 fix the budget this ticket enforces.** Scheme D's first byte is the five
files `manifest.json`, `repos.json`, `grid.json`, `events/ee-00.json`, `paths/pd-00.json`. C-9
corrected the measured total upward: `repos.json` and `grid.json` had been measured against schemas
smaller than the ones actually specified, so the honest figure is
`400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B` brotli, not 9,324. **The budget stays 12,288 B**,
leaving roughly 2.7 KB of headroom. KW-012 exports that number as
`FIRST_BYTE_BROTLI_BUDGET_BYTES`; this ticket imports it and never restates it.

**GATE-002 (HG-2) is open and was re-verified live while authoring this ticket.** `gh auth status`
reports scopes `admin:public_key, gist, read:org, repo` — no `workflow`. GitHub rejects any HTTPS
push that creates or modifies `.github/workflows/**` without it, and the rejection happens at push
time, after all the work is done. The proof is already in the working copy: local `main` is two
commits ahead of `origin/main`, and the newer of the two adds `.github/workflows/ci.yml`, which is
precisely why it is unpushed.

Plan-context navigation, pinned to planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/research/2026-07-31-decomposition-synthesis.md` §6 — wave diagram, verified topological levels, critical path, write-surface partition
- Decision registry: same file, §3 (D-01..D-17 → DEC-001..DEC-017) and §4 (HG-1..HG-7 → GATE-001..GATE-007)
- This ticket's implementation pointers: same file, §5, "Wave 4", entry **KW-28**
- Track evidence: `docs/research/2026-07-31-data-pipeline.md` §2.4–2.5 (permissions, the 60-day trap, cron placement), §7 (incremental algorithm, determinism, `actions/cache` key), §8 (size budget), §9 (failure modes 9 and 10), plus corrections VC-1, VC-2, VC-3 and VC-5; `docs/research/2026-07-31-vercel-platform.md` §5 (three refresh strategies, recommendation (a)) and §6 (why no storage product), plus corrections C2 and C6; `docs/research/2026-07-31-ci-testing.md` §1 and §10.5 (action tag pins, `GITHUB_TOKEN` does not trigger workflows)

## Scope

- Create `.github/workflows/data-bundle.yml`: `schedule: '17 6 * * *'` plus `workflow_dispatch`, `permissions: contents: write` and nothing else, a non-cancelling `concurrency` group, `runs-on: ubuntu-24.04`, and a fork guard so the schedule only fires on `its-everdred/kevinweaver-dev`.
- Restore and save KW-013's blobless clone cache with `actions/cache/restore` and `actions/cache/save`, pointing `KW_CLONE_ROOT` at a path outside the git working tree so no clone artifact can ever be staged.
- Inject `CONTRIB_TOKEN` (GATE-003) into the single pipeline step, preceded by a pre-flight guard that fails with an explicit GATE-003 message when the secret is absent instead of letting the SAML canary produce an opaque exit code.
- Create `scripts/pipeline/budget.ts`: an independent post-promotion brotli measurement of the five first-byte resources against `FIRST_BYTE_BROTLI_BUDGET_BYTES`, with a documented exit-code contract, a `--json` mode for KW-030, and a `--markdown` mode for the job summary.
- Implement the DEC-017 always-commit rule: stage exactly `public/data/v1` and `data/.pipeline-state.json`, fail loudly when the staged diff is empty, and push to `main` with one bounded rebase retry.
- Write the budget table, the resolved `generatedAt` and the pushed SHA into `$GITHUB_STEP_SUMMARY` so a failed overnight run is diagnosable without opening raw logs.
- Record the two first-live-run unknowns — whether a `GITHUB_TOKEN` commit counts as repository activity for the 60-day rule, and whether the Vercel Git integration fires on a `GITHUB_TOKEN` push — in the pull request body as a deferred finding with the heartbeat workflow named as the mitigation.

## Non-goals

- Do not author, edit or refactor any pipeline module. `scripts/pipeline/{encode,validate,state}.ts` and `data/.pipeline-state.json` are KW-014's; `scripts/pipeline/{clone,extract}.ts` are KW-013's; `scripts/pipeline/{calendar,private}.ts` are KW-010's; `scripts/pipeline/{discover,identity}.ts` are KW-009's; `lib/bundle/**` is KW-012's and KW-015's.
- Do not touch `package.json` or `package-lock.json`. Both are frozen after KW-001 (DEC-003). If a needed npm script is missing, stop and report a blocked dependency — do not add one.
- Do not edit `.github/workflows/ci.yml` (KW-001), `.github/workflows/e2e.yml` (KW-023) or `.github/workflows/snapshots.yml` (KW-031). This ticket adds exactly one new workflow file.
- Do not edit `.gitignore`. Keep every generated artifact outside the working tree instead.
- Do not add `.size-limit.json` or `scripts/ci/check-first-load.mjs` — KW-030 owns the bundle-size and first-load gates and consumes this ticket's `--json` output.
- Do not add a Vercel cron entry, a `vercel.json` change, Vercel Blob or Global Config (DEC-017, C-29).
- Do not add the belt-and-braces heartbeat workflow now. It is conditional on one of the two live-run unknowns actually failing; ship it as a follow-up if it does.
- Do not commit generated bundle bytes under `public/data/v1/**` in this pull request. The first real bytes arrive from the first successful workflow run.
- Do not add `scripts/pipeline/budget.test.ts` or any other file. The declared write surface is exactly two files, and every behaviour below is provable from the command line against a temporary fixture directory.
- Do not add `[skip ci]` to the commit message. It is unnecessary — a `GITHUB_TOKEN` push does not start workflow runs — and it would put a false claim in permanent history.

## Existing owner and reuse target

**There is no existing owner in the repository.** At `e664d73a195facd64db58ba10952170ff01b4772`,
`git ls-tree -r --name-only` outside `docs/` returns only `.aiur/*`, `.eslintrc.js`, `.gitignore`,
`README.md`, `components/{HomeHero,Timeline,WriteCode}.js`, `package.json`, `package-lock.json`,
`pages/{_app.js,index.js,api/hello.js}`, `postcss.config.js`, `public/**`, `styles/globals.scss`,
`tailwind.config.js` and `yarn.lock`. There is **no `.github/` directory, no `scripts/`, no `lib/`,
no `data/` and no `public/data/`**. Confirm with `git ls-files` at pickup.

Every reuse target below is created by a named upstream ticket. Import from them; never reimplement.

| Target | Created by | Status for this ticket |
|---|---|---|
| `scripts/pipeline/encode.ts` — `main()` and the promote-after-validate ordering | KW-014 | **hard dependency**; invoked as a process, never imported |
| `scripts/pipeline/validate.ts` — `ValidationResult.firstByteBrotliBytes` | KW-014 | consumed indirectly: the pipeline's own gate. This ticket re-measures the promoted bytes independently |
| `data/.pipeline-state.json` (schema 1) | KW-014 | **staged and committed by this workflow**, never edited by it |
| `public/data/v1/**` | KW-014 (written by its `promoteBundle`) | **staged and committed by this workflow**, never written by it |
| `scripts/pipeline/clone.ts` — the `KW_CLONE_ROOT` env var and the `${cloneRoot}/${owner}__${name}.git` layout | KW-013 | **hard dependency**; this workflow sets the variable and caches that directory |
| `lib/bundle/schema.ts` — `DATA_ROOT`, `FIRST_BYTE_BROTLI_BUDGET_BYTES`, `chunkFileName`, `dictFileName` | KW-012 (transitive, via both dependencies) | imported by `budget.ts`; the budget number is never restated as a literal |
| `.nvmrc` (`24`), `package.json#engines.node` (`24.x`), `package.json#scripts.data:build` | KW-001 | read-only; the workflow resolves Node from `.nvmrc` |

**One known upstream mismatch, and what to do about it.** KW-001's frozen `package.json` declares
`"data:build": "tsx scripts/pipeline/build.ts"`, but KW-014 creates `scripts/pipeline/encode.ts` and
no ticket in the set creates `scripts/pipeline/build.ts`. KW-014's own notes acknowledge this and
instruct its agent to make `encode.ts` the target of `data:build` without editing `package.json`. At
pickup, run the pre-flight assertion in the workflow (below) — it resolves `data:build`, extracts the
script path and fails with a readable message if that file is absent. **If `scripts/pipeline/build.ts`
does not exist on your base, invoke `npx tsx scripts/pipeline/encode.ts` in the workflow instead,
leave `package.json` untouched, and say so in the pull request body.** Do not create
`scripts/pipeline/build.ts` — that file is in KW-014's directory partition, not yours.

## Contract and invariants

### Producer interface — `scripts/pipeline/budget.ts`

This ticket is the **producer** for one consumer: KW-030's `.size-limit.json` / first-load gate,
which reads the `--json` form rather than re-measuring. Quote this sketch verbatim.

```ts
// scripts/pipeline/budget.ts
import {
  DATA_ROOT,                        // 'public/data/v1'
  FIRST_BYTE_BROTLI_BUDGET_BYTES,   // 12288  (DEC-007, corrected by C-9)
  chunkFileName,                    // chunkFileName(0) === 'events/ee-00.json'
  dictFileName,                     // dictFileName(0)  === 'paths/pd-00.json'
} from '../../lib/bundle/schema.ts';

/** The exact five-file set a first-time visitor fetches. Order is the report order. */
export const FIRST_BYTE_FILES: readonly string[] = [
  'manifest.json',
  'repos.json',
  'grid.json',
  chunkFileName(0),
  dictFileName(0),
];

export interface BudgetEntry {
  file: string;         // bundle-relative, e.g. 'events/ee-00.json'
  rawBytes: number;     // bytes on disk
  brotliBytes: number;  // quality 11, BROTLI_MODE_TEXT, size hint set
}

export interface BudgetReport {
  ok: boolean;                        // false when totalBrotliBytes > limitBytes
  dir: string;                        // directory measured, absolute
  limitBytes: number;                 // FIRST_BYTE_BROTLI_BUDGET_BYTES unless --limit overrides
  totalRawBytes: number;
  totalBrotliBytes: number;
  headroomBytes: number;              // limitBytes - totalBrotliBytes; may be negative
  entries: readonly BudgetEntry[];    // one per present file, in FIRST_BYTE_FILES order
  missing: readonly string[];         // required files not found or unreadable
}

/** Deterministic brotli size. Parameters are pinned so two runs never disagree. */
export function brotliSize(bytes: Uint8Array): number;

/** Reads the five files, measures them, and reports. Never throws on a missing file. */
export function measureFirstByte(
  dir?: string,        // default: DATA_ROOT resolved against process.cwd()
  limitBytes?: number, // default: FIRST_BYTE_BROTLI_BUDGET_BYTES
): Promise<BudgetReport>;

export function formatText(report: BudgetReport): string;      // aligned table, for logs
export function formatMarkdown(report: BudgetReport): string;  // GFM table, for the job summary

/** Resolves to the process exit code. Never calls process.exit itself. */
export function main(argv?: readonly string[]): Promise<number>;
```

### CLI contract

```
node scripts/pipeline/budget.ts [--dir <path>] [--limit <bytes>] [--json | --markdown]
```

| Exit code | Meaning |
|---|---|
| `0` | every required file present and `totalBrotliBytes <= limitBytes` |
| `1` | every required file present, but the first byte is over budget |
| `2` | at least one required first-byte file is missing or unreadable |

`--json` writes `BudgetReport` as JSON to stdout. `--markdown` writes a GFM table to stdout. In every
mode a single-line verdict goes to **stderr**, so a step that redirects stdout into
`$GITHUB_STEP_SUMMARY` still shows the outcome in the run log. `main` writes its output **before**
resolving to a non-zero code, so the summary is always populated even on a failure.

### Invariants

1. **Least privilege.** The workflow declares `permissions: contents: write` at the top level and
   grants nothing else. No `pull-requests`, no `packages`, no `id-token`.
2. **Always a commit.** A successful run always produces exactly one commit. KW-014's encoder always
   rewrites `manifest.generatedAt`, so an empty staged diff means the pipeline did not promote — the
   workflow treats that as a hard failure rather than a quiet success, because a quiet success is how
   the 60-day auto-disable clock silently restarts.
3. **Nothing outside two paths is ever staged.** `git add -- public/data/v1 data/.pipeline-state.json`
   and never `git add -A` / `git add .`. `KW_CLONE_ROOT` additionally lives outside `GITHUB_WORKSPACE`,
   so there is nothing untracked to catch by accident.
4. **The secret is step-scoped.** `CONTRIB_TOKEN` is set in the `env:` block of the pipeline step
   only. It is never echoed, never written to the summary, and never passed to the budget step or the
   commit step.
5. **No promotion means no push.** The pipeline exits non-zero on any invariant breach (KW-014 exit
   codes 1, 2, 3); `set -euo pipefail` plus step ordering means the commit step is never reached.
6. **The budget is measured, never asserted.** `budget.ts` reads the bytes that were actually
   promoted to disk. It is a second, independent check after KW-014's in-process one, and the two
   disagreeing is itself a finding.
7. **Brotli parameters are pinned.** Quality 11, `BROTLI_MODE_TEXT`, size hint set to the input
   length. Node's defaults happen to match on quality, but an unpinned call makes the number a
   function of the runtime rather than of the data.
8. **The budget limit is imported.** `FIRST_BYTE_BROTLI_BUDGET_BYTES` comes from
   `lib/bundle/schema.ts`. `12288` never appears as a literal in `budget.ts` or in the workflow.

### Consumed contracts, quoted from their owners

From KW-013 (`scripts/pipeline/clone.ts`), the two compatibility surfaces this workflow depends on:

```ts
/** Default: process.env.KW_CLONE_ROOT ?? path.join(os.tmpdir(), 'kw-clones-v1'). */
cloneRoot?: string;
```

with the on-disk layout `${cloneRoot}/${owner}__${name}.git` — `__` as the joiner because `/` would
nest and a single `_` collides with repository names containing underscores. Changing either is a
coordinated change with KW-013.

From KW-014 (`scripts/pipeline/encode.ts`), the exit-code table this workflow branches on:

| Code | Meaning | Promotes? |
|---|---|---|
| `0` | Bundle validated and promoted, **or** a no-op run in which only `manifest.generatedAt` changed | yes |
| `1` | One or more `severity: 'error'` findings | no |
| `2` | SAML canary failed or the calendar is degraded | no |
| `3` | An upstream stage module was unavailable or threw | no |

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; if something has
moved, adapt the pointer and report the drift rather than silently changing scope.

### Files

| Path | Action |
|---|---|
| `.github/workflows/data-bundle.yml` | create |
| `scripts/pipeline/budget.ts` | create — `FIRST_BYTE_FILES`, `brotliSize`, `measureFirstByte`, `formatText`, `formatMarkdown`, `main` |

Nothing else. `package.json`, `package-lock.json`, `.gitignore`, `lib/**`, every other file under
`scripts/pipeline/` and every other file under `.github/` must be untouched in the diff.

### Version pins, all re-confirmed on 2026-07-31

| Pin | Value | How confirmed |
|---|---|---|
| `actions/checkout` | `v7.0.1` | `gh api repos/actions/checkout/releases/latest` |
| `actions/setup-node` | `v7.0.0` | `gh api repos/actions/setup-node/releases/latest` |
| `actions/cache/restore`, `actions/cache/save` | `v6.1.0` | `gh api repos/actions/cache/releases/latest`; both subpath actions exist at that tag and declare `using: 'node24'` |
| runner image | `ubuntu-24.04` | pinned explicitly, matching KW-001's `ci.yml`, so a `ubuntu-latest` rollover never silently changes behaviour |
| Node | resolved from `.nvmrc` (`24`) | KW-001; `engines.node` is `24.x`; local host measured at `v24.18.0` |
| commit identity | `github-actions[bot]` / `41898282+github-actions[bot]@users.noreply.github.com` | `gh api users/github-actions%5Bbot%5D` → `{"id":41898282,"login":"github-actions[bot]","type":"Bot"}` |
| Vercel GitHub App | id `8329`, slug `vercel` | `gh api apps/vercel` |

**Two behaviours verified from the action manifests, both load-bearing:**

- `actions/checkout@v7.0.1` still defaults `persist-credentials: true`, so the checked-out repository
  keeps the `GITHUB_TOKEN` credential and a plain `git push` works with no extra wiring.
- `actions/cache@v6.1.0` declares `post-if: "success()"`, which means **the cache is not saved when
  the job fails**, and its `save-always` input carries a deprecation message pointing at
  `actions/cache/restore` + `actions/cache/save`. That is why this workflow uses the split form with
  `if: always()` on the save: a run that fails at the budget step must not throw away 45 s of clone
  work, and losing the cache is exactly what makes the next run slow enough to look like a new bug.

**Do not use `andresz1/size-limit-action` or any similar wrapper.** It still declares the deprecated
`using: 'node20'` runtime and its last release is 2024-04-06. Every action in this workflow runs on
`node24`.

### `.github/workflows/data-bundle.yml`

```yaml
name: data-bundle

# DEC-017: scheduled regeneration runs on GitHub Actions, never Vercel Cron.
# 06:17 UTC, deliberately off the hour: GitHub documents that scheduled runs can be
# delayed and that "some queued jobs may be dropped" during high-load windows, and
# the start of every hour is the highest-load window there is.
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Regenerate and measure, but do not commit or push'
        type: boolean
        default: false

permissions:
  contents: write

concurrency:
  group: data-bundle
  cancel-in-progress: false

env:
  NEXT_TELEMETRY_DISABLED: '1'
  FORCE_COLOR: '1'

jobs:
  regenerate:
    # Never let a fork's scheduled copy of this workflow run.
    if: github.repository == 'its-everdred/kevinweaver-dev'
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7.0.1

      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci --no-audit --fund=false

      # KW-013's clone cache must live OUTSIDE the git working tree so no clone
      # artifact can ever be staged. RUNNER_TEMP is absolute and stable for the
      # whole job. It has to be published through $GITHUB_ENV rather than a
      # workflow-level `env:` block: the `runner` context is not available there.
      - name: resolve clone root
        run: echo "KW_CLONE_ROOT=${RUNNER_TEMP}/kw-clones-v1" >> "$GITHUB_ENV"

      # GATE-003. Without the SSO-authorized PAT the GraphQL half publishes numbers
      # roughly 3,299 low across 2025-26 (GT-1/GT-3). GITHUB_TOKEN cannot substitute:
      # it is an installation token scoped to this repository and cannot carry a
      # third-party organization's SAML grant (C-10). Fail here, with a readable
      # message, rather than letting the SAML canary produce an opaque exit code 2.
      - name: assert CONTRIB_TOKEN is present
        env:
          CONTRIB_TOKEN: ${{ secrets.CONTRIB_TOKEN }}
        run: |
          if [ -z "${CONTRIB_TOKEN}" ]; then
            echo "::error::GATE-003 unsatisfied: repository secret CONTRIB_TOKEN is not set."
            echo "::error::Mint a PAT with read:user, authorize it for ethereum-optimism, store it as CONTRIB_TOKEN."
            exit 1
          fi

      # KW-001 froze package.json (DEC-003), so the pipeline entry point is whatever
      # scripts.data:build already points at. Resolve it and fail readably if the file
      # is absent, rather than surfacing an opaque tsx resolution error at 06:17 UTC.
      - name: assert pipeline entry point exists
        run: |
          entry="$(node -p "require('./package.json').scripts['data:build'].split(' ').pop()")"
          echo "data:build -> ${entry}"
          test -f "${entry}" || { echo "::error::${entry} does not exist; package.json is frozen, report against KW-014"; exit 1; }

      - name: restore blobless clone cache
        id: clones
        uses: actions/cache/restore@v6.1.0
        with:
          path: ${{ env.KW_CLONE_ROOT }}
          key: clones-v1-${{ github.run_id }}
          restore-keys: |
            clones-v1-

      - name: regenerate bundle
        env:
          CONTRIB_TOKEN: ${{ secrets.CONTRIB_TOKEN }}
        run: npm run data:build

      # Saved even when a later step fails: actions/cache's combined form declares
      # post-if: success() and would discard an advanced cache on any red run.
      - name: save blobless clone cache
        if: always()
        uses: actions/cache/save@v6.1.0
        with:
          path: ${{ env.KW_CLONE_ROOT }}
          key: clones-v1-${{ github.run_id }}

      # DEC-007 / C-9. Independent post-promotion measurement of the five first-byte
      # resources. stdout goes to the job summary; the verdict line goes to stderr and
      # so stays visible in the log.
      - name: first-byte budget
        run: node scripts/pipeline/budget.ts --markdown >> "$GITHUB_STEP_SUMMARY"

      # DEC-017: always commit. KW-014's encoder always rewrites manifest.generatedAt,
      # so an empty staged diff means nothing was promoted - that is a failure, not a
      # no-op, because a silent no-op is how the 60-day auto-disable clock restarts.
      - name: commit and push
        if: ${{ github.event.inputs.dry_run != 'true' }}
        run: |
          git config user.name  'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add -- public/data/v1 data/.pipeline-state.json
          if git diff --cached --quiet; then
            echo "::error::pipeline promoted nothing; expected at least a manifest.generatedAt bump (DEC-017)"
            exit 1
          fi
          generated_at="$(node -p "require('./public/data/v1/manifest.json').generatedAt")"
          git commit -m "data: refresh activity bundle (${generated_at})"
          git push origin HEAD:main \
            || { git pull --rebase --autostash origin main && git push origin HEAD:main; }
          {
            echo ""
            echo "generatedAt: \`${generated_at}\`"
            echo "commit: \`$(git rev-parse HEAD)\`"
          } >> "$GITHUB_STEP_SUMMARY"
```

**Why `KW_CLONE_ROOT` is published through `$GITHUB_ENV` instead of a workflow-level `env:` block.**
KW-013 defaults its clone root to `os.tmpdir()`, and the whole point is that no clone artifact ever
lands in the git working tree — so the runner equivalent is `RUNNER_TEMP`, which is absolute, stable
for the whole job, a valid `actions/cache` path, and structurally impossible for `git add` to reach.
It cannot be written as `${{ runner.temp }}/kw-clones-v1` in a workflow-level or job-level `env:`
block, because the `runner` context is not available at either level; writing it to `$GITHUB_ENV`
from the first step makes `${{ env.KW_CLONE_ROOT }}` resolvable in every later step's `with:` and
keeps one source of truth. Editing `.gitignore` to hide an in-tree cache would be the wrong fix —
that file belongs to KW-001.

**Why the cache key is `github.run_id` and not `hashFiles('data/.pipeline-state.json')`.** The
data-pipeline track proposed the `hashFiles` key, but the pipeline *rewrites* that state file during
the run, so the key computed at save time would differ from the key computed at restore time anyway —
the intent is obscured rather than expressed. `clones-v1-${{ github.run_id }}` with
`restore-keys: clones-v1-` says exactly what is wanted: restore the most recent cache, always save
the advanced one. Sizing: the blobless corpus is 145 MB measured (VC-1; the data-pipeline track's
own figure including git overhead is 151 MB), the repository cache limit is 10 GB with 7-day
eviction, so a week of daily saves is roughly 1 GB. A cache miss costs one cold re-clone, measured by
VC-1 at 40.0–44.9 s for all 66 repositories, with the slowest single repository at 3.8 s.

**Why there is no `paths:` filter and no `push:` trigger.** This workflow is not a required status
check, so a path filter cannot deadlock a pull request the way it can on `ci.yml` — but adding one
would still be wrong, because the schedule is the point. And `GITHUB_TOKEN`-triggered events do not
create workflow runs, so the commit this workflow pushes will not re-run `ci.yml` (whose trigger is
`push: branches: [main]`) and will not re-run this workflow. That loop guard is a feature here, but
it also means **the bundle commit never gets a post-merge CI pass** — which is acceptable only
because the pipeline's own validator and this workflow's budget step both ran in the same job before
the push. Any *future* downstream workflow that must react to this commit needs a PAT, not
`GITHUB_TOKEN`.

### `scripts/pipeline/budget.ts`

Node 24 executes `.ts` directly by type stripping, with no flag and no `tsx` wrapper. Consequences,
all mandatory and identical to KW-013/KW-014:

- Erasable TypeScript only: no `enum`, no `namespace`, no parameter properties.
- Relative imports carry the explicit `.ts` extension.
- Type-only imports use `import type`.
- `node:zlib`'s `brotliCompressSync` is built in. Add no compression dependency (DEC-003).

```ts
#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import {
  DATA_ROOT,
  FIRST_BYTE_BROTLI_BUDGET_BYTES,
  chunkFileName,
  dictFileName,
} from '../../lib/bundle/schema.ts';

export const FIRST_BYTE_FILES: readonly string[] = [
  'manifest.json',
  'repos.json',
  'grid.json',
  chunkFileName(0),
  dictFileName(0),
];

export function brotliSize(bytes: Uint8Array): number {
  return brotliCompressSync(bytes, {
    params: {
      [zlib.BROTLI_PARAM_QUALITY]: 11,
      [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
      [zlib.BROTLI_PARAM_SIZE_HINT]: bytes.length,
    },
  }).length;
}

export async function measureFirstByte(
  dir: string = DATA_ROOT,
  limitBytes: number = FIRST_BYTE_BROTLI_BUDGET_BYTES,
): Promise<BudgetReport> {
  const root = path.resolve(dir);
  const entries: BudgetEntry[] = [];
  const missing: string[] = [];
  for (const file of FIRST_BYTE_FILES) {
    try {
      const bytes = await readFile(path.join(root, file));
      entries.push({ file, rawBytes: bytes.length, brotliBytes: brotliSize(bytes) });
    } catch {
      missing.push(file);
    }
  }
  const totalBrotliBytes = entries.reduce((n, e) => n + e.brotliBytes, 0);
  const totalRawBytes = entries.reduce((n, e) => n + e.rawBytes, 0);
  return {
    ok: missing.length === 0 && totalBrotliBytes <= limitBytes,
    dir: root,
    limitBytes,
    totalRawBytes,
    totalBrotliBytes,
    headroomBytes: limitBytes - totalBrotliBytes,
    entries,
    missing,
  };
}
```

`main` parses `--dir`, `--limit`, `--json`, `--markdown`; prints the selected form to stdout; prints
one verdict line to stderr; and resolves `2` when `missing.length > 0`, `1` when `!ok`, else `0`. Use
the standard bottom guard so the module stays importable by KW-030:

```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => { process.exitCode = code; });
}
```

### Worked fixture — measured, not estimated

Build this five-file directory from KW-012's own worked example plus its production-shape manifest,
then run the CLI against it. Measured live on Node `v24.18.0` with the pinned brotli parameters:

| file | raw B | brotli B |
|---|---|---|
| `manifest.json` | 362 | 214 |
| `repos.json` | 141 | 112 |
| `grid.json` | 124 | 100 |
| `events/ee-00.json` | 55 | 57 |
| `paths/pd-00.json` | 81 | 83 |
| **first byte total** | **763** | **566** |

`events/ee-00.json` is byte-for-byte KW-012's `{"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[1,1,0]}`
and `paths/pd-00.json` is its front-coded
`{"from":0,"n":3,"fc":"#packages/engine/src/run.ts\n7bootstrap.ts\n#app/page.tsx"}`. The two smallest
files compress *larger* than their input — brotli's stream header exceeds the saving on 55 bytes — and
that is correct behaviour, not a bug in the measurement.

Assert `report.totalBrotliBytes < report.limitBytes`, **never** the exact total: brotli output is a
function of the libbrotli build, so pinning 566 into CI would make a Node patch release look like a
regression. The real-corpus reference is C-9's corrected `9,598 B` against the 12,288 B budget —
about 2.7 KB of headroom.

The negative cases need no oversized fixture:

- **over budget** — `node scripts/pipeline/budget.ts --dir /tmp/kw028-fixture --limit 512` → 566 > 512 → exit `1`.
- **missing resource** — `rm /tmp/kw028-fixture/paths/pd-00.json` then re-run → exit `2` with `pd-00.json` in `missing`.

### Working while KW-013 and KW-014 are unmerged

Both are hard dependencies and both may still be open when this ticket is picked up. Neither blocks
authoring:

- `budget.ts` needs only `lib/bundle/schema.ts` (KW-012, upstream of both dependencies) and a
  directory of files. Prove it end to end against `/tmp/kw028-fixture` exactly as above.
- The workflow cannot be exercised on a branch — `schedule` and `workflow_dispatch` only run from the
  default branch. Validate its syntax statically instead (`actionlint` if available in the runner
  image, otherwise `node -e "require('node:fs').readFileSync(...)"` plus a YAML parse) and rely on the
  post-merge `workflow_dispatch` run for behavioural evidence.
- If `lib/bundle/schema.ts` is not on your base either, **stop and report a blocked dependency**. Do
  not inline `12288`, `'public/data/v1'` or the file names — those constants exist precisely so this
  ticket has nothing to restate.

## Acceptance and verification

### Agent gate

- `npm run typecheck` and `npm run lint` both exit 0 with no new diagnostics.
- Against the worked fixture, `node scripts/pipeline/budget.ts --dir /tmp/kw028-fixture` exits `0`, prints all five files, and reports `totalBrotliBytes` strictly below `limitBytes`.
- `node scripts/pipeline/budget.ts --dir /tmp/kw028-fixture --limit 512` exits `1` and its stderr verdict names the overage.
- With `paths/pd-00.json` removed, `node scripts/pipeline/budget.ts --dir /tmp/kw028-fixture` exits `2` and lists `paths/pd-00.json` under `missing`.
- `node scripts/pipeline/budget.ts --dir /tmp/kw028-fixture --json | node -e "const r=JSON.parse(require('node:fs').readFileSync(0,'utf8')); if(r.entries.length!==5||typeof r.totalBrotliBytes!=='number') process.exit(1)"` exits 0.
- `grep -nE "12288|public/data/v1|ee-00|pd-00" scripts/pipeline/budget.ts` shows the bundle-relative names only through `chunkFileName(0)` / `dictFileName(0)`, and shows no numeric budget literal.
- `.github/workflows/data-bundle.yml` parses as YAML, declares `permissions: contents: write` and no other permission, declares both `schedule` and `workflow_dispatch`, pins `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/cache/restore@v6.1.0` and `actions/cache/save@v6.1.0`, and runs on `ubuntu-24.04`.
- `grep -n "git add" .github/workflows/data-bundle.yml` shows exactly one occurrence and it is `git add -- public/data/v1 data/.pipeline-state.json`; `grep -nE "git add (-A|\.)" ` returns nothing.
- `grep -n "CONTRIB_TOKEN" .github/workflows/data-bundle.yml` shows it only inside step-level `env:` blocks — never at job or workflow level, never in a `run:` echo.
- `git status --porcelain` shows changes to exactly two files, and no changes under `package.json`, `package-lock.json`, `.gitignore`, `lib/`, `public/data/` or any other `.github/` path.

### At-merge gate

- The `ci-ok` aggregated status published by KW-001's `.github/workflows/ci.yml` is green on the exact pull request head.
- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green in CI on Node 24.
- The pull request diff touches only `.github/workflows/data-bundle.yml` and `scripts/pipeline/budget.ts`.
- The pull request body records the two first-live-run unknowns (60-day activity accounting for a `GITHUB_TOKEN` commit; whether the Vercel Git integration fires on a `GITHUB_TOKEN` push) and names the heartbeat workflow as the mitigation if either fails.
- **GATE-002 must be satisfied before this can merge at all**: the push credential needs `workflow` scope (`gh auth refresh -s workflow`) or the fleet needs SSH keys. Verified at authoring as still open — `gh auth status` reports `admin:public_key, gist, read:org, repo`.

### Human/manual evidence

- Operator runs the workflow manually from the Actions tab (or `gh workflow run data-bundle.yml`) and it completes green.
- That run produces exactly one new commit on `main`, authored by `github-actions[bot]`, whose diff is confined to `public/data/v1/**` and `data/.pipeline-state.json`.
- `gh api repos/its-everdred/kevinweaver-dev/deployments --jq '.[0] | {sha, environment, created_at, creator: .creator.login}'` shows a `Production` deployment by `vercel[bot]` for that commit's SHA. Before this ticket the newest such record is `cefcffb`, 2021-05-31.
- The run's job summary shows the five-file budget table with `totalBrotliBytes` under 12,288 and a non-negative `headroomBytes`.
- A second `workflow_dispatch` run over unchanged upstream data still produces a commit, and `git show --stat` on it confirms `manifest.generatedAt` is the only semantic change.
- Operator confirms, roughly 24 h later, that the `17 6 * * *` schedule fired without a manual trigger — this is the only evidence that the 60-day activity accounting is actually working.

## Failure, security, migration, and accessibility cases

**Failure.** The two modes that matter are both silent by nature, and each has an explicit
countermeasure. *Schedule auto-disabled* — GitHub disables scheduled workflows in a public repository
after 60 days with no repository activity, and this repository has been in exactly that state since
2021-05-31. The always-commit rule is the countermeasure and the empty-staged-diff hard failure is
its alarm; `workflow_dispatch` is the manual restart. *Run dropped or delayed* — GitHub documents
that scheduled runs can be delayed and that some queued jobs may be dropped under load, which is why
the cron is `17 6 * * *` and not on the hour. A dropped day is harmless because the bundle is a full
snapshot, never a delta, so the next run self-heals. Beyond those: a pipeline exit of 1, 2 or 3
aborts before the commit step and pushes nothing, which is the correct outcome — a stale-but-true
bundle beats a fresh-but-wrong one. A `git push` that loses a race against a concurrent merge is
retried once behind `git pull --rebase --autostash`; a second failure fails the run rather than
looping. A run that fails at the budget step still saves its clone cache, because the save step is
split out with `if: always()`. Contained upstream degradation — one repository timing out, a GraphQL
retry that eventually succeeds — is KW-014's concern, not this workflow's: it surfaces as
`manifest.degraded` and an exit code of 0.

**Security.** `permissions: contents: write` and nothing else; the default token grants no
`pull-requests`, `packages` or `id-token` here. `CONTRIB_TOKEN` (GATE-003) is scoped to the single
step that needs it and is never echoed, never written to the job summary, and never reachable from
the budget or commit steps. The `if: github.repository == ...` guard stops a fork's copy of the
schedule from running with a fork's secrets. This workflow checks out and executes repository code
with a write token, which is safe only because it runs from the default branch on `schedule` and
`workflow_dispatch` — **never** add a `pull_request_target` trigger. Everything committed lands in a
public repository, so `data/.pipeline-state.json` must never carry a credential and `repos.json` must
never carry a private repository name; both are KW-014's asserted invariants and this workflow does
not weaken them. `GITHUB_TOKEN` deliberately does not carry the SAML grant (C-10) and is never
offered to the pipeline as a substitute for `CONTRIB_TOKEN`.

**Migration.** None to perform. There is no prior workflow, no prior schedule and no prior committed
bundle; the first successful run creates `public/data/v1/**` and seeds `data/.pipeline-state.json`.
The clone cache is derived state that can be deleted at any time and rebuilt in about 45 s, so cache
format changes are handled by bumping the `clones-v1-` key prefix rather than by any migration step.
`public/data/v1` is versioned in its path, so a future wire-format change is a new `v2/` directory
and a new workflow step, not a mutation of this one.

**Accessibility.** None apply. This ticket produces no rendered surface, no DOM and no user-facing
copy. The accessible presentation of the data it publishes belongs to KW-025 (canvas plus the DEC-011
hidden table), KW-018 (tmux status bar) and KW-020 (boot overlay), and is verified by KW-029.

## Surfaces

- Reads: lib/bundle/schema.ts, scripts/pipeline/encode.ts, scripts/pipeline/validate.ts, scripts/pipeline/clone.ts, package.json, .nvmrc, public/data/v1/**, data/.pipeline-state.json
- Writes: .github/workflows/data-bundle.yml, scripts/pipeline/budget.ts
- Contracts: scripts/pipeline/budget.ts#BudgetReport, scripts/pipeline/budget.ts#measureFirstByte, scripts/pipeline/budget.ts#FIRST_BYTE_FILES, .github/workflows/data-bundle.yml#data-bundle
- Safety: .github/workflows/data-bundle.yml, secret:CONTRIB_TOKEN, public/data/v1/**, git-write:main

## Sibling boundaries and open gates

`.github/workflows/**` is shared by four tickets and partitioned by file (DEC-005). Ownership is
exclusive and permanent:

| Ticket | Owns | Relationship |
|---|---|---|
| KW-001 | `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `.nvmrc`, `.gitignore`, `scripts/ci/assert-pins.mjs` | frozen after wave 1 (DEC-003); read-only here |
| KW-002 | `.github/CODEOWNERS`, `.github/rulesets/main.json`, `AGENTS.md` | parallel; a CODEOWNERS entry for `.github/**` means this ticket's pull request needs code-owner review |
| KW-023 | `.github/workflows/e2e.yml`, `playwright.config.ts` | **parallel sibling, not a dependency** — different workflow file, no shared surface |
| KW-031 | `.github/workflows/snapshots.yml`, `e2e/__screenshots__/**` | parallel sibling; also needs GATE-002, and needs a PAT for its baseline push for the same `GITHUB_TOKEN` reason described above |
| KW-009 | `scripts/pipeline/discover.ts`, `scripts/pipeline/identity.ts` | transitive upstream; never edited here |
| KW-010 | `scripts/pipeline/calendar.ts`, `scripts/pipeline/private.ts` | transitive upstream; supplies the SAML canary this workflow's GATE-003 guard front-runs |
| KW-012 | `lib/bundle/schema.ts`, `lib/bundle/codec.ts`, `lib/bundle/frontcode.ts` | transitive upstream; source of `FIRST_BYTE_BROTLI_BUDGET_BYTES`, `DATA_ROOT`, `chunkFileName`, `dictFileName` |
| KW-013 | `scripts/pipeline/clone.ts`, `scripts/pipeline/extract.ts` | **hard dependency**; owns `KW_CLONE_ROOT` and the `${owner}__${name}.git` cache layout |
| KW-014 | `scripts/pipeline/{encode,validate,state}.ts`, `data/.pipeline-state.json`, `public/data/v1/**` as a write surface | **hard dependency**; owns promotion, refusal and the exit-code table. This workflow only *stages* its outputs |
| KW-030 | `.size-limit.json`, `scripts/ci/check-first-load.mjs`, `e2e/lazy-island.spec.ts` | **downstream consumer**; reads `budget.ts --json` rather than re-measuring |
| KW-032 | `app/page.tsx` final composition, `README.md` | capstone; verifies the deployed bundle's `generatedAt` is within 24 h |

**Open gate: GATE-002 (HG-2)** — the push credential needs `workflow` scope. This gate **blocks
merge, not pickup**: all the authoring and every agent-gate proof above can be completed without it,
but GitHub rejects the HTTPS push that creates `.github/workflows/data-bundle.yml` at push time,
after the work is done. Re-verified while authoring: `gh auth status` reports
`admin:public_key, gist, read:org, repo`, and local `main` is two commits ahead of `origin/main`
precisely because the newer commit adds a file under `.github/workflows/`. Resolution is
`gh auth refresh -s workflow` or provisioning SSH keys for the fleet.

**Open gate: GATE-003 (HG-3)** — an SSO-authorized PAT with `read:user`, authorized for
`ethereum-optimism`, stored as repository secret `CONTRIB_TOKEN`. This gate **blocks the workflow
producing true numbers, not the merge of this ticket**: the guard step that fails loudly when the
secret is absent is itself part of the deliverable, and its correct behaviour is the acceptance
criterion. Until the gate is satisfied every scheduled run fails on that guard — loudly and
diagnosably, which is the intended posture. It is strictly better than publishing figures roughly
3,299 low across 2025-26.
