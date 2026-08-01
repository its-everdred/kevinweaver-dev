# KW-032 — Capstone: full-page integration and production deploy verification

**Kind:** capstone

**Provenance:** planned in plan v1

**Complexity:** 2 — Two files, one of them prose; the code change is a heading swap plus one build-time read against contracts already frozen upstream. The cost is verification breadth: eight upstream tickets and a live production origin have to be observed. GT-14 gives complexity 2 an 8-turn budget, covering two edits plus one scripted verification pass and deliberately not covering fixes for anything the pass finds.

**Risk:** high — the only ticket that asserts against the live production deployment, and the last gate before the run's terminal condition. A false pass ships a broken public site; a defect it finds belongs to a sibling and cannot legally be fixed inside this write surface, so the failure mode is escalation, not a patch.

**Phase hint:** 7

**Depends on:** KW-002, KW-018, KW-019, KW-026, KW-027, KW-029, KW-030, KW-031

**Serializes with:** none

**Requirements:** REQ-001, REQ-002, REQ-003, REQ-005

**Decisions:** DEC-002, DEC-003, DEC-005, DEC-008, DEC-012, DEC-014, DEC-015, DEC-017

**Gates:** GATE-004, GATE-005

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

On the merged capstone branch, `app/page.tsx` composes all seven regions with the real identity heading and a build-time freshness value wired into the header; every required status check on the pull-request head is green; and `https://www.kevinweaver.dev/` is verified live to serve that build — the apex still answers `308` to `www`, `server: Vercel` is present, no route returns `x-vercel-error: FUNCTION_RUNTIME_DEPRECATED`, the served HTML is the App Router build and not the 2021 Pages Router build, and the deployed `/data/v1/manifest.json` carries a `generatedAt` under 24 hours old with an empty `degraded` list.

## Context and evidence

Two independent reasons, both load-bearing.

**The schema reason.** The aiur planning contract requires **exactly one capstone**: it must be `epic_acceptance.owner_ticket_id`, appear in `feature_boundary.critical_path_ticket_ids`, have a non-empty `acceptance.human_or_e2e`, and its transitive `depends_on` closure must contain every other runnable ticket. The eight dependencies above satisfy that closure, machine-checked in the synthesis: `KW-018 → 005, 003, 004 → 001`; `KW-026 → 024 → 021, 022 → 008, 007`; `KW-027 → 005, 006, 016, 017`; `KW-029 → 023 → 001, 011 / 025 → 015 → 012 / 020`; `KW-030 → 028 → 013 → 009, 012 / 014 → 010`; `KW-031 → 023, 024, 025`; plus `KW-002` and `KW-019` directly. **31 of 31 other tickets are covered.** Do not add or remove an edge without re-running that closure — dropping one silently breaks the manifest with `capstone does not transitively cover: …`.

**The product reason.** Nobody else composes the page, and nobody else looks at production. Every region ticket from KW-016 to KW-026 is forbidden from editing `app/page.tsx` (DEC-005, restated in each of their non-goals). Every CI ticket — KW-023, KW-029, KW-030, KW-031 — gates a *locally built* site inside a container (C-22). The gap between "the container is green" and "kevinweaver.dev is correct" is this ticket.

### Measured baseline, re-run during authoring

Executed against the live origin at authoring time; reproduces the vercel-platform track's findings.

```
$ curl -sSI https://kevinweaver.dev/
HTTP/2 308
location: https://www.kevinweaver.dev/
server: Vercel
strict-transport-security: max-age=63072000

$ curl -sSI https://www.kevinweaver.dev/
HTTP/2 200
server: Vercel
x-vercel-cache: HIT
content-length: 7547

$ curl -sS -D- -o /dev/null https://www.kevinweaver.dev/api/hello
HTTP/2 404
x-matched-path: /api/hello
x-vercel-error: FUNCTION_RUNTIME_DEPRECATED
```

`last-modified` is CDN cache-fill time, not deploy time — re-derived here as `date` (05:39:25) minus `age` (3545 s) equals `last-modified` (04:40:19) to within rounding. **Never infer a deploy date from it.** Use the GitHub Deployments API, as the verification script below does.

**The production deployment for `researched_at_commit` failed.** The single most important measured fact for this ticket, and new since the research tracks were written:

```
$ gh api repos/its-everdred/kevinweaver-dev/deployments --jq '.[] | [.id,.sha[0:7],.environment,.created_at] | @tsv'
5701862051  0ea1b74  Preview     2026-08-01T05:14:22Z
5701785144  e664d73  Production  2026-08-01T05:02:10Z
...
$ gh api repos/its-everdred/kevinweaver-dev/deployments/5701785144/statuses --jq '.[0].state'
failure
```

The live site still serves the 2021 build — Vercel keeps serving the last good deployment when a new one fails, so a failed production deploy is **invisible from `curl`**. Hence this ticket asserts on the Deployments API and on build-fingerprint markers rather than on "the site loads". Cause is C-4: `postcss@8.1.7`'s removed `"./": "./"` exports mapping reached via `next/dist/compiled/postcss-scss`, plus `@tailwindcss/jit@0.1.3` against the bundled PostCSS. KW-001 fixes it; the preview at `0ea1b74` (branch `kw-01-foundation`, "Rebuild site on Next 16 App Router") already deploys **green**, proving the fix path works.

**Two research corrections measured this session; both would burn a turn if transcribed blindly:**

1. The vercel track records the Vercel scope slug as `kevinweaver` and the deployment host as `…-kevinweaver.vercel.app`. Current deployments resolve to `…-kevinweavers-projects.vercel.app`. **Do not hardcode either.** Read `environment_url` off the Deployments API.
2. The vercel track's `grep -oE 'version:"…"'` fingerprint does not reproduce (C3): the served bytes are `t.version="10.1.3"` with an `=`. The App-Router-versus-Pages-Router discriminator used below is stronger, and was re-measured: the live 2021 build contains `__NEXT_DATA__` exactly once, the App Router preview zero times, and the preview carries `vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch` and `<html lang="en">`.

### Contradictions and gates that bind

**C-22 — a Vercel preview is never a required gate, and this ticket does not make it one.** The three surviving grounds: `vercel.deployment.ignored/.skipped/.error` emit no dispatch so a required preview context waits forever; a pull request editing a preview workflow runs `main`'s copy; visual baselines must never come from a CDN-served preview. This ticket reads the **production** origin *after* merge, in the at-merge gate, adding no workflow and no required context. Measured alongside: previews here are publicly readable (`HTTP/2 200`, no Vercel Authentication interstitial), so eyeballing one needs no `x-vercel-protection-bypass` header — convenience, not a gate.

**C-21 / DEC-012 — the required-check posture.** GT-11 measured `rulesets: []`, `allow_auto_merge: false`, User-owned repo with `plan: null`; a merge queue is structurally unavailable. KW-002 installs a ruleset requiring exactly one context, `ci-ok`, deferring promotion of `e2e-ok` and any Vercel context to a later governance change. **Promotion is not this ticket's work** — enumerate whatever the live ruleset requires and assert it all green, and separately assert `e2e-ok` green whether or not it is required.

