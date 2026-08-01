# KW-012 — Bundle schema and codec contract (encode/decode)

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Three new pure TypeScript modules plus a property-style round-trip suite; the encoding scheme, sort order, split guard and byte budgets are already fully specified and measured, but four downstream tickets compile against this contract, so the shape has to be right the first time.

**Risk:** medium — no runtime user impact on its own, but a wrong wire shape forces rework in KW-013, KW-014, KW-015 and every consumer of the decoded event stream. Mitigated by landing it as a contract-only ticket ahead of both the writer and the reader.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-004, REQ-005, REQ-007

**Decisions:** DEC-003, DEC-005, DEC-007, DEC-008

**Gates:** none

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/bundle/` exports one reviewed wire format for the generated activity payload, with a
byte-deterministic encoder and a decoder that share the same type declarations, so the pipeline
writer (KW-014) and the client reader (KW-015) can be built in parallel against a frozen contract
instead of against each other. Running the round-trip suite twice on the same fixture produces the
same bytes both times, and no path-dictionary slice exceeds 12 KB gzip.

## Context and evidence

The site's entire point is replaying five years of file-touch history newest-first. That data has to
arrive as static JSON under `public/data/v1/`, and the shape of that JSON is consumed by four
separate tickets in two different waves. Landing the shape as its own contract ticket is one of the
three deliberate re-partitions that shortened the critical path (see the synthesis, section 6,
"How the path was shortened", item 2): without it, KW-014 and KW-015 serialize.

Evidence this ticket transcribes, all pinned to `e664d73a195facd64db58ba10952170ff01b4772`:

- **DEC-007 (synthesis D-07) — Scheme D.** 1,500-event chunks; **one global** path dictionary
  numbered in newest-first first-use order and sliced 1:1 with the event chunks. Measured
  alternatives: monolithic 156,096 B gzip first byte; calendar-year chunks 103,342 B; per-repo
  chunks 83,729 B; Scheme D **8,030 B gzip / 6,910 B brotli**. Self-contained per-chunk
  dictionaries inflate the total 1.40–1.50x because paths recur across chunks. Source:
  `docs/research/2026-07-31-data-pipeline.md` sections 1.2 and 1.3.
- **C-9 — the chunking numbers were wrong twice, and the verifier wins.** The corrected first-byte
  total is `400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B` brotli, not 9,324. The true worst dict
  slice is **chunk 10 at 8,250 B gzip**, not "chunk 05 at 15,068 B" (that figure was transplanted
  from a `CH=3000` run and is arithmetically impossible at `CH=1500`, where a chunk cannot introduce
  more than 1,500 new paths). 8,250 > 8,192, so the original 8 KB split guard **fires on real data
  today**. DEC-007 therefore raises the guard to **12 KB gzip** and keeps the CI first-byte budget at
  **12 KB brotli**. Expect roughly 31 chunks, not 30. Source: `2026-07-31-data-pipeline.md`,
  "Verification corrections", VC-4 and VC-5 — these corrections override that document's own
  sections 1.3 and 8.
- **The path dictionary is the whole cost.** 4,985 / 6,910 = **72.1 %** of chunk 00's brotli weight
  is the dictionary (not 54 %, VC-5). Event columns cost **1.44 B/event gzipped** and are already at
  the floor — do not micro-optimize them. Front-coding the dictionary in first-use order takes it
  from 678,477 B raw to **262,437 B raw / 75,082 B gzip** for about fifteen lines of decoder. The
  "705 KB to 225 KB / 70,252 B gzip" figure in section 1.3 was measured against a **sorted**
  dictionary; Scheme D mandates first-use order and cannot sort, so budget 262 KB raw (VC-4).
- **DEC-008 (synthesis D-08) — no contribution figure is a literal anywhere in copy.** Every number
  on the site reads from this payload, and the payload carries `generatedAt`, `windowStart`,
  `windowEnd`, `dayCount` and `repoCountDefinition` so the window and the counting definition travel
  with the numbers. This retires C-1 (four mutually inconsistent contribution totals) and C-20 ("58
  public repos", reproducible under no definition — GT-7 measured 77 / 77 / 50 / 85 / 22).
- **C-19 — the design comp's repo array is mock data.** The comp labels it
  `/* mock data, shaped to the real distributions */`; 18 of its 19 repo ids actually resolve. The
  fabrication is in the `vol`/`f`/`t` fields, not the ids. Resolution: the data track owns the repo
  array and emits `{id, short, actor, vol, stars, from, to, private, ext[]}` — that is the decoded
  `RepoRecord` shape below.
- **Determinism requirements** (`2026-07-31-data-pipeline.md` section 7): sort by
  `(authorDate DESC, repoName ASC, commitSha ASC, path ASC)`; repo ids from `sort(nameWithOwner)`,
  never discovery order; path ids from first-use order within the sorted stream; **author date, not
  committer date** (rebase and squash-merge rewrite committer date); `--no-renames` (rename detection
  is heuristic and threshold-dependent); `generatedAt` at second resolution is the only time-varying
  field.
- **Zero private-repo leakage** (`2026-07-31-data-pipeline.md` section 4). A 67-month sweep
  requesting `repository { nameWithOwner isPrivate }` on all four contribution connections leaked
  **no** private repo names, even as repo owner with a repo-scoped token. The private aggregate is a
  monthly integer array and nothing else. That property has to be structural in the schema, not a
  convention.
- **DEC-003 (synthesis D-03)** freezes `package.json` and `package-lock.json` after KW-001. This
  ticket installs nothing.
- **DEC-005 (synthesis D-05)** gives every same-wave ticket a disjoint write surface and zero
  `serializes_with` pairs. `lib/bundle/**` is split between KW-012 (schema, codec, frontcode) and
  KW-015 (loader) on disjoint files.

Plan-context navigation, all paths relative to this repository at the approved planning commit that
carries this document:

| What | Where |
|---|---|
| Pack index and the KW-01..KW-32 to KW-001..KW-032 mapping | `docs/build-orders/site-rewrite/README.md` |
| Wave diagram, verified topological levels, critical path, write-surface partition | `docs/research/2026-07-31-decomposition-synthesis.md` section 6 |
| Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007) | `docs/research/2026-07-31-decomposition-synthesis.md` sections 3 and 4 |
| This ticket's implementation pointers, verbatim | `docs/research/2026-07-31-decomposition-synthesis.md` section 5, "Wave 2", entry KW-12 |
| Measured wire format, chunking table, size budget, failure modes | `docs/research/2026-07-31-data-pipeline.md` sections 1, 7, 8, 9 |
| Verifier corrections that override that document | `docs/research/2026-07-31-data-pipeline.md`, "Verification corrections", VC-4 and VC-5 |
| Machine-checked planning contract this document satisfies | `docs/build-orders/site-rewrite/AUTHORING-CONTRACT.md` |

Browsable at
`https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research`
for the research documents, which are tracked at that commit.

## Scope

- Create `lib/bundle/schema.ts`: the wire types, the decoded domain types, the file-name helpers and
  the shared constants (`DEFAULT_CHUNK_SIZE`, `MAX_DICT_SLICE_GZIP_BYTES`,
  `FIRST_BYTE_BROTLI_BUDGET_BYTES`, `BAND_COUNT`, `DATA_ROOT`).
- Create `lib/bundle/frontcode.ts`: `frontCode` and `frontDecode` for the path dictionary, with the
  `chr(35 + sharedPrefixLen)` marker and the 90-character prefix cap.
- Create `lib/bundle/codec.ts`: `encodeBundle` (domain to wire, byte-deterministic) and
  `decodeBundle` plus the per-file decoders `decodeManifest`, `decodeRepos`, `decodeGrid`,
  `decodeChunk`, `decodeDictSlice` and `expandChunk` that KW-015 needs for incremental loading.
- Implement the canonical event sort `compareEvents` and the day-index helpers `dayIndex` /
  `dayFromIndex` inside the codec, so writer and reader cannot disagree about ordering or about
  which day is day 0.
- Implement the 12 KB gzip dict-slice split guard as a pure, deterministic chunk bisection driven by
  an injected `gzipSize` callback, so the codec stays free of Node built-ins.
- Create `test/bundle/roundtrip.test.ts`: round-trip equality, byte-identical repeat encoding, the
  dict-slice guard on a synthetic worst case, front-coding properties, and a static assertion that
  the three modules import no Node built-ins and touch no DOM.
- Export every type both KW-014 and KW-015 import, from one module, with no duplicate declarations.

## Non-goals

- Do not fetch anything, from GitHub or anywhere else. This ticket has no network access, no token,
  and no `@octokit/*` import; KW-009, KW-010 and KW-013 own acquisition.
- Do not write `public/data/v1/**`, `data/.pipeline-state.json`, or any file under
  `scripts/pipeline/**` — KW-014 owns emission, validation and the state file, and consumes this
  codec directly rather than reimplementing it.
- Do not write `lib/bundle/loader.ts`, prefetch policy, or any fetch/abort logic — KW-015 owns the
  client loader.
- Do not modify `package.json` or `package-lock.json`; DEC-003 freezes both after KW-001. If a
  dependency genuinely seems required, the correct move is to record it as a deferred finding, not
  to add it.
- Do not create or modify `vitest.config.mts`, `test/setup.dom.ts` or `test/canvas-recorder.ts` —
  KW-011 owns all three.
- Do not define the contribution ramp or the ten band boundaries; KW-007 owns
  `lib/viz/tokens/**`. This ticket types the `bands` slot and asserts its length, nothing more.
- Do not define simulation state, cursors or the RNG; KW-008 owns `lib/viz/sim/**`.
- Do not add brotli or gzip calls, `node:zlib`, `node:fs`, `node:crypto` or any other built-in to
  the three `lib/bundle/*.ts` modules. Compression and hashing enter through injected callbacks so
  the same modules run in the browser.

## Existing owner and reuse target

There is no existing owner. At `e664d73a195facd64db58ba10952170ff01b4772` the repository has no
`lib/`, no `test/`, no `scripts/` and no `tsconfig.json` — verified with
`git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772`, which returns exactly 49
paths: 23 under `docs/`, 8 at the repository root, 7 under `public/`, 4 under `.aiur/`, 3 under
`components/`, 3 under `pages/` and 1 under `styles/`. This ticket is greenfield inside a tree that
KW-001 has already re-scaffolded.

What is inherited from **KW-001** (the only dependency) and must not be re-created here:

- `tsconfig.json`, plus `next.config.ts`, `eslint.config.mjs`, `.prettierrc` and `.nvmrc`. Whatever
  path aliases KW-001 configures are irrelevant here: the three modules in this ticket import each
  other with relative specifiers (`./schema`, `./frontcode`) and import nothing else.
- `package.json` pinned to `typescript@5.9.3`, `eslint@9.39.5`, `next@16.2.12`, `react@19.2.8` and
  pre-installing the full downstream set including `vitest@4.1.10` and `fast-check@4.9.0`
  (all five versions confirmed to exist on the registry with `npm view <pkg>@<version> version`).
- Pre-declared npm scripts: `dev build start lint format typecheck typegen test:unit test:e2e
  data:build size`. Use `npm run typecheck` and `npm run lint`; do not add scripts.
- `.github/workflows/ci.yml` publishing the `ci-ok` status.

**If KW-001 is not yet merged when this ticket is picked up**, branch from `main` anyway and check
for `tsconfig.json`. If it is absent, stop and re-queue: this ticket cannot compile without it, and
recreating it would collide head-on with KW-001's write surface.

The reference implementation for the front-coding and the columnar layout is prose plus measured
numbers in `docs/research/2026-07-31-data-pipeline.md` section 1.4. There is no code to copy from;
the worked fixture below is the executable specification.

## Contract and invariants

This section is the producer contract. KW-013, KW-014, KW-015 and the renderer tickets quote it
verbatim; nothing downstream may redeclare these types.

### `lib/bundle/schema.ts`

```ts
export const BUNDLE_VERSION = 1 as const;
export const DEFAULT_CHUNK_SIZE = 1500;                  // DEC-007
export const MAX_DICT_SLICE_GZIP_BYTES = 12288;          // DEC-007 / C-9: 12 KB, not 8192
export const FIRST_BYTE_BROTLI_BUDGET_BYTES = 12288;     // measured today: 9598
export const BAND_COUNT = 10;                            // values owned by KW-007
export const DATA_ROOT = 'public/data/v1';

export type ActorId = 0 | 1;
export type ActorKind = 'human' | 'agent';
export type RepoStatus = 'ok' | 'stale' | 'gone';
export type RepoCountDefinition =
  | 'publicRepos'                // GT-7: 77
  | 'ownerPublic'                // GT-7: 77
  | 'ownerPublicNonFork'         // GT-7: 50 + 8 = 58, the DEC-008 recommendation
  | 'withMemberAffiliations'     // GT-7: 85
  | 'repositoriesContributedTo'; // GT-7: 22

export type IsoDay = string;     // 'YYYY-MM-DD'
export type IsoMonth = string;   // 'YYYY-MM'
export type IsoSecond = string;  // 'YYYY-MM-DDTHH:MM:SSZ', second resolution, always 'Z'

export interface Actor { id: ActorId; login: string; kind: ActorKind }

/** Everything DEC-008 requires to travel with the numbers. */
export interface BundleMeta {
  v: typeof BUNDLE_VERSION;
  generatedAt: IsoSecond;          // the ONLY time-varying field in the whole bundle
  commit: string;                  // repository sha the generator ran from
  windowStart: IsoDay;             // oldest day in the window
  windowEnd: IsoDay;               // newest day in the window; this is day index 0
  dayCount: number;                // inclusive: dayIndex(windowStart, windowEnd) + 1
  repoCount: number;
  repoCountDefinition: RepoCountDefinition;
  actors: readonly Actor[];        // index === ActorId
  degraded: readonly string[];     // e.g. ['calendar'] when a source fell back to cache
}

