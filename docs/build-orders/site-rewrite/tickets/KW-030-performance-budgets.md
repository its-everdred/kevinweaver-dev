# KW-030 — Performance budgets: size-limit hard gate and first-load assertion

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Three new files on an exclusively owned surface, no application code and no new dependency, but every one of the four budget numbers inherited from the research had to be re-measured against the pinned toolchain before it could be written down, and two of the three enforcement mechanisms the research specified are measured no-ops or hard errors on that toolchain.

**Risk:** Medium for the fleet, none for the product. This ticket ships no user-facing code and cannot change a single rendered byte, but it adds two hard failure modes to the `build` job that every later pull request must pass, and a budget set too tight fails green pull requests for reasons an agent cannot fix inside its own ticket. All three files are additive, and rollback is deleting them: `.github/workflows/ci.yml` invokes both scripts behind `if [ -f ... ]` guards, so removing the files restores the pre-ticket behaviour exactly.

**Phase hint:** 6

**Depends on:** KW-023, KW-025, KW-028

**Serializes with:** none

**Requirements:** REQ-004, REQ-010

**Decisions:** DEC-002, DEC-003, DEC-005, DEC-007, DEC-012

**Gates:** none

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

Four performance budgets stop being prose and become hard, deterministic failures on every pull request: `npm run size` fails the `build` job when the total client JavaScript, the client CSS, or the five-file first-byte data payload exceeds its ceiling; `node scripts/ci/check-first-load.mjs` fails the same job when the route-accurate first-load JavaScript for `/`, the deferred island JavaScript, or the `noModule` polyfill chunk exceeds its ceiling; and `e2e/lazy-island.spec.ts` fails the `e2e` job when any chunk the document for `/` does not declare is fetched while the instrument region is out of view. Every number is brotli, every number is reproducible from the build output alone, and no gate depends on a hosted deployment, a network fetch, or a wall clock.

## Context and evidence

This ticket exists because the site has exactly one heavy thing on it — a canvas island that plays five years of git history — and one hard product promise about data delivery: **the newest data must arrive in the first byte**. Both are architectural properties that decay silently. A budget that lives in a document is a budget that gets exceeded by 3 kB per pull request until someone measures it a year later; a lazy island stays lazy until the day an agent adds a top-level `import` and nothing anywhere notices.

The synthesis assigns this ticket three files and four numbers. **All four numbers and all three enforcement mechanisms were re-measured against the pinned toolchain during authoring, and four of them are wrong as written.** Each correction below was reproduced with the exact command shown, on Node v24.18.0 — the version `.nvmrc` pins — against a real `next build` of `next@16.2.12` + `react@19.2.8` + `react-dom@19.2.8` in App Router mode with `next.config.ts` empty, which is precisely the configuration **DEC-002** commits to and KW-001 ships.

### Correction 1 — `"running": false` is a hard configuration error, not a flag

The ci-testing track (§8.1) and the synthesis's own KW-30 pointer both specify `size-limit@13.0.3` + `@size-limit/file` "with `running:false`". Read the source: `size-limit@13.0.3`'s `get-config.js` carries an `OPTIONS` table that maps every legal config key to the plugin that must be loaded for it, and `running` maps to `'time'`. `checkChecks()` then throws `SizeLimitError('pluginlessConfig', 'running', 'time')` when the key is present and `@size-limit/time` is not installed. Measured, in a scratch directory with only `size-limit@13.0.3` and `@size-limit/file@13.0.3` installed — which is exactly what KW-001's frozen `package.json` provides:

```
$ npx size-limit          # config: [{ "path": "dist/**/*.js", "limit": "10 kB", "brotli": true, "running": false }]
 ERROR  Config option running needs @size-limit/time plugin
exit=1
```

`running` is unnecessary as well as illegal here. `@size-limit/file@13.0.3` is a single `step60` hook that stats or compresses files; it never executes a bundle, so there is no time measurement to switch off. **Do not put `running` in `.size-limit.json`.** Adding `@size-limit/time` to make the research's config legal is forbidden by **DEC-003** and is not wanted anyway.

### Correction 2 — `.next/app-build-manifest.json` does not exist in Next 16

The ci-testing track marks this one `(I)` and flags it for confirmation: *"the exact manifest filename should be confirmed against Next 16 output once the upgrade lands; `.next/app-build-manifest.json` for App Router."* Confirmed, and it is wrong. The string `app-build-manifest` appears **nowhere** in the `next@16.2.12` tarball, and `next build` emits no such file:

```
$ grep -rl "app-build-manifest" package --include="*.js"     # unpacked next-16.2.12.tgz, 170 MB
(no output)
$ ls .next/*.json
app-path-routes-manifest.json  build-manifest.json  export-marker.json
fallback-build-manifest.json   images-manifest.json prerender-manifest.json
required-server-files.json     routes-manifest.json
```

`.next/build-manifest.json` does exist but its `pages` map contains only the Pages Router legacy entry `"/_app": []`. It carries `rootMainFiles`, `polyfillFiles` and `lowPriorityFiles` — the shared runtime — but **no per-App-Router-route entry at all**. Next 16 also stopped printing the per-route "Size / First Load JS" columns in the build output; the route table is now just route names. So there is no manifest and no build log to read a first-load number out of.

What *is* authoritative is the document Next actually serves. The prerendered HTML for `/` names every chunk the browser will fetch on first load, and that is what this ticket measures.

### Correction 3 — Turbopack emits CSS under `.next/static/chunks/`, not `.next/static/css/`

Next 16 builds with Turbopack by default (`▲ Next.js 16.2.12 (Turbopack)` in the build banner, with the empty `next.config.ts` DEC-002 specifies). Measured with one `import './globals.css'` in the root layout:

```
$ find .next/static -type f | sort
.next/static/chunks/0cz1d0mv5g_q7.js
.next/static/chunks/158myu8e_yme3.js
.next/static/chunks/1de9myc15dqxx.js
.next/static/chunks/1twxq__r241ky.css      <-- CSS lives here
.next/static/chunks/25o46h8mdjlrg.js
...
```

The research's `"path": ".next/static/css/**/*.css"` matches zero files, and a size-limit check that resolves to zero files is not a silent pass — it is a hard error that fails the whole run:

```
$ npx size-limit
  ignore demo
  Size Limit can’t find files at dist/**/*.js,!dist/a.js
exit=1
```

So the wrong glob would have failed the `build` job on the day this ticket merged, with a message that reads like a tooling bug rather than a typo. The correct glob is `.next/static/chunks/**/*.css`. Chunk basenames are content hashes with no stable prefix (`1twxq__r241ky.css`, `turbopack-3a-a501wq89bd.js`), which is also why **no budget in this ticket may glob on a chunk name** — in particular there is no `gource*.js` chunk to match, and the research's `"!.next/static/chunks/**/gource*.js"` exclusion would silently exclude nothing.

### Correction 4 — the 120 kB brotli app-shell budget is below the floor of an empty page

The ci-testing track's rationale reads: *"React 19 + Next 16 runtime is roughly 90 kB brotli before app code; 120 kB leaves ~30 kB for the resume/man-page/git-log UI."* Measured against a production build of an App Router page whose entire body is `<main>hello</main>`, per-file brotli at quality 11 — the same compressor `@size-limit/file` uses:

```
     raw    brotli  chunk
  112594     35158  0cz1d0mv5g_q7.js          <- polyfills, loaded with noModule
   57909     12086  158myu8e_yme3.js          <- page + client component runtime
  201058     42711  1de9myc15dqxx.js          <- shared runtime
  227538     60679  25o46h8mdjlrg.js          <- shared runtime
   17474      5362  3z5q_p4msz2ha.js
   10547      3727  turbopack-3l1jj1uo0j4no.js
```