**GATE-004 (HG-4) is open and is this ticket's own gate.** Four dashboard-only facts: the Vercel project's stored Node version, plan tier, auto-promotion setting, and whether a Root-Directory / build-command / install-command override exists. An install-command override silently defeats `vercel.json`; a Node pin of 14.x or 16.x errors before the build runs; auto-promotion disabled means a merged pull request never becomes production and this ticket's assertions fail against a stale origin, for a reason no repository change can fix. `engines.node: "24.x"` in `package.json` (KW-001, DEC-002) is the one override reachable from the repository, and is already in place. The operator's answers go in the pull-request body as evidence.

**GATE-005 (HG-5) touches the one line of copy this ticket writes.** KW-005 shipped `<h1 className="sr-only">Kevin Weaver</h1>` as a placeholder and recorded that *"KW-032's final composition swaps in `content/identity.ts` once the gate clears."* `IDENTITY.title` is GATE-005 item (c) — three conflicting job-title variants exist and no measurement settles it. By the time this ticket runs KW-006 has merged and GATE-005 has closed, so `IDENTITY.title` is operator-supplied. **If it is empty, render the name alone. Never invent a title.**

### Decisions that bind

- **DEC-002** — Next 16 App Router, no `output: 'export'`. Why `/` is a statically prerendered route with real headers, why the `vary: rsc` marker exists to assert against, and why freshness can be computed at prerender from the filesystem.
- **DEC-003** — `package.json` and `package-lock.json` frozen after KW-001. No dependency added, neither file edited; `node scripts/ci/assert-pins.mjs` must still pass unchanged.
- **DEC-005** — zero `serializes_with`; disjoint write surfaces. The capstone is the second and last ticket to edit `app/page.tsx`, and edits nothing else except `README.md`. A defect in a sibling's file is reported, not patched.
- **DEC-008** — no contribution figure or window is a literal anywhere in copy. Freshness derives from the payload's `generatedAt`; `README.md` describes the pipeline and never quotes a number it produces.
- **DEC-012** — auto-merge on, `required_approving_review_count: 0`, code-owner review scoped to the gate files, `strict_required_status_checks_policy: false`.
- **DEC-014** — an honest `generatedAt`-driven freshness signal, with `emitLive()`'s synthesiser deleted. This ticket supplies the header half and is the only place allowed to.
- **DEC-015** — no phone number in the repository or the build output, in any form, no obfuscation accepted. Re-checked here against the **deployed bytes**, the only surface an attacker reads. This document deliberately does not transcribe the number; the check is a phone-shaped regex, as KW-019 does it.
- **DEC-017** — scheduled regeneration on GitHub Actions that always commits, never Vercel Cron. The 24-hour `generatedAt` assertion is the only end-to-end production proof the loop closes: workflow → commit → Vercel Git integration → production deploy → CDN.

**Plan-context navigation** (repository-relative paths; all resolve at `e664d73a195facd64db58ba10952170ff01b4772` under `https://github.com/its-everdred/kevinweaver-dev/tree/<sha>/`):

- Pack index and the KW-01..KW-32 → KW-001..KW-032 identity mapping: `docs/build-orders/site-rewrite/README.md`.
- Ticket manifest, surfaces, graph edges, `epic_acceptance`, `feature_boundary`: `docs/build-orders/site-rewrite/build-order.json`.
- Wave diagram, topological levels, critical path, write-surface partition proof: `docs/research/2026-07-31-decomposition-synthesis.md` §6.
- Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007): `docs/research/2026-07-31-decomposition-synthesis.md` §3 and §4, mirrored into `build-order.json` `decisions[]` and `external_gates[]`.
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, "KW-32 — Capstone: full-page integration and production deploy verification", plus `docs/research/2026-07-31-vercel-platform.md` §1, §7, §9, §10 and its "Verification corrections" C2/C3/C6/C7.
- Executor authority, merge conditions, live gate register: `docs/build-orders/site-rewrite/authority-envelope.md`.
- Seams consumed: `docs/build-orders/site-rewrite/tickets/KW-005-app-shell-region-contract.md` (page composition, `REGION_META`), `…/KW-018-header-nav-tmux-status-bar.md` (`HeaderFreshness`), `…/KW-006-content-modules.md` (`IDENTITY`), `…/KW-014-pipeline-d-encoder-validator-state.md` (manifest shape).

**Requirements this ticket serves.** REQ-001 — build and deploy on a currently supported Next.js and Node runtime; the only ticket that observes the deploy succeeding on the production origin. REQ-002 — an App Router application partitioned into the comp's seven regions; here those regions are finally observed composing into one page. REQ-003 — every claim on the site is the authoritative resume or measured data; the placeholder `<h1>` is the last surviving placeholder string and this ticket removes it. REQ-005 — every repository and contribution figure derives from measured GitHub data at generation time, no figure a literal in copy or code; proven in production by the freshness assertion against the deployed manifest. REQ-009 and REQ-010 are **not** claimed here: KW-029 discharges the accessibility gate and KW-023/KW-030/KW-031 the browser-level CI gate. This ticket only re-observes their results, which is not the same as owning them.

## Scope

- Replace the placeholder `<h1>` literal in `app/page.tsx` with the composed heading built from `IDENTITY.name` and `IDENTITY.title`, keeping exactly one visually hidden `h1` as first child of `<main>`.
- Add the build-time freshness composition to `app/page.tsx`: read `public/data/v1/manifest.json` from the filesystem during prerender, derive a `HeaderFreshness` value with the tone rules in "Contract and invariants", pass it to `<Header />`; omit the prop entirely when the manifest is absent, unparseable, or missing `generatedAt`.
- Keep `app/page.tsx` a statically prerendered async Server Component with no `'use client'` directive, no named exports, no new dependency, no route-segment config.
- Replace `README.md` — currently eight lines of 2021 template prose whose one instruction (`yarn dev`) is wrong after DEC-003 — with the operator and contributor runbook for the rebuilt site.
- Run the production verification script against `https://www.kevinweaver.dev/` after merge and paste its full transcript into the pull-request body.
- Record the feature-level operator evidence, including the GATE-004 dashboard answers, as the epic acceptance evidence for the whole Build Order.
- Audit the assembled tree for residual sibling placeholders — the `TODO(KW-004)` icon markers and the stale `REGION_META.careerLog.accessibleName` constant — and report each as a blocking finding against its owning ticket rather than fixing it here.

## Non-goals

- Editing any file other than `app/page.tsx` and `README.md`. Region components, `app/layout.tsx`, `app/regions/_contract.ts`, `components/**`, `content/**`, `lib/**`, `scripts/**`, `e2e/**`, `test/**`, `.github/**`, `vercel.json`, `package.json` and `package-lock.json` belong to named upstream tickets and are frozen here.
- Fixing any defect in a sibling's write surface, however small. A one-line icon import in `app/regions/Contact.tsx` is still a KW-019 change.
- Promoting `e2e-ok`, a Vercel context, or any other check to required status in `.github/rulesets/main.json`. That file is KW-002's and promotion is an Executor governance action.
- Adding, removing, or re-pinning a dependency, or editing `scripts/ci/assert-pins.mjs`.
- Adding an end-to-end spec, an axe assertion, a screenshot baseline or a size budget. KW-023, KW-029, KW-030 and KW-031 own `e2e/**` and `.size-limit.json`.
- Adding a Vercel preview deployment to any required check, or adding a workflow of any kind.
- Making `/` dynamic — no `export const dynamic`, no `revalidate`, no `force-dynamic`, no page-level client boundary. The static-CDN posture keeps the site on zero metered function invocations.
- Changing Vercel dashboard settings or DNS. GATE-004 is answered by the operator, not by an edit.
- Hardcoding any contribution figure, window length, repository count or date range in `README.md` or `app/page.tsx`.

