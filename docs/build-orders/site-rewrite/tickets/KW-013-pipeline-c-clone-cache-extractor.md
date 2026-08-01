# KW-013 — Pipeline C: blobless clone cache and author-filtered extractor

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — two pure Node modules over a ~145 MB, 66-repository git corpus, with a cache, bounded retries, staleness semantics and a byte-determinism obligation; no HTTP client, no wire format, no UI, and every measurement already in the research corpus.

**Risk:** medium — a wrong sort key, a re-projected timezone, a mailmap rewrite or `git log` rename detection silently changes the event stream between runs and breaks every downstream chunk hash. Contained because the whole module is provable offline from a temp-directory git fixture, and because it holds no credential and can hold none.

**Phase hint:** 3

**Depends on:** KW-009, KW-012

**Serializes with:** none

**Requirements:** REQ-005, REQ-006, REQ-011

**Decisions:** DEC-003, DEC-006, DEC-007

**Gates:** none

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

An operator can run the clone-and-extract half of the data pipeline with every GitHub credential removed from the environment and get back a reusable on-disk blobless bare-clone cache plus one deterministic newest-first `RawEvent[]` file-touch stream attributed to the two known actors. Running it twice over the same cache produces byte-identical output. A repository whose network access fails comes back as `status: 'stale'` with its previously extracted events preserved, never dropped.

## Context and evidence

The centre of the site is a reverse-chronological, gource-style replay of every file Kevin and his agent account have touched. That needs a *file-touch* record, which no GitHub API exposes. It comes from git.

The decisive fact is GT-1/GT-2: the `gh` token is **not** SAML-SSO-authorized for `ethereum-optimism`, so `gh api repos/ethereum-optimism/actions` returns HTTP 403 `Resource protected by organization SAML enforcement` — while the very same repository is public and clones **anonymously** in about 1.0 s. That asymmetry is the entire reason DEC-006 splits the pipeline by auth surface. This ticket is the **token-free half**, and it sees the Optimism work in full. The GraphQL half (KW-010, gated on GATE-003 / `CONTRIB_TOKEN`) is a different ticket with a different failure mode.

Re-verified live during authoring, with credentials provably disabled (`GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null GIT_TERMINAL_PROMPT=0 GIT_ASKPASS=/bin/false`):

- `git clone --filter=blob:none --bare https://github.com/ethereum-optimism/actions.git` succeeds anonymously; 3.1 MB on disk (GT-6 measured 3.2 MB).
- `git log --all --no-merges --no-renames --name-only` over that clone yields **1,451 unique paths** — an exact match for GT-6.
- `git log --all` = **2,984** commits; `git log --all --no-merges` = **2,583**. GT-6's 2,984 is the with-merges number; the extractor runs `--no-merges`.
- Host toolchain: `git 2.55.0`, `node v24.18.0`.
- `git clone --bare` writes **no `remote.origin.fetch`** refspec — only `url`, `promisor` and `partialclonefilter`. This makes the research doc's incremental-fetch refspec wrong for a bare cache; see the implementation notes.
- Under anonymous access a missing or newly-private repository fails with `could not read Username for 'https://github.com': terminal prompts disabled`, i.e. the same non-zero exit class as a network blip — this module cannot tell `gone` from `stale`.

Contradiction resolutions this ticket inherits:

- **C-8 (clone cost).** The data-pipeline track recorded 342.6 s cold for the corpus. Its verifier (VC-1) re-ran two full anonymous re-clones and measured **44.9 s and 40.0 s**, 145 MB, 0 failures, slowest single repository 3.8 s. **The correction wins.** Binding consequences: do **not** build `xargs -P8` parallelism, and do **not** budget a multi-minute clone step. Warm incremental fetch of all 66 is 20.5 s measured by the verifier against the doc's more conservative 28.0 s; `git log --all --name-only` over all 66 is 0.60 s against the doc's 2.3 s. Budget the conservative numbers, expect the fast ones.
- **C-8 / VC-6 (pruning).** The prune-zero-commit-repos recommendation is **REFUTED**. The worked example (`ethereum/ethereum-org-website`) does yield an attributable commit — `Fix broken DAppNode url`, 2023-02-02, `kevinweaver2@gmail.com` — so the proposed gate would not have pruned it anyway. Actual zero-event repositories are 15, totalling 21.3 MB; pruning takes the corpus 145 MB → ~124 MB, not → 50 MB. **Do not prune.** Clone the full in-scope set.
- **C-10 / DEC-006.** `GITHUB_TOKEN` is an installation token scoped to this repository and cannot carry a third-party organization's SAML grant. This module makes **zero** GitHub API calls, so it is structurally immune to that defect rather than defensively guarded against it.
- **DEC-007 (Scheme D).** The encoder is a pure function of `(set of commits, allowlist, chunk size)`. The canonical order — day descending, then `repoName`, `sha`, `path` ascending — `--no-renames`, and **author date, never committer date** are determinism requirements this ticket must satisfy at the source, because KW-014 encodes exactly what it is handed.
- **DEC-003.** `package.json` and `package-lock.json` are frozen after KW-001. This ticket installs nothing.

