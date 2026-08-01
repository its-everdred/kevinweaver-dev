# AUTHORING CONTRACT — `docs/build-orders/site-rewrite`

Derived by reading the validator source, not the examples or the research docs.
Every rule below is quoted from `/home/everdred/github/everdred/aiur/.claude/skills/aiur-build/scripts/`.
Every claim marked **(proved)** was reproduced by executing the validator against a
purpose-built fixture in this session.

Validator entry point:

```bash
python3 /home/everdred/github/everdred/aiur/.claude/skills/aiur-build/scripts/validate_build_order.py \
  docs/build-orders/site-rewrite/build-order.json
```

Exit `0` and `validation: 0 error(s), 0 warning(s)` is the acceptance bar.
`--repository-root`, `--root-document` and `--receipt-commit` are post-publication
flags only:

```python
# validate_build_order.py:120-141
if (args.repository_root is None) != (args.root_document is None):
    print("ERROR: --repository-root and --root-document must be supplied together")
...
_, report = _validate_path(args.path, args.repository_root, args.root_document, Report())
```

With no flags, `repository_root is None` and `root_document is None`, so
`_validate_path` skips `render_approved_build_order` entirely
(`validation_build_order.py:97`) and `validate_data` runs with
`approved_expectations = None, publication_authority = None`.

---

## 1. Which modules run pre-publish

`validate_data` is the whole pre-publish surface (`validation_build_order.py:45-77`):

```python
validate_identity(data, report)              # validation_header.py
workstreams = validate_workstreams(...)      # validation_header.py
critical_path = validate_boundary(...)       # validation_header.py
projection = validate_label_projection(...)  # validation_header.py
gates = validate_external_gates(...)         # validation_header.py
requirements = validate_requirements(...)    # validation_requirements.py
design = validate_design_evidence(...)       # validation_records.py
decisions = validate_decisions(...)          # validation_records.py
by_id = validate_tickets(...)                # validation_tickets.py -> validation_documents.py
validate_record_refs(...)                    # validation_records.py
validate_references(...)                     # validation_graph.py
validate_edge_types(...)                     # validation_graph.py
closure = dependency_closure(...)            # validation_graph.py
validate_hierarchy(...)                      # validation_graph.py
validate_phases(...)                         # validation_graph.py
validate_boundary_refs(...)                  # validation_graph.py
validate_label_coverage(...)                 # validation_outcome.py
validate_surface_conflicts(...)              # validation_outcome.py
validate_epic_acceptance(...)                # validation_outcome.py
validate_all_github(...)                     # validation_github.py
```

Pre-publish, `validate_all_github` short-circuits to a no-op **only if
`github_root` is `null`, every ticket `github` is `null`, and
`github_reconciliation` is `null`**:

```python
# validation_github.py:16-26
def validate_github_mapping(value, label, report, *, expected_repository=None):
    if value is None:
        return None
# validation_github_receipt.py:51-56
value = data.get("github_reconciliation")
any_mapping = root is not None or any(item is not None for item in ticket_mappings.values())
if value is None:
    if any_mapping:
        report.error("materialized GitHub identities require github_reconciliation")
    return
```

`validation_publication_authority.py`, `validation_github_approved.py`,
`validation_github_live*.py`, `validation_git_*.py` and everything under
`scripts/publication/` do **not** execute in a pre-publish run.

---

## 2. Pack layout (exact file paths)

Only these paths are load-bearing for the validator. Everything else is
planning-contract convention (`planning-contract.md:17-34`) and is not machine-checked.

```text
docs/build-orders/site-rewrite/
  build-order.json            # REQUIRED. CLI argument. Publisher requires this exact filename.
  publication.json            # REQUIRED before publication only. Must be a sibling of build-order.json.
  root-issue.md               # REQUIRED before publication only. Path is repo-relative in publication.json.
  tickets/KW-001-<slug>.md    # REQUIRED: one per ticket, path from build-order.json's ticket[].document
  tickets/KW-002-<slug>.md
  ... KW-003 .. KW-032 ...
  evidence/<artifact>.md      # REQUIRED only if design_evidence[] is non-empty
  AUTHORING-CONTRACT.md       # this file (not validated)
  README.md                   # convention
  questions-or-commands.md    # convention
  00-brief-and-requirements.md
  01-research-index.md
  02-current-target-delta.md
  03-technical-decisions.md
  04-test-and-rollout.md
  deferred-findings.md
  validation-report.md
  EXECUTOR-HANDOFF.md
```

Path rules that the validator enforces:

- `ticket.document` and `design_evidence[].artifact` resolve **relative to the
  directory containing `build-order.json`** — `validate_document(... base_dir ...)`
  is called with `path.parent` (`validation_build_order.py:110`).
- The sanitizer rejects absolute paths, `..` segments, `.` , non-normalized
  strings, NUL bytes, and any `.git` path component:
  ```python
  # validation_common.py:140-149
  if (path.is_absolute() or ".." in path.parts or (normalized == "." and not allow_dot)
      or normalized != value or "\x00" in value
      or any(part.casefold() == ".git" for part in path.parts)):
      report.error(f"{label} must be a safe repository-relative path")
  ```
  **(proved)** `"document": "../pack/tickets/KW-001-one.md"` →
  `ERROR: KW-001.document must be a safe repository-relative path`.
- Every path component is checked for symlinks:
  ```python
  # validation_common.py:178-182
  if reject_symlinks and candidate.is_symlink():
      report.error(f"{label} must not be a symlink")
  ```
  **(proved)** a symlinked ticket doc → `ERROR: KW-001.document must not be a symlink`.
- Nested subdirectories under the pack are legal (`tickets/sub/x.md` **(proved)** OK).
- Consequence for design evidence: `docs/design/kevinweaver.dev.dc.html` **cannot**
  be referenced as `../../design/...`. Copy it into `evidence/` and hash the copy.
- Receipt materialization bounds (only bite at publication, but bound the pack):
  ```python
  # validation_git_snapshot.py:18-20
  MAX_PACK_FILES = 512
  MAX_PACK_FILE_BYTES = 2 * 1024 * 1024
  MAX_PACK_BYTES = 32 * 1024 * 1024
  ```