export interface Manifest extends BundleMeta {
  chunkSize: number;
  chunks: number;
  events: number;
  integrity: Readonly<Record<string, string>>;  // {} when no sha256 callback is supplied
}

/** Wire form written to repos.json. Short keys: this file is in the first byte. */
export interface RepoWire {
  i: number;                 // dense id; equals the array index; the `r` column resolves through it
  g: number;                 // numeric GitHub repo id — rename-proof key (failure mode 5)
  n: string;                 // nameWithOwner
  a: ActorId;                // dominant actor
  e: number;                 // attributable event volume
  s: number;                 // stargazer count
  f: IsoDay;                 // first attributable author day
  l: IsoDay;                 // last attributable author day
  x: readonly string[];      // distinct file extensions, sorted ascending, capped at 8
  z: RepoStatus;
}

/** Decoded form. This is the C-19 renderer shape; `short` and `private` are derived. */
export interface RepoRecord {
  id: number;
  ghId: number;
  name: string;
  short: string;             // name.slice(name.indexOf('/') + 1)
  actor: ActorId;
  vol: number;
  stars: number;
  from: IsoDay;
  to: IsoDay;
  private: false;            // always false — see the leakage invariant below
  ext: readonly string[];
  status: RepoStatus;
}

/** grid.json. NOTE the axis flip: grid arrays run FORWARD in time from `start`. */
export interface GridSeries {
  start: IsoDay;                       // OLDEST day — NOT windowEnd
  dayCount: number;                    // must equal BundleMeta.dayCount
  human: readonly number[];            // actors[0] daily contributionCount, length dayCount
  agent: readonly number[];            // actors[1] daily contributionCount, length dayCount
  privateMonthly: readonly number[];   // restrictedContributionsCount, MONTHLY buckets
  privateStart: IsoMonth;              // e.g. '2021-01'
  bands: readonly number[];            // length BAND_COUNT; values owned by KW-007
}

