# KW-009 — Pipeline A: repo discovery and identity allowlist

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Two small, pure, dependency-free TypeScript modules: a static author-email allowlist with one classifier function, plus one GraphQL query repeated over 6 years x 2 logins. Every number and address is already measured in the research corpus, so the work is transcription, typing, and fixtures rather than discovery.

**Risk:** Medium. The allowlist is the site's attribution ground truth: one missing address silently deletes real work from the animation, and one loose matcher silently attributes 500+ third-party commits to Kevin. Discovery is also token-sensitive — a token without a SAML grant returns a strictly smaller repo set (see GATE-003), so the module must be honest about what it saw rather than assert a fixed count.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-005, REQ-006, REQ-008

**Decisions:** DEC-006, DEC-008

**Gates:** none

**Workstream:** data

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

`scripts/pipeline/identity.ts` and `scripts/pipeline/discover.ts` exist as pure, network-injectable Node modules: `classify(authorEmail)` resolves a commit author to exactly one of the two actor logins or `null`, and `discoverRepos(client, opts)` returns the deterministic, `nameWithOwner`-sorted set of repositories in scope plus a computed `repoCountDefinition`. Both are unit-tested offline, including against the measured third-party-identity fixture, and running discovery twice over the same input yields byte-identical JSON.

## Context and evidence