- The publisher additionally requires the literal filenames and one shared directory:
  ```python
  # publish_build_order.py:87-92
  if build.name != "build-order.json" or publication.name != "publication.json":
      raise PublicationError("canonical manifests must be named build-order.json and publication.json")
  if build.parent != publication.parent:
      raise PublicationError("canonical manifests must share one planning-pack directory")
  ```

---

## 3. `build-order.json` schema

### 3.1 The schema is CLOSED, at every level

```python
# validation_common.py:70-81
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

`required` is simultaneously the minimum and the maximum key set. There are **no
optional keys** — only keys whose *value* may be `null`. **(proved)** removing
`github_root` → `ERROR: top level: missing required key github_root`.

### 3.2 Root object — exactly 17 keys

```python
# validation_header.py:21-27
TOP_KEYS = {
    "schema_version", "build_order_id", "ticket_prefix", "plan_version",
    "repository", "researched_at_commit", "workstreams", "github_root",
    "label_projection", "feature_boundary", "external_gates", "requirements",
    "design_evidence", "decisions", "tickets", "epic_acceptance",
    "github_reconciliation",
}
```

| Key | Type | Rule (source) |
|---|---|---|
| `schema_version` | int | must be exactly `1` — `validation_header.py:40-41` |
| `build_order_id` | string | `"<repository>:<slug>"`, suffix matches `SLUG` — `validation_header.py:60-64` |
| `ticket_prefix` | string **or** array of strings | each item `.isalnum() and .isupper() and item[0].isalpha()` — `validation_header.py:45-54` |
| `plan_version` | int | `strict_int` and `>= 1` — `validation_header.py:55-57` |
| `repository` | string | `^[^/\s]+/[^/\s]+$` — `validation_header.py:58-59` |
| `researched_at_commit` | string | `^[0-9a-fA-F]{40}$` — `validation_header.py:65-67` |
| `workstreams` | array | **non-empty**; `{id,title}`; `id` is `SLUG`; unique — `validation_header.py:70-90` |
| `github_root` | object \| null | `null` pre-publication |
| `label_projection` | object | §3.3 |
| `feature_boundary` | object | §3.4 |
| `external_gates` | array | may be `[]` **(proved)** — `validation_header.py:147-169` |
| `requirements` | array | **non-empty** — `validation_requirements.py:21-23` |
| `design_evidence` | array | may be `[]` **(proved)** — `validation_records.py:33-35` |
| `decisions` | array | **non-empty** — `validation_records.py:74-76` |
| `tickets` | array | **non-empty** — `validation_tickets.py:134-136` |
| `epic_acceptance` | object | `{owner_ticket_id, evidence}` — `validation_outcome.py:137-142` |
| `github_reconciliation` | object \| null | `null` pre-publication |

Concrete values for this pack:

```json
"schema_version": 1,
"build_order_id": "its-everdred/kevinweaver-dev:site-rewrite",
"ticket_prefix": "KW",
"plan_version": 1,
"repository": "its-everdred/kevinweaver-dev",
"researched_at_commit": "<40-hex SHA of the pushed planning commit>",
"github_root": null,
"github_reconciliation": null
```

`repository` is `its-everdred/kevinweaver-dev` (measured: `git remote -v`), **not**
`everdred/...`. `build_order_id` must be exactly `repository + ":" + slug` and the
slug must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` — `site-rewrite` qualifies;
`Site_Rewrite` does not **(proved)**.

### 3.3 `label_projection` — exactly 6 keys

```python
# validation_header.py:32-35
LABEL_KEYS = {
    "build_order", "workstreams", "phases", "complexities",
    "required_ticket_labels", "forbidden_labels",
}
```

- `build_order`: non-empty string, root-only label.
- `workstreams` / `phases` / `complexities`: objects, string→string. Duplicate
  label values inside one mapping error (`validation_header.py:123-125`).
- Key sets are checked for **exact** coverage — missing *and* unused:
  ```python
  # validation_outcome.py:24-48
  expected = {
      "workstreams": workstreams,
      "phases": {str(t["phase_hint"]) for t in by_id.values() if type(t.get("phase_hint")) is int},
      "complexities": {str(t["complexity_points"]) for t in by_id.values() if type(t.get("complexity_points")) is int},
  }
  ...
  for missing in sorted(expected_keys - actual_keys):
      report.error(f"label_projection.{key} missing key {missing}")
  for extra in sorted(actual_keys - expected_keys):
      report.error(f"label_projection.{key} has unused key {extra}")
  ```
  **(proved)** both directions.
- Every label across `build_order` + `required_ticket_labels` + all three mappings
  must be unique case-insensitively (`validation_outcome.py:50-51`) **(proved)**.
- `required_ticket_labels ∩ forbidden_labels = ∅`, case-insensitive
  (`validation_header.py:136-143`).

For this pack, phases run 1..7 and complexities are exactly `{1,2,3,4}` (the
authoritative topological table in the synthesis; no complexity-5 ticket exists,
so `"5"` must **not** appear):

```json
"label_projection": {
  "build_order": "build-order",
  "workstreams": {"<one entry per declared workstream id>": "build-lane:<id>"},
  "phases": {"1":"phase:1","2":"phase:2","3":"phase:3","4":"phase:4","5":"phase:5","6":"phase:6","7":"phase:7"},
  "complexities": {"1":"complexity:1","2":"complexity:2","3":"complexity:3","4":"complexity:4"},
  "required_ticket_labels": ["model:claude"],
  "forbidden_labels": ["agent:todo","agent:in-progress","agent:ci-wait","agent:human-review","agent:rework","agent:merging","agent:done","agent:error","agent:cancelled","agent:canceled","agent:paused"]
}
```

The synthesis does not name lanes. Choose 3–6 lowercase-slug workstreams
(e.g. `platform`, `chrome`, `data`, `viz`) and give each exactly one label.
A declared-but-unused workstream is **not** an error **(proved)**; a
declared-but-unlabelled one is.

### 3.4 `feature_boundary` — exactly 6 keys

```python
# validation_header.py:28-31
BOUNDARY_KEYS = {
    "acceptance_criteria", "critical_path_ticket_ids", "required_documentation",
    "required_cleanup", "end_to_end_proof", "completion_condition",
}
# validation_header.py:97-105
required = key in {"acceptance_criteria", "critical_path_ticket_ids", "end_to_end_proof"}
```