Excluding the polyfill chunk — which modern Chromium never downloads, verified below — a **blank App Router page first-loads 124,565 B brotli**. Adding one `next/dynamic({ ssr: false })` island behind an `IntersectionObserver` moved it to **125,946 B**. The synthesis's 120,000 B budget is therefore unreachable before a single line of this site's code exists, and a ticket that ships it ships a permanently red gate.

The number is re-based here to **165,000 B brotli**, stated as arithmetic rather than as a preference: measured floor 125,946 B, plus 39,054 B of headroom for the shell's own client JavaScript. That headroom is generous for what the plan actually makes client-side — KW-016, KW-017 and KW-019 are RSC panes with zero client JavaScript by their own invariants, so the only client code in the first load is the header scroll-spy (KW-018), the tmux bar (KW-018), the boot overlay (KW-020), the transport bar (KW-026) and the bundle loader (KW-015). The intent of the synthesis's budget survives intact: **the app shell may not grow by a third without a deliberate, reviewed decision.** Only the origin of the number changed, from an estimate to a measurement.

The 90,000 B deferred-JavaScript budget is kept exactly as the synthesis states it. It is a real constraint: `docs/research/2026-07-31-viz-runtime.md` §7 sets the viz runtime's own budget at **≤ 20 KB gzip** and §10.6 estimates the shipped total at **≈ 17 KB gzip** (`d3-hierarchy` `packSiblings`/`packEnclose` 2.3 KB measured, plus sim, render and sprites). 90 kB brotli leaves room for that to be wrong by 4× and still forbids anyone reaching for a charting library — which is the point, since KW-021 explicitly rejects `d3-force` (9.25 KB) and GSAP (28.3 KB gzip) on size grounds.

The 12 kB brotli first-byte data budget is kept exactly, because it is **DEC-007** and it was measured, not estimated: the corrected first byte is `400 + 1,058 + 1,230 + 1,925 + 4,985 = 9,598 B` brotli across `manifest.json`, `repos.json`, `grid.json`, `events/ee-00.json` and `paths/pd-00.json` (contradiction **C-9**, verifier's figure — the body's 9,324 B is superseded). The 24 kB brotli CSS budget is kept exactly.

### Correction 5 — Lighthouse CI is not shippable inside this ticket, and is deferred

The synthesis's acceptance line for this ticket ends *"and LHCI a11y and SEO are hard-gated at 1.0."* That cannot be delivered on this ticket's write surface, for two independent reasons, and pretending otherwise would produce a file on a surface nobody owns.

1. **No dependency and no workflow are available.** `@lhci/cli@0.15.1` exists but is not in KW-001's frozen dependency set, and **DEC-003** forbids editing `package.json`. The alternative — `treosh/lighthouse-ci-action@12.6.2`, which exists (latest release 2026-03-12) and bundles its own LHCI — requires a workflow file. `.github/workflows/ci.yml` belongs to KW-001, `e2e.yml` to KW-023, `data-bundle.yml` to KW-028 and `snapshots.yml` to KW-031; the write-surface partition in the synthesis §6 assigns no workflow and no `lighthouserc.json` to this ticket or to any other.
2. **It could not be a required check anyway.** The ci-testing track (§8.2) is explicit that LHCI must run *only* against the Vercel preview URL, never against `next start` on a runner, because a runner has no CDN, no brotli negotiation and no edge caching. Contradiction **C-22** — adopted verbatim by KW-023 — established that a preview-triggered context can never be a required check on this repository: `vercel.deployment.ignored` / `.skipped` / `.error` emit no dispatch, so a required preview context sits at *"Expected — Waiting for status to be reported"* forever with no workflow-side fix.

The *outcome* the LHCI line was reaching for is already owned and already hard: **KW-029** hard-gates accessibility with an axe run inside the pinned container (zero `wcag2a`/`wcag2aa`/`wcag21a`/`wcag21aa` violations), which is strictly more deterministic than a Lighthouse accessibility score, and **KW-027** owns metadata, canonical, OG and `/resume.txt`. A `lighthouserc.json` plus a post-merge preview canary is recorded in the deferred ledger for the Executor as a *new* ticket, exactly as KW-023 recorded `.github/workflows/preview.yml`. It is not created here. This is recorded as `unresolvedRefs`-grade honesty, not as scope creep in either direction.

### Correction 6 — the action the research warns about, confirmed

`andresz1/size-limit-action` is still to be avoided: latest release `v1.8.0`, published `2024-04-06`, `action.yml` declaring the deprecated `using: 'node20'` runtime. Re-confirmed during authoring. This ticket runs `size-limit` through the `npm run size` script KW-001 already declared, inside the `build` job, with no action at all.

### Requirements this ticket discharges

- **REQ-004** — the generated activity payload is delivered newest-first inside a hard first-byte budget. This ticket is the enforcement half of that requirement: KW-012 designs the wire format, KW-014 writes it, KW-015 reads it, and nothing until now made "12 kB brotli" fail a build.
- **REQ-010** — every pull request is gated by a hermetic browser-level proof, built by this repository and exercised in a version-pinned browser container with zero dependency on any hosted preview deployment, version-locked end to end. `e2e/lazy-island.spec.ts` is a new spec inside exactly that gate, and it deliberately fetches nothing from outside the local `webServer`.

### Decisions that bind

- **DEC-002** — Next 16.2.12 + React 19.2.8 + App Router with no `output: 'export'`. Every measurement above is against that exact configuration, and the absence of `output: 'export'` is why `.next/server/app/index.html` exists to be read at all.
- **DEC-003** — `package.json` and `package-lock.json` are frozen after KW-001. `size-limit@13.0.3` and `@size-limit/file@13.0.3` are already installed and the `size` script is already declared; this ticket installs nothing, and the absence of `@size-limit/time`, `@lhci/cli` and `@size-limit/preset-app` is a constraint, not an oversight.
- **DEC-005** — zero `serializes_with` pairs; every same-wave ticket owns a disjoint write surface. The three files below are owned by nobody else in any wave.
- **DEC-007** — Scheme D, first-byte budget 12 kB brotli over `manifest + repos + grid + ee-00 + pd-00`, dictionary-slice split guard 12 kB gzip. This ticket enforces the first-byte half in the pull-request gate; the split guard belongs to KW-014's validator and the workflow-side budget step to KW-028.
- **DEC-012** — auto-merge on, no merge queue, code-owner review scoped to gate files. `.size-limit.json` and `scripts/ci/check-first-load.mjs` are gate files: expect KW-002's CODEOWNERS to require a code-owner review on them, and do **not** add any new context to the ruleset from this ticket.

