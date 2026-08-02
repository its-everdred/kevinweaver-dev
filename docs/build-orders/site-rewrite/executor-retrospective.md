# Executor retrospective — site-rewrite run

Written late. `aiur-run/SKILL.md` §4 requires a **ten-minute capacity audit** and an
**hourly monitoring retrospective**, both armed at monitoring start. I armed neither,
and reconstructed this from evidence afterwards. The gap is itself the largest finding.

Run: `kwdev-site-rewrite` · repo `its-everdred/kevinweaver-dev` · 33 issues, 20 closed at
time of writing, 26 PRs merged.

---

## 1. Where time actually went

| Bottleneck | Measured cost | Root cause | Class |
|---|---|---|---|
| Fleet idle after a transient rate limit | **~4 h**, 8 green PRs unmerged, load 0.7/16 cores | No capacity audit armed. Nothing woke the Executor. | Executor process |
| KW-007 red on a bad vitest glob | **5.8 h** on a complexity-1 ticket | Foundation config authored from the summary, not the ticket | Foundation defect |
| KW-011 pause-loop | 3 cycles, **6 h**, zero commits | 9 devDependencies missing from a frozen manifest | Foundation defect |
| Review capacity = 1 (me) | 5 tickets queued at `agent:human-review` simultaneously | Executor is the only reviewer; review is serialized behind everything else I do | Structural |
| Publish retries | 3 failed attempts | 65,536-char issue-body cap unknown until it fired | Planning gap |

**The pattern:** four of five are *my* defects, not agent defects. Every one was
introduced when I hand-authored a foundation artifact (`package.json`,
`vitest.config.mts`, `ci.yml`, the KW-001 placeholder) from the decomposition summary
rather than from the ticket documents that had to live inside it. D-03 froze
`package.json`, so no agent could self-heal any of them — each had to round-trip
through me, and I only found them by reading logs.

## 2. Notification gaps — where Aiur could have told me

These are the candidate Aiur follow-ups the skill asks for at the capstone.

1. **No alert when ready-width exceeds live agents.** The fleet sat at 3 live with 8
   dependency-ready tickets and 20 GB free. Aiur knows both numbers; nothing emitted.
   A `fleet.capacity.starved` event would have removed the single largest time loss in
   the run.
2. **`agent:error` carries no reason.** Three tickets (#36, #39, #41) entered `error`
   with **zero** alerts recorded. I recovered them blind — wipe workspace, reset label.
   A terminal-state alert with the failing command would have made that diagnosable.
3. **Rate-limit exhaustion released agents silently.** The 403 released claims and
   deactivated workers, but the only trace was in a retry-poll alert nested inside a
   tracker-error string. It deserves its own needs-attention alert, because the
   recovery (switch credential pool) is operator-level, not agent-level.
4. **Paused-with-no-reason.** Agents showed `paused` in `status` with no `agent:paused`
   label and no alert. I burned several cycles distinguishing "admission governor" from
   "genuinely stuck" by reading phase timestamps and workspace contents by hand.

## 3. Polling I did that should have been an event

- Re-reading `alerts --needs-attention` on a timer and re-reporting stale rows. My first
  monitor had no timestamp watermark and replayed hours-old alerts every tick until I
  added one.
- Polling `gh pr list` for readiness. PR state is already an event source.
- Repeatedly recomputing ready-width with a local script (`ready.py`) because no
  command answers "what is dependency-ready but undispatched?".

## 4. Adjustments made

| Change | Why |
|---|---|
| Armed `executor-retrospective.sh` | Required by the skill; was never armed |
| Monitor rewritten with a timestamp watermark | First version replayed stale alerts every tick |
| `max-agents` 8 → 14 | 8 was an arbitrary fixed cap; the skill defines it as an admission ceiling regulated by AIMD |
| Daemon moved off the shared PAT to the `gh` keyring pool | One token served daemon + 8 agents + preflights = 5000 req/hr exhaustion cycle |
| Determinism lint extended to `lib/viz/render/**` | The KW-022 audit was manual and unenforced; now a gate, verified by probe |
| `.claude/worktrees/`, `coverage/`, `.aiur/model-usage.json` gitignored | Worktrees produced 123 phantom lint errors; runtime state blocked every checkout |

## 5. What I would do differently, in order

1. **Author the foundation ticket from the ticket documents, not the summary.** Three
   defects, ~12 h of agent time, all from this. The tickets stated their needs precisely —
   KW-011 even predicted its own failure in its Risk line.
2. **Arm both required cadences before dispatching a single agent.** Not after.
3. **Staff review as a parallel lane.** The skill says to fill reviewer capacity; with one
   reviewer, `human-review` becomes the queue everything drains into.
4. **Grep the planning corpus for the constraints' own payloads before publishing.** The
   phone number leaked 29 times *because tickets quoted it in order to forbid it*; five
   third-party emails leaked the same way. Both required history rewrites.

## 6. Deferred, not done

- GitHub still serves pre-rewrite commits by direct SHA (`6ef0209` verified). Needs an
  operator support request for GC.
- Coverage floors for `lib/viz/sim/**` and `lib/bundle/**` were measured against empty
  directories (`"Unknown"` passes silently) and are now genuinely breached. Owned by the
  sim and bundle tickets; coverage is not a CI gate today.