Plan-context navigation, pinned to planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- Pack index: `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis: `docs/research/2026-07-31-decomposition-synthesis.md` §6 — wave diagram, verified topological levels, critical path, write-surface partition
- Decision registry: same file, §3 (D-01..D-17 → DEC-001..DEC-017) and §4 (HG-1..HG-7 → GATE-001..GATE-007)
- This ticket's implementation pointers: same file, §5, "Wave 3", entry **KW-13**
- Track evidence: `docs/research/2026-07-31-data-pipeline.md` §3 (repos in scope, blobless clone cost), §5 (two-actor attribution), §7 (determinism and incremental caching), §9 (failure modes), plus the appended "Verification corrections" VC-1, VC-6 and VC-7
- Ground truth: `docs/research/2026-07-31-decomposition-synthesis.md` §1, rows GT-1, GT-2, GT-6, GT-7
- Upstream contracts: `docs/build-orders/site-rewrite/tickets/KW-009-pipeline-discovery-identity.md` and `KW-012-bundle-schema-codec-contract.md`; downstream consumer `KW-014-pipeline-d-encoder-validator-state.md`

## Scope

- Create `scripts/pipeline/clone.ts`: an anonymous, sequential, blobless bare clone-or-fetch cache manager over a caller-supplied list of `nameWithOwner` strings, with bounded retries, per-repository outcome records, a heads snapshot, and a stable on-disk layout suitable for `actions/cache`.
- Create `scripts/pipeline/extract.ts`: a streaming `git log` reader that turns that cache into a canonical newest-first `RawEvent[]`, attributing each commit through KW-009's `classify()` / `actorId()` and dropping every commit that classifies to no known actor.
- Export `extractAll` as the stable binding KW-014's `loadStage('./extract.ts', 'extractAll')` resolves, plus the `RawEvent`, `ExtractedEvent`, `RepoExtract` and `ExtractResult` typespecs.
- Guarantee byte-determinism: author date via `%aI`, mailmap disabled, `core.quotePath=false`, `--no-renames`, `--no-merges`, and a total order that never depends on `git log`'s ref topology.
- Implement transient-failure semantics: retry, then preserve the caller's prior events for that repository and report `status: 'stale'` with an incremented `consecutiveFailures`.
- Add `scripts/pipeline/clone.test.ts` and `scripts/pipeline/extract.test.ts`: offline, fixture-driven unit tests covering determinism, attribution, calendar-day derivation and the stale path.

## Non-goals

- Any GitHub API call, any token read, any `@octokit/*` import, any use of `CONTRIB_TOKEN` — that is KW-010's half and GATE-003's problem, never this module's.
- Resolving the in-scope repository set. `scripts/pipeline/discover.ts` (KW-009) owns discovery and its GraphQL transport; this ticket accepts `readonly string[]` of `nameWithOwner`, or `DiscoveryResult.repos` mapped to that.
- Owning the identity allowlist or the e-mail matching rules. `scripts/pipeline/identity.ts` (KW-009) owns `ALLOWLIST`, `NOREPLY_PATTERNS`, `classify` and `actorId`. Never re-implement, never inline, never copy.
- Owning the wire format. `lib/bundle/schema.ts`, `codec.ts` and `frontcode.ts` (KW-012) own `RepoStatus`, `ActorId`, day-index arithmetic, chunking, front coding and the 12 KB dictionary guard.
- Writing, reading or migrating `data/.pipeline-state.json`. `scripts/pipeline/state.ts` (KW-014) owns persistence; this ticket takes prior records as an argument and returns new records as values.
- Encoding, validating, or writing anything under `public/data/v1/`. KW-014.
- Classifying `status: 'gone'` or applying the 7-day drop rule — that needs an API call this module may not make. This ticket emits the counter; KW-014 applies the policy.
- Authoring `.github/workflows/data-bundle.yml`, the `actions/cache` step or the first-byte budget step. KW-028.
- The contribution calendar, the private monthly aggregate and the grid. KW-010.

## Existing owner and reuse target

There is **no existing owner**. At `e664d73a195facd64db58ba10952170ff01b4772` the tree is still the pre-rewrite Next 10 app: `package.json` declares `"name": "with-tailwindcss"` with `next: "latest"` and `react: ^17.0.1`, and there is **no `scripts/`, no `lib/` and no `app/` directory**. Every file in this ticket's write surface is new.

Reuse targets, each created by a named upstream ticket and verified against that ticket's document:

| Target | Created by | Consumed here as |
|---|---|---|
| `scripts/pipeline/identity.ts` → `classify(authorEmail: string \| null \| undefined): ActorLogin \| null` | KW-009 | the sole authority for author-e-mail attribution |
| `scripts/pipeline/identity.ts` → `actorId(login: ActorLogin): ActorId` | KW-009 | converts the login to the `0 \| 1` written into the bundle |
| `scripts/pipeline/identity.ts` → `type ActorLogin`, `type ActorId` | KW-009 | imported types; never redeclared |
| `scripts/pipeline/discover.ts` → `DiscoveryResult.repos[].nameWithOwner` (sorted ascending) | KW-009 | the input list |
| `lib/bundle/schema.ts` → `type RepoStatus = 'ok' \| 'stale' \| 'gone'`, `type IsoDay` | KW-012 | imported types; this ticket only ever emits `'ok'` or `'stale'` |
| `scripts/pipeline/encode.ts` → `RawEvent`, `RepoInput` | KW-014 | the shapes this ticket must satisfy structurally |
| `vitest.config.mts` node project, `include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts']` | KW-011 | collects this ticket's two test files |
| the pre-installed dependency set and the `data:build`, `typecheck`, `lint` script slots | KW-001 (DEC-003) | read, never edited; nothing new is installed |

**While KW-009 is unmerged:** import through one adapter and stub only behind it.

```ts
// scripts/pipeline/extract.ts — the single call site into KW-009.
import { classify, actorId } from './identity.ts';
import type { ActorId } from './identity.ts';

function attribute(authorEmail: string): ActorId | null {
  const login = classify(authorEmail);
  return login === null ? null : actorId(login);
}
```

If `identity.ts` is absent locally, stub `classify`/`actorId` inside `scripts/pipeline/extract.test.ts` with `vi.mock` and leave module scope untouched, so nothing has to be unwound before the PR. **Never ship a second allowlist.** VC-7 recorded that the corpus-building script and the documented allowlist had already drifted apart once — `applekid.mail@proton.me` omitted, a dead `kevin@stitchfix.com` entry retained.

**While KW-012 is unmerged:** `type RepoStatus` and `type IsoDay` are the only imports needed; declare them locally with a one-line `TODO: import from lib/bundle/schema.ts once KW-012 lands` and delete the local copies when it does. No value import from KW-012 is required by this ticket.

## Contract and invariants

This ticket is a **producer** with one consumer: KW-014's `scripts/pipeline/encode.ts`. KW-014 is a *parallel sibling*, not a dependant — it reaches this module through `loadStage('./extract.ts', 'extractAll')`, a guarded dynamic import that exits 3 rather than fabricating data when the module is absent. The binding name `extractAll` is therefore part of the contract and must not be renamed.

### Producer interface sketch — quoted verbatim by KW-014

```ts
// scripts/pipeline/extract.ts
import type { ActorId } from './identity.ts';
import type { RepoStatus } from '../../lib/bundle/schema.ts';

/**
 * One author-attributed file touch. Structurally identical to the `RawEvent`
 * declared in KW-014's scripts/pipeline/encode.ts — that declaration is
 * authoritative for the field set; this module produces it.
 */