/** One decoded event. `sha` and `repoName` are sort keys only and are never emitted. */
export interface BundleEvent {
  day: number;      // day index; 0 === windowEnd, increasing into the past
  repo: number;     // RepoRecord.id
  path: string;
  actor: ActorId;
}

export interface SortableEvent extends BundleEvent {
  path: string;
  repoName: string; // nameWithOwner, for the tie-break
  sha: string;      // commit sha, for the tie-break
}

/** events/ee-NN.json */
export interface ChunkWire {
  b: number;               // day index of this chunk's first event
  d: readonly number[];    // d[0] === 0; d[i] = day[i] - day[i-1], always >= 0
  r: readonly number[];    // repo id
  p: readonly number[];    // GLOBAL path id, strictly < cumulative dict length through slice NN
  a: readonly ActorId[];
}

/** paths/pd-NN.json */
export interface DictSliceWire {
  from: number;   // global id of this slice's first path
  n: number;      // number of paths in this slice
  fc: string;     // front-coded, newline-joined
}

export function chunkFileName(index: number): string;  // 'events/ee-00.json'
export function dictFileName(index: number): string;   // 'paths/pd-00.json'
```

`chunkFileName` and `dictFileName` use `String(index).padStart(2, '0')`, so indices widen naturally
past 99 and are stable for the roughly 31 chunks expected today.

### `lib/bundle/frontcode.ts`

```ts
export const FRONTCODE_BASE = 35;        // '#'
export const FRONTCODE_MAX_PREFIX = 90;  // marker range 35..125, i.e. '#'..'}'