## Existing owner and reuse target

**`README.md` — exists at `researched_at_commit` and is genuinely reused.** Verified: `git show e664d73a195facd64db58ba10952170ff01b4772:README.md` returns eight lines beginning `## Hi. I like to make things.` and ending with a `yarn dev` instruction. The only file in this write surface that predates the rewrite. Replaced wholesale, not appended to: every sentence is either false after KW-001 (package manager, framework version) or vacuous ("My opinions on them are TBD").

**`app/page.tsx` — does not exist at `researched_at_commit`; created upstream.** Verified: `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772` lists `pages/_app.js`, `pages/api/hello.js`, `pages/index.js` and no `app/` directory. It is created by **KW-001** (blank App Router page) and rewritten by **KW-005** into the seven-region composition described below. No ticket between KW-005 and this one may touch it — Invariant 1 of KW-005, and the reason waves 3 through 5 could run in parallel. This ticket is the second and final editor.

Consumed, never edited:

| Symbol or artifact | File | Created by | Status at pickup |
|---|---|---|---|
| `IDENTITY`, `Identity` | `content/identity.ts` | KW-006 | merged; GATE-005 closed, `title` operator-supplied |
| `Header`, `HeaderOwnProps`, `HeaderFreshness`, `HeaderFreshnessTone` | `app/regions/Header.tsx` | KW-018 | merged (hard dependency) |
| `Instrument`, `ManPage`, `CareerLog`, `Contact`, `TmuxBar`, `BootOverlay` | `app/regions/*.tsx` | KW-005, replaced by KW-016/017/019/020/025 | merged |
| `manifest.json` with `generatedAt` / `degraded` | `public/data/v1/manifest.json` | KW-014's encoder, committed by KW-028's workflow | in the tree once KW-028 has run once |
| `ci-ok` status context | `.github/workflows/ci.yml` | KW-001 | required by the `main` ruleset |
| `e2e-ok` status context | `.github/workflows/e2e.yml` | KW-023 | published; required only if the Executor promoted it |
| `main` ruleset | `.github/rulesets/main.json` | KW-002 | applied |

**If `app/regions/Header.tsx` does not export `HeaderFreshness` at pickup, stop.** Do not define a local structural copy and do not cast. A missing export means KW-018 shipped a different seam than its ticket specifies — a KW-018 defect and a blocking finding.

## Contract and invariants

### Invariants

**I-1 — `app/page.tsx` has exactly one export, the default.** `next typegen` generates a route type check enumerating the legal page exports (`default`, `metadata`, `generateMetadata`, `viewport`, `generateViewport`, `dynamic`, `revalidate`, `dynamicParams`, `fetchCache`, `runtime`, `preferredRegion`, `maxDuration`, `generateStaticParams`, `experimental_ppr`, `config`) and rejecting the rest. **Unverified against Next 16 during authoring** — no Next 16 tree existed at `researched_at_commit` to run `next typegen` against, so treat it as the reason for the rule rather than a measured fact, and re-check at pickup with a one-line throwaway export. The rule holds either way: the freshness helper is module-private. Unit-testing it is a follow-up that lands it under `lib/`, not an edit here.

**I-2 — `/` stays statically prerendered.** No `'use client'`, no route-segment config, no `fetch`, no `cookies()`/`headers()`/`searchParams`. `node:fs` reads and `Date.now()` are not Next dynamic APIs and do not opt the route out of prerendering; `next.config.ts` is empty (KW-001) so no `cacheComponents`/PPR scope rejects either. A dynamic `/` would put every page view on a serverless invocation and silently defeat KW-030's first-load budget.

**I-3 — the freshness clock is the build clock, and the label must survive being served stale.** Because `/` is prerendered then CDN-served until the next deploy, any relative age string baked at build time decays. DEC-017 guarantees a deploy at least daily, so the served page is at most ~24 h older than its build. The rendered `label` is therefore a **bucket** (`fresh` / `stale` / `partial`), never a countdown, and the `description` carries an **absolute** UTC timestamp. A `6 hours ago` string baked into a static page is the class of claim DEC-014 exists to delete.

**I-4 — absence is silence.** Missing or unreadable manifest, invalid JSON, missing or unparseable `generatedAt` — every one yields `undefined` and the pill is not rendered. KW-018's contract states this in the type: *"Omit and the pill is not rendered at all. This is the honest default."* Never render a default label, never render `unknown`, never throw.

**I-5 — exactly one `h1`, visually hidden, first child of `<main>`.** KW-005 fixed the heading outline (`sr-only h1`, pane titles as `h2`). This ticket changes the h1's *text* and nothing else. A second `h1`, un-hiding it, or moving it is an accessibility regression KW-029's axe run would have to catch on a branch KW-029 no longer gates.

**I-6 — exactly one bypass link.** `app/page.tsx` already renders `<a className="skip sr-only" href="#whoami">`. Do not add another; KW-018's non-goals say the same from the other side.

**I-7 — the page reads the manifest, never the bundle.** Only `generatedAt` and `degraded` are consumed. Do not read `grid.json`, `repos.json`, or any `events/ee-NN.json` — that payload belongs to `lib/bundle/loader.ts` (KW-015) on the client, and pulling it into the server render would inline hundreds of kilobytes into the HTML.

**I-8 — verification asserts on the API and on build fingerprints, never on `last-modified`.** Measured: `last-modified` equals `date` minus `age`, i.e. CDN cache-fill time. A cache eviction moves it; a deploy does not.

### Consumed interface — `HeaderFreshness`, quoted verbatim from KW-018

KW-018 instructs consumers to quote this and not paraphrase it. Import the types; do not restate them.

```ts
// app/regions/Header.tsx — the DEC-014 seam. KW-032 supplies the value.
export type HeaderFreshnessTone = 'fresh' | 'stale' | 'static'

export interface HeaderFreshness {
  /** Short uppercase label rendered in the pill, e.g. 'fresh' or 'static'. */
  readonly label: string
  /** Drives the dot colour token only. Never the sole channel: `label` is text. */
  readonly tone: HeaderFreshnessTone
  /** Full accessible sentence, e.g. 'data regenerated 6 hours ago'. */
  readonly description: string
}

export interface HeaderOwnProps extends HeaderProps {
  /** Omit and the pill is not rendered at all. This is the honest default. */
  readonly freshness?: HeaderFreshness
}

export function Header(props: HeaderOwnProps): ReactNode
```

Tone maps to the dot's background token only — `fresh` → `var(--green)`, `stale` → `var(--yellow)`, `static` → `var(--fg4)`. The label text always renders, so the state is never colour-only.

**This is not KW-026's `freshness()`.** KW-026 exports a different, runtime, client-side helper returning `FreshnessReadout` with tones `'ok' | 'warn' | 'dim'`, driven by `Date.now()` in a `useEffect` and rendered in the transport strip. They coexist by design: the transport readout ticks in the browser against a live clock, the header pill is a static build-time claim. **Do not import KW-026's `freshness` here, and do not unify the two tone enums** — different value types with different truth conditions; merging them would either make the page dynamic or the transport readout stale.