export interface RawEvent {
  day: string;    // 'YYYY-MM-DD' — see "Which calendar day" below
  repo: string;   // nameWithOwner, e.g. 'aiur-team/aiur'
  sha: string;    // 40 lowercase hex, sort tiebreak only
  path: string;   // repository-relative path, produced with --no-renames
  actor: ActorId; // 0 = its-everdred (human), 1 = its-applekid (agent)
}

/** RawEvent plus the unreduced author date, so `day` can be re-derived. */
export interface ExtractedEvent extends RawEvent {
  authorDate: string; // git %aI verbatim, e.g. '2026-07-29T17:10:12-07:00'
}

/** Per-repository outcome. Superset of KW-014's RepoInput: n/first/last/private/status. */
export interface RepoExtract {
  n: string;                       // nameWithOwner
  first: string;                   // 'YYYY-MM-DD' oldest attributed day, '' when no events
  last: string;                    // 'YYYY-MM-DD' newest attributed day, '' when no events
  private: false;                  // always false; the corpus is 67 public repos, 0 private
  status: RepoStatus;              // this module emits only 'ok' | 'stale'
  consecutiveFailures: number;     // 0 when 'ok'; prior + 1 when 'stale'
  lastOk: string | null;           // RFC3339 second resolution, or null if never
  heads: Record<string, string>;   // 'refs/heads/<name>' -> 40-hex sha, keys sorted ascending
  events: ExtractedEvent[];        // this repo only, canonical order
  error: string | null;            // trimmed last stderr line; non-null only when 'stale'
}

