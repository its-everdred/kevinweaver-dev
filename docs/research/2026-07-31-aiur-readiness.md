# Aiur Execution Readiness — kevinweaver-dev

Research date: 2026-07-31. All facts marked **(M)** were measured on this machine
with the command shown; **(I)** marks inference.

Sources of truth read in full:
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/references/planning-contract.md`
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/references/decomposition-workflow.md`
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/references/build-order.example.json`
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/references/publication.example.json`
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/references/example-tickets/*`
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/scripts/validate_build_order.py` and every `validation_*.py`
- `/home/everdred/github/everdred/aiur/.claude/skills/aiur-run/SKILL.md` + `references/executor.md`
- `/home/everdred/github/everdred/aiur/.aiur/{config,config.croptracker,hooks,prewarm,examples/*}`
- `/home/everdred/github/everdred/aiur/src/lib/aiur/**` (Elixir config schema, CLI, init, distribution, labels, ticket branch)
- `/home/everdred/github/everdred/aiur/packaging/npm/aiur-cli/libexec/aiur-engine.sh` (the launcher engine — this is where node identity is derived)

---

## 0. Executive answer up front

1. **The build-order schema is CLOSED (`strict_object`).** Every root key, every
   ticket key, every nested object key must be present and no unknown key is
   allowed. Missing key ⇒ error; extra key ⇒ error. Section 1 enumerates all of them.
2. **Aiur does NOT read `build-order.json` at runtime.** Agents are dispatched
   from **GitHub issues carrying `agent:*` labels**. `build-order.json` is a
   *planning* artifact validated by a Python script and materialized into GitHub
   issues. Section 9.
3. **`aiur init` is interactive-only** — no non-interactive flags. But it only
   writes 5 files, all of which can be written by hand. Section 6.
4. **A second aiur node for kevinweaver-dev is provably safe once the repo has a
   repo-local `.aiur/config`.** The instance key is `sha256(project_root)[0:10]`.
   Right now kevinweaver-dev has no repo-local config, so the launcher walks up
   and lands on `$HOME`, colliding with every other config-less project. Section 7.
5. **Blocking preconditions before any agent runs:** push local `main`
   (currently 1 commit ahead of origin), add the `agent:*` label set, add a
   `test`/verify script, and grant the `workflow` token scope if any ticket
   touches `.github/workflows/`. Section 8.

---

## 1. `build-order.json` — complete schema

### 1.1 Where it is enforced

`validate_build_order.py` is a thin CLI. The real schema lives in:

| Module | Enforces |
|---|---|
| `validation_common.py` | ID regexes, `strict_object`, `checked_string_list`, path sanitizer |
| `validation_header.py` | `TOP_KEYS`, identity, workstreams, `feature_boundary`, `label_projection`, `external_gates` |
| `validation_requirements.py` | `requirements[]` + dispositions |
| `validation_records.py` | `design_evidence[]`, `decisions[]`, cross-refs |
| `validation_tickets.py` | `TICKET_KEYS`, per-ticket field types, `acceptance`, `conflict_exceptions` |
| `validation_documents.py` | required markdown headings inside each ticket doc |
| `validation_graph.py` | edge resolution, symmetry, cycles, hierarchy, phases |
| `validation_outcome.py` | label coverage, surface conflicts, capstone/epic acceptance |
| `validation_github.py` / `validation_github_receipt.py` | `github_root`, per-ticket `github`, `github_reconciliation` (receipt v3) |
| `validation_publication_authority.py` | `publication.json` |

**(M)** Strictness proof — `validation_common.py:70-81`:

```python
def strict_object(value, label, required, report):
    if not isinstance(value, dict):
        report.error(f"{label} must be an object"); return None
    keys = set(value)
    for key in sorted(required - keys):
        report.error(f"{label}: missing required key {key}")
    for key in sorted(keys - required):
        report.error(f"{label}: unknown key {key}")
    return value
```

`required` is used as *exactly* the allowed key set. There are no optional keys —
only keys whose **value** may be `null`.

### 1.2 Regexes and enums (`validation_common.py:13-26`) (M)

```python
TICKET_ID   = ^[A-Z][A-Z0-9]*-[0-9]{3,}[A-Z]?$     # BO-001, KW-014, KW-014A
REQ_ID      = ^[A-Z][A-Z0-9]*-[0-9]{3,}$           # REQ-001
DECISION_ID = ^DEC-[0-9]{3,}$
DESIGN_ID   = ^DESIGN-[0-9]{3,}$
GATE_ID     = ^GATE-[0-9]{3,}$
SLUG        = ^[a-z0-9]+(?:-[a-z0-9]+)*$
REPOSITORY  = ^[^/\s]+/[^/\s]+$
SHA         = ^[0-9a-fA-F]{40}$
KINDS          = {executable, audit, gate, umbrella, capstone}
RUNNABLE_KINDS = {executable, audit, gate, capstone}      # umbrella is NOT runnable
PROVENANCE     = {planned, discovered}
DISPOSITIONS   = {ticket, deferred, rejected, satisfied}
EDGE_FIELDS    = (depends_on, serializes_with, suggested_after)
SURFACE_FIELDS = (write_surfaces, contract_surfaces, safety_surfaces)
```

Note `strict_int(value) is: type(value) is int` — **a JSON float like `1.0` fails**;
and `True` is rejected because `type(True) is bool`, not `int`.

### 1.3 Root object — all 17 keys REQUIRED (`validation_header.py:21-27`) (M)

| Key | Type | Rule |
|---|---|---|
| `schema_version` | int | must be exactly `1` |
| `build_order_id` | string | must be `"<repository>:<lowercase-slug>"`; the suffix after `owner/repo:` must match `SLUG` |
| `ticket_prefix` | string **or** array of strings | each item uppercase alnum, first char alpha (`"KW"`, or `["KW","INFRA"]`) |
| `plan_version` | int | `>= 1` |
| `repository` | string | `owner/repo` |
| `researched_at_commit` | string | exact 40-hex Git SHA |
| `workstreams` | array | non-empty; each `{id, title}`, `id` matches `SLUG`, unique |
| `github_root` | object or `null` | pre-publication: `null` |
| `github_reconciliation` | object or `null` | pre-publication: `null` |
| `label_projection` | object | see 1.4 |
| `feature_boundary` | object | see 1.5 |
| `external_gates` | array | may be `[]`; each `{id,title,owner,resolution_criteria}` |
| `requirements` | array | **non-empty**; see 1.6 |
| `design_evidence` | array | may be `[]`; see 1.7 |
| `decisions` | array | **non-empty**; see 1.8 |
| `tickets` | array | **non-empty**; see 1.9 |
| `epic_acceptance` | object | `{owner_ticket_id, evidence}` |

### 1.4 `label_projection` — exactly 6 keys (`validation_header.py:32-35, 109-144`) (M)

```jsonc
{
  "build_order": "build-order",                  // non-empty string, ROOT-ONLY label
  "workstreams": {"<workstream-id>": "<label>"}, // keys must EXACTLY equal the set of workstream ids
  "phases":      {"1": "phase:1", "2": "phase:2"},        // keys = stringified set of every ticket phase_hint
  "complexities":{"2": "complexity:2", "3": "complexity:3"}, // keys = stringified set of every ticket complexity_points
  "required_ticket_labels": ["model:codex"],     // array of strings, may be []
  "forbidden_labels": ["agent:todo", "agent:in-progress", "agent:rework", "agent:merging"]
}
```

Enforcement details:
- `validate_label_coverage` (`validation_outcome.py:18-51`) errors on **missing
  key** *and* on **unused key** for `workstreams`/`phases`/`complexities`. If no
  ticket has `phase_hint: 3`, you may not list `"3"`.
- Labels within a mapping must be unique; **all labels across the whole
  projection** (`build_order` + `required_ticket_labels` + all three mappings)
  must be unique case-insensitively.
- `required_ticket_labels ∩ forbidden_labels = ∅` (case-insensitive).

### 1.5 `feature_boundary` — exactly 6 keys (`validation_header.py:28-31, 92-106`) (M)

| Key | Type | Rule |
|---|---|---|
| `acceptance_criteria` | array of non-empty strings | **must be non-empty** |
| `critical_path_ticket_ids` | array | **non-empty**; every ID must resolve to a **runnable** ticket, and must include the capstone |
| `required_documentation` | array | may be `[]` |
| `required_cleanup` | array | may be `[]` |
| `end_to_end_proof` | array | **must be non-empty** |
| `completion_condition` | string | non-empty |

All arrays reject duplicate values (`checked_string_list`).

### 1.6 `requirements[]` — exactly 5 keys (`validation_requirements.py`) (M)

```jsonc
{"id": "REQ-001", "summary": "…", "disposition": "ticket",
 "ticket_ids": ["KW-001"], "reason": null}
```

- `disposition: "ticket"` ⇒ `ticket_ids` non-empty **and** `reason` must be `null`.
- `disposition: "deferred"|"rejected"|"satisfied"` ⇒ `ticket_ids` **must be `[]`**
  and `reason` must be a non-empty string.
- Bidirectional traceability enforced (`validation_graph.py:38-55`): if
  `REQ-001.ticket_ids` contains `KW-001`, then `KW-001.requirement_refs` must
  contain `REQ-001`, and vice versa.

### 1.7 `design_evidence[]` — exactly 5 keys (`validation_records.py:21`) (M)

```jsonc
{"id":"DESIGN-001","source":"https://…","captured_at":"2026-07-31T00:00:00Z",
 "artifact":"evidence/design.md","sha256":"<64 hex>"}
```
- `artifact` is resolved **relative to the directory containing `build-order.json`**,
  must be a real regular file, must not be a symlink, must not escape that dir.
- SHA-256 of the artifact's bytes must equal `sha256` (case-insensitive).
- **Every** design-evidence ID must be referenced by at least one decision or
  ticket, else `"design evidence is not referenced"`.
- `captured_at` is only checked as a non-empty string here (the RFC3339 helper
  exists but is not applied to this field).

### 1.8 `decisions[]` — exactly 5 keys, array must be NON-EMPTY (`validation_records.py:22, 71-101`) (M)

```jsonc
{"id":"DEC-001","summary":"…","status":"accepted",
 "rationale":"…","design_evidence_refs":["DESIGN-001"]}
```
- `status ∈ {accepted, rejected}`.
- **Every `accepted` decision must be referenced by at least one ticket's
  `decision_refs`** — an unreferenced accepted decision is an error.
- A ticket may not reference a `rejected` decision.

### 1.9 `tickets[]` — exactly 31 keys (`validation_tickets.py:25-34`) (M)

```jsonc
{
  "id": "KW-001",                        // matches TICKET_ID and the ticket_prefix
  "kind": "executable",                  // executable|audit|gate|umbrella|capstone
  "provenance": "planned",               // planned|discovered
  "introduced_in_plan_version": 1,       // int, 1 <= v <= plan_version
  "discovered_from": null,               // null when planned; a TICKET_ID when discovered
  "title": "…",                          // non-empty
  "document": "tickets/KW-001-slug.md",  // path relative to build-order.json's dir
  "outcome": "…",                        // non-empty
  "scope": ["…"],                        // NON-EMPTY array
  "non_goals": ["…"],                    // NON-EMPTY array
  "phase_hint": 1,                       // int >= 1 (required even for umbrellas)
  "complexity_points": 3,                // runnable: int 1..5 ; umbrella: MUST be null
  "complexity_rationale": "…",           // runnable: non-empty ; umbrella: may be null
  "risk": "low",                         // runnable: non-empty string ; umbrella: may be null
                                         //   NOTE: free-form string, no enum enforced
  "capability_requirements": ["frontend"],// runnable: NON-EMPTY ; umbrella: may be []
  "workstream": "shell",                 // must be a declared workstream id
  "requirement_refs": ["REQ-001"],       // runnable: NON-EMPTY ; umbrella: may be []
  "depends_on": [],                      // arrays of TICKET_IDs, may be []
  "serializes_with": [],
  "suggested_after": [],
  "contains": [],                        // ONLY umbrellas may be non-empty
  "external_gates": [],                  // GATE_IDs declared at root
  "read_surfaces": [],
  "write_surfaces": [],
  "contract_surfaces": [],
  "safety_surfaces": [],
  "conflict_exceptions": [],             // see below
  "decision_refs": ["DEC-001"],
  "design_evidence_refs": [],
  "acceptance": {"agent_gate": [], "at_merge_gate": [], "human_or_e2e": []},
  "github": null
}
```

`acceptance` — exactly 3 keys (`validation_tickets.py:35, 39-56`):
- runnable ⇒ `agent_gate` **non-empty** AND `at_merge_gate` **non-empty**;
  `human_or_e2e` optional (but **required non-empty on the capstone**, see 1.10).
- umbrella ⇒ all three lists **must be empty**.

`conflict_exceptions[]` — exactly 3 keys `{ticket_id, surfaces, reason}`:
- `surfaces` must be non-empty; `reason` non-empty; one exception per target
  ticket per ticket; the pair may be declared only once across both directions
  (`validation_outcome.py:70-72`); the named surfaces must genuinely overlap.

`github` (per ticket) and `github_root` — exactly 4 keys when non-null:
`{repository, number, node_id, url}` with `url == "https://github.com/<repository>/issues/<number>"`.
A ticket `github` cannot exist without `github_root`. Keep both `null` until
publication.

### 1.10 Graph / global invariants (M)

From `validation_graph.py` + `validation_outcome.py`:

1. Edge targets must exist and cannot be self-edges.
2. `serializes_with` **must be symmetric** — if A lists B, B must list A.
3. `suggested_after` **must not be bidirectional**.
4. A given unordered pair may carry **only one** edge type across
   `depends_on|serializes_with|suggested_after|contains` — mixing them errors
   with `contradictory edge types`.
5. `depends_on` graph must be acyclic; `contains` hierarchy must be acyclic and
   a child may have only one umbrella parent.
6. A ticket's `phase_hint` may not be **lower** than any of its `depends_on`
   targets' `phase_hint`. Equal is allowed.
7. Only umbrellas may have `contains`, and an umbrella must contain ≥ 1 ticket.
8. **Exactly one** ticket with `kind: "capstone"`. `epic_acceptance.owner_ticket_id`
   must be that capstone, the capstone must be in `feature_boundary.critical_path_ticket_ids`,
   the capstone's `acceptance.human_or_e2e` must be non-empty, and the capstone's
   **transitive `depends_on` closure must contain every other runnable ticket**.
   (This is the single most constraining rule: your capstone must ultimately
   depend on every executable/audit/gate ticket.)
9. Two runnable tickets that are neither hard-ordered (`depends_on` closure) nor
   `serializes_with` and that overlap on a **safety surface** ⇒ **error** unless a
   `conflict_exceptions` entry covers it. Overlap on non-safety surfaces
   (`write_surfaces`, `contract_surfaces`) ⇒ **warning**.

### 1.11 `github_reconciliation` (receipt v3) — only after publication

Exactly 14 keys (`validation_github_receipt.py:24-38`) (M):
`receipt_schema_version` (must be `3`), `checked_at`, `approved_planning_commit`,
`root_node_id`, `member_ticket_ids`, `dependency_edges` (`[{ticket_id, depends_on}]`),
`projected_labels`, `observed_labels`, `expected_issue_titles`,
`observed_issue_titles`, `observed_issue_states`, `observed_body_evidence`,
`marker_query_matches`. **Keep this `null` for authoring.**

### 1.12 Proof the schema is authorable first-try (M)

I hand-authored a minimal kevinweaver-dev build order from this document alone
and it validated clean on the first execution:

```
$ python3 /home/everdred/github/everdred/aiur/.claude/skills/aiur-build/scripts/validate_build_order.py \
    /tmp/bo-probe/build-order.json
validation: 0 error(s), 0 warning(s)
```

(Two tickets: `KW-001` executable + `KW-002` capstone; `design_evidence: []`,
`external_gates: []`, one `DEC-001`, two `REQ-*`. The only first-attempt failure
was a 39-character fake SHA — the validator caught it immediately with
`researched_at_commit must be a 40-character Git SHA`.)

Run the validator as:
```bash
python3 /home/everdred/github/everdred/aiur/.claude/skills/aiur-build/scripts/validate_build_order.py \
  docs/build-orders/<slug>/build-order.json
```
Exit 0 = clean. Repo-root/root-document/receipt flags are only for
post-publication verification.

---

## 2. `publication.json` — complete schema

Enforced by `validation_publication_authority.py:24-30, 111-150` (M). Exactly 5
keys, all required, no unknown keys:

```jsonc
{
  "trusted_repository_ref": "refs/heads/main",     // string; must be a full refs/heads/... branch
  "root_document": "docs/build-orders/<slug>/root-issue.md",
                                                   // safe repository-relative path (no .., no leading /, no .git segment)
  "mutation_repositories": ["its-everdred/kevinweaver-dev"],
                                                   // NON-EMPTY array of owner/repo
  "reference_only_issue_urls": [],                 // array; each must match
                                                   // ^https://github\.com/[^/\s]+/[^/\s]+/issues/[1-9][0-9]*$
  "tracker_lifecycle_label_prefix": "agent"        // one label segment, must NOT contain ':'
}
```

Semantics:
- It is loaded **from Git history at both the approval commit and the receipt
  commit** and the two typed records must be byte-equivalent after parsing.
- It is the *only* source of mutation authority: `--root-document` passed to the
  validator must equal `root_document`, and any `github`/`github_root` mapping
  outside `mutation_repositories` is an error, as is mapping an issue whose URL
  appears in `reference_only_issue_urls`.
- `tracker_lifecycle_label_prefix` must equal the aiur config's
  `tracker.github.label_prefix` (`agent`) or the label-drift check will fail.

It lives as a sibling of `build-order.json`
(`validate_build_order.py:46` computes `<pack>/publication.json`).

---

## 3. Ticket document shape

`validation_documents.py` (M). For **runnable** kinds
(`executable|audit|gate|capstone`) the file must satisfy all of:

1. **First line** matches `^#\s+(?:BO:\s+)?<TICKET_ID>(\s|—|-)` — i.e.
   `# KW-001 — Title` or `# BO: KW-001 — Title`.
2. Somewhere on its own line: `**Kind:** <kind>` where `<kind>` equals the JSON
   `kind` exactly.
3. Somewhere on its own line: `**Researched at:** <researched_at_commit>` — the
   full 40-char SHA from the root record.
4. A line starting `**Requirements:**` containing **every** ID in
   `requirement_refs` (word-boundary match).
5. These **11 level-2 headings, verbatim, each on its own line** (regex
   `^##\s+<heading>\s*$`), in any order but conventionally in this order:

```
## Outcome
## Context and evidence
## Scope
## Non-goals
## Existing owner and reuse target
## Contract and invariants
## Refreshable implementation notes
## Acceptance and verification
## Failure, security, migration, and accessibility cases
## Surfaces
## Sibling boundaries and open gates
```

The `### Agent gate` / `### At-merge gate` / `### Human/manual evidence`
sub-headings under *Acceptance and verification* are **convention from the
planning contract and example tickets, not validator-enforced** (M — no `###`
check exists in `validation_documents.py`). Include them anyway; the publisher
copies the document verbatim into the issue body and workers read it.

For **umbrella** tickets, `validate_document` returns after the `**Kind:**`
check — no headings, no `Researched at`, no requirements line. See
`references/example-tickets/BO-003-example-umbrella.md`, which is 5 lines long.

**Canonical runnable-ticket template (from `planning-contract.md:181-258`):**

```markdown
# KW-004 — Render selectable Build Orders

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — New presenter and interactive selector

**Risk:** medium

**Phase hint:** 2

**Depends on:** KW-002

**Serializes with:** none

**Requirements:** REQ-001, REQ-004

**Researched at:** <40-char sha>

## Outcome
## Context and evidence
## Scope
## Non-goals
## Existing owner and reuse target
## Contract and invariants
## Refreshable implementation notes
## Acceptance and verification
### Agent gate
### At-merge gate
### Human/manual evidence
## Failure, security, migration, and accessibility cases
## Surfaces
- Reads:
- Writes:
- Contracts:
## Sibling boundaries and open gates
```

Once published, the document is **frozen byte-for-byte** — any later edit
invalidates the receipt.

---

## 4. Edge types and scheduling semantics

Definitions from `decomposition-workflow.md:172-181` and the validator (M):

| Edge | Direction | Blocks dispatch? | Validator rules |
|---|---|---|---|
| `depends_on` | forward, hard | **Yes** — semantic start/merge prerequisite | acyclic; dependent's `phase_hint` ≥ prerequisite's; feeds the transitive closure used for capstone coverage and surface-conflict ordering |
| `serializes_with` | **symmetric** | Not a prerequisite; prevents *concurrent* execution/merge | must be declared on both tickets; suppresses safety-surface conflict errors |
| `suggested_after` | forward, advisory only | **No** | must not be bidirectional |
| `contains` | umbrella → child | **No** — umbrellas are not dispatchable | only umbrellas may have it; acyclic; single parent per child |
| `external_gates` (`GATE-*`) | ticket → gate | Yes, **by human policy** (aiur has no gate primitive) | gate ID must be declared at root with `{id,title,owner,resolution_criteria}` |
| `discovered_from` | provenance only | No | required when `provenance: "discovered"` |

**Phases:** `phase_hint` is authored planning metadata and a *presentation hint*.
The decomposition workflow requires each published phase to be an **antichain**
of the hard-dependency graph — zero internal `depends_on` edges — so a consumer
may treat it as a barrier. Readiness is **not** derived from phase.

**What makes a ticket "pickable" at planning time** (`planning-contract.md:262-283`,
`decomposition-workflow.md:312-330`):
- kind is runnable (not `umbrella`);
- all `depends_on` prerequisites are complete;
- no `serializes_with` peer is currently in flight;
- no unresolved `external_gates`;
- it has complexity/rationale, provenance/version, risk, requirement traceability,
  an agent gate and an at-merge gate;
- it does not overlap an independently-ready sibling's safety surfaces.

**What makes a ticket pickable at RUNTIME (aiur):** something entirely different
and simpler — the GitHub issue carries the `agent:todo` label and the fleet has a
free slot. Aiur has **no knowledge of `depends_on`**; ordering is the Executor's
job (see §9 and §10).

---

## 5. `.aiur/config` format — every key, and a ready-to-write config

### 5.1 Discovery order (`src/lib/aiur/workflow.ex:26-41`) (M)

1. `./.aiur/config` (repo-local, new layout — **use this**)
2. `./.aiurconfig` (repo-local, legacy)
3. `~/.aiur/config` (global)
4. `~/.aiurconfig` (global legacy)

Format is **pure YAML**. Parsed by `Aiur.Config.Schema.parse/1`
(`src/lib/aiur/config/schema.ex`) via Ecto embedded schemas. **Unknown keys are
silently ignored** by Ecto `cast` — there is no unknown-key error, so typos fail
open. Two exceptions: `polling.interval_ms` raises explicitly, and
`opencode.db_path` / `opencode.prewarm_workspace` are read out-of-band from the
raw YAML by `Aiur.Opencode.Config.section_value/1` rather than the Ecto schema.

### 5.2 Authoritative key list with types and defaults (M — read from source)

**Top level** (`schema.ex:36-58`)

| Key | Type | Default |
|---|---|---|
| `max_vertical_panes` | int > 0 | `3` |
| `pre_warmed_sessions` | int ≥ 0 | `3` |
| `max_log_history_mb` | int > 0 | `1000` |
| `prompt_file` | string | *(nil)* — path relative to the config dir |
| `debug` | bool | `false` |
| `hooks_file` | string | *(nil)* — sibling file; replaces any inline `hooks:` |
| sections | — | `tracker, polling, workspace, worker, agent, decisions, hooks, observability, server, opencode, events, prewarm, alerts, pr_watch, build_order` |

**`tracker`** (`config/schema/tracker.ex`)

| Key | Type | Default |
|---|---|---|
| `kind` | `github` \| `linear` \| `memory` | *(nil)* |
| `base_branch` | string | *(nil)* → `RepoBase` falls back to `main` |
| `active_states` | [string] | `["Todo","In Progress"]` |
| `terminal_states` | [string] | `["Closed","Cancelled","Canceled","Duplicate","Done"]` |
| `github.repo` | `owner/name` | *(nil)* |
| `github.label_prefix` | string | `"agent"` |
| `github.bot_account` | string | *(nil)* — identity, **not** a credential |
| `github.trusted_accounts` | [string] | `[]` |
| `github.planning_root_limit` | int 1..100 | `100` |
| `github.planning_page_budget` | int 1..4 | `4` |
| `github.planning_call_budget` | int 1..4 | `4` |
| `linear.{api_key,project_slug,endpoint,assignee}` | string | endpoint `https://api.linear.app/graphql` |

**`agent`** (`config/schema/agent.ex`)

| Key | Type | Default |
|---|---|---|
| `kind` | `codex` \| `claude` | `"codex"` |
| `remote_control` | bool | `false` |
| `prior_work_continuation` | bool | `false` |
| `max_dispatches_per_ticket` | int ≥ 0 (0 = off) | `0` |
| `max_concurrent_agents` | int > 0 | `10` |
| `max_concurrent_builds` | int ≥ 0 (0 = off) | `2` — **Mix builds only** |
| `build_start_stagger_seconds` | int ≥ 0 | `0` |
| `min_free_memory_mb` | int > 0 | *(nil = disabled)* |
| `max_turns` | int > 0, or `none`/`unlimited`/`""` | *(nil = uncapped)* |
| `max_turns_by_complexity` | map `{1..5: int}` | `{}` |
| `max_retry_attempts` | int > 0 | `3` |
| `max_retry_backoff_ms` | int > 0 | `300000` |
| `max_concurrent_agents_by_state` | map | `{}` |
| `routing` | map `{1..5: "backend[:model[:effort]]"}` | `{}` |
| `switch_model_on_ratelimit` | [backend] | `[]` |
| `rate_limit_fallback` | `"claude"` \| `""` | `"claude"` |
| `complexity_prompts` | map | `{}` |
| `turn_timeout_ms` | int > 0 | `3600000` |
| `stall_timeout_ms` | int ≥ 0 | `3600000` |
| `max_agent_duration_minutes` | int ≥ 0 (0 = never) | `60` |
| `ci_wait_rewake_minutes` | int > 0 | `5` |
| `max_load_average` | float > 0 (null disables) | `1.5` — multiplied by scheduler count |
| `target_load_average` | float > 0 | `1.0` — raw 1-min load |
| `load_ramp_step` | int > 0 | `1` |
| `load_cooldown_seconds` | int ≥ 0 | `60` |
| `synthetic_load_process_cap` | int ≥ 0 | *(nil = cores/4)* |
| `mix_scheduler_cap` | int > 0 | `4` |
| `claude.command` | string | `"aiur-claude"` |
| `claude.model` | string | *(nil = CLI default)* |
| `claude.permission_mode` | string | `"bypassPermissions"` |
| `codex.command` | string | `"codex app-server"` |
| `codex.approval_policy` | string \| map | `"untrusted"` (use `never` for headless) |
| `codex.thread_sandbox` | string | `"workspace-write"` |
| `codex.turn_sandbox_policy` | map | *(nil)* |
| `codex.read_timeout_ms` | int > 0 | `5000` |
| `codex.thrash_max_per_window` | int > 0 | `6` |
| `codex.thrash_window_seconds` | int > 0 | `60` |

**Everything else**

| Section.key | Type | Default |
|---|---|---|
| `polling.interval_seconds` | int > 0 | `30` (`interval_ms` **raises**) |
| `polling.usage_interval_seconds` | int ≥ 120 | `300` |
| `workspace.root` | path | `$TMPDIR/aiur_workspaces` |
| `workspace.bootstrap_image` / `bootstrap_image_pull` | string / bool | nil / `false` |
| `worker.ssh_hosts` | [string] | `[]` |
| `worker.max_concurrent_agents_per_host` | int > 0 | *(nil)* |
| `hooks.{after_create,before_run,after_run,before_remove}` | string | nil |
| `hooks.timeout_ms` | int > 0 | `600000` |
| `observability.dashboard_enabled` | bool | `true` |
| `observability.dashboard_writable` | bool | `true` |
| `observability.refresh_ms` / `render_interval_ms` | int > 0 | `1000` / `16` |
| `server.port` | int ≥ 0 | **`0` = OS-assigned free loopback port** |
| `server.host` | string | `127.0.0.1` (engine injects `--host` = tailscale IP when dashboard creds set) |
| `opencode.command` | string | `"opencode"` |
| `opencode.bridge_port` | int 0..65535 | **`4097`** ← collision risk |
| `opencode.bridge_host` | string | `127.0.0.1` |
| `opencode.serve_args` | [string] | `[]` |
| `opencode.model_prefix` | string | `"aiur"` |
| `opencode.prewarm_disabled` | bool | `false` |
| `opencode.db_path` | path (raw-YAML key) | *(nil ⇒ shared default SQLite file)* |
| `opencode.prewarm_workspace` | path (raw-YAML key) | `~/.local/share/aiur/opencode-warm` |
| `events.block_state_debounce_seconds` | int ≥ 0 | `10` |
| `events.custom_events_per_turn_max` | int > 0 | `5` |
| `events.codeowners_refresh_seconds` | int > 0 | `3600` |
| `prewarm.enabled` | bool | `false` |
| `prewarm.base_build` / `base_build_file` | string | nil |
| `prewarm.poll_seconds` | int ≥ 0 | `0` |
| `alerts.enabled` | bool | `true` |
| `alerts.use_os_default_sounds` | bool | `false` |
| `alerts.sound_dir` / `alerts_file` | path | nil / `.aiur/alerts` |
| `pr_watch.enabled` | bool | `false` |
| `pr_watch.watch_label` | string | `"watch"` |
| `pr_watch.command_prefix` | string | `"/aiur"` |
| `decisions.supervisor_allowed_kinds` | [string] | `[]` |
| `decisions.supervisor_allow_non_reversible` | bool | `false` |
| `build_order.*` | ints | in-memory provider tuning; safe to omit |

**Not configurable:** the fleet build-gate directory is hard-coded to
`~/.aiur/build-gate` (`src/lib/aiur/build_gate.ex:60`) and is **shared across
instances**. It only gates Mix compile/test, so setting
`agent.max_concurrent_builds: 0` removes kevinweaver-dev from that shared lock
entirely (M).

### 5.3 READY-TO-WRITE `.aiur/config` for kevinweaver-dev

Write to `/home/everdred/github/everdred/kevinweaver-dev/.aiur/config`.
Every port/path below is deliberately distinct from the running aiur instance.

```yaml
# aiur configuration — kevinweaver.dev (Next.js portfolio site)
#
# COEXISTENCE CONTRACT: an aiur node for the aiur repo itself is already
# running as aiur-everdred-539163312d@127.0.0.1 (opencode bridge 4097).
# The mere existence of THIS FILE gives kevinweaver-dev its own instance key
# (sha256(/home/everdred/github/everdred/kevinweaver-dev)[0:10] = 66e88d8ccd),
# hence its own node name, tmux socket and session. Ports and on-disk state
# that are NOT keyed by instance are given explicit distinct values below.

tracker:
  kind: github
  base_branch: main
  active_states:
    - todo
    - in-progress
    - rework
    - merging
  terminal_states:
    - done
    - cancelled
    - canceled
  github:
    repo: its-everdred/kevinweaver-dev
    label_prefix: agent
    bot_account: its-applekid
    trusted_accounts:
      - its-everdred
    planning_root_limit: 100
    planning_page_budget: 4
    planning_call_budget: 4

polling:
  # 30s is the schema default; a 5s interval + fan-out 403'd the aiur fleet
  # against GitHub's 5k/hr budget on 2026-07-30.
  interval_seconds: 30

max_vertical_panes: 3
pre_warmed_sessions: 2
max_log_history_mb: 500

# Dashboard. Explicit non-default port so it can never race the aiur instance.
server:
  host: 127.0.0.1
  port: 4110

# Dedicated workspace root — ownership tracking must not overlap the aiur fleet.
workspace:
  root: ~/code/aiur-workspaces-kevinweaver

hooks_file: hooks
prompt_file: prompt.md

agent:
  kind: codex
  # Small repo, few truly independent lanes; 6 keeps CPU free for the aiur fleet.
  max_concurrent_agents: 6
  # Mix-only gate. This is a Node repo, and the gate directory
  # (~/.aiur/build-gate) is SHARED with the running aiur instance — disable it
  # so the two fleets cannot block each other.
  max_concurrent_builds: 0
  build_start_stagger_seconds: 0
  min_free_memory_mb: 4096
  max_load_average: 1.5
  target_load_average: 6.0
  load_ramp_step: 4
  load_cooldown_seconds: 20
  max_turns: 12
  max_turns_by_complexity:
    1: 4
    2: 8
    3: 12
  max_dispatches_per_ticket: 20
  stall_timeout_ms: 3600000
  max_agent_duration_minutes: 90
  routing:
    1: "codex:luna:low"
    2: "codex:luna:medium"
    3: "codex:terra:high"
    4: "codex:terra:xhigh"
    5: "codex:sol:max"
  codex:
    command: codex app-server
    approval_policy: never
    thread_sandbox: workspace-write
    turn_sandbox_policy:
      type: workspaceWrite
      writableRoots:
        - /home/everdred/code/aiur-workspaces-kevinweaver
        - /tmp
      networkAccess: true

opencode:
  command: opencode
  bridge_host: 127.0.0.1
  # DEFAULT IS 4097 AND THE RUNNING NODE HOLDS IT. Must be overridden.
  bridge_port: 4108
  # The default opencode SQLite file is shared process-wide; give this
  # instance its own.
  db_path: ~/.local/share/opencode/opencode-kevinweaver.db
  prewarm_workspace: ~/.local/share/aiur/opencode-warm-kevinweaver
  serve_args: []
  model_prefix: aiur

# Warm base: build one shared node_modules checkout of main, then materialize
# each agent workspace from it copy-on-write.
prewarm:
  enabled: true
  base_build_file: prewarm
  poll_seconds: 0

alerts:
  enabled: false
  use_os_default_sounds: false
  alerts_file: alerts

pr_watch:
  enabled: false
```

**Sibling `/home/everdred/github/everdred/kevinweaver-dev/.aiur/hooks`:**

```yaml
# aiur workspace hooks — referenced from .aiur/config via `hooks_file: hooks`.
# Env: $THIS_REPOSITORY_URL, $THIS_BASE_BRANCH, $AIUR_TICKET_BRANCH
timeout_ms: 600000
after_create: |
  set -e
  base_branch="${THIS_BASE_BRANCH:-main}"
  workspace_root="$(pwd -P)"
  git_toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$git_toplevel" ]; then
    git_toplevel="$(CDPATH= cd "$git_toplevel" && pwd -P)"
  fi
  if [ "$git_toplevel" = "$workspace_root" ] &&
     git rev-parse --verify HEAD >/dev/null 2>&1 &&
     git status --porcelain >/dev/null 2>&1; then
    exit 0
  fi
  if [ -n "$(find . -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "Aiur must stage incomplete workspace reconstruction before after_create runs." >&2
    exit 66
  fi
  git clone "$THIS_REPOSITORY_URL" .
  git fetch origin "$base_branch"
  if git show-ref --verify --quiet "refs/remotes/origin/$AIUR_TICKET_BRANCH"; then
    git checkout -B "$AIUR_TICKET_BRANCH" "origin/$AIUR_TICKET_BRANCH"
  else
    git checkout -B "$AIUR_TICKET_BRANCH" "origin/$base_branch"
  fi
  # Deterministic install. package-lock.json is the pinned lockfile;
  # yarn.lock is stale and must not be used.
  npm ci 2>&1 | tail -50 || npm install 2>&1 | tail -50
before_run: |
  set -e
  base_branch="${THIS_BASE_BRANCH:-main}"
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
     ! git rev-parse --verify HEAD >/dev/null 2>&1 ||
     ! git status --porcelain >/dev/null 2>&1; then
    if [ -n "$(find . -mindepth 1 -maxdepth 1 -print -quit)" ]; then
      echo "Aiur must stage incomplete workspace reconstruction before before_run runs." >&2
      exit 66
    fi
    git clone "$THIS_REPOSITORY_URL" .
    if git show-ref --verify --quiet "refs/remotes/origin/$AIUR_TICKET_BRANCH"; then
      git checkout -B "$AIUR_TICKET_BRANCH" "origin/$AIUR_TICKET_BRANCH"
    else
      git checkout -B "$AIUR_TICKET_BRANCH" "origin/$base_branch"
    fi
    npm ci 2>&1 | tail -50 || npm install 2>&1 | tail -50
  else
    git fetch origin "$base_branch"
    if ! git diff --quiet || ! git diff --cached --quiet; then
      echo "Refusing to refresh workspace from origin/$base_branch because tracked changes are present." >&2
      exit 65
    fi
    git merge --no-edit "origin/$base_branch"
    if [ package-lock.json -nt node_modules ] || [ ! -d node_modules ]; then
      npm ci 2>&1 | tail -50 || npm install 2>&1 | tail -50
    fi
  fi
```

**Sibling `.aiur/prewarm`:**

```bash
# aiur warm-base build — referenced via prewarm.base_build_file: prewarm.
# Runs once in ~/.aiur/repo/its-everdred/kevinweaver-dev; workspaces are then
# materialized from the result copy-on-write, so node_modules is pre-populated.
npm ci
npm run build
```

**Sibling `.aiur/prompt.md`** — start from
`/home/everdred/github/everdred/aiur/.aiur/examples/prompt.md.example`, replace
`{{REPO}}` with `its-everdred/kevinweaver-dev`, and append a
Workspace-setup block naming the verify command:

```
- Verify with: `npm run lint && npm run build`. There is no test suite yet;
  if your ticket adds one, add `"test"` to package.json scripts and use it.
- Do NOT run `yarn`. package-lock.json is the pinned lockfile; yarn.lock is stale.
- Do NOT upgrade Next.js, React, Tailwind, or PostCSS. The framework is pinned by
  decision; infra must not change.
```

Add `.env` at the repo root with `GITHUB_TOKEN=<pat>` (the engine's
`load_dotenv` reads `./.env` before launch), and add `.env` + `.aiur/` to
`.gitignore` if you do not want the config committed. **Recommendation: commit
`.aiur/config`, `.aiur/hooks`, `.aiur/prewarm`, `.aiur/prompt.md`; gitignore only
`.env`.**

---

## 6. `aiur init` behaviour

**(M)** It is **interactive-only.** Evidence:

- `src/lib/aiur/cli.ex:134-140` — `init` accepts exactly one flag, `--force`
  (`{:init, %{force: ...}}`). There are no `--repo`, `--yes`, `--non-interactive`
  switches anywhere in `@switches` (`cli.ex:17-31`).
- `src/lib/aiur/init.ex:2` — `@moduledoc "Interactive \`aiur init\` wizard."`
  Every step goes through `io.input.`/`io.confirm.` prompts
  (`Questions.prompt_tracker`, `prompt_agents`, `prompt_routing`,
  `prompt_permission_mode`, `prompt_int`, `Prewarm.prompt_prewarm`,
  `Alerts.prompt_alerts`, plus `io.input.("Press Enter to create them", ...)`).
- `packaging/npm/aiur-cli/libexec/aiur-engine.sh:347-354` — `run_init` just
  execs the release; no headless path.

**What it produces**, so you can write it by hand instead
(`src/lib/aiur/init/scaffold.ex` + `templates.ex`) (M):

| File | Source template |
|---|---|
| `.aiur/config` | `.aiur/examples/config.example` with `{{PLACEHOLDER}}` substitution (`Templates.build_fills/1`) |
| `.aiur/hooks` | `.aiur/examples/hooks.example` verbatim |
| `.aiur/alerts` | `.aiur/examples/alerts.linux.example` (Linux) verbatim |
| `.aiur/prewarm` | the prewarm command the operator typed, if prewarm enabled |
| `prompt.md` (next to config, i.e. `.aiur/prompt.md`) | `.aiur/examples/prompt.md.example` with `{{REPO}}` filled |
| `./.env` | `GITHUB_TOKEN=\n` (appended if the file exists but lacks the key) |
| `.gitignore` | optionally appends `.aiur/` — **only if you confirm** |

It also performs **GitHub label provisioning** (`init/labels.ex`) — see §8.
None of the writers clobber an existing file (`write_prompt_file`,
`write_aiurhooks`, `write_prewarm_file` all return `{:exists, path}`).

**Conclusion:** write the five files from §5.3 directly. You may optionally run
`aiur init` afterwards from the repo; it will detect `.aiur/config`, take the
*resume* branch, print the saved summary, backfill missing sections and offer to
create the labels — which is a convenient way to get the labels created without
hand-writing `gh label create` lines.

---

## 7. Node identity, ports, and provable isolation from the running node

### 7.1 How the node name is derived (M — `aiur-engine.sh`)

```bash
aiur_project_root()  # AIUR_REPO_ROOT wins; else walk UP from $PWD to the first
                     # dir containing .aiur/config or .aiurconfig
aiur_instance_key()  # printf '%s' "$(realpath project_root)" | sha256sum | cut -c1-10
AIUR_RELEASE_NODE = "aiur-${USER}${AIUR_INSTANCE_KEY:+-$AIUR_INSTANCE_KEY}@127.0.0.1"
```

The same key also names the tmux socket (`AIUR_TMUX_SOCKET`), tmux session
(`<node>-default`), and the instance record
`~/.config/aiur/instances/<node>_127.0.0.1.instance`.

### 7.2 Measured state right now (M)

```
$ aiur __identity            # run from /home/everdred/github/everdred/kevinweaver-dev
AIUR_RELEASE_NODE=aiur-everdred-3c753a863d@127.0.0.1
AIUR_INSTANCE_KEY=3c753a863d
AIUR_COOKIE_FILE=/home/everdred/.config/aiur/cookie
AIUR_BG_STATE_DIR=/home/everdred/.config/aiur

$ printf '%s' "/home/everdred" | sha256sum | cut -c1-10
3c753a863d                                        # <-- MATCH
$ printf '%s' "/home/everdred/github/everdred/aiur" | sha256sum | cut -c1-10
539163312d                                        # the RUNNING node
$ printf '%s' "/home/everdred/github/everdred/kevinweaver-dev" | sha256sum | cut -c1-10
66e88d8ccd                                        # what we WILL get
```

**Root cause of the confusing `aiur status` message:** the **installed**
`aiur-cli` (2026-07-16, `~/.local/share/mise/installs/node/lts/lib/node_modules/aiur-cli/libexec/aiur-engine.sh:47-59`)
walks up from `$PWD` with **no `$HOME` boundary**, finds `/home/everdred/.aiur/config`
(which exists — 4.6 KB, 2026-07-16), and keys the instance to `/home/everdred`.
Every config-less project under `$HOME` therefore collapses onto
`aiur-everdred-3c753a863d`. The **dev-tree** engine
(`/home/everdred/github/everdred/aiur/packaging/.../aiur-engine.sh:84-105`) has
already fixed this (issue #443) by stopping the walk at `$HOME` and keying by
`realpath($PWD)`.

**Either way, creating `/home/everdred/github/everdred/kevinweaver-dev/.aiur/config`
makes both engines agree on `66e88d8ccd`.** Old engine: the walk stops at the
repo-local config. New engine: same. This is the isolation guarantee.

### 7.3 Running node, measured (M)

```
$ ss -tlnp | grep 1470581
127.0.0.1:4097   beam.smp pid=1470581   # opencode bridge (default 4097)
127.0.0.1:39321  beam.smp pid=1470581   # Erlang distribution (epmd-registered)
127.0.0.1:32977  beam.smp pid=1470581
0.0.0.0:4099     beam.smp pid=1470581   # dashboard HTTP

$ ERL_EPMD_ADDRESS=127.0.0.1 <release>/erts-*/bin/epmd -names
epmd: up and running on port 4369 with data:
name aiur-everdred-539163312d at port 39321

