# Data pipeline — GitHub activity → static bundle

Date: 2026-07-31. Track owner: data pipeline.
**(M)** = measured this session with the command shown. **(I)** = inference, marked as such.

Builds on `docs/research/2026-07-31-measured-findings.md`. That doc's GitHub-API, payload-encoding
and contribution-data sections stand. Its Netlify sections are **moot** — hosting is Vercel.
Two of its numbers are **corrected below** (blobless clone size/time for `aiur`).

---

## 0. TL;DR

| Thing | Number | How |
|---|---|---|
| Public repos with contributions, 5y, both actors | **67** | GraphQL `contributionsCollection` × 6 years × 2 users |
| Repos that yield ≥1 attributable file-touch | **51** | blobless clone + author-filtered `git log` |
| Blobless clone of the entire corpus | **144.3 MB, 342.6 s cold** | 66 clones |
| Warm incremental `git fetch` of all 66 | **28.0 s, 0 failures** | second run |
| `git log --all --name-only` over all 66 | **2.3 s** | same run |
| File-touch events (author-filtered) | **44,886** | same run |
| Unique paths | **13,453** | same run |
| **First-byte data payload** | **6,910 B brotli / 8,030 B gzip** | chunk00 + its path slice |
| Full 5-year corpus, all 30 chunks | **127,565 B brotli / 162,005 B gzip** | same encoder |
| Private aggregate (67 monthly ints) | **160 B gzip**, zero repo names | GraphQL, verified |
| GitHub API calls needed per run | **~135** (67 private-agg + 12 grid + ~56 repo-list/verify) | measured counts |
| Secrets required | **none beyond `GITHUB_TOKEN`** | see §2 |

**The single most important structural finding:** 34,194 of 44,886 events (76.2%) fall in calendar
year 2026. Chunking the reverse-chronological stream **by year** puts 112,980 B gzip in chunk 0.
Chunking by **fixed event count** puts 8,030 B in chunk 0. Year-chunking and repo-chunking are
both wrong for this playback model.

---

## 1. Wire format for reverse-chronological playback

### 1.1 What "newest-first" does to the data

`git log --all --no-merges --name-only --author=<allowlist>` across all 66 clones, bucketed by
year of author date **(M)**:

```
2026: 34194   2025:  3655   2024:  2280   2023:  960   2022:  207   2021: 2111
2020:    21   2019:   212   2018:    52   2017:  256   2016:   38   2014:  534   2013: 366
```

Reproduce: `python3 /tmp/kwdata/fullpipe.py`

The corpus is violently front-loaded. Any chunking keyed on wall-clock time inherits that skew.
Chunking on **event index** does not.

### 1.2 Chunking schemes, measured

All numbers are gzip -9 of a columnar encoding (`d` delta-day, `r` repo id, `p` path id, `a` actor),
events sorted newest-first. Reproduce: `python3 /tmp/kwdata/encode.py`, `encode2.py`, `encode3.py`.

| Scheme | chunk 0 (first byte) | worst chunk | total | verdict |
|---|---|---|---|---|
| Monolithic (no chunking) | 156,096 B | — | 156,096 B | 19× too heavy for first byte |
| B: calendar year | **112,980 B** | 112,980 B | 159,634 B | **fails** — 2026 is 76% of corpus |
| C: per repo | **88,190 B** (aiur) | 88,190 B | 165,814 B | **fails** — aiur is 58% of corpus |
| A: 4,000-event chunks, self-contained dicts | 15,882 B | 34,555 B | 218,398 B | 1.40× total overhead |
| A: 2,000-event chunks, self-contained dicts | 10,047 B | 19,106 B | 234,646 B | 1.50× total overhead |
| **D: 1,500-event chunks + streamed global path dict** | **8,030 B** | 11,128 B | **162,005 B** | **1.04× overhead. Ship this.** |
| D at 3,000 ev | 13,161 B | 21,093 B | 157,921 B | |
| D at 6,000 ev | 20,789 B | 34,735 B | 151,289 B | |

**Scheme D wins because it fixes the dictionary problem.** In scheme A each chunk carries its own
path dictionary, and paths recur across chunks, so the total inflates 40–50%. In scheme D the path
dictionary is **one global array, numbered in newest-first first-use order**, sliced into files that
line up 1:1 with the event chunks. Chunk _k_ can only reference path ids `< len(dict[0..k])`, so a
visitor who watches 20 seconds downloads dict slices 0..2 and nothing more. Total overhead vs the
monolithic blob is 162,005 / 156,096 = **1.038×** **(M)**.

Brotli (Vercel serves `content-encoding: br` — `curl -sI https://www.kevinweaver.dev/` **(M)**)
takes chunk00 from 8,030 → **6,910 B** and the full corpus from 162,005 → **127,565 B** **(M)**.

### 1.3 The path dictionary is still the whole cost

Full corpus, split by column group **(M)**:

| Component | raw | gzip | brotli |
|---|---|---|---|
| Event columns, all 30 chunks | 495,307 | 73,132 | 50,211 |
| Path dictionary, all 30 slices | 705,385 | 88,873 | 77,354 |
| Path dict, **front-coded** (raw) | 224,978 | — | — |

Front-coding (`chr(35+sharedPrefixLen) + suffix`, prefix capped at 90) cuts the raw dictionary
705 KB → 225 KB and gzip 90,302 → 70,252 B on the whole corpus **(M)**. It costs ~15 lines of
decoder. Do it. Event columns cost **1.44 B/event gzipped** — already near the floor; do not
micro-optimize them.

### 1.4 Concrete schema

Six resource kinds, all under `public/data/v1/`. Every file is plain JSON; Vercel compresses.

**`manifest.json`** — one fetch, cached separately, ~400 B.
```jsonc
{
  "v": 1,
  "generatedAt": "2026-07-31T16:39:00Z",
  "commit": "cefcffb",              // repo sha the generator ran from
  "chunkSize": 1500,
  "chunks": 30,                      // events/ee-NN.json + paths/pd-NN.json, NN = 00..29
  "events": 44886,
  "days": ["2026-07-31", "2013-04-15"],   // [newest, oldest] — day 0 is the newest
  "actors": [
    {"id": 0, "login": "its-everdred", "kind": "human"},
    {"id": 1, "login": "its-applekid", "kind": "agent"}
  ],
  "integrity": {"repos": "sha256-…", "grid": "sha256-…", "ee-00": "sha256-…"}
}
```

**`repos.json`** — 51 entries, **1,060 B gzip / 892 B brotli (M)**. Fetched with the manifest.
```jsonc
[{"i":0,"n":"aiur-team/aiur","e":25986,"last":"2026-07-31","first":"2021-05-11","private":false}]
```
`i` is the id referenced by every chunk's `r` column. Index is stable across runs (sorted by
`nameWithOwner`) so a chunk from a previous run never mis-resolves. `e` (event count) sizes the
repo circle in the Gource view without reading a single chunk.