**Plan-context navigation** (repository-relative paths; research paths resolve at `e664d73a195facd64db58ba10952170ff01b4772`, browsable at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research`):

- Pack index and the KW-01..KW-32 → KW-001..KW-032 identity mapping: `docs/build-orders/site-rewrite/README.md`.
- Ticket manifest, surfaces and graph edges: `docs/build-orders/site-rewrite/build-order.json`.
- Wave diagram, verified topological levels, critical path and the write-surface partition proof: `docs/research/2026-07-31-decomposition-synthesis.md` §6.
- Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007): `docs/research/2026-07-31-decomposition-synthesis.md` §3 and §4, mirrored into `build-order.json`.
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, wave 5, the **KW-30** entry; plus `docs/research/2026-07-31-ci-testing.md` §8.1 and §8.2 and its "Verification corrections" C4/C6, `docs/research/2026-07-31-viz-runtime.md` §7 and §10.6, and `docs/research/2026-07-31-data-pipeline.md` for the Scheme D first-byte arithmetic behind DEC-007.
- Executor authority and the live gate register: `docs/build-orders/site-rewrite/authority-envelope.md`.

## Scope

- Create `.size-limit.json` at the repository root with exactly three checks — the five-file first-byte data payload at 12 kB brotli, the client CSS at 24 kB brotli, and the total client JavaScript ceiling at 295 kB brotli — using only config keys legal for a `size-limit` install that has `@size-limit/file` and no other plugin.
- Create `scripts/ci/check-first-load.mjs`: a zero-dependency Node ES module that derives the route-accurate first-load set for `/` from the served document rather than from a build manifest, splits every emitted chunk into first-load, deferred and `noModule` polyfill groups, brotli-measures each group, prints a table, and exits non-zero on any breach.
- Enforce three budgets in that script: first-load JavaScript for `/` at 165,000 B brotli, deferred JavaScript at 90,000 B brotli, and the `noModule` polyfill chunk at 40,000 B brotli.
- Give the script a `--json` mode emitting a stable machine shape, so a later ticket or an operator can trend the numbers without re-parsing human output.
- Create `e2e/lazy-island.spec.ts` with two specs that consume KW-023's `playwright.config.ts` unchanged: one proving no undeclared chunk is fetched while the instrument region is out of view, one proving that scrolling it into view fetches at least one chunk the document never declared.
- Make both specs deterministic against KW-020's boot overlay by pre-setting its session key in an init script and, as a fallback, dismissing any open dialog before measuring.
- Prove each budget fails on a deliberate regression and record the proof in the pull-request body.

## Non-goals

- No edit to `package.json` or `package-lock.json` — frozen by DEC-003. `size-limit@13.0.3`, `@size-limit/file@13.0.3` and the `"size": "size-limit"` script are KW-001's deliverables. If any is missing at pickup, report it as a KW-001 defect and stop; do not add it, and do not add `@size-limit/time`, `@size-limit/preset-app`, `@lhci/cli` or any reporter.
- No edit to `.github/workflows/ci.yml`. KW-001 owns it and already invokes both scripts behind `if [ -f ... ]` guards; this ticket activates those slots by adding files, never by editing the workflow.
- No new workflow file. `.github/workflows/{ci,e2e,data-bundle,snapshots}.yml` belong to KW-001, KW-023, KW-028 and KW-031 respectively, and no fifth workflow is assigned to anyone.
- No `lighthouserc.json`, no `@lhci/cli`, no `treosh/lighthouse-ci-action`, no preview-triggered job. Deferred with reasons above; the Executor's ledger owns it.
- No edit to `playwright.config.ts`. KW-023 owns it and KW-031 owns the only sanctioned follow-up edit. `e2e/lazy-island.spec.ts` is picked up by the existing `desktop-1x` and `mobile-1x` projects because both declare `testIgnore: [/smoke\.spec\.ts/, /canvas\.spec\.ts/]`; do not add a project, do not rename one, do not weaken `retries: 0`.
- No edit to `e2e/smoke.spec.ts`, `e2e/screenshot.css`, `e2e/a11y.spec.ts`, `e2e/canvas.spec.ts` or `e2e/__screenshots__/**` — KW-023, KW-029 and KW-031 own those.
- No screenshot assertion of any kind. No `toHaveScreenshot`, no `snapshotPathTemplate`, no baseline. KW-031 owns every pixel comparison in this repository.
- No axe run, no accessibility assertion, no contrast unit test — KW-029 owns all of it and runs in the same wave.
- No edit to `scripts/pipeline/budget.ts`. KW-028 owns the workflow-side first-byte budget step that runs inside the daily data workflow. This ticket measures the same five files inside the pull-request gate, from a different file, in a different workflow. Two independent measurements of one invariant is the intent; one ticket editing the other's file is not.
- No application code. Do not add a `data-testid`, a test hook, an `id`, a `window.__*` global or a `?flag=1` query parameter to any file under `app/**`, `components/**` or `lib/**`. The e2e spec must work against the markup KW-005, KW-020 and KW-025 already guarantee.
- No change to any budget's *intent*. If a measured budget cannot be met by the code as it stands, that is a defect report against the owning ticket, not a licence to raise the number in this file.
- No repository secret is read, minted or required, and no gate added here may fetch from a network origin other than the local `webServer`.

## Existing owner and reuse target

Nothing this ticket writes exists at `e664d73a195facd64db58ba10952170ff01b4772` — `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772 -- scripts e2e .size-limit.json` returns nothing, and the tree at that commit is the 2021 Pages Router site. All three files are created new.

Everything this ticket consumes is either measured to exist externally or created by a named upstream ticket:

| Target | Status |
|---|---|
| `size-limit@13.0.3` | **Exists.** `npm view size-limit version -> 13.0.3`. Installed by KW-001 under DEC-003. `engines.node` is `^22.18.0 \|\| ^24.0.0 \|\| >=26.0.0`; `.nvmrc` pins `24`. |
| `@size-limit/file@13.0.3` | **Exists.** `npm view @size-limit/file version -> 13.0.3`, `peerDependencies: { "size-limit": "13.0.3" }`. Installed by KW-001. Source read during authoring: a single `step60` hook, brotli quality 11 by default, `gzip: true` switches to gzip level 9, `brotli: false` switches to raw byte count. Files are compressed **individually and summed**, never concatenated. |
| `npm run size` (`= size-limit`) | **Created by KW-001** in the frozen script block. Invoke it; do not redefine it. |
| `.size-limit.json` as a config search place | **Verified in source.** `size-limit@13.0.3`'s `get-config.js` passes `searchPlaces: ['package.json', '.size-limit.json', '.size-limit', '.size-limit.js', ...]` to `lilconfig`. A root `.size-limit.json` is found with no CLI flag. |
| `.github/workflows/ci.yml` `build` job, steps `bundle budgets` and `first-load budget` | **Created by KW-001**, verbatim: `if [ -f .size-limit.json ]; then npm run size; else echo "no .size-limit.json yet - skipping"; fi` and `if [ -f scripts/ci/check-first-load.mjs ]; then node scripts/ci/check-first-load.mjs; else echo "no first-load checker yet - skipping"; fi`. Both run **after** `npm run build` in the same job. Read them; never edit them. |
| `ci-ok` status context | **Created by KW-001.** The only required check on `main`. `build` is one of its `needs`, so a budget breach turns `ci-ok` red. |
| `playwright.config.ts`, projects `desktop-1x` and `mobile-1x`, `e2e-ok` context | **Created by KW-023.** `testDir: './e2e'`, `retries: 0`, `timezoneId: 'UTC'`, `locale: 'en-US'`, `colorScheme: 'dark'`, `webServer` running `npm run start` on `127.0.0.1:3000`, `baseURL` defaulting to that origin. Both projects match this spec through their `testIgnore`. |
| `.next/server/app/index.html` | **Emitted by `next build`** for a statically prerendered `/`. Measured present in a Next 16.2.12 App Router build. The script and the spec both fall back to an HTTP `GET /` so neither depends on `/` staying static. |
| `.next/build-manifest.json` keys `rootMainFiles`, `polyfillFiles`, `lowPriorityFiles` | **Emitted by `next build`.** Measured shape reproduced verbatim below. `pages` contains only `"/_app": []` in App Router mode and must not be read. |
| `public/data/v1/{manifest.json,repos.json,grid.json,events/ee-00.json,paths/pd-00.json}` | **Created by KW-012 (format) and KW-014 (writer), committed to the repository by KW-028's daily workflow.** These are the five files DEC-007's first-byte budget is defined over. This ticket depends on KW-028 precisely so they exist on `main` when the budget starts running. |
| `app/regions/Instrument.tsx` and the lazy island boundary | **Created by KW-025**, whose acceptance already states "island not requested until in view". This ticket asserts that property; it does not implement it. |
| `REGION_META.instrument.titleId === 'region-instrument-title'`, `landmark: 'section'`, `accessibleName: 'contribution instrument'` | **Created by KW-005** in `app/regions/_contract.ts`. The e2e spec locates the region through the title id, which is the only part of that record a region ticket may not change. |
| `sessionStorage` key `kw.boot.v1` | **Created by KW-020** as the boot overlay's once-per-session guard. The spec pre-sets it so the overlay never mounts. If KW-020 renamed it, the spec's dialog-dismissal fallback still works and the rename is a KW-020 change request. |
| Node `fs.promises.glob` and `zlib.brotliCompress` | **Node built-ins**, available on Node 24. `check-first-load.mjs` has zero package dependencies by design, so it runs identically in the `build` job and on a developer machine. |

## Contract and invariants

This ticket is a pure consumer of upstream contracts and produces one small new one: the JSON shape of `check-first-load.mjs --json`. Three seams matter.

### Seam 1 — the budget table is the single source of truth

Six numbers, two files, one table. Nothing else in the repository may state a performance budget.

| Budget key | Limit (bytes, brotli q11) | Enforced by | Basis |
|---|---|---|---|
| `firstLoadJs` | `165_000` | `scripts/ci/check-first-load.mjs` | measured floor 125,946 B on the pinned toolchain, plus 39,054 B headroom |
| `deferredJs` | `90_000` | `scripts/ci/check-first-load.mjs` | synthesis KW-30; viz runtime's own budget is ≤ 20 KB gzip, estimated ≈ 17 KB gzip |
| `polyfillJs` | `40_000` | `scripts/ci/check-first-load.mjs` | measured 35,158 B for the `noModule` chunk |
| total client JS | `295_000` | `.size-limit.json` | `165_000 + 90_000 + 40_000`, exactly |
| client CSS | `24_000` | `.size-limit.json` | synthesis KW-30 |
| first-byte data payload | `12_000` | `.size-limit.json` | DEC-007; measured 9,598 B |

Invariants:

1. **Every limit is brotli.** `@size-limit/file` defaults to brotli quality 11 and `check-first-load.mjs` uses `BROTLI_PARAM_QUALITY: 11` for the same reason: the two numbers must be comparable, and the total ceiling must equal the sum of the three parts.
2. **`bytes-iec` parses `kB` as 1000 bytes, not 1024.** `"12 kB"` becomes `sizeLimit: 12000`, verified by `npx size-limit --json`. If you ever want binary units the token is `KiB`. Never mix them in one file.
3. **The polyfill chunk is excluded from the first-load budget and given its own.** Next emits it with `noModule`, and a modern browser never downloads it — proved at runtime below, where Chromium requested six of the seven declared chunks and skipped exactly the polyfill. Counting it against first load would be a lie; leaving it unbudgeted would let it grow forever.
4. **No budget globs a chunk basename.** Turbopack chunk names are content hashes. Classification is by *role* — declared by the document for `/`, or listed in `polyfillFiles`, or neither — never by name.
5. **A check that resolves to zero files is a failure, not a pass.** This is `size-limit`'s own behaviour and it is desirable: it means a data bundle that vanished, or a CSS pipeline that stopped emitting, fails loudly.

### Seam 2 — `check-first-load.mjs --json` output

The only new machine-readable shape this ticket introduces. Stable; quote it verbatim if you consume it.

```ts
/** `node scripts/ci/check-first-load.mjs --json` writes this to stdout and nothing else. */
interface FirstLoadReport {
  /** Compression the byte counts are measured under. Always 'brotli'. */
  compression: 'brotli'
  /** Route the first-load set was derived for. Always '/' today. */
  route: string
  /** Where the declared set came from: the prerendered file, or a live GET. */
  source: 'prerendered-html' | 'http'
  groups: {
    firstLoadJs: FirstLoadGroup
    deferredJs: FirstLoadGroup
    polyfillJs: FirstLoadGroup
  }
  /** true when every group is at or under its limit. */
  passed: boolean
}

interface FirstLoadGroup {
  /** Repository-relative paths under .next/, sorted, e.g. 'static/chunks/25o46h8mdjlrg.js'. */
  files: string[]
  /** Sum of the per-file brotli sizes, in bytes. */
  bytes: number
  /** The budget from the table above, in bytes. */
  limit: number
  passed: boolean
}
```

Invariant: `groups.firstLoadJs.files`, `groups.deferredJs.files` and `groups.polyfillJs.files` are pairwise disjoint and their union is exactly the set of `*.js` files under `.next/static/chunks/`. The script asserts this before reporting; a chunk that lands in no group is a bug in the classifier, not a passing build.

### Seam 3 — what `e2e/lazy-island.spec.ts` consumes and what it may not assume

From KW-023 (do not modify): `testDir: './e2e'`, project names, `retries: 0`, `baseURL`. From KW-005 (guaranteed): `REGION_META.instrument.titleId === 'region-instrument-title'` rendered on the instrument region's title element, and `#contact` as a fragment target on the contact region, which sits below the instrument in comp document order. From KW-020 (guaranteed): the boot overlay is `role="dialog"`, `aria-modal="true"`, dismissible with `Escape`, and suppressed when its `sessionStorage` key is already set.

The spec may **not** assume: any `data-testid`; any chunk file name; that the instrument region is above or below the fold at any particular viewport; that `/` is statically prerendered; that `window.__viz` exists (that is KW-024's harness and is gated behind `?viz-test=1`).

The spec asserts its own precondition. If the instrument region is still in the viewport after navigating to `/#contact`, the spec fails with an explicit message rather than passing vacuously — a lazy-load test that silently degrades into a no-op is worse than no test, and that failure mode is exactly what contradiction **C-23** was raised about in the sibling gate tickets.

## Refreshable implementation notes

Re-verify against `origin/main` at pickup; the base will have moved well past `e664d73a195facd64db58ba10952170ff01b4772`, because all three dependencies land first.

### Pre-flight — 90 seconds, and it prevents every avoidable failure in this ticket

```bash
node -p "require('./package.json').devDependencies['size-limit']"        # expect 13.0.3
node -p "require('./package.json').devDependencies['@size-limit/file']"  # expect 13.0.3
node -p "require('./package.json').devDependencies['@size-limit/time']"  # expect undefined
node -p "require('./package.json').scripts.size"                         # expect "size-limit"
test -f playwright.config.ts && grep -c "desktop-1x\|mobile-1x" playwright.config.ts
ls public/data/v1/manifest.json public/data/v1/repos.json public/data/v1/grid.json \
   public/data/v1/events/ee-00.json public/data/v1/paths/pd-00.json
grep -n "region-instrument-title" app/regions/_contract.ts
npm run build && ls .next/server/app/index.html && ls .next/static/chunks | head
```

If the five data files are absent, **stop**: KW-028's workflow has not committed a bundle yet, and the 12 kB check would fail the `build` job with `Size Limit can’t find files at …`. That is a KW-028 escalation, not something to work around by loosening the glob.

If `.next/server/app/index.html` is absent, `/` is being rendered dynamically by some upstream region. That is legal and the script handles it: it falls back to an HTTP `GET /` against a locally started server. Record which path you exercised in the pull-request body.

### File 1 — `.size-limit.json` (repository root, new)

```json
[
  {
    "name": "first-byte data payload (manifest + repos + grid + newest event chunk + newest dictionary slice)",
    "path": [
      "public/data/v1/manifest.json",
      "public/data/v1/repos.json",
      "public/data/v1/grid.json",
      "public/data/v1/events/ee-00.json",
      "public/data/v1/paths/pd-00.json"
    ],
    "limit": "12 kB",
    "brotli": true
  },
  {
    "name": "client CSS",
    "path": ".next/static/chunks/**/*.css",
    "limit": "24 kB",
    "brotli": true
  },
  {
    "name": "total client JavaScript (first load + deferred + noModule polyfills)",
    "path": ".next/static/chunks/**/*.js",
    "limit": "295 kB",
    "brotli": true
  }
]
```

Three things about this file that are easy to get wrong:

- **`brotli: true` is the default**, kept explicit so the unit is legible next to the limit string. Do not add `gzip`, and above all do not add `running` (Correction 1).
- **The five data paths are listed individually, not globbed.** `public/data/v1/events/**` would sweep in every history chunk — roughly 31 of them (DEC-007) — and turn a first-byte budget into a whole-corpus budget. The budget is about the *first round trip*, so it names the first round trip's files.
- **The `.css` and `.js` checks share the same directory** because Turbopack co-locates them (Correction 3). They are separated by extension, not by directory.

### File 2 — `scripts/ci/check-first-load.mjs` (new)

Zero dependencies. Run it after `npm run build`, from the repository root.

```js
#!/usr/bin/env node
// Route-accurate first-load budget for `/`.
//
// Next 16.2.12 emits no `app-build-manifest.json` and no per-route entry in
// `build-manifest.json` (`pages` holds only the Pages-Router `"/_app": []`), and
// `next build` no longer prints a First Load JS column. The authoritative
// statement of "what the browser fetches for /" is therefore the document Next
// serves: every `/_next/static/chunks/*.js` reference in the HTML for `/` plus
// the shared runtime in `build-manifest.json.rootMainFiles`. Anything emitted
// under `.next/static/chunks/` that the document does not declare is, by
// construction, deferred - which is exactly the island this budget bounds.
//
// Chunk basenames are Turbopack content hashes, so nothing here may match on a
// name. Classification is by role only.

import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { brotliCompress, constants } from 'node:zlib'
import { promisify } from 'node:util'

const brotli = promisify(brotliCompress)

const NEXT_DIR = '.next'
const ROUTE = '/'
const PRERENDERED_HTML = join(NEXT_DIR, 'server', 'app', 'index.html')
const BUILD_MANIFEST = join(NEXT_DIR, 'build-manifest.json')

// Matches `/_next/static/chunks/<hash>.js` wherever it appears in the document:
// a <script src>, a <link rel=preload href>, or an escaped string inside the RSC
// flight payload (which renders as `\"/_next/...\"`, hence the backslash guard).
const HTML_ASSET_RE = /\/_next\/(static\/[^"'\\\s)]+?\.js)/g

/** The one place any performance budget in this repository is stated. */
const BUDGETS = {
  firstLoadJs: 165_000,
  deferredJs: 90_000,
  polyfillJs: 40_000,
}

const asJson = process.argv.includes('--json')

async function brotliBytes(file) {
  const buf = await readFile(file)
  const out = await brotli(buf, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })
  return out.length
}

async function documentHtml() {
  if (existsSync(PRERENDERED_HTML)) {
    return { source: 'prerendered-html', html: await readFile(PRERENDERED_HTML, 'utf8') }
  }
  const origin = process.env.BASE_URL ?? 'http://127.0.0.1:3000'
  const res = await fetch(new URL(ROUTE, origin))
  if (!res.ok) {
    throw new Error(
      `no ${PRERENDERED_HTML} and GET ${origin}${ROUTE} returned ${res.status}. ` +
        `Run \`npm run build\`, or start the server and set BASE_URL.`,
    )
  }
  return { source: 'http', html: await res.text() }
}

async function emittedChunks() {
  const root = join(NEXT_DIR, 'static')
  const entries = await readdir(root, { withFileTypes: true, recursive: true })
  return entries
    .filter(e => e.isFile() && e.name.endsWith('.js'))
    .map(e => relative(NEXT_DIR, join(e.parentPath, e.name)).split(sep).join('/'))
    .filter(f => f.startsWith('static/chunks/'))
    .sort()
}

const { source, html } = await documentHtml()
const manifest = JSON.parse(await readFile(BUILD_MANIFEST, 'utf8'))

const declared = new Set([...html.matchAll(HTML_ASSET_RE)].map(m => m[1]))
for (const f of manifest.rootMainFiles ?? []) declared.add(f)
const polyfills = new Set(manifest.polyfillFiles ?? [])

const groups = { firstLoadJs: [], deferredJs: [], polyfillJs: [] }
const chunks = await emittedChunks()
for (const file of chunks) {
  if (polyfills.has(file)) groups.polyfillJs.push(file)
  else if (declared.has(file)) groups.firstLoadJs.push(file)
  else groups.deferredJs.push(file)
}

// The three groups must partition the emitted chunk set exactly. A chunk that
// lands nowhere is a classifier bug, not a passing build.
const classified = Object.values(groups).flat().length
if (classified !== chunks.length) {
  throw new Error(`classified ${classified} of ${chunks.length} emitted chunks`)
}

const report = { compression: 'brotli', route: ROUTE, source, groups: {}, passed: true }
for (const [key, files] of Object.entries(groups)) {
  let bytes = 0
  for (const f of files) bytes += await brotliBytes(join(NEXT_DIR, f))
  const limit = BUDGETS[key]
  const passed = bytes <= limit
  if (!passed) report.passed = false
  report.groups[key] = { files, bytes, limit, passed }
}

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`first-load budget for ${ROUTE}  (brotli, source: ${source})`)
  for (const [key, g] of Object.entries(report.groups)) {
    console.log(
      `  ${g.passed ? 'PASS' : 'FAIL'}  ${key.padEnd(12)} ` +
        `${String(g.bytes).padStart(7)} B / ${g.limit} B  ` +
        `(${g.files.length} file${g.files.length === 1 ? '' : 's'})`,
    )
    for (const f of g.files) console.log(`          ${f}`)
  }
  if (!report.passed) {
    console.error(
      '::error::first-load budget exceeded. Do not raise the limit in this file; ' +
        'move code behind the lazy island or report a defect against the owning ticket.',
    )
  }
}