export interface ExtractResult {
  events: ExtractedEvent[];  // every repo merged, canonical order; this is what KW-014 encodes
  repos: RepoExtract[];      // one entry per requested repo, sorted by `n` ascending, never short
  commitScope: '--all';      // recorded in manifest.json by KW-014
  cloneRoot: string;         // absolute path of the cache this result came from
}

export interface ExtractOptions {
  cloneRoot?: string;
  retries?: number;
  backoffMs?: number;
  exec?: GitExec;
}

/** THE stable binding. KW-014 resolves this name by string. Do not rename. */
export async function extractAll(
  repos: readonly string[],
  prior: readonly RepoExtract[],
  opts?: ExtractOptions,
): Promise<ExtractResult>;

/** THE canonical ordering. Any other ordering is a defect. */
export function compareRawEvents(a: RawEvent, b: RawEvent): number;
```

### Clone-side interface

```ts
// scripts/pipeline/clone.ts

/** Injectable process runner. Tests replace it; production spawns git. */
export type GitExec = (
  args: readonly string[],
  cwd: string | undefined,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface CloneOptions {
  /** Default: process.env.KW_CLONE_ROOT ?? path.join(os.tmpdir(), 'kw-clones-v1'). */
  cloneRoot?: string;
  /** Total attempts, not extra attempts. Default 3. */
  retries?: number;
  /** Default 1000, doubled per attempt: 1 s, 2 s, 4 s. */
  backoffMs?: number;
  exec?: GitExec;
}

export interface CloneOutcome {
  repo: string;                    // nameWithOwner
  dir: string;                     // absolute path of the bare repository
  ok: boolean;
  cached: boolean;                 // true when the directory existed and this run fetched
  heads: Record<string, string>;   // keys sorted ascending; {} when !ok
  attempts: number;
  error: string | null;
}

export function repoDir(repo: string, cloneRoot: string): string;
export async function syncRepo(repo: string, opts?: CloneOptions): Promise<CloneOutcome>;
export async function syncAll(repos: readonly string[], opts?: CloneOptions): Promise<CloneOutcome[]>;
```

### Which calendar day — a cross-ticket contradiction, resolved

KW-012's `lib/bundle/codec.ts` invariant 2 states, explicitly and with reasoning, that an event's day is *"the date component of the author date as written by git (`%aI`) — the author's own local calendar day, never re-projected into UTC, and never the committer date."* KW-014's `RawEvent` comment instead says *"AUTHOR date in UTC."* **These conflict.**

**Resolution for this ticket: follow KW-012.** It is the schema owner and a hard dependency of both this ticket and KW-014, its statement is the more specific and the more reasoned, and KW-014's line is prose in a parallel sibling rather than a contract clause. Therefore:

```ts
const day = authorDate.slice(0, 10);   // authorDate is git %aI, offset intact
```

Concretely, from the live probe: commit `7fe937ca1d8e7a4508f4de0f16752440234ea10b` in `ethereum-optimism/actions` has `%aI` = `2026-07-29T17:10:12-07:00`. Its `day` is **`2026-07-29`** (author-local). Re-projected to UTC it would be `2026-07-30`, a different bucket. The `ExtractedEvent.authorDate` field exists precisely so that re-projection stays possible without a re-clone if the reconciliation later goes the other way. Raise the discrepancy in the PR body so KW-014's comment gets corrected rather than silently diverging.

### Invariants

1. **Zero credentials.** No `fetch`, no `node:https`, no `@octokit/*`, and no read of `GITHUB_TOKEN` / `GH_TOKEN` / `CONTRIB_TOKEN` anywhere in either module. Every `git` child process is spawned with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_SYSTEM=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, and with `GITHUB_TOKEN` and `GH_TOKEN` deleted from the child environment.
2. **Total order.** `compareRawEvents` is a total order over the emitted set: `day` descending, then `repo`, `sha`, `path` ascending. All comparisons use `<` / `>` on raw strings, never `localeCompare`, which is locale-dependent and therefore non-deterministic across machines. `(repo, sha, path)` is unique per event, so the order is total without any timestamp comparison.
3. **Byte-determinism.** Two runs over the same cache produce identical `ExtractResult.events` in identical order. Nothing time-varying enters event data; `lastOk` is the only clock read and it is per-repository state.
4. **No repository ever disappears.** `ExtractResult.repos.length === repos.length` on every call. Failure downgrades a repository to `stale`; it never removes it. History that already happened did happen — a repository vanishing between runs would make the animation rewrite the past between page loads.
5. **Attribution is delegated.** An event is emitted iff `classify(authorEmail) !== null`. Never the committer e-mail: 649 of 3,628 aiur commits (17.9%) are rewritten to `GitHub <noreply@github.com>` by web-UI squash merges. Never the display name: `Kevin A <kevin@example.com>` alone has 427 commits and a `/kevin|weaver/i` matcher misattributes about 555.
6. **Empty is a failure, not a result.** A repository that clones cleanly but yields zero attributable events is legitimate — VC-6 measured 15 of them. A *whole run* yielding zero events or zero repositories is the "GitHub returned an empty 200" class of failure: throw, so KW-014's validator hard-aborts rather than blanking the site.
7. **Sequential.** One repository at a time. VC-1 refuted the cost model that motivated parallelism.
8. **Erasable syntax only.** Both modules must load under Node 24's built-in type stripping: no `enum`, no `namespace`, no parameter properties, no non-`type` re-export of a type. Verified on v24.18.0 — a plain typed module imports cleanly, while an `enum` fails with `TypeScript enum is not supported in strip-only mode`.
9. **No module-scope side effects.** Importing either module must not touch the filesystem, spawn a process or read an environment variable. KW-014 dynamically imports `extract.ts` inside `main()`; an import-time side effect would fire during its unit tests.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify paths and sibling exports at pickup; do not silently change scope.

### Files

| Path | Action |
|---|---|
| `scripts/pipeline/clone.ts` | create |
| `scripts/pipeline/extract.ts` | create |
| `scripts/pipeline/clone.test.ts` | create |
| `scripts/pipeline/extract.test.ts` | create |

Nothing else. Do not touch `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `.gitignore`, `data/`, `public/`, `lib/bundle/**`, `.github/**`, or any other file under `scripts/pipeline/`. Test files are named `*.test.ts` beside their sources — the same convention KW-014 uses — so they match KW-011's node-project glob `scripts/**/*.test.ts` and stay entirely outside KW-009's `scripts/pipeline/__tests__/**` surface.

### Cache layout

```
${cloneRoot}/${owner}__${name}.git      e.g.  ${cloneRoot}/ethereum-optimism__actions.git
```

`cloneRoot` defaults to `path.join(os.tmpdir(), 'kw-clones-v1')`, so a local run leaves **nothing untracked inside the repository** and no `.gitignore` edit is required. KW-028 overrides it with `KW_CLONE_ROOT` and points `actions/cache` at that path — `actions/cache` gives 10 GB per repository with 7-day eviction, and a week of dropped runs costs a ~45 s cold rebuild, which is acceptable. Use `__` as the owner/name joiner: `/` would nest, and a single `_` collides with repository names that contain underscores.

### Exact git invocations

Cold path — directory absent:

```
git clone --filter=blob:none --bare -- https://github.com/<owner>/<name>.git <dir>
```

Warm path — directory present:

```
git -C <dir> fetch --filter=blob:none --prune --prune-tags --tags origin '+refs/heads/*:refs/heads/*'
```

**The refspec is load-bearing and the research doc's version is wrong for a bare cache.** `git clone --bare` sets `remote.origin.url`, `remote.origin.promisor` and `remote.origin.partialclonefilter` but **no `remote.origin.fetch`** — verified with `git config --local --list` on a fresh bare clone. The data-pipeline track's `'+refs/heads/*:refs/remotes/origin/*'` therefore creates a second, parallel ref namespace: measured on `ethereum-optimism/actions`, refs went from `69 refs/heads` to `69 refs/heads` plus `69 refs/remotes`, which inflates the cache and destabilises the heads snapshot. Using `'+refs/heads/*:refs/heads/*'` keeps exactly one namespace across clone and fetch — verified on `its-everdred/kevinweaver-dev`: 4 refs before, 4 refs after.

Heads snapshot, for KW-014's change detection:

```
git -C <dir> for-each-ref --format='%(refname) %(objectname)' refs/heads
```

Extraction — one child process per repository, stdout streamed line by line and never buffered whole (`ethereum/ethereum-org-website` alone has 58,912 commits):

```
git -C <dir> -c core.quotePath=false log \
  --all --no-merges --no-renames --no-mailmap --name-only \
  --pretty=format:'%x01%H%x1f%aI%x1f%ae'
```

Every flag earns its place:

- `--all` — the honest file-touch record. Measured: aiur has 3,593 commits under `--all` versus 1,257 on HEAD alone. This was an open product question; the default is `--all`, surfaced as `ExtractResult.commitScope` so KW-014 records it in `manifest.json`.
- `--no-merges` — merge commits duplicate file touches. On `ethereum-optimism/actions`: 2,984 commits with merges, 2,583 without.
- `--no-renames` — rename detection is heuristic and threshold-dependent; two runs over slightly different history can produce different rename decisions and therefore different paths.
- `--no-mailmap` — **non-obvious and mandatory.** `git log --help` on git 2.55.0 documents mailmap as *"True by default."* In a bare repository `mailmap.blob` defaults to `HEAD:.mailmap`, so a repository that ships a `.mailmap` would (a) rewrite author e-mails out from under `classify()` and (b) force a lazy blob back-fetch over the network from a blobless clone. Both are determinism defects.
- `-c core.quotePath=false` — placed **before** the subcommand. `git -c core.quotePath=false log …` works; `git log -c core.quotePath=false …` fails with `fatal: ambiguous argument 'core.quotePath=false'` because it is parsed as a revision. Without it, non-ASCII paths are emitted C-quoted (`"src/caf\303\251.ts"`). Control characters are still quoted even with it set, so any path line that begins with `"` must be C-unquoted before use.
- `%aI` — author date, strict ISO 8601, offset intact. Do not add `--date=`; do not normalise to UTC (see "Which calendar day").
- `%ae` is the **author** e-mail and `%H` the full sha. `\x01` (`%x01`) separates records and `\x1f` (`%x1f`) separates header fields — neither byte can occur in a path or an e-mail.

### Output shape of that command, measured live

```
\x01 7fe937ca1d8e7a4508f4de0f16752440234ea10b \x1f 2026-07-29T17:10:12-07:00 \x1f kevinweaver2@gmail.com
docs/plans/2026-07-29-001-fix-demo-auth-credential-binding-plan.md
<blank line>
\x01 …next commit…
```

(spaces around the separators are for legibility only; the real bytes are adjacent). Parse rule: a line starting with `\x01` opens a record; a blank line is ignored; every other line is a path belonging to the open record. A commit with no path lines — an empty commit — contributes no events. `--pretty=format:` emits no trailing newline after the final record, so flush the open record at stream end.

### One worked event

The record above, after attribution, is exactly:

```json
{
  "day": "2026-07-29",
  "repo": "ethereum-optimism/actions",
  "sha": "7fe937ca1d8e7a4508f4de0f16752440234ea10b",
  "path": "docs/plans/2026-07-29-001-fix-demo-auth-credential-binding-plan.md",
  "actor": 0,
  "authorDate": "2026-07-29T17:10:12-07:00"
}
```

Feeding a stream of these into KW-014 with `chunkSize: 3` reproduces its `MINI` fixture semantics: repo ids come from `sort(nameWithOwner)`, day index 0 is `windowEnd`, path ids follow first use in the sorted stream.

### The comparator, in full

```ts
export function compareRawEvents(a: RawEvent, b: RawEvent): number {
  if (a.day !== b.day) return a.day < b.day ? 1 : -1;   // DESC: newest day first
  if (a.repo !== b.repo) return a.repo < b.repo ? -1 : 1;
  if (a.sha !== b.sha) return a.sha < b.sha ? -1 : 1;
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}
```

Sort once, at the end of `extractAll`, over the merged array. Never rely on `git log`'s emission order for anything — it varies with ref topology.

### Failure handling, concretely

`syncRepo` retries up to `retries` (default 3 total attempts) with `backoffMs` doubling — 1 s, 2 s, 4 s. On final failure it returns `ok: false` with the trimmed last stderr line. `extractAll` then emits, for that repository:

```ts
{
  n: repo,
  first: priorFor(repo)?.first ?? '',
  last: priorFor(repo)?.last ?? '',
  private: false,
  status: 'stale',
  consecutiveFailures: (priorFor(repo)?.consecutiveFailures ?? 0) + 1,
  lastOk: priorFor(repo)?.lastOk ?? null,
  heads: priorFor(repo)?.heads ?? {},
  events: priorFor(repo)?.events ?? [],
  error: '<trimmed last stderr line>',
}
```

The motivating measurement is live and reproducible: `0xmetropolis/metro-sdk` failed with `unable to access … Connection timed out` in the same session in which `gh api repos/0xmetropolis/metro-sdk` reported `private:false` and `curl -I` returned `HTTP/2 200`. The repository was fine; the network blipped. Dropping it would have erased a repository from the animation for a day.

Verified and important: under anonymous access a **missing or newly-private** repository does **not** produce a clean 404. It produces

```
error: unable to read askpass response from '/bin/false'
fatal: could not read Username for 'https://github.com': terminal prompts disabled
```

— the same non-zero exit class as a transient failure. This module therefore **cannot** distinguish `gone` from `stale` without an API call it is forbidden to make. Emit `stale` plus `consecutiveFailures`; KW-014 owns the 7-day drop rule and any `gone` classification.

A cache directory that exists but has no `remote.origin.url`, or whose `git for-each-ref` fails, is treated as corrupt: delete it and take the cold path.

### Test fixtures — offline, no network

`scripts/pipeline/extract.test.ts` builds its corpus in `fs.mkdtempSync(path.join(os.tmpdir(), 'kw13-'))` and cleans up in `afterAll`:

1. `git init -q -b main <work>`; author each commit with explicit `-c user.email=… -c user.name=…` so no ambient identity is needed.
2. Three commits: one authored `kevinweaver2@gmail.com` (expect `actor: 0`), one `its.applekid@gmail.com` (expect `actor: 1`), one `kevin@example.com` (expect: dropped entirely).
3. Pin one commit's author date with `GIT_AUTHOR_DATE='2026-01-02T20:00:00-08:00'` and assert the emitted `day` is **`2026-01-02`**, not `2026-01-03`. That single assertion is the regression test for the UTC-versus-author-local contradiction resolved above.
4. `git clone --filter=blob:none --bare <work> <dir>` — a local path clone, no network, no credentials.
5. Run `extractAll` twice and assert `JSON.stringify(a.events) === JSON.stringify(b.events)`.

`scripts/pipeline/clone.test.ts` uses the `exec` seam and never spawns git: a fake `GitExec` returns `{ code: 128, stdout: '', stderr: 'fatal: unable to access …: Connection timed out' }` for one repository and success for the others, then asserts `attempts === 3`, the repository is still present in `ExtractResult.repos`, `status === 'stale'`, `consecutiveFailures === prior + 1`, and `events` deep-equal the prior array.

If `vitest.config.mts` (KW-011) is not on the base yet, `npx vitest run scripts/pipeline` works — Vitest's zero-config default `include` already matches `**/*.test.ts`.

### Version pins, verified during authoring

`node@24.x` (`engines.node` set by KW-001; host measured `v24.18.0`), `typescript@5.9.3`, `vitest@4.1.10`, and `git >= 2.26` for `--no-mailmap` (host measured `2.55.0`). All three npm versions resolve on the registry. **No new dependency is added** — DEC-003 freezes `package.json` after KW-001. If something genuinely necessary is missing from the pre-installed set, stop and raise it against KW-001 rather than editing the manifest here.

## Acceptance and verification

### Agent gate

- `npx vitest run scripts/pipeline/clone.test.ts scripts/pipeline/extract.test.ts` is green.
- The determinism test runs `extractAll` twice over the temp-directory fixture clone and asserts the two `events` arrays serialize byte-identically.
- The calendar-day test asserts a commit authored at `2026-01-02T20:00:00-08:00` emits `day === '2026-01-02'`, proving the author-local rule from KW-012's codec invariant 2 rather than a UTC re-projection.
- The attribution test asserts the `kevin@example.com` commit produces zero events while the two allowlisted commits produce their file touches with `actor` 0 and 1 respectively, and that `classify`/`actorId` are the only attribution path.
- The stale test injects a `GitExec` failure for one repository and asserts that repository is still present in `ExtractResult.repos` with `status === 'stale'`, `consecutiveFailures` incremented by one, prior `events` preserved, and `error` non-null.
- `grep -REn 'api\.github\.com|@octokit|graphql|GITHUB_TOKEN|GH_TOKEN|CONTRIB_TOKEN|fetch\(' scripts/pipeline/clone.ts scripts/pipeline/extract.ts` returns no matches.
- `node -e "import('./scripts/pipeline/extract.ts').then(m => console.log(Object.keys(m).sort().join(',')))"` prints the exported symbols and includes `extractAll`, proving erasable-only syntax under Node 24 type stripping and no module-scope side effects.
- `npm run typecheck` and `npm run lint` both exit 0 with no new diagnostics.
- `git status --porcelain` shows changes only under `scripts/pipeline/` and only to the four files in the write surface.

### At-merge gate

- The `ci-ok` aggregated status published by KW-001's `.github/workflows/ci.yml` is green on the exact PR head.
- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green in CI on Node 24.
- The Vitest node project passes across the whole repository on the merged base, proving the two new test files coexist with KW-009's `scripts/pipeline/__tests__/**` and KW-014's `scripts/pipeline/*.test.ts`.
- KW-011's coverage thresholds for `scripts/pipeline/**` still hold; lowering a threshold to pass is a review-blocking change.
- `git diff --name-only origin/main...HEAD` lists only the four files in this ticket's write surface.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. The live 66-repository corpus — about 145 MB, 40–45 s cold, 20–28 s warm — is first exercised end to end by KW-028's initial `workflow_dispatch` run, which owns that evidence.

## Failure, security, migration, and accessibility cases

**Failure.** Four cases are owned here. (1) Transient clone or fetch failure: retry three times with 1/2/4 s backoff, then `status: 'stale'` with prior events preserved and `consecutiveFailures` incremented. (2) A repository that clones cleanly but yields zero attributable events: a legitimate non-error result — VC-6 measured 15 such repositories, and `first`/`last` come back as `''`. (3) A run that yields zero events or zero repositories overall: throw, so KW-014's validator hard-aborts rather than shipping a blank site. (4) A cache directory that is present but corrupt or missing `remote.origin.url`: delete and take the cold path. Explicitly **not** owned: `status: 'gone'`, the 7-day drop rule, GraphQL rate-limit backoff, and bundle promotion — those are KW-014's and KW-010's.

**Security.** The security property here is negative and structural: this module holds no credential and can hold none. `GIT_ASKPASS=/bin/false` with `GIT_TERMINAL_PROMPT=0` means an accidentally private URL fails fast instead of prompting or silently authenticating with ambient credentials. `GIT_CONFIG_GLOBAL=/dev/null` with `GIT_CONFIG_SYSTEM=/dev/null` means no developer's `credential.helper`, no `url.*.insteadOf` rewrite and no local `.mailmap` config can leak into a pipeline run. Every repository in scope is public by construction — the measured discovery set is 67 repositories, 0 private — so no private repository name, path or sha can enter this half of the pipeline; the private surface is an aggregate count in KW-010's half only. Validate every `nameWithOwner` against `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` before interpolating it into a URL or a path, reject anything else, and always pass `--` before the URL so a hostile name cannot be read as a flag.

**Migration.** None. Nothing exists to migrate and the clone cache is derived state that can be deleted and rebuilt in about 45 s. The `${owner}__${name}.git` layout and the `KW_CLONE_ROOT` variable are the compatibility surface KW-028 depends on; changing either later is a coordinated change with that ticket.

**Accessibility.** Not applicable — this ticket ships no user-facing surface. It is a build-time Node module. Accessibility of the data it feeds is owned by KW-025 (canvas regions), KW-029 (the a11y gate and the DEC-011 hidden `<table>` text alternative) and the individual region tickets.

## Surfaces

- Reads: scripts/pipeline/identity.ts, scripts/pipeline/discover.ts, lib/bundle/schema.ts, vitest.config.mts, package.json, tsconfig.json, remote git over anonymous HTTPS
- Writes: scripts/pipeline/clone.ts, scripts/pipeline/extract.ts, scripts/pipeline/clone.test.ts, scripts/pipeline/extract.test.ts
- Contracts: extractAll, RawEvent, ExtractedEvent, RepoExtract, ExtractResult, compareRawEvents, GitExec, the ${cloneRoot}/${owner}__${name}.git cache layout, the KW_CLONE_ROOT environment variable
- Safety: the token-free boundary of the data pipeline — no GitHub API call, no credential read, no private-repository data

## Sibling boundaries and open gates

| Ticket | Owns, and this ticket must not touch |
|---|---|
| KW-009 (hard dependency) | `scripts/pipeline/discover.ts`, `scripts/pipeline/identity.ts`, `scripts/pipeline/__tests__/**`, the allowlist, both noreply forms, `ActorLogin` / `ActorId` |
| KW-012 (hard dependency) | `lib/bundle/schema.ts`, `codec.ts`, `frontcode.ts` — `RepoStatus`, `IsoDay`, day-index arithmetic, chunking, front coding, the 12 KB dictionary guard |
| KW-010 (parallel, wave 2) | `scripts/pipeline/calendar.ts`, `scripts/pipeline/private.ts`, `CONTRIB_TOKEN`, the SAML canary, everything GraphQL |
| KW-014 (parallel, wave 3) | `scripts/pipeline/encode.ts`, `validate.ts`, `state.ts`, `data/.pipeline-state.json`, `public/data/v1/**`, `EncodeInput`, the `gone` classification and the 7-day drop rule |
| KW-015 (parallel, wave 3) | `lib/bundle/loader.ts` — the client-side read path |
| KW-028 (downstream, wave 4) | `.github/workflows/data-bundle.yml`, `scripts/pipeline/budget.ts`, the `actions/cache` step, the 12 KB first-byte budget |
| KW-001 (upstream) | `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, CI — frozen under DEC-003 |
| KW-011 (parallel, wave 2) | `vitest.config.mts` and the three test projects |

Two cross-ticket items to raise in the PR body rather than fix unilaterally: KW-014's `RawEvent.day` comment says "AUTHOR date in UTC" where KW-012's codec invariant 2 says author-local — this ticket follows KW-012 and flags the comment; and if KW-011's merged node-project glob does not collect `scripts/pipeline/*.test.ts` (the researched value, `include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts']`, does), raise a rework note against KW-011 rather than relocating these files.

**Open gates: none block pickup.** GATE-003 — the SSO-authorized `CONTRIB_TOKEN` — blocks KW-010, KW-014 and KW-028, and does **not** block this ticket; that separation is the entire point of DEC-006. GATE-002, the `workflow` scope on the push credential, blocks tickets that write `.github/workflows/**`, and this ticket writes none. If anyone proposes giving this module a token, the answer is no: it would re-introduce the SAML deflation this half exists to avoid.