export function frontCode(paths: readonly string[]): string;
export function frontDecode(encoded: string): string[];
```

Encoding rule, per entry: `k = length of the common prefix with the previous entry, capped at
FRONTCODE_MAX_PREFIX`; emit `String.fromCharCode(FRONTCODE_BASE + k) + path.slice(k)`; join with
`'\n'`. Decoding: `k = line.charCodeAt(0) - FRONTCODE_BASE; path = prev.slice(0, k) + line.slice(1)`.

Invariants:

- `prev` **resets to `''` at every slice boundary**, so each `pd-NN.json` is independently decodable
  and the decoder needs no cross-file state. The cost is one full path string per slice instead of a
  suffix — about 40 B raw times roughly 31 slices — which is negligible against the ~7 KB brotli
  window-reset tax that chunking already incurs and that DEC-007 accepted.
- `frontCode` throws on an empty path and on any path containing `'\n'`.
- The marker byte is always in 35..125, so it is never `'\n'` (10) and never `'"'` (34). It **can**
  be `'\\'` (92, at `k === 57`). `JSON.stringify` escapes that correctly; a hand-rolled parser would
  not. Always serialize with `JSON.stringify`.
- `frontDecode('')` returns `[]`. `frontDecode(frontCode(xs))` deep-equals `xs` for every `xs`.

### `lib/bundle/codec.ts`

```ts
export interface BundleInput {
  meta: BundleMeta;
  repos: readonly RepoRecord[];       // ids must be dense 0..n-1 and ordered by `name` ascending
  grid: GridSeries;
  events: readonly SortableEvent[];   // any order; encodeBundle applies the canonical sort
}

export interface EncodeOptions {
  chunkSize?: number;                            // default DEFAULT_CHUNK_SIZE
  gzipSize?: (text: string) => number;           // enables the split guard; omit to skip it
  maxDictSliceGzipBytes?: number;                // default MAX_DICT_SLICE_GZIP_BYTES
  sha256?: (text: string) => string;             // enables Manifest.integrity; omit for {}
}

export interface EncodedBundle {
  files: ReadonlyMap<string, string>;            // keys relative to DATA_ROOT, e.g. 'events/ee-00.json'
  chunkCount: number;
  eventCount: number;
  dictLength: number;
  dictSliceGzipBytes: readonly number[] | null;  // null when gzipSize was not supplied
}

export interface DecodedBundle {
  manifest: Manifest;
  repos: RepoRecord[];
  grid: GridSeries;
  paths: string[];        // the flattened global dictionary
  events: BundleEvent[];  // newest-first, chunk order preserved
}

export function encodeBundle(input: BundleInput, options?: EncodeOptions): EncodedBundle;
export function decodeBundle(files: ReadonlyMap<string, string>): DecodedBundle;

// Incremental decoders — KW-015 fetches these files one at a time and must not need the whole map.
export function decodeManifest(text: string): Manifest;
export function decodeRepos(text: string): RepoRecord[];
export function decodeGrid(text: string): GridSeries;
export function decodeChunk(text: string): ChunkWire;
export function decodeDictSlice(text: string): { from: number; paths: string[] };
export function expandChunk(chunk: ChunkWire, paths: readonly string[]): BundleEvent[];