process.exit(report.passed ? 0 : 1)
```

Notes for the implementing agent:

- `readdir(..., { recursive: true })` returns `Dirent`s whose `parentPath` is absolute-or-relative to the call; joining `e.parentPath` with `e.name` and relativising against `.next` is what produces manifest-shaped keys such as `static/chunks/25o46h8mdjlrg.js`. Those are exactly the strings `build-manifest.json` uses, which is why no normalisation is needed on the manifest side.
- `.split(sep).join('/')` matters only if this ever runs on Windows. It costs nothing and removes a whole class of "works on the runner, not on my laptop".
- The script deliberately does **not** measure CSS. `.size-limit.json` owns the CSS ceiling and there is no route-accurate split worth making for one stylesheet.
- Do not add a `process.env.CI` branch. The script must behave identically locally and in CI, or the local run stops being evidence.

### File 3 — `e2e/lazy-island.spec.ts` (new)

```ts
import { test, expect, type Page } from '@playwright/test'

/**
 * Proves the canvas island is lazy: no chunk outside the set the document for
 * `/` declares is fetched while the instrument region is out of view, and
 * scrolling it into view fetches at least one chunk that was never declared.
 *
 * Deliberately name-free. Turbopack chunk basenames are content hashes, so the
 * only stable way to say "the island chunk" is "a chunk the document did not
 * declare". That definition also survives a bundler change.
 */