$ cat ~/.config/aiur/instances/aiur-everdred-539163312d_127.0.0.1.instance
AIUR_RECORD_NODE=aiur-everdred-539163312d@127.0.0.1
AIUR_RECORD_SESSION=aiur-everdred-539163312d-default
AIUR_RECORD_SOCKET=aiur-everdred-539163312d
AIUR_RECORD_PROJECT_ROOT=/home/everdred/github/everdred/aiur
AIUR_RECORD_PROJECT_ROOT_SOURCE=repo
```

### 7.4 What IS and IS NOT keyed by instance

| Resource | Keyed? | Action for kevinweaver-dev |
|---|---|---|
| Erlang node name | ✅ instance key | automatic once `.aiur/config` exists |
| tmux socket + session | ✅ instance key | automatic |
| Instance record file | ✅ instance key | automatic |
| `/run/user/1000/aiur-<pid>-*` | ✅ by PID | automatic |
| Erlang cookie `~/.config/aiur/cookie` | ❌ shared | fine — distinct node names |
| epmd (port 4369) | ❌ shared | fine — distinct registered names |
| **opencode `bridge_port`** | ❌ **default 4097** | **MUST set `opencode.bridge_port: 4108`** |
| **opencode `db_path`** | ❌ shared SQLite file | **MUST set a dedicated path** |
| **opencode `prewarm_workspace`** | ❌ `~/.local/share/aiur/opencode-warm` | **MUST set a dedicated path** |
| **dashboard `server.port`** | ❌ but defaults to `0` (OS-assigned) | pin `4110` for predictability |
| **`workspace.root`** | ❌ | **MUST set `~/code/aiur-workspaces-kevinweaver`** |
| `~/.aiur/build-gate` | ❌ shared | set `agent.max_concurrent_builds: 0` (Mix-only gate; this is a Node repo) |
| `~/.aiur/logs` | ❌ shared, swept by `max_log_history_mb` | set `max_log_history_mb: 500` |
| prewarm base `~/.aiur/repo/<owner>/<name>` | ✅ per repo | automatic |

### 7.5 Verification procedure

**Before starting the second node:**
```bash
cd /home/everdred/github/everdred/kevinweaver-dev
aiur __identity                                   # expect AIUR_INSTANCE_KEY=66e88d8ccd
ss -tlnp | grep -E ':(4108|4110)\b'               # expect NO output
ls ~/.config/aiur/instances/                      # expect no ...66e88d8ccd... entry
ERL_EPMD_ADDRESS=127.0.0.1 \
  ~/.local/share/mise/installs/node/lts/lib/node_modules/aiur-cli/node_modules/aiur-cli-linux-x64/release/erts-*/bin/epmd -names