// Ordering and calendar helpers — one implementation, shared by writer and reader.
export function compareEvents(a: SortableEvent, b: SortableEvent): number;
export function dayIndex(day: IsoDay, windowEnd: IsoDay): number;
export function dayFromIndex(index: number, windowEnd: IsoDay): IsoDay;
```

Invariants the encoder enforces by throwing (never by silently correcting):

1. **Canonical order.** `compareEvents` sorts by `day` ascending — which is `authorDate`
   **descending**, because day 0 is `windowEnd` — then `repoName` ascending, then `sha` ascending,
   then `path` ascending. All string comparisons use `<`/`>` on the raw strings, never
   `localeCompare` (locale-dependent, therefore non-deterministic across machines).
2. **Day identity.** An event's day is the **date component of the author date as written by git**
   (`%aI`, e.g. `2023-02-02T14:01:14-08:00` yields `2023-02-02`) — the author's own local calendar
   day, never re-projected into UTC, and never the committer date. `dayIndex` is pure calendar
   arithmetic on two `YYYY-MM-DD` strings:
   `Math.round((Date.parse(windowEnd + 'T00:00:00Z') - Date.parse(day + 'T00:00:00Z')) / 86400000)`.
3. **Window containment.** `0 <= dayIndex(e) <= meta.dayCount - 1` for every event, and
   `meta.dayCount === dayIndex(meta.windowStart, meta.windowEnd) + 1`.
4. **Repo ids.** `repos[i].id === i`, and `repos` is sorted ascending by `name`. Ids come from
   `sort(nameWithOwner)`, never discovery order, so adding one repo does not renumber every chunk.
5. **Path ids.** Assigned in first-use order **within the sorted event stream**. Chunk `k` may only
   reference ids strictly below the cumulative dictionary length through slice `k`. A visitor who
   watches twenty seconds downloads slices 0..2 and nothing more.
6. **Delta monotonicity.** `d[0] === 0` and `d[i] >= 0` for every chunk; `b` is the day index of the
   chunk's first event; `day[i] = b + sum(d[0..i])`.
7. **Column agreement.** `d`, `r`, `p`, `a` are equal-length within a chunk;
   `max(r) < repos.length`; `max(p) < cumulative dict length`.
8. **Band slot.** `grid.bands.length === BAND_COUNT`. The encoder never supplies band values.
9. **Grid lengths.** `grid.human.length === grid.agent.length === grid.dayCount === meta.dayCount`.
10. **No private repo may appear by name.** `encodeBundle` throws if any `RepoRecord.private` is
    `true`. Private activity is representable **only** as `grid.privateMonthly` — a monthly integer
    array with no repo name, no path, no branch, no commit message, no day and no actor.
11. **Byte determinism.** Every emitted file is `JSON.stringify(value)` with no spacing argument and
    no trailing newline, and every object literal is constructed with its keys in the order declared
    above. Two `encodeBundle` calls on the same input produce byte-identical maps. The only field
    that may differ between runs on unchanged data is `manifest.generatedAt`.
12. **Split guard.** When `gzipSize` is supplied, a chunk whose `pd-NN.json` text exceeds
    `maxDictSliceGzipBytes` is bisected — its event range is split in half and both halves are
    re-encoded, recursively, with a floor of one event per chunk. Splitting changes slice boundaries
    but never the global path-id order, so ids are stable. When `gzipSize` is absent the guard is
    skipped and `dictSliceGzipBytes` is `null`; **KW-014 must supply it**.

Round-trip semantics, stated precisely because the test asserts exactly this:

```
const enc = encodeBundle(input, opts);
const out = decodeBundle(enc.files);

out.events   deep-equals  [...input.events].sort(compareEvents)
                            .map(({ day, repo, path, actor }) => ({ day, repo, path, actor }))
out.repos    deep-equals  input.repos
out.grid     deep-equals  input.grid
out.manifest contains every key of input.meta with the same value
```

`sha` and `repoName` are sort keys only; they are deliberately not emitted and therefore not
recovered. Every consumer that needs a commit sha must get it from somewhere other than this bundle.

### Consumer notes

- **KW-014** imports `encodeBundle`, `compareEvents`, `dayIndex`, `chunkFileName`, `dictFileName`,
  `MAX_DICT_SLICE_GZIP_BYTES` and every type above. It supplies
  `gzipSize: (t) => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length` and a `sha256`
  callback from `node:crypto`. It must not reimplement any of it.
- **KW-015** imports only `decodeManifest`, `decodeRepos`, `decodeGrid`, `decodeChunk`,
  `decodeDictSlice`, `expandChunk`, `chunkFileName`, `dictFileName` and the types. Because
  `lib/bundle/codec.ts` has no Node built-in imports, this is safe to bundle for the browser. The
  first-byte fetch set is exactly five files: `manifest.json`, `repos.json`, `grid.json`,
  `events/ee-00.json`, `paths/pd-00.json`.
- **KW-013** imports `SortableEvent` and `compareEvents` so its extractor emits records that already
  satisfy invariant 1.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`; re-verify at pickup and report
drift rather than silently changing scope.

### Files to create — and nothing else

