# KW-014 — Pipeline D: Scheme D encoder, bundle validator, and pipeline state file

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — three cooperating modules over an already-frozen codec contract: no wire-format design work remains, but the invariant set is broad, the determinism requirement is byte-exact, and the refusal semantics have to be right or a scheduled run can blank the site.

**Risk:** medium — this is the last gate between an upstream fetch that silently returned an empty 200 and a production deploy. An assertion that is too loose ships garbage; one that is too tight wedges the daily run. Contained by the fact that the module makes zero network calls and every failure path is unit-testable from a fixture.

**Phase hint:** 3

**Depends on:** KW-010, KW-012

**Serializes with:** none

**Requirements:** REQ-005, REQ-008, REQ-011

**Decisions:** DEC-006, DEC-007, DEC-008

**Gates:** GATE-003

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

Running the data pipeline writes a complete Scheme D bundle to `public/data/v1/`, and a run that
cannot prove every invariant holds exits non-zero having promoted nothing. Two runs over unchanged
input produce byte-identical output except for `manifest.generatedAt`.

## Context and evidence

The site's entire premise is that every number on the page is measured, not typed. DEC-008 (D-08)
makes that structural: no contribution figure is a literal anywhere in copy, and the payload carries
`generatedAt`, `windowStart`, `windowEnd`, `dayCount` and `repoCountDefinition` so the reader can
always tell what window a number describes. That decision exists because four research tracks
independently reported different totals — 10,001 / 10,006 / 13,360 / 13,147 (C-1) — and a fifth
number, the boot log's repo count, disagreed with all of them (C-20). The tracks were not wrong;
they were reading two different sources.

The root cause is GT-1: the `gh` token has no SAML grant for `ethereum-optimism`, so authenticated
GraphQL under-reports 2025 by 1,252 and 2026 by 2,047 (GT-3). DEC-006 (D-06) therefore splits the
pipeline by auth surface — an anonymous clone half (KW-013, no token, unaffected by SAML per GT-2/GT-6)
and a PAT half (KW-010, needs the SSO-authorized `CONTRIB_TOKEN` of GATE-003 / HG-3). This ticket sits
downstream of both and must never publish numbers produced by a blinded token: **if KW-010's SAML
canary did not pass, nothing is promoted.**

DEC-007 (D-07) fixes the wire format: 1,500-event chunks, one global front-coded path dictionary
numbered in newest-first first-use order and sliced 1:1 with chunks. C-9 corrects two numbers the
original track got wrong and both corrections are load-bearing here:

- The dict-slice split guard is **12 KB gzip**, not 8,192 B. The true worst slice in today's real
  data is chunk 10 at **8,250 B gzip / 1,500 new paths**, which fires the original guard. Expect
  **~31 chunks**, not 30. (The "chunk05, 15,068 B, 2,833 new paths" figure in the data-pipeline
  track is from a CH=3,000 configuration and is arithmetically impossible at CH=1,500 — a
  1,500-event chunk cannot introduce more than 1,500 paths.)
- The corrected first-byte total is `400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B` brotli against a
  12 KB budget. The dictionary is **72.1%** of chunk 00's brotli weight, not 54%; event columns cost
  only ~1.44 B/event gzipped.

C-19 fixes the repo record shape the renderer actually needs. C-8 removes a temptation: do not prune
zero-commit repos — pruning takes the corpus 145 MB → ~124 MB, not → 50 MB, against a 40–45 s cold
clone. GT-7 records why `repoCountDefinition` has to be in the payload at all: `public_repos` = 77,
owner-public-non-fork = 50, member-affiliated = 85, `repositoriesContributedTo` = 22 — four defensible
answers to "how many repos".

Requirements this ticket carries:

- **REQ-005** — Every repository and contribution figure the site displays is derived from measured
  GitHub data at generation time; no figure is a literal in copy or code. This ticket is the module
  that stamps the payload with `generatedAt`, `windowStart`, `windowEnd`, `dayCount` and
  `repoCountDefinition` so a reader can always tell what window a number describes. (DEC-008)
- **REQ-008** — The data pipeline is a deterministic function of its inputs: the same inputs produce
  byte-identical output on every run. This ticket owns the sort order, the id assignment, the
  chunk-split rule and the single permitted time-varying field. (DEC-007)
- **REQ-011** — The pipeline degrades safely: a transient upstream failure never loses history, and a
  run that cannot prove its output is sound publishes nothing rather than publishing a suspect
  bundle. This ticket owns the refusal path and the non-zero exit. (DEC-006)

**Plan context, pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:**