```
**Launch:**
```bash
cd /home/everdred/github/everdred/kevinweaver-dev
aiur run --bg --max-agents 4
```
**After:**
```bash
epmd -names                    # expect BOTH aiur-everdred-539163312d and ...-66e88d8ccd
aiur status                    # from kevinweaver-dev -> the new node
(cd /home/everdred/github/everdred/aiur && aiur status)   # unchanged, PID 1470581 alive
ps -o pid,etime,cmd -p 1470581 # etime must still be climbing from the original start
tmux -L aiur-everdred-539163312d ls   # untouched
tmux -L aiur-everdred-66e88d8ccd ls   # new
```
Emergency override without editing config: `AIUR_RELEASE_NODE=aiur-kw@127.0.0.1 aiur ...`
(the engine honors a pre-set value, `aiur-engine.sh:156`).

**Do not** run from inside a nested tmux, and **never** use `--test`/`--test3`
(destructive sandbox harnesses — `aiur-run/SKILL.md:66-68`).

---

## 8. Repository preconditions

### 8.1 Measured current state (M)

```
$ gh repo view its-everdred/kevinweaver-dev --json defaultBranchRef,hasIssuesEnabled,isPrivate,viewerPermission
{"defaultBranchRef":{"name":"main"},"hasIssuesEnabled":true,"isPrivate":false,"viewerPermission":"ADMIN"}