| Path | Contents |
|---|---|
| `lib/bundle/schema.ts` | Constants, wire types, domain types, `chunkFileName`, `dictFileName`. Types and pure name helpers only; no logic. |
| `lib/bundle/frontcode.ts` | `FRONTCODE_BASE`, `FRONTCODE_MAX_PREFIX`, `frontCode`, `frontDecode`. |
| `lib/bundle/codec.ts` | `encodeBundle`, `decodeBundle`, the six incremental decoders, `compareEvents`, `dayIndex`, `dayFromIndex`. Imports only from `./schema` and `./frontcode`. |
| `test/bundle/roundtrip.test.ts` | The suite described under "Acceptance and verification". |

No other file may be touched. In particular: `package.json`, `package-lock.json`, `tsconfig.json`,
`vitest.config.mts`, anything under `scripts/`, `app/`, `styles/`, `public/` or `.github/`.

### Worked fixture — executable specification

This is a real, verified encode. `chunkSize` is 3 so the fixture produces two chunks; the shipped
default is 1,500. Reproduce the numbers exactly or the implementation is wrong.

Input, deliberately supplied out of order to prove the encoder sorts:

```
windowEnd   = '2026-07-31'
windowStart = '2026-07-28'
dayCount    = 4

repos (sorted by name, ids dense from 0):
  0  aiur-team/aiur
  1  its-everdred/kevinweaver-dev

events (authorDay, repoName, sha, path, actor):
  2026-07-31  aiur-team/aiur                a1  packages/engine/src/run.ts        1
  2026-07-31  aiur-team/aiur                a2  packages/engine/src/bootstrap.ts  1
  2026-07-30  its-everdred/kevinweaver-dev  b1  app/page.tsx                      0
  2026-07-28  aiur-team/aiur                c1  packages/engine/src/run.ts        0
  2026-07-28  its-everdred/kevinweaver-dev  c2  app/layout.tsx                    0
```

After `compareEvents`, day indices are `0, 0, 1, 3, 3` and the global dictionary, in first-use
order, is:

```
0  packages/engine/src/run.ts
1  packages/engine/src/bootstrap.ts
2  app/page.tsx
3  app/layout.tsx
```

Emitted files, byte-exact:

```
events/ee-00.json  {"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[1,1,0]}
events/ee-01.json  {"b":3,"d":[0,0],"r":[0,1],"p":[0,3],"a":[0,0]}
paths/pd-00.json   {"from":0,"n":3,"fc":"#packages/engine/src/run.ts\n7bootstrap.ts\n#app/page.tsx"}
paths/pd-01.json   {"from":3,"n":1,"fc":"#app/layout.tsx"}
```

Front-coding walk-through for `pd-00.json`, with `prev` reset to `''` at the slice boundary:

- `packages/engine/src/run.ts` shares 0 characters with `''`, so the marker is
  `String.fromCharCode(35)` = `'#'` and the whole path follows.
- `packages/engine/src/bootstrap.ts` shares the 20-character prefix `packages/engine/src/`, so the
  marker is `String.fromCharCode(55)` = `'7'` and only `bootstrap.ts` follows.
- `app/page.tsx` shares 0 characters with the previous entry, so the marker is `'#'` again.

`pd-01.json` starts a new slice, so `app/layout.tsx` gets marker `'#'` and its full text even though
it shares `app/` with `app/page.tsx` in the previous slice. That is invariant 1 of `frontcode.ts`
working as designed.

Measured with `zlib.gzipSync(..., { level: 9 })`: `pd-00.json` is 95 B, `pd-01.json` is 59 B — both
far below the 12,288 B guard, as a two-path fixture should be.

Note in `ee-01.json` that `p` contains `0`, a path first seen in chunk 00. This is the whole point of
Scheme D: the dictionary is global, so recurring paths cost one integer instead of a repeated string.

### Production shape, for scale calibration

```jsonc
// manifest.json
{"v":1,"generatedAt":"2026-07-31T16:39:00Z","commit":"e664d73",
 "windowStart":"2021-01-01","windowEnd":"2026-07-31","dayCount":2038,
 "repoCount":58,"repoCountDefinition":"ownerPublicNonFork",
 "actors":[{"id":0,"login":"its-everdred","kind":"human"},
           {"id":1,"login":"its-applekid","kind":"agent"}],
 "degraded":[],"chunkSize":1500,"chunks":31,"events":44886,
 "integrity":{"repos.json":"…","grid.json":"…","events/ee-00.json":"…"}}

// repos.json — one entry per repo, ordered by `n`
// `g` and `s` below are the live GitHub repo id and star count for aiur-team/aiur,
// re-read from the REST API this session; `x` is illustrative and comes from the extractor.
[{"i":0,"g":1241902373,"n":"aiur-team/aiur","a":1,"e":25986,"s":2,
  "f":"2021-05-11","l":"2026-07-31","x":[".ex",".exs",".md",".ts"],"z":"ok"}]

// grid.json — 2038 daily buckets, 67 monthly private buckets
{"start":"2021-01-01","n":2038,"e":[0,3,12],"a":[0,0,0],
 "p":[21,12,21],"pStart":"2021-01","bands":[0,1,2,4,8,16,32,64,128,256]}
```