- `acceptance_criteria`, `critical_path_ticket_ids`, `end_to_end_proof`: arrays of
  non-empty strings, **must be non-empty**.
- `required_documentation`, `required_cleanup`: arrays, may be `[]`.
- `completion_condition`: non-empty string.
- All arrays reject duplicate values (`validation_common.py:102-106`).
- Every critical-path ID must resolve to a **runnable** ticket:
  ```python
  # validation_graph.py:160-168
  elif not isinstance(ticket.get("kind"), str) or ticket.get("kind") not in RUNNABLE_KINDS:
      report.error(f"feature_boundary: critical-path ticket {ticket_id} is not runnable")
  ```
  **(proved)** with an umbrella in the list.
- The capstone must be present (`validation_outcome.py:154-155`) **(proved)**.

Critical path for this pack (from the synthesis):
`["KW-001","KW-008","KW-022","KW-024","KW-025","KW-029","KW-032"]`.

### 3.5 `external_gates[]` — exactly 4 keys, ID must be `GATE-\d{3,}`

```python
# validation_header.py:153
keys = {"id", "title", "owner", "resolution_criteria"}
# validation_common.py:17
GATE_ID = re.compile(r"^GATE-[0-9]{3,}$", re.ASCII)
```

**(proved)** `GATE-01` → `ERROR: external_gates[0].id must look like GATE-001`.
Map the synthesis's `HG-1..HG-7` to `GATE-001..GATE-007`. `title`, `owner`,
`resolution_criteria` are all required non-empty strings.

### 3.6 `requirements[]` — exactly 5 keys

```python
# validation_requirements.py:25
keys = {"id", "summary", "disposition", "ticket_ids", "reason"}
# validation_common.py:14
REQ_ID = re.compile(r"^[A-Z][A-Z0-9]*-[0-9]{3,}$", re.ASCII)   # no trailing letter allowed
# validation_requirements.py:48-59
if disposition == "ticket":
    if not ticket_ids: report.error(f"{req_id}: ticket disposition requires ticket_ids")
    if reason is not None: report.error(f"{req_id}: ticket disposition requires null reason")
elif disposition in {"deferred", "rejected", "satisfied"}:
    if ticket_ids: report.error(f"{req_id}: {disposition} disposition cannot have ticket_ids")
    if not nonempty_string(reason): report.error(f"{req_id}: {disposition} disposition requires reason")
```

Bidirectional traceability is enforced in both directions
(`validation_graph.py:38-55`) **(proved)** — a `ticket_ids` entry whose ticket
does not list the requirement errors, and vice versa.

### 3.7 `design_evidence[]` — exactly 5 keys

```python
# validation_records.py:21
DESIGN_KEYS = {"id", "source", "captured_at", "artifact", "sha256"}
# validation_common.py:16
DESIGN_ID = re.compile(r"^DESIGN-[0-9]{3,}$", re.ASCII)
# validation_records.py:63-67
path = _artifact_path(record.get("artifact"), f"{evidence_id}.artifact", base_dir, report)
if path is not None and expected_hash is not None:
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual.casefold() != expected_hash.casefold():
        report.error(f"{evidence_id}.sha256 does not match {record.get('artifact')}")
```

- `sha256` must be 64 characters and parse as hex (`validation_records.py:53-62`).
- `captured_at` is only checked as a **non-empty string** — the RFC3339 helper
  exists but is not applied here **(proved)** with `"captured_at": "not-a-date"`.
- Every `DESIGN-*` must be referenced by a decision or a ticket
  (`validation_records.py:135-137`) **(proved)** — orphan evidence errors.
- The array may be `[]`.

### 3.8 `decisions[]` — exactly 5 keys, array must be non-empty

```python
# validation_records.py:22
DECISION_KEYS = {"id", "summary", "status", "rationale", "design_evidence_refs"}
# validation_common.py:15
DECISION_ID = re.compile(r"^DEC-[0-9]{3,}$", re.ASCII)
# validation_records.py:93-95
if not isinstance(status, str) or status not in {"accepted", "rejected"}:
    report.error(f"{decision_id}.status must be accepted or rejected")
# validation_records.py:132-134
if decision.get("status") == "accepted" and decision_id not in decision_users:
    report.error(f"{decision_id}: accepted decision is not referenced by any ticket")
```

- **Every accepted decision must be referenced by ≥1 ticket's `decision_refs`**
  **(proved)**. Map `D-01..D-17` → `DEC-001..DEC-017`, and make sure each one is
  cited by at least one ticket, or record it as `"status": "rejected"`.
- A ticket may not reference a rejected decision **(proved)**:
  `ERROR: KW-001: cannot reference rejected decision DEC-002`.
- An *unreferenced rejected* decision is fine **(proved)**.

### 3.9 `tickets[]` — exactly 31 keys

```python
# validation_tickets.py:25-34
TICKET_KEYS = {
    "id", "kind", "provenance", "introduced_in_plan_version", "discovered_from",
    "title", "document", "outcome", "scope", "non_goals", "phase_hint",
    "complexity_points", "complexity_rationale", "risk", "capability_requirements",
    "workstream", "requirement_refs", "depends_on", "serializes_with",
    "suggested_after", "contains", "external_gates", "read_surfaces",
    "write_surfaces", "contract_surfaces", "safety_surfaces",
    "conflict_exceptions", "acceptance", "decision_refs",
    "design_evidence_refs", "github",
}
```

Canonical runnable record for this pack:

```json
{
  "id": "KW-001",
  "kind": "executable",
  "provenance": "planned",
  "introduced_in_plan_version": 1,
  "discovered_from": null,
  "title": "Foundation: toolchain re-scaffold and green CI gate",
  "document": "tickets/KW-001-foundation-toolchain-ci.md",
  "outcome": "…one observable operator-facing result…",
  "scope": ["…"],
  "non_goals": ["…"],
  "phase_hint": 1,
  "complexity_points": 4,
  "complexity_rationale": "…",
  "risk": "high",
  "capability_requirements": ["frontend", "build"],
  "workstream": "platform",
  "requirement_refs": ["REQ-001"],
  "depends_on": [],
  "serializes_with": [],
  "suggested_after": [],
  "contains": [],
  "external_gates": ["GATE-001", "GATE-002", "GATE-006"],
  "read_surfaces": ["…"],
  "write_surfaces": ["package.json", "…"],
  "contract_surfaces": ["…"],
  "safety_surfaces": ["…"],
  "conflict_exceptions": [],
  "acceptance": {"agent_gate": ["…"], "at_merge_gate": ["…"], "human_or_e2e": []},
  "decision_refs": ["DEC-001", "DEC-002", "DEC-003"],
  "design_evidence_refs": [],
  "github": null
}
```

