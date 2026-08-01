# KW-010 — Pipeline B: contribution calendar and private aggregate through an SSO-authorized PAT

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Two small, pure-ish GraphQL modules over already-measured queries and windows; the only hard part is the SAML canary, and the write surface is two files.

**Risk:** medium — a token without the SAML grant returns *empty results instead of errors*, so the default failure mode is silently wrong numbers rather than a red run. Gated by GATE-003.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-005, REQ-007

**Decisions:** DEC-003, DEC-006, DEC-008

**Gates:** GATE-003

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`node scripts/pipeline/calendar.ts --json` and `node scripts/pipeline/private.ts --json`, run with an SSO-authorized `CONTRIB_TOKEN`, print the two-actor per-day contribution series for 2021-01-01 → 2026-07-31 and the 67-month private-contribution aggregate — and both refuse to print anything at all, exiting non-zero, when the token cannot see a SAML-protected organization.

## Context and evidence

The site's headline numbers are contribution figures. Two research tracks measured them through a token that is **not** SAML-SSO-authorized for `ethereum-optimism`, and GitHub answered with an empty set rather than an error, so both tracks published numbers that are roughly 3,299 low across 2025–2026 without noticing.

- **GT-1** — `gh api repos/ethereum-optimism/actions` → HTTP 403, `Resource protected by organization SAML enforcement. You must grant your OAuth token access to this organization.`
- **GT-3** — authenticated `contributionCalendar` for `its-everdred` reports 2024=2,454 / 2025=1,443 / 2026=2,791. The public profile calendar reports 2024=2,459 / 2025=**2,695** / 2026=**4,838**. 2021–2024 agree within 4–15 (timezone edge effects); the divergence begins **exactly** when the Optimism role begins (May 2025).
- **GT-4** — restricted (private) contribution counts measured through the blinded token: 2021=105, 2022=86, 2023=1,028, 2024=2,360, 2025=998, 2026=488.
- **C-2** — "Optimism produces zero public GitHub artifacts" was **refuted**. `ethereum-optimism/actions` is public (31 stars, 22 forks) and `its-everdred` is its top contributor by an order of magnitude (2,198 commits). The original finding measured the token, not the world.
- **C-10** — "`GITHUB_TOKEN` suffices for the pipeline" was **refuted outright**. `GITHUB_TOKEN` is a GitHub App installation token scoped to this repository; a third-party organization's SAML grant cannot be attached to it. It reproduces the deflation exactly.
- **C-1** — four different contribution totals appear across the tracks (10,001 / 10,006 / 13,360 / 13,147) purely because two different data sources were being mixed. The anonymous and authenticated sources disagree on **52 of 366 days in 2024**, and the anonymous HTML markup changed mid-research (`data-count` attributes replaced by `<tool-tip>`).

Decision records this ticket implements:

- **DEC-006 (D-06)** — the pipeline splits by auth surface. This is the half that needs the PAT. The clone half (KW-013) needs no token at all and is unaffected by SAML.
- **DEC-008 (D-08)** — no contribution figure is a literal anywhere in copy. Every number reads from a payload stamped with `generatedAt`, `windowStart`, `windowEnd`, `dayCount`. This module is the origin of those fields for the contribution half.
- **DEC-003 (D-03)** — `package.json` and `package-lock.json` are frozen after KW-001. `@octokit/graphql` and `zod` are already installed; this ticket adds no dependency and no npm script.

Gate: **GATE-003 (HG-3)** — the operator must mint a PAT with `read:user`, authorize it for `ethereum-optimism`, and store it as repository secret `CONTRIB_TOKEN`. The gate blocks the *live* assertion, not the code: the modules are written and merged against fixtures and an injected transport, and KW-014 refuses to emit a bundle when the canary record says `ok: false`, so an unclosed gate cannot ship wrong numbers.

Plan-context navigation (research pinned at `e664d73a195facd64db58ba10952170ff01b4772`; pack documents land in the same planning commit as this ticket):

