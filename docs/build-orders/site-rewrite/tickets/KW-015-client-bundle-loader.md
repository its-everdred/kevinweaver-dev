# KW-015 — Client bundle loader: newest-first boot with one-chunk-ahead prefetch

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — one new client module plus its unit test, over a codec contract that is already frozen: no wire-format design, no DOM, no React, no dependency change. The only genuinely fiddly parts are the one-chunk-ahead trigger arithmetic and getting graceful degradation right instead of throwing.

**Risk:** medium-low — the module sits behind a lazily-loaded island and cannot break the server render or the resume panes, and every failure path degrades to "history ends here". The real hazard is silent over-fetching: a wrong prefetch trigger turns a 9,598 B first byte into a 127,565 B one, and nothing surfaces it until KW-030's first-byte budget fires.

**Phase hint:** 3

**Depends on:** KW-012

**Serializes with:** none

**Requirements:** REQ-004, REQ-005, REQ-011

**Decisions:** DEC-003, DEC-005, DEC-007, DEC-008

**Gates:** none

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`lib/bundle/loader.ts` exports a typed client module that turns the static Scheme D bundle into a
newest-first event stream: booting costs exactly five same-origin requests, playback pulls history
backwards on demand one chunk ahead of consumption, and every transport failure — 404, 5xx, network
throw, malformed body — ends history quietly rather than throwing at the caller.

## Context and evidence

The site's central animation replays five years of file touches **backwards**, newest day first. That
is why DEC-007 (synthesis D-07) numbers the chunks newest-first: chunk 0 is the most recent 1,500
events, day index 0 is `windowEnd`, and the day index increases into the past. The wire format is
already frozen by KW-012; this ticket is the reader half of the split that keeps the writer (KW-014)
and the reader (KW-015) off each other's critical path. The synthesis calls that out explicitly in
section 6, "How the path was shortened", item 2: without KW-012 as a contract ticket, KW-014 and
KW-015 serialize.

Evidence this ticket transcribes, pinned to `e664d73a195facd64db58ba10952170ff01b4772`:

- **The first byte is five files, and it is measured.** `manifest.json` + `repos.json` +
  `grid.json` + `events/ee-00.json` + `paths/pd-00.json` =
  `400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B brotli` against DEC-007's 12,288 B budget. That is
  the **corrected** total: `2026-07-31-data-pipeline.md` section 8 prints 9,324 B, measured against
  `repos.json`/`grid.json` schemas smaller than the ones section 1.4 actually specifies. VC-5 in that
  document's "Verification corrections" re-measured them at 1,058 B and 1,230 B brotli. **The
  correction wins.**
- **Prefetch policy, verbatim from `2026-07-31-data-pipeline.md` section 1.5:** "`t≈Ns` prefetch
  chunk k+1 when chunk k is 60% consumed" and "**Prefetch policy:** one chunk ahead, never more. At
  30 chunks a visitor who watches to 2013 pulls 127.6 KB brotli total — but that requires
  deliberately staying. The 50th-percentile visitor who bounces in 15 s pulls ~9 KB." This ticket
  implements exactly that policy and no more aggressive one.
- **Nothing on the page blocks on chunk 0.** Same section: "The grid renders from `grid.json` alone.
  The Gource view renders repo circles from `repos.json` alone. Neither blocks on chunk 0. If chunk 0
  never arrives the page is still a complete resume." That sentence is the reason `boot()` resolves
  when the event files fail but rejects when the manifest, repo list or grid fails.
- **Runway arithmetic, and the one correction that matters.** The design comp's `init()` seeds the
  log from `i = this.N - 40`, so first paint needs only the most recent ~40 days; the speed set is
  `this.speeds = [4, 8, 12, 20, 32]` days/sec with 12 the default (`2026-07-31-viz-runtime.md`
  line 209 (M); `2026-07-31-design-comp-spec.md` section 4.3). `365 / 12 = 30.4 s` and
  `365 / 32 = 11.4 s`, so "one 365-day chunk buys ~30 s of runway at the default speed" **stands** —
  the design-comp verifier's C3 confirms the headline and **refutes the table underneath it**: those
  chunks do not tile the corpus (`90 + 366 + 365 + 365 + 366 = 1552` of `N = 1826`, leaving days
  1462–1735 in no chunk) and every "covers playback seconds" figure is wrong. **Do not use that
  table.** Scheme D chunks are fixed at 1,500 *events*, not 365 days, so a chunk's day span is
  data-dependent — see "Runway, derived honestly" below.
- **Budget context.** The current live site already ships **115,334 B of compressed JavaScript**
  across 9 `_next` chunks plus 2,877 B of brotli'd HTML (VC-1 "Confirmed without correction",
  re-measured exactly). A 9,598 B first-byte data payload is ~8 % of that, for the entire point of
  the site. The pathological completionist pulls 127,565 B brotli — roughly `framework.js` +
  `polyfills.js` (76,194 B) plus `index.js`.
- **Corpus scale.** ~44,886 events (verifier re-count 44,923, same-day drift), **13,453 unique
  paths** (exact), **51 repos with ≥1 event** (exact), **76.2 % of events in 2026**, `aiur` 57.9 % of
  events, ~**31** chunks after DEC-007's split guard — not 30, because the true worst dictionary
  slice is chunk 10 at 8,250 B gzip and the original 8,192 B guard fires on real data today (VC-5).
- **DEC-008 (D-08) — no contribution figure is a literal anywhere in copy.** Every number the site
  renders reads from this payload, and the payload carries `generatedAt`, `windowStart`, `windowEnd`,
  `dayCount` and `repoCountDefinition` so the window and the counting definition travel with the
  numbers. The loader is the module that hands those fields to the UI; it must expose them and must
  never substitute a default when they are absent.