const CHUNK_PATH_RE = /^\/_next\/static\/chunks\/.+\.js$/
const HTML_ASSET_RE = /\/_next\/static\/chunks\/[^"'\\\s)]+?\.js/g

/** KW-020's once-per-session guard. Set before load so the overlay never mounts. */
const BOOT_SESSION_KEY = 'kw.boot.v1'

function trackChunkRequests(page: Page): Set<string> {
  const seen = new Set<string>()
  page.on('request', r => {
    const p = new URL(r.url()).pathname
    if (CHUNK_PATH_RE.test(p)) seen.add(p)
  })
  return seen
}

/** Every chunk the served document for `/` names. Works for static or dynamic routes. */
async function declaredChunks(page: Page): Promise<Set<string>> {
  const res = await page.request.get('/')
  expect(res.status()).toBe(200)
  const html = await res.text()
  const declared = new Set([...html.matchAll(HTML_ASSET_RE)].map(m => m[0]))
  expect(declared.size).toBeGreaterThan(0)
  return declared
}

/** KW-005 guarantees this id on the instrument region's title element. */
function instrumentRegion(page: Page) {
  return page.getByRole('region').filter({ has: page.locator('#region-instrument-title') })
}

async function settle(page: Page) {
  // Belt and braces behind the session key: if KW-020 ever renames the key, the
  // overlay still gets dismissed and this spec still measures what it claims to.
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) {
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  }
  await page.waitForLoadState('networkidle')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(key => {
    try {
      window.sessionStorage.setItem(key, '1')
    } catch {
      /* partitioned storage: KW-020 fails closed and renders nothing */
    }
  }, BOOT_SESSION_KEY)
})