$ gh api repos/its-everdred/kevinweaver-dev/branches/main/protection
{"message":"Branch not protected","status":"404"}

$ gh label list --repo its-everdred/kevinweaver-dev
bug / documentation / duplicate / enhancement / good first issue /
help wanted / invalid / question / wontfix          # NO agent:* labels

$ gh auth status
Logged in as its-everdred; Token scopes: 'admin:public_key','gist','read:org','repo'
                                                    # NO 'workflow' scope

$ git log --oneline -2
edae519 Import design system and research           # local HEAD
cefcffb WIP without gradient
$ git rev-parse origin/main
cefcffbd2981f25c919702013441401bf7d878ed            # remote is BEHIND by 1 commit

$ git config --global --get-regexp credential
credential.https://github.com.helper !/usr/bin/gh auth git-credential

$ node --version && npm --version
v24.18.0 / 11.16.0
```

### 8.2 Preconditions checklist

**Hard blockers**

1. **Push `main`.** `edae519 "Import design system and research"` is local-only.
   Agents clone `https://github.com/its-everdred/kevinweaver-dev.git` and check
   out `origin/main` (`hooks.ex:190`), so `docs/design/kevinweaver.dev.dc.html`
   and `docs/research/` are **invisible to every agent** until pushed. Also note
   `git ls-remote origin` over SSH failed here (`ssh_askpass: exec ... No such
   file or directory`) — push via `gh`/HTTPS or unlock the SSH key first.