- Pack index — `docs/build-orders/site-rewrite/README.md`, including the `KW-10 → KW-010` ordinal mapping.
- Wave and graph analysis — `docs/research/2026-07-31-decomposition-synthesis.md` §6 (wave diagram, verified topological levels, critical path, and the write-surface partition proof that makes this ticket's two files exclusive): https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-decomposition-synthesis.md
- Decision registry — synthesis §3 (D-01..D-17) and `docs/build-orders/site-rewrite/03-technical-decisions.md`.
- Gate registry — synthesis §4 (HG-1..HG-7) and `docs/build-orders/site-rewrite/authority-envelope.md`, which tracks GATE-003 as open.
- This ticket's implementation pointers — synthesis §5, "**KW-10 — Pipeline B: contribution calendar + private aggregate (SSO PAT)**" (wave 2), plus the measured queries in `docs/research/2026-07-31-data-pipeline.md` §4 and §6 and that document's `## Verification corrections` VC-3: https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/2026-07-31-data-pipeline.md

## Scope

- Create `scripts/pipeline/calendar.ts`: a `CONTRIB_TOKEN`-bound GraphQL client factory, the SAML visibility canary, twelve one-year `contributionsCollection` queries (6 windows × 2 actors), and the per-actor per-day contribution series over 2021-01-01 → 2026-07-31.
- Create `scripts/pipeline/private.ts`: the monthly `restrictedContributionsCount` sweep (67 months × 2 actors from 2021-01 to 2026-07) and the element-wise combined `p` series that `grid.json` carries.
- Export `CalendarBundle`, `PrivateAggregate`, `SamlCanary`, `GraphqlRequest` and the pure helper `mergeActorDays()` as the typed contract KW-014 imports rather than reimplements.
- Run the SAML canary as the first network action of every entry point, return a machine-readable canary record on the bundle, and throw `SamlCanaryError` (exit code 1, nothing printed on stdout) when it fails.
- Implement transport resilience: exponential backoff 1/2/4/8 s over 4 attempts, a `rateLimit.remaining < 50` guard, and a `degraded: ["calendar"]` marker when a caller-supplied previous block is reused instead of a fresh fetch.
- Provide an offline `--self-check` mode on both files that proves the pure helpers and the canary's *failure* path against an injected fake transport, with no network and no token.

## Non-goals

- No repository discovery and no author-email classification — `scripts/pipeline/discover.ts` and `scripts/pipeline/identity.ts` belong to KW-009, and this ticket does not depend on KW-009 and must not import `classify()`.
- No `git clone`, no `git log`, no event extraction — that is KW-013's token-free half (DEC-006).
- No bundle encoding, no writes under `public/data/v1/`, and no `data/.pipeline-state.json` — KW-014 owns emission, validation and persistence.
- No wire-format, chunking or codec definition — KW-012 owns `lib/bundle/schema.ts` and `lib/bundle/codec.ts`.
- No log2 banding and no ramp levels — `level(n)` lives in `lib/viz/tokens/level.ts` and belongs to KW-007.
- No workflow file and no secret wiring — `.github/workflows/data-bundle.yml` is KW-028's, and this ticket is deliberately not blocked by the missing `workflow` scope.
- No dependency additions, no `package.json` edits and no npm-script changes (DEC-003).
- No anonymous HTML profile scraping, not even as a fallback — a single source, always GraphQL (DEC-006).
- No copy strings and no hardcoded contribution figures outside test fixtures (DEC-008); `content/**` is KW-006's.
- No test files under `scripts/pipeline/__tests__/**` — that directory is KW-009's write surface. Verification for this ticket lives in the two files' `--self-check` mode.

## Existing owner and reuse target

There is no existing owner. `scripts/` does not exist at `e664d73a195facd64db58ba10952170ff01b4772` (verified: the repository root holds `components/`, `pages/`, `public/`, `styles/`, `docs/` and nothing else). Both files are new, and `scripts/pipeline/` is created by whichever of KW-009 / KW-010 lands first — the two tickets write disjoint filenames inside it, so `mkdir -p` is safe from either side.

Reuse targets, all created by named upstream ticket **KW-001** (do not install anything):

| Target | Where it comes from | How this ticket uses it |
|---|---|---|
| `@octokit/graphql` | KW-001 `package.json` dependency (DEC-003 pre-install list). Latest at researched commit is **9.0.3**; use the exact version KW-001 pinned. | `import { graphql, GraphqlResponseError } from "@octokit/graphql";` — `graphql.defaults({...})` for the authorized client, `GraphqlResponseError` for FORBIDDEN/SAML detection. |
| `zod` | KW-001 `package.json` dependency. Latest at researched commit is **4.4.3**. | Parse every GraphQL response before touching it, so a shape change fails loudly instead of producing `undefined` arithmetic. |
| Node 24 native TypeScript type stripping | KW-001 `engines.node: "24.x"` | `node scripts/pipeline/calendar.ts` runs the `.ts` file directly. Verified on Node v24.18.0: a `.ts` entry point runs, and a relative import **must** carry the `.ts` extension (`./calendar.js` fails with `ERR_MODULE_NOT_FOUND`). |
| `tsconfig.json` | KW-001 | Read-only. See the precondition in *Sibling boundaries and open gates* about `allowImportingTsExtensions`. |

`@octokit/graphql@9.0.3` is ESM-only (`"type": "module"`, `"engines": {"node": ">= 20"}`, MIT) and its published types are exactly:

```ts
export declare const graphql: import("./types.js").graphql;
export { GraphqlResponseError } from "./error.js";
// graphql<ResponseData>(query: string, parameters?: RequestParameters): Promise<ResponseData>
// graphql.defaults: (newDefaults: RequestParameters) => graphql
// class GraphqlResponseError<T> extends Error {
//   readonly errors: [{ type: string; message: string; path: [string]; ... }] | undefined;
//   readonly data: T; readonly headers: ResponseHeaders; readonly request: GraphQlEndpointOptions;
// }
```

Note that the top-level call resolves to the *data* object directly — there is no `.data` unwrapping — and it **throws** `GraphqlResponseError` when the response carries an `errors` array, even alongside partial data.

## Contract and invariants

This ticket is a producer. KW-014 (`scripts/pipeline/encode.ts`) is the sole consumer and must import these types rather than restate them. The following sketch is the contract; quote it verbatim downstream.

```ts
// scripts/pipeline/calendar.ts — producer contract

/** Injected transport. Keeps every fetch function testable without a token. */
export type GraphqlRequest = <T>(
  query: string,
  variables?: Record<string, unknown>,
) => Promise<T>;

/** Fixed two-actor identity set (ground truth). Do not widen it here. */
export type ActorLogin = "its-everdred" | "its-applekid";

/** One UTC day. `date` is `YYYY-MM-DD`. */
export interface CalendarDay {
  date: string;
  count: number;
}

export interface ActorCalendar {
  login: ActorLogin;
  /** Calendar year -> contributionCalendar.totalContributions. NEVER the sum of category totals. */
  yearTotals: Record<string, number>;
  /** Every day in [windowStart, windowEnd] ascending, zero days included, no gaps. */
  days: CalendarDay[];
}

export interface SamlCanary {
  ok: boolean;
  /** Always "ethereum-optimism/actions" unless the probe is overridden. */
  probeRepository: string;
  /** repository(owner,name) resolved to a non-null node. */
  sawRepository: boolean;
  /** >= 1 commitContributionsByRepository entry owned by the SAML org. The load-bearing check. */
  sawOrgContribution: boolean;
  /** Which one-year window satisfied sawOrgContribution, e.g. "2026". */
  window: string | null;
  checkedAt: string; // ISO-8601 UTC, second resolution
  detail: string;
}

export interface CalendarBundle {
  source: "github-graphql";
  generatedAt: string;  // ISO-8601 UTC, second resolution, the ONLY time-varying field
  windowStart: string;  // "2021-01-01"
  windowEnd: string;    // "2026-07-31"
  dayCount: number;     // 2038 for the window above
  canary: SamlCanary;
  actors: ActorCalendar[];
  /** mergeActorDays() output: ascending, one entry per day in the window. */
  combined: { date: string; e: number; a: number }[];
  /** Sum of every actor's yearTotals across the window. The figure the site displays. */
  combinedTotalNaive: number;
  /** Always null from this module. KW-014 fills it by joining KW-013's co-author trailers. */
  combinedTotalDeduplicated: number | null;
  /** [] on a clean run; ["calendar"] when a caller-supplied previous block was reused. */
  degraded: string[];
}

export function createContribClient(token: string): GraphqlRequest;
export function assertSamlVisibility(request: GraphqlRequest, now?: Date): Promise<SamlCanary>;
export function fetchActorYear(
  request: GraphqlRequest, login: ActorLogin, year: number,
): Promise<{ total: number; restricted: number; days: CalendarDay[] }>;
export function fetchCalendarBundle(
  request: GraphqlRequest,
  opts?: { windowStart?: string; windowEnd?: string; previous?: CalendarBundle },
): Promise<CalendarBundle>;
export function mergeActorDays(
  actors: ActorCalendar[], windowStart: string, windowEnd: string,
): CalendarBundle["combined"];
export class SamlCanaryError extends Error {
  readonly canary: SamlCanary;
}
```

```ts
// scripts/pipeline/private.ts — producer contract

export interface ActorPrivateSeries {
  login: ActorLogin;
  /** restrictedContributionsCount per month, ascending from pStart. Length === monthCount. */
  months: number[];
  hasAnyRestrictedContributions: boolean;
  total: number;
}

export interface PrivateAggregate {
  source: "github-graphql";
  generatedAt: string;
  pStart: string;     // "2021-01"
  monthCount: number; // 67 for 2021-01 .. 2026-07
  actors: ActorPrivateSeries[];
  /** Element-wise sum across actors. This array IS grid.json's `p`. */
  p: number[];
  /** Token identity. The series is viewer-relative; see the invariant below. */
  viewerLogin: string;
  degraded: string[];
}

export function monthWindows(
  pStart: string, monthCount: number,
): { key: string; from: string; to: string }[];
export function fetchPrivateAggregate(
  request: GraphqlRequest,
  opts?: { pStart?: string; monthCount?: number },
): Promise<PrivateAggregate>;
```

Invariants:

1. **Single source, no fallback.** Every number originates from authenticated GraphQL. Anonymous HTML is never read, not even on error. Mixing sources produces ±1–2 disagreements on 52 of 366 days and an unstable parser (C-1, DEC-006).
2. **Calendar totals come from `contributionCalendar.totalContributions`,** never from summing `commitContributions + pullRequestContributions + issueContributions + pullRequestReviewContributions`. The two disagree by 4–9 per user per year (2024: 2,454 vs 2,446; 2021: 318 vs 309; 2026: 2,791 vs 2,787).
3. **The canary is the first network action** of every entry point and every exported `fetch*` that opens its own client. A `SamlCanaryError` aborts before any figure is produced. The canary result is carried on the bundle so KW-014 can refuse to emit (`Never writes a bundle when KW-10's SAML canary failed`).
4. **Whole-week overhang is filtered.** `contributionCalendar.weeks` returns whole weeks and hands back days from the adjacent year. Query `[YYYY-01-01T00:00:00Z, YYYY-12-31T23:59:59Z]` and filter returned days to the requested year, then clip the assembled series to `[windowStart, windowEnd]`.
5. **`contributionsCollection` is capped at one calendar year per query.** 6 windows × 2 actors = 12 calendar queries. Do not attempt a multi-year window.
6. **Day series are dense.** Every date in the window appears exactly once in ascending ISO order with `count >= 0`; missing days are emitted as `0`. `days.length === dayCount` for every actor, and `combined.length === dayCount`.
7. **`generatedAt` is the only time-varying field.** Two runs over unchanged upstream data differ in exactly that one field — this is what lets KW-014 produce a one-line diff on a no-op day.
8. **The private series is viewer-relative.** `restrictedContributionsCount` counts contributions *the viewer cannot access*, so its value can legitimately fall when the token gains access. `viewerLogin` is emitted so a token-identity change is visible. Consequently the monotonic sanity check ("`combinedTotal` must not decrease") applies to calendar totals only, never to `p`.
9. **Zero private repository names, structurally.** No query in either file requests `repository { nameWithOwner }` or `repository { name }` on any `*ContributionsByRepository` connection. The canary requests `repository { owner { login } }` only — an organization login, never a repository name. A 67-month sweep that *did* request `nameWithOwner isPrivate` on all four connections leaked zero private names even to the repository owner with a repo-scoped PAT; GitHub structurally refuses. This module does not rely on that refusal — it does not ask.
10. **The token never appears in output.** It is read from `process.env.CONTRIB_TOKEN`, passed to `graphql.defaults` once, and never logged, never echoed in an error message, never included in `--json`, and never written to a file.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; do not silently change scope if something moved.

### Files

- **Create** `scripts/pipeline/calendar.ts`
- **Create** `scripts/pipeline/private.ts`

Nothing else. `git diff --name-only origin/main...HEAD` must list exactly these two paths.

### Exact GraphQL documents

Canary — run first, always, against `its-everdred`:

```graphql
query SamlCanary($owner: String!, $name: String!, $login: String!, $from: DateTime!, $to: DateTime!) {
  repository(owner: $owner, name: $name) {
    nameWithOwner
    isPrivate
    stargazerCount
  }
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { owner { login } }
        contributions { totalCount }
      }
    }
  }
  rateLimit { cost remaining }
}
```

Variables: `owner: "ethereum-optimism"`, `name: "actions"`, `login: "its-everdred"`, and the **current** calendar year window. Assertions, in order:

1. `repository` is non-null and `repository.nameWithOwner === "ethereum-optimism/actions"` and `repository.isPrivate === false`. A non-SSO token makes `@octokit/graphql` throw `GraphqlResponseError` with `errors[0].type === "FORBIDDEN"` and a message naming SAML enforcement; catch it and convert to `SamlCanaryError`.
2. **The load-bearing one:** at least one `commitContributionsByRepository` entry has `repository.owner.login === "ethereum-optimism"`. This is what catches the real failure mode — GitHub returns *empty results rather than errors* for un-granted SAML organizations, so assertion 1 alone is not sufficient. If the current-year window yields no such entry, retry once with the previous calendar year (the role began May 2025, so both 2025 and 2026 are populated today) before failing.
3. `rateLimit.remaining >= 50`, else back off and retry per the transport rules.

Calendar — 6 windows × 2 actors = 12 queries:

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
  rateLimit { cost remaining }
}
```

Private aggregate — 67 months × 2 actors = 134 queries:

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

`from` is the first instant of the month, `to` the last. Monthly (not daily) resolution is deliberate on two grounds: `contributionsCollection` returns a single scalar per window so daily resolution would cost 2,038 calls per actor, and a blob that pulses daily would leak a working pattern.

Cost: 12 + 134 + 1 canary = **147 points**, cost 1 each, against a PAT's 5,000 points/hour. The measured wall time for a 67-month single-actor sweep is ~36.6 s, so budget roughly 75 s for both actors. Monthly is also the incremental unit: once a year closes its calendar is immutable, so a warm run refetches only the current year for both actors (2 queries) plus the current month's restricted count (2 queries), with a full refetch forced on the 1st of each month to absorb backfills. Expose that through `opts.previous`; **persistence of the previous block is KW-014's job, not this ticket's.**

### Client factory

```ts
import { graphql, GraphqlResponseError } from "@octokit/graphql";