`repoCount: 58` is `ownerPublicNonFork` = 50 (`its-everdred`) + 8 (`its-applekid`) from GT-7. It is
carried in the payload, with its definition, rather than written into copy — that is DEC-008. The
`bands` values shown are KW-007's log2 lower bounds; this ticket types the slot and asserts its
length but never hardcodes those numbers outside a test fixture.

### Scale to design for

- Roughly **13,453 unique paths across 51 repos**, about **44,886 events** in the five-year window,
  and roughly **31 chunks** after the guard. Do not build path-id lookup as a linear scan; use a
  `Map<string, number>`.
- Encoding the full corpus runs in well under a second, so no incremental or streaming encoder is
  warranted.

### Version pins, all verified on the registry this session

`typescript@5.9.3`, `eslint@9.39.5`, `next@16.2.12`, `vitest@4.1.10`, `fast-check@4.9.0`. All are
installed by KW-001 under DEC-003; this ticket adds nothing. `fast-check` is available and is a good
fit for the front-coding property test, but plain table-driven cases are acceptable — do not add a
dependency to get either.

## Acceptance and verification

### Agent gate

- `npm run typecheck` exits zero with `lib/bundle/**` and `test/bundle/**` in the program.
- `npm run lint` exits zero.
- `npx vitest run test/bundle/roundtrip.test.ts` is green, covering: `decodeBundle(encodeBundle(x).files)` deep-equals the canonically sorted projection of `x` for the worked fixture and for at least one generated corpus of 5,000+ events across 20+ repos.
- The suite asserts encoding the same input twice produces byte-identical file maps, key-for-key and character-for-character.
- The suite asserts the worked fixture reproduces the four emitted files byte-exactly, including `{"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[1,1,0]}` and `{"from":0,"n":3,"fc":"#packages/engine/src/run.ts\n7bootstrap.ts\n#app/page.tsx"}`.
- The suite asserts `frontDecode(frontCode(xs))` deep-equals `xs` over at least 200 generated path lists, including paths at and beyond the 90-character shared-prefix cap and paths containing a backslash.
- The suite asserts no dict slice exceeds 12,288 B gzip when `gzipSize` is supplied, using a synthetic worst case of 1,500 distinct 120-character paths that forces at least one chunk bisection, and asserts the resulting bundle still round-trips.
- The suite asserts `encodeBundle` throws on each violated invariant: unsorted or non-dense repo ids, an event outside the window, a `bands` array whose length is not 10, and any `RepoRecord` with `private: true`.
- The suite asserts `lib/bundle/schema.ts`, `lib/bundle/codec.ts` and `lib/bundle/frontcode.ts` contain no `node:` import, no bare `fs`/`zlib`/`crypto`/`path` import, and no `document`/`window` reference, by reading the three files and matching against source text.
- `git diff --name-only origin/main...HEAD` lists exactly `lib/bundle/schema.ts`, `lib/bundle/codec.ts`, `lib/bundle/frontcode.ts` and `test/bundle/roundtrip.test.ts`.

### At-merge gate

- The `ci-ok` status is green on the exact PR head.
- `package.json` and `package-lock.json` are unchanged in the diff, per DEC-003.
- No file under `scripts/`, `app/`, `styles/`, `public/`, `.github/` or `vitest.config.mts` appears in the diff.
- `npm run build` is green on the merge base, proving the new modules do not break the Next build even though nothing imports them yet.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Security — private-repo leakage is the one real risk here.** Half of the measured output (5,071 of
10,006 contributions, 50.7 %) sits behind private repositories. The schema must make leakage
structurally impossible, not merely unlikely:

- `RepoRecord.private` is typed as the literal `false`, and `encodeBundle` throws if any record
  carries `true`. There is no code path that writes a private repo name, path, branch, commit
  message, day or actor into the bundle.
- The private aggregate is `grid.privateMonthly`, a flat array of monthly integers with
  `grid.privateStart`. Monthly resolution is deliberate: a daily private series would leak a working
  pattern. Do not add a daily private array, and do not add a per-repo private breakdown.
- **Residual leak, closed by omission:** `grid.human` and `grid.agent` are the *calendar* counts,
  which already include private contributions. Publishing a public-only daily series alongside them
  would let a viewer subtract and derive daily private volume. `GridSeries` therefore has no
  public-only daily field, and adding one is a schema change requiring its own review.
- Nothing in this ticket reads a token, an environment variable or the network.

**Failure semantics.** The codec throws on every violated invariant and never emits a partially
valid bundle. It is a pure library: it has no retry, no backoff and no filesystem access. Network
failure handling, `status: 'stale'` preservation, `consecutiveFailures` and the seven-day drop rule
belong to KW-013; the temp-directory-then-swap emission discipline and the abort-rather-than-emit
policy belong to KW-014. This ticket only guarantees that the types exist to express them —
`RepoStatus` is `'ok' | 'stale' | 'gone'`, and `BundleMeta.degraded` names any source that fell back
to cache.

**Client-side partial failure.** `ChunkWire.b` is an absolute day index, so every chunk decodes
independently of the chunks after it. A client that receives chunk N but not N+1 stalls at a chunk
boundary rather than corrupting state. `decodeDictSlice` returns `{ from, paths }` so the client
appends into one flat array and never re-resolves an id.