- **DEC-005 (D-05) — zero `serializes_with` pairs.** The synthesis's write-surface partition assigns
  `lib/bundle/**` to "KW-12 (schema/codec), KW-15 (loader) — disjoint files". This ticket owns
  `lib/bundle/loader.ts` and nothing else under that directory.
- **DEC-003 (D-03) — `package.json` and `package-lock.json` are frozen after KW-001.** This ticket
  installs nothing and adds no dependency. `fetch`, `AbortController` and `AbortSignal` are platform
  globals in every browser the site targets and in Node 24 (`.nvmrc` = `24`, `engines.node` =
  `24.x`), so no polyfill and no HTTP client is required.

Requirements this ticket carries:

- **REQ-004** — the generated activity payload is delivered newest-first inside a hard first-byte
  budget, so the visualization has usable data in the first round trip and history streams backwards
  on demand. This ticket owns the client half: the five-file boot set, the one-chunk-ahead prefetch,
  and the incremental dictionary. (DEC-007)
- **REQ-005** — every repository and contribution figure the site displays is derived from measured
  GitHub data at generation time; no figure is a literal in copy or code. This ticket is the seam
  through which `generatedAt`, `windowStart`, `windowEnd`, `dayCount`, `repoCount` and
  `repoCountDefinition` reach the client, unaltered and undefaulted. (DEC-008)
- **REQ-011** — the activity system degrades safely: a transient failure never loses history and
  never produces a hard error surface. The pipeline half refuses to publish a suspect bundle
  (KW-013/KW-014); this ticket owns the client half — a missing chunk means "history ends here",
  reported through `status()`, never an exception escaping into a React render.

Plan-context navigation, all paths relative to this repository at the approved planning commit that
carries this document:

| What | Where |
|---|---|
| Pack index and the KW-01..KW-32 to KW-001..KW-032 mapping | `docs/build-orders/site-rewrite/README.md` |
| Wave diagram, verified topological levels, critical path, write-surface partition | `docs/research/2026-07-31-decomposition-synthesis.md` section 6 |
| Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007) | `docs/research/2026-07-31-decomposition-synthesis.md` sections 3 and 4 |
| This ticket's implementation pointers, verbatim | `docs/research/2026-07-31-decomposition-synthesis.md` section 5, "Wave 3", entry KW-15 |
| Producer contract this ticket consumes | `docs/build-orders/site-rewrite/tickets/KW-012-bundle-schema-codec-contract.md`, section "Contract and invariants" |
| Load order, first-byte table, prefetch policy, size budget | `docs/research/2026-07-31-data-pipeline.md` sections 1.4, 1.5 and 8 |
| Verifier corrections that override that document | `docs/research/2026-07-31-data-pipeline.md`, "Verification corrections", VC-4 and VC-5 |
| Runway arithmetic, speed set, `init()` seeding from `N-40` | `docs/research/2026-07-31-design-comp-spec.md` section 4.3, corrected by that document's "Verification corrections" C3 |
| Machine-checked planning contract this document satisfies | `docs/build-orders/site-rewrite/AUTHORING-CONTRACT.md` |

The research documents are tracked and browsable at
`https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research`.

## Scope

- Create `lib/bundle/loader.ts` exporting `createBundleLoader`, the `BundleLoader`, `BundleHead`, `LoaderStatus` and `LoaderOptions` types, the `BundleLoadError` class, and the `DEFAULT_BASE_URL`, `PREFETCH_TRIGGER` and `FIRST_BYTE_FILE_COUNT` constants.
- Implement `boot()` as exactly five same-origin requests — `manifest.json`, `repos.json`, `grid.json`, `events/ee-00.json`, `paths/pd-00.json` — issued together, with the manifest, repo list and grid required and the two event files optional.
- Implement one-chunk-ahead prefetch: the first time consumption inside the chunk holding the cursor crosses the 60 % mark, fetch chunk `k+1`'s event file and dictionary slice together; never more than one chunk ahead and never more than one chunk fetch in flight.
- Maintain the global front-coded path dictionary incrementally: append each decoded slice at its declared `from` offset into one flat array, in slice order, never re-resolving an id and never holding a per-chunk dictionary.
- Expose the newest-first event seam to the sim layer: a synchronous non-throwing `takeThroughDay(day)`, a synchronous `take(n)`, and an `events()` async iterator, all advancing one shared consumption cursor.
- Implement graceful degradation: a 404, a non-OK response, a network throw, a malformed body, a dictionary gap or an out-of-range path id ends history and is reported through `status()` instead of throwing.
- Fail closed on a wire-version mismatch: `manifest.v !== BUNDLE_VERSION` rejects `boot()` with a `BundleLoadError` rather than decoding a format this build does not understand.
- Add `lib/bundle/loader.test.ts`: an offline suite driven by a stub `fetch` fed from `encodeBundle` output, covering the five-file boot set, the 60 % trigger, dictionary continuity across slices, the 404 path, the abort path and the version mismatch.

## Non-goals

- Do not create or edit `lib/bundle/schema.ts`, `lib/bundle/codec.ts`, `lib/bundle/frontcode.ts` or `test/bundle/roundtrip.test.ts` — KW-012 owns all four, and this ticket consumes them without redeclaring a single type.
- Do not write, generate or commit anything under `public/data/v1/**` or `data/.pipeline-state.json` — KW-014 owns emission and the state file. No fixture bundle lands on disk; the test builds its bytes in memory.
- Do not import from `lib/viz/**`. KW-008 owns the simulation types, cursors and RNG and is not a dependency of this ticket; the loader speaks only KW-012's `BundleEvent`.
- Do not own React components, hooks, `ResizeObserver`, DPR sizing or the lazy-island boundary — KW-025 owns `app/regions/Instrument.tsx` and `components/viz/**`.
- Do not own the rAF loop, the day cursor, playback speed, seek, reduced-motion handling or the `window.__viz` test harness — KW-024 owns `lib/viz/driver.ts` and `lib/viz/testHarness.ts`.
- Do not modify `package.json` or `package-lock.json`; DEC-003 freezes both after KW-001. No HTTP client, no `zod` schema for the wire format, no polyfill.
- Do not modify `vitest.config.mts` (KW-011), `playwright.config.ts` (KW-023), `next.config.ts` or `vercel.json` (KW-001), or add an npm script.
- Do not implement `manifest.integrity` (SHA-256) verification, service-worker caching, IndexedDB persistence, or a retry/backoff scheduler — a failed history fetch ends history, and anything richer is a deferred finding.
- Do not touch the DOM: no `document`, no `window`, no `matchMedia`, no `requestAnimationFrame`, no logging to the page.