**`grid.json`** — 2,038 days × 2 actors, **1,317 B gzip / 1,122 B brotli (M)**.
```jsonc
{"start":"2021-01-01","n":2038,
 "e":[0,3,12,…],   // its-everdred daily contributionCount
 "a":[0,0,0,…],    // its-applekid daily contributionCount
 "p":[21,12,21,…], // private aggregate, 67 MONTHLY buckets from 2021-01 (see §4)
 "bands":[0,1,2,4,8,16,32,64,128,256]}   // log2 lower bounds, 10 levels
```
Keeping `e` and `a` separate (rather than a pre-summed level string) costs 1,317 vs 737 B gzip and
buys per-actor filtering plus the ability to fix the double-count in §6 client-side. Worth 580 B.

**`events/ee-NN.json`** — 1,500 events, newest-first. 2,032–3,044 B gzip, median ~2,250 **(M)**.
```jsonc
{"b":0,                 // day index of this chunk's first event (0 = newest day overall)
 "d":[0,0,1,0,3,…],     // delta to previous event's day index, always >= 0
 "r":[0,0,7,0,…],       // repo id into repos.json
 "p":[0,1,2,1,3,…],     // GLOBAL path id, strictly < cumulative dict length through slice NN
 "a":[1,1,0,1,…]}       // actor id
```
Four equal-length arrays, no per-event objects. `d` is a monotone non-negative delta because the
stream is sorted; it gzips to almost nothing. `b` makes each chunk independently decodable — a
visitor who deep-links to "2 years ago" can fetch chunk 13 alone.

**`paths/pd-NN.json`** — the newly-introduced paths for chunk NN, front-coded, newline-joined.
1,444–15,068 B gzip; chunk00's slice is 5,694 B **(M)**.
```jsonc
{"from":0,"n":585,"fc":"#packages/engine/src/run.ts\n7bootstrap.ts\n%apps/web/app/page.tsx\n…"}
```
Decoder: `prev = ""; for line: k = line.charCodeAt(0) - 35; p = prev.slice(0,k) + line.slice(1); prev = p`.
`from` is the global id of the first entry, so the client appends into one flat array and never
re-resolves.

**`private.json`** — see §4. Folded into `grid.json`'s `p` field; a separate file is optional.

### 1.5 Load order and the ~9 KB first byte

```
t=0    manifest.json + repos.json + grid.json + events/ee-00.json + paths/pd-00.json
       = 400 + 892 + 1,122 + 1,925 + 4,985 = 9,324 B brotli   (M, except manifest which is an estimate)
t≈2s   prefetch ee-01/pd-01 while chunk 0 plays
t≈Ns   prefetch chunk k+1 when chunk k is 60% consumed
```
The grid renders from `grid.json` alone. The Gource view renders repo circles from `repos.json`
alone. Neither blocks on chunk 0. If chunk 0 never arrives the page is still a complete resume.

**Prefetch policy:** one chunk ahead, never more. At 30 chunks a visitor who watches to 2013
pulls 127.6 KB brotli total — but that requires deliberately staying. The 50th-percentile visitor
who bounces in 15 s pulls ~9 KB.

---

## 2. Where generation runs

### 2.1 Vercel Cron — **disqualified, three independent reasons**

1. **Vercel deployments are immutable and the function filesystem is read-only except `/tmp`.**
   A cron function physically cannot write `public/data/v1/*` into the live deployment. It would
   have to write to Vercel Blob and the client would fetch from a second origin — abandoning the
   "static bundle" property entirely.