- Pack index: `docs/build-orders/site-rewrite/README.md` (published with this pack)
- Wave and graph analysis: `docs/research/2026-07-31-decomposition-synthesis.md` §6 — waves,
  verified topological levels, critical path, write-surface partition
- Decision registry: `docs/research/2026-07-31-decomposition-synthesis.md` §3 (D-01…D-17) and §4
  (human gates HG-1…HG-7)
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5,
  "Wave 3 — KW-14"
- Track detail: `docs/research/2026-07-31-data-pipeline.md` §1.4 (concrete schema), §7 (determinism
  and state file), §8 (size budget), §9 (failure modes and the concrete validator), and its
  `# Verification corrections` section — **VC-4 and VC-5 override the body of that document.**
- Browsable at
  `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/`

## Scope

- Create `scripts/pipeline/encode.ts` exporting a **pure** `encodeBundle(input: EncodeInput): EncodedBundle` that turns an extracted event stream, repo table and contribution grid into the six Scheme D resource kinds, using KW-012's codec — never a private reimplementation.
- Add the run entry point in the same module: `main(argv)` resolves inputs, writes to a temp directory, validates, and only then promotes atomically to `public/data/v1/`.
- Create `scripts/pipeline/validate.ts` exporting a pure `validateBundle(bundle, prev): ValidationResult` that asserts every encoder, monotonicity, per-repo `status`, sanity-regression and budget invariant listed under "Contract and invariants".
- Implement the DEC-007 dict-slice split guard at 12 KB gzip, including the deterministic re-emit and renumbering that follows a split.
- Create `scripts/pipeline/state.ts` owning `data/.pipeline-state.json` (schema 1): read, merge, write, and a missing-file bootstrap.
- Enforce the refusal rule: never promote a bundle when KW-010's SAML canary did not pass, and never promote when any invariant fails — exit non-zero instead.
- Emit `generatedAt`, `windowStart`, `windowEnd`, `dayCount` and `repoCountDefinition` on `public/data/v1/manifest.json` (DEC-008).
- Add Node-project unit tests co-located as `scripts/pipeline/encode.test.ts`, `scripts/pipeline/validate.test.ts` and `scripts/pipeline/state.test.ts`.

## Non-goals

- Do not reimplement, fork or vendor the codec or the front-coding routines — `lib/bundle/schema.ts`, `lib/bundle/codec.ts` and `lib/bundle/frontcode.ts` are KW-012's exclusive surface.
- Do not make any network call: no GraphQL, no REST, no `fetch`, no `git` subprocess. Discovery and identity are KW-009; the calendar and private aggregate are KW-010; cloning and extraction are KW-013.
- Do not author `.github/workflows/data-bundle.yml`, the `actions/cache` key, the cron schedule or `scripts/pipeline/budget.ts` — all KW-028.
- Do not touch `package.json` or `package-lock.json`; both are frozen after KW-001 (DEC-003).
- Do not implement the client loader, the one-chunk-ahead prefetch or the newest-first iterator — KW-015 owns `lib/bundle/loader.ts`.
- Do not commit generated bundle bytes under `public/data/v1/**` in this pull request; the committed artifact is produced and refreshed by KW-028's scheduled workflow.
- Do not decide the identity allowlist or the repo-count definition; consume `repoCountDefinition` as an input value and emit it verbatim.
- Do not modify `vitest.config.mts` or lower any coverage threshold — KW-011 owns both.

## Existing owner and reuse target

**There is no existing owner in the repository.** At `e664d73a195facd64db58ba10952170ff01b4772` the
tree contains no `scripts/`, no `lib/`, no `app/`, no `data/` and no `public/data/`; `public/` holds
only `favicon.ico`, `images/*` and `vercel.svg`, and `package.json` is still the 2021 scaffold
(`"name": "with-tailwindcss"`, `"next": "latest"`, React 17). Verify with `git ls-files` at pickup.

Every reuse target below is created by a named upstream ticket:

| Target | Created by | Status for this ticket |
|---|---|---|
| `lib/bundle/schema.ts` — the wire types | KW-012 | **hard dependency**, import types only |
| `lib/bundle/codec.ts` — `encode` / `decode` | KW-012 | **hard dependency**, call it, never re-derive |
| `lib/bundle/frontcode.ts` — path-dictionary front coding | KW-012 | **hard dependency**, call it |
| `scripts/pipeline/calendar.ts`, `scripts/pipeline/private.ts` | KW-010 | **hard dependency**, `main()` only |
| `scripts/pipeline/extract.ts`, `scripts/pipeline/clone.ts` | KW-013 | **not** a dependency — see below |
| `scripts/pipeline/discover.ts`, `scripts/pipeline/identity.ts` | KW-009 | **not** a dependency — see below |
| `package.json` scripts (`data:build`, `typecheck`, `lint`), Node 24 pin, `vitest@4.1.10` | KW-001 | frozen; read, never edit |
| `vitest.config.mts` node project (`include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts']`) | KW-011 | not a dependency; tests are named to match this glob |