## Existing owner and reuse target

There is no existing owner. At `e664d73a195facd64db58ba10952170ff01b4772` the repository is 49
tracked paths — `components/`, `pages/`, `public/`, `styles/`, `docs/` and root config — with no
`lib/`, no `test/`, no `scripts/` and no `tsconfig.json` (verified with
`git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772`). This ticket is greenfield
inside a tree that KW-001 has re-scaffolded and KW-012 has populated.

**The reuse target is KW-012's `lib/bundle/` module, and it is mandatory, not optional.** The loader
imports and must not reimplement:

| Import | From | Used for |
|---|---|---|
| `decodeManifest`, `decodeRepos`, `decodeGrid` | `lib/bundle/codec.ts` | the three required boot files |
| `decodeChunk`, `decodeDictSlice`, `expandChunk` | `lib/bundle/codec.ts` | every event chunk and dictionary slice |
| `chunkFileName`, `dictFileName` | `lib/bundle/schema.ts` | URL construction, never hand-rolled `padStart` |
| `BUNDLE_VERSION` | `lib/bundle/schema.ts` | the fail-closed version check |
| `Manifest`, `RepoRecord`, `GridSeries`, `BundleEvent`, `ChunkWire`, `IsoDay`, `ActorId` | `lib/bundle/schema.ts` | every public type on this module's surface |

Inherited from **KW-001** and not re-created here: `tsconfig.json` with `strict` and the `@/*` alias,
`eslint.config.mjs`, and the pre-declared scripts `lint`, `typecheck`, `build`, `test:unit`. Inherited
from **KW-011**: `vitest.config.mts`. This ticket depends on neither, so both may be in whatever state
`main` carries at pickup — see "Refreshable implementation notes" for the exact fallback command.

**If KW-012 is not yet merged when this ticket is picked up**, branch from `main` anyway and check for
`lib/bundle/codec.ts`. If it is absent, **stop and re-queue**. Do not stub it, do not inline the
decoders, and do not create the file: `lib/bundle/{schema,codec,frontcode}.ts` is KW-012's exclusive
write surface and creating it here is a head-on collision that costs both tickets a rework cycle.

There is no prior loader to port. The design comp (`docs/design/kevinweaver.dev.dc.html`) builds its
entire corpus in memory in `buildData()` and has no network layer at all; the design-comp verifier's
C3 notes that `buildData()`, `drawOverview()` and `settleStatic()` are the three call sites that
assume a fully materialized corpus. Those three are KW-021/KW-022/KW-024's problem. This module is
the thing that lets them stop assuming it.

## Contract and invariants

This section is the producer contract for `lib/bundle/loader.ts`. KW-024 and KW-025 quote it
verbatim; neither may redeclare these types.

### The URL prefix is not `DATA_ROOT`

KW-012 exports `DATA_ROOT = 'public/data/v1'`. That is a **repository path**, used by KW-014's writer.
Next serves `public/` at the web root, so the **client URL prefix is `/data/v1`**. Building a URL from
`DATA_ROOT` produces `/public/data/v1/...`, which 404s on every request. This is the single most
likely mistake in this ticket.

```
repository path   public/data/v1/events/ee-00.json
client URL        /data/v1/events/ee-00.json
```

### `lib/bundle/loader.ts`