export function createContribClient(token: string): GraphqlRequest {
  if (!token) throw new Error("CONTRIB_TOKEN is required (GATE-003)");
  const client = graphql.defaults({
    headers: { authorization: `token ${token}`, "user-agent": "kevinweaver-dev-pipeline" },
  });
  return <T>(query: string, variables: Record<string, unknown> = {}) =>
    client<T>(query, variables);
}
```

### Transport rules

- Retry on non-200, on `GraphqlResponseError` whose `errors[].type` is `RATE_LIMITED`, and on network errors: sleep 1 s, 2 s, 4 s, 8 s, 4 attempts total.
- Never retry a `FORBIDDEN` SAML error — that is a gate failure, not a transport failure.
- A `rateLimit.remaining < 50` reading triggers the same backoff before the next call.
- After exhausting retries: if `opts.previous` carries the block, reuse it and push `"calendar"` onto `degraded`; otherwise throw. Never substitute another data source.
- **Empty-200 is a hard abort:** if the assembled `combinedTotalNaive` is `0`, or any actor's `days` array is empty, throw. This is the single most dangerous failure because it would silently blank the site.

### Window arithmetic

- `windowStart = "2021-01-01"`, `windowEnd = "2026-07-31"`, `dayCount = 2038` (verified arithmetically). Both are parameters with these defaults, never magic numbers scattered through the file.
- `pStart = "2021-01"`, `monthCount = 67`; `monthWindows()` must produce `key: "2021-01" … "2026-07"` with the last window ending `2026-07-31T23:59:59Z`.
- All date maths in UTC. Do not use `new Date(...)` on a bare `YYYY-MM-DD` string in a way that depends on local time; build instants explicitly with `Date.UTC`.

### Worked fixture (embed both in `--self-check`)

Expected per-year `contributionCalendar.totalContributions` for `its-everdred`, both regimes:

| year | blinded token (what a wrong PAT returns) | SSO-authorized / public profile |
|---|---|---|
| 2021 | 318 | 325 |
| 2022 | 233 | 237 |
| 2023 | 1,279 | 1,294 |
| 2024 | 2,454 | 2,459 |
| 2025 | **1,443** | **2,695** |
| 2026 (to 07-31) | **2,791** | **4,838** |

The right column sums to **11,848**; `its-applekid` contributes **1,512** over the same window for a combined **13,360**. Because 2026 is still open, assert 2026 as a **floor** (`>= 4838`) and 2025 as an equality band (`2695 ± 10`).

The 67-month private array measured for `its-everdred` — use it verbatim as the `--self-check` fixture for `monthWindows()` alignment and per-year rollup:

```json
{
  "pStart": "2021-01",
  "p": [21,12,21,23,18,6,0,2,2,0,0,0,0,0,0,0,1,0,2,4,8,15,35,23,77,45,110,76,62,24,75,216,90,122,91,42,121,278,258,200,110,126,169,208,158,290,152,292,213,228,91,72,42,33,34,68,65,83,33,36,23,25,40,101,68,109,122]
}
```

It has length **67**, sums to **5,071**, and rolls up per year to 2021=105, 2022=88, 2023=1,030, 2024=2,362, 2025=998, 2026=488 — within ±2 of the independently measured GT-4 counts (2022=86, 2023=1,028, 2024=2,360), which is month-boundary drift between two sweeps, not a defect. Encode the *shape* assertions (length 67, non-negative integers, per-year rollup arithmetic) in `--self-check`; do not assert the exact values, because the series is viewer-relative and will legitimately move once the SSO grant lands.

Trimmed `CalendarBundle` shape as emitted by `--json`:

```json
{
  "source": "github-graphql",
  "generatedAt": "2026-07-31T06:17:00Z",
  "windowStart": "2021-01-01",
  "windowEnd": "2026-07-31",
  "dayCount": 2038,
  "canary": {
    "ok": true,
    "probeRepository": "ethereum-optimism/actions",
    "sawRepository": true,
    "sawOrgContribution": true,
    "window": "2026",
    "checkedAt": "2026-07-31T06:16:58Z",
    "detail": "42 commit contributions to ethereum-optimism in 2026"
  },
  "actors": [
    { "login": "its-everdred", "yearTotals": {"2021":325,"2022":237,"2023":1294,"2024":2459,"2025":2695,"2026":4838},
      "days": [{"date":"2021-01-01","count":0}, "…2038 entries…"] },
    { "login": "its-applekid", "yearTotals": {"2026":1488}, "days": ["…2038 entries…"] }
  ],
  "combined": [{"date":"2021-01-01","e":0,"a":0}, "…2038 entries…"],
  "combinedTotalNaive": 13360,
  "combinedTotalDeduplicated": null,
  "degraded": []
}
```

### Double counting — emit, do not resolve

307 of 3,628 `aiur-team/aiur` commits are authored by one actor and co-authored by the other, so GitHub credits **both** calendars; corpus-wide the inflation is on the order of 5%. Co-authored-by trailers appear on 937 commits (25.8%), not the 1,116 / 30.8% an earlier pass reported. Deduplication requires the clone half's trailer data, which this module has no access to. Therefore emit `combinedTotalNaive` and leave `combinedTotalDeduplicated: null`; KW-014 joins KW-013's trailers if it wants the second figure. The recorded default is to display the naive sum, because that is the number a visitor sees when they cross-check both GitHub profiles.

### CLI surface

Both files end with a `main()` guarded by `if (import.meta.url === pathToFileURL(process.argv[1]).href)`. Flags:

- `--json` — run the live sweep, print the bundle as JSON to stdout, exit 0. Requires `CONTRIB_TOKEN`.
- `--canary` (calendar.ts only) — run only the canary, print the `SamlCanary` record, exit 0/1.
- `--self-check` — no network, no token. Runs the pure-helper assertions and the injected-transport canary-failure cases. Exit 0/1.

`--self-check` must cover, at minimum: `mergeActorDays()` produces 2,038 dense ascending entries from two sparse inputs; `monthWindows("2021-01", 67)` starts `2021-01`, ends `2026-07`, and every `to` is the last instant of its month; `assertSamlVisibility()` throws `SamlCanaryError` when the fake transport returns `repository: null`; and — the case that matters — it **also** throws when the transport returns a valid `repository` but a `commitContributionsByRepository` array containing no `ethereum-optimism` owner, for both the current and previous year windows. That second case is the regression test for GT-1.

### Language and lint constraints

- Node 24 strips types; it does not transform them. No `enum`, no `namespace`, no parameter properties. Use `import type` for type-only imports. Verified on Node v24.18.0.
- Relative imports must carry the `.ts` extension: `import { createContribClient, type GraphqlRequest } from "./calendar.ts";`. Verified: `./calendar.js` fails with `ERR_MODULE_NOT_FOUND`.
- Both files are ESM (`@octokit/graphql@9` is `"type": "module"`). No `require`.
- Parse responses with `zod` before use, e.g. `z.object({ user: z.object({ contributionsCollection: z.object({ contributionCalendar: z.object({ totalContributions: z.number().int(), weeks: z.array(...) }) }) }) })`. A schema drift then fails at the parse site with a readable path rather than as `NaN` three functions later.

## Acceptance and verification

### Agent gate

- `npm run typecheck` and `npm run lint` are green with both new files present.
- `node scripts/pipeline/calendar.ts --self-check` exits 0 with no network access and no `CONTRIB_TOKEN` set.
- `node scripts/pipeline/private.ts --self-check` exits 0 with no network access and no `CONTRIB_TOKEN` set.
- The SAML canary fails the run when given a non-SSO token: `--self-check` proves `assertSamlVisibility()` throws `SamlCanaryError` both when the probe repository resolves to `null` and when it resolves normally but the contributions connection contains no `ethereum-optimism` owner in either the current or the previous year window.
- `restrictedContributionsCount > 0 && hasAnyRestrictedContributions` is asserted in `fetchPrivateAggregate()` for `its-everdred`, and the assertion is exercised in `--self-check`.
- Zero private repo names in the output: `grep -nE 'nameWithOwner|repository \{ *name' scripts/pipeline/calendar.ts scripts/pipeline/private.ts` matches only the canary's `repository { nameWithOwner isPrivate stargazerCount }` probe of the public repository `ethereum-optimism/actions`, and no `*ContributionsByRepository` selection requests a repository name.
- `git diff --name-only origin/main...HEAD` lists exactly `scripts/pipeline/calendar.ts` and `scripts/pipeline/private.ts` — no `package.json`, no `package-lock.json`, no `tsconfig.json` (DEC-003).
- Neither file contains the string `CONTRIB_TOKEN` anywhere except a `process.env.CONTRIB_TOKEN` read and an error message that names the variable without printing its value.

### At-merge gate

- `ci-ok` is green on the exact PR head.
- No dependency, lockfile or npm-script change appears in the PR diff (DEC-003).
- The exported type names `CalendarBundle`, `PrivateAggregate`, `SamlCanary`, `GraphqlRequest`, `ActorLogin` and the exported function `mergeActorDays` match this document byte-for-byte, so KW-014 can import them without a rename.

### Human/manual evidence

- Operator, once GATE-003 closes: with the SSO-authorized `CONTRIB_TOKEN` exported, `node scripts/pipeline/calendar.ts --json` reports `canary.ok: true` and, for `its-everdred`, 2025 and 2026 totals that match the public profile within timezone noise (±10/yr) — i.e. 2025 = 2,695 ± 10 and 2026 ≥ 4,838 — rather than the blinded 1,443 / 2,791.
- Operator: the same command run with a PAT that has **not** been SSO-authorized exits non-zero and prints nothing on stdout.
- Operator: `node scripts/pipeline/private.ts --json` reports `hasAnyRestrictedContributions: true` for `its-everdred` and its output contains zero repository names.

## Failure, security, migration, and accessibility cases

**Failure — silent SAML blindness (primary).** GitHub answers un-granted SAML organizations with empty result sets, not errors. Mitigated by the two-part canary, by carrying `SamlCanary` on the bundle, and by KW-014's rule that it never writes a bundle when the canary failed. This is the defect that made two research tracks publish numbers ~3,299 low.

**Failure — GraphQL 403 / secondary rate limit.** Backoff 1/2/4/8 s over 4 attempts plus a `rateLimit.remaining < 50` guard. At 147 points against 5,000/hour this should never fire.

**Failure — empty 200.** Zero total or an empty day array aborts the run. Never emit a zeroed series.

**Failure — whole-week overhang.** `contributionCalendar.weeks` returns days from the adjacent year; unfiltered, that double-counts the boundary. Filter to the requested year, then clip to the window.

**Failure — category-total drift.** Summing the four contribution categories instead of reading `totalContributions` is off by 4–9 per user per year. Read the calendar total.

**Failure — degraded runs.** A reused previous block must be visible: `degraded: ["calendar"]` propagates to the manifest so a stale figure is never presented as fresh (DEC-008's freshness contract, and the honest `fresh · Nh ago` pill KW-026 drives from `generatedAt`).

**Security — credential handling.** `CONTRIB_TOKEN` is read from the environment only. It is never logged, never echoed in an error, never serialized into `--json`, and never written to disk. Errors from `@octokit/graphql` carry `request` including headers — scrub or omit `error.request` when reporting; print `error.errors[].type` and `error.errors[].message` only.

**Privacy — private repository names.** Structurally prevented: no query in either file selects a repository name on any contributions connection. The private data this ticket handles is a monthly integer count and nothing else. This is the entire content of the "blurred aggregate" and it is already public on Kevin's profile because he opted into sharing private contribution counts.

**Privacy — viewer-relative series.** Granting the token access to previously-invisible organizations can *reduce* `restrictedContributionsCount` while the calendar total is unchanged. `viewerLogin` is emitted so a token-identity change is auditable, and the monotonic sanity check downstream must not be applied to `p`.

**Migration.** None. Both files are new; nothing reads them until KW-014 lands.

**Accessibility.** Not applicable — this ticket ships no UI, no markup and no colour. The accessibility consequences of the data it produces are owned by KW-007 (ramp fixtures), KW-025 (canvas semantics) and KW-029 (the a11y gate).

## Surfaces

- Reads: docs/research/2026-07-31-decomposition-synthesis.md, docs/research/2026-07-31-data-pipeline.md, package.json, tsconfig.json
- Writes: scripts/pipeline/calendar.ts, scripts/pipeline/private.ts
- Contracts: scripts/pipeline/calendar.ts#CalendarBundle, scripts/pipeline/calendar.ts#GraphqlRequest, scripts/pipeline/private.ts#PrivateAggregate
- Safety: secret:CONTRIB_TOKEN, privacy:restricted-contribution-aggregate

## Sibling boundaries and open gates

Wave-2 siblings write disjoint files; the write-surface partition is what keeps this wave parallel, so do not touch anything below.

| Adjacent ticket | Owns | Boundary for this ticket |
|---|---|---|
| KW-001 | `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `.github/workflows/ci.yml` | Read-only. `package.json` is frozen (DEC-003). Do not add `tsx`, `dotenv`, `graphql`, or any HTTP client. |
| KW-009 | `scripts/pipeline/discover.ts`, `scripts/pipeline/identity.ts`, `scripts/pipeline/__tests__/**` | Same directory, disjoint filenames. Do not add files under `__tests__/`; do not import `classify()` — this ticket does not depend on KW-009. |
| KW-012 | `lib/bundle/{schema,codec,frontcode}.ts` | Owns the wire format, chunking and the `grid.json` layout. This ticket emits an in-memory shape, not a bundle. |
| KW-007 | `lib/viz/tokens/{ramp,level}.ts` | Owns log2 banding and `level(n)`. Do not compute levels here. |
| KW-013 | `scripts/pipeline/{clone,extract}.ts` | The token-free half (DEC-006). Do not clone, do not shell out to `git`. |
| KW-014 | `scripts/pipeline/{encode,validate,state}.ts`, `data/.pipeline-state.json` | The sole consumer. It persists the previous block, joins co-author trailers, and refuses to emit when `canary.ok` is false. Do not write state files here. |
| KW-028 | `.github/workflows/data-bundle.yml` | Wires `CONTRIB_TOKEN` into the scheduled run. Deliberately not this ticket, so KW-010 is not blocked by the missing `workflow` push scope (GATE-002). |
| KW-006 | `content/**` | Owns copy. No contribution figure may become a literal in copy (DEC-008). |

**GATE-003 (HG-3) — open.** The operator must mint a PAT with `read:user`, authorize it for `ethereum-optimism`, and store it as repository secret `CONTRIB_TOKEN`. It blocks the *Human/manual evidence* bullets only. Write, test and merge the modules against `--self-check` and an injected transport while the gate is open; KW-014's refusal rule guarantees no wrong figure can ship in the meantime.

**Upstream precondition to verify at pickup, not to work around.** Node 24 requires the `.ts` extension on the relative import in `private.ts`, and TypeScript rejects a `.ts` import specifier unless `compilerOptions.allowImportingTsExtensions` is `true` (error TS5097; it is compatible with the `"noEmit": true` that KW-001's `tsconfig.json` already sets). If `npm run typecheck` reports TS5097, that is a KW-001 defect: report it on this ticket and on KW-001 and keep the runtime-correct `.ts` specifier. Do **not** restructure the two modules to dodge it, and do **not** edit `tsconfig.json` from this ticket — the file belongs to KW-001 and is outside this write surface.