2. **Create the `agent:*` labels.** The full required set
   (`src/lib/aiur/github/labels.ex:26-105`, prefix `agent`):
   `agent:todo`, `agent:in-progress`, `agent:ci-wait`, `agent:human-review`,
   `agent:rework`, `agent:merging`, `agent:done`, `agent:error`,
   `agent:cancelled`, `agent:canceled`, plus markers `agent:watch`,
   `agent:paused`, `agent:rate-limit-fallback`, plus `model:claude` (required by
   the default `rate_limit_fallback: claude`), plus `complexity:1..5`,
   plus the model/effort override labels. Easiest path: run `aiur init` in the
   repo after writing `.aiur/config` and accept the label stages; otherwise
   `gh label create '<name>' --repo its-everdred/kevinweaver-dev --description '<desc>' --force`.
   The publisher's `label_projection` labels (`build-order`, `build-lane:*`,
   `phase:*`, `complexity:*`, `model:codex`) must also exist.
3. **A green verify command.** `package.json` has **no `test` script** — only
   `dev`, `build`, `start`, `lint` (`lint` = `eslint . --ext .js`). The at-merge
   gate needs something. Minimum: `npm run lint && npm run build`. Confirm
   Next 10.1.3 + React 17 actually builds under Node 24.18 **before** dispatching
   agents (I: high risk — Next 10 predates Node 18; this is the single most
   likely cause of a fleet-wide red gate). If it fails, the first ticket must be
   a pinned-Node or minimal-upgrade ticket.