**Migration.** There is nothing to migrate. `public/data/v1/` does not exist yet; `BUNDLE_VERSION`
is 1 and `DATA_ROOT` carries the version in the path, so a future format change is a new directory
plus a manifest `v` bump, never an in-place rewrite of live files.

**Accessibility.** No user-visible surface, no DOM, no markup, no colour. Not applicable. The
accessible text alternative for the grid is a visually hidden table owned by KW-011's consumers and
the region tickets; this ticket only guarantees the underlying series are separately addressable
(`grid.human` and `grid.agent` are kept as distinct arrays rather than a pre-summed level string,
which costs about 580 B gzip and buys per-actor filtering plus client-side correction of the
co-author double-count).

## Surfaces

- Reads: docs/research/2026-07-31-data-pipeline.md, docs/research/2026-07-31-decomposition-synthesis.md, docs/research/2026-07-31-ci-testing.md, package.json, tsconfig.json
- Writes: lib/bundle/schema.ts, lib/bundle/codec.ts, lib/bundle/frontcode.ts, test/bundle/roundtrip.test.ts
- Contracts: lib/bundle/schema.ts, lib/bundle/codec.ts, lib/bundle/frontcode.ts, public/data/v1/**
- Safety: contract:bundle-wire-format-v1

## Sibling boundaries and open gates

**Open gates: none.** GATE-002 (`workflow` credential scope) blocks tickets that touch
`.github/workflows/**`; this one does not. GATE-003 (the SSO-authorized `CONTRIB_TOKEN`) blocks
KW-010, KW-014 and KW-028; this ticket makes no network call and needs no secret. GATE-004 (Vercel
dashboard settings) and GATE-005 (content decisions) are unrelated. This ticket is pickable the
moment KW-001 merges.

**Same-wave siblings — do not touch their files.** Wave 2 runs ten tickets in parallel on a strictly
disjoint write-surface partition; violating it is what would force serialization across the widest
wave in the plan.

| Sibling | Owns | Interaction with this ticket |
|---|---|---|
| KW-007 | `lib/viz/tokens/ramp.ts`, `lib/viz/tokens/level.ts` | Owns the ten log2 band lower bounds. This ticket types `GridSeries.bands` and asserts `length === BAND_COUNT`; it never imports from `lib/viz/tokens/**` and never hardcodes the values outside a test fixture. |
| KW-008 | `lib/viz/sim/{types,cursor,rng,state}.ts` | Owns simulation state, lifespan cursors and the seeded RNG. `BundleEvent` is a wire concern; do not add simulation fields to it and do not import `lib/viz/sim/**`. |
| KW-009 | `scripts/pipeline/{discover,identity}.ts` | Produces the repo list and the `classify(email)` actor allowlist that populate `RepoWire.a` and `RepoWire.g`. This ticket types those fields; it does not populate them. |
| KW-010 | `scripts/pipeline/{calendar,private}.ts` | Produces `GridSeries.human`, `.agent` and `.privateMonthly`. |
| KW-011 | `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts` | Owns the runner configuration and the coverage thresholds, including the 100 %-statements gate on `lib/bundle/codec`. **Do not edit `vitest.config.mts`.** KW-012 does not depend on KW-011, so at pickup that file may not exist — `vitest@4.1.10` with no configuration file uses the default include `**/*.{test,spec}.?(c\|m)[jt]s?(x)`, which matches `test/bundle/roundtrip.test.ts` (verified by running it). If `vitest.config.mts` **is** already present and its `node` project `include` does not cover `test/**/*.test.ts`, the test will not be collected: do not fix it here. Record it in the PR body as a required follow-up on KW-011 and confirm the suite passes by pointing vitest at a config-free run. |

**Downstream consumers — what they take, and what they must not redeclare.**

| Consumer | Consumes | Boundary |
|---|---|---|
| KW-013 | `SortableEvent`, `compareEvents` | Owns `scripts/pipeline/{clone,extract}.ts`. Must emit `%aI` author dates and never the committer date, and must run `git log` with `--no-renames`. |
| KW-014 | `encodeBundle`, `MAX_DICT_SLICE_GZIP_BYTES`, `chunkFileName`, `dictFileName`, all types | Owns `scripts/pipeline/{encode,validate,state}.ts`, `data/.pipeline-state.json` and `public/data/v1/**` as a write surface. Must pass a real `gzipSize` callback, must not reimplement the codec, and must exit non-zero rather than emit a suspect bundle. |
| KW-015 | the six incremental decoders and the types | Owns `lib/bundle/loader.ts` only. Newest-first boot fetch, one-chunk-ahead prefetch at the 60 % mark, and graceful degradation on a 404 all live there, not here. |

`contract:bundle-wire-format-v1` is this ticket's safety surface and is owned exclusively by
KW-012. Downstream tickets depend on KW-012 and therefore must not claim it; doing so would either
be redundant or, between two unordered siblings, a hard validation error.

**If a downstream ticket needs a field this contract does not have**, the change lands here as a
follow-up ticket that updates `lib/bundle/schema.ts` and the round-trip fixture together. It does
not land as a local type widening in `scripts/pipeline/` or in `lib/bundle/loader.ts`. Two
declarations of one wire format is precisely the failure this ticket exists to prevent.