The site's two data halves both start here. Everything downstream — the animation's file-touch stream (KW-013), the encoded bundle (KW-014), the repo circles in the Gource view (KW-012's `repos.json`) — is a projection of "which repos" and "whose commits". Getting either wrong is not a rendering bug; it is a false claim about a person on his own resume.

**Why this ticket exists, with the measurements behind it:**

- **GT-7 — repo scope.** Counting definitions disagree wildly: for `its-everdred` the REST `public_repos` field is 77, owner-public-non-fork is 50, including member affiliations is 85, and `repositoriesContributedTo` returns only **22**. `repositoriesContributedTo` is therefore the wrong source. The right scope is the union of the four `*ContributionsByRepository` connections on `contributionsCollection`, over 6 years x 2 logins, which measured **67 distinct public repos, 0 private** — a set that reaches orgs the token has no membership in (`0xmetropolis`, `ConsenSys-archive`, `ethereum`, `alchemyplatform`, `Uniswap`, `base`, `wevm`, `farcasterxyz`, `INFURA`, `sapsaldog`).
- **GT-3 / C-10 / DEC-006 — the pipeline splits by auth surface.** The clone half needs no token at all; the GraphQL half does. Discovery sits on the GraphQL side, so its result is only as complete as the token it was handed. Re-verified at planning time: a `repository(owner:"ethereum-optimism", name:"actions")` query under the current token returns `FORBIDDEN` with `extensions.saml_failure: true`, and a 2026 discovery sweep for `its-everdred` returns eight commit-contribution repos with **no `ethereum-optimism` entry at all**. This ticket does not fix that — KW-010 owns the SAML canary and GATE-003 owns the credential — but the module must not paper over it.
- **DEC-008 — no contribution figure is a literal anywhere in copy.** The payload carries `generatedAt`, `windowStart`, `windowEnd`, `dayCount` and `repoCountDefinition`. Discovery owns the `repoCountDefinition` half: it emits both the definition name and the number it computed, so a reader can always tell which of GT-7's five counts is on screen. The synthesis recommends `ownerPublicNonFork` and writes it as "50 + 8"; measured live at planning time, `its-everdred` is 50 owner-public-non-fork (27 forks, 77 public total) and `its-applekid` is **4** owner-public-non-fork (4 forks, 8 public total). The "8" in the synthesis is `its-applekid`'s public total, not its non-fork subset. The module must compute the number rather than carry either literal.
- **Attribution, measured on the real 3,628-commit `aiur-team/aiur` history.** Committer email is useless: **649 of 3,628 (17.9%)** commits have their committer rewritten to `GitHub <noreply@github.com>` by web-UI squash merges, which alone would lose 344 of `its-applekid`'s commits. Display name is catastrophic: a scan of 3,865 distinct identities across the corpus found **13 other Kevins and a second Weaver**, with `Kevin Bluer <kevin@bluer.com>` at 427 commits on his own; a `/kevin|weaver/i` matcher misattributes roughly 555 commits. **Author email only.**
- **The allowlist is a strict superset of GitHub's own attribution.** Cross-checking the GitHub commits API against the local allowlist: `api \ local = 0` for both actors (zero false negatives), `local \ api = 91`, of which **89 are the bare `<login>@users.noreply.github.com` form and 2 are `kevinw@oplabs.co`**. The verification pass corrected the earlier claim that all 91 were bare-noreply.
- **C-8 — do not prune zero-commit repos.** The original recommendation (gate the clone on `commitContributionsByRepository[].contributions.totalCount > 0`) was refuted: its own headline example, `ethereum/ethereum-org-website`, does yield an attributable commit, so the gate would not prune the 82 MB it was introduced to save. Actual zero-event repos are 15 totalling 21.3 MB; pruning takes 145 MB to ~124 MB, not to 50 MB, and cold clone is 40-45 s regardless. Discovery therefore returns everything it found and performs no pruning.

**Plan context, pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:**

- Pack index and ID mapping (KW-09 in the synthesis is `KW-009` here): `docs/build-orders/site-rewrite/README.md`
- Wave and graph analysis, verified topological levels, write-surface partition: `docs/research/2026-07-31-decomposition-synthesis.md` sections 5-6
- Decision registry (D-01..D-17 map 1:1 to DEC-001..DEC-017) and human gates (HG-1..HG-7 map to GATE-001..GATE-007): `docs/build-orders/site-rewrite/03-technical-decisions.md`, synthesis sections 3-4
- This ticket's implementation pointers, verbatim source of record: `docs/research/2026-07-31-decomposition-synthesis.md`, entry "KW-09 — Pipeline A: repo discovery + identity allowlist"
- Underlying measurements: `docs/research/2026-07-31-data-pipeline.md` sections 3, 5 and its `## Verification corrections` (VC-6, VC-7), which override the body of that document where they disagree
- Browse pinned: `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/`

**Requirements this ticket carries:**

- **REQ-005** — Every repository and contribution figure the site displays is derived from measured GitHub data at generation time; no figure is a literal in copy or code.
- **REQ-006** — Commit authorship is attributed to exactly the two actor logins by author-email allowlist, with zero false positives from same-name third parties and zero silent false negatives.
- **REQ-008** — The data pipeline is a deterministic function of its inputs: the same inputs produce byte-identical output on every run.

## Scope

- Create `scripts/pipeline/identity.ts`: the two-actor author-email allowlist, the `ActorLogin` / `ActorId` types, `classify(authorEmail)` and `actorId(login)`.
- Create `scripts/pipeline/discover.ts`: `discoverRepos(client, opts)`, which unions the four `*ContributionsByRepository` connections over 6 one-year windows x 2 logins and returns a `nameWithOwner`-ascending, deterministic repo scope.
- Compute and return `repoCountDefinition` from the API rather than hardcoding any of GT-7's five conflicting counts (DEC-008).
- Accept the GraphQL client as an injected parameter so both modules are import-safe, side-effect free, and testable with zero network access.
- Add unit tests under `scripts/pipeline/__tests__/**` covering allowlist positives, both `users.noreply.github.com` forms, the measured third-party negatives, discovery union/sort determinism, and the connection-truncation guard.
- Add the measured third-party-identity fixture that pins the "other Kevins" negatives as data rather than as prose.

## Non-goals

- No cloning, no `git log`, no event extraction, no per-repo failure/stale handling — KW-013 owns `scripts/pipeline/clone.ts` and `scripts/pipeline/extract.ts`.
- No contribution calendar, no `restrictedContributionsCount`, no private monthly aggregate, and no SAML canary assertion — KW-010 owns `scripts/pipeline/calendar.ts` and `scripts/pipeline/private.ts` and is the ticket gated on GATE-003.
- No bundle schema, encoder, validator, chunking, front-coding or state file — KW-012 owns `lib/bundle/**`, KW-014 owns `scripts/pipeline/{encode,validate,state}.ts` and `data/.pipeline-state.json`.
- No workflow file, no schedule, no secret wiring, no first-byte budget step — KW-028 owns `.github/workflows/data-bundle.yml` and `scripts/pipeline/budget.ts`.
- No edits to `package.json` or `package-lock.json` — frozen by KW-001 (DEC-003). No new runtime dependency may be added by this ticket.
- No edits to `tsconfig.json`, `eslint.config.mjs`, or `vitest.config.mts` — owned by KW-001, KW-008 and KW-011 respectively.
- No pruning of zero-commit repositories, and no repo-list caching or incremental logic (C-8; caching belongs to KW-013's clone cache).
- No emission of a timestamp from `discoverRepos` — a `generatedAt` field inside this result would break REQ-008 determinism. KW-014 stamps `generatedAt` into the manifest.

## Existing owner and reuse target

**There is no existing owner.** At `e664d73a195facd64db58ba10952170ff01b4772` the repository has no `scripts/` directory at all (`git ls-tree -r` at that commit lists 49 files: `pages/**`, `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss`, `docs/**`, and the Next 10 / React 17 `package.json`). This ticket creates `scripts/pipeline/` for the first time.

Reuse targets that must exist before pickup, all created by **KW-001**:

- `tsconfig.json`, `eslint.config.mjs`, `.nvmrc` and `engines.node: "24.x"` — the TypeScript and lint configuration these modules are checked against.
- The frozen dependency set (DEC-003), which pre-installs `vitest@4.1.10` and `@octokit/graphql` so no install is needed here. Note that `discover.ts` must **not** import `@octokit/graphql` — the client is injected — so this ticket has no hard version coupling to it. For reference, the latest published `@octokit/graphql` at planning time is `9.0.3`.
- The pre-declared npm scripts `lint`, `typecheck`, `typegen`, `test:unit`, `data:build`.

Reuse target from the platform rather than the repo: **Node 24 native TypeScript type stripping**. Verified on Node `v24.18.0` at planning time — `node main.ts` executes a `.ts` entrypoint directly with no transpiler, provided relative imports carry the explicit `.ts` extension and the code uses erasable syntax only (no `enum`, no `namespace`, no parameter properties, no `experimental` decorators).

**If KW-001 is unmerged when you pick this up:** write both modules and their tests anyway — they depend on no symbol from KW-001, only on its configuration. Run the tests with `npx vitest run scripts/pipeline` (vitest's zero-config default `include` already matches `**/*.test.ts`) and note in the PR body that `npm run typecheck` could not be exercised until KW-001 lands.

## Contract and invariants

This ticket is a **producer**. KW-013 (`extract.ts`) consumes `classify`; KW-013 and KW-014 consume the discovery result. The two sketches below are the contract; consumers quote them verbatim. They are *typespecs*: signatures and declarations are normative, and the implementation supplies the bodies and the `const` initializers.

### `scripts/pipeline/identity.ts`

```ts
export type ActorLogin = 'its-everdred' | 'its-applekid';
export type ActorId = 0 | 1;

/** Stable actor ids. Order is fixed forever: it is written into the bundle. */
export const ACTOR_IDS: Readonly<Record<ActorLogin, ActorId>> = {
  'its-everdred': 0,
  'its-applekid': 1,
};

/** Exact-match addresses, lowercased. Never a substring or name match. */
export const ALLOWLIST: Readonly<Record<ActorLogin, readonly string[]>>;

/** `<numericId>+<login>@users.noreply.github.com`, per actor. */
export const NOREPLY_PATTERNS: Readonly<Record<ActorLogin, RegExp>>;

/**
 * Classify a commit's AUTHOR email. Never the committer email, never the
 * display name. Returns null for every third party, including addresses
 * that contain "kevin" or "weaver".
 */
export function classify(authorEmail: string | null | undefined): ActorLogin | null;

/** Total function over ActorLogin; used to write the bundle's `a` column. */
export function actorId(login: ActorLogin): ActorId;
```

Invariants:

1. `classify` takes **one string** and nothing else. A display name is not an input, so name-based misattribution is impossible by construction rather than by discipline.
2. Matching is case-insensitive and whitespace-trimmed; RFC-5322 display forms such as `Kevin Weaver <kevinweaver2@gmail.com>` are **not** accepted — callers pass the bare address (`git log --pretty=%ae`).
3. Both `users.noreply.github.com` forms match: the bare `<login>@users.noreply.github.com` **and** the numeric `<id>+<login>@users.noreply.github.com`. Both appear in the measured corpus; the numeric ids are `1020682` for `its-everdred` and `257914776` for `its-applekid`, but the pattern must match **any** numeric prefix rather than pinning the id.
4. `classify` is total, pure and allocation-light: no `throw`, no I/O, no env reads. `null`, `undefined` and `''` return `null`.
5. The allowlist is **append-only**. Removing an address is a data-loss change and requires an explicit decision record.

The exact allowlist, transcribed from the measured corpus:

| Actor | Addresses |
|---|---|
| `its-everdred` | `kevinw@oplabs.co`, `its.everdred@gmail.com`, `kevinweaver2@gmail.com`, `its-everdred@users.noreply.github.com`, `/^\d+\+its-everdred@users\.noreply\.github\.com$/` |
| `its-applekid` | `its.applekid@gmail.com`, `its-applekid@users.noreply.github.com`, `applekid.mail@proton.me`, `/^\d+\+its-applekid@users\.noreply\.github\.com$/` |

`applekid.mail@proton.me` carries only 3 commits and is the address most likely to be dropped by accident; it is in the allowlist deliberately. `kevin@stitchfix.com` appeared in an earlier draft script and is **not** in the allowlist — it is dead and its own author regex could never surface it.

### `scripts/pipeline/discover.ts`

```ts
import type { ActorLogin } from './identity.ts';

export interface DiscoveredRepo {
  nameWithOwner: string;          // canonical id, e.g. "aiur-team/aiur"
  isPrivate: boolean;             // always false in the measured corpus
  isFork: boolean;
  isArchived: boolean;
  stargazerCount: number;
  createdAt: string;              // ISO-8601 as returned by GitHub
  /** Union across every window and every actor, per contribution category. */
  contributions: {
    commit: number;
    pullRequest: number;
    issue: number;
    pullRequestReview: number;
  };
}

export interface RepoCountDefinition {
  definition: 'ownerPublicNonFork';
  count: number;                              // sum over byActor
  byActor: Readonly<Record<ActorLogin, number>>;
}

export interface DiscoveryResult {
  windowStart: string;                        // "2021-01-01T00:00:00Z"
  windowEnd: string;                          // "2026-12-31T23:59:59Z"
  actors: readonly ActorLogin[];
  repos: readonly DiscoveredRepo[];           // sorted by nameWithOwner ASC
  repoCountDefinition: RepoCountDefinition;
  queryCost: number;                          // summed rateLimit.cost
}

/** Injected transport. No default, no module-scope client, no env reads. */
export type GraphQlClient = <T>(
  query: string,
  variables: Record<string, unknown>,
) => Promise<T>;

export interface DiscoverOptions {
  logins: readonly ActorLogin[];
  fromYear: number;                           // 2021
  toYear: number;                             // 2026
  maxRepositories?: number;                   // default 100, the API maximum
}

export function discoverRepos(
  client: GraphQlClient,
  options: DiscoverOptions,
): Promise<DiscoveryResult>;
```

Invariants:

1. **Deterministic output.** `repos` is sorted by `nameWithOwner` ascending using a fixed comparator (`a < b ? -1 : a > b ? 1 : 0` on the raw strings — not `localeCompare`, whose result varies with ICU data). No field in `DiscoveryResult` varies with wall-clock time. `JSON.stringify` of two runs over the same responses is byte-identical.
2. **Union, not intersection.** A repo qualifies if it appears in *any* of the four connections for *any* actor in *any* window. Category counts are summed across all of them.
3. **No pruning.** Repos with `contributions.commit === 0` are returned (C-8).
4. **Truncation is an error, not a silent loss.** `maxRepositories` is capped at 100 by the API. If any single connection returns exactly `maxRepositories` entries, throw — the response was silently truncated and the scope is incomplete. Measured today, the largest single-window connection returns 9 entries, so this guard should never fire in practice; when it does, it is real.
5. **`repoCountDefinition` is computed, never asserted.** It comes from a separate per-login query (`repositories(ownerAffiliations: [OWNER], privacy: PUBLIC, isFork: false) { totalCount }`) and reports which definition produced the number.
6. **No env, no secrets, no `process` access.** The client is the only way out of the module. This is what makes GATE-003 someone else's problem: whichever token the caller wired in is the token discovery saw.
7. **`isPrivate: true` must never reach the output.** Filter it out and count it; the measured corpus is 0 private, and a private `nameWithOwner` on the wire would be a disclosure.

### Worked data shape

A complete two-repo `DiscoveryResult`, the fixture the round-trip test asserts against. Repository metadata is measured; the per-category counts are fixture values chosen to exercise the union across all four connections:

```json
{
  "windowStart": "2021-01-01T00:00:00Z",
  "windowEnd": "2026-12-31T23:59:59Z",
  "actors": ["its-everdred", "its-applekid"],
  "repos": [
    {
      "nameWithOwner": "aiur-team/aiur",
      "isPrivate": false,
      "isFork": false,
      "isArchived": false,
      "stargazerCount": 2,
      "createdAt": "2026-05-18T00:26:04Z",
      "contributions": { "commit": 3100, "pullRequest": 118, "issue": 14, "pullRequestReview": 10 }
    },
    {
      "nameWithOwner": "its-everdred/gary",
      "isPrivate": false,
      "isFork": false,
      "isArchived": false,
      "stargazerCount": 1,
      "createdAt": "2025-11-09T21:03:08Z",
      "contributions": { "commit": 300, "pullRequest": 30, "issue": 4, "pullRequestReview": 2 }
    }
  ],
  "repoCountDefinition": {
    "definition": "ownerPublicNonFork",
    "count": 54,
    "byActor": { "its-everdred": 50, "its-applekid": 4 }
  },
  "queryCost": 14
}
```

`count: 54` is what the live API returns today (50 + 4). It is in the fixture as an *expected computed value*, not as a constant in `discover.ts`.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`; re-verify at pickup and report drift rather than silently widening scope.

### Files to create

| Path | Contents |
|---|---|
| `scripts/pipeline/identity.ts` | `ActorLogin`, `ActorId`, `ACTOR_IDS`, `ALLOWLIST`, `NOREPLY_PATTERNS`, `classify`, `actorId` |
| `scripts/pipeline/discover.ts` | `DiscoveredRepo`, `RepoCountDefinition`, `DiscoveryResult`, `GraphQlClient`, `DiscoverOptions`, `discoverRepos`, and the two exported query strings `DISCOVERY_QUERY` / `REPO_COUNT_QUERY` |
| `scripts/pipeline/__tests__/identity.test.ts` | allowlist positives, both noreply forms, third-party negatives, totality |
| `scripts/pipeline/__tests__/discover.test.ts` | union, sort determinism, truncation guard, private filter, stub-client call accounting |
| `scripts/pipeline/__tests__/fixtures/third-party-identities.json` | the measured non-Kevin identities, as data |
| `scripts/pipeline/__tests__/fixtures/discovery-response.json` | recorded GraphQL responses for two windows x two logins |

No other file may be touched.

### The exact discovery query

Every field and argument below was introspected against the live GraphQL schema at planning time (`ContributionsCollection` exposes exactly `commitContributionsByRepository`, `issueContributionsByRepository`, `pullRequestContributionsByRepository`, `pullRequestReviewContributionsByRepository`; the first and last take only `maxRepositories`, the middle two also take `excludeFirst` / `excludePopular`; `Repository` exposes `nameWithOwner`, `isPrivate`, `isFork`, `isArchived`, `stargazerCount`, `createdAt`).

```graphql
query Discover($login: String!, $from: DateTime!, $to: DateTime!, $max: Int!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: $max) {
        repository { nameWithOwner isPrivate isFork isArchived stargazerCount createdAt }
        contributions { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: $max) {
        repository { nameWithOwner isPrivate isFork isArchived stargazerCount createdAt }
        contributions { totalCount }
      }
      issueContributionsByRepository(maxRepositories: $max) {
        repository { nameWithOwner isPrivate isFork isArchived stargazerCount createdAt }
        contributions { totalCount }
      }
      pullRequestReviewContributionsByRepository(maxRepositories: $max) {
        repository { nameWithOwner isPrivate isFork isArchived stargazerCount createdAt }
        contributions { totalCount }
      }
    }
  }
  rateLimit { cost remaining }
}
```

```graphql
query RepoCount($login: String!) {
  user(login: $login) {
    repositories(ownerAffiliations: [OWNER], privacy: PUBLIC, isFork: false) { totalCount }
  }
  rateLimit { cost remaining }
}
```

Windowing: `contributionsCollection` is capped at **one calendar year per query**. Issue 6 windows (2021..2026) x 2 logins = **12 queries**, plus 2 `RepoCount` queries = **14 total, cost 1 each** (measured: `rateLimit.cost` is 1 for both query shapes). Window bounds are `[YYYY-01-01T00:00:00Z, YYYY-12-31T23:59:59Z]` with no overlap. The `GITHUB_TOKEN` budget is 1,000 requests/hour/repository, so this is ~1.4% of budget.

Live sanity check performed at planning time (2026 window, `its-everdred`): the commit connection returned 8 repositories — `aiur-team/aiur`, `its-everdred/gary`, `its-everdred/skills`, `its-everdred/kevinweaver-dev`, `its-everdred/dotfiles`, `etherguild/ethismoney.xyz`, `etherguild/etherguild.xyz`, `its-everdred/rancho-del-vote` — and the pull-request connection returned 9, including `its-applekid/actions`, `its-everdred/symphony` and `ethereum/ethereum-foundation-website`. This is a useful smoke expectation but **must not** be asserted in a unit test: it changes daily.

### The third-party negatives fixture

`scripts/pipeline/__tests__/fixtures/third-party-identities.json` — every entry is a measured identity from the 3,865-identity corpus scan and every one must classify to `null`:

```json
[
  { "email": "kevin@bluer.com",                    "name": "Kevin Bluer",     "commits": 427 },
  { "email": "schwindt.kevin@gmail.com",           "name": "Kevin Schwindt",  "commits": 80 },
  { "email": "weaver.skylar@gmail.com",            "name": "Skylar Weaver",   "commits": 6 },
  { "email": "kevin.smith@circle.com",             "name": "Kevin Smith",     "commits": 6 },
  { "email": "kevin.kx.wang@gmail.com",            "name": "Kevin Wang",      "commits": 3 },
  { "email": "sapsaldog@gmail.com",                "name": "third party",     "commits": 1 },
  { "email": "kevinweaver@kevins-work-mbp.local",  "name": "Kevin Weaver",    "commits": 2 }
]
```

The last row is the sharpest test in the suite: it is Kevin's own name and a misconfigured local git identity, it is not linked to any GitHub account, and GitHub does not count it either — so `classify` must return `null` and the animation loses 2 file-touch events by design, keeping it consistent with the grid.

The corpus scan recorded 13 other Kevins plus a second Weaver, but only the addresses above were written down; the remaining names were recorded without addresses. Do **not** invent addresses for them. The structural guarantee — `classify` accepts an email and nothing else — is what covers the unrecorded ones, and one test asserts that the exported surface contains no name-matching regex at all.

### Module-boundary rule, verified

`discover.ts` needs the `ActorLogin` type from `identity.ts` and nothing else from it. Use a **type-only** import with the explicit `.ts` extension:

```ts
import type { ActorLogin } from './identity.ts';
```

This was verified two ways at planning time. Node `v24.18.0` executes `.ts` entrypoints directly and erases type-only imports entirely, so there is no runtime resolution at all. And `tsc` 5.9.3 with `moduleResolution: "bundler"`, `noEmit: true` and **no** `allowImportingTsExtensions` accepts the type-only form while rejecting a value import of the same path with `error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled`.

Therefore: **never add a value import between these two files.** If a future need arises, the fix is a KW-001 `tsconfig.json` change, not an edit here — `tsconfig.json` is outside this ticket's write surface. Record it as a deferred finding in the PR body instead.

### Test runner

Tests are plain vitest, named `*.test.ts` so that KW-011's `node` project (`include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts']`) picks them up once it lands. Until then they run under vitest's zero-config default include:

```bash
npx vitest run scripts/pipeline
```

Do not add or edit `vitest.config.mts` — it is KW-011's write surface, and creating it here would collide.

The discovery tests use a stub client with a call counter, never the network:

```ts
const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
const stub: GraphQlClient = async (query, variables) => {
  calls.push({ query, variables });
  return fixtureFor(variables.login as string, variables.from as string) as never;
};
```

Assert `calls.length === 14` for a 6-year, 2-login run, and assert that no test process ever opened a socket by keeping the modules free of any transport import.

### Version pins

- Node **24.x** (`engines.node`, `.nvmrc`, both set by KW-001); verified on `v24.18.0`.
- `vitest@4.1.10`, installed by KW-001 under DEC-003. Do not install anything.
- `typescript@5.9.3` (KW-001's pin, deliberately not `latest`, which resolves to 7.x).
- `@octokit/graphql` is *not* imported here. Latest published at planning time is `9.0.3`, for whoever wires the real client in KW-014.

## Acceptance and verification

### Agent gate

- `npx vitest run scripts/pipeline` is green, and `npm run typecheck` and `npm run lint` are green with both new modules and their tests present.
- `classify()` returns `its-everdred` for `kevinw@oplabs.co`, `its.everdred@gmail.com`, `kevinweaver2@gmail.com` and `its-everdred@users.noreply.github.com`; returns `its-applekid` for `its.applekid@gmail.com`, `its-applekid@users.noreply.github.com` and `applekid.mail@proton.me`; and returns the right actor for both `<numericId>+<login>@users.noreply.github.com` forms.
- `classify()` returns `null` for every entry in `scripts/pipeline/__tests__/fixtures/third-party-identities.json`, including `kevin@bluer.com` and `kevinweaver@kevins-work-mbp.local`, and for `null`, `undefined` and the empty string.
- `discoverRepos()` run twice over the same recorded fixture produces byte-identical `JSON.stringify` output, with `repos` ordered by `nameWithOwner` ascending under a raw string comparator.
- `discoverRepos()` throws when any single connection in the fixture returns exactly `maxRepositories` entries, and omits every `isPrivate: true` repository from `repos`.
- `repoCountDefinition` is computed from the `RepoCount` query result and carries `definition: "ownerPublicNonFork"`; no repository count literal appears anywhere in `scripts/pipeline/discover.ts`.
- Both modules are side-effect free at import: no network client, no `node:fs`, no `node:child_process`, no `process.env` read, and the GraphQL client reaches `discoverRepos` only as a parameter, proved by a stub-client test that asserts the exact call count of 14.
- `node scripts/pipeline/identity.ts` and `node scripts/pipeline/discover.ts` both load on Node 24 with no transpiler, proving erasable-syntax-only compliance.

### At-merge gate

- `ci-ok` is green on the exact PR head.
- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on Node 24 in CI.
- The PR diff touches only `scripts/pipeline/discover.ts`, `scripts/pipeline/identity.ts` and `scripts/pipeline/__tests__/**` — no `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs` or `vitest.config.mts` changes.
- The diff contains no token, no secret, no private repository name, and no hardcoded contribution or repository-count figure outside the test fixtures.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure modes.**

- *Incomplete scope under a token without a SAML grant.* Re-verified at planning time: `ethereum-optimism` resources return `FORBIDDEN` with `saml_failure: true`, and the org is absent from a 2026 discovery sweep. `discoverRepos` must not compensate, guess, or hardcode. It reports what it saw; KW-010 owns the canary and GATE-003 owns the credential. Surface `queryCost` and the repo count so a caller can compare runs.
- *Silent connection truncation.* GraphQL caps `maxRepositories` at 100 and truncates without error. Invariant 4 turns that into a thrown error.
- *Non-deterministic ordering.* `localeCompare` depends on the ICU build; a runner difference would renumber every repo id and invalidate every previously published chunk. Use a raw string comparator.
- *Rate limiting.* 14 queries at cost 1 against a 1,000/hour/repository budget. If `rateLimit.remaining` in a response is below 50, throw with the remaining count in the message rather than continuing into a partial scope.
- *Address drift.* If Kevin adds a git identity, discovery keeps working but attribution silently drops those commits. The allowlist is append-only and the `local \ api = 91` / `api \ local = 0` relationship is the regression check: the allowlist must stay a strict superset of GitHub's own attribution.

**Security and privacy.**

- The private-contribution aggregate deliberately carries no repo name, path, branch, commit message, day or actor. Discovery must uphold the same boundary: invariant 7 drops `isPrivate: true` repositories rather than emitting a name. A 67-month sweep requesting `repository { nameWithOwner isPrivate }` on all four connections leaked zero private names even to a `repo`-scoped owner token — GitHub structurally refuses — so any private name appearing in this output would indicate a bug in this module, not in GitHub.
- No credential is read, stored or logged here. The injected-client design means this module cannot exfiltrate a token even accidentally.
- Error messages must not interpolate the client, the query variables, or anything that could carry a credential.

**Migration.** None. These files do not exist at `researched_at_commit`; nothing reads them until KW-013 and KW-014 land.

**Accessibility.** Not applicable — this ticket ships no UI, no markup and no styling. The accessible presentation of the data it feeds is owned by KW-025, KW-026 and KW-029.

## Surfaces

- Reads: docs/research/2026-07-31-data-pipeline.md, docs/research/2026-07-31-decomposition-synthesis.md, package.json, tsconfig.json
- Writes: scripts/pipeline/discover.ts, scripts/pipeline/identity.ts, scripts/pipeline/__tests__/**
- Contracts: scripts/pipeline/identity.ts:classify, scripts/pipeline/discover.ts:discoverRepos
- Safety: identity-allowlist

## Sibling boundaries and open gates

**Same-wave siblings (all depend only on KW-001; write surfaces are disjoint by construction, DEC-005).**

- **KW-010 — Pipeline B: contribution calendar + private aggregate.** Owns `scripts/pipeline/calendar.ts` and `scripts/pipeline/private.ts`, the `contributionCalendar` and `restrictedContributionsCount` queries, and the SAML canary. It is the ticket blocked by GATE-003. Do not add a canary, a calendar query, or a private aggregate here; do not import from those files.
- **KW-012 — Bundle schema + codec contract.** Owns `lib/bundle/{schema,codec,frontcode}.ts` and the wire shapes (`manifest.json`, `repos.json`, `grid.json`, `events/ee-NN.json`, `paths/pd-NN.json`). `DiscoveryResult` is an internal pipeline type, **not** a wire format; the mapping from `DiscoveredRepo` to the renderer's `{id, short, actor, vol, stars, from, to, private, ext[]}` shape belongs to KW-012 and KW-014.
- **KW-011 — Vitest scaffolding.** Owns `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts` and the coverage thresholds. Name tests `*.test.ts` under `scripts/` so KW-011's `node` project collects them; never create or edit the config.
- **KW-008 — Viz contract.** Owns the scoped `eslint.config.mjs` override block for `lib/viz/sim/**`. Do not touch `eslint.config.mjs`, even though determinism matters here too.

**Downstream consumers.**

- **KW-013 — Pipeline C.** Consumes `classify()` to author-filter `git log --all --no-merges --name-only --no-renames`, and consumes `DiscoveryResult.repos[].nameWithOwner` as its clone list. It quotes the `identity.ts` sketch above verbatim. Any change to `classify`'s signature after this ticket merges is a breaking change to KW-013.
- **KW-014 — Pipeline D.** Consumes `repoCountDefinition` for the manifest (DEC-008) and assigns repo ids from `sort(nameWithOwner)` — the same ordering this ticket guarantees, which is why invariant 1 is load-bearing rather than cosmetic.
- **KW-028 — daily workflow.** Wires the real GraphQL client and the `CONTRIB_TOKEN` secret. That is where GATE-003 actually bites.

**Open gates.** None block pickup of this ticket. GATE-003 (SSO-authorized PAT for `ethereum-optimism`, stored as the `CONTRIB_TOKEN` repository secret) blocks KW-010, KW-014 and KW-028, and determines how complete this module's *output* is at run time — but not whether it can be written, reviewed, tested or merged. GATE-002 (`workflow` scope on the push credential) does not apply: this ticket writes nothing under `.github/`.