2. **Hobby cron runs at most once per day with ±59 min precision** — "Hobby accounts are limited
   to cron jobs that run once per day… a cron job configured as `0 1 * * *` will trigger anywhere
   between 1:00 am and 1:59 am."
   (https://vercel.com/docs/cron-jobs/usage-and-pricing)
3. **Hobby function max duration is 300 s, hard** (https://vercel.com/docs/functions/limitations).
   The measured cold clone of the corpus is **342.6 s** **(M)**. A cold Vercel cron run
   *cannot finish*. Even the warm path (28.0 s fetch) has no warm state to be warm from — there is
   no persistent disk on a Vercel function.

### 2.2 Build-time (in `next build`) — **disqualified**

Vercel builds on push. Last push to this repo was 2021-05-31. A build-time generator means the
data is only as fresh as the last code change, which defeats "live-ish dashboard". Worse, it puts
342.6 s of network I/O inside a 45-min build budget for every preview deploy and every typo fix.

### 2.3 GitHub Actions cron committing to `public/` — **ship this**

Runner: `ubuntu-latest` on a **public** repo = 4 vCPU / 16 GB RAM / 14 GB SSD, **free and
unlimited** (https://docs.github.com/en/actions/reference/runners/github-hosted-runners). The
corpus needs 151 MB of that 14 GB **(M)**.

Cache: `actions/cache` gives **10 GB per repository**, evicted after **7 days without access**
(https://docs.github.com/en/actions/reference/dependency-caching-reference). A daily run keeps the
151 MB clone cache permanently warm. Cache hit → the run is `28.0 s fetch + 2.3 s log + encode`
**(M)**; cache miss → `342.6 s + 2.3 s`, still far under the 6-hour job limit
(https://docs.github.com/en/actions/reference/limits).

Committing to `public/` triggers the Vercel Git integration → one deploy. Vercel Hobby allows
**100 deployments/day** and — unlike Netlify's 15-credits-per-deploy model — **does not bill per
deploy** (https://vercel.com/docs/limits). One deploy/day is 1% of the cap.

### 2.4 Exactly which secrets are required: **none**

**`GITHUB_TOKEN` alone is sufficient.** The proof, item by item:

| Pipeline step | Needs what | Verdict |
|---|---|---|
| Clone 66 **public** repos | anonymous git-over-https | no token at all **(M)** — all 66 cloned in this session over plain HTTPS |
| `git log --name-only` | local only | **0 API calls** |
| Contribution calendar for both users | GraphQL `contributionsCollection` | any token; see below |
| `restrictedContributionsCount` | GraphQL | any token; see below |
| Commit the bundle | `contents: write` on this repo | `GITHUB_TOKEN` default-grantable |

**`GITHUB_TOKEN` is scoped to the workflow's repository only and expires when the job ends**
(https://docs.github.com/actions/security-guides/automatic-token-authentication). It therefore
**cannot** clone `its-everdred`'s 13 private repos and **cannot** read anything private in
`0xmetropolis`, `aiur-team`, `etherguild`, `ConsenSys-archive`. That is fine — none of those are
needed.

The one thing that looked like it needed a PAT — private contribution counts — does not.
The GraphQL schema description, read live **(M)**
(`gh api graphql -f query='{__type(name:"ContributionsCollection"){fields{name description}}}'`):

> `restrictedContributionsCount`: "A count of contributions made by the user that **the viewer
> cannot access**. Only non-zero when the user has chosen to share their private contribution counts."

Kevin has chosen to share them. Independent proof **(M)**: the **anonymous, unauthenticated**
public fragment
`curl -s -H 'x-requested-with: XMLHttpRequest' 'https://github.com/users/its-everdred/contributions?from=2024-01-01&to=2024-12-31'`
sums to **2,459** for 2024, while the authenticated GraphQL calendar sums to **2,454** — of which
**2,360 are restricted**. A public-only view would be ~94. The private counts are already public.
Therefore any token, including `GITHUB_TOKEN`, sees them.

`GITHUB_TOKEN` rate limit is **1,000 requests/hour/repository**
(https://docs.github.com/en/actions/reference/limits). The run needs ~135 **(M)**. 13% of budget.

Workflow permissions block:
```yaml
permissions:
  contents: write   # commit the bundle; nothing else
```

**Caveat if you want branch-name commits:** pushes made with `GITHUB_TOKEN` do **not** trigger
other workflows (GitHub's loop guard). That is a feature here — the bundle commit will not
re-trigger the generator. Vercel's Git integration is a webhook on GitHub's side and **is**
triggered. (I) — worth verifying on the first live run.

### 2.5 The 60-day trap

"In a public repository, scheduled workflows are automatically disabled when no repository
activity has occurred in 60 days"
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
This repo has had **zero pushes since 2021-05-31** — exactly the failure this rule describes. The
generator's own daily commit should count as activity and keep itself alive (I), but that is a
self-referential assumption. **Mitigation:** the workflow also declares `workflow_dispatch`, and
the "no-change" path (§9) still touches `manifest.json.generatedAt` so there is always a commit.

Also from the same page: `schedule` "can be delayed during periods of high loads… If the load is
sufficiently high enough, **some queued jobs may be dropped**." Do not schedule on the hour. Use
`17 6 * * *`. A dropped run is harmless because the bundle is idempotent (§7).

---

## 3. Repos in scope

`gh repo list its-everdred --limit 200` → **90 repos**: 50 public non-fork, 27 public fork,
13 private. `gh repo list its-applekid --limit 200` → **9**: 8 public (5 forks), 1 private.
`gh api user/orgs` → `ethereum-optimism`, `etherguild`, `aiur-team` **(M)**.

But the owned-repo list is the wrong scope. The right scope is "repos with contributions", from
`contributionsCollection` × 6 years × 2 users, unioning `commit/pullRequest/issue/
pullRequestReview ContributionsByRepository` **(M, `/tmp/kwdata/allrepos.json`)**:

**67 distinct repos, all public, 0 private.** Beyond the three orgs above this pulls in
`0xmetropolis` (7 repos — Kevin has left the org, still public), `ConsenSys-archive` (12),
`ethereum`, `alchemyplatform`, `Uniswap`, `base`, `wevm`, `farcasterxyz`, `INFURA`, `sapsaldog`.

Top by contribution volume:
```
3242 aiur-team/aiur     336 its-everdred/gary   164 its-applekid/ethereum-archive
 134 etherguild/etherguild.xyz   124 0xmetropolis/metal   78 its-applekid/actions
```

### Blobless clone cost, measured

`git clone --filter=blob:none --no-checkout` over all 67 (66 succeeded), then
`git log --all --no-merges --name-only --no-renames --perl-regexp --author=<allowlist>`:

```
cold clone wall  342.6 s   (sequential, single-threaded)
git log wall       2.3 s   (all 66 repos combined)
disk             144.3 MB  (151.4 MB after one incremental fetch)
warm fetch wall   28.0 s   (all 66, 1 repo advanced, 0 failures)
```

Per-repo spot checks **(M)**, showing how brutally blobless beats `diskUsage`:

| repo | GitHub `diskUsage` | blobless disk | clone | `git log --all --name-only` |
|---|---|---|---|---|
| ethereum/ethereum-org-website | 1,380,824 KB | **82.2 MB** | 4.02 s | 1.24 s (58,912 commits) |
| ConsenSys-archive/trufflesuite.com | 533,886 KB | **3.2 MB** | 0.93 s | 0.05 s |
| ConsenSys-archive/ganache | 469,412 KB | **5.3 MB** | 1.31 s | 0.08 s |
| ConsenSys-archive/truffle | 184,987 KB | **18.2 MB** | 1.60 s | 0.29 s (20,588 commits) |
| aiur-team/aiur | 88,032 KB | **4.4 MB** | 0.93 s | 0.08 s (3,593 commits) |

**Correction to the prior doc (M):** it recorded aiur's blobless clone as "950 ms, 28 MB" and
`git log --all --name-only` as "14.5 s". Fresh measurement: **0.93 s, 4.4 MB, 0.08 s**. The 28 MB
and 14.5 s figures are ~6× and ~180× too high — most likely a partial clone that lazily back-fetched
trees. Plan against 4.4 MB / 0.08 s.

**Parallelism (I):** 342.6 s is sequential. `xargs -P8` over 66 independent HTTPS clones should
land near 60–80 s on a 4-vCPU runner (network-bound, not CPU-bound). Not measured; do not put it
in a timeout budget without measuring.

**Prune list.** 16 of the 67 yield zero attributable commits — they are PR-review-only or
issue-only contributions (e.g. `ethereum/ethereum-org-website`: 4 contributions, all reviews;
82 MB of clone for nothing). Gate the clone on
`commitContributionsByRepository[].contributions.totalCount > 0`. That drops the corpus from
144.3 MB to roughly **50 MB** and the cold clone to well under 120 s (I — 82.2 MB of the 144.3
is ethereum-org-website alone, measured).

---

## 4. Private repos: the blurred aggregate

### Exact query

```graphql
query PrivateAgg($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      hasAnyRestrictedContributions
    }
  }
  rateLimit { cost remaining }
}
```
One call per **month**, `from` = first instant of the month, `to` = last instant. 67 months for
2021-01 → 2026-07. Measured: **67 calls, 36.6 s wall, cost 1 each** **(M)**.

Why monthly and not daily: `contributionsCollection` is capped at one year per query and returns a
single scalar for the window, so daily resolution would need 2,038 calls. Monthly is 67 calls and
is the right resolution for a blurred blob anyway — a blob that pulses daily would leak a working
pattern.

### Exact bundle shape

Folded into `grid.json`:
```json
{"p":[21,12,21,23,18,6,0,2,2,0,0,0,0,0,0,0,1,0,2,4,8,15,35,23,77,45,110,76,62,24,75,216,90,122,91,42,121,278,258,200,110,126,169,208,158,290,152,292,213,228,91,72,42,33,34,68,65,83,33,36,23,25,40,101,68,109,122],
 "pStart":"2021-01"}
```
67 integers. **233 B raw, 160 B gzip (M)**. Total across 5 years: **5,071** private contributions —
50.7% of the 10,006 combined total. Half of Kevin's output is behind this blob; it deserves to be
a first-class visual, not a footnote.

### Leakage: verified none

The same 67-call sweep also requested
`commitContributionsByRepository / pullRequest… / issue… / pullRequestReview…` with
`repository { nameWithOwner isPrivate }` and collected every `isPrivate: true` name it saw.
Result **(M, `python3 /tmp/kwdata/privagg.py`)**:

```
PRIVATE REPO NAMES LEAKED BY THE QUERY: NONE
```

This held even though the querying token is a `repo`-scoped PAT belonging to the repo owner —
GitHub structurally refuses to enumerate private repos through `contributionsCollection`. With
`GITHUB_TOKEN` (which cannot even read those repos) the guarantee is strictly stronger.

The aggregate carries **no repo name, no path, no branch, no commit message, no day, no actor** —
only a monthly integer. The renderer must not subdivide it: draw one blurred cluster whose radius
scales with `p[m]`, labelled `Private repos`.

**One residual leak to close (I):** `grid.json`'s `e[]` array is the *calendar* count, which
already includes private contributions. Subtracting public events per day would let a viewer
derive daily private volume. If that matters, publish only the calendar totals (as designed) and
never publish a public-only daily series alongside it.

---

## 5. Two-actor attribution

Ground truth measured on the real `aiur` clone (3,628 commits across all refs),
`python3 /tmp/kwdata/attrib.py /home/everdred/github/everdred/aiur` **(M)**.

### Committer email is useless

```
committer == "GitHub <noreply@github.com>":  649 / 3628  (17.9%)
author != committer:                          665 / 3628
   343  its.applekid@gmail.com -> noreply@github.com
   285  its.everdred@gmail.com -> noreply@github.com
```
Every squash/merge through the GitHub web UI rewrites the committer to `GitHub <noreply@github.com>`.
Keying on committer loses 343 of `its-applekid`'s commits outright. **Use author email.**

### Display name is catastrophically wrong

Scanning all 66 clones for identities matching `/kevin|weaver|everdred|applekid/i` **(M,
`python3 /tmp/kwdata/identscan.py`, 3,865 distinct identities total)** turns up **13 other Kevins
and a second Weaver**:

```
427  Kevin A      <kevin@example.com>          <-- 427 commits, not Kevin Weaver
 80  Kevin B   <surname.kevin@example.com>
  6  Other Weaver    <weaver.other@example.com>
  6  Kevin C      <kevin.surname@example.org>
  4  Kevin Ziechmann  3  Kevin D  2  Kevin Sullivan  2  Kevin Leffew  …
```
A name-based matcher misattributes **500+ commits**. Never match on name.

### The actual identity allowlist

```js
const EVERDRED = [
  "kevinw@oplabs.co",                            // 1,281 aiur + others
  "its.everdred@gmail.com",                      //   552 + 476
  "kevinweaver2@gmail.com",                      // 2,240 + 1,540 + 302 + 11
  "its-everdred@users.noreply.github.com",       //   275
  /^\d+\+its-everdred@users\.noreply\.github\.com$/,   // 1020682+… seen in a co-author trailer
];
const APPLEKID = [
  "its.applekid@gmail.com",                      //   691 + 367
  "its-applekid@users.noreply.github.com",       //     9
  "applekid.mail@proton.me",                     //     3  <-- easy to miss
  /^\d+\+its-applekid@users\.noreply\.github\.com$/,
];
```
Both noreply forms must be matched: the bare `<login>@users.noreply.github.com` **and** the
`<id>+<login>@users.noreply.github.com` form. Both appear in this corpus **(M)**.

### Commits that will be misattributed — flagged

1. **`Kevin Weaver <kevinweaver@kevins-work-mbp.local>` — 2 commits (M).** A misconfigured local
   git identity. Not linked to any GitHub account, so GitHub does not count them either. Excluding
   them keeps the animation consistent with the grid. Cost: 2 file-touch events. Accept.
2. **The bare-noreply gap — 91 commits (M).** Cross-checking `GET /repos/aiur-team/aiur/commits?author=its-everdred`
   (13 API calls, 10.9 s) against the local allowlist on `HEAD` **(M,
   `python3 /tmp/kwdata/authcheck.py`)**:
   ```
   its-everdred   api=820  local-email=902  api\local=0  local\api=82
   its-applekid   api=326  local-email=335  api\local=0  local\api= 9
   ```
   The local allowlist is a **strict superset** of GitHub's own attribution — zero false negatives.
   The 91 extra are all authored as `its-everdred@users.noreply.github.com` /
   `its-applekid@users.noreply.github.com`, the bare form, which GitHub no longer resolves to the
   account. **They are real work but do not appear in the contribution grid.** The animation will
   show ~9% more activity than the grid implies unless you drop them. Recommendation: **keep them
   in the animation, note the divergence**, because they are genuine file touches.
3. **Third-party commits reachable through the allowlist: none.** `neither`-class authors in aiur
   are `frantic@openai.com`, `unrelated-handle@example.com`, `mstrautmann@openai.com`, `kevin.mid.surname@example.net`,
   `hintz@openai.com`, `copilot-swe-agent[bot]` — 39–40 commits, all correctly excluded **(M)**.

### Co-author trailers — the double-attribution problem

1,116 of 3,628 aiur commits (30.8%) carry a `Co-authored-by:` trailer **(M)**. Folding trailers into
attribution:
```
everdred-only 3,096   applekid-only 186   BOTH 307 (8.5%)   neither 39
```
**307 commits are authored by one actor and co-authored by the other.** GitHub credits a commit to
the author *and* every co-author whose email is account-linked, so those 307 land in **both**
contribution calendars. See §6.

The trailers also expose a third actor class the current scope ignores: `Claude Opus 4.8 /
Sonnet 4.6 / Fable 5 <noreply@anthropic.com>` (531 across all variants) and `Codex <codex@openai.com>`
(45) **(M)**. Not `its-applekid` — a distinct "tool" identity. Out of scope, but the data is there
if a third actor class is ever wanted.

**Decision:** a commit's actor id in the event stream = `cls(authorEmail)`. Co-author trailers are
**not** used to duplicate events (that would double the file-touch count). They are used only in
§6 to de-duplicate the grid.

---

## 6. Contribution counting

### Exact query, both users, 5 years

```graphql
query Cal($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}
```
`contributionsCollection` is **capped at one calendar year per query**. 6 windows
(2021…2026) × 2 users = **12 queries, cost 1 each** **(M)**.

**Use `contributionCalendar.totalContributions`, not the sum of the four category totals.**
Measured deltas **(M)**:
```
its-everdred 2021 cal=318  sumOfCategories=309  delta=9
             2024 cal=2454 sumOfCategories=2446 delta=8
             2026 cal=2791 sumOfCategories=2787 delta=4
its-applekid 2026 cal=1488 sumOfCategories=1479 delta=9
```
The calendar already includes commits + PRs + issues + reviews + restricted, and the per-day
`contributionCount` is the only field with day resolution. The category totals are for the man-page
sidebar, not the grid.

### Merging the two day buckets

```js
grid[date] = { e: everdredCal[date] ?? 0, a: applekidCal[date] ?? 0 };
combined   = grid[date].e + grid[date].a;
level      = combined === 0 ? 0 : Math.min(9, 1 + Math.floor(Math.log2(combined)));
```
Measured over 2021-01-01 → 2026-07-31 **(M, `python3 /tmp/kwdata/cal.py`)**:
```
days 2038   combinedTotal 10,006
log2 bands  {0:859, 1:375, 2:263, 3:196, 4:204, 5:84, 6:34, 7:17, 8:5, 9:1}
```
Matches the prior doc's histogram within ±1 per band; the +5 on the total is same-day drift.
Windows must not overlap: use `[YYYY-01-01T00:00:00Z, YYYY-12-31T23:59:59Z]` and filter returned
days to the requested year — GraphQL returns whole weeks and will hand back days from the adjacent
year.

### The double-count, quantified

8.5% of aiur commits are co-authored across the two actors **(M)**, so `e + a` over-counts those
days. Aiur is 58% of the corpus, so corpus-wide the inflation is on the order of **5%** (I).

Three options, in order of honesty:
1. **Accept and label it.** `10,006 contributions` matches what both GitHub profiles show. A
   visitor who cross-checks the profiles sees the same number. Recommended.
2. Subtract co-authored-by-both commits, derivable from the blobless clone (307 known for aiur).
   Makes the site's number differ from both GitHub profiles — worse, not better.
3. Show two stacked series. `grid.json` already ships `e` and `a` separately, so this is a pure
   client change with no pipeline cost.

**Do not mix sources.** The anonymous HTML fragment and the authenticated GraphQL disagree on
**52 of 366 days in 2024, by ±1–2 each** (totals 2,459 vs 2,454) **(M,
`python3 /tmp/kwdata/anoncmp.py`)** — a timezone-bucketing difference. Busy days agree exactly.
Pick GraphQL and never fall back to scraping mid-run.

---

## 7. Determinism and incremental caching

### State file — `data/.pipeline-state.json`, committed alongside the bundle

```jsonc
{
  "schema": 1,
  "lastRun": "2026-07-31T06:17:00Z",
  "repos": {
    "aiur-team/aiur": {
      "heads": {"refs/heads/main": "a1b2c3…", "refs/heads/dev": "d4e5f6…"},
      "events": 25986, "lastEventDay": "2026-07-31",
      "status": "ok", "lastOk": "2026-07-31T06:17:00Z", "consecutiveFailures": 0
    }
  },
  "calendar": {"its-everdred": {"2026": {"etag": null, "total": 2791}}},
  "private":  {"2026-07": 122},
  "bundleHash": "sha256-…"
}
```

### Incremental algorithm

1. Restore the clone cache (`actions/cache`, key `clones-v1-${{ hashFiles('data/.pipeline-state.json') }}`,
   restore-keys `clones-v1-`). 151 MB, 10 GB limit, 7-day eviction **(M/cited)**.
2. For every repo in scope: `git fetch --filter=blob:none --prune origin '+refs/heads/*:refs/remotes/origin/*'`.
   All 66: **28.0 s, 0 failures (M)**.
3. Compare `git rev-parse --all` before/after. In the measured run **1 of 66 repos advanced**. For
   the 65 unchanged, reuse the cached per-repo event list from the previous run's artifact — no
   `git log` at all. (`git log` is 2.3 s total anyway, so this optimization is optional; the
   *fetch* is the cost, not the log.)
4. Contribution calendar: refetch only the **current** year for both users (2 queries) plus the
   current month's `restrictedContributionsCount` (1 query). Historical years are immutable once
   the year closes. Daily cost drops from 79 queries to **3**.
   Force a full refetch on the 1st of each month to absorb backfills.
5. Re-encode. Full encode of 44,886 events runs in well under a second (the whole `encode3.py`
   sweep including 30 brotli-11 passes finishes in seconds) **(M)**.
6. Byte-compare the new bundle against the checked-in one. If identical, touch only
   `manifest.generatedAt` and commit (keeps the 60-day scheduled-workflow clock alive, §2.5).

### Determinism requirements

The encoder must be a pure function of `(set of commits, allowlist, chunk size)`:
- Sort events by `(authorDate DESC, repoName ASC, commitSha ASC, path ASC)`. Never rely on
  `git log` ordering — it varies with ref topology.
- Repo ids from `sort(nameWithOwner)`, not discovery order. Otherwise adding one repo renumbers
  every chunk.
- Path ids from first-use order **within the sorted event stream** — deterministic given the sort.
- Use author date, not committer date. Committer date is rewritten by rebase and by GitHub's
  squash-merge, which would silently reshuffle history between runs.
- `git log --no-renames`. Rename detection is heuristic and threshold-dependent; two runs on
  slightly different history can produce different rename decisions and therefore different paths.
- Emit `generatedAt` at second resolution and nothing else time-varying, so the diff is one line
  on a no-op day.

---

## 8. Size budget

**Hard budget: 12 KB brotli for the first-byte data payload. Measured today: 9,324 B.**

| Resource | brotli | gzip |
|---|---|---|
| `manifest.json` | ~400 (est) | ~450 |
| `repos.json` (51 repos) | **892** | 1,060 |
| `grid.json` (2,038 days × 2 actors + 67 private months) | **1,122** | 1,317 |
| `events/ee-00.json` (1,500 newest events) | **1,925** | 2,336 |
| `paths/pd-00.json` (585 newest paths) | **4,985** | 5,694 |
| **first byte total** | **9,324 B** | 10,857 B |
| every subsequent chunk (median) | ~3,400 B | ~4,000 B |
| full 5-year corpus (30 chunks) | 127,565 B | 162,005 B |

### Justification

The **current live site already ships 115,334 bytes of compressed JavaScript** across 9 `_next`
chunks plus 2,877 bytes of brotli'd HTML **(M,
`curl -s https://www.kevinweaver.dev/ | grep -o '/_next/static/[^"]*\.js'` then measuring each)`.
The 9,324 B first-byte data payload is **8.1% of the JS the site ships today, for the entire
point of the site.** Even the pathological visitor who watches all the way back to 2013 pulls
127,565 B — about the same as the existing `framework.js` + `polyfills.js` pair (76,194 B) plus
`index.js`.

The prior doc measured the chosen viz runtime (d3 pack/force + Canvas 2D + GSAP) at **~35 KB gzip**.
A plausible v2 budget: 35 KB viz + ~60 KB Next/React (after dropping the 32.9 KB polyfills bundle,
which Next 10.1.3 ships for IE11) + 9.3 KB data = **~105 KB**, i.e. *lighter than today's site*
while doing vastly more.

The transport bill is a non-issue on Vercel: Hobby includes **100 GB Fast Data Transfer/month**
(https://vercel.com/docs/limits). At 9.3 KB per bounce visitor and 127.6 KB per completionist,
even an all-completionist month supports **~780,000 sessions**. (For contrast, the moot Netlify
analysis put the break point at 765 sessions/day.)

**What the budget buys, and what it forbids:** it forbids shipping the monolithic 127 KB bundle
up front (13.7× over budget) and forbids year- or repo-chunking (112,980 B and 88,190 B gzip
first chunks — 10× and 8× over). It permits exactly scheme D.

**Headroom:** the path dictionary is 54% of chunk00's brotli. If the corpus doubles, chunk00 does
not — chunk 0 is defined by event count, not corpus size. The **only** thing that inflates the
first byte is a burst of newly-touched paths in the most recent 1,500 events (the measured worst
case is chunk05 at 15,068 B gzip, a 2,833-new-path day). **Guard:** if any chunk's dict slice
exceeds 8 KB gzip, the encoder splits that chunk in half and re-emits. Cheap, deterministic, and
bounds the tail.

---

## 9. Failure modes

The invariant: **the generator writes the new bundle to a temp dir, validates it, and only then
replaces `public/data/v1/`. A run that cannot produce a valid bundle exits 0 having changed
nothing but `manifest.generatedAt`.** A scheduled run must never be able to ship a broken bundle.

| # | Failure | Detection | Action |
|---|---|---|---|
| 1 | **GraphQL secondary rate limit / 403** | non-200, or `rateLimit.remaining < 50` | Exponential backoff 1/2/4/8 s, 4 tries. Then reuse the previous run's `calendar` block from state and set `manifest.degraded = ["calendar"]`. Budget is 135 of 1,000/hr **(M)** — this should never fire. |
| 2 | **Clone/fetch network timeout** | non-zero `git` exit | **Measured live this session:** `0xmetropolis/metro-sdk` failed with `unable to access … Connection timed out` while `gh api repos/0xmetropolis/metro-sdk` returns `priv=false` and `curl -I` returns `HTTP/2 200` — the repo is fine, the network blipped **(M)**. Retry 3× with backoff. Still failing → keep the repo's **previous** event list from cache, increment `consecutiveFailures`, mark `status:"stale"`. Do **not** drop the repo. |
| 3 | **Repo goes private / access revoked** | clone 403/404 **and** `gh api repos/{o}/{r}` returns 404 | Freeze the repo's events at the last successful run, set `status:"gone"`, keep it in `repos.json` with `frozen:true`. History that already happened did happen. Do not silently delete — that would make the animation rewrite the past between page loads. |
| 4 | **Repo deleted** | same as #3, `consecutiveFailures >= 7` | After 7 consecutive days, drop from `repos.json` and re-encode. The week's delay prevents a transient outage from erasing a repo. |
| 5 | **Repo renamed** | clone follows the redirect, `nameWithOwner` changes | Key `repos.json` on the **numeric GitHub repo id**, not the name; carry `n` as a display field. Renames then cost zero re-numbering. |
| 6 | **Empty result** (0 events, or 0 repos, or grid total 0) | assertion in the validator | **Hard abort, exit 1, no commit.** This is the "GitHub returned an empty 200" case and it is the single most dangerous failure — it would silently blank the site. |
| 7 | **Sanity regression** | new `events` < 0.9 × previous `events`, or new `combinedTotal` < previous | Abort, exit 1, open an issue. Contribution counts and file-touch counts are monotone non-decreasing over a fixed window. |
| 8 | **Encoder invariant broken** | validator | Assert, per chunk: `d/r/p/a` equal length; all `d[i] >= 0`; `max(p) < cumulative dict length`; `max(r) < repos.length`; every chunk decodes and re-encodes byte-identically. Abort on any failure. |
| 9 | **Actions cron dropped or delayed** | none available client-side | Harmless — the pipeline is idempotent and the bundle is a full snapshot, never a delta. A skipped day self-heals. Schedule at `17 6 * * *` (off the hour) since "the start of every hour" is explicitly named as a high-load window. |
| 10 | **Scheduled workflow auto-disabled at 60 days** | silent | Always commit (even a no-op `generatedAt` bump). Add `workflow_dispatch`. Optionally a second workflow on `schedule: '0 0 1 * *'` that only touches a heartbeat file. |
| 11 | **Vercel deploy fails after a good commit** | Vercel dashboard | The previous deployment stays live and serves the previous bundle. No client-visible breakage. Vercel Hobby caps at 100 deploys/day; the pipeline uses 1. |
| 12 | **Partial fetch — client gets chunk N but not N+1** | client-side | Chunks are independently decodable (`b` = absolute base day). Playback stalls at the chunk boundary and shows "loading history"; nothing corrupts. Retry with backoff; give up after 3 and stop the rewind. |

### Validator, concretely

```
assert repos.length >= 40
assert events >= 40000
assert grid.e.length === grid.a.length === days
assert grid.e.reduce(+) + grid.a.reduce(+) >= prev.combinedTotal
assert chunks.length === ceil(events / chunkSize)
for each chunk: lengths equal, d >= 0, max(p) < dictLen, max(r) < repos.length
assert roundTrip(decode(bundle)) === bundle
assert JSON.parse of every emitted file succeeds
```
Run it in CI on the temp bundle **before** `git add`. Exit non-zero on any failure — a red
scheduled run is strictly better than a green one that shipped garbage.

---

## Appendix — reproduction

All scripts written to `/tmp/kwdata/` this session:

| script | measures |
|---|---|
| `fullpipe.py` | clone all 67, author-filtered log, 44,886 events / 13,453 paths / 144.3 MB |
| `clonebench.py` | per-repo blobless clone + log timings |
| `incr.py` | 28.0 s warm fetch across 66 clones |
| `encode.py` / `encode2.py` / `encode3.py` | all chunking schemes, gzip + brotli |
| `attrib.py` | author/committer/co-author classification on aiur |
| `identscan.py` | 3,865 identities across the corpus; the 13 other Kevins |
| `authcheck.py` | REST `?author=login` vs local email allowlist |
| `cal.py` | 12 calendar queries, merged 2,038-day grid, log2 bands |
| `privagg.py` | 67 monthly `restrictedContributionsCount`, leakage check |
| `anoncmp.py` | anonymous vs authenticated per-day contribution counts |

Raw artifacts: `/tmp/kwdata/allrepos.json` (67 repos), `/tmp/kwdata/raw_events.json`
(44,886 events + path/repo tables), `/tmp/kwdata/grid.json` (2,038 merged days),
`/tmp/fullclone/` (66 blobless clones, 151 MB).

---

# Verification corrections

Appended 2026-07-31 by an independent adversarial verifier. Every number below was re-measured
from scratch with the command shown; nothing here is inferred from the original doc. The original
text above is unmodified.

**Overall: the architecture survives. Five of the doc's specific "measured" numbers do not.**

## VC-1. `342.6 s cold clone` is wrong by ~8×. Actual: 40–45 s. — REFUTED

Two independent full re-clones of all 67 repos into fresh empty directories, with
`GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false`
(i.e. provably anonymous, credential helper disabled):

```
run 1 -> /tmp/vclone2   COLD CLONE WALL  44.9 s   fails=0   145 MB
run 2 -> /tmp/vclone3   COLD CLONE WALL  40.0 s   fails=0   145 MB
        slowest single repo: ethereum/ethereum-org-website 3.8 s
```

342.6 s implies a 5.1 s average per repo, which exceeds the slowest repo actually observed. §3's own
`clonebench` table (ethereum-org-website 4.02 s, truffle 1.60 s, aiur 0.93 s) already contradicted
342.6 s; the verifier's runs confirm the clonebench figures, not the fullpipe figure. The 342.6 s
number is almost certainly `fullpipe.py`'s `t_clone` accumulator contaminated by something other
than clone time.

**Consequences that must be propagated:**
- §2.1 reason 3 ("a cold Vercel cron run *cannot finish*") is **void**. 40–45 s fits inside the
  300 s Hobby ceiling with ~6.7× headroom.
- §3's "cold clone to well under 120 s" after pruning is moot; it is already under 45 s unpruned.
- §7's cache-miss budget of `342.6 s + 2.3 s` should be `~45 s + ~1 s`.
- The `xargs -P8` parallelism note in §3 is unnecessary. Do not build for it.

Other §3 figures **confirmed**: 145 MB fresh / 152 MB after one fetch (`du -sh /tmp/fullclone` =
152M); warm incremental fetch of all 66 = **20.5 s, 0 failures, exactly 1 repo advanced** (doc said
28.0 s — same order, doc is conservative, fine); `git log --all --name-only` over all 66 = **0.60 s**
(doc said 2.3 s). Corpus reproduces: **44,923 events** (doc 44,886, delta = same-day drift),
**13,453 unique paths** (exact), **51 repos with ≥1 event** (exact), year histogram exact modulo drift,
aiur = 57.9% of events, 2026 = 76.2% of events. **Zero API calls / fully anonymous git: confirmed.**

## VC-2. Vercel Cron is still disqualified, but now on ONE uncited reason — CONCLUSION HOLDS, REASONING WEAKENED

Verified verbatim from the cited pages:
- Hobby function max duration = **"300s default and maximum"** (https://vercel.com/docs/functions/limitations, fetched 2026-07-31). ✔ cited correctly.
- Hobby cron = **"once per day"**, **"a cron job configured as `0 1 * * *` will trigger anywhere between 1:00 am and 1:59 am"** (https://vercel.com/docs/cron-jobs/usage-and-pricing). ✔ cited correctly.

But note what those two facts actually do:
- Reason 3 (300 s vs 342.6 s) is **refuted** by VC-1.
- Reason 2 (once/day, ±59 min) does **not** disqualify anything — a once-daily bundle regeneration
  at an imprecise hour is exactly the desired cadence.
- Therefore the disqualification now rests **entirely on reason 1** (immutable deployments +
  read-only function filesystem), which is the **only one of the three with no citation in the doc**.
  The verifier could not locate that wording on `/docs/deployments`, `/docs/functions/limitations`,
  or `/docs/functions/runtimes/node-js`. It is substantively correct — a function cannot write into
  its own deployment's static asset set — but it is now load-bearing and should be cited or
  demonstrated before the plan leans on it.

GitHub Actions remains the right answer, and its supporting citations verified verbatim:
`GITHUB_TOKEN` = **"1,000 requests per hour per repository"**, job limit **"up to 6 hours"**
(https://docs.github.com/en/actions/reference/limits); **"In a public repository, scheduled workflows
are automatically disabled when no repository activity has occurred in 60 days"** and **"some queued
jobs may be dropped"** (https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## VC-3. `GITHUB_TOKEN` sufficiency: mechanism CONFIRMED (and strengthened), final step UNPROVEN

The doc's evidence reproduces exactly:
- Anonymous fragment `curl -s -H 'x-requested-with: XMLHttpRequest' 'https://github.com/users/its-everdred/contributions?from=2024-01-01&to=2024-12-31'` → **366 day tooltips summing to 2,459**. Exact.
- Authenticated GraphQL 2024 → `cal=2454 restricted=2360 hasAny=true`. Exact.

The doc's inference (private counts are public → any token sees them) is **independently confirmed
by a test the doc did not run**. Querying `restrictedContributionsCount` for users whose private
repos this token demonstrably cannot access:

```
kentcdodds  restricted=20   hasAny=true
shanselman  restricted=25   hasAny=true
jlord       restricted=68   hasAny=true
bkeepers    restricted=757  hasAny=true
torvalds/defunkt/sindresorhus/mislav  restricted=0 hasAny=false  (opted out)
```
Viewer-independence given opt-in is real. Good call.

**But the last step — "therefore `GITHUB_TOKEN` sees them" — remains UNPROVEN and is presented
inside an (M)-labelled proof table.** `GITHUB_TOKEN` is a *GitHub App installation access token*
scoped to one repository, not a user token; no test in this session or the original used one.
GitHub docs state the minimal scope for user contribution data is `read:user`, which has no
installation-permission analogue. This is a genuine unresolved risk.

**Required mitigation (cheap):** the first workflow run must assert
`restrictedContributionsCount > 0 && hasAnyRestrictedContributions === true` using
`${{ secrets.GITHUB_TOKEN }}` and hard-fail if not. If it fails, one `read:user` fine-grained PAT is
needed for the calendar/private-aggregate step only — the clone step needs no token either way
(confirmed anonymously in VC-1).

## VC-4. Chunking conclusion CONFIRMED byte-exactly; the B/C comparison was rigged; the 1.04× overhead is 1.16×

Scheme D reproduces to the byte with an independently written encoder (`/tmp/verify_encode.py`):
```
D fixed 1500ev + global streamed dict:  FIRST gz=8030 br=6910   TOTAL gz=162005 br=127565
  chunk00: events gz=2336 br=1925 | paths gz=5694 br=4985 | 585 new paths
```
Identical to §1.2/§8. Excellent.

**But schemes B and C in §1.2 were measured with self-contained per-chunk path dictionaries
(`encode.py::columnar`) while D got the global streamed dictionary.** That is not an apples-to-apples
comparison. Re-measured fairly, giving B and C the same global streamed dict:

| Scheme (all with global streamed dict) | chunk 0 gzip | chunk 0 brotli | total gzip |
|---|---|---|---|
| D, 1,500-event chunks | **8,030** | **6,910** | 162,005 |
| B, calendar year | **103,342** (doc said 112,980) | 76,638 | 141,328 |
| C, per repo | **83,729** (doc said 88,190) | 60,961 | 143,675 |
| Monolithic, like-for-like encoding | 139,643 (doc said 156,096) | 102,428 | 139,643 |

**The verdict is unchanged and still overwhelming** — B and C are 12.9× and 10.4× over D's first
byte. Claim 3 stands. But two derived numbers must be corrected:
- §1.2's "1.038× overhead" compares D against a **strawman** monolithic baseline (a JSON array of
  raw path strings, no front-coding). Against a like-for-like monolith the real overhead is
  **162,005 / 139,643 = 1.16× gzip** and **127,565 / 102,428 = 1.25× brotli**. Still acceptable; not 1.04×.
- §1.3's dictionary table conflates two encodings in one row. Measured separately:

| Global path dict, 13,453 paths, first-use order | raw | gzip | brotli |
|---|---|---|---|
| JSON array of strings | 705,385 | 90,650 | 70,354 |
| newline-joined plain | 678,477 | 90,122 | 70,311 |
| newline-joined **front-coded** | **262,437** | **75,082** | **63,020** |
| sum of the 30 front-coded slices (what ships) | — | 88,873 | 77,354 |

  §1.3's "front-coding cuts the raw dictionary 705 KB → **225 KB** and gzip 90,302 → **70,252**" is
  measured against a **sorted** dictionary (`encode.py::path_dict_front_coded` calls `sorted()`).
  Scheme D *mandates* first-use ordering to get the streaming-slice property, and cannot sort.
  In first-use order the front-coding gain is **262,437 raw / 75,082 gzip** — about 17% worse than
  advertised. Still worth doing; just do not budget for 225 KB.
  Also note the 30-slice brotli total (77,354) is **worse** than one blob (70,354): brotli's window
  resets per file. That is a real ~7 KB tax of chunking that §1.3 does not name.

## VC-5. Two size claims in §8 are wrong, and the encoder's own guard would fire

- **"the worst case is chunk05 at 15,068 B gzip, a 2,833-new-path day"** — **REFUTED.** In a
  1,500-event chunk a chunk cannot contain more than 1,500 new paths, so 2,833 is arithmetically
  impossible. That figure is from the **CH=3,000** configuration (verified: at CH=3000, chunk5 =
  15,068 B gzip, 2,833 new paths). In the shipped CH=1,500 scheme the real worst path slice is
  **chunk10: 8,250 B gzip, 1,500 new paths** (that chunk's combined total, 11,132 B, is the §1.2
  "worst chunk 11,128" — confirmed).
  **This matters operationally:** §8's guard is "if any chunk's dict slice exceeds 8 KB gzip, split
  the chunk". 8,250 > 8,192, so **the guard fires on chunk 10 in today's real data.** Either raise
  the threshold or expect 31 chunks, not 30.
- **"the path dictionary is 54% of chunk00's brotli"** — **REFUTED.** 4,985 / 6,910 = **72.1%**.
- **"events/ee-NN.json … 2,032–3,044 B gzip, median ~2,250"** — measured range is **1,261–3,067**,
  median **2,386**.
- **§8's `repos.json` (892 B br) and `grid.json` (1,122 B br) were measured for schemas smaller than
  the ones §1.4 specifies.** `repos.json` was measured as `{i,n,e,last}` with no `first` and no
  `private`; `grid.json` as `{start,e,a}` with no `n`, no `p`, no `bands`. Measured with §1.4's own
  fields:

| file | doc (M) brotli | §1.4 schema, actual brotli | gzip |
|---|---|---|---|
| `repos.json` (51) | 892 | **1,058** | 1,294 |
| `grid.json` | 1,122 | **1,230** | 1,451 |

  **Corrected first-byte total: 400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B brotli**, not 9,324.
  Still comfortably under the 12 KB budget. Budget survives; the number in §8 does not.

## VC-6. §3's prune recommendation is built on a false example and overstates the saving ~2.5× — REFUTED

§3: *"16 of the 67 yield zero attributable commits — they are PR-review-only or issue-only
contributions (e.g. `ethereum/ethereum-org-website`: 4 contributions, all reviews; 82 MB of clone
for nothing) … That drops the corpus from 144.3 MB to roughly 50 MB."*

`ethereum/ethereum-org-website` **does** yield an attributable commit:
```
$ git -C /tmp/fullclone/ethereum_ethereum-org-website log --all --no-merges --perl-regexp \
    --author='its\.everdred@|kevinweaver2@|kevinw@oplabs\.co|its-everdred@users|…'
2023-02-02T14:01:14-08:00  kevinweaver2@gmail.com  Fix broken DAppNode url
```
It is in `raw_events.json` with 1 event. The proposed gate
(`commitContributionsByRepository[].contributions.totalCount > 0`) would **not** prune it, so the
82 MB stays.

Actual zero-event repos, measured: **15 repos totalling 21.3 MB** (`ganache`, `aa-sdk`,
`claude-app-server`, `create-wagmi`, `blueprint-box`, `declarative-deployments`, `filecoin-box`,
`react-box`, `scaffold-eth`, `infura`, `v3-core`, `contract-deployments`, `ethereum-foundation-website`,
`ethismoney-data`, `farcasterxyz/contracts`). Pruning takes the corpus **145 MB → ~124 MB**, not
"roughly 50 MB". Combined with VC-1 (45 s cold clone), **pruning is not worth the complexity — drop
this recommendation.**

Minor, same section: `allrepos.json` has **8** `0xmetropolis` repos (doc says 7) and **13**
`ConsenSys-archive` repos (doc says 12).

## VC-7. Attribution (§5): substance CONFIRMED, three numbers wrong

Re-ran `attrib.py` against `/home/everdred/github/everdred/aiur` and re-implemented it independently.
**Exact reproduction** of: 3,628 commits all refs; **649** committer `== noreply@github.com` (17.9%);
**665** author≠committer; **344** `its.applekid@gmail.com → noreply@github.com`; **285**
`its.everdred@gmail.com → noreply@github.com`; **everdred-only 3,096 / applekid-only 186 / BOTH 307 /
neither 39**. `identscan.py` reproduces exactly: **3,865** distinct identities, Kevin A 427,
Kevin B 80, Other Weaver 6, Kevin C 6, `applekid.mail@proton.me` 3,
`kevinweaver@kevins-work-mbp.local` 2; ~555 commits misattributable by name-matching.
`authcheck.py` reproduces exactly: everdred api=820 / local=902 / gap 82; applekid api=326 /
local=335 / gap 9. **Use author email. Never committer, never name. Claim 4 is upheld.**

Three corrections:

1. **"1,116 of 3,628 aiur commits (30.8%) carry a `Co-authored-by:` trailer (M)" — REFUTED.**
   Measured three ways on the same repo: `git log --all -i --grep='Co-authored-by' --pretty=%H | wc -l`
   = **937** (25.8%); `%(trailers:key=Co-authored-by)` non-empty = **937**;
   trailer *lines* = **1,508**. No measurement produces 1,116, and `attrib.py` never prints a trailer
   count at all. The dependent §6 inference ("corpus-wide inflation on the order of 5%") should be
   re-derived from 937 / BOTH=307.
2. **"The 91 extra are all authored as [the bare noreply form]" — REFUTED.** Measured: 80 bare
   `its-everdred@users.noreply.github.com` + 9 bare `its-applekid@users.noreply.github.com` = 89,
   plus **2 authored as `kevinw@oplabs.co`**, which is not a noreply form. So 89/91, and the
   "GitHub no longer resolves the bare form" explanation does not cover all of the gap.
3. **The corpus was not built with §5's allowlist.** `fullpipe.py` — the script that produced the
   headline 44,886 events — omits `applekid.mail@proton.me` (3 commits) and carries a dead
   `kevin@stitchfix.com` entry that its own `--author` regex can never surface. §5's allowlist is
   the right one; just note the headline corpus predates it and will shift by ~3 commits' worth of
   file touches when the real allowlist is used.

## Confirmed without correction

- `grid.json` merge: **2,038 days, combined 10,006**, log2 bands **{0:859, 1:375, 2:263, 3:196,
  4:204, 5:84, 6:34, 7:17, 8:5, 9:1}** — exact.
- Calendar-vs-category deltas — all four exact: everdred 2021 318/309, 2024 2454/2446, 2026
  2791/2787; applekid 2026 1488/1479.
- Private aggregate: sampled months re-queried live — 2021-01=**21**, 2026-01=**23**, 2026-06=**109**,
  2026-07=**122**, all matching `p[]`; `rateLimit.cost = 1` each; total **5,071** = 50.68% of 10,006.
- **Leakage: `PRIVATE REPO NAMES LEAKED: NONE`** — reproduced on a 4-month sample requesting all four
  `…ContributionsByRepository` with `repository{nameWithOwner isPrivate}`. §4 stands.
- `allrepos.json`: 67 repos, **0 private**.
- Live-site baseline in §8 — **exact**: 9 `_next` JS chunks totalling **115,334 B** compressed,
  `framework.js` + `polyfills.js` = **76,194 B**, HTML **2,877 B** brotli, `content-encoding: br`,
  `server: Vercel`.

## Net effect on the plan

Nothing in the recommended architecture changes: GitHub Actions cron + blobless clones +
author-email attribution + fixed-event-count chunks with a streamed global path dictionary is still
the right design, and its first-byte number is right to within 3%. What changes is the *reasoning*:
Vercel Cron is no longer excluded by a duration ceiling (only by the uncited read-only-filesystem
argument), pruning the corpus is not worth doing, the chunking-overhead and dictionary-savings
figures are optimistic by 12–17%, the chunk-splitting guard already trips on real data, and the
`GITHUB_TOKEN`-is-enough conclusion needs a one-line assertion in the first workflow run rather than
being treated as proven.