```ts
import type {
  ActorId, BundleEvent, ChunkWire, GridSeries, IsoDay, Manifest, RepoRecord,
} from './schema';

/** Web-root prefix for the bundle. NOT `DATA_ROOT`, which is a repository path. */
export const DEFAULT_BASE_URL = '/data/v1';

/** DEC-007 / data-pipeline section 1.5: prefetch chunk k+1 when chunk k is 60 % consumed. */
export const PREFETCH_TRIGGER = 0.6;

/** manifest + repos + grid + events/ee-00 + paths/pd-00. Asserted in the unit suite. */
export const FIRST_BYTE_FILE_COUNT = 5;

export type LoaderPhase = 'idle' | 'booting' | 'ready' | 'exhausted' | 'failed';

export type LoaderEndReason =
  | 'manifest-exhausted'      // reached manifest.chunks; the whole corpus is resident
  | 'chunk-missing'           // 404 / non-OK / network throw on a history file
  | 'chunk-malformed'         // decodeChunk or decodeDictSlice threw
  | 'dictionary-gap'          // slice.from !== paths.length
  | 'path-id-out-of-range'    // chunk.p referenced an id past the cumulative dictionary
  | 'aborted';                // the caller's AbortSignal fired

/** What `boot()` resolves with. `events` is chunk 0, newest-first; `[]` if it failed. */
export interface BundleHead {
  manifest: Manifest;
  repos: RepoRecord[];
  grid: GridSeries;
  events: readonly BundleEvent[];
}

export interface LoaderStatus {
  phase: LoaderPhase;
  /** Contiguous chunks resident, counted from 0. */
  chunksLoaded: number;
  /** `manifest.chunks`; 0 before boot resolves. */
  chunksTotal: number;
  /** Events decoded and resident. */
  eventsLoaded: number;
  /** Events handed out through take / takeThroughDay / events(). */
  eventsConsumed: number;
  /** Global dictionary length. */
  pathsLoaded: number;
  /** Day index of the last resident event; -1 when none. Runway = this minus the caller's cursor. */
  residentThroughDay: number;
  /** True once no further chunk will ever arrive. */
  historyEnded: boolean;
  /** Why history ended; null while it has not. */
  endReason: LoaderEndReason | null;
  /** `manifest.degraded` concatenated with loader-side reasons. Never null. */
  degraded: readonly string[];
  /** Requests issued so far, including the five boot requests. Diagnostic; asserted in tests. */
  requestCount: number;
}

export interface LoaderOptions {
  /** Default `DEFAULT_BASE_URL`. Must be same-origin: leading '/', not '//', no URL scheme. */
  baseUrl?: string;
  /** Default `globalThis.fetch`. Injected by the unit suite. */
  fetchImpl?: typeof fetch;
  /** Default `PREFETCH_TRIGGER`. Clamped to [0, 1]. */
  prefetchTrigger?: number;
  /** Caller-owned cancellation. `dispose()` also aborts an internal controller. */
  signal?: AbortSignal;
  /** Fired after every status transition. Must never throw; the loader does not guard it. */
  onStatus?: (status: LoaderStatus) => void;
}

export class BundleLoadError extends Error {
  readonly reason: 'network' | 'http' | 'parse' | 'version' | 'config';
  readonly url: string | null;
  constructor(reason: BundleLoadError['reason'], url: string | null, message: string);
}

export interface BundleLoader {
  /** Idempotent. Five requests. Rejects only on manifest/repos/grid failure or version mismatch. */
  boot(): Promise<BundleHead>;
  /** Cheap snapshot. Safe to call every frame. */
  status(): LoaderStatus;
  /**
   * Primary sim seam. Returns every unconsumed resident event whose `day` is <= `day`,
   * in newest-first order. Synchronous, allocation-bounded, and NEVER throws.
   * Arms prefetch as a side effect.
   */
  takeThroughDay(day: number): BundleEvent[];
  /** Returns up to `n` unconsumed resident events. Same guarantees as `takeThroughDay`. */
  take(n: number): BundleEvent[];
  /** The newest-first iterator. Awaits prefetch; ends when history ends. Shares one cursor. */
  events(): AsyncIterableIterator<BundleEvent>;
  /** Force chunks 0..index resident. Resolves false if history ended first. */
  ensureChunk(index: number): Promise<boolean>;
  /** The flattened global path dictionary. Diagnostic; `BundleEvent.path` is already expanded. */
  paths(): readonly string[];
  /** Aborts in-flight work and drops references. Idempotent. */
  dispose(): void;
}

export function createBundleLoader(options?: LoaderOptions): BundleLoader;
```

### Invariants

1. **Boot is exactly `FIRST_BYTE_FILE_COUNT` requests.** `manifest.json`, `repos.json`, `grid.json`,
   `chunkFileName(0)`, `dictFileName(0)`, issued in one `Promise.all`. Chunk 1 is **not** requested
   during boot. `boot()` is idempotent: a second call returns the same promise and issues nothing.
2. **The required trio.** A failure on `manifest.json`, `repos.json` or `grid.json` rejects `boot()`
   with a `BundleLoadError`. A failure on either chunk-0 file resolves `boot()` with `events: []`,
   `historyEnded: true`, `endReason: 'chunk-missing'` and phase `'exhausted'`. The resume, the grid
   and the repo ring all render from the trio alone.
3. **Fail closed on version.** `manifest.v !== BUNDLE_VERSION` rejects with
   `new BundleLoadError('version', url, ...)`. Never attempt a partial decode of an unknown format.
4. **Newest-first is structural.** Chunk 0 is the newest 1,500 events; within a chunk `day` is
   non-decreasing (`d[i] >= 0`); day index 0 is `windowEnd` and increases into the past. Concatenating
   chunks in index order therefore yields one globally newest-first stream, and the loader never
   sorts, never reverses and never merges.
5. **One dictionary, appended once.** `decodeDictSlice(text)` returns `{ from, paths }`. The loader
   asserts `from === this.paths.length` before appending; a mismatch is `endReason: 'dictionary-gap'`
   and history ends. Ids are global and are never re-resolved, so chunk `k` legally references a path
   first seen in chunk 0.
6. **Dictionary before chunk.** For chunk `k`, append slice `k` first, then verify
   `max(chunk.p) < paths.length`, then call `expandChunk`. Out of range is
   `endReason: 'path-id-out-of-range'`.
7. **Prefetch is one ahead and one at a time.** At most one chunk fetch is in flight; because fetches
   are strictly contiguous, the in-flight fetch is always for index `chunksLoaded`. The trigger is
   evaluated only on consumption, never on a timer.
8. **Consumption never blocks and never throws.** `take` and `takeThroughDay` read only resident
   events. When nothing is resident they return `[]`. They arm prefetch and return; they do not await.
9. **History ends once.** `historyEnded` is monotone. After it is set, `ensureChunk` resolves `false`
   immediately and no further request is issued for any index.
10. **Same-origin only.** `baseUrl` must start with `/` and must not start with `//`, and must not
    match `^[A-Za-z][A-Za-z0-9+.\-]*:`. A violation throws `new BundleLoadError('config', …)` from
    `createBundleLoader`, before any request. Every request is
    `fetchImpl(url, { credentials: 'omit', signal })`.
11. **`manifest.chunks` bounds the walk.** The loader never requests an index `>= manifest.chunks`;
    reaching it sets `endReason: 'manifest-exhausted'`. The 404 path exists for the stale-CDN case
    where the manifest and the deployed chunk set disagree.
12. **No mutation of KW-012's output.** `expandChunk` results are stored as-is. The loader never
    rewrites `day`, `repo`, `path` or `actor`, and never invents a field.

### The prefetch trigger, exactly

