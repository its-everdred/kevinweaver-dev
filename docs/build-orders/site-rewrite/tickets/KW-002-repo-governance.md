# KW-002 — Repo governance: agent labels, CODEOWNERS, AGENTS.md, and auto-merge

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 1 — One JSON config file plus three short prose documents and a fixed list of idempotent `gh` calls; no application code, no build surface, and every step is independently re-runnable.

**Risk:** Medium despite complexity 1. The ruleset and the Actions-token change are live repository mutations that can deadlock every subsequent agent PR if the required status context is wrong or code-owner review is scoped too broadly. Every mutation below has a stated one-command rollback.

**Phase hint:** 1

**Depends on:** none

**Serializes with:** none

**Requirements:** REQ-002

**Decisions:** DEC-003, DEC-012, DEC-013

**Gates:** GATE-006

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`its-everdred/kevinweaver-dev` carries the complete label inventory that both the aiur orchestrator and the Build Order publisher require, `main` is protected by an active ruleset whose single required status check is `ci-ok`, squash-only auto-merge with branch deletion is on, the default `GITHUB_TOKEN` is read-only and cannot approve pull requests, `.github/CODEOWNERS` guards the gate files only, and root `AGENTS.md` states the agent contract in writing.

## Context and evidence

The repository has no governance at all. Re-measured at `e664d73a195facd64db58ba10952170ff01b4772` and confirmed live during authoring (GT-11):

```
gh api repos/its-everdred/kevinweaver-dev/rulesets                      -> []
gh api repos/its-everdred/kevinweaver-dev/actions/permissions/workflow  -> {"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}
gh api repos/its-everdred/kevinweaver-dev --jq '{allow_auto_merge,delete_branch_on_merge,owner_type:.owner.type,plan:.owner.plan}'
                                                                        -> {"allow_auto_merge":false,"delete_branch_on_merge":false,"owner_type":"User","plan":null}
gh label list --repo its-everdred/kevinweaver-dev                       -> 9 GitHub defaults, zero agent:* labels
git ls-tree -r --name-only origin/main -- .github AGENTS.md             -> (empty; no .github directory, no AGENTS.md)
```

Three facts make this ticket load-bearing rather than cosmetic.