### Produced interface — the freshness derivation

Module-private (I-1). The tone table is the reviewable part.

```ts
type ManifestFreshnessFields = {
  readonly generatedAt?: unknown
  readonly degraded?: unknown
}

function composeFreshness(
  manifest: ManifestFreshnessFields | null,
  builtAtMs: number,
): HeaderFreshness | undefined
```

| `manifest.generatedAt` | `manifest.degraded` | age = `builtAtMs − Date.parse(generatedAt)` | result |
|---|---|---|---|
| absent, not a string, or unparseable | anything | — | `undefined` — pill not rendered |
| valid ISO | non-empty array | any | `{ label: 'partial', tone: 'static', description: 'data regenerated <ts>; <sources> reused from cache' }` |
| valid ISO | empty | `0 ≤ age < 36 h` | `{ label: 'fresh', tone: 'fresh', description: 'data regenerated <ts>' }` |
| valid ISO | empty | `age < 0` (clock skew) | treated as fresh — never render a negative age |
| valid ISO | empty | `age ≥ 36 h` | `{ label: 'stale', tone: 'stale', description: 'data regenerated <ts>' }` |

`<ts>` is the manifest's own ISO string rendered as `YYYY-MM-DD HH:MM:SS UTC`. No locale formatting, no `Intl` — the value must be byte-identical for the same manifest on any machine, since KW-031 screenshots the header.

**Why 36 h and not 24 h.** DEC-017 schedules regeneration at `17 6 * * *`. A page built just after one run is ~24 h old just before the next, so a 24 h threshold would flip to `stale` daily on a healthy system, and an alarm that fires daily is an alarm nobody reads. 36 h gives one full missed run of headroom, so `stale` means "a scheduled run did not land". GitHub also documents ±59 min of cron jitter, which 36 h absorbs and 24 h does not.

**Why `degraded` outranks age.** KW-014 records `('calendar' | 'private' | 'events')[]` in `manifest.degraded` when a source fell back to the previous run's cached values rather than failing the pipeline. A bundle six minutes old whose calendar is a day-old cache is not `fresh`. `static` is the honest tone, and the description names the degraded sources so the claim is checkable.

### Worked manifest fixture

The shape KW-014 emits. Drop it at `public/data/v1/manifest.json` to develop against — do **not** commit it; `public/data/v1/**` is KW-014's write surface and KW-028's refresh surface.

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

Composed against a build clock of `2026-07-31T12:00:00Z`, that fixture yields exactly:

```json
{ "label": "fresh", "tone": "fresh", "description": "data regenerated 2026-07-31 06:17:00 UTC" }
```

Changing it to `"degraded": ["calendar"]` yields `{ "label": "partial", "tone": "static", "description": "data regenerated 2026-07-31 06:17:00 UTC; calendar reused from cache" }`.

### Production verification contract

Nine assertions, executed against the production origin after merge. Each is falsifiable and each has a named reason for existing.

| # | Assertion | Why it is not redundant with CI |
|---|---|---|
| P-1 | `https://kevinweaver.dev/` → `308` with `location: https://www.kevinweaver.dev/` | domain-layer redirect, invisible to any local build |
| P-2 | `https://www.kevinweaver.dev/` → `200`, `server: Vercel` | the origin is still the Vercel project, not a parked page |
| P-3 | No response carries `x-vercel-error` on any probed route | `FUNCTION_RUNTIME_DEPRECATED` is a *platform* error a local build cannot produce |
| P-4 | Served HTML contains zero `__NEXT_DATA__` occurrences and the response carries `vary: …rsc…` | the App Router build replaced the 2021 one; a failed deploy leaves the old one serving silently |
| P-5 | Served HTML contains `lang="en"`, `id="whoami"`, `id="arc"`, `id="contact"` and a `<noscript>` block | the composed regions and KW-027's fallback survived the CDN, not just the container |
| P-6 | `/data/v1/manifest.json` → `200`; `generatedAt` under 24 h old; `degraded` empty | the only end-to-end proof of DEC-017's workflow → commit → deploy → CDN loop |
| P-7 | `/resume.txt` and `/kevinweaver.1` → `200` with non-empty bodies | KW-027's routes are the two commands the contact pane tells a visitor to run |
| P-8 | No served route matches the phone-shaped regex `\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b` | DEC-015 on the bytes an attacker actually fetches |
| P-9 | The Production deployment whose `sha` equals the merge commit has `state: success` | a failed deploy is invisible from `curl`; the last good one keeps serving |

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify the preconditions at pickup; if one is false, **report it and stop** rather than repairing it here — each belongs to a named upstream ticket.

### Preconditions to check before writing a line

```bash
test -f app/page.tsx && test -f app/regions/Header.tsx && test -f content/identity.ts
grep -n 'HeaderFreshness' app/regions/Header.tsx        # the seam must be exported
grep -n 'export const IDENTITY' content/identity.ts
grep -n '"@/\*"' tsconfig.json                          # alias present -> use @/, else relative imports
git ls-files pages | wc -l                              # must be 0
npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build   # green BEFORE any edit
```

An absent `public/data/v1/manifest.json` is expected on a fresh clone and is not a blocker — the page must build and the pill must not render. Confirm that first, then drop the worked fixture in locally to exercise the other branches, and delete it after.

### File 1 — `app/page.tsx`

KW-005 left a synchronous `export default function Page()` whose JSX is identical to the tree below except for two lines: `<Header />` with no props, and `<h1 className="sr-only">Kevin Weaver</h1>` as a literal. Everything else — skip link, `<main className="kw-pad">`, region order, the `kw-2up` wrapper on `#whoami` — is unchanged.

The finished file. Import order follows KW-001's Prettier/ESLint configuration; run `npm run format` rather than hand-fighting it.