**KW-013 and KW-009 are deliberately not dependencies.** KW-014 sits beside them in wave 3 so the two
halves of the pipeline can be built in parallel behind KW-012's contract. Therefore
`encodeBundle` and `validateBundle` must be **pure functions over `EncodeInput`**, with no import of
`./extract.ts`, `./discover.ts` or `./identity.ts` anywhere in module scope. `main()` reaches those
stages through a guarded dynamic import so that the module type-checks, unit-tests and merges while
they are still open:

```ts
async function loadStage<T>(specifier: string, binding: string): Promise<T> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(specifier)) as Record<string, unknown>;
  } catch {
    throw new UpstreamUnavailableError(specifier); // -> exit 3, promotes nothing
  }
  const fn = mod[binding];
  if (typeof fn !== 'function') throw new UpstreamUnavailableError(`${specifier}#${binding}`);
  return fn as T;
}
```

Read the real export names out of the merged sibling modules at pickup and adapt the single call
site. **Do not redeclare a sibling's type; import it.** If a sibling module is absent, `main()` must
exit 3 with a one-line message naming the missing specifier — it must never fabricate data, and it
must never fall back to a hardcoded number (DEC-008).

## Contract and invariants

This ticket is the **producer** for three consumers: KW-028 (runs it), KW-030 (measures its output)
and KW-015 (reads its output at runtime). The following sketches are the contract; consumers quote
them verbatim.

### Producer interface — `scripts/pipeline/encode.ts`

```ts
import type {
  BundleManifest, RepoRecord, GridPayload, EventChunk, PathSlice,
} from '../../lib/bundle/schema.ts';   // KW-012 owns these names; import, never redeclare

/** One author-attributed file touch. Produced by KW-013's extractor. */
export interface RawEvent {
  day: string;    // 'YYYY-MM-DD', AUTHOR date in UTC — never committer date
  repo: string;   // nameWithOwner, e.g. 'aiur-team/aiur'
  sha: string;    // 40-hex commit sha, used only as a sort tiebreak
  path: string;   // repository-relative path, produced with --no-renames
  actor: 0 | 1;   // 0 = its-everdred (human), 1 = its-applekid (agent)
}

export interface RepoInput {
  n: string;          // nameWithOwner
  first: string;      // 'YYYY-MM-DD' first attributed event
  last: string;       // 'YYYY-MM-DD' last attributed event
  private: boolean;
  status: 'ok' | 'stale' | 'gone';
}

export interface SamlCanary {
  ok: boolean;        // false => refuse to promote (DEC-006 / GATE-003)
  org: string;        // e.g. 'ethereum-optimism'
  checkedAt: string;  // RFC3339
}

export interface EncodeInput {
  events: readonly RawEvent[];        // any order; encodeBundle sorts canonically
  repos: readonly RepoInput[];
  grid: {
    start: string;                    // oldest day in the contribution window
    e: readonly number[];             // its-everdred daily counts, oldest-first
    a: readonly number[];             // its-applekid daily counts, oldest-first
    p: readonly number[];             // private aggregate, MONTHLY buckets from `start`
    bands: readonly number[];         // log2 lower bounds, 10 levels
  };
  combinedTotal: number;              // sum(e) + sum(a); monotone across runs
  generatedAt: string;                // RFC3339, SECOND resolution, the only time-varying byte
  commit: string;                     // short sha of the repo the generator ran from
  repoCount: number;
  repoCountDefinition: 'ownerPublicNonFork' | 'ownerPublic' | 'includingMemberAffiliations';
  refs: 'all' | 'head';               // '--all' is the default (honest file-touch record)
  chunkSize: number;                  // 1500 (DEC-007)
  dictSliceGuardGzipBytes: number;    // 12288 (DEC-007, corrected by C-9)
  samlCanary: SamlCanary;
  degraded: readonly ('calendar' | 'private' | 'events')[];
}

export interface EncodedFile { path: string; bytes: Uint8Array }   // path is bundle-relative
export interface EncodedBundle { manifest: BundleManifest; files: readonly EncodedFile[] }