test('no undeclared chunk is fetched while the instrument region is out of view', async ({
  page,
}) => {
  const declared = await declaredChunks(page)
  const requested = trackChunkRequests(page)

  // Land below the instrument. `#contact` is KW-005's anchor on the contact
  // region, which sits after the instrument in comp document order.
  await page.goto('/#contact', { waitUntil: 'networkidle' })
  await settle(page)

  // Precondition, asserted rather than assumed. If the instrument is still in
  // the viewport this spec would pass vacuously, so it fails instead.
  await expect(
    instrumentRegion(page),
    'the instrument region must start out of view for this assertion to mean anything; ' +
      'if the page layout changed, fix this spec deliberately rather than deleting it',
  ).not.toBeInViewport()

  const undeclared = [...requested].filter(p => !declared.has(p))
  expect(undeclared, `undeclared chunks fetched before intersection: ${undeclared.join(', ')}`)
    .toEqual([])
})

test('scrolling the instrument region into view fetches the deferred island chunk', async ({
  page,
}) => {
  const declared = await declaredChunks(page)
  const requested = trackChunkRequests(page)

  await page.goto('/#contact', { waitUntil: 'networkidle' })
  await settle(page)
  const before = new Set(requested)

  const instrument = instrumentRegion(page)
  await instrument.scrollIntoViewIfNeeded()
  await expect(instrument).toBeInViewport()
  await page.waitForLoadState('networkidle')

  const arrived = [...requested].filter(p => !before.has(p))
  expect(
    arrived.length,
    'intersecting the instrument region fetched no new chunk: the island is either eagerly ' +
      'bundled into the first load or is not mounted behind an IntersectionObserver',
  ).toBeGreaterThan(0)
  for (const p of arrived) expect(declared.has(p)).toBe(false)
})
```

Notes for the implementing agent:

- `page.request.get('/')` is an API request outside the browser context, so it never pollutes the `page.on('request')` tally. That is why it is called before `trackChunkRequests`.
- `waitUntil: 'networkidle'` plus a second `waitForLoadState('networkidle')` after the scroll is deliberate. `retries: 0` is a KW-023 invariant, so this spec must be genuinely deterministic rather than retried into green.
- If the first spec's precondition fails at `desktop-1x` because the instrument sits high in a short page, do **not** delete the assertion. Options in order of preference: keep `/#contact` and check that the anchor scroll actually happened; restrict the spec to `mobile-1x` with `test.skip(({}, testInfo) => testInfo.project.name !== 'mobile-1x')`; or raise it with KW-025's owner. Deleting the precondition converts the gate into decoration.

### Worked data — measured end to end during authoring

Production build of `next@16.2.12` + `react@19.2.8`, App Router, empty `next.config.ts`, one `next/dynamic({ ssr: false })` island behind an `IntersectionObserver`, Node v24.18.0:

```
$ node scripts/ci/check-first-load.mjs
first-load budget for /  (brotli, source: prerendered-html)
  PASS  firstLoadJs   125946 B / 165000 B  (6 files)
          static/chunks/0f8qr0v5j9qke.js
          static/chunks/0ql86nqtkm8pc.js
          static/chunks/158myu8e_yme3.js
          static/chunks/25o46h8mdjlrg.js
          static/chunks/2wr6r8sz3s2yd.js
          static/chunks/turbopack-3a-a501wq89bd.js
  PASS  deferredJs       220 B / 90000 B  (1 file)
          static/chunks/3zl33388rmibk.js
  PASS  polyfillJs     35158 B / 40000 B  (1 file)
          static/chunks/0cz1d0mv5g_q7.js
exit=0
```

`static/chunks/3zl33388rmibk.js` is the island: it is on disk, it is absent from the document for `/`, and reading it shows the dynamically imported module's own code. The classification is correct with no name matching anywhere.

The corresponding `build-manifest.json`, reproduced so the shape is not a guess:

```json
{
  "pages": { "/_app": [] },
  "devFiles": [],
  "polyfillFiles": ["static/chunks/0cz1d0mv5g_q7.js"],
  "lowPriorityFiles": [
    "static/PBWVsz741aQsdTyHRTvT0/_buildManifest.js",
    "static/PBWVsz741aQsdTyHRTvT0/_ssgManifest.js",
    "static/PBWVsz741aQsdTyHRTvT0/_clientMiddlewareManifest.js"
  ],
  "rootMainFiles": [
    "static/chunks/0f8qr0v5j9qke.js",
    "static/chunks/2wr6r8sz3s2yd.js",
    "static/chunks/25o46h8mdjlrg.js",
    "static/chunks/turbopack-3a-a501wq89bd.js"
  ]
}
```

`size-limit` against the same build, with a five-file stand-in data bundle in `public/data/v1/`:

```
$ npx size-limit
  first-byte data payload (manifest + repos + grid + newest event chunk + newest dictionary slice)
  Size limit: 12 kB
  Size:       3.4 kB brotlied

  client CSS
  Size limit: 24 kB
  Size:       57 B  brotlied

  total client JavaScript (first load + deferred + noModule polyfills)
  Size limit: 295 kB
  Size:       161.32 kB brotlied
exit=0
```

161,324 B = 125,946 + 220 + 35,158, exactly. The two tools agree by construction, which is the cheapest available check that neither has drifted.

`npx size-limit --json` on the same run, so the machine shape is known:

```json
[
  { "name": "first-byte data payload (…)", "passed": true, "size": 3403,   "sizeLimit": 12000 },
  { "name": "client CSS",                  "passed": true, "size": 57,     "sizeLimit": 24000 },
  { "name": "total client JavaScript (…)", "passed": true, "size": 161324, "sizeLimit": 295000 }
]
```

The lazy-island spec against the same build, on the `desktop-1x` project:

```
$ npx playwright test --project=desktop-1x e2e/lazy-island.spec.ts
declared:  0cz1d0mv5g_q7.js 0f8qr0v5j9qke.js 0ql86nqtkm8pc.js 158myu8e_yme3.js
           25o46h8mdjlrg.js 2wr6r8sz3s2yd.js turbopack-3a-a501wq89bd.js
requested: 0f8qr0v5j9qke.js 0ql86nqtkm8pc.js 158myu8e_yme3.js
           25o46h8mdjlrg.js 2wr6r8sz3s2yd.js turbopack-3a-a501wq89bd.js
  ✓  no undeclared chunk is fetched while the island is out of view (593ms)
deferred arrivals: /_next/static/chunks/3zl33388rmibk.js
  ✓  scrolling the island into view fetches the deferred island chunk (1.4s)
  2 passed (2.7s)
```