4. **`workflow` token scope**, if any ticket writes `.github/workflows/`.
   The current token lacks it; GitHub rejects HTTPS pushes that touch workflow
   files without it. (M: scopes list above.)

**Required-but-easy**

5. **`CODEOWNERS`.** `using-aiur/conventions.md` makes CODEOWNERS the authority
   signal for whose PR comments an agent must obey; with no file the fallback is
   "treat all commenters as authoritative", which lets any drive-by comment
   steer an agent. Add `.github/CODEOWNERS` with `*  @its-everdred`.
6. **`AGENTS.md`** at the repo root — agents read it for build/test/lint
   commands (`prompt.md.example:32`). Must state: `npm ci`, `npm run lint`,
   `npm run build`, never `yarn`, never upgrade the framework.
7. **`.github/pull_request_template.md`** — optional but the aiur repo uses one
   with a Complexity-routing block; copy and adapt (drop the Elixir make target).
8. **Both lockfiles committed** (`yarn.lock` 116 KB + `package-lock.json` 327 KB,
   both mtime 2026-07-31). Vercel/npm detection hazard. Either delete
   `yarn.lock` in the first ticket or hard-pin `npm ci` in hooks + AGENTS.md
   (the config in §5.3 does the latter).
9. **`.env`** at the repo root with `GITHUB_TOKEN=` — the launcher's
   `load_dotenv` reads it before the daemon starts (`aiur-engine.sh:376-395`).
   Add `.env` to `.gitignore`.

**Not required**

- **Worktrees:** aiur does **not** use `git worktree`. Each agent gets a full
  `git clone` into `<workspace.root>/<...>` performed by the `after_create` hook
  (`.aiur/examples/hooks.example`). Prewarm turns that into a copy-on-write
  materialization from `~/.aiur/repo/<owner>/<name>`.
- **Branch protection:** not required. It is arguably *harmful* here — the
  Executor merges agent PRs, and required-review rules on `main` would stall
  every merge unless a reviewing bot account exists. Leave `main` unprotected
  and enforce quality through the review loop (§10).
- **Git config:** the global `gh auth git-credential` helper is already
  configured for `https://github.com`, which is exactly what the HTTPS clone
  URL needs. Agent commit identity comes from the ambient global git config.

### 8.3 Branch & PR conventions (M)

- Branch: `aiur/<issue-number>` or `aiur/<issue-number>-<≤4-word-slug>`
  (`src/lib/aiur/ticket_branch.ex:25,35-46`). Regex:
  `\Aaiur\/([1-9]\d*)(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?\z`. The numeric issue ID is
  the stable identity used for PR routing; agents must read
  `git branch --show-current` and never reconstruct the ref.
- Base: `tracker.base_branch` = `main`.
- PR opens as a **draft**, is self-reviewed with `/ce-code-review`, then the
  agent moves to `agent:ci-wait`; on green it marks ready and moves to
  `agent:human-review` (`.aiur/examples/prompt.md.example:34-37`).

---

## 9. How tickets get picked up

**(M) Aiur reads GitHub issues, not `build-order.json` and not an internal
planning DB.**

- `src/lib/aiur/github/issues.ex:98`:
  `GET /repos/{owner}/{repo}/issues?labels=<label>&state=open&per_page=100`
  — the dispatch queue is literally "open issues labelled `agent:todo`".
- `src/lib/aiur/agent_control_cli.ex:121-181` (`todo/2`): fetches each issue,
  refuses terminal tickets, keeps existing mid-flight active labels, and
  otherwise **adds the `agent:todo` label**.