```tsx
// app/page.tsx — KW-032 final composition.
// Server Component. No 'use client'. No named exports (see I-1).
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { IDENTITY } from '@/content/identity'

import { BootOverlay } from './regions/BootOverlay'
import { CareerLog } from './regions/CareerLog'
import { Contact } from './regions/Contact'
import { Header, type HeaderFreshness } from './regions/Header'
import { Instrument } from './regions/Instrument'
import { ManPage } from './regions/ManPage'
import { TmuxBar } from './regions/TmuxBar'

/** Repo-relative. Next serves public/ at the site root: /data/v1/manifest.json. */
const MANIFEST_PATH = 'public/data/v1/manifest.json'

/** One missed daily run of headroom over DEC-017's `17 6 * * *` schedule. */
const FRESH_WINDOW_MS = 36 * 60 * 60 * 1000

type ManifestFreshnessFields = {
  readonly generatedAt?: unknown
  readonly degraded?: unknown
}

/** Never throws. Returns null when the bundle is not generated yet — the normal
 *  state of a fresh clone and of any branch built before KW-028's first run. */
async function readManifest(): Promise<ManifestFreshnessFields | null> {
  try {
    const raw = await readFile(join(process.cwd(), MANIFEST_PATH), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as ManifestFreshnessFields)
      : null
  } catch {
    return null
  }
}

/** '2026-07-31T06:17:00Z' -> '2026-07-31 06:17:00 UTC'. No Intl, no locale. */
function stampUtc(iso: string): string {
  return `${iso.replace('T', ' ').replace(/(\.\d+)?Z$/, '')} UTC`
}

/** Pure. `builtAtMs` is the prerender clock — this route is static, so it is the
 *  build clock, never a request clock. See I-3 for why the label is bucketed. */
function composeFreshness(
  manifest: ManifestFreshnessFields | null,
  builtAtMs: number,
): HeaderFreshness | undefined {
  const generatedAt = manifest?.generatedAt
  if (typeof generatedAt !== 'string') return undefined

  const generatedMs = Date.parse(generatedAt)
  if (Number.isNaN(generatedMs)) return undefined

  const description = `data regenerated ${stampUtc(generatedAt)}`

  // Read into a local first: narrowing `manifest?.degraded` with Array.isArray
  // does NOT narrow the later `manifest.degraded`, and `manifest` is nullable —
  // the short way is a strict-null-checks error.
  const rawDegraded = manifest?.degraded
  const degraded = Array.isArray(rawDegraded)
    ? rawDegraded.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : []

  if (degraded.length > 0) {
    return {
      label: 'partial',
      tone: 'static',
      description: `${description}; ${degraded.join(', ')} reused from cache`,
    }
  }

  const age = builtAtMs - generatedMs
  return age < FRESH_WINDOW_MS
    ? { label: 'fresh', tone: 'fresh', description }
    : { label: 'stale', tone: 'stale', description }
}

/** GATE-005 (c): `title` is operator-supplied. Empty means render the name alone. */
function pageHeading(): string {
  const title = IDENTITY.title.trim()
  return title.length > 0 ? `${IDENTITY.name} — ${title}` : IDENTITY.name
}

export default async function Page() {
  const freshness = composeFreshness(await readManifest(), Date.now())

  return (
    <>
      <a className="skip sr-only" href="#whoami">
        skip the animation
      </a>
      <Header freshness={freshness} />
      <main className="kw-pad">
        <h1 className="sr-only">{pageHeading()}</h1>
        <Instrument />
        <div className="kw-2up" id="whoami">
          <ManPage />
          <CareerLog />
        </div>
        <Contact />
      </main>
      <TmuxBar />
      <BootOverlay />
    </>
  )
}
```

Five traps, each of which has cost a rework cycle:

1. **`export function composeFreshness`.** Tempting — the helper is pure and looks testable. `next typegen` rejects it. Keep it private (I-1).
2. **`import manifest from '@/public/data/v1/manifest.json'`.** Shorter, but turns an absent file into a hard build failure — on a fresh clone, on any branch built before KW-028's first run, and whenever the workflow was skipped. The `try/catch` read is the whole point.
3. **`export const dynamic = 'force-dynamic'` to make the pill "live".** Legal, typechecks, and converts a static CDN object into a serverless invocation per page view. Do not; I-3 gives the bucketed label as the answer.
4. **`Intl.DateTimeFormat` or `toLocaleString()` for the timestamp.** The build container's `TZ` and ICU data are not the reviewer's, and KW-031 screenshots this header with `maxDiffPixels: 0`. String surgery on the ISO value only.
5. **Assuming a `Z` suffix without checking.** `stampUtc` strips a trailing `Z` and an optional fractional part, correct for the `2026-07-31T06:17:00Z` form KW-014's schema specifies. If the encoder ever emits `+00:00` the label reads `… 06:17:00+00:00 UTC` — ugly rather than wrong, and the fix belongs in KW-014's emitter, not a broader regex here. Check the real manifest first.

### File 2 — `README.md`

Full replacement. Structure below; keep it under roughly 120 lines and every claim checkable. **No contribution figure, window length, repository count or date range appears anywhere in it** (DEC-008) — describe the pipeline, never the numbers it produced. Do not duplicate the version pins as a table; point at the single source of truth, or the README goes stale on the first bump.

The block below is **indented two spaces** so this document keeps exactly eleven top-level `##` sections, the shape every ticket in this pack has. Strip the indent when you write the file; CommonMark would still render it, but `git diff` will look wrong.

```markdown
  # kevinweaver.dev

  Personal site: a terminal-styled dashboard built around a reverse-time visualization of
  public GitHub activity, alongside a man page, a career git log, and a contact pane.

  Production: <https://www.kevinweaver.dev> (the apex 308-redirects to `www`).

  ## Stack

  Next.js App Router on React, Tailwind CSS v4 via `@tailwindcss/postcss`, TypeScript, and a
  canvas visualization with no runtime chart dependency. Every version is pinned exactly and
  enforced in CI by `scripts/ci/assert-pins.mjs`, the single source of truth; `package.json`
  carries no floating tag and no range.

  npm only, one lockfile: `package-lock.json`. No `yarn.lock`, `pnpm-lock.yaml`, or
  `packageManager` field.

  ## Local development

      npm ci
      npm run dev            # http://localhost:3000

  The full verification chain, which is what CI runs:

      npm run typegen && npm run typecheck && npm run lint && npm run build

  Tests:

      npm run test:unit      # Vitest: node / dom / browser projects
      npm run test:e2e       # Playwright; see e2e/README notes in the workflow

  ## Layout

  | Path | Contents |
  |---|---|
  | `app/` | App Router shell, one file per page region under `app/regions/` |
  | `components/ds/` | design-system chrome primitives (pane, bar, meter, scanline) |
  | `components/viz/` | canvas surfaces for the instrument pane |
  | `components/icons/` | inline SVG control icons |
  | `content/` | every rendered string, as typed data |
  | `lib/viz/` | the deterministic simulation and renderer |
  | `lib/bundle/` | payload wire format, encoder, client loader |
  | `scripts/pipeline/` | the data pipeline that produces the payload |
  | `public/data/v1/` | the generated payload, committed by the scheduled workflow |
  | `e2e/`, `test/` | Playwright and Vitest suites |
  | `docs/design/` | the design comp and the vendored design system |
  | `docs/build-orders/` | the planning pack this rebuild was executed from |

  ## Data

  The activity payload under `public/data/v1/` is generated, not hand-written. It is rebuilt
  daily by `.github/workflows/data-bundle.yml`, which commits the result; the commit triggers
  a production deployment through the Vercel Git integration. It can also be run on demand
  from the Actions tab.

  Two halves with different auth: an anonymous `git clone` pass driving the animation, and a
  GraphQL pass driving the contribution grid, which needs an SSO-authorized token in the
  `CONTRIB_TOKEN` repository secret. Without that secret the grid under-reports.

  Regenerate locally:

      npm run data:build

  No figure the site displays is a literal in code or copy; every one is read from the
  generated payload, which carries its own `generatedAt` and window fields.

  ## CI and deployment

  `ci-ok` is the aggregated required status on every pull request; `e2e-ok` publishes the
  containerized browser run. Size budgets and the first-load assertion run inside `ci-ok`;
  screenshot baselines come only from the snapshots workflow, never locally.

  Deployment is Vercel via the Git integration: a push to `main` becomes a production
  deployment, every other branch and pull request a preview. Nothing to run by hand.

  ## Conventions

  See `AGENTS.md` for contributor conventions and `.github/CODEOWNERS` for review routing.
```

