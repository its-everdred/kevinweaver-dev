You are working on tracker issue `{{ issue.identifier }}` for the **kevinweaver.dev** repository.

Issue:

- Number: `{{ issue.identifier }}`
- Title: {{ issue.title }}
- State label: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

Description:

{% if issue.description %}
{{ issue.description }}
{% else %}
No description provided.
{% endif %}

{% if attempt %}
Continuation context:

- Retry attempt #{{ attempt }}.
- Read the existing `## Agent Workpad`, local agent logs, and git state before choosing a phase.
- Resume from the workpad handoff instead of restarting brainstorm or repeating completed work.
- Treat the handoff as the source of truth for current phase, decisions, validation already run, and next steps.
{% endif %}

## What this project is

kevinweaver.dev is Kevin Weaver's personal site: simultaneously a résumé and a
dashboard of what he is working on right now. The audience is engineer peers and
the OSS community.

It is a **Next.js app deployed on Vercel**. The hosting must not change — do not
introduce Astro, Vite, Netlify, or any other framework or host. The apex domain
already resolves to Vercel (`76.76.21.21`) and 308-redirects to `www.`.

The visual language is a **gruvbox-dark-medium terminal / tmux design system**
("swe-rts-terminal"), JetBrains Mono only. The authoritative design artifacts are
checked into the repo:

- `docs/design/kevinweaver.dev.dc.html` — the full page comp. This is the visual
  source of truth. It is a Claude Design "design comp" using an `<x-dc>` custom
  element with `{{ "{{ ref }}" }}` bindings; treat it as static HTML/CSS/JS to port
  to React, **not** as a runtime to adopt. `docs/design/support.js` is the design
  tool's own runtime — you do not need it and must not vendor it.
- `docs/design/_ds/swe-rts-terminal-*/tokens/*.css` — colors, typography,
  spacing, effects. These are the real token values; do not invent hexes.
- `docs/design/_ds/swe-rts-terminal-*/layers/*.css` — `base`, `pane`, `tmux`,
  `type`, `data` component layers.

Two important design caveats:

1. The type scale in `tokens/typography.css` is authored against a **1920x1080
   slide canvas** (`--fs-hero:200px`). It must be re-derived as a responsive
   fluid scale for a website. Never ship those literal pixel sizes.
2. `docs/research/*.md` holds measured research. Findings marked **(M)** were
   measured directly; treat unmarked or **(I)** claims as inference and verify
   before relying on them.

## Workspace setup

- Use the local tracker and repository auth already configured for this
  environment.
- Work in the current workspace checkout on its generated canonical branch. Read
  it with `git branch --show-current`; never reconstruct a bare
  `aiur/{{ issue.identifier }}` ref. The `.git` directory IS writable here — use
  `git` directly with no `GIT_DIR=...` prefix.
- Before integrating the configured base into an existing feature branch, record
  the exact pre-integration head and create a rescue ref for it; push that rescue
  ref before resolving any nontrivial conflict. Resolve conflicts hunk-by-hunk.
  Never resolve a conflicted file wholesale with `--ours`, `--theirs`,
  `git checkout <base> -- <file>`, or by resetting the feature branch to the
  base. Before pushing, compare `git diff --stat origin/$AIUR_BASE_BRANCH...HEAD`
  with the prior PR scope and prove the intended feature diff remains. If the
  diff disappears or shrinks unexpectedly, stop, restore from the rescue ref, and
  alert the Executor instead of pushing.
- `mise exec -- npm` works out of the box. `node_modules` is pre-populated by the
  warm base, so prefer `npm ci` only when you have actually changed
  `package.json` or the lockfile.
- **This repo must have exactly one lockfile.** It historically shipped both
  `yarn.lock` and `package-lock.json`, which makes package-manager detection
  ambiguous on Vercel. npm + `package-lock.json` is the chosen standard. Never
  reintroduce `yarn.lock`.

## The pre-PR gate

Before opening or finalizing a PR, run the scoped local gate and make it green:

```
mise exec -- npm run lint
mise exec -- npm run typecheck   # if the project has TypeScript configured
mise exec -- npm test
mise exec -- npm run build
```

`npm run build` is the single most important gate — a Next build failure breaks
the deployed site. Never open a PR whose build fails.

Keep changes small and add tests for logic you introduce. Pure logic (data
encoding, date bucketing, the animation state machine) must be unit-tested;
those modules are deliberately written DOM-free so they are testable without a
browser.

Push to `origin` and open a PR with `--base "$AIUR_BASE_BRANCH"`. That
environment value is the authoritative configured `tracker.base_branch` (`main`
in this repository). Never infer it from `origin/HEAD`. Before CI handoff, verify
an existing PR's `baseRefName`; leave a correct base unchanged, or retarget only
its `base` and re-fetch to verify the repair.

Do not gate PR-opening on unrelated suite flakes; CI runs the authoritative full
lint and test suite on every PR.

## Self-review

Self-review before asking anyone else to. Once your change is complete and
pushed, run **`/ce-code-review`** on your own diff and resolve what it finds —
fix real defects, and for anything you consciously reject, record the reason in
the Agent Workpad. The Executor reviews *after* you have, so arriving unreviewed
wastes a review cycle. Do not move to `agent:ci-wait` until this has run.

CI exists and is authoritative. `.github/workflows/ci.yml` runs install →
typecheck → lint → unit tests → build on every PR, and aggregates into a single
required check named **`ci-ok`**.

Once the draft PR is open, self-reviewed, and no code work remains, move to
`agent:ci-wait` and end the turn. Do not loop on `gh pr checks`; the daemon
delivers CI pass/fail context. On pass, mark the draft ready and move to
`agent:human-review`; on failure, use the delivered checks and begin rework.

Still run the local gate before you push. CI is the backstop, not the first
place you discover a failure — a red CI run costs a full dispatch cycle.

For test-only tickets that explicitly say not to change code, do not create
commits or PRs.

## How to operate

Follow the **`using-aiur`** skill for how to run this ticket: the `agent:*` label
lifecycle, the brainstorm→plan→work→review turn workflow and which CE skill to
use when, milestone alerts (`emit_alert`), the Agent Workpad template, complexity
routing, and the dev loop / commit / PR conventions. Load it before you start.

**Commit messages: 3-7 words, imperative, subject line only. Never mention
Claude, Codex, AI, or assistant co-authorship in a commit message or PR body.**
This repository's git history is public and is itself part of what the site
displays.

When a declared blocker emits `ticket.N.agent.unblocked`, treat that explicit
signal as readiness to consume. Load `/aiur-agent`, then use the latest
`ticket.N.branch.push` payload only to fetch and diff the actual validated ref
(do not guess `origin/aiur/N`), adopt the real API, remove temporary stubs, and
keep your PR stacked on the blocker branch while it remains unmerged. Never infer
readiness from `branch.push` alone; if the explicitly-unblocked dependency is
unusable, keep only that integration point blocked and record the concrete
reason.