- `build-order.json` is consumed only by (a) the Python validator, (b) the
  Python publisher that creates the issues, and (c) an **in-memory, read-only**
  Build Order display provider in the daemon (`config.build_order.*`,
  `.aiur/config.croptracker` header: "The Build Order surface is fed by
  PlanningSource, which is read-only and never touches GitHub"). It does **not**
  drive dispatch.
- **Therefore `depends_on` is not enforced at runtime.** The Executor enforces
  ordering by only labelling `agent:todo` on tickets whose prerequisites are
  merged. This is the biggest operational consequence of the whole architecture.

**Exact queue command** (`aiur-engine.sh:358-366`, `cli.ex:163-191`):

```bash
aiur --todo 12 13 14            # queue GitHub ISSUE NUMBERS (not KW-001 IDs)
aiur --todo 12,13,14            # commas also accepted
aiur --todo 12 13 --only        # ALSO clears agent:todo from every other pending ticket
```
- IDs must be `^\d+$` after trimming; leading zeros are canonicalized away.
- Runs distribution-free — no daemon required, no tmux; it just mutates GitHub
  labels. Safe to run before launch.
- `--only` requires explicit scope authority (it dequeues everything else).
- `--only` without `--todo` exits 64.

Full runtime control surface (`aiur-engine.sh:310-328`): `aiur run [--bg]
[--debug] [--max-agents n] [--pause] [--port] [--host] [--no-dashboard]`,
`status`, `agents`, `alerts [--needs-attention]`,
`watch [--full|--changes] [--interval s]`, `set max-agents <n>`,
`pause|resume [ids|--all]`, `message <id> <text>`, `usage`,
`cleanup-stale [--dry-run]`, `stop`.

---

## 10. Wiring `ce-code-review` and auto-merge

### 10.1 The two review layers that already exist

1. **Worker self-review (in-workspace).** `.aiur/examples/prompt.md.example:35`
   makes it mandatory: *"Once your change is complete and pushed, run
   `/ce-code-review` on your own diff and resolve what it finds… Do not move to
   `agent:ci-wait` until this has run."* Keep this line verbatim in
   `.aiur/prompt.md`.
2. **Executor-side independent review.** `aiur-run/references/executor.md:213-243`
   defines the loop. A PR is review-ready **only** when all three hold:
   - `baseRefName` == the configured integration branch (`main`);
   - the current remote base head is an **ancestor of the exact PR head**;
   - fresh CI for that exact head has passed the required gate.

   Then: reserve capacity for **multiple independent background reviewers**, run
   `ce-code-review` with the right lens, reconcile duplicates, return contained
   findings as **rework on the existing ticket** (not new tickets), confirm the
   event bus wakes the owning agent, require the freshness+CI gate again after
   fixes, then apply the recorded merge policy.

### 10.2 Concrete wiring for kevinweaver-dev

- **There is no CI today** (no `.github/workflows`, no `netlify.toml`, no
  `vercel.json`). The "fresh CI on the exact head" condition therefore cannot be
  satisfied by GitHub checks. Two options:
  - **(a) Add a minimal `.github/workflows/ci.yml`** running `npm ci`,
    `npm run lint`, `npm run build` on `pull_request`. This makes
    `agent:ci-wait` meaningful and gives the Executor a real gate. **Requires the
    `workflow` token scope** (§8.2 item 4).
  - **(b) Rely on Vercel preview deployments** as the check. Vercel posts a
    commit status; the daemon's CI poller can consume it. Lower effort, but it
    only proves `next build`, not lint.
  Recommendation (I): do **(a)**, as the first infra ticket, because it also
  makes the at-merge gate in every ticket's `acceptance.at_merge_gate` real.
- **Background review agents.** Two mechanisms, use both:
  - `compound-engineering:ce-babysit-pr` / the `/loop` skill to poll open
    `aiur/*` PRs on an interval and run `ce-code-review` on each.
  - `pr_watch.enabled: true` + `agent:watch` label if you want aiur itself to act
    on repo-wide PR comments. **Requires** `github.bot_account` (set to
    `its-applekid`) **and** CODEOWNERS or `github.trusted_accounts` to decide who
    may direct the agent. Keep it **off** for the first run — comment-driven
    wakeups multiply turns fast.
- **Bot identity.** `github.bot_account: its-applekid` is an *identity*, not a
  credential; it stops aiur from reacting to its own comments. If
  `GITHUB_TOKEN` is `its-everdred`'s PAT and `its-everdred` is also the human
  CODEOWNER, agent-vs-human provenance becomes ambiguous
  (`.aiur/examples/config.example:10-13`). Ideally issue the PAT from the
  `its-applekid` account, which already exists (created 2026-01-29) and is one of
  the two actors in the product itself.
- **Merge policy.** The Executor "never infers merge authority"
  (`executor.md:36-39`). Record it explicitly in the handoff, e.g.:
  > The Executor MAY squash-merge an `aiur/*` PR into `main` when: base is
  > `main`, `origin/main` is an ancestor of the PR head, the CI workflow is green
  > on that exact head, `ce-code-review` produced no unresolved P0/P1 finding,
  > and the PR's ticket has no unmerged `depends_on` prerequisite. Otherwise
  > escalate.
- **GitHub auto-merge:** do **not** enable it. With no branch protection,
  auto-merge would land PRs the moment checks pass, bypassing `ce-code-review`
  entirely and destroying `depends_on` ordering (which nothing else enforces —
  §9). Merge from the Executor loop instead.
- **After every merge**, recompute ready width and dispatch the newly-ready batch
  in the same observation (`aiur-run/SKILL.md:306-309`); do not wait for the next
  tick.

---

## 11. Recommended pack layout for this repo

```
docs/build-orders/terminal-portfolio/
  README.md
  questions-or-commands.md
  00-brief-and-requirements.md
  01-research-index.md
  02-current-target-delta.md
  03-technical-decisions.md
  04-test-and-rollout.md
  deferred-findings.md
  evidence/
    design-system.md            # hash-pinned copy/extract of docs/design/kevinweaver.dev.dc.html
  build-order.json
  publication.json
  root-issue.md
  tickets/KW-0NN-<slug>.md
  validation-report.md
  EXECUTOR-HANDOFF.md
```

Suggested identity:
- `build_order_id`: `its-everdred/kevinweaver-dev:terminal-portfolio`
- `ticket_prefix`: `KW`
- `repository`: `its-everdred/kevinweaver-dev`
- `researched_at_commit`: the SHA of the pushed planning commit
- workstreams (3–6, keep small): `chrome` (shell/nav/man-page), `data`
  (contribution + repo/file datasets), `viz` (grid + gource animation),
  `platform` (build, CI, deploy).

`design_evidence` should pin `docs/design/kevinweaver.dev.dc.html`. Note the
artifact path is resolved **relative to `build-order.json`**, so either copy it
into `evidence/` or use `"artifact": "../../design/kevinweaver.dev.dc.html"` —
**which will fail**, because `repository_relative_path` rejects any `..` segment
(`validation_common.py:141-147`). **Copy it into `evidence/` and hash the copy.**

---

## 12. Open questions

1. Does `next build` (Next 10.1.3 / React 17 / PostCSS 8) succeed on Node
   24.18.0? Unverified — I was not permitted to run `npm install`. If it fails,
   the entire at-merge gate is red on ticket #1.
2. Which GitHub account issues `GITHUB_TOKEN` — `its-everdred` or
   `its-applekid`? Determines whether agent/human provenance is separable and
   whether `bot_account` self-loop suppression works.
3. Should `.aiur/` be committed or gitignored? Committing makes the fleet config
   reviewable and reproducible; `aiur init` offers to gitignore it by default.
4. Is `.github/workflows/ci.yml` in scope? If yes, the token needs `workflow`
   scope before any agent can push it.
5. `docs/design/support.js` (69 KB) appeared alongside the design HTML — is it
   part of the design source of truth or an artifact of the import?
6. The installed `aiur-cli` is 2026-07-16 and predates the #443 instance-key fix.
   Should it be upgraded (or `AIUR_CMD` pointed at `scripts/aiurdev`) before the
   run, so `aiur status` from a config-less subdirectory does not silently
   address the wrong node?

---

## Verification corrections

Adversarial verification pass, 2026-07-31, by a second researcher. Every item
below was re-derived from source or from a live command; citations are file:line
in `/home/everdred/github/everdred/aiur`. This section only *corrects*; anything
not listed here was independently re-confirmed.

### C1. REFUTED — §0.2, §4, §9: "aiur has no knowledge of `depends_on`" is wrong

The narrow statement "aiur does not parse `build-order.json` at runtime" is
**true**. The conclusion drawn from it — that `depends_on` is enforced only by
the Executor's choice of what to label — is **false**. `depends_on` is
materialized into **GitHub-native issue dependencies** at publication and is
enforced by the daemon on every dispatch decision.

**Publication writes the edges (M):**
- `.claude/skills/aiur-build/scripts/publication/publication_operator.py:1200-1203`
  ```python
  dependencies = ticket.get("depends_on")
  if not isinstance(dependencies, list):
      raise PublicationError(f"ticket dependencies are invalid for {logical_id}")
  core_edges.update((logical_id, blocker) for blocker in dependencies)
  ```
- `publication_operator.py:728-735` POSTs each missing edge:
  `POST repos/<repo>/issues/<blocked>/dependencies/blocked_by  {"issue_id": <blocker db id>}`
- `publication_operator.py:707-719` *errors out* if an issue carries a blocker
  that is not in `depends_on` (`has unexpected existing blockers`).

**The daemon enforces them (M):**
- `src/lib/aiur/orchestrator/dispatch_policy.ex:277-288` —
  `dispatch_candidate?` includes `!todo_issue_blocked_by_non_terminal?(issue, terminal_states)`.
- `dispatch_policy.ex:374-390` — an issue whose state normalizes to `todo` and
  that has **any** blocker not in a terminal state is not a dispatch candidate.
- `src/lib/aiur/github/dependencies_api.ex:22-25, 95` and
  `src/lib/aiur/github/client.ex:80-82` — the daemon reads
  `GET repos/<repo>/issues/<n>/dependencies/blocked_by` to populate `Issue.blocked_by`.
- `src/lib/aiur/orchestrator/dispatcher.ex:198` logs and skips a dispatch that
  went stale because `blocked_by` changed mid-flight.

**The receipt validator enforces exact correspondence (M):**
`validation_github_receipt.py:79-87` — `github_reconciliation dependencies must
exactly match depends_on`.

**Correction.** `depends_on` is enforced automatically *provided the plan is
published through `publish_build_order.py`*. Hand-creating issues with `gh issue
create` is what would drop the graph. Residual manual responsibility is narrower
than §9 claims:
- the blocker gate only fires when the issue's state normalizes to `"todo"`
  (`dispatch_policy.ex:375-381`); an issue sitting in `agent:rework` is
  dispatched without a blocker check at that call site (`retry_candidate_issue?`
  at `:359-362` *does* check it).
- `serializes_with`, `external_gates` and phase antichains are still un-enforced
  at runtime. Those, not `depends_on`, are the Executor's job.

The §10.2 recommendation "do not enable GitHub auto-merge because it destroys
`depends_on` ordering (which nothing else enforces)" rests on the refuted premise.
The recommendation may still be right, but not for that reason.

### C2. REFUTED — §4 and §9: dispatch is not restricted to `agent:todo`

`src/lib/aiur/github/issues.ex:15-18` — `fetch_candidate_issues/1` calls
`fetch_issues_by_states(Config.active_states(), opts)`;
`issues.ex:128-138` maps **every** configured active state through
`StatePolicy.state_label/2` (`state_policy.ex:35`) and issues one
`?labels=<label>&state=open&per_page=100` query per label.
`DispatchPolicy.candidate_issue?` (`dispatch_policy.ex:339-355`) accepts any
issue whose state is in `active_states`.

This repo's committed `.aiur/config` sets
`active_states: [todo, in-progress, rework, merging]`, so the live dispatch queue
is `agent:todo ∪ agent:in-progress ∪ agent:rework ∪ agent:merging`, not
`agent:todo` alone. §4's "the GitHub issue carries the `agent:todo` label" and
§9's "the dispatch queue is literally open issues labelled `agent:todo`" are both
too narrow.

### C3. REFUTED — §5.3 / §7.4: pinning `opencode.bridge_port` makes collisions *worse*

`src/lib/aiur/opencode/bridge_port.ex:14-39` (M):

```elixir
def resolve(host, {:default, port}) do
  if available?(ip, port), do: {:ok, port},
  else: case find_available(ip, port + 1) do   # scans forward up to @scan_limit = 100
    {:ok, selected} -> Logger.warning("opencode_bridge default_port_occupied ...") ; {:ok, selected}
    :error -> {:error, occupied_message(port, :default)}
  end
end

def resolve(host, {source, port}) do          # :workflow | :env | :app_override
  if available?(ip, port), do: {:ok, port}, else: {:error, occupied_message(port, source)}
end
```

When `opencode.bridge_port` is **absent**, the source is `:default` and aiur
auto-selects the next free port (4098, 4099, …) and logs a warning. When it is
**present in the config**, the source is `:workflow` and an occupied port is a
hard error with **no fallback** (`explicit_source_note(:workflow)` at `:79`).

**Correction:** §5.3's `bridge_port: 4108` and §7.4's "**MUST** set
`opencode.bridge_port: 4108`" are wrong. Leave `opencode.bridge_port` unset —
that is the *safe* configuration. The repo's on-disk `.aiur/config` already omits
it (correct by accident or by later revision).

### C4. REFUTED — §7.4: `server.port` is not a collision risk

`src/lib/aiur/config/schema/server.ex:12` — `field(:port, :integer, default: 0)`,
documented in-source as "0 = bind a free OS-assigned loopback port". Two nodes
both on the default can never collide. Pinning it is a convenience, not a
requirement. (§5.2's own table states this correctly; §7.4's table and the
executive framing overstate it.)

### C5. CONFIRMED — the remaining non-instance-keyed resources

Re-verified (M), all correct as written:
- `opencode.db_path` → `src/lib/aiur/opencode/db.ex:22-31`, default
  `~/.local/share/opencode/opencode.db`, genuinely shared.
- `opencode.prewarm_workspace` → `src/lib/aiur/opencode/config.ex:163-182`,
  default `~/.local/share/aiur/opencode-warm`, genuinely shared. Both are read
  out-of-band from raw YAML (`section_value/1`), not via the Ecto schema — the
  `Opencode` embedded schema (`config/schema/opencode.ex:8-14`) has neither field.
- `workspace.root` → `config/schema/workspace.ex:9`, default
  `$TMPDIR/aiur_workspaces`; `src/lib/aiur/shutdown.ex:94` calls
  `RemoteControl.reap_workspace_agents(Config.workspace_root())` on shutdown, so
  a shared root really would let one fleet reap the other's agents. Must be
  distinct — this is the one item in the §7.4 "MUST" list that is genuinely a MUST.
- `~/.aiur/build-gate` hard-coded → `src/lib/aiur/build_gate.ex:56-62` (the doc
  cites `:60`; the function spans 56-62).

### C6. CONFIRMED — instance key isolation

`aiur __identity` run from `/home/everdred/github/everdred/kevinweaver-dev`
**after** `.aiur/config` was created now returns:

```
AIUR_RELEASE_NODE=aiur-everdred-66e88d8ccd@127.0.0.1
AIUR_INSTANCE_KEY=66e88d8ccd
```

matching the predicted `sha256("/home/everdred/github/everdred/kevinweaver-dev")[0:10]`.
Engine walk re-read at
`~/.local/share/mise/installs/node/lts/lib/node_modules/aiur-cli/libexec/aiur-engine.sh:48-60`
(project root) and `:64-73` (key). The `$HOME`-boundary observation is correct:
the installed engine's loop is `while [ -n "$d" ] && [ "$d" != "/" ]`. §7.2 is sound.

The running node is still `aiur-everdred-539163312d@127.0.0.1`, PID 1470581,
holding `127.0.0.1:4097` and `0.0.0.0:4099` (`ss -tlnp`). Note 4099 is the
dashboard even though `aiur/.aiur/config` sets `server.port: 4000` — the running
node was launched with an explicit `--port`, so config values are not a reliable
predictor of bound ports. Check `ss` before launching, not the config.

### C7. CONFIRMED (independently reproduced) — §1.9–§1.12 schema and §1.10.8 capstone rule

`/tmp/bo-probe/` no longer exists, so §1.12's artifact could not be inspected.
It was reproduced from scratch instead: a two-ticket build order hand-authored
**from this document alone** validated clean on the first attempt
(`validation: 0 error(s), 0 warning(s)`), with no `publication.json` present.
Mutating that file confirms the load-bearing rules by execution:

| Mutation | Validator output |
|---|---|
| delete `tickets[0].discovered_from` (a *nullable* key) | `tickets[0]: missing required key discovered_from` |
| add `tickets[0].extra_key` | `tickets[0]: unknown key extra_key` |
| capstone `depends_on: []` | `capstone does not transitively cover: KW-001` |
| make a second ticket `kind: capstone` | `the Build Order must contain exactly one capstone ticket` |
| `complexity_points: 2.0` | `KW-001: runnable complexity_points must be integer 1..5` |

`TOP_KEYS` is 17 keys and `TICKET_KEYS` is 31 keys as documented
(`validation_header.py:20-26`, `validation_tickets.py:25-34`). §1.10.8's closure
rule reads `RUNNABLE_KINDS` only (`validation_outcome.py:163-172`) — umbrellas
are correctly excluded, as the doc says. §3's "no `###` check exists" is correct:
`validation_documents.py:77` matches `^##\s+...` only.

### C8. CORRECTED — §8.1/§8.2: origin is now **two** commits behind, and the push still has not happened

```
$ gh api repos/its-everdred/kevinweaver-dev/commits/main --jq .sha
cefcffbd2981f25c919702013441401bf7d878ed
$ git rev-parse HEAD
d637182e2f16a06f004a8d148a443377fb21e962
$ git rev-list --left-right --count origin/main...HEAD
0	2
$ gh api repos/its-everdred/kevinweaver-dev/contents/docs
{"message":"Not Found", ... "status":"404"}
```

Local main is `d637182 Add aiur config for codex fleet` → `edae519 Import design
system and research` → `cefcffb` (remote head). The substance of the blocker is
**confirmed and now worse**: a fresh clone of `origin/main` has no `docs/`
directory at all (404 from the contents API), and additionally no `.aiur/`
config, hooks, prewarm or prompt.md. SSH push is still broken
(`git fetch` → `ssh_askpass: exec(/usr/lib/ssh/ssh-askpass): No such file or
directory; Permission denied (publickey)`), so push over HTTPS via the existing
`gh auth git-credential` helper.

### C9. DRIFT — §5.3's "ready-to-write" config is not the config on disk

`/home/everdred/github/everdred/kevinweaver-dev/.aiur/config` now exists (2.6 KB)
and differs materially from §5.3. Deltas that matter:

| Key | §5.3 says | On disk |
|---|---|---|
| `server.host` | `127.0.0.1` | `100.89.62.105` (tailnet) |
| `server.port` | `4110` | `4300` |
| `workspace.root` | `~/code/aiur-workspaces-kevinweaver` | `~/code/kwdev-workspaces` |
| `agent.max_concurrent_agents` | `6` | `8` |
| `agent.max_concurrent_builds` | `0` | `3` |
| `opencode.*` | whole section incl. `bridge_port: 4108` | section absent (correct — see C3) |
| `tracker.github.bot_account` | `its-applekid` | `its-everdred`, with an inline note that `its-applekid` is not a collaborator (404 on the collaborators API) |
| `alerts`, `pr_watch`, `max_turns_by_complexity.*` | present | `alerts`/`pr_watch` absent |

The on-disk `max_concurrent_builds: 3` contradicts §5.2/§7.4's reasoning that the
shared `~/.aiur/build-gate` should be bypassed with `0` for a Node repo. Pick one.
§12's open question 2 is also answered on disk: the token is `its-everdred`'s,
because `its-applekid` has no push access to this repo yet.