```ts
// chunkStart[k] / chunkLen[k] describe chunk k's slice of `events`.
// `cursor` is the index of the next unconsumed event.
private armPrefetch(): void {
  if (this.historyEnded || this.chunksLoaded === 0) return;
  // Chunk holding the cursor, clamped to the last resident chunk when fully drained.
  let k = this.chunksLoaded - 1;
  while (k > 0 && this.chunkStart[k]! > this.cursor) k -= 1;
  const len = this.chunkLen[k]!;
  const progress = len === 0 ? 1 : (this.cursor - this.chunkStart[k]!) / len;
  if (progress < this.prefetchTrigger) return;
  void this.ensureChunk(k + 1);   // no-op if resident, in flight, or past manifest.chunks
}
```

`chunkStart` has ~31 entries in production, so the backward scan is free; do not build an index.
Call `armPrefetch()` at the end of `take`, `takeThroughDay` and each `events()` yield — never on a
timer, never on a `setInterval`, and never during `boot()`.

### Consumer notes

- **KW-024** (`lib/viz/driver.ts`) drives the day cursor. It calls `takeThroughDay(Math.floor(state.cursor))`
  once per fixed step and feeds the returned array into the sim. It must treat `[]` as "no events on
  this day yet", not as an error, and it must read `status().historyEnded` to decide when the
  backwards walk has reached the end of history rather than assuming `dayCount`.
- **KW-025** (`app/regions/Instrument.tsx`) owns construction and teardown: create the loader inside
  the lazily-mounted island, `await boot()`, render the grid from `head.grid` and the repo ring from
  `head.repos` regardless of `head.events.length`, and call `dispose()` on unmount.
- **KW-026** (`app/regions/TransportBar.tsx`) reads `head.manifest.generatedAt` for DEC-014's honest
  `fresh · Nh ago` pill. The loader hands the field through untouched; it does not format it, does not
  default it and does not compute the delta.
- **KW-029** builds the D-11 visually hidden `<table>` from `head.grid`, which is complete after the
  five-file boot. It must not wait on chunk 0.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`; re-verify at pickup and report drift
rather than silently changing scope.

### Files to create — and nothing else

| Path | Contents |
|---|---|
| `lib/bundle/loader.ts` | Everything in "Contract and invariants". One class or closure behind `createBundleLoader`; no default export. |
| `lib/bundle/loader.test.ts` | The suite described under "Acceptance and verification". |

`git diff --name-only origin/main...HEAD` must list exactly those two paths and nothing else.

### Where the test file goes, and how to run it

The test is **co-located** at `lib/bundle/loader.test.ts`, not under `test/`. Two reasons, both
checkable at pickup:

- KW-011 owns `vitest.config.mts` and this ticket does not depend on KW-011, so that file's `include`
  may be anything when you branch. Verify it with `cat vitest.config.mts`. If its `include` does not
  match your file, **do not edit it** — record it in the PR body as a follow-up for KW-011 and prove
  the suite green with a config-free run.
- KW-012 already owns `test/bundle/roundtrip.test.ts`. Writing `test/bundle/loader.test.ts` would put
  two tickets in one directory for no benefit; co-location keeps the write surfaces obviously disjoint.

Commands, in order of preference:

```bash
npx vitest run lib/bundle/loader.test.ts     # always works; explicit path beats any include glob
npm run test:unit                            # preferred once KW-011's config covers lib/**
```

### Sketch of the module

```ts
import {
  chunkFileName, dictFileName, BUNDLE_VERSION,
} from './schema';
import {
  decodeChunk, decodeDictSlice, decodeGrid, decodeManifest, decodeRepos, expandChunk,
} from './codec';

const SCHEME = /^[A-Za-z][A-Za-z0-9+.\-]*:/;

function normalizeBaseUrl(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//') || SCHEME.test(raw)) {
    throw new BundleLoadError('config', raw, `baseUrl must be a same-origin path: ${raw}`);
  }
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

/** Returns the body text, or null for any non-OK / network failure. Aborts propagate. */
async function getText(
  fetchImpl: typeof fetch, url: string, signal: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetchImpl(url, { credentials: 'omit', signal });
    return res.ok ? await res.text() : null;
  } catch (err) {
    if (signal.aborted) throw err;
    return null;
  }
}
```

`boot()`:

```ts
const base = this.baseUrl;
const urls = [
  `${base}/manifest.json`,
  `${base}/repos.json`,
  `${base}/grid.json`,
  `${base}/${chunkFileName(0)}`,
  `${base}/${dictFileName(0)}`,
];
const [mText, rText, gText, eText, pText] = await Promise.all(
  urls.map((u) => { this.requestCount += 1; return getText(this.fetchImpl, u, this.signal); }),
);
if (mText === null) throw new BundleLoadError('http', urls[0]!, 'manifest.json unavailable');
if (rText === null) throw new BundleLoadError('http', urls[1]!, 'repos.json unavailable');
if (gText === null) throw new BundleLoadError('http', urls[2]!, 'grid.json unavailable');