Field rules (`validation_tickets.py:80-127`):

| Field | Runnable (`executable`/`audit`/`gate`/`capstone`) | Umbrella |
|---|---|---|
| `kind` | one of `KINDS` (`validation_common.py:21`) | `umbrella` |
| `provenance` | `planned` \| `discovered` | same |
| `discovered_from` | `null` when planned; a `TICKET_ID` when discovered | same |
| `introduced_in_plan_version` | int, `1 <= v <= plan_version` **(proved)** | same |
| `title`, `outcome` | non-empty string | non-empty string |
| `scope`, `non_goals` | non-empty arrays | **also non-empty** **(proved)** |
| `phase_hint` | int `>= 1` | int `>= 1` (still required) |
| `complexity_points` | int `1..5`, `strict_int` (a JSON `2.0` fails **(proved)**) | **must be `null`** **(proved)** |
| `complexity_rationale`, `risk` | non-empty strings | may be `null` |
| `capability_requirements`, `requirement_refs` | non-empty arrays **(proved)** | may be `[]` |
| `contains` | must be `[]` | must be non-empty **(proved)** |
| `acceptance.agent_gate`, `.at_merge_gate` | non-empty | **all three must be empty** **(proved)** |
| `github` | `null` pre-publication | `null` |

`risk` is a free-form non-empty string; no enum is enforced.

`acceptance` — exactly 3 keys (`validation_tickets.py:35`):
`{"agent_gate": [...], "at_merge_gate": [...], "human_or_e2e": [...]}`.

`conflict_exceptions[]` — exactly 3 keys (`validation_tickets.py:36`):
`{"ticket_id": "...", "surfaces": ["..."], "reason": "..."}`; `surfaces` must be
non-empty; each pair may be declared **once, from one side only** **(proved)**:
`ERROR: KW-002 and KW-001: conflict exception must be declared once`.

Every array field goes through `checked_string_list`, which rejects empty/blank
strings **and duplicates** **(proved)**:

```python
# validation_common.py:102-106
seen: set[str] = set()
for item in result:
    if item in seen:
        report.error(f"{label} contains duplicate value {item}")
```

### 3.10 Ticket ID format — the single biggest transcription trap

```python
# validation_common.py:13
TICKET_ID = re.compile(r"^[A-Z][A-Z0-9]*-[0-9]{3,}[A-Z]?$", re.ASCII)
# validation_tickets.py:140-147
expected = re.compile("^(?:" + "|".join(re.escape(item) for item in prefixes) + ")-[0-9]{3,}[A-Z]?$", re.ASCII)
```

**A minimum of three digits is mandatory.** The synthesis writes `KW-01 … KW-32`;
those literal strings **cannot validate** **(proved)**:

```
ERROR: tickets[0].id must be a full stable ticket ID
```

Zero-pad to three digits and keep the 1:1 ordinal mapping:

| Synthesis | build-order.json | Synthesis | build-order.json |
|---|---|---|---|
| KW-01 | `KW-001` | KW-17 | `KW-017` |
| KW-02 | `KW-002` | KW-18 | `KW-018` |
| KW-03 | `KW-003` | KW-19 | `KW-019` |
| KW-04 | `KW-004` | KW-20 | `KW-020` |
| KW-05 | `KW-005` | KW-21 | `KW-021` |
| KW-06 | `KW-006` | KW-22 | `KW-022` |
| KW-07 | `KW-007` | KW-23 | `KW-023` |
| KW-08 | `KW-008` | KW-24 | `KW-024` |
| KW-09 | `KW-009` | KW-25 | `KW-025` |
| KW-10 | `KW-010` | KW-26 | `KW-026` |
| KW-11 | `KW-011` | KW-27 | `KW-027` |
| KW-12 | `KW-012` | KW-28 | `KW-028` |
| KW-13 | `KW-013` | KW-29 | `KW-029` |
| KW-14 | `KW-014` | KW-30 | `KW-030` |
| KW-15 | `KW-015` | KW-31 | `KW-031` |
| KW-16 | `KW-016` | KW-32 | `KW-032` |

The padding is a rendering of the same identity, not a re-plan: complexity,
dependencies, phase and write surfaces are preserved exactly. Record the mapping
in `README.md` so the synthesis remains readable against the pack.

The same `{3,}` rule applies to `REQ-###`, `DEC-###`, `DESIGN-###`, `GATE-###`.

### 3.11 Graph invariants

```python
# validation_graph.py:24-28   self-edges and unknown endpoints
if target == ticket_id:      report.error(f"{ticket_id}: {field} contains a self-edge")
elif target not in by_id:    report.error(f"{ticket_id}: {field} references unknown ticket {target}")
# validation_graph.py:65-73   symmetry / anti-symmetry
if ticket_id not in reverse: report.error(f"{ticket_id}: serializes_with {target} must be symmetric")
if ticket_id in safe_list(by_id[target], "suggested_after"):
    report.error(f"{ticket_id} and {target}: suggested_after cannot point both ways")
# validation_graph.py:74-78   one edge type per unordered pair
if len(types) > 1:
    report.error(f"{', '.join(sorted(pair))}: contradictory edge types {', '.join(sorted(types))}")
# validation_graph.py:92-93   cycles
report.error(f"hard dependency cycle: {' -> '.join(stack[start:] + [ticket_id])}")
# validation_graph.py:117-126 hierarchy
if ticket.get("kind") == "umbrella" and not children: "umbrella must contain at least one ticket"
if ticket.get("kind") != "umbrella" and children:     "only umbrella tickets may contain other tickets"
if child in owners and owners[child] != ticket_id:    "contained by both X and Y"
# validation_graph.py:152-157 phases
if type(dep_phase) is int and phase < dep_phase:
    report.error(f"{ticket_id}: phase {phase} is earlier than dependency {dependency} phase {dep_phase}")
```

