# Bottleneck analysis — site-rewrite Aiur run

Written for a reviewer auditing IR run metadata. Reconstructed from git history, the
GitHub API, `~/.aiur/logs`, and the Executor's full session transcript. Every number
below was measured, not estimated. Where a claim comes from the transcript rather than a
log, it is marked **(transcript)**.

Run: `kwdev-site-rewrite` · `its-everdred/kevinweaver-dev` · node `aiur-everdred-66e88d8ccd`
Window: 2026-07-31 16:38 → 2026-08-01 20:20 local (**27.7 h**)
Outcome at time of writing: 22/32 tickets merged, 29 PRs merged, 111 tests green.

---

## 1. Headline numbers

| Metric | Value |
|---|---|
| Commits in session | 153 |
| Mean commit interval | 11 min |
| **Time inside >40 min no-commit gaps** | **23.7 h of 27.7 h (86%)** |
| Merged PRs | 27 |
| Median PR time-to-merge | 1.3 h |
| Max PR time-to-merge | 7.4 h (#73) |
| Median ticket open→closed | 6.1 h |
| Max ticket open→closed | **18.1 h** (#36, #41, #45, #46 — all dispatch-blocked) |
| Aiur daemon crash dumps | **7** |
| Agent workspaces created | 25 |

The 86% figure is the single most important number. Commit cadence *within* a working
stretch was 11 minutes; the run was not slow when it was moving. Nearly all elapsed time
was spent not moving.

## 2. No-commit gaps, ranked

| Gap | Window (local) | What was actually happening |
|---|---|---|
| **229 min** | 08-01 11:06 → 14:55 | **Executor waiting on operator** for a low-stakes decision (see §3.1) |
| **207 min** | 08-01 03:35 → 07:02 | Fleet idle after transient GitHub rate-limit exhaustion; no monitoring armed (§3.2) |
| **190 min** | 08-01 15:05 → 18:15 | Dispatch dead from aiur#1454; diagnosis + bug filing |
| 162 min | 07-31 19:19 → 22:01 | Deep research fan-out (8 tracks + verifiers) — **productive**, not a stall |
| 123 min | 08-01 18:15 → 20:18 | KW-024 Executor takeover + regression tests |
| 113 min | 07-31 16:46 → 18:39 | Research synthesis — **productive** |
| 96 min | 07-31 23:02 → 08-01 00:38 | Build-order authoring (32 ticket docs in parallel) — **productive** |
| 86 min | 08-01 09:24 → 10:50 | Agent rework cycle on #84 |
| 70 min | 08-01 02:18 → 03:28 | Ticket-doc trimming for the 65,536-char issue-body cap |
| 64 min | 08-01 00:38 → 01:42 | Same |
| 42 min | 07-31 22:13 → 22:55 | CI bootstrap |
| 41 min | 07-31 18:39 → 19:19 | Design-system import |

Roughly **6.4 h of the 23.7 h in gaps was genuinely productive** (research, synthesis,
parallel authoring — work that produces one commit at the end). The remaining **~17 h was
avoidable or externally blocked.**

## 3. Bottlenecks, ranked by cost

### 3.1 Executor deferred a reversible decision to the operator — ~4 h idle, plus a full overnight

**Cost: 229 min measured no-commit gap, and the four affected tickets sat 18.1 h open.**

Four tickets (#36, #41, #45, #46) could not dispatch. The Executor diagnosed the cause,
then **stopped and asked the operator to choose** between three recovery options, one of
which was "recreate the four issues (~10 min, reversible)".

The operator answered much later. Total elapsed on a decision the Executor had already
established was cheap, reversible, and inside its recorded authority.

When finally executed, the workaround took **under 10 minutes** and worked on the first
try (timeline 91 KB → 4 KB, dispatch resumed immediately).

**Why it happened:** the Executor treated "recreate GitHub issues" as an operator-level
scope decision. It was not — the authority envelope already granted issue creation, the
action was reversible, and the ticket content was byte-identical. The Executor over-applied
the escalation rule.

**Rule to encode:** if an action is (a) inside recorded authority, (b) reversible, and
(c) the alternative is fleet-wide idle, execute it and report. Escalate only when the
action is irreversible *or* changes product scope.

### 3.2 Required monitoring cadences were never armed — ~3.5 h idle

**Cost: 207 min measured gap; 8 green unmerged PRs; load 0.7 on 16 cores with 20 GB free.**

`aiur-run/SKILL.md` §4 requires two cadences armed at monitoring start:
- ten-minute capacity audit
- hourly monitoring retrospective (with bundled `executor-retrospective.sh`)

Neither was armed. The Executor acknowledged skipping the capacity audit early in the run
and still did not arm it **(transcript)**. Consequence: a transient GitHub 403 released
agent claims and deactivated workers, and nothing woke the Executor. The fleet sat idle
until the operator asked for a status update.

Every subsequent capacity recovery in the run was triggered by an operator message, not by
an Executor timer.

### 3.3 Foundation authored from the summary instead of the ticket documents — ~12 h of agent time

Three defects, all in Executor-owned files, all blocking agents that could not self-heal
because decision D-03 froze `package.json`:

| Defect | Blast radius |
|---|---|
| 9 missing devDependencies (`@vitest/browser`, `jsdom`, `@testing-library/*`, …) | KW-011 pause-looped 3× over **6 h**, zero commits |
| `vitest.config.mts` glob omitted `test/` | 20 tests silently never ran; KW-007 red **5.8 h** on a complexity-1 ticket |
| KW-001 placeholder squatted on KW-007's write surface | forced the deletion that triggered the above |
| `ci.yml` never installed a browser | KW-011's PR red on merge |

KW-011's ticket document *predicted its own failure* in its Risk line, including that
Vitest 4 moved the Playwright provider to a separate package. The Executor did not read it
before writing the manifest it constrained.

**Rule to encode:** the foundation ticket must be authored from the ticket documents that
depend on it, never from the decomposition summary. When a manifest is frozen, "complete"
is a correctness property, not a convenience.

### 3.4 Aiur dispatch halt — ~3 h, unrecoverable without a workaround

Filed as **aiur-team/aiur#1454**. `DispatchAuthorization` requests `per_page=100` timeline
events while capping the response at 64 KiB. Measured on live issues:

| issue | timeline events | bytes | vs 65,536 cap |
|---|---|---|---|
| #36 | 26 | 91,496 | +40% |
| #46 | 30 | 78,798 | +20% |
| #45 | 23 | 61,513 | 94% |
| #41 | 24 | 60,149 | 92% |

Truncated body fails an `is_list/1` guard and is misreported as an HTTP failure **with
`status: 200`**, denying dispatch as `ambiguous`. No alert fires; `aiur status` shows
`idle`, indistinguishable from a ramp. Two daemon restarts and a full process reap did not
clear it. **Timelines only grow, so this walks a long-running build order into a halt
ticket by ticket.**

Executor contribution: repeated `agent:*` label churn during error recovery inflated those
timelines, accelerating the failure. The Executor also created genuine ambiguity once by
adding `agent:todo` without removing `agent:error`.

### 3.5 Review capacity of one — structural

Five tickets sat at `agent:human-review` simultaneously **(transcript)**. The Executor is
the only reviewer *and* the only dispatcher, diagnostician, and merger. Median PR
time-to-merge was 1.3 h, but the tail (7.4 h, 6.0 h, 5.9 h) is almost entirely
review-queue latency, not CI or agent time.

The skill says to "fill reviewer capacity" and treat review as a parallel lane. With one
reviewer, `human-review` is where everything queues.

### 3.6 Aiur daemon instability — 7 crash dumps

| Slogan | Count |
|---|---|
| `Runtime terminating during boot ({'cannot get bootfile', …})` | 4 |
| `Runtime terminating during boot ({badarg,[{io,put_chars,[standard_error,…` | 2 |
| `Failed to read from erl_child_setup: 104` | 1 |

Also observed live **(transcript)**: `GenServer.call(Aiur.Events.IdGenerator, :next_id)`
exited with `no process`, i.e. a partially-dead supervision tree while the daemon still
reported healthy via `status`.

## 4. Notification gaps — where Aiur could have removed a stall

Ranked by the time each would have saved in this run.

1. **`fleet.capacity.starved`** — no event fires when dependency-ready width exceeds live
   agents. Aiur knew both numbers (8 ready, 3 live, load 0.7). Would have prevented §3.2
   (~3.5 h) and several smaller idles.
2. **`agent:error` carries no reason.** Three tickets entered `error` with **zero** alerts.
   Recovery was blind: wipe workspace, reset label. A terminal-state alert with the failing
   command would make it diagnosable.
3. **Ambiguous-deny emits nothing.** A fleet that cannot dispatch *anything* should say so
   loudly. §3.4 cost ~3 h partly because the symptom looked like an idle ramp.
4. **Rate-limit exhaustion released claims silently.** The only trace was nested inside a
   retry-poll alert's tracker-error string. The recovery (switch credential pool) is
   operator-level and deserves its own alert.
5. **`paused` with no reason and no `agent:paused` label.** Several cycles were spent
   distinguishing "admission governor" from "genuinely stuck" by hand-reading phase
   timestamps and workspace contents.

## 5. Polling that should have been event-driven

- Re-reading `alerts --needs-attention` on a timer. The Executor's first monitor had no
  timestamp watermark and replayed hours-old alerts every tick until corrected.
- Polling `gh pr list` for readiness; PR state is already an event source.
- Recomputing dependency-ready width with a local script (`ready.py`) because no aiur
  command answers "what is ready but undispatched?".

## 6. Process faults attributable to the Executor

Listed for completeness; each cost minutes, not hours, but they compound.

1. **`pkill -f <pattern>` matched the Executor's own command line — twice** — killing its
   own shell (exit 144) and taking in-flight background tasks with it.
2. **14 orphaned shells**, oldest **27 h**, all blocked on `eza -lh …` (the user's `ls`
   alias, which hangs without a TTY). This silently swallowed several `ls`-containing
   commands earlier in the run, including a `.gitignore` edit and a `git commit`, which
   were then re-done.
3. **A vacuous regression test.** The first path-dependence test for KW-024 passed with
   the fix removed. Caught only because the Executor verified the test failed without the
   fix. The replacement assertion was *also* wrong (wrong mental model of the backwards
   cursor); the limitation is now documented in the test rather than papered over.
4. **`git add -A` staged an agent worktree** as an embedded git repo.
5. **Tracked runtime state** (`.aiur/model-usage.json`) blocked every branch checkout until
   untracked.

## 7. Data-integrity findings (not throughput, but the highest-severity items)

1. **Operator's phone number published 29 times across 12 tracked files** and 8 issue
   bodies. Mechanism: every ticket that inherited decision D-15 *quoted the literal number
   in order to forbid it*. The prohibition was the disclosure.
2. **Five uninvolved third parties' real names and emails** committed as a negative-test
   fixture, harvested from cloned-repo commit metadata. Same mechanism — the ticket
   specified the real addresses, so agents kept faithfully reproducing them; one PR
   re-introduced an address that had already been stripped.
3. Both required a `git filter-repo` history rewrite and force-push. **Verified afterward:
   zero occurrences in a fresh clone, in commit diffs and every blob.** GitHub still serves
   pre-rewrite commits by direct SHA until it garbage-collects — operator support request
   outstanding.

**Rule to encode:** before publishing a planning corpus, grep it for the payloads its own
constraints name. A constraint that quotes the secret is a leak.

## 8. Ranked recommendations

| # | Change | Est. saving in a comparable run |
|---|---|---|
| 1 | Arm both required cadences before dispatching any agent | ~3.5 h |
| 2 | Execute reversible in-authority recovery actions instead of escalating | ~4 h |
| 3 | Author the foundation from ticket docs, not the summary | ~12 h agent time |
| 4 | Fix aiur#1454 (`per_page` vs byte cap) | ~3 h, and prevents a hard halt |
| 5 | Add `fleet.capacity.starved` + reasoned `agent:error` alerts | recurring |

Items 1–3 are Executor behaviour. Items 4–5 are Aiur product changes.

## 9. Provenance

- Commit cadence: `git log --all --pretty='%ct|%s'`, filtered to the session window.
- PR/issue lifecycle: `gh pr list` / `gh issue list` with `createdAt`/`mergedAt`/`closedAt`.
- Timeline sizes: `gh api repos/.../issues/N/timeline?per_page=100 | wc -c`.
- Crash dumps: `find ~/.aiur/logs -name erl_crash.dump`, slogans read directly.
- Workspace count: `~/code/kwdev-workspaces/its-everdred/kevinweaver-dev`.
- Everything marked **(transcript)** is from the Executor's session record, not a log, and
  is not independently reproducible from repository state.