Note the difference between the two lists: seven declared, six requested. The one Chromium skipped is `0cz1d0mv5g_q7.js`, the `noModule` polyfill chunk — measured proof that excluding it from the first-load budget describes what browsers actually do rather than what is convenient.

### Exact version pins used by this ticket

| Thing | Pin | How verified |
|---|---|---|
| `size-limit` | `13.0.3` | `npm view size-limit version`; installed by KW-001 |
| `@size-limit/file` | `13.0.3` | `npm view @size-limit/file version`; peer `size-limit@13.0.3` |
| `@playwright/test` | `1.62.1` | installed by KW-001; the spec adds no new API surface |
| Node | `24` (`.nvmrc`) | `size-limit@13.0.3` engines `^22.18.0 \|\| ^24.0.0 \|\| >=26.0.0`; measured on v24.18.0 |
| `next` / `react` / `react-dom` | `16.2.12` / `19.2.8` / `19.2.8` | DEC-002; every byte count above is against these |
| `treosh/lighthouse-ci-action` | `12.6.2`, released 2026-03-12 | `gh api repos/treosh/lighthouse-ci-action/releases/latest` — recorded for the deferred ticket only; **not used here** |
| `andresz1/size-limit-action` | `v1.8.0`, released 2024-04-06 | `gh api repos/andresz1/size-limit-action/releases/latest` — **must not be used** |

### While a dependency is unmerged

- **KW-023 unmerged.** There is no `playwright.config.ts`, so `e2e/lazy-island.spec.ts` cannot run. `.size-limit.json` and `scripts/ci/check-first-load.mjs` are fully independent of it and can be written and proved first. Do not create a Playwright config to unblock yourself; that file belongs to KW-023 for the whole life of the repository.
- **KW-025 unmerged.** There is no instrument region and therefore no island: `check-first-load.mjs` will report `deferredJs` as zero files and zero bytes, which passes, and the second e2e spec will fail its "no new chunk arrived" assertion. That is the correct signal. Write the specs, run the first one, and hold the second behind the dependency rather than weakening it. **Do not** implement the lazy boundary yourself — `app/regions/Instrument.tsx` is KW-025's exclusive surface.
- **KW-028 unmerged.** `public/data/v1/**` is empty and the 12 kB check fails with `Size Limit can’t find files`. Do not glob around it, do not make the check conditional, and do not drop it: the check exists to make DEC-007 falsifiable. Wait for the bundle.

## Acceptance and verification

### Agent gate

- `npm run build && npm run size` exits 0, and its output names exactly three checks whose limits are `12 kB`, `24 kB` and `295 kB`.
- `npx size-limit --json` emits three objects, each with `passed: true`, and `sizeLimit` values of exactly `12000`, `24000` and `295000` — confirming `kB` parsed as decimal, not binary.
- `node scripts/ci/check-first-load.mjs` exits 0 and reports three groups; the sum of the three `bytes` values equals the `size` of the `total client JavaScript` check reported by `npx size-limit --json` for the same build.
- `node scripts/ci/check-first-load.mjs --json` emits a single JSON document matching the `FirstLoadReport` shape, with `groups.firstLoadJs.files`, `groups.deferredJs.files` and `groups.polyfillJs.files` pairwise disjoint and covering every `*.js` file under `.next/static/chunks/`.
- `groups.deferredJs.files` is non-empty and none of its entries appears in the document served for `/` — the island is genuinely deferred and the classifier proves it.
- `grep -c running .size-limit.json` returns 0, and `node -p "require('./package.json').devDependencies['@size-limit/time']"` prints `undefined`.
- No budget in either file matches on a chunk basename: `grep -nE "gource|chunks/[a-z0-9_]+\.js" .size-limit.json scripts/ci/check-first-load.mjs` returns no match outside comments.
- `npx playwright test --project=desktop-1x e2e/lazy-island.spec.ts` and `--project=mobile-1x` are both green with zero skipped tests and zero retries, and the run log shows the deferred chunk arriving only after the scroll.
- Deliberate-regression proof, all three recorded in the pull-request body: temporarily lowering the `total client JavaScript` limit to `100 kB` makes `npx size-limit` exit 1 with `Package size limit has exceeded by …`; temporarily lowering `BUDGETS.firstLoadJs` to `100_000` makes the checker exit 1 with a `FAIL firstLoadJs` line; and temporarily replacing the island's lazy import with a static `import` makes the second e2e spec fail on `arrived.length`. All three edits are reverted before the pull request is opened.
- `npm run typecheck` and `npm run lint` exit 0 with no new diagnostics; `e2e/lazy-island.spec.ts` typechecks under the repository `tsconfig.json` and `scripts/ci/check-first-load.mjs` passes ESLint as an ES module.
- `git status --porcelain` shows exactly three added paths, and `git diff --name-only origin/main...HEAD` lists only `.size-limit.json`, `scripts/ci/check-first-load.mjs` and `e2e/lazy-island.spec.ts`.

### At-merge gate

- `ci-ok` is green on the exact pull-request head, and the `build` job log shows the `bundle budgets` step running `size-limit` for real rather than printing `no .size-limit.json yet - skipping`, and the `first-load budget` step running the checker rather than printing `no first-load checker yet - skipping`.
- The `build` job log contains the three-group first-load table with concrete byte counts, so the numbers are recoverable from CI without re-running anything.
- `e2e-ok` is green, and the `e2e` job log shows both `lazy-island` specs passing under `desktop-1x` and `mobile-1x`.
- `gh api repos/its-everdred/kevinweaver-dev/rulesets` still lists exactly one required status check, `ci-ok`. Adding a context in this pull request is a review-blocking change.
- No file under `.github/`, no `package.json`, no `package-lock.json`, no `playwright.config.ts` and no file under `app/`, `components/`, `lib/` or `scripts/pipeline/` appears in the diff.
- The pull-request body records: which `source` the checker used (`prerendered-html` or `http`), the three group byte counts, the three size-limit byte counts, the arithmetic check that they sum, and the three deliberate-regression proofs.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. One operator note rather than evidence: if a later pull request legitimately needs a budget raised, the change belongs in a pull request that touches **only** the budget file, with the measurement that justifies it in the body, so a code-owner review under DEC-012 sees it in isolation.

## Failure, security, migration, and accessibility cases

**Failure — a too-tight budget stops the fleet, and it is the realistic blast radius.** Both scripts run inside the `build` job, which is a `needs` of `ci-ok`, which is the only required check on `main`. A budget below the achievable floor makes every pull request red for a reason no individual ticket can fix, and the observed agent response to an unfixable gate is to disable it. That is why every number in the table above is either a measurement plus stated headroom or an inherited number that survived re-measurement, and why the failure message tells the reader explicitly not to raise the limit. Recovery is a one-line edit to a file with no dependents.

**Failure — a check that resolves to zero files.** `size-limit` errors with `Size Limit can’t find files at …` and exits 1. This bites in three ways: the data bundle is not committed yet (wait for KW-028), the CSS pipeline emitted nothing (a KW-003 defect), or a path in `.size-limit.json` is stale after a Next upgrade. All three should fail loudly, which they do. Never soften a glob to make this go away.

**Failure — the first-load source disappears.** If some upstream region makes `/` render dynamically, `.next/server/app/index.html` is absent. The script falls back to `GET /` against `BASE_URL` or `127.0.0.1:3000`. In the `build` job no server is running, so that fallback throws with an actionable message rather than measuring nothing. If this happens, the correct fix is a small `ci.yml` change owned by KW-001 to start the server before the step — raise it, do not paper over it by treating a missing document as an empty first-load set, which would report `0 B` and pass forever.