Equal phases on a hard dependency are legal; only *lower* is an error. Because
`depends_on` and `contains` are both in the pair-type set, an umbrella must not
also `depends_on` a ticket it contains **(proved)**.

Phase assignment for this pack (the synthesis's authoritative topological table):

| `phase_hint` | tickets |
|---|---|
| 1 | KW-001, KW-002 |
| 2 | KW-003 … KW-012 |
| 3 | KW-013 … KW-023 |
| 4 | KW-024, KW-027, KW-028 |
| 5 | KW-025, KW-026 |
| 6 | KW-029, KW-030, KW-031 |
| 7 | KW-032 |

`serializes_with` is empty for every ticket (D-05), so the only edge type in play
is `depends_on`.

### 3.12 Surface conflicts

```python
# validation_common.py:26
SURFACE_FIELDS = ("write_surfaces", "contract_surfaces", "safety_surfaces")
# validation_outcome.py:104-127
safety_overlap = (left_safety & set(right_all)) | (right_safety & set(left_all))
ordered = right_id in closure.get(left_id, set()) or left_id in closure.get(right_id, set())
serialized = right_id in safe_list(left, "serializes_with")
...
if ordered or serialized: continue
uncovered_safety = safety_overlap - excepted
if uncovered_safety:
    report.error(f"{left_id} and {right_id}: parallel safety-surface conflict: " + ...)
uncovered = overlap - excepted - safety_overlap
if uncovered:
    report.warn(f"{left_id} and {right_id}: overlapping parallel surfaces: " + ...)
```

- `read_surfaces` is **not** in `SURFACE_FIELDS` — read overlap never warns **(proved)**.
- Comparison is trimmed + case-folded (`validation_common.py:110-119`), so
  `"X"` and `"x"` collide **(proved)**.
- Safety overlap is *cross-field*: one ticket's `safety_surfaces` against the
  other's `write_surfaces`/`contract_surfaces` is still an error **(proved)**.
- Only runnable kinds participate (`validation_outcome.py:84-88`).
- Hard ordering (transitive `depends_on` closure), `serializes_with` **(proved)**,
  or a structured `conflict_exceptions` entry **(proved)** clears the conflict.
- Non-safety overlap is a **warning**. Warnings do not fail the run
  (`validate_build_order.py:95`), but the planning contract requires each to be
  dispositioned in the validation report.

The synthesis's write-surface partition proves no two same-wave tickets share a
file, so authoring `write_surfaces` from that table should produce zero warnings.

### 3.13 `epic_acceptance` — the hardest global rule

```python
# validation_outcome.py:137-172
acceptance = strict_object(data.get("epic_acceptance"), "epic_acceptance", {"owner_ticket_id", "evidence"}, report)
capstones = [tid for tid, t in by_id.items() if t.get("kind") == "capstone"]
if len(capstones) != 1: report.error("the Build Order must contain exactly one capstone ticket")
if by_id[owner].get("kind") != "capstone": report.error("epic acceptance owner must be the capstone ticket")
if owner not in critical_path: report.error("feature_boundary critical path must include the capstone")
evidence = checked_string_list(..., require_items=True)
if evidence and not human_evidence: report.error("capstone acceptance must include human_or_e2e evidence")
required = {tid for tid, t in by_id.items() if t.get("kind") in RUNNABLE_KINDS and tid != owner}
missing = required - closure.get(owner, set())
if missing: report.error("capstone does not transitively cover: " + ", ".join(sorted(missing)))
```

All five sub-rules **(proved)**. `required` uses `RUNNABLE_KINDS` only, so
umbrellas are correctly excluded from the coverage requirement.

For this pack the capstone is `KW-032` with
`depends_on: ["KW-002","KW-018","KW-019","KW-026","KW-027","KW-029","KW-030","KW-031"]`.
That closure was hand-expanded and covers all 31 other tickets:
`KW-018→005,003,004→001`; `KW-026→024→021,022→008,007`; `KW-027→005,006,016,017`;
`KW-029→023→001,011 / 025→015→012 / 020`; `KW-030→028→013→009,012 / 014→010`;
`KW-031→023,024,025`.

---

## 4. Ticket document contract

### 4.1 What the validator enforces

```python
# validation_documents.py:18-30
REQUIRED_HEADINGS = (
    "Outcome",
    "Context and evidence",
    "Scope",
    "Non-goals",
    "Existing owner and reuse target",
    "Contract and invariants",
    "Refreshable implementation notes",
    "Acceptance and verification",
    "Failure, security, migration, and accessibility cases",
    "Surfaces",
    "Sibling boundaries and open gates",
)
# validation_documents.py:52-78
if not re.match(rf"^#\s+(?:BO:\s+)?{re.escape(ticket_id)}(?:\s|—|-)", first_line):
    report.error(f"{ticket_id}.document heading must begin with '# {ticket_id}' or '# BO: {ticket_id}'")
if isinstance(kind, str) and not re.search(rf"(?m)^\*\*Kind:\*\*\s+{re.escape(kind)}\s*$", text):
    report.error(f"{ticket_id}.document Kind metadata must match build-order.json")
if not isinstance(kind, str) or kind not in RUNNABLE_KINDS:
    return                                   # umbrellas stop here
pattern = rf"(?m)^\*\*Researched at:\*\*\s+{re.escape(str(researched_at))}(?:\s|$)"
if not re.search(pattern, text):
    report.error(f"{ticket_id}.document Researched at metadata must match build-order.json")
for req_id in safe_list(ticket, "requirement_refs"):
    if isinstance(req_id, str) and not re.search(rf"(?m)^\*\*Requirements:\*\*.*\b{re.escape(req_id)}\b", text):
        report.error(f"{ticket_id}.document Requirements metadata omits {req_id}")
for heading in REQUIRED_HEADINGS:
    if not re.search(rf"(?m)^##\s+{re.escape(heading)}\s*$", text):
        report.error(f"{ticket_id}.document missing section: {heading}")
```

Measured behaviour:

- H1 separator must be a space, an em dash `—`, or a hyphen. `# KW-001: One`
  **fails** **(proved)**; `# KW-001 — One`, `# KW-001 - One`, `# BO: KW-001 — One`
  all pass **(proved)**; a bare `# KW-001` with nothing after fails **(proved)**.
- Headings are matched with `^##\s+<verbatim>\s*$` — **level-2 only**, exact case,
  nothing after the text. `### Outcome` fails; `## Scope of work` fails;
  `## Non-Goals` fails; `## Outcome   ` (trailing spaces) passes. All **(proved)**.
- Heading **order is not checked** by the validator. Use the order above anyway —
  it is the planning-contract order and the published issue body is the document
  verbatim.
- `### Agent gate` / `### At-merge gate` / `### Human/manual evidence` are **not**
  validator-enforced **(proved)** — no `###` check exists. Include them: they are
  the contract's template and the worker's checklist.
- `**Researched at:**` must carry the **full 40-char SHA** from
  `researched_at_commit`, byte-identical **(proved)**.
- `**Requirements:**` must be a single line containing every `requirement_refs`
  entry, word-boundary matched **(proved)**.
- `**Kind:**` must match `kind` exactly and be alone on its line **(proved)**.
- Umbrella documents need **only** the H1 and `**Kind:** umbrella` **(proved)** —
  `validate_document` returns before every other check.
- Files must be UTF-8 (`path.read_text(encoding="utf-8")`, `validation_documents.py:47`).
  CRLF line endings pass **(proved)**, but use LF: publication freezes the file
  byte-for-byte.

### 4.2 Constraints that only bite at publication — bake them in now

- A published ticket body is `authority_preamble + source verbatim`
  (`validation_github_rendering.py:53-61`). `inspect_issue_body` then requires:
  ```python
  # validation_github_rendering.py:113-119
  links = COMMIT_LINK.findall(body)
  if len(links) != 1:
      report.error(f"{label} must contain exactly one approved commit link")
  ```
  `COMMIT_LINK = https://github\.com/[^/\s)]+/[^/\s)]+/commit/[0-9a-fA-F]{40}`.
  → **A ticket document must contain zero `https://github.com/<o>/<r>/commit/<sha>`
  URLs.** One is added by the preamble; a second breaks publication. Cite commits
  as bare SHAs or as `.../tree/<sha>/path` links instead.
- ```python
  # validation_github_rendering.py:89-92
  marker_count = body.count(f"<!-- {MARKER_NAME}")
  if marker_count != 1 or len(matches) != 1:
      report.error(f"{label} must contain exactly one schema-2 {MARKER_NAME} marker")
  ```
  → **A ticket document must never contain the string `<!-- aiur-planning-issue`.**
- Titles are rendered from the H1 (`validation_github_approved.py:171-177`
  returns `first_line[2:].strip()`), so the whole H1 after `# ` becomes the GitHub
  issue title. Keep it ≤ 256 chars, single line, trimmed.
- After approval, current documents are frozen byte-for-byte
  (`validation_github_approved.py:180-189`: `"must exactly match its approved source"`).
- Do not add an umbrella ticket. The default publisher does
  `projection["complexities"][str(ticket["complexity_points"])]`
  (`publication/publication_operator.py:1189-1194`), and an umbrella's `null`
  stringifies to `"None"` → `PublicationError: ticket label projection is invalid`.
  This pack has no umbrella, which is the safe shape.
- `publication/publication_common.py:173-218` implements a *different*, stricter
  document check (`# BO: <ID> — <title>` exactly, `**Complexity:** N`,
  `**Depends on:** …` matching JSON). It runs only via the DASH-specific extension
  path (`publication_operator.py:1123-1136`), which requires either
  `<pack>/scripts/publication_adapter.py` or a `skill_issue` key in
  `publication.json`. This pack must have neither — a `skill_issue` key would
  fail `strict_object` on the manifest anyway. Authoring `**Complexity:**` and
  `**Depends on:**` lines regardless costs nothing and keeps both paths open.

### 4.3 The exact ticket template

Runnable tickets (`executable`, `audit`, `gate`, `capstone`) — placeholders in
`<ANGLE BRACKETS>`:

```markdown
# <TICKET_ID> — <TITLE>

**Kind:** <executable|audit|gate|capstone>

**Provenance:** planned in plan v1

**Complexity:** <1-5> — <COMPLEXITY_RATIONALE, identical text to build-order.json>

**Risk:** <RISK, identical text to build-order.json>

**Phase hint:** <PHASE_HINT>

**Depends on:** <COMMA-SEPARATED TICKET IDS | none>

**Serializes with:** none

**Requirements:** <COMMA-SEPARATED REQ IDS>

**Decisions:** <COMMA-SEPARATED DEC IDS>

**Gates:** <COMMA-SEPARATED GATE IDS | none>

**Workstream:** <WORKSTREAM_ID>

**Researched at:** <40-CHAR RESEARCHED_AT_COMMIT>

## Outcome

<One observable result, phrased for an operator. Identical intent to
build-order.json `outcome`.>

## Context and evidence

<Why this work exists. Cite GT-n ground truth, C-n contradictions, D-nn/DEC-nnn
decisions, HG-n/GATE-nnn gates, and the pack navigation block: pack index,
wave/graph analysis, decision registry, this ticket's implementation pointers —
all pinned to the approved planning commit.>

## Scope

- <Exact behaviour and contract this ticket owns. One bullet per `scope` entry.>

## Non-goals

- <Sibling behaviour this ticket must not absorb. One bullet per `non_goals` entry.>

## Existing owner and reuse target

<Name the current file/module/component to extend, verified to exist at
researched_at_commit, or name the upstream ticket that creates it. A phantom
target is a review-blocking defect.>

## Contract and invariants

<Stable behaviour, state precedence, error/freshness semantics, public seams.
For every producer/consumer pair, the producer quotes one concrete interface
sketch (TypeScript typespec or JSON shape) verbatim; consumers quote it back.>

## Refreshable implementation notes

<Exact files to create/modify with full repository paths, module and function
names, patterns to copy, one worked data shape or fixture, exact version pins.
Marked refreshable against researched_at_commit; the worker re-verifies at pickup
without silently changing scope.>

## Acceptance and verification

### Agent gate

- <Check the worker can run in its issue workspace. One bullet per
  `acceptance.agent_gate` entry, same text.>

### At-merge gate

- <Check requiring current base or central CI. One bullet per
  `acceptance.at_merge_gate` entry, same text.>

### Human/manual evidence

<"None; KW-032 owns feature-level operator evidence." or one bullet per
`acceptance.human_or_e2e` entry.>

## Failure, security, migration, and accessibility cases

<Only relevant concerns; explicitly say when none apply.>

## Surfaces

- Reads: <read_surfaces, comma-separated, matching build-order.json>
- Writes: <write_surfaces, comma-separated, matching build-order.json>
- Contracts: <contract_surfaces, comma-separated, matching build-order.json>
- Safety: <safety_surfaces, comma-separated, matching build-order.json>

## Sibling boundaries and open gates

<What adjacent tickets own, and any GATE-nnn that blocks pickup.>
```

Umbrella tickets (not used by this pack) need only:

```markdown
# <TICKET_ID> — <TITLE>

**Kind:** umbrella

<One paragraph: what this groups and why it hides no internal program.>
```

---

## 5. `publication.json` schema

Only read at publication/receipt time, from Git history at both the approval and
the receipt commit; the two parsed records must be identical
(`validation_publication_authority.py:74-80`).

```python
# validation_publication_authority.py:24-33
MANIFEST_KEYS = {
    "trusted_repository_ref",
    "root_document",
    "mutation_repositories",
    "reference_only_issue_urls",
    "tracker_lifecycle_label_prefix",
}
ISSUE_URL = re.compile(r"^https://github\.com/[^/\s]+/[^/\s]+/issues/[1-9][0-9]*$", re.ASCII)
# validation_publication_authority.py:131-144
if not isinstance(trusted_ref, str):                    "trusted_repository_ref must be a string"
if root_document is None:                               # repository_relative_path sanitizer
if any(not REPOSITORY.fullmatch(item) for item in repositories):
                                                        "mutation_repositories must contain owner/repo values"
if any(not ISSUE_URL.fullmatch(item) for item in reference_only):
                                                        "reference_only_issue_urls must contain exact issue URLs"
if not nonempty_string(prefix) or ":" in str(prefix):   "tracker_lifecycle_label_prefix must be one label segment"
```

Exactly 5 keys, all required, no unknown keys (`strict_object`).
`mutation_repositories` is `require_items=True` — it must be non-empty
(`validation_publication_authority.py:121-124`).

```json
{
  "trusted_repository_ref": "refs/heads/main",
  "root_document": "docs/build-orders/site-rewrite/root-issue.md",
  "mutation_repositories": ["its-everdred/kevinweaver-dev"],
  "reference_only_issue_urls": [],
  "tracker_lifecycle_label_prefix": "agent"
}
```

Semantics:

- `root_document` is **repository-relative**, not pack-relative, and
  `--root-document` on the CLI must equal it byte-for-byte
  (`validate_build_order.py:57-61`: `"--root-document must equal immutable
  publication root_document"`).
- The manifest is located as `<pack>/publication.json`
  (`validate_build_order.py:46`).
- `mutation_repositories` is the allowlist for every `github`/`github_root`
  mapping; `reference_only_issue_urls` is the denylist
  (`validation_github.py:104-114`).
- `tracker_lifecycle_label_prefix` must equal the aiur tracker prefix (`agent`)
  or the label-drift check fails (`validation_github_labels.py:79-83`).
- `publication.json` must be a regular blob (mode `100644`/`100755`) at both
  commits (`validation_publication_authority.py:153-162`).

### `root-issue.md` (required alongside `publication.json`)

Rendered by `render_template_body` (`validation_github_rendering.py:64-78`): the
single token `<APPROVED_SHA>` is substituted, then `inspect_issue_body` demands
exactly one schema-2 marker and exactly one approved-commit link. This exact
skeleton was executed against `render_template_body` and returned no errors
**(proved)**:

```markdown
# Build Order: kevinweaver.dev site rewrite

> Approved planning authority: [`<APPROVED_SHA>`](https://github.com/its-everdred/kevinweaver-dev/commit/<APPROVED_SHA>)

<!-- aiur-planning-issue
{"schema":2,"logical_id":"its-everdred/kevinweaver-dev:site-rewrite","plan_version":1,"approved_planning_commit":"<APPROVED_SHA>"}
-->

## Scope

<root issue prose: objective, non-goals, boundary, wave table, gate list>
```

The marker regex is strict — payload must be **one line**, ASCII, between the
opening comment line and `-->`:

```python
# validation_github_rendering.py:32-35
MARKER = re.compile(r"<!-- aiur-planning-issue[ \t]*\n(?P<payload>[^\n]*)\n-->", re.ASCII)
```

and the payload keys are exactly
`{"schema", "logical_id", "plan_version", "approved_planning_commit"}` with
`schema == 2`, `logical_id == build_order_id`, `plan_version` matching, and
`approved_planning_commit == <APPROVED_SHA>`
(`validation_github_rendering.py:99-112`).

---

## 6. `github_reconciliation` (post-publication only)

Keep `null`. For reference, the receipt is exactly 14 keys
(`validation_github_receipt.py:24-38`) with
`receipt_schema_version == 3`, an RFC3339-UTC `checked_at`, membership that
exactly equals the ticket set, dependency edges that exactly equal `depends_on`,
projected/observed label maps, expected/observed title maps, all-`OPEN` observed
states, body evidence, and marker-query matches.

---

## 7. Gotchas that fail validation

Ordered roughly by how easy each is to hit while transcribing the synthesis.

1. **`KW-01` is not a legal ticket ID.** `TICKET_ID` requires `[0-9]{3,}`. Use
   `KW-001`..`KW-032` everywhere: `tickets[].id`, `depends_on`, `contains`,
   `requirements[].ticket_ids`, `feature_boundary.critical_path_ticket_ids`,
   `epic_acceptance.owner_ticket_id`, ticket H1s, filenames. **(proved)**
2. **`HG-1` and `D-01` are not legal IDs either.** Gates must be `GATE-001`+
   (`GATE-[0-9]{3,}`) and decisions `DEC-001`+ (`DEC-[0-9]{3,}`). **(proved)**
3. **Nullable ≠ optional.** Every one of the 17 root keys and 31 ticket keys must
   be *present*. Deleting `discovered_from` or `github` errors. **(proved)**
4. **Unknown keys error.** No comments, no `_note`, no extra metadata anywhere in
   `build-order.json`. Standard JSON only — the file is parsed with `json.loads`
   (`validation_build_order.py:82`), so no trailing commas and no `//` comments.
5. **`strict_int` is `type(value) is int`.** `2.0` fails; `true` fails (bool is
   not int). **(proved)**
6. **`schema_version` must be literally `1`.** **(proved)**
7. **`repository` is `its-everdred/kevinweaver-dev`** (measured `git remote -v`),
   and `build_order_id` must be `its-everdred/kevinweaver-dev:site-rewrite` — the
   prefix must match `repository` exactly and the suffix must be a lowercase slug.
   **(proved)** with a bad slug.
8. **`researched_at_commit` must be exactly 40 hex chars.** A 39-char value is the
   classic first-attempt failure. Pre-publication only the regex is checked; the
   publisher additionally requires the commit to resolve
   (`validation_publication_authority.py:83-87`), so use a real pushed SHA.
9. **`label_projection.phases` / `.complexities` / `.workstreams` are exact
   covers.** Listing `"5"` when no ticket is complexity 5 errors
   (`has unused key 5`); omitting a used phase errors (`missing key 4`).
   **(proved)** Phases here are 1..7; complexities are 1..4.
10. **Every label must be globally unique, case-insensitively**, across
    `build_order`, `required_ticket_labels`, and all three mappings. **(proved)**
11. **`required_ticket_labels ∩ forbidden_labels = ∅`**, case-insensitively.
12. **Umbrella `complexity_points` must be `null`; runnable must be int 1..5.**
    **(proved)** both directions.
13. **Umbrella acceptance lists must all be empty; runnable needs non-empty
    `agent_gate` *and* `at_merge_gate`.** **(proved)**
14. **`scope` and `non_goals` are non-empty for every kind, including umbrellas.**
    **(proved)**
15. **`capability_requirements` and `requirement_refs` are non-empty for every
    runnable ticket.** **(proved)** — easy to forget on gate/audit tickets.
16. **Requirement traceability is bidirectional.** `REQ-00n.ticket_ids` and
    `KW-0nn.requirement_refs` must agree in both directions. **(proved)**
17. **A `ticket` disposition requires `"reason": null`;** `deferred`/`rejected`/
    `satisfied` require `"ticket_ids": []` and a non-empty reason. **(proved)**
18. **Every accepted decision must be cited by ≥1 ticket's `decision_refs`.**
    With 17 decision records this is the most likely bulk failure. **(proved)**
19. **A ticket may not cite a rejected decision.** **(proved)**
20. **Every `DESIGN-nnn` must be cited by a decision or a ticket**, and its
    `sha256` must match the artifact bytes exactly. **(proved)** both.
21. **`design_evidence[].artifact` cannot use `..`.** Copy
    `docs/design/kevinweaver.dev.dc.html` into `evidence/` and hash the copy.
    **(proved)** via the equivalent `document` case.
22. **No duplicate values in any string array** — `checked_string_list` errors on
    repeats in `scope`, `depends_on`, `acceptance_criteria`, everything.
    **(proved)**
23. **Exactly one capstone**, it owns `epic_acceptance`, it sits on the critical
    path, it has non-empty `human_or_e2e`, and its transitive `depends_on`
    closure covers every other runnable ticket. **(proved)** all five.
24. **`feature_boundary.critical_path_ticket_ids` must all be runnable.**
    **(proved)**
25. **`epic_acceptance.evidence` must be non-empty.** **(proved)**
26. **One edge type per unordered pair.** Adding `suggested_after` to a pair that
    already has `depends_on` errors. **(proved)**
27. **`serializes_with` must be symmetric** and **`suggested_after` must not be
    bidirectional.** **(proved)** for symmetry.
28. **`phase_hint` may not be lower than any dependency's `phase_hint`** (equal is
    fine). Follow the 7-level table.