export function encodeBundle(input: EncodeInput): EncodedBundle;            // PURE
export function writeBundle(bundle: EncodedBundle, dir: string): Promise<void>;
export function promoteBundle(tempDir: string, targetDir: string): Promise<void>;
export function main(argv?: readonly string[]): Promise<number>;            // resolves to exit code
```

### Producer interface — `scripts/pipeline/validate.ts`

```ts
export type Severity = 'error' | 'warn';
export interface Finding { code: string; severity: Severity; message: string }

export interface ValidationResult {
  ok: boolean;                        // false => promote nothing, exit 1
  findings: readonly Finding[];
  firstByteBrotliBytes: number;       // manifest + repos + grid + ee-00 + pd-00
  maxDictSliceGzipBytes: number;
  chunkCount: number;
  eventCount: number;
}

export function validateBundle(
  bundle: EncodedBundle,
  prev: PipelineState | null,          // null on the very first run
): ValidationResult;
```

`firstByteBrotliBytes` exists so KW-028's `budget.ts` can read one number instead of re-measuring.

### Producer interface — `data/.pipeline-state.json`, schema 1

Exclusively owned by this ticket. Worked instance:

```json
{
  "schema": 1,
  "lastRun": "2026-07-31T06:17:00Z",
  "refs": "all",
  "repoCountDefinition": "ownerPublicNonFork",
  "samlCanary": "ok",
  "combinedTotal": 10006,
  "events": 44923,
  "repos": {
    "aiur-team/aiur": {
      "heads": { "refs/heads/main": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" },
      "events": 25986,
      "lastEventDay": "2026-07-31",
      "status": "ok",
      "lastOk": "2026-07-31T06:17:00Z",
      "consecutiveFailures": 0
    }
  },
  "calendar": { "its-everdred": { "2026": { "etag": null, "total": 4838 } } },
  "private": { "2026-07": 122 },
  "bundleHash": "sha256-3f8c1e2a9b4d6f0a5c7e1b3d9f2a4c6e8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a"
}
```

Migration rule: an absent file bootstraps to `{ "schema": 1, "repos": {} }` with `prev === null`,
which disables the regression checks for that run only. A `schema` value other than `1` is a hard
error naming the expected value — never a silent reset, because a silent reset would disarm the
sanity-regression guard on exactly the run where it matters.

### Manifest — `public/data/v1/manifest.json` (DEC-008 fields are mandatory)

```json
{
  "v": 1,
  "generatedAt": "2026-07-31T06:17:00Z",
  "commit": "e664d73",
  "chunkSize": 1500,
  "chunks": 31,
  "events": 44923,
  "days": ["2026-07-31", "2013-04-15"],
  "windowStart": "2021-01-01",
  "windowEnd": "2026-07-31",
  "dayCount": 2038,
  "repoCount": 58,
  "repoCountDefinition": "ownerPublicNonFork",
  "refs": "all",
  "degraded": [],
  "actors": [
    { "id": 0, "login": "its-everdred", "kind": "human" },
    { "id": 1, "login": "its-applekid", "kind": "agent" }
  ],
  "integrity": { "repos": "sha256-…", "grid": "sha256-…", "ee-00": "sha256-…" }
}
```

`days` is `[newest, oldest]` over the **event stream**. `windowStart` / `windowEnd` / `dayCount`
describe the **contribution grid** window and are what copy reads. They are different spans on
purpose — conflating them is the exact bug DEC-008 exists to prevent (C-1, C-20).

### Determinism invariants (all mandatory)

1. Sort events by `(day DESC, repo ASC, sha ASC, path ASC)`. Never rely on the input order.
2. Repo ids come from `sort(nameWithOwner)`, not discovery order — otherwise adding one repo
   renumbers every chunk.
3. Path ids come from **first-use order within the sorted stream**. Do not sort the dictionary:
   sorting breaks the streaming-slice property that Scheme D depends on (VC-4).
4. Author date, never committer date — rebase and squash-merge rewrite committer date.
5. `generatedAt` at second resolution is the **only** time-varying byte in the whole bundle.
6. JSON is emitted with a fixed key order and a trailing newline, one file per resource, no
   whitespace padding. Two encodes of the same `EncodeInput` are `Buffer.equals`-identical.

### Bundle invariants asserted by `validateBundle`

| Code | Assertion |
|---|---|
| `E_EMPTY` | `repos.length >= 40`, `events >= 40000`, `sum(grid.e) + sum(grid.a) > 0`. This is the "GitHub returned an empty 200" case and the single most dangerous failure. |
| `E_GRID_LEN` | `grid.e.length === grid.a.length === manifest.dayCount`, and `windowEnd` is `windowStart + dayCount - 1`. |
| `E_GRID_MONTHS` | `grid.p.length` equals the month count spanned by `windowStart..windowEnd` (67 for 2021-01…2026-07). |
| `E_CHUNK_COUNT` | `manifest.chunks` equals the number of emitted `events/ee-NN.json` files, and every chunk holds `<= chunkSize` events. |
| `E_COLUMNS` | Per chunk: `d.length === r.length === p.length === a.length`. |
| `E_DELTA` | Per chunk: every `d[i] >= 0` (the stream is sorted, so day index is monotone non-decreasing going back in time). |
| `E_PATH_RANGE` | Per chunk NN: `max(p) < cumulativeDictLength(slices 00..NN)`. |
| `E_REPO_RANGE` | Per chunk: `max(r) < repos.length`; every `a[i]` is `0` or `1`. |
| `E_CHUNK_BASE` | Chunk NN's `b` equals the absolute day index of its first event and is `>=` chunk NN-1's last day index. |
| `E_ROUNDTRIP` | For every chunk and every dict slice, `decode(encode(x))` deep-equals `x`, and re-encoding the decoded value is byte-identical. |
| `E_JSON` | `JSON.parse` succeeds on every emitted file. |
| `E_DICT_GUARD` | No `paths/pd-NN.json` exceeds **12,288 B gzip** (DEC-007, corrected by C-9). |
| `E_FIRST_BYTE` | brotli(`manifest.json` + `repos.json` + `grid.json` + `events/ee-00.json` + `paths/pd-00.json`) `<= 12,288 B`. Measured today: 9,598 B. |
| `E_REGRESSION` | `events >= 0.9 * prev.events` and `combinedTotal >= prev.combinedTotal`. Both are monotone non-decreasing over a fixed window. Skipped when `prev === null`. |
| `E_REPO_STATUS` | Every `repos[].status` is `ok`, `stale` or `gone`; a `stale` repo retains its previous event count rather than dropping to zero. |
| `E_SAML` | `input.samlCanary.ok === true` and `degraded` does not contain `calendar`. Otherwise refuse (DEC-006, GATE-003). |

### Exit codes for `main()`

| Code | Meaning | Promotes? |
|---|---|---|
| `0` | Bundle validated and promoted, **or** a no-op run in which only `manifest.generatedAt` changed | yes |
| `1` | One or more `severity: 'error'` findings | no |
| `2` | SAML canary failed or the calendar is degraded | no |
| `3` | An upstream stage module was unavailable or threw | no |

Transient, contained degradation — one repo timing out, a GraphQL retry succeeding on the second
attempt — is **not** an invariant breach: reuse the cached values, record them in `degraded`, and
exit 0. The synthesis's acceptance line ("exit code non-zero on any invariant breach") governs and
overrides the data-pipeline track's looser §9 phrasing ("exits 0 having changed nothing").

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; if something has
moved, adapt the pointer, do not silently change scope.

### Files

| Path | Action |
|---|---|
| `scripts/pipeline/encode.ts` | create — `encodeBundle`, `writeBundle`, `promoteBundle`, `main` |
| `scripts/pipeline/validate.ts` | create — `validateBundle` and the finding codes above |
| `scripts/pipeline/state.ts` | create — `readState`, `writeState`, `mergeRepoState`, `bootstrapState` |
| `scripts/pipeline/encode.test.ts` | create |
| `scripts/pipeline/validate.test.ts` | create |
| `scripts/pipeline/state.test.ts` | create |
| `data/.pipeline-state.json` | create — committed, schema 1, seeded by the first real run |

Nothing else. In particular `package.json`, `package-lock.json`, `lib/bundle/**`,
`.github/workflows/**` and `vitest.config.mts` must be untouched in the diff.

### Runtime and language level

Node **24.x** is the pin (`engines.node: "24.x"`, `.nvmrc`, both from KW-001; measured locally at
`v24.18.0`). Node 24 executes `.ts` files directly by **type stripping**, with no flag — verified in
this session:

```
$ node z.ts        # z.ts does: import { y } from "./y.ts"
import-ok 42
```

Consequences, all mandatory:

- Write **erasable** TypeScript only: no `enum`, no `namespace`, no parameter properties, no
  `declare` merging. Prefer `const` objects plus `as const` unions.
- Relative imports must carry the explicit `.ts` extension (`import { readState } from './state.ts'`).
- Type-only imports must use `import type` so stripping cannot leave a dangling runtime specifier.
- `node:zlib`'s `gzipSync` and `brotliCompressSync` are built in — verified present on 24.18.0. Use
  them for the guard and budget measurements; add no compression dependency.

`npm run data:build` is pre-declared by KW-001 and `package.json` is frozen (DEC-003). Read the
script at pickup and make `scripts/pipeline/encode.ts` its target. **If `data:build` points at a
different path, stop and record a blocked-dependency finding — do not edit `package.json`.**

### CLI contract

```
node scripts/pipeline/encode.ts \
  [--input <encode-input.json>] \   # bypass upstream stages; read EncodeInput from disk
  [--out <dir>] \                   # default: public/data/v1
  [--state <path>] \                # default: data/.pipeline-state.json
  [--generated-at <rfc3339>] \      # pin the only time-varying field, for determinism proofs
  [--dry-run]                       # validate into a temp dir, never promote
```

`--input` is what makes this ticket independently provable: it lets the whole encoder and validator
run with zero network access and zero dependency on KW-013 being merged.

### Worked fixture — the smallest complete bundle

Use this verbatim in `scripts/pipeline/encode.test.ts`. It is small enough to assert byte strings and
large enough to exercise multi-repo, multi-day, multi-actor and front coding.

```ts
const MINI: RawEvent[] = [
  { day: '2026-07-31', repo: 'aiur-team/aiur',             sha: 'a'.repeat(40), path: 'packages/engine/src/run.ts',       actor: 0 },
  { day: '2026-07-31', repo: 'aiur-team/aiur',             sha: 'b'.repeat(40), path: 'packages/engine/src/bootstrap.ts', actor: 1 },
  { day: '2026-07-30', repo: 'ethereum-optimism/actions',  sha: 'c'.repeat(40), path: 'apps/web/app/page.tsx',            actor: 0 },
];
```

Canonical sort is `(day DESC, repo ASC, sha ASC, path ASC)`, so the stream order is exactly as
written. Repo ids come from `sort(nameWithOwner)`: `aiur-team/aiur` → 0,
`ethereum-optimism/actions` → 1. Day index 0 is `2026-07-31`, day index 1 is `2026-07-30`. Path ids
follow first use: `packages/engine/src/run.ts` → 0, `packages/engine/src/bootstrap.ts` → 1,
`apps/web/app/page.tsx` → 2.

With `chunkSize: 3` the expected emissions are:

```json
// events/ee-00.json
{ "b": 0, "d": [0, 0, 1], "r": [0, 0, 1], "p": [0, 1, 2], "a": [0, 1, 0] }
```

```json
// paths/pd-00.json
{ "from": 0, "n": 3, "fc": "#packages/engine/src/run.ts\n7bootstrap.ts\n#apps/web/app/page.tsx" }
```

The front-code marker is `String.fromCharCode(35 + k)` where `k` is the shared prefix length with the
previous entry: line 1 has `k = 0` → `#` (35); line 2 shares `packages/engine/src/` = 20 chars →
`String.fromCharCode(55)` = `7`; line 3 shares nothing with `packages/engine/src/bootstrap.ts` → `#`.
The decoder is the five-token loop from the data-pipeline track:
`prev = ''; for (line of lines) { k = line.charCodeAt(0) - 35; p = prev.slice(0, k) + line.slice(1); prev = p }`.

**`lib/bundle/frontcode.ts` (KW-012) owns this encoding, including whether `prev` resets at a slice
boundary and how `k` is clamped for very long shared prefixes.** Call it; assert the round trip;
do not reimplement it, and do not "fix" it here if the reset semantics differ from the sketch — that
is a KW-012 conversation.

### The dict-slice split guard

After emitting slice NN, gzip it. If the result exceeds `dictSliceGuardGzipBytes` (12,288), split the
**owning chunk** in half and re-emit from that chunk forward, renumbering subsequent chunks and dict
slices. The split must be deterministic (always the same halving rule) or two runs over the same
input diverge. Expect roughly 31 chunks in today's corpus; today's true worst slice is chunk 10 at
8,250 B gzip / 1,500 new paths, comfortably under the raised guard (C-9 — the original 8,192 B guard
would have fired here, which is why DEC-007 raised it).

Note the accepted tax: brotli resets its window per file, so 30 slices cost 77,354 B brotli against
70,354 B for one blob (~7 KB). This is accepted because first-byte latency dominates.

### Security posture

This module makes **zero** network calls, so it cannot leak a token. Assert that in the test suite
with a grep, and keep it true. `data/.pipeline-state.json` is committed to a public repository:
never write a token, a bearer header, or an ETag that embeds credentials into it.

### Sizing reference (measured, for sanity assertions only — do not hardcode into copy)

| Resource | brotli | gzip |
|---|---|---|
| `manifest.json` | ~400 (est) | ~450 |
| `repos.json` (51 repos, §1.4 fields) | 1,058 | 1,294 |
| `grid.json` (§1.4 fields) | 1,230 | 1,451 |
| `events/ee-00.json` | 1,925 | 2,336 |
| `paths/pd-00.json` | 4,985 | 5,694 |
| **first byte** | **9,598** | — |
| chunk median | ~2,386 gzip (range 1,261–3,067) | |
| full corpus, 30 chunks | 127,565 | 162,005 |

Corpus reference points: 44,923 events, 13,453 unique paths, 51 repos with at least one event, 2,038
grid days, combined total 10,006. These are today's values, not assertions — the validator's floors
are the ones in the invariant table.

## Acceptance and verification

### Agent gate

- `npm run typecheck` and `npm run lint` both exit 0 with no new diagnostics.
- `npx vitest run scripts/pipeline/encode.test.ts scripts/pipeline/validate.test.ts scripts/pipeline/state.test.ts` is green; if `vitest.config.mts` (KW-011) is not on the base yet, `npx vitest run <files>` with Vitest's defaults is an acceptable substitute and the file names already match KW-011's node-project glob `scripts/**/*.test.ts`.
- Determinism: `node scripts/pipeline/encode.ts --input <fixture> --out /tmp/kw014-a --generated-at 2026-07-31T00:00:00Z` and the same command into `/tmp/kw014-b` produce trees for which `diff -r /tmp/kw014-a /tmp/kw014-b` is empty; running twice **without** `--generated-at` leaves `manifest.generatedAt` as the only differing bytes.
- The manifest produced from the fixture carries `generatedAt`, `windowStart`, `windowEnd`, `dayCount` and `repoCountDefinition`, and `dayCount === grid.e.length === grid.a.length`.
- Every negative fixture in `validate.test.ts` — empty corpus, mismatched column lengths, `p` out of dictionary range, `r` out of repo range, a negative `d`, a 0.89x event regression, an oversized dict slice, a first byte over 12,288 B brotli, and `samlCanary.ok === false` — makes `main()` resolve to a non-zero exit code and leave the target directory untouched.
- `grep -nE "octokit|graphql|fetch\(|child_process|execSync|https?://" scripts/pipeline/encode.ts scripts/pipeline/validate.ts scripts/pipeline/state.ts` returns no matches.
- `git status --porcelain` shows no changes under `public/data/`, `package.json`, `package-lock.json`, `lib/bundle/` or `.github/`.

### At-merge gate

- The `ci-ok` aggregated status published by KW-001's `.github/workflows/ci.yml` is green on the exact PR head.
- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green in CI on Node 24.
- The Vitest node project passes in CI and the coverage thresholds KW-011 set for `scripts/pipeline/**` and `lib/bundle/codec` still hold — lowering a threshold to pass is a review-blocking change.
- The pull request diff touches only the seven files in this ticket's write surface.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. GATE-003 (the SSO-authorized `CONTRIB_TOKEN`)
gates the *correctness of real numbers* produced at KW-028 runtime, not the merge of this ticket:
the refusal path is proven from a fixture with `samlCanary.ok === false`.

## Failure, security, migration, and accessibility cases

**Failure.** The twelve failure modes in the data-pipeline track §9 divide into two classes here.
*Contained degradation* — a GraphQL retry that eventually succeeds, one repo failing to fetch
(measured live: `0xmetropolis/metro-sdk` returned `Connection timed out` while the API reported it
public and reachable) — keeps the previous event list, marks that repo `status: "stale"`,
increments `consecutiveFailures`, records the affected area in `manifest.degraded`, and exits 0. A
repo is only dropped after `consecutiveFailures >= 7`; a repo that has gone private or been deleted
is frozen at its last successful state with `status: "gone"` and kept in `repos.json`, because
history that already happened did happen and silently deleting it would make the animation rewrite
the past between page loads. *Invariant breach* — empty result, sanity regression, broken column
geometry, failed round trip, oversized dict slice, blown first-byte budget — promotes nothing and
exits non-zero. The temp-dir-then-promote ordering is what makes both classes safe: a partially
written bundle is never visible to the CDN.

**Security.** `restrictedContributionsCount` is an aggregate; a 67-month sweep requesting
`repository { nameWithOwner isPrivate }` across all four contribution connections leaked **zero**
private repository names even as the repo owner with a repo-scoped PAT — GitHub structurally
refuses. The validator nonetheless asserts that every `repos[].n` came from the discovery set and
that `grid.p` contains only integers, so a future upstream change cannot smuggle a name into the
public bundle. This module performs no network I/O and reads no secret; `CONTRIB_TOKEN` never enters
its process boundary. `data/.pipeline-state.json` is committed to a public repository and must never
contain a credential.

**Migration.** There is no prior bundle and no prior state file, so the first run has `prev === null`
and skips the regression checks. From then on the state file is the migration surface: schema 1 is
the only accepted value, an unknown schema is a hard error with the expected value in the message,
and unknown extra keys are preserved on write so a forward-dated field is not destroyed by an older
run. `public/data/v1/` is versioned in its path — a future wire-format change lands as `v2/` beside
it rather than mutating `v1/`, which keeps a cached client working through a deploy.

**Accessibility.** None apply. This ticket produces no rendered surface, no DOM and no user-facing
copy. The accessible presentation of these numbers is owned by KW-025 (canvas plus the DEC-011 hidden
table), KW-018 (tmux bar), KW-020 (boot overlay) and verified by KW-029's accessibility gate.

## Surfaces

- Reads: lib/bundle/schema.ts, lib/bundle/codec.ts, lib/bundle/frontcode.ts, scripts/pipeline/calendar.ts, scripts/pipeline/private.ts, scripts/pipeline/extract.ts, scripts/pipeline/discover.ts, scripts/pipeline/identity.ts, package.json, tsconfig.json
- Writes: scripts/pipeline/encode.ts, scripts/pipeline/validate.ts, scripts/pipeline/state.ts, scripts/pipeline/encode.test.ts, scripts/pipeline/validate.test.ts, scripts/pipeline/state.test.ts, data/.pipeline-state.json
- Contracts: scripts/pipeline/encode.ts::EncodeInput, scripts/pipeline/encode.ts::encodeBundle, scripts/pipeline/validate.ts::ValidationResult, data/.pipeline-state.json::schema-1
- Safety: public/data/v1/**

## Sibling boundaries and open gates

`scripts/pipeline/**` is shared by four tickets and partitioned by file (DEC-005). Ownership is
exclusive and permanent:

| Ticket | Owns | Relationship |
|---|---|---|
| KW-009 | `scripts/pipeline/discover.ts`, `scripts/pipeline/identity.ts`, `scripts/pipeline/__tests__/**` | parallel in wave 3's upstream; consumed only through `EncodeInput` values |
| KW-010 | `scripts/pipeline/calendar.ts`, `scripts/pipeline/private.ts` | **hard dependency**; supplies the grid series and the SAML canary |
| KW-012 | `lib/bundle/schema.ts`, `lib/bundle/codec.ts`, `lib/bundle/frontcode.ts`, `test/bundle/roundtrip.test.ts` | **hard dependency**; owns every wire type and the codec |
| KW-013 | `scripts/pipeline/clone.ts`, `scripts/pipeline/extract.ts` | **parallel sibling, not a dependency** — reached only through a guarded dynamic import in `main()` |
| KW-015 | `lib/bundle/loader.ts` | parallel sibling; the client reader of this bundle. `public/data/v1/**` must appear in KW-015's *read* surfaces only |
| KW-028 | `.github/workflows/data-bundle.yml`, `scripts/pipeline/budget.ts` | downstream; owns the schedule, the cache, `CONTRIB_TOKEN` wiring and the CI first-byte budget step |
| KW-030 | `.size-limit.json`, `scripts/ci/check-first-load.mjs` | downstream; consumes `ValidationResult.firstByteBrotliBytes` |
| KW-011 | `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts` | owns test infrastructure and coverage thresholds |
| KW-001 | `package.json`, `package-lock.json`, `tsconfig.json`, `.github/workflows/ci.yml` | frozen after wave 1 (DEC-003) |

**Open gate: GATE-003 (HG-3)** — an SSO-authorized PAT with `read:user`, authorized for
`ethereum-optimism`, stored as the repository secret `CONTRIB_TOKEN`. Without it every published
figure is roughly 3,299 low across 2025–26, and `GITHUB_TOKEN` cannot carry a third-party SAML grant
(C-10). The gate does **not** block picking this ticket up or merging it: the whole ticket is
provable from a fixture, and the correct behaviour under a failed canary — refuse, exit 2, promote
nothing — is itself one of the required tests. The gate blocks KW-028 producing true numbers.

`GATE-002` (the `workflow` push scope) does not apply here: this ticket writes nothing under
`.github/workflows/**`.