const manifest = decodeManifest(mText);            // may throw -> wrap as BundleLoadError('parse')
if (manifest.v !== BUNDLE_VERSION) {
  throw new BundleLoadError('version', urls[0]!,
    `bundle version ${manifest.v}, this build reads ${BUNDLE_VERSION}`);
}
// repos / grid decode the same way, then:
if (eText === null || pText === null) { this.end('chunk-missing'); }
else { this.admitChunk(0, eText, pText); }         // dictionary first, then expandChunk
```

`admitChunk(index, eventText, dictText)` is the one place chunks enter state:

```ts
let slice, chunk;
try { slice = decodeDictSlice(dictText); chunk = decodeChunk(eventText); }
catch { return this.end('chunk-malformed'); }
if (slice.from !== this.pathList.length) return this.end('dictionary-gap');
for (const p of slice.paths) this.pathList.push(p);          // a loop, not a 1,500-arg spread
for (const id of chunk.p) if (id >= this.pathList.length) return this.end('path-id-out-of-range');
const expanded = expandChunk(chunk, this.pathList);
this.chunkStart.push(this.events.length);
this.chunkLen.push(expanded.length);
for (const e of expanded) this.events.push(e);
this.chunksLoaded = index + 1;
if (this.chunksLoaded >= this.manifest.chunks) this.end('manifest-exhausted');
```

`takeThroughDay`:

```ts
takeThroughDay(day: number): BundleEvent[] {
  const out: BundleEvent[] = [];
  while (this.cursor < this.events.length && this.events[this.cursor]!.day <= day) {
    out.push(this.events[this.cursor]!);
    this.cursor += 1;
  }
  this.armPrefetch();
  return out;
}
```

Note `day <= day` and not `>=`: playback walks *backwards in calendar time*, which is *forwards*
through the day index, because day 0 is `windowEnd`. Getting this comparison backwards yields an
empty stream on frame 1 and is the second most likely mistake in this ticket.

### Worked fixture — executable specification

This reuses KW-012's own worked fixture verbatim, so the two suites cannot drift. `chunkSize` is 3, so
the fixture produces two chunks; the shipped default is 1,500.

```
windowEnd   = '2026-07-31'      windowStart = '2026-07-28'      dayCount = 4
repos:  0  aiur-team/aiur        1  its-everdred/kevinweaver-dev
manifest.chunks = 2
```

Files served by the stub `fetch` (these are KW-012's byte-exact outputs):

```
events/ee-00.json  {"b":0,"d":[0,0,1],"r":[0,0,1],"p":[0,1,2],"a":[1,1,0]}
events/ee-01.json  {"b":3,"d":[0,0],"r":[0,1],"p":[0,3],"a":[0,0]}
paths/pd-00.json   {"from":0,"n":3,"fc":"#packages/engine/src/run.ts\n7bootstrap.ts\n#app/page.tsx"}
paths/pd-01.json   {"from":3,"n":1,"fc":"#app/layout.tsx"}
```

Expected trace:

| Step | Requests issued (cumulative) | Result |
|---|---|---|
| `boot()` | 5 — `/data/v1/manifest.json`, `/repos.json`, `/grid.json`, `/events/ee-00.json`, `/paths/pd-00.json` | `chunksLoaded 1`, `eventsLoaded 3`, `pathsLoaded 3`, `residentThroughDay 1`, phase `ready` |
| `takeThroughDay(0)` | 5 | returns 2 events; `cursor 2`; progress `2/3 = 0.667 >= 0.6` → prefetch armed |
| after the prefetch settles | 7 — `+ /events/ee-01.json`, `+ /paths/pd-01.json` | `chunksLoaded 2`, `eventsLoaded 5`, `pathsLoaded 4`, `historyEnded true`, `endReason 'manifest-exhausted'`, phase `exhausted` |
| `takeThroughDay(3)` | 7 | returns the remaining 3 events |
| `takeThroughDay(3)` again | 7 | returns `[]`, does not throw, issues nothing |

The three chunk-0 events, newest-first:

```jsonc
{"day":0,"repo":0,"path":"packages/engine/src/run.ts","actor":1}
{"day":0,"repo":0,"path":"packages/engine/src/bootstrap.ts","actor":1}
{"day":1,"repo":1,"path":"app/page.tsx","actor":0}
```

and the two chunk-1 events:

```jsonc
{"day":3,"repo":0,"path":"packages/engine/src/run.ts","actor":0}
{"day":3,"repo":1,"path":"app/layout.tsx","actor":0}
```

**Assert the first of those two explicitly.** Its `p` value is `0`, a path first introduced in slice
0, resolved through the *global* dictionary. That single assertion is the whole point of Scheme D and
is the thing a per-chunk-dictionary regression would break silently.

Build the fixture in the test with KW-012's encoder rather than pasting the strings:

```ts
const enc = encodeBundle(fixtureInput, { chunkSize: 3 });
const files = new Map(enc.files);                       // keys relative to the web root
const fetchImpl = makeStubFetch('/data/v1', files);      // 404s anything not in the map
```

`makeStubFetch` records every requested URL in order — that recording is what the request-count and
request-set assertions read.

### Runway, derived honestly

DEC-007 fixes chunks at 1,500 **events**, so a chunk's day span is data-dependent. From the measured
corpus — 44,886 events over a 2,038-day window with **76.2 % of events in 2026** (VC-1, exact) and
2026 spanning 212 days of that window:

- Dense region (2026): `44,886 × 0.762 / 212 ≈ 161` events/day, so a 1,500-event chunk spans **~9
  days ≈ 0.8 s** of playback at the default 12 days/sec, and ~0.3 s at the fastest 32 days/sec.
- Sparse tail (2021-01-01 … 2025-12-31): `44,886 × 0.238 / 1,826 ≈ 5.9` events/day, so a chunk spans
  **~254 days ≈ 21 s** at 12 days/sec.

That is a ~26× swing in runway across the corpus, and the dense end is the tight one: one-chunk-ahead
prefetch buys roughly 0.3 s of lead time at the 60 % mark during 2026. **Implement the policy exactly
as specified anyway** — one chunk ahead, never more (DEC-007, data-pipeline section 1.5). Do not
invent a deeper lookahead, an adaptive window or a time-based prefetch in this ticket; the correct
response to a stall is `status()` reporting a starved cursor, which KW-024 can turn into a hold.
Record any measured stall as a deferred finding in the PR body, not as a scope expansion.

This arithmetic is derived from measured inputs, not measured directly. It replaces the design-comp
document's section 4.3 chunk table, which its own verifier refuted in C3 (the chunks do not tile the
corpus and every "covers playback seconds" figure is wrong). The headline it *does* preserve —
"one 365-day chunk buys ~30 s of runway at the default speed" — is arithmetically correct and stands.

### Version pins, verified on the registry this session

`next@16.2.12`, `react@19.2.8`, `vitest@4.1.10`, `zod@4.4.3` and both `typescript@5.9.3` and
`typescript@6.0.3` resolve (`npm view <pkg>@<version> version`). All are installed by KW-001 under
DEC-003; **this ticket adds nothing**. `zod` is present in `dependencies` but is a generation-time
validator for the GitHub response — do not pull it into the browser bundle to re-validate a payload
KW-012's decoders already parse.

**Drift to expect and re-verify at pickup, not to act on unilaterally.** `main` moved after
`e664d73a195facd64db58ba10952170ff01b4772`; the tree that landed pins `typescript` at `6.0.3` rather
than the `5.9.3` named in KW-012's notes, and `vitest.config.mts` currently uses a single `node`
environment with `include: ['{lib,sim,scripts}/**/*.{test,spec}.{ts,mts}']`. Both are consistent with
this ticket — `lib/bundle/loader.test.ts` is matched by that glob — but if either has moved again,
report it in the PR body and keep the explicit `npx vitest run lib/bundle/loader.test.ts` proof.

## Acceptance and verification

### Agent gate

- `npm run typecheck` exits zero with `lib/bundle/loader.ts` and `lib/bundle/loader.test.ts` in the program.
- `npm run lint` exits zero.
- `npx vitest run lib/bundle/loader.test.ts` is green.
- The suite asserts `boot()` issues exactly five requests and that the recorded URL set is exactly `/data/v1/manifest.json`, `/data/v1/repos.json`, `/data/v1/grid.json`, `/data/v1/events/ee-00.json`, `/data/v1/paths/pd-00.json` — no sixth request, and no `/public/` in any URL.
- The suite asserts no further request is issued while consumption inside chunk 0 stays below the 60 % mark, and that crossing it issues exactly two more requests, `events/ee-01.json` and `paths/pd-01.json`.
- The suite asserts chunk 1's first event resolves path id `0` to `packages/engine/src/run.ts`, proving the global dictionary is appended once and never re-resolved per chunk.
- The suite asserts the full worked-fixture trace: 3 events resident after boot, `takeThroughDay(0)` returning 2, `takeThroughDay(3)` returning 3, and a repeat call returning `[]` without throwing and without issuing a request.
- The suite asserts a 404 on `events/ee-01.json` with `manifest.chunks = 3` yields `historyEnded: true`, `endReason: 'chunk-missing'`, phase `'exhausted'`, no thrown error, and no request for chunk 2.
- The suite asserts a failed `grid.json` rejects `boot()` with a `BundleLoadError`, while a failed `events/ee-00.json` resolves `boot()` with `events: []` and a complete `manifest`, `repos` and `grid`.
- The suite asserts `manifest.v` not equal to `BUNDLE_VERSION` rejects `boot()` with `BundleLoadError` of reason `'version'` and issues no chunk request.
- The suite asserts an already-aborted `AbortSignal` causes `boot()` to reject and `dispose()` to be safe to call twice.
- The suite asserts `createBundleLoader({ baseUrl: 'https://evil.example/data' })` throws `BundleLoadError` of reason `'config'` before any request, and the same for `'//evil.example'`.
- `git diff --name-only origin/main...HEAD` lists exactly `lib/bundle/loader.ts` and `lib/bundle/loader.test.ts`.

### At-merge gate

- The `ci-ok` status is green on the exact PR head.
- `package.json` and `package-lock.json` are unchanged in the diff, per DEC-003.
- No file under `scripts/`, `app/`, `components/`, `styles/`, `public/`, `.github/`, `e2e/`, or any of `lib/bundle/schema.ts`, `lib/bundle/codec.ts`, `lib/bundle/frontcode.ts`, `test/`, `vitest.config.mts`, `next.config.ts`, `vercel.json` appears in the diff.
- `npm run build` is green, proving the new module does not break the Next build even though no region imports it yet.
- `grep -nE "requestAnimationFrame|document\.|window\.|matchMedia|node:|from '(fs|path|zlib|crypto)'" lib/bundle/loader.ts` returns nothing.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure semantics — the whole point of the ticket.** Enumerated, with the required behaviour:

| Failure | Behaviour |
|---|---|
| `manifest.json`, `repos.json` or `grid.json` non-OK or network error | `boot()` rejects with `BundleLoadError`. KW-025 renders the page without the viz island; the resume, man page and contact panes are unaffected. |
| `events/ee-00.json` or `paths/pd-00.json` fails | `boot()` **resolves** with `events: []`, `historyEnded: true`, `endReason: 'chunk-missing'`. The grid and the repo ring still render. |
| Any history chunk 404s or 5xxs | `historyEnded: true`, `endReason: 'chunk-missing'`, phase `'exhausted'`. No retry, no backoff, no throw. "History ends here." |
| `decodeChunk` / `decodeDictSlice` throws | `endReason: 'chunk-malformed'`; history ends. Never let a decoder exception escape into a React render. |
| `slice.from !== paths.length` (stale CDN mixing generations) | `endReason: 'dictionary-gap'`; history ends rather than resolving ids against the wrong dictionary. |
| `chunk.p` references an id past the cumulative dictionary | `endReason: 'path-id-out-of-range'`; history ends. |
| `manifest.v !== BUNDLE_VERSION` | `boot()` rejects, reason `'version'`. Fail closed; a v2 bundle lives at a different `DATA_ROOT` anyway. |
| Caller aborts, or `dispose()` runs mid-flight | In-flight promises reject with the platform `AbortError`, which propagates out of `boot()`; `ensureChunk` resolves `false`; `endReason: 'aborted'`. |

Retry, exponential backoff and `manifest.integrity` (SHA-256) verification are all deliberately out
of scope. A retry policy on a CDN-served static asset is a KW-030 conversation once the size gate
exists; record it as a deferred finding rather than adding it here.

**Security.** Three concrete properties, all structural:

- **Same-origin by construction.** `baseUrl` is validated at construction (invariant 10) and every
  request is `fetchImpl(url, { credentials: 'omit', signal })`. Cookies are never sent to the CDN and
  a configuration mistake cannot turn the loader into an exfiltration channel.
- **No secrets.** This module reads no token, no environment variable and no header. GATE-003's
  `CONTRIB_TOKEN` is a pipeline secret and never reaches the client. KW-012's invariant 10 already
  makes it impossible for a private repository name, path, branch, commit message, day or actor to be
  in the bundle at all — private activity exists only as `grid.privateMonthly`, a monthly integer
  array. The loader must not attempt to reconstruct anything finer from it, and must not publish a
  public-only daily series that could be subtracted from `grid.human` / `grid.agent` to derive daily
  private volume.
- **No dynamic code.** URLs come from `chunkFileName` / `dictFileName` and an integer index. No
  template built from a response body, no `eval`, no `JSON.parse` of a URL fragment, no
  `new Function`.

**Migration.** Nothing to migrate. `/data/v1/` does not exist at the researched commit; KW-014 creates
it. `BUNDLE_VERSION` is 1 and the version is in the path, so a future format change is a new directory
plus a manifest `v` bump — never an in-place rewrite of live files. The version check exists so that a
browser holding a cached v1 build against a v2 deployment fails visibly instead of mis-decoding.

**Accessibility.** No user-visible surface, no DOM, no markup, no colour, no focus, no motion — the
loader is a data module. Two second-order obligations it must not break: `head.grid` is complete after
the five-file boot, so KW-029's D-11 visually hidden `<table>` and the `<noscript>` fallback never wait
on chunk 0; and because the loader owns no timer and no rAF, a reduced-motion halt in KW-024 stops
playback without any loader change. `prefers-reduced-motion` is not read here.

## Surfaces

- Reads: lib/bundle/schema.ts, lib/bundle/codec.ts, lib/bundle/frontcode.ts, public/data/v1/**, package.json, tsconfig.json, vitest.config.mts, docs/research/2026-07-31-data-pipeline.md, docs/research/2026-07-31-design-comp-spec.md, docs/research/2026-07-31-decomposition-synthesis.md
- Writes: lib/bundle/loader.ts, lib/bundle/loader.test.ts
- Contracts: lib/bundle/loader.ts
- Safety: contract:bundle-loader-v1

## Sibling boundaries and open gates

**Open gates: none.** GATE-002 (`workflow` credential scope) blocks tickets that touch
`.github/workflows/**`; this one does not. GATE-003 (the SSO-authorized `CONTRIB_TOKEN`) blocks
KW-010, KW-014 and KW-028 — this ticket makes no GitHub call and needs no secret, because its entire
test corpus is synthesised in memory by KW-012's encoder. GATE-004 (Vercel dashboard settings),
GATE-005 (content decisions) and GATE-007 (scanline treatment) are unrelated. This ticket is pickable
the moment KW-012 merges.

**Same-wave siblings — do not touch their files.** Phase 3 runs eleven tickets in parallel on a
strictly disjoint write-surface partition (DEC-005). Violating it is what would force serialization
across the widest wave in the plan.

| Sibling | Owns | Interaction with this ticket |
|---|---|---|
| KW-013 | `scripts/pipeline/{clone,extract}.ts` | Produces the raw event stream. No shared file, no import in either direction. |
| KW-014 | `scripts/pipeline/{encode,validate,state}.ts`, `data/.pipeline-state.json`, `public/data/v1/**` | Writes the bytes this module reads. `public/data/v1/**` is KW-014's write surface and this ticket's **read** surface only — never commit a bundle. |
| KW-016, KW-017, KW-019, KW-020 | `app/regions/{ManPage,CareerLog,Contact,BootOverlay}.tsx` | Server-rendered panes. KW-020's boot overlay must read its figures from the payload (DEC-008), but it gets them from KW-025's props, not by constructing a loader. |
| KW-018 | `app/regions/{Header,TmuxBar}.tsx`, `components/ds/TmuxBar.tsx` | No interaction. |
| KW-021 | `lib/viz/sim/{step,layout}.ts` | Consumes events eventually, but through KW-024's driver. This ticket must not import `lib/viz/**`; KW-008 is not a dependency of KW-015. |
| KW-022 | `lib/viz/render/**` | Pure `(state, ctx)` renderers. No data-transport concern. |
| KW-023 | `playwright.config.ts`, `e2e/**`, `.github/workflows/e2e.yml` | No interaction; the loader's proof is a unit test, not an e2e spec. |

**Upstream boundary.** KW-012 owns `lib/bundle/{schema,codec,frontcode}.ts` and the safety surface
`contract:bundle-wire-format-v1`. This ticket depends on KW-012 and therefore must not claim that
surface. **If this ticket needs a field or a decoder the codec does not expose, the change lands in
KW-012 as a follow-up ticket that updates `lib/bundle/schema.ts` and its round-trip fixture
together** — never as a local type widening or a hand-rolled parser inside `loader.ts`. Two
declarations of one wire format is exactly the failure KW-012 exists to prevent.

**Downstream consumers.** KW-025 (`app/regions/Instrument.tsx`, `components/viz/**`) constructs and
disposes the loader inside the lazily-mounted island; KW-024 (`lib/viz/driver.ts`) pulls events per
fixed step; KW-026 (`app/regions/TransportBar.tsx`) reads `generatedAt` for the DEC-014 freshness
pill; KW-029 builds the hidden contribution table from `head.grid`. All four depend on this ticket,
directly or transitively, so `contract:bundle-loader-v1` is owned here and claimed nowhere else.