1. **`default_workflow_permissions: write` + `can_approve_pull_request_reviews: true` is a live hole** (GT-11). Any workflow that lands after KW-001 gets a write token by default and can self-approve pull requests. It is fixed here, before the first workflow exists.
2. **Merge queue is structurally unavailable** — GitHub gates it on organization ownership, and this repo is User-owned with `plan: null` (GT-11, C-21, confirmed by ci-testing's verifier against `github/docs` `merge-queue.md` and against `gh api graphql … isInOrganization -> false`). DEC-012 therefore chooses auto-merge + `strict_required_status_checks_policy: false`, because "branch must be up to date" without a queue makes every merge invalidate every other open PR and agents thrash on rebases.
3. **The Build Order publisher will not invent labels.** Verified in the validator's own publisher: `publication/publication_operator.py:512-529` computes `missing = required_labels - existing_labels`, then `forbidden_creation = missing - creatable_labels`, and raises `PublicationError("required labels must already exist and will not be invented: …")`. `creatable_labels` is populated **only** on the DASH extension path (`publication_operator.py:1113-1124`, entered when `publication.json` has a `skill_issue` key, which this pack must not have); the default path takes `extension.get("creatable_labels", {})` at `publication_operator.py:1272`, i.e. the empty dict. So every projection label — `build-order`, `build-lane:<workstream>`, `phase:1..7`, `complexity:1..4`, and every entry of `required_ticket_labels` — must physically exist in the repo. This ticket is where that inventory is declared, created and made verifiable.

Contradiction resolutions that bind this ticket:

- **C-21 / DEC-012.** No merge queue, no `merge_group:` trigger anywhere, `required_approving_review_count: 0`, `require_code_owner_review: true` scoped by CODEOWNERS to gate files only, `strict_required_status_checks_policy: false`.
- **C-11 / DEC-013.** aiur enforces `depends_on` at runtime only as GitHub-native issue dependencies written by `publish_build_order.py`. Hand-created issues silently drop the graph. `AGENTS.md` says so in writing so no agent invents an issue.
- **C-14 / DEC-003.** Exactly one lockfile, npm only, and `package.json`/`package-lock.json` are frozen after KW-001. `AGENTS.md` is the document that carries that rule to every worker.
- **GATE-006.** No CI exists on `main` until KW-001 merges, so the Executor's "fresh `ci-ok` green on the exact PR head" condition is unsatisfiable for this ticket's own PR. KW-001 and KW-002 merge on verified-local-green evidence; every later ticket requires the real `ci-ok` status.
- **GATE-002 does not block this ticket.** The push credential lacks the `workflow` OAuth scope (GT-10: scopes are `admin:public_key, gist, read:org, repo`), so GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`. This ticket deliberately writes **no** file under `.github/workflows/`, which is why it can execute while GATE-002 is open.

The research body contains two positions this plan overrides; do not follow them. `docs/research/2026-07-31-aiur-readiness.md` §8.2 says "branch protection: not required … leave `main` unprotected" and §10.2 says "do not enable GitHub auto-merge". That doc's own **Verification corrections** section (C1) refutes the premise behind §10.2, and DEC-012 supersedes both. `docs/research/2026-07-31-aiur-readiness.md` §7 item 5 proposes `CODEOWNERS` with `* @its-everdred`; DEC-012 narrows it to gate files only, because whole-repo ownership plus `require_code_owner_review: true` would block every agent PR.

**Plan-context navigation** (repository-relative paths; all research paths resolve at `e664d73a195facd64db58ba10952170ff01b4772`, e.g. `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research`):

- Pack index and the KW-01..KW-32 → KW-001..KW-032 identity mapping: `docs/build-orders/site-rewrite/README.md`.
- Ticket manifest, surfaces and graph edges: `docs/build-orders/site-rewrite/build-order.json`.
- Wave diagram, verified topological levels, critical path, write-surface partition proof: `docs/research/2026-07-31-decomposition-synthesis.md` §6.
- Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007): `docs/research/2026-07-31-decomposition-synthesis.md` §3 and §4, mirrored into `build-order.json` `decisions[]` and `external_gates[]`.
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, "KW-02 — Repo governance", plus `docs/research/2026-07-31-ci-testing.md` §10 and `docs/research/2026-07-31-aiur-readiness.md` §7–§8.
- Executor authority and the live gate register: `docs/build-orders/site-rewrite/authority-envelope.md`.

REQ-002, the requirement this ticket discharges, reads: *the repository enforces an autonomous-merge safety net — agent-routing labels, a protected `main` requiring `ci-ok`, a least-privilege Actions token, and code-owner review scoped to the gate files — so a fleet of agents can merge to `main` without a human in every loop.*

## Scope

- Create and reconcile, idempotently, the complete GitHub label inventory: the 10 aiur lifecycle states, the 3 aiur marker labels, `model:claude`, `complexity:1`..`complexity:5`, and every Build Order projection label (`build-order`, `phase:1`..`phase:7`, and one `build-lane:<id>` per declared workstream).
- Flip repository merge settings to squash-only auto-merge with automatic branch deletion.
- Reduce the default Actions `GITHUB_TOKEN` to `read` and disable Actions self-approval of pull requests.
- Commit `.github/rulesets/main.json` and apply it, protecting `main` with exactly one required status check, `ci-ok`.
- Add `.github/CODEOWNERS` covering the gate files only, so a PR that weakens a gate needs the owner's review while ordinary product PRs self-merge.
- Add root `AGENTS.md` stating the build contract, the branch/PR conventions, the one-lockfile rule and the issue-creation rule.
- Add `.github/pull_request_template.md` adapted from the aiur repository's template.

## Non-goals

- Creating or editing any file under `.github/workflows/**`. KW-001 owns `ci.yml`; KW-023 owns `e2e.yml`; KW-028 owns the data workflow; KW-031 owns `snapshots.yml`. Touching them would also hit GATE-002 at push time.
- Adding `e2e-ok`, a Vercel deployment status, or any second required status check to the ruleset.
- Any change to `package.json`, `package-lock.json`, `tsconfig.json`, or any toolchain file. KW-001 owns those and DEC-003 freezes them.
- Minting, rotating or storing repository secrets. `CONTRIB_TOKEN` is GATE-003; `AUTOMERGE_TOKEN` and `SNAPSHOT_PUSH_TOKEN` belong to the workflow tickets that need them.
- Creating, editing or labelling GitHub issues. DEC-013 makes `publish_build_order.py` the only issue author.
- Transferring the repository to an organization or enabling a merge queue.
- Adding `.env` to `.gitignore` or any other repository-hygiene change outside the four files listed under Surfaces.

## Existing owner and reuse target

There is no existing owner: `.github/` does not exist at `e664d73a195facd64db58ba10952170ff01b4772` (`git ls-tree -r --name-only origin/main -- .github` returns nothing), and neither does `AGENTS.md`. All four files in the write surface are created new by this ticket.

Verified reuse targets, all outside this repository or created by a named upstream ticket:

| Target | Status |
|---|---|
| `/home/everdred/github/everdred/aiur/.github/pull_request_template.md` | Exists. Copy its section structure (`Closes #`, Context, TL;DR, Summary, Alternatives, Complexity routing, Test Plan) and replace the Elixir `make -C elixir all` line with this repo's npm gate. |
| `/home/everdred/github/everdred/aiur/.github/CODEOWNERS` | Exists. Copy the explanatory header comment style only; **do not** copy its `*` whole-repo rule. |
| `Aiur.GitHub.Labels` — `src/lib/aiur/github/labels.ex` in the aiur checkout | Exists. `@state_suffixes` at `labels.ex:25`, marker suffixes at `labels.ex:31-34`, `label_set/2` at `labels.ex:47-51`, `complexity_labels/0` at `labels.ex:104`, `describe/1` at `labels.ex:107-137`. This is the authority for label names and descriptions. |
| `/home/everdred/github/everdred/kevinweaver-dev/.aiur/config` | Exists at `origin/main`. `agent.routing` routes all five complexity levels to codex and the comment at `agent.routing` records that the default `rate_limit_fallback` "Requires the `model:claude` label to exist (KW-02)". |
| `/home/everdred/github/everdred/kevinweaver-dev/.aiur/prompt.md` | Exists at `origin/main`. The source of the branch, pre-PR gate, self-review and commit-message rules that `AGENTS.md` restates. |
| `.github/workflows/ci.yml` (publishes the `ci-ok` context) | **Created by KW-001**, not by this ticket. |
| `vitest.config.mts` | **Created by KW-011.** Referenced by CODEOWNERS before it exists — that is legal. |
| `playwright.config.ts` | **Created by KW-023.** |
| `.size-limit.json` | **Created by KW-030.** |
| `e2e/__screenshots__/**` | **Created by KW-031.** |

CODEOWNERS entries for paths that do not exist yet are valid: GitHub's CODEOWNERS syntax checker rejects unknown *owners*, not unknown paths, and a rule with no matching file simply never fires.

## Contract and invariants

This ticket produces three consumable seams. Two are GitHub state, one is a committed file.

**Seam 1 — the label inventory.** Consumed by `publish_build_order.py` at publication time and by the aiur daemon at dispatch time. The invariant is *superset*: the repository must contain at least every name below; extra labels are harmless. `gh label create --force` updates colour and description in place, so the whole step is safely re-runnable.

```jsonc
// The exact required inventory. build-lane:* entries must match
// build-order.json label_projection.workstreams values 1:1.
{
  "aiur_lifecycle_states": [
    "agent:todo", "agent:in-progress", "agent:ci-wait", "agent:human-review",
    "agent:rework", "agent:merging", "agent:done", "agent:error",
    "agent:cancelled", "agent:canceled"
  ],
  "aiur_markers": ["agent:watch", "agent:paused", "agent:rate-limit-fallback"],
  "model": ["model:claude"],
  "complexity": ["complexity:1", "complexity:2", "complexity:3", "complexity:4", "complexity:5"],
  "build_order_projection": [
    "build-order",
    "phase:1", "phase:2", "phase:3", "phase:4", "phase:5", "phase:6", "phase:7",
    "build-lane:platform", "build-lane:chrome", "build-lane:data", "build-lane:viz"
  ]
}
```

Notes on this shape, each independently verified:

- `agent:cancelled` **and** `agent:canceled` are both required. Both spellings are in `@state_suffixes` (`labels.ex:25`) and both are listed in `.aiur/config` `tracker.terminal_states`. Creating only one breaks state normalization.
- `model:claude` is required even though the fleet runs codex. `Aiur.GitHub.Labels.required_rate_limit_fallback_labels/1` (`labels.ex:72-74`) returns `["agent:rate-limit-fallback", "model:claude"]`, and `.aiur/config` leaves `rate_limit_fallback` at its default, so a rate-limited codex agent falls back to Claude and needs the label to exist.
- `complexity:5` is created even though this pack uses only complexities 1–4. `Labels.complexity_labels/0` (`labels.ex:104`) is `1..5`; creating the full range keeps `aiur init` a no-op and costs nothing. `build-order.json` `label_projection.complexities` must still list **only** `"1".."4"` — an unused key there is a validator error.
- `build-lane:*` and `phase:*` names must be read out of the pack's own `build-order.json` `label_projection` rather than assumed. If the workstream ids differ from the four above, the created labels must follow the manifest, not this sketch.

**Seam 2 — the `main` ruleset.** Consumed by every agent PR. The committed file is the source of truth; the live ruleset is its applied form.

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": true,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "ci-ok" }]
      }
    }
  ]
}
```

Invariants encoded above, and the three deliberate deviations from `docs/research/2026-07-31-ci-testing.md` §10.3:

1. **`required_status_checks` holds exactly one context, `ci-ok`.** §10.3 lists `ci-ok` and `e2e-ok`. `e2e-ok` does not exist until KW-023 merges, and GitHub does not validate that a context is reachable — an unreachable required context leaves every PR permanently "Expected — Waiting for status". Adding `e2e-ok` (and the Vercel status context, whose exact name must be read off a real PR) is a later governance change to this same file, not part of this ticket.
2. **`require_code_owner_review: true`** where §10.3 has `false`. DEC-012 and §10.6 both land on the same posture: review count 0 for product code, code-owner review for the safety net itself. §10.3's JSON was written before that conclusion.
3. **`dismiss_stale_reviews_on_push: false`** where §10.3 has `true`. §10.3 calls it "harmless at count 0"; with code-owner review required it is not harmless — every push to a gate-file PR would dismiss the one approval and stall the agent. At `required_approving_review_count: 0` the flag has no other effect.

The `pull_request` rule is present *because* it is what makes direct pushes to `main` impossible, including by agents. The review count being 0 is orthogonal to that safety property.

**Seam 3 — `AGENTS.md`.** Consumed by every coding agent at pickup. Its invariants are prose, and they are quoted verbatim by `.aiur/prompt.md`: npm only and exactly one lockfile; the verify command is `npm ci && npm run typecheck && npm run lint && npm run build`; the branch is read from `git branch --show-current` and never reconstructed; issues are never created by hand.

## Refreshable implementation notes

Refresh every command and path against the pickup commit before running. This section is accurate at `e664d73a195facd64db58ba10952170ff01b4772`.

### Files to create (exactly four; no others)

```
.github/CODEOWNERS
.github/pull_request_template.md
.github/rulesets/main.json
AGENTS.md
```

### 1. `.github/rulesets/main.json`

Write the JSON from Seam 2 verbatim. Validate it locally before applying:

```bash
jq -e . .github/rulesets/main.json > /dev/null
```

### 2. `.github/CODEOWNERS`

```
# Gate files only.
#
# Everything not listed here is intentionally unowned: with
# required_approving_review_count: 0, ordinary product PRs self-merge once
# ci-ok is green. A PR that touches any path below additionally requires
# review from the code owner, so an agent cannot weaken a gate in the same
# PR that needs the gate weakened.
#
# Comments from the accounts below are authoritative for agents in this repo;
# any other commenter is advisory.

/.github/                @its-everdred
/AGENTS.md               @its-everdred
/playwright.config.ts    @its-everdred
/vitest.config.mts       @its-everdred
/.size-limit.json        @its-everdred
/e2e/__screenshots__/    @its-everdred
```

`/.github/` with the trailing slash matches the directory and everything beneath it, which covers `ci.yml`, `e2e.yml`, `snapshots.yml`, `CODEOWNERS` itself and `rulesets/main.json`.

### 3. `AGENTS.md`

Root of the repository. It must state, at minimum, each of the following. Keep it short — it is read on every pickup.

- **Package manager.** npm only. Never run `yarn`, never reintroduce `yarn.lock`. The repository has exactly one lockfile, `package-lock.json`. Never add `packageManager` to `package.json` (C-14: it is either a no-op or a hard Corepack failure on Vercel).
- **Frozen dependency surface (DEC-003).** `package.json` and `package-lock.json` are owned by KW-001 and frozen afterwards. The full dependency set is pre-installed. If a ticket appears to need a new dependency, stop and escalate to the Executor instead of editing either file.
- **No framework or host changes.** Next.js on Vercel, App Router. Do not introduce Astro, Vite, Netlify, or a static export.
- **The verify contract.** `npm ci && npm run typecheck && npm run lint && npm run build` must be green before a PR is opened. `npm run build` is the single most important gate; a failing Next build breaks the deployed site.
- **Branch and base.** The branch is `aiur/<issue-number>` or `aiur/<issue-number>-<slug>` and is already checked out. Read it with `git branch --show-current`; never reconstruct the ref. The base branch is `main`, taken from `$AIUR_BASE_BRANCH`, never inferred from `origin/HEAD`.
- **Issues (DEC-013).** Never run `gh issue create`. Build Order issues and their dependency edges are created solely by `publish_build_order.py`; a hand-created issue silently drops the `depends_on` graph that aiur enforces.
- **Gate files.** `.github/**`, `playwright.config.ts`, `vitest.config.mts`, `.size-limit.json` and `e2e/__screenshots__/**` are code-owner reviewed. Do not weaken a gate — no `test.skip`, no `test.only`, no raising `maxDiffPixelRatio` — in the same PR that the gate is failing.
- **Commit messages and PR bodies.** 3–7 words, imperative, subject line only. This repository's git history is public and is itself displayed by the site. Attribute authorship only to the human author — no tool, model, or automation co-authorship trailers or mentions anywhere in a commit message or PR body.
- **Design authority.** `docs/design/kevinweaver.dev.dc.html` is the visual source of truth and `docs/design/_ds/**` holds the real token values; do not invent hexes and do not vendor `docs/design/support.js`.

### 4. `.github/pull_request_template.md`

Adapt `/home/everdred/github/everdred/aiur/.github/pull_request_template.md`: keep the `Closes #`, Context, TL;DR, Summary, Alternatives and Complexity-routing sections verbatim, and replace the Elixir Test Plan block with:

```markdown
#### Test Plan

- [ ] `npm ci`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] <!-- Additional targeted checks (list below) -->
```

### 5. The `gh` mutations, in this order

Run them from the repository root with the ambient `gh` credential. Nothing here needs the `workflow` scope; `repo` (already granted, GT-10) is sufficient for repository administration on a repo you own.

```bash
REPO=its-everdred/kevinweaver-dev

# 5a. Labels — idempotent; --force updates colour/description in place.
#     Read build-lane:* and phase:* out of the pack manifest rather than
#     hardcoding, so the inventory can never drift from label_projection.
BO=docs/build-orders/site-rewrite/build-order.json

for s in todo in-progress ci-wait human-review rework merging done error cancelled canceled \
         watch paused rate-limit-fallback; do
  gh label create "agent:$s" --repo "$REPO" --color "0E8A16" --force \
    --description "aiur agent lifecycle: $s"
done
gh label create "model:claude" --repo "$REPO" --color "1D76DB" --force \
  --description "route this issue to claude"
for n in 1 2 3 4 5; do
  gh label create "complexity:$n" --repo "$REPO" --color "FBCA04" --force \
    --description "story-point complexity $n"
done
gh label create "build-order" --repo "$REPO" --color "5319E7" --force \
  --description "Build Order planning root"
jq -r '.label_projection.phases[], .label_projection.workstreams[], .label_projection.required_ticket_labels[]' "$BO" \
  | sort -u \
  | while read -r name; do
      gh label create "$name" --repo "$REPO" --color "D4C5F9" --force \
        --description "Build Order label"
    done

# 5b. Merge settings.
gh api -X PATCH "repos/$REPO" \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY

# 5c. Least-privilege Actions token (closes the GT-11 hole).
gh api -X PUT "repos/$REPO/actions/permissions/workflow" \
  -f default_workflow_permissions=read \
  -F can_approve_pull_request_reviews=false

# 5d. Ruleset. bypass_actors on a User-owned repo is UNVERIFIED (C-21).
#     If this POST returns 422, strip the whole bypass_actors key and retry.
gh api -X POST "repos/$REPO/rulesets" --input .github/rulesets/main.json \
  || { jq 'del(.bypass_actors)' .github/rulesets/main.json > /tmp/main-nobypass.json \
       && gh api -X POST "repos/$REPO/rulesets" --input /tmp/main-nobypass.json \
       && cp /tmp/main-nobypass.json .github/rulesets/main.json; }
```

If the fallback branch runs, the committed file must be updated to match what was actually applied — that is what the final `cp` does. Record the 422 in the PR body.

Worked verification fixture — the exact JSON the ruleset read-back must produce for the parameters this ticket cares about:

```json
{
  "name": "main",
  "enforcement": "active",
  "required_status_checks": ["ci-ok"],
  "required_approving_review_count": 0,
  "require_code_owner_review": true,
  "strict_required_status_checks_policy": false,
  "allowed_merge_methods": ["squash"]
}
```

produced by:

```bash
gh api "repos/$REPO/rulesets" --jq '.[] | select(.name=="main") | .id' \
  | xargs -I{} gh api "repos/$REPO/rulesets/{}" --jq '{
      name, enforcement,
      required_status_checks: [.rules[] | select(.type=="required_status_checks") | .parameters.required_status_checks[].context],
      required_approving_review_count: (.rules[] | select(.type=="pull_request") | .parameters.required_approving_review_count),
      require_code_owner_review: (.rules[] | select(.type=="pull_request") | .parameters.require_code_owner_review),
      strict_required_status_checks_policy: (.rules[] | select(.type=="required_status_checks") | .parameters.strict_required_status_checks_policy),
      allowed_merge_methods: (.rules[] | select(.type=="pull_request") | .parameters.allowed_merge_methods)
    }'
```

### Ordering against KW-001

KW-001 and KW-002 are the two wave-1 tickets and have no edge between them, so either may merge first. If KW-002's ruleset lands on `main` before `ci.yml` does, `ci-ok` is still satisfiable on KW-001's own PR, because `.github/workflows/ci.yml` runs from the PR head on the `pull_request` trigger and reports the context there. No other PR exists at that moment — every wave-2 ticket depends on KW-001. Do not attempt to coordinate the two merges beyond that; do not add a `depends_on` edge.

### Rollbacks

| Mutation | Rollback |
|---|---|
| Ruleset deadlocks the fleet | `gh api -X PUT "repos/$REPO/rulesets/<id>" --input <patched.json>` with `"enforcement": "disabled"`, or `gh api -X DELETE "repos/$REPO/rulesets/<id>"` |
| Auto-merge / squash settings | Re-run 5b with the inverted flags |
| Actions token too restrictive for a later workflow | Grant per-workflow `permissions:` in that workflow's YAML rather than reverting the repository default |
| CODEOWNERS blocks a PR | Narrow the pattern in `.github/CODEOWNERS`; the owner can also merge with the admin bypass actor if 5d accepted it |

## Acceptance and verification

### Agent gate

- `gh label list --repo its-everdred/kevinweaver-dev --limit 200` lists all ten `agent:` lifecycle labels (including both `agent:cancelled` and `agent:canceled`), all three `agent:` markers, `model:claude`, `complexity:1`..`complexity:5`, `build-order`, `phase:1`..`phase:7`, and one `build-lane:<id>` label for every workstream declared in `docs/build-orders/site-rewrite/build-order.json`.
- `gh api repos/its-everdred/kevinweaver-dev --jq '[.allow_auto_merge,.delete_branch_on_merge,.allow_squash_merge,.allow_merge_commit,.allow_rebase_merge]'` returns `[true,true,true,false,false]`.
- `gh api repos/its-everdred/kevinweaver-dev/actions/permissions/workflow` returns exactly `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}`.
- `gh api repos/its-everdred/kevinweaver-dev/rulesets --jq 'length'` is at least 1, and the read-back of the `main` ruleset matches the worked fixture in the implementation notes: `enforcement` `active`, exactly one required status check `ci-ok`, `required_approving_review_count` 0, `require_code_owner_review` true, `strict_required_status_checks_policy` false, `allowed_merge_methods` `["squash"]`.
- `jq -e . .github/rulesets/main.json` parses, and the committed file matches what was actually applied (relevant only if the `bypass_actors` fallback fired).
- `git diff --name-only origin/main...HEAD` lists exactly `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/rulesets/main.json`, `AGENTS.md` and nothing else — in particular nothing under `.github/workflows/`, and neither `package.json` nor `package-lock.json`.
- `AGENTS.md` contains the literal string `npm ci && npm run typecheck && npm run lint && npm run build`, forbids `yarn`, forbids `gh issue create`, and names `git branch --show-current` as the only way to read the branch.
- `grep -rn "merge_group" .github/` returns nothing (C-21: merge queue is unavailable on this repo and dead config misleads agents).

### At-merge gate

- This PR is squashed into `main` on verified-local-green evidence rather than on a `ci-ok` status, per GATE-006: no workflow exists on `main` while wave 1 is in flight. Every subsequent ticket requires the real `ci-ok` status.
- A scratch PR opened against current `main` accepts `gh pr merge --squash --auto`, proving `allow_auto_merge` took effect; the scratch PR is then closed and its branch deleted.
- A scratch PR that touches a CODEOWNERS-covered path (for example `.github/CODEOWNERS` itself) is observed to be blocked pending code-owner review, while a scratch PR touching only `README.md` is not — proving the CODEOWNERS scope is narrow rather than repository-wide. Record both observations in the PR body; if a gate-file PR authored by the code owner cannot be unblocked (GitHub does not allow a PR author to satisfy their own code-owner review), record it and escalate to the Executor before merging any workflow-touching ticket.
- After merge, `gh api repos/its-everdred/kevinweaver-dev/rulesets --jq '.[] | select(.name=="main") | .enforcement'` returns `active`.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Security — this is the security ticket of wave 1.** The repository currently hands every workflow a write-scoped `GITHUB_TOKEN` and lets Actions approve pull requests (GT-11). Step 5c closes both. Least privilege is set *before* the first workflow lands, so no window exists in which `ci.yml` runs with a write token. Consequences to expect and not to "fix" by reverting: any later workflow that genuinely needs write access must declare a narrow per-job `permissions:` block; and because `GITHUB_TOKEN`-driven events do not start new workflow runs (GitHub Actions security docs, confirmed in `docs/research/2026-07-31-ci-testing.md` §10.5), a workflow that auto-merges or pushes to a PR branch must use a fine-grained PAT (`AUTOMERGE_TOKEN`, `SNAPSHOT_PUSH_TOKEN`) — those are owned by the workflow tickets, not by this one.

**Failure — deadlocking the fleet is the realistic blast radius.** Three specific ways and their guards: (a) a required status context that nothing publishes leaves every PR at "Expected — Waiting for status", which is why exactly one context, `ci-ok`, is required and why `e2e-ok` is deliberately excluded; (b) `strict_required_status_checks_policy: true` without a merge queue makes each merge invalidate every open PR, which is why it is false (DEC-012); (c) a whole-repo CODEOWNERS rule plus `require_code_owner_review: true` blocks every agent PR, which is why the file lists six specific paths. Each has a one-command rollback in the implementation notes.

**Failure — non-atomic mutations.** Steps 5a–5d are four separate API calls with no transaction. All four are idempotent: `gh label create --force` upserts, the two settings calls are declarative PATCH/PUT, and a duplicate ruleset POST is detectable by name (`gh api repos/$REPO/rulesets --jq '.[].name'`) and removable by `DELETE`. If the run is interrupted, re-run from the top.

**Failure — `bypass_actors` on a User-owned repository is unverified** (C-21). Handle the 422 with the documented fallback rather than guessing another `actor_id`; without a bypass actor the repository owner can still edit or disable the ruleset from the API or the settings UI in seconds.

**Migration.** None. Nothing is deleted, no existing file is rewritten, and there is no data or schema to migrate. The nine GitHub default labels are left untouched.

**Accessibility.** Not applicable — this ticket ships no user-facing surface. Site accessibility is owned by KW-003 (global layer) and gated by KW-029.

## Surfaces

- Reads: `.aiur/config`, `.aiur/prompt.md`, `docs/build-orders/site-rewrite/build-order.json`, `docs/research/2026-07-31-ci-testing.md`
- Writes: `.github/CODEOWNERS`, `.github/pull_request_template.md`, `.github/rulesets/main.json`, `AGENTS.md`
- Contracts: `agent-contract:AGENTS.md`, `github-governance:label-inventory`, `github-governance:ruleset-main`
- Safety: `github-governance:branch-protection-main`, `github-governance:actions-token-permissions`

## Sibling boundaries and open gates

**Wave-1 sibling.** KW-001 owns the entire toolchain and `.github/workflows/ci.yml`, and is the only ticket that may create the `ci-ok` context. It also owns `package.json`, `package-lock.json`, the `yarn.lock` deletion, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.nvmrc`, `vercel.json` and `scripts/ci/assert-pins.mjs`. KW-002 touches none of them. The two tickets share no file and have no edge; they run fully in parallel.

**Downstream governance boundary.** `.github/rulesets/main.json` and the live `main` ruleset are owned solely by KW-002. KW-023 (`e2e-ok`), KW-030 (size budgets) and KW-031 (snapshot workflow) each add checks, but **must not** add their contexts to the ruleset or declare `github-governance:branch-protection-main` as a surface — promoting a check to *required* is a governance change that goes through this file, coordinated by the Executor. The same applies to the Vercel deployment status context, whose exact name has to be read off a real PR first.

**Downstream consumers.** Every published ticket issue carries the projection labels created here; if any is missing, `publish_build_order.py` fails closed with `"required labels must already exist and will not be invented"`. KW-032 depends directly on KW-002 and re-verifies the governance posture as part of the capstone.

**Open gates.**

- **GATE-006 blocks the merge condition, not the work.** No CI exists on `main` while wave 1 is in flight, so this ticket's PR is merged on verified-local-green evidence plus `ce-code-review`. Do not wait for a `ci-ok` status on this PR.
- **GATE-002 (`workflow` OAuth scope) does not block this ticket** and must not be worked around inside it. If the work appears to require a file under `.github/workflows/`, the scope has been misread — stop and re-read the Non-goals.
- **GATE-001 (push `origin/main`) is closed** — the remote was switched to HTTPS and `main` now carries `docs/`, `.aiur/` and the design system.
- **GATE-003, GATE-004, GATE-005 and GATE-007 are unrelated** to this ticket: they gate the SSO PAT (KW-010/014/028), the Vercel dashboard facts (KW-001 deploy verification, KW-032), the content decisions (KW-006 and its dependants) and the scanline treatment (KW-003).