### The production verification script

Run this **after merge**, against the production origin, and paste the whole transcript into the pull-request body. Not committed — `scripts/**` is not this ticket's write surface.

```bash
#!/usr/bin/env bash
set -uo pipefail
ORIGIN=https://www.kevinweaver.dev
REPO=its-everdred/kevinweaver-dev
SHA=$(git rev-parse HEAD)
fail=0
note() { printf '%-6s %s\n' "$1" "$2"; [ "$1" = FAIL ] && fail=1; return 0; }

# P-1 apex redirect
curl -sSI https://kevinweaver.dev/ | tr -d '\r' | grep -q '^location: https://www\.kevinweaver\.dev/$' \
  && note OK 'P-1 apex 308 -> www' || note FAIL 'P-1 apex redirect'

# P-2 origin identity
curl -sSI "$ORIGIN/" | tr -d '\r' | grep -qi '^server: Vercel$' \
  && note OK 'P-2 server: Vercel' || note FAIL 'P-2 origin identity'

# P-3 no platform error on any probed route
for p in / /api/hello /resume.txt /kevinweaver.1 /data/v1/manifest.json /no-such-page; do
  hdr=$(curl -sS -o /dev/null -D- "$ORIGIN$p" | tr -d '\r')
  code=$(printf '%s\n' "$hdr" | awk '/^HTTP/{c=$2} END{print c}')
  err=$(printf '%s\n' "$hdr" | awk -F': ' '/^x-vercel-error:/{print $2}')
  [ -z "$err" ] && note OK "P-3 $p -> $code" || note FAIL "P-3 $p -> $code x-vercel-error: $err"
done

# P-4 App Router build, not the 2021 Pages Router build
html=$(curl -sS "$ORIGIN/")
[ "$(printf '%s' "$html" | grep -c '__NEXT_DATA__')" -eq 0 ] \
  && note OK 'P-4 no __NEXT_DATA__' || note FAIL 'P-4 Pages Router build still serving'
curl -sSI "$ORIGIN/" | tr -d '\r' | grep -qi '^vary:.*rsc' \
  && note OK 'P-4 vary: rsc' || note FAIL 'P-4 missing RSC vary header'

# P-5 composed structure survived the CDN
for m in 'lang="en"' 'id="whoami"' 'id="arc"' 'id="contact"' '<noscript'; do
  printf '%s' "$html" | grep -qF -- "$m" && note OK "P-5 $m" || note FAIL "P-5 missing $m"
done

# P-6 payload freshness (DEC-017 end to end)
curl -sS "$ORIGIN/data/v1/manifest.json" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const m=JSON.parse(s);
    const h=(Date.now()-Date.parse(m.generatedAt))/3.6e6;
    const bad=!(h>=0&&h<24)||!Array.isArray(m.degraded)||m.degraded.length>0;
    console.log("generatedAt="+m.generatedAt+" age="+h.toFixed(1)+"h degraded="+JSON.stringify(m.degraded));
    process.exit(bad?1:0);
  });' && note OK 'P-6 payload < 24h, not degraded' || note FAIL 'P-6 payload freshness'

# P-7 KW-027 text routes
for p in /resume.txt /kevinweaver.1; do
  n=$(curl -sS "$ORIGIN$p" | wc -c)
  [ "$n" -gt 500 ] && note OK "P-7 $p ($n bytes)" || note FAIL "P-7 $p is $n bytes"
done

# P-8 DEC-015 on the deployed bytes
for p in / /resume.txt /kevinweaver.1; do
  curl -sS "$ORIGIN$p" | grep -Eq '\b[0-9]{3}[-.[:space:]]?[0-9]{3}[-.[:space:]]?[0-9]{4}\b' \
    && note FAIL "P-8 phone-shaped string in $p" || note OK "P-8 $p clean"
done

# P-9 the deploy for THIS commit actually succeeded
dep=$(gh api "repos/$REPO/deployments?sha=$SHA&environment=Production" --jq '.[0].id')
if [ -n "${dep:-}" ] && [ "$dep" != "null" ]; then
  st=$(gh api "repos/$REPO/deployments/$dep/statuses" --jq '.[0] | [.state,.environment_url] | @tsv')
  printf '%s\n' "$st" | grep -q '^success' && note OK "P-9 deployment $dep $st" \
    || note FAIL "P-9 deployment $dep $st"
else
  note FAIL "P-9 no Production deployment recorded for $SHA"
fi

exit "$fail"
```

Two notes. `set -e` is deliberately **not** used: every probe must run so the transcript is complete, and the exit code comes from the accumulator. And P-9 keys on `sha`, not on "the newest deployment" — if the operator or the workflow pushed after the merge, the newest deployment is not this one.

### Placeholder audit

Three residuals are possible at capstone time. Each is a **report**, not a fix (DEC-005).

```bash
grep -rn 'TODO(KW-004)' app components         # icon placeholders left by KW-019 / KW-020
grep -rn 'since=2021' app/regions/_contract.ts # KW-017's recorded stale REGION_META constant
grep -rniE 'bomberman|drawGame|walkable' .     # KW-026's deletion, must be empty
```

- `TODO(KW-004)` markers exist only if a region merged before KW-004. KW-004 is wave-2, so this should be empty; if not, the affordance renders without its icon and the fix is a one-line import in the **owning region's** file. Open a follow-up against that ticket, record it in `docs/build-orders/site-rewrite/deferred-findings.md`, and record the Executor's disposition in the pull-request body before merging this one.
- `REGION_META.careerLog.accessibleName` is `git log --graph --oneline --since=2021`, which KW-017 measured as wrong (the log reaches 2008) and worked around by rendering KW-006's corrected title into the labelling `<h2>`. `app/regions/_contract.ts` is KW-005's frozen file. The effective accessible name is already correct; the stale constant is cosmetic. Confirm the workaround and leave the constant alone.
- The Bomberman grep must return nothing. If it returns anything, KW-026 did not finish and this ticket cannot pass.

### What to do while a dependency is unmerged

This ticket cannot start before all eight dependencies merge — aiur enforces `depends_on` as GitHub-native issue dependencies (C-11). If the Executor takes it over early anyway, the honest partial is: make the `README.md` change, leave `app/page.tsx` untouched, and do not run the production script. A production assertion against a half-assembled page produces a green transcript that means nothing — worse than no transcript.

## Acceptance and verification

### Agent gate

- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` exits 0 from a clean clone of the branch, with no new diagnostics and `--max-warnings=0` satisfied.
- `git diff --name-only origin/main...HEAD` lists exactly two paths: `app/page.tsx` and `README.md`.
- `git diff origin/main...HEAD -- package.json package-lock.json scripts/ci/assert-pins.mjs` is empty, and `node scripts/ci/assert-pins.mjs` exits 0.
- `grep -c "^export" app/page.tsx` returns 1, and that export is `export default async function Page`; `grep -c "'use client'" app/page.tsx` returns 0; `grep -nE "^export const (dynamic|revalidate|runtime|fetchCache|dynamicParams)" app/page.tsx` returns nothing.
- `npm run build` reports `/` as prerendered rather than dynamic. Assert it by artifact: `ls .next/server/app | grep -E '^index\.(html|rsc)$'` prints both files. If Next 16 has changed the emitted filenames, read `/`'s row in the build's route table instead — and never satisfy this check by making the route dynamic.
- The page builds and renders with no manifest present. Prove it non-destructively — `public/data/v1/**` is committed data owned by KW-014 and KW-028: `mv public/data/v1 /tmp/kw032-bundle && npm run build && mv /tmp/kw032-bundle public/data/v1 && git status --porcelain public/data/v1` is green and empty. The produced HTML contains no freshness pill. Never `rm -rf` that directory.
- The page builds with the worked fixture present: with `generatedAt` inside 36 h and `degraded: []` the prerendered HTML contains `fresh` and `data regenerated 2026-07-31 06:17:00 UTC`; with `degraded: ["calendar"]` it contains `partial` and `calendar reused from cache`; with `generatedAt` set to a date older than 36 h it contains `stale`; with `generatedAt` deleted or set to `"not-a-date"` no pill renders at all. Four builds, four distinct observable outcomes.
- Exactly one `<h1>` appears in the prerendered HTML, it carries `class="sr-only"`, it is the first element inside `<main>`, and its text equals `IDENTITY.name` optionally followed by an em-dash and `IDENTITY.title` — asserted by reading `content/identity.ts`, never by comparing against a literal in the test.
- Exactly one element with `class="skip sr-only"` appears in the prerendered HTML.
- `npm run test:unit` and `npx playwright test` are green locally against the built site, with no spec added or modified by this branch.
- `grep -rn 'TODO(KW-004)' app components` and `grep -rniE 'bomberman|drawGame|walkable' app components lib` both return nothing, or every hit is recorded in the pull-request body with an Executor disposition and a follow-up issue number.
- `README.md` quotes no figure the pipeline produces. `grep -nE '[0-9]{3,}' README.md` returns at most the `localhost:3000` line — any other hit is a contribution total, day count, repository count or window that DEC-008 forbids. `grep -niE 'yarn|pnpm|packageManager' README.md` returns nothing.

### At-merge gate

- Every status context the live `main` ruleset requires is `success` on the exact pull-request head: `gh api repos/its-everdred/kevinweaver-dev/rulesets --jq '.[].id'` → the ruleset → its `required_status_checks`, cross-checked against `gh api repos/its-everdred/kevinweaver-dev/commits/<head>/status --jq '.statuses[] | [.context,.state] | @tsv'`.
- `ci-ok` and `e2e-ok` are both `success` on the head commit, whether or not `e2e-ok` has been promoted to required.
- The nine production assertions P-1 through P-9 all pass against `https://www.kevinweaver.dev/` after the merge commit's production deployment reports `success`, and the script's full transcript is pasted into the pull-request body.
- `gh api "repos/its-everdred/kevinweaver-dev/deployments?sha=<merge-sha>&environment=Production"` returns a deployment whose latest status is `success` — measured, not inferred from `last-modified`, which is CDN cache-fill time.
- The 2021 Lambda is gone: `GET https://www.kevinweaver.dev/api/hello` returns a plain `404` with **no** `x-vercel-error` header. Baseline for comparison, measured before this Build Order started: `404` with `x-vercel-error: FUNCTION_RUNTIME_DEPRECATED`.
- `gh api repos/its-everdred/kevinweaver-dev/rulesets --jq '.[].name'` still lists the `main` ruleset and this branch changed nothing under `.github/`.
- The Build Order's other 31 tickets are merged and their issues are terminal. This is the run's terminal condition and the capstone is the ticket that states it.

### Human/manual evidence

This ticket owns the feature-level operator evidence for the entire Build Order — `epic_acceptance.evidence` is exactly this list.

- The operator loads `https://www.kevinweaver.dev/` in a desktop browser at 1560 px width and confirms all seven regions render in comp order: header and nav, instrument pane with three canvases, the two-up man page and career log, the contact pane, the tmux status bar, and the boot overlay on a first visit.
- The operator confirms the animation plays backwards from today, that the transport controls seek, pause and change speed, and that the freshness pill's claim matches `generatedAt` in `https://www.kevinweaver.dev/data/v1/manifest.json` read in another tab.
- The operator drives the whole page keyboard-only from a cold load: the bypass link is the first tab stop and reaches `#whoami`, every transport control is reachable and operable, Space toggles playback when focus is inside the transport strip and scrolls the page when it is not, and Escape dismisses the boot overlay.
- The operator loads the site on a real phone and confirms the overview strip responds to touch drag — Playwright's touch emulation is not the same evidence, and the pointer-events conversion is the fix for a measured defect in the prototype.
- The operator enables the OS-level reduced-motion setting, reloads, and confirms one static frame renders, the clock still advances, and the pause control is present.
- The operator pastes the site URL into a link-preview validator and confirms the OG card renders; then confirms the static fallback is served when the dynamic route is unavailable.
- The operator runs `curl -sL https://www.kevinweaver.dev/kevinweaver.1 | man -l -` and confirms it renders as a man page, and reads `https://www.kevinweaver.dev/resume.txt` and confirms it matches the rendered panes.
- **GATE-004 answers, recorded in the pull-request body:** the Vercel project's Node.js version setting, the plan tier, whether production auto-promotion is enabled, and whether a dashboard Root-Directory, build-command or install-command override exists. If an install-command override exists it silently defeats `vercel.json` and must be removed or recorded as a permanent deviation.
- The operator confirms the site's contact surface publishes no phone number and no personal recovery address, reading the rendered page rather than the source.

## Failure, security, migration, and accessibility cases

**Failure — a failed production deploy is invisible from the outside.** Measured at authoring (see "Measured baseline"): a `state: failure` Production deployment while `/` still returns `200` with a complete, correct-looking page. A pass that only checks "the site loads" would go green on a Build Order that shipped nothing. P-4 (build fingerprint) and P-9 (Deployments API keyed on the merge sha) make that impossible, and neither may be weakened.

**Failure — the manifest read.** Three ways it goes wrong, and their guards. A static JSON import turns an absent bundle into a build failure on every fresh clone; the `try/catch` `readFile` returns `null` (I-4). A `JSON.parse` throw inside a Server Component fails the prerender and takes the whole site down, not just the pill; the same `try/catch` covers it. A `generatedAt` parsing to `NaN` would render `NaN hours ago`; the `Number.isNaN` check returns `undefined`. In all three the page renders correctly minus one decoration — the right blast radius for a freshness indicator.

**Failure — the pill decaying into a lie.** Guarded by I-3's bucketed label and absolute UTC timestamp. If DEC-017's schedule changes, the 36 h constant changes with it — a derived value, not a preference.

**Failure — GATE-004 unanswered.** The three dashboard-only failures are detailed in "Contradictions and gates that bind". One extra fact: a dashboard install-command override does not merely supersede `vercel.json` — the documented behaviour is that it uses the *oldest* available version of that package manager, a distinct and worse failure than not having one.

**Failure — a defect found that cannot be fixed here.** Any defect in a region, a workflow, a spec or the pipeline is out of reach (DEC-005). Record it in the pull-request body, open a follow-up issue against the owning ticket, add it to `docs/build-orders/site-rewrite/deferred-findings.md`, and get the Executor's disposition before merging. Widening the write surface to fix "just one line" destroys the partition the whole run depends on, at the moment nobody is left to notice.

**Security.** No credential, no secret, no build-time network call, no new route. Three properties are checked rather than assumed. DEC-015 is re-verified against the *deployed* bytes for `/`, `/resume.txt` and `/kevinweaver.1` using a phone-shaped regex — this document deliberately does not transcribe the number, following KW-019's practice, because it is published as a public issue body. HSTS must still be present on the apex and on `www` (`strict-transport-security: max-age=63072000`, measured); its disappearance signals a domain-configuration change nobody made. And no probed route may return `x-vercel-error`, covering `FUNCTION_RUNTIME_DEPRECATED` and every other platform error class at once. GATE-004 answers are configuration facts, not secrets — but a deployment-protection bypass token is a secret and must never be pasted into the pull-request body.

**Migration.** Two one-way migrations land in this window. The 2021 `pages/api/hello.js` Lambda is deleted by KW-001; after the first successful production deploy the route becomes an ordinary `404` and the `FUNCTION_RUNTIME_DEPRECATED` error class disappears from the origin. Nothing depended on it. The 2021 `/_next/static/*` assets remain in the CDN as immutable objects with `max-age=31536000` and are never referenced again — no redirect and no purge wanted. `README.md` is replaced wholesale: its `yarn dev` instruction is wrong after the lockfile change. Rollback for this ticket alone is `git revert` of two files, restoring KW-005's placeholder heading and dropping the freshness pill; it cannot roll back the deployment, which is governed by whatever commit is on `main`.

**Accessibility.** KW-029 owns the accessibility gate and has already run against this tree; this ticket must not regress it and adds three guards. The heading outline is preserved exactly (I-5) — a second `h1` or an un-hidden one would break the outline KW-005 established and every region's `h2` depends on. The bypass link stays singular (I-6): two skip links to the same target is a WCAG 2.4.1 anti-pattern and a keyboard-navigation annoyance. The freshness pill is never colour-only: `label` renders as text in every state and `tone` drives only the dot's background token — `{ label: '', tone: 'stale' }` would be a conformance failure expressed as data rather than markup. Beyond the page, the operator evidence above covers the three things no automated gate can reach: real-device touch on the overview strip, an OS-level reduced-motion run, and a keyboard walkthrough from a cold load with the boot overlay present.

## Surfaces

- Reads: `app/regions/Header.tsx`, `app/regions/Instrument.tsx`, `app/regions/ManPage.tsx`, `app/regions/CareerLog.tsx`, `app/regions/Contact.tsx`, `app/regions/TmuxBar.tsx`, `app/regions/BootOverlay.tsx`, `app/regions/_contract.ts`, `app/layout.tsx`, `content/identity.ts`, `public/data/v1/manifest.json`, `package.json`, `tsconfig.json`, `next.config.ts`, `vercel.json`, `scripts/ci/assert-pins.mjs`, `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`, `.github/workflows/data-bundle.yml`, `.github/rulesets/main.json`, `docs/research/2026-07-31-vercel-platform.md`, `docs/research/2026-07-31-decomposition-synthesis.md`
- Writes: `app/page.tsx`, `README.md`
- Contracts: `app/page.tsx#Page`, `app/regions/Header.tsx#HeaderFreshness`, `README.md`
- Safety: `production-deployment:www.kevinweaver.dev`

## Sibling boundaries and open gates

**Open gates.** **GATE-004 (HG-4)** blocks pickup and is answered only by the operator, in the Vercel dashboard or via `npx vercel login && vercel link` — the four facts enumerated under "Contradictions and gates that bind", two of which can make every production assertion here fail for a reason no code change addresses. **GATE-005 (HG-5)** supplies `IDENTITY.title`, the one string this ticket renders; it must already be closed because KW-006 could not have merged otherwise, but confirm the value is operator-supplied and not a placeholder. **GATE-002 (HG-2)** and **GATE-003 (HG-3)** are not this ticket's gates but are transitively required: without the `workflow` push scope KW-028's workflow never lands, and without the `CONTRIB_TOKEN` secret it lands and publishes deflated numbers. Either surfaces here as P-6.

**KW-005 owns** `app/layout.tsx`, `app/regions/_contract.ts` and the original `app/page.tsx` composition. Its Invariant 1 — one region, one file, no barrel — is why this diff is a heading and a prop. Do not add a barrel, reorder regions, or move one into or out of the `kw-2up` wrapper: `#whoami` is the bypass link's target and the anchor the header nav points at.

**KW-018 owns** `app/regions/Header.tsx`, `app/regions/TmuxBar.tsx` and `components/ds/TmuxBar.tsx`, and declares in its sibling-boundaries section that *"KW-032 performs the final composition and is the one place that may pass `freshness` to `<Header />`, reading `generatedAt` from `public/data/v1/manifest.json` at build time."* That is the authority for the prop and its limit: pass the value, change nothing inside the component.

**KW-006 owns** `content/**`. `IDENTITY.name` and `IDENTITY.title` are read, never edited. If the title is wrong, that is a GATE-005 re-open and a KW-006 change.

**KW-026 owns** `app/regions/TransportBar.tsx` and its *different* `freshness()` helper. Do not unify the two, and do not import KW-026's helper into the page.

**KW-019 and KW-020** each recorded that this ticket's "composition pass" would pick up a KW-004 icon if their region merged first. Under DEC-005 and the write-surface partition in synthesis §6 it cannot. The reconciled rule is the placeholder audit above, in the agent gate so the residual cannot be missed.

**KW-017** recorded a stale constant, `REGION_META.careerLog.accessibleName`, in `app/regions/_contract.ts` — KW-005's frozen file. Confirm its `<h2>` workaround survived; never edit `_contract.ts`.

**KW-002 owns** `.github/rulesets/main.json`, `.github/CODEOWNERS`, `AGENTS.md` and the label inventory. Its ruleset requires exactly one context, `ci-ok`, and deliberately does not promote `e2e-ok`. Enumerate and assert whatever is required; promoting anything is an Executor governance action against KW-002's file. `README.md` points at `AGENTS.md` rather than restating its rules, so the two cannot drift.

**KW-023, KW-029, KW-030 and KW-031 own** `e2e/**`, `.size-limit.json`, `scripts/ci/check-first-load.mjs`, `playwright.config.ts` and the `e2e` and `snapshots` workflows. This ticket runs their suites and reads their statuses; it adds no spec, no baseline, no budget. Do not add an end-to-end test that hits the production origin — by C-22's third ground, and because it would make every pull request depend on the state of the live site.

**KW-027 owns** `app/opengraph-image.tsx`, `app/resume.txt/route.ts`, `app/kevinweaver.1/route.ts`, `public/og.png` and the metadata export in `app/layout.tsx`. P-7 and the operator's OG check verify its work at feature level; a failure there is a KW-027 follow-up.

**KW-028 owns** `.github/workflows/data-bundle.yml` and, through it, every byte under `public/data/v1/**`. P-6 is the production assertion on its loop. If P-6 fails because the workflow has never run, the fix is a `workflow_dispatch` run by the Executor, not a committed fixture — a hand-made bundle would put an invented figure on a public page, exactly what DEC-008 forbids.

**Nothing depends on this ticket.** It is the last node in the graph, and the run's terminal condition is stated in its at-merge gate.