29. **Safety-surface overlap between unordered runnable tickets is an error**, and
    it is checked cross-field (one side's `safety_surfaces` against the other's
    `write_surfaces`). **(proved)** Non-safety overlap is a warning that must be
    dispositioned in the validation report.
30. **A conflict exception must be declared from exactly one side of the pair**,
    and its `surfaces` must actually overlap. **(proved)** both.
31. **Ticket document H1 separator must be space / `—` / `-`.** `# KW-001: Title`
    fails. **(proved)**
32. **Section headings are `##`, verbatim, case-sensitive, nothing appended.**
    `### Outcome`, `## Non-Goals`, `## Scope of work` all fail. **(proved)**
33. **`**Kind:**`, `**Researched at:**`, `**Requirements:**` metadata must match
    `build-order.json` exactly**, each on its own line. **(proved)** all three.
34. **Ticket documents must contain zero GitHub commit URLs and zero
    `<!-- aiur-planning-issue` strings**, or publication fails on
    "exactly one approved commit link" / "exactly one schema-2 marker".
35. **Ticket documents must not be symlinks and must stay inside the pack.**
    **(proved)** both.
36. **Do not introduce an umbrella ticket.** The default publisher cannot project
    a label for `complexity_points: null`.
37. **Do not put a `skill_issue` key in `publication.json`** — `strict_object`
    rejects unknown keys, and it would also switch the publisher into the
    DASH-specific extension path with a stricter `# BO: <ID> — <title>` H1 rule.
38. **`publication.json`'s `root_document` is repository-relative**
    (`docs/build-orders/site-rewrite/root-issue.md`), while `ticket.document` is
    pack-relative (`tickets/KW-001-….md`). Mixing them up fails at publication.
39. **`root-issue.md` must contain `<APPROVED_SHA>`**, exactly one marker block
    with a one-line ASCII JSON payload, and exactly one commit link.
40. **Warnings do not fail the run** (`return 1 if report.errors else 0`,
    `validate_build_order.py:95`) — but the target is `0 error(s), 0 warning(s)`.

---

## 8. Reproduction record

A synthetic 4-ticket pack (3 runnable + 1 umbrella, `design_evidence: []`,
`github_root: null`, `github_reconciliation: null`) validated clean:

```
validation: 0 error(s), 0 warning(s)
```

Fifty-plus single-field mutations of that pack produced the exact error strings
quoted above. The `root-issue.md` skeleton in §5 was passed through
`validation_github_rendering.render_template_body` and returned `ERRORS: []`.