**Failure — the lazy-island spec degrading into a no-op.** The two ways it can happen are the precondition not holding (the region is in view at load, so the chunk legitimately arrives during page load) and the island being statically imported (so no chunk ever arrives after the scroll). Both are asserted explicitly with messages that name the cause. This is the same class of defect as contradiction **C-23**'s two measured no-ops, and the lesson from that finding is applied here: an enforcement mechanism must be shown to fail on the thing it claims to catch, which is what the deliberate-regression proofs in the agent gate are for.

**Failure — brotli level drift.** `@size-limit/file` hardcodes `BROTLI_PARAM_QUALITY: 11` and the checker sets the same constant. If a future size-limit release changes its default, the two tools stop agreeing and the sum check in the agent gate fails. That is intended: the sum check is the canary for exactly this.

**Security.** Negative and structural. Both scripts read files inside the working tree and write only to stdout; neither takes a network input in the `build` job path, neither reads an environment secret, and neither writes to the repository. `BASE_URL` is the only environment variable read, it is unset in the gate by KW-023's design, and the fallback fetch it enables reaches only the origin the operator names. The e2e spec asserts a *negative* — that nothing outside the declared set is fetched — which is a strictly stronger hermeticity statement than the smoke spec's cross-origin check and complements it. No new dependency is introduced, so the supply-chain surface is unchanged: this ticket's entire tooling footprint is `size-limit`, `@size-limit/file` and Node built-ins.

**Migration.** None. All three files are additive; `.github/workflows/ci.yml`'s existing guards mean the pre-ticket behaviour is restored exactly by deleting them. No open pull request is invalidated by this merge, because the workflow gains no new job and no new status context — the two steps already existed and were no-ops. Rollback is `git revert` with no ordering constraint, unlike promoting a check to required.

**Accessibility.** Not applicable as a product surface: this ticket ships no markup, no styling and no user-facing behaviour. Two accessibility-adjacent obligations are nonetheless honoured. First, the e2e spec locates the instrument region through its accessible structure — `getByRole('region')` filtered by KW-005's `region-instrument-title` — rather than through a `data-testid`, so it cannot pass on a page whose landmark and labelling structure has broken; if KW-029's landmark work regresses, this spec goes red too. Second, the budgets themselves are an accessibility control in the WCAG 2.2 sense that matters most for this site: the deferred-JavaScript ceiling is what keeps the canvas island off the critical path, and a first load that stays under budget is what keeps the resume readable on a slow connection before any script runs. The axe run, the contrast unit test, the reduced-motion proof and the hidden-table text alternative are all KW-029's and are not duplicated here.

## Surfaces

- Reads: `package.json`, `package-lock.json`, `.nvmrc`, `.github/workflows/ci.yml`, `playwright.config.ts`, `app/regions/_contract.ts`, `.next/build-manifest.json`, `.next/server/app/index.html`, `.next/static/**`, `public/data/v1/**`, `docs/research/2026-07-31-ci-testing.md`, `docs/research/2026-07-31-viz-runtime.md`, `docs/research/2026-07-31-data-pipeline.md`, `docs/research/2026-07-31-decomposition-synthesis.md`
- Writes: `.size-limit.json`, `scripts/ci/check-first-load.mjs`, `e2e/lazy-island.spec.ts`
- Contracts: `perf-budget:first-load-js`, `perf-budget:deferred-js`, `perf-budget:polyfill-js`, `perf-budget:client-css`, `perf-budget:first-byte-data`, `scripts/ci/check-first-load.mjs#FirstLoadReport`
- Safety: `ci-gate:performance-budgets`, `ci-gate-hermeticity:no-network-in-budget-path`

## Sibling boundaries and open gates

**Open gates.** None block pickup of this ticket. It writes no file under `.github/`, so GATE-002 (the missing `workflow` push scope) does not apply. GATE-003 (the SSO-authorized `CONTRIB_TOKEN`) must already be closed upstream for KW-028 to have committed a bundle; if `public/data/v1/**` is empty at pickup, the gate is still open and the correct action is to escalate rather than to soften the 12 kB check.

**KW-001 owns** `package.json`, `package-lock.json`, `.nvmrc`, `tsconfig.json` and `.github/workflows/ci.yml`, including the two guarded budget slots in the `build` job. `size-limit@13.0.3`, `@size-limit/file@13.0.3` and the `size` script are its deliverables under DEC-003. This ticket activates the slots by adding files and never edits the workflow. Any version change is a KW-001 change request.

**KW-002 owns** `.github/rulesets/main.json`, `.github/CODEOWNERS` and the live `main` ruleset, which requires exactly one status check, `ci-ok`. Expect `.size-limit.json` and `scripts/ci/check-first-load.mjs` to be CODEOWNERS-covered gate files under DEC-012. Do not promote any context and do not edit CODEOWNERS.

**KW-023 owns** `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/screenshot.css` and `.github/workflows/e2e.yml`. This ticket adds one spec file that the existing `desktop-1x` and `mobile-1x` projects already match, consumes `retries: 0` and `baseURL` as given, and changes nothing about the container pin or the `e2e-ok` aggregator.

**KW-025 owns** `app/regions/Instrument.tsx` and `components/viz/{Overview,Ribbon,Gource}.tsx`, and therefore owns the lazy boundary — `next/dynamic({ ssr: false })` plus the `IntersectionObserver` — that this ticket asserts. If the second e2e spec fails because no chunk arrives on intersection, that is a defect report against KW-025, not a licence to edit the region.

**KW-028 owns** `.github/workflows/data-bundle.yml` and `scripts/pipeline/budget.ts`, including the workflow-side first-byte budget step that runs at generation time. This ticket measures the same five files at pull-request time from `.size-limit.json`. Two independent enforcements of DEC-007, in two workflows, from two files owned by two tickets — do not consolidate them and do not edit `budget.ts`.

**KW-029 owns** `e2e/a11y.spec.ts`, `components/viz/ContributionTable.tsx` and `lib/viz/tokens/contrast.test.ts`, and runs in the same wave. It owns every accessibility assertion, including the Lighthouse-shaped a11y outcome the research attached to this ticket. No overlap: it consumes the `reduced-motion` project, this ticket consumes `desktop-1x` and `mobile-1x`.

**KW-031 owns** `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, `.github/workflows/snapshots.yml` and the only sanctioned follow-up edit to `playwright.config.ts`. It runs in the same wave. No screenshot, no `snapshotPathTemplate`, no `--update-snapshots` guard belongs in this ticket's files.

**KW-032** is the capstone and depends on this ticket. It verifies the deployed production bundle; this ticket verifies the built one. Its `generatedAt`-within-24-hours check is a different assertion on the same payload and is not duplicated here.

**Deferred, owned by nobody.** `lighthouserc.json` plus a post-merge Lighthouse CI canary against the Vercel preview URL, with `categories:accessibility` and `categories:seo` at `error` / `minScore 1.0` / `pessimistic`, `cumulative-layout-shift` at `error` / `0.05` / `pessimistic`, and the performance category and total-blocking-time at `warn`. It requires either `@lhci/cli@0.15.1` in `package.json` (blocked by DEC-003) or a new workflow using `treosh/lighthouse-ci-action@12.6.2` (no ticket owns a fifth workflow), and under C-22 it can never be a required check. Record it in the deferred-findings ledger for the Executor. If it is ever wanted, it is a new ticket with its own write surface — it is deliberately not created here, because a file on an unowned surface has no reviewer and no successor.
