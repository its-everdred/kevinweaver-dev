# KW-023 — Playwright scaffolding and containerized e2e workflow

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 3 — Four new files on an exclusively owned surface with no application code, but the ticket has to be right in three places at once: a GitHub Actions container job whose image tag cannot legally be an `env` expression, a three-way version assert whose obvious implementation is a measured no-op, and a Playwright config that four downstream gate tickets extend without editing one another.

**Risk:** Medium-high for the fleet, low for the product. This ticket ships no user-facing code and cannot break the deployed site, but it is the file every later gate ticket builds on, and it is the second file in the repository under `.github/workflows/**`, so it fails at *push* time — after all the work is done — until GATE-002 is closed. Two specific ways to deadlock the fleet: an `e2e-ok` aggregator that does not run when its upstream job is skipped, and promoting `e2e-ok` to a required status check before it is trustworthy. Neither is reversible from inside a pull request.

**Phase hint:** 3

**Depends on:** KW-001, KW-011

**Serializes with:** none

**Requirements:** REQ-010

**Decisions:** DEC-002, DEC-003, DEC-005, DEC-012

**Gates:** GATE-002

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

A two-shard `e2e` job runs inside the pinned `mcr.microsoft.com/playwright:v1.62.1-noble` container against a Next server this repository built itself, a single always-running `e2e-ok` job publishes one status context on every pull request, and a three-way assert fails the run whenever the container image, the installed `@playwright/test` package and the browser builds inside the image disagree. No screenshot is compared, no baseline is written, and nothing in the gate path touches a Vercel deployment.

## Context and evidence

The repository has no browser test of any kind. At `e664d73a195facd64db58ba10952170ff01b4772` there is no `.github/` directory, no `e2e/` directory, no `playwright.config.ts` and no `@playwright/test` dependency; `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772` returns the 2021 Pages-Router site. Every input this ticket consumes is created upstream by KW-001 (toolchain, `.nvmrc`, `.github/workflows/ci.yml`, the pre-installed `@playwright/test@1.62.1`, the `test:e2e` script) and KW-011 (`vitest.config.mts`, the unit slot in CI). Nothing here is a refactor.

Four contradiction resolutions and one human gate bind this ticket. All four were re-measured during authoring.

**C-23 — both container-enforcement mechanisms in the research are no-ops as written, and the corrected form in the synthesis is not legal GitHub Actions.** The ci-testing track proposed asserting `package.json`'s `@playwright/test` version against `npx playwright --version`. Its verifier refuted that: `npx` resolves `./node_modules/.bin/playwright`, so the step compares `package.json` against the lockfile — two things `npm ci` already guarantees agree — and never reads the image at all. The verifier's fix was to "hoist the image tag to a job-level `env` and compare `${{ env.PW_IMAGE_TAG }}`", and the synthesis adopted that wording. **That fix does not work**, measured verbatim from GitHub's own context-availability table:

```
curl -sL https://raw.githubusercontent.com/github/docs/main/content/actions/reference/workflows-and-actions/contexts.md
| `jobs.<job_id>.container`       | `github, needs, strategy, matrix, vars, inputs` | None |
| `jobs.<job_id>.container.image` | `github, needs, strategy, matrix, vars, inputs` | None |
```

`env` is not in the availability list for `container.image`. A job-level `env` cannot name the image. The legal equivalent — same single-literal intent, same falsifiability — is to carry the literal in a **workflow-level `env`**, echo it out of a cheap `pin` job, and consume it as `${{ needs.pin.outputs.image }}`, which *is* available. That is the shape below, and it is the only material deviation from the synthesis's pointer text; the deviation is forced by the platform, not chosen.

The third leg of the assert also needed re-grounding. The verifier suggested reading the image's own bundled Playwright at `/ms-playwright-agent/node_modules/@playwright/test/package.json` and flagged the path as unconfirmed. Confirmed here: **the path does not exist.** Measured against the real image:

```
docker run --rm --entrypoint sh mcr.microsoft.com/playwright:v1.62.1-noble -c '...'
  HOME=/root
  PLAYWRIGHT_BROWSERS_PATH=/ms-playwright      (image Config.Env)
  /ms-playwright -> chromium-1234  chromium_headless_shell-1234  ffmpeg-1011  firefox-1538  webkit-2336
  Ubuntu 24.04.4 LTS,  node v24.18.1
  find / -name package.json -path '*@playwright/test*'   ->  (no output)
  npx --no-install playwright --version  ->  npm error: missing packages ["playwright@1.62.1"]
```

The image ships **browser builds only**, no `@playwright/test` package. So the honest third leg is to assert that the browser builds the *installed npm package* expects are the ones the *image actually contains*. Measured against `@playwright/test@1.62.1` in a scratch directory:

```
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright npx playwright install --dry-run
  Chrome for Testing 151.0.7922.34 (playwright chromium v1234)   -> /ms-playwright/chromium-1234
  Chrome Headless Shell 151.0.7922.34                            -> /ms-playwright/chromium_headless_shell-1234
  Firefox 153.0 (playwright firefox v1538)                       -> /ms-playwright/firefox-1538
  WebKit 26.5 (playwright webkit v2336)                          -> /ms-playwright/webkit-2336
  FFmpeg (playwright ffmpeg v1011)                               -> /ms-playwright/ffmpeg-1011
```

Every one of those five directories exists in the image. Bump `@playwright/test` without bumping the image and the expected revision changes, the directory is absent, and the step fails — which is the exact drift C-23 exists to catch, and the exact drift the original assertion passed.

**C-22 — preview-based e2e is never a pull-request gate, on three grounds, adopted verbatim.** The ci-testing track's stated reason ("a PR that adds a new spec would not see it run") is *false* and its verifier said so: `repository_dispatch` reads only the *workflow file* from the default branch, while the job body checks out `client_payload.git.sha`, so new specs do run. The three grounds that survive are (1) `vercel.deployment.ignored` / `.skipped` / `.error` emit no dispatch, so a required preview context sits at *"Expected — Waiting for status to be reported"* forever with no workflow-side fix; (2) a pull request that edits the preview workflow runs `main`'s copy, so the gate cannot verify a change to itself; (3) visual baselines must never come from a CDN-served preview. Consequence for this ticket: the gate builds and serves the site *locally*, `webServer` is the only server it talks to, and `.github/workflows/e2e.yml` subscribes to neither `repository_dispatch` nor any Vercel event. That is asserted mechanically, not stated in a comment.

**C-21 / DEC-012 — no `merge_group:` trigger.** Merge queue is available only on organization-owned repositories; `its-everdred/kevinweaver-dev` is User-owned with `plan: null` (GT-11, re-confirmed by the verifier against `github/docs` `merge-queue.md` and `gh api graphql … isInOrganization -> false`). The ci-testing track's own `e2e.yml` sketch declares `on: merge_group:`; its verifier flagged that as dead config that will mislead an agent into thinking a queue exists. It is deleted here.

**GATE-002 (HG-2) is open and blocks push, not work.** GT-10 measured the push credential's scopes as `admin:public_key, gist, read:org, repo` — no `workflow` scope. GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`. The failure is at push time, after every file is written and every local check is green. Do not start this ticket until the Executor confirms GATE-002 is closed (`gh auth refresh -s workflow`, or SSH keys for the fleet). This is the same gate that blocks KW-001, KW-028 and KW-031.

**Decisions that bind.** DEC-002: the site is a real Next server build with no `output: 'export'`, which is why `webServer` can run `npm run start` at all — a static export would have no server to start and the gate would have to serve `out/` itself. DEC-003: `package.json` and `package-lock.json` are frozen after KW-001, which pre-installs `@playwright/test@1.62.1` and pre-declares the `test:e2e` script; this ticket installs nothing and edits neither file. DEC-005: zero `serializes_with` pairs, every same-wave ticket owns a disjoint write surface — the four files below are owned by nobody else in wave 3. DEC-012: auto-merge on, no merge queue, exactly the required-status posture KW-002 configures.

**Plan-context navigation** (repository-relative paths; all research paths resolve at `e664d73a195facd64db58ba10952170ff01b4772`, e.g. `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research`):

- Pack index and the KW-01..KW-32 → KW-001..KW-032 identity mapping: `docs/build-orders/site-rewrite/README.md`.
- Ticket manifest, surfaces and graph edges: `docs/build-orders/site-rewrite/build-order.json`.
- Wave diagram, verified topological levels, critical path, write-surface partition proof: `docs/research/2026-07-31-decomposition-synthesis.md` §6.
- Decision registry (D-01..D-17 → DEC-001..DEC-017) and human gates (HG-1..HG-7 → GATE-001..GATE-007): `docs/research/2026-07-31-decomposition-synthesis.md` §3 and §4, mirrored into `build-order.json` `decisions[]` and `external_gates[]`.
- This ticket's implementation pointers: `docs/research/2026-07-31-decomposition-synthesis.md` §5, "KW-23 — Playwright scaffolding + containerized e2e workflow", plus `docs/research/2026-07-31-ci-testing.md` §3.3, §5.4, §5.6, §9 and its "Verification corrections" C1/C4/C5.
- Executor authority and the live gate register: `docs/build-orders/site-rewrite/authority-envelope.md`.

REQ-010, the requirement this ticket discharges, reads: *every pull request is gated by a hermetic browser-level proof — the site is built by this repository and exercised in a version-pinned browser container, with zero dependency on any hosted preview deployment — and that gate is version-locked end to end so a dependency bump cannot silently re-render what CI is looking at.*

## Scope

- Create `playwright.config.ts` at the repository root: `testDir: './e2e'`, five named projects, a conditional `webServer` that builds nothing and serves `npm run start` on `127.0.0.1:3000`, deterministic `use` defaults (UTC, `en-US`, `colorScheme: 'dark'`, fixed `deviceScaleFactor` per project), `retries: 0`, and the Vercel deployment-protection headers wired behind an environment guard so they are inert in CI.
- Create `e2e/screenshot.css`: the `stylePath` stylesheet that neutralises time- and environment-dependent rendering, targeting the six unguarded infinite animations verified in the vendored design system plus the tmux clock segment.
- Create `e2e/smoke.spec.ts`: five specs that assert only what KW-001 guarantees — the page serves, the document declares a language, fonts settle, no subresource 404s, no external network egress — plus the `page.clock` capability canary that proves the rAF kill switch works in this environment before any viz code depends on it.
- Create `.github/workflows/e2e.yml`: a `pin` job that derives and asserts the container reference, a two-shard `e2e` matrix job running inside that container, and an always-running `e2e-ok` aggregator that publishes the single status context.
- Implement the three-way version assert across the `pin` job (workflow `env` literal versus `package.json`) and the container job (image tag versus `npx playwright --version`, and the installed package's expected browser revisions versus the directories present under `PLAYWRIGHT_BROWSERS_PATH`).
- Implement the trigger hermeticity assert: parse the workflow's own top-level `on:` block and fail the run if it ever subscribes to `merge_group` or `repository_dispatch`.
- Upload the Playwright blob report and `test-results/` as artifacts on every outcome except cancellation.

## Non-goals

- No screenshot comparison. No `toHaveScreenshot` call, no `e2e/__screenshots__/**`, no `snapshotPathTemplate`, no `--update-snapshots` container guard. KW-031 owns all of it and owns the follow-up edit to `playwright.config.ts` that adds it.
- No accessibility spec, no `@axe-core/playwright`, no `e2e/a11y.spec.ts`. KW-029 owns those.
- No bundle-size assertion, no `.size-limit.json`, no `e2e/lazy-island.spec.ts`, no Lighthouse CI. KW-030 owns those.
- No `.github/workflows/preview.yml`. No ticket in this plan owns that path and this ticket must not create it; the preview canary is recorded in the deferred ledger, not shipped here.
- No edit to `package.json` or `package-lock.json` — frozen by DEC-003. `@playwright/test@1.62.1` and the `test:e2e` script are KW-001's deliverables; if either is missing at pickup, report it as a KW-001 defect and stop, do not add it.
- No edit to `.github/workflows/ci.yml` (KW-001), `vitest.config.mts` (KW-011), or `.github/rulesets/main.json` (KW-002). In particular: **do not add `e2e-ok` to the ruleset's required contexts.** Promoting a check to required is a governance change coordinated by the Executor through KW-002's file.
- No application code, no test hooks in the app, no harness route. `window.__viz` behind `?viz-test=1` is KW-024's; the `/__harness/*` route sketched in the ci-testing track is not part of this plan at all.
- No `merge_group:` trigger anywhere, ever (C-21).
- No repository secret is minted, read or required. The gate must run green on a fork-less pull request with zero secrets configured.

## Existing owner and reuse target

Nothing here exists at `e664d73a195facd64db58ba10952170ff01b4772`; all four files are created new by this ticket. `git ls-tree -r --name-only e664d73a195facd64db58ba10952170ff01b4772 -- .github e2e playwright.config.ts` returns nothing.

Verified inputs, each either measured to exist externally or created by a named upstream ticket:

| Target | Status |
|---|---|
| `mcr.microsoft.com/playwright:v1.62.1-noble` | **Exists.** `curl -s https://mcr.microsoft.com/v2/playwright/tags/list` returns 12 `v1.62.1*` tags including `v1.62.1-noble`. Pulled and inspected during authoring: Ubuntu 24.04.4 LTS, node v24.18.1, `HOME=/root`, `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright`. |
| `@playwright/test@1.62.1` | **Exists.** `npm view @playwright/test version -> 1.62.1` (current `latest`). Installed by KW-001 under DEC-003. `npx playwright --version` prints exactly `Version 1.62.1`. |
| `actions/checkout@v7.0.1` | **Exists.** `gh api repos/actions/checkout/releases/latest -> v7.0.1, 2026-07-20`. |
| `actions/setup-node@v7.0.0` | **Exists.** `gh api repos/actions/setup-node/releases/latest -> v7.0.0, 2026-07-14`. Note v7 adds `package-manager-cache`, default `true`. |
| `actions/upload-artifact@v7.0.1` | **Exists.** `gh api repos/actions/upload-artifact/releases/latest -> v7.0.1, 2026-04-10`. |
| `.nvmrc` | **Created by KW-001** (`24`). Consumed by `setup-node`'s `node-version-file`. |
| `package.json` scripts `build`, `start`, `test:e2e` | **Created by KW-001.** `start` is `next start`; `test:e2e` is `playwright test`. Read them, do not write them. |
| `.github/workflows/ci.yml` and the `ci-ok` context | **Created by KW-001.** This ticket adds a *sibling* workflow and a *second, non-required* context; it never edits `ci.yml`. |
| `vitest.config.mts` | **Created by KW-011.** Read-only here: the Playwright `testDir` must not overlap Vitest's `include`, so `e2e/**` must not be swept into the unit run. |
| `.rainbow`, `.hl`, `.uhl`, `.cursor`, `.glow`, `.metric.rainbowfill .meter .fill` | **Exist** in `docs/design/_ds/swe-rts-terminal-design-system-583945d5-2203-4320-8a4e-b30afe61181d/layers/{type,base,data}.css`, with keyframes `rainbow-pan`, `uhl-pan`, `blink`, `glow-drift`. KW-003 vendors them into `styles/ds/**`. |
| `.seg.clock` | **Exists** in the comp: `docs/design/kevinweaver.dev.dc.html:180`, `<span class="seg clock plr">09:41</span>`. KW-018 ships the live version. |
| `x-vercel-protection-bypass` + `x-vercel-set-bypass-cookie` | **Documented and measured** in `docs/research/2026-07-31-ci-testing.md` §9 from Vercel's protection-bypass-automation docs. Wired but inert: no secret is required for this gate. |

## Contract and invariants

This ticket produces one consumed contract with four seams. KW-029, KW-030, KW-031 and KW-032 all build on it, so the shapes below are quoted verbatim by those tickets.

### Seam 1 — the `e2e-ok` status context

Exactly one context is published, named `e2e-ok`, by an aggregator job that runs under `if: always()` and treats `skipped` as success. This mirrors KW-001's `ci-ok` and exists for the same reason: a required context that can be skipped deadlocks the pull request at *"Expected — Waiting for status to be reported"*. The context is **published but not required** — KW-002 owns the ruleset and today requires only `ci-ok`.

```jsonc
// Shape of the check as GitHub reports it on a PR head.
{
  "name": "e2e-ok",
  "conclusion": "success",            // never "skipped": the job always runs
  "app": { "slug": "github-actions" },
  "workflow": "e2e"
}
```

Invariant: `e2e-ok` is green **iff** every upstream job in the same workflow resolved to `success` or `skipped`. `failure`, `cancelled` and `timed_out` all fail it.

### Seam 2 — the Playwright project names

Downstream tickets select projects by name and must not rename or reorder them. Five projects ship now; three of them have no matching spec until their owning ticket lands, which is legal — a project with zero matched tests contributes zero tests to the run.

```ts
// Exported project inventory. Quoted verbatim by KW-029/KW-030/KW-031.
type KwProjectName =
  | 'smoke'           // this ticket.  testMatch /smoke\.spec\.ts/,        dpr 1, 1280x800
  | 'desktop-1x'      // general specs. dpr 1, 1280x800
  | 'desktop-2x'      // KW-031.        testMatch /canvas\.spec\.ts/,      dpr 2, 1280x800
  | 'mobile-1x'       // KW-029/KW-030. testIgnore /canvas\.spec\.ts/,     Pixel 7, dpr 1
  | 'reduced-motion'  // KW-029.        testMatch /a11y\.spec\.ts/,        reducedMotion 'reduce'
```

Invariants that downstream tickets depend on and must not weaken: `retries: 0` (a flaky visual or a11y test must fail, never be retried into green); `timezoneId: 'UTC'`; `locale: 'en-US'`; `colorScheme: 'dark'`; an explicit `deviceScaleFactor` on every project; `forbidOnly` on in CI.

### Seam 3 — the environment contract

```ts
// Read by playwright.config.ts. Set by .github/workflows/e2e.yml.
interface KwE2eEnv {
  /** Workflow-level literal, single source of truth for the container reference. */
  PW_IMAGE?: string                          // 'mcr.microsoft.com/playwright:v1.62.1-noble'
  /** When set, playwright targets a remote origin and starts no local server. */
  BASE_URL?: string                          // unset in this gate, by design (C-22)
  /** Forward-declared build-time flag for KW-024's harness. Read by nothing today. */
  NEXT_PUBLIC_TEST_HOOKS?: '1'
  /** Only set for a run against a protected Vercel deployment. Never set by this gate. */
  VERCEL_AUTOMATION_BYPASS_SECRET?: string
  CI?: string
}
```

`NEXT_PUBLIC_TEST_HOOKS` is deliberately set and deliberately unread. It is a forward-declared seam: `playwright.config.ts` and `e2e.yml` are this ticket's exclusive write surface, KW-024's is `lib/viz/{driver,testHarness}.ts`, so KW-024 cannot add the variable later without reaching across a boundary. Setting an inert variable now costs nothing; not setting it forces a cross-ticket edit. KW-024's *runtime* harness gate remains `?viz-test=1` per the synthesis — this variable is only the build-time flag if the driver needs one.

### Seam 4 — `e2e/screenshot.css`

Injected via `expect.toHaveScreenshot.stylePath`. Inert until KW-031 makes the first screenshot assertion. Its job is not CSS animations — Playwright's `animations: 'disabled'` default already cancels infinite animations to their initial state — but time-dependent *content*: the tmux clock, and anything KW-026 later renders from wall-clock time.

Invariant across all four seams: **no seam requires a repository secret.** The gate runs green on a pull request in a repository with zero secrets configured. Any future step that needs a secret must be `continue-on-error` or belong to a different workflow.

## Refreshable implementation notes

Verify all of the following against `origin/main` at pickup; the base will have moved past `e664d73a195facd64db58ba10952170ff01b4772`.

### Pre-flight (do this first, it takes 60 seconds and saves an hour)

```bash
node -p "require('./package.json').devDependencies['@playwright/test']"   # expect 1.62.1
node -p "Object.keys(require('./package.json').scripts).join(' ')"         # expect start, build, test:e2e present
cat .nvmrc                                                                 # expect 24
test -f .github/workflows/ci.yml && grep -c 'ci-ok' .github/workflows/ci.yml
gh auth status                                                             # GATE-002: 'workflow' must be in the scope list
```

If `workflow` is absent from the scope list, **stop and escalate GATE-002 before writing anything.** The push will be rejected after the work is complete.

### File 1 — `playwright.config.ts` (repository root, new)

```ts
import { defineConfig, devices } from '@playwright/test'

// -----------------------------------------------------------------------------
// KW-031 will insert, and only KW-031 may insert:
//   * the `-u` / `--update-snapshots` container guard
//       process.argv.some(a => a === '-u' || a === '--update-snapshots'
//                              || a.startsWith('--update-snapshots='))
//     combined with `process.env.KW_IN_CONTAINER !== '1'`
//   * `snapshotPathTemplate` with no {platform} segment
//   * `expect.toHaveScreenshot` threshold / maxDiffPixelRatio tuning
// They are absent here on purpose: this ticket writes no baseline, so there is
// nothing for a guard to protect and a guard with nothing to guard is exactly
// the kind of decorative enforcement C-23 was raised about.
// -----------------------------------------------------------------------------

const PORT = 3000
const LOCAL_ORIGIN = `http://127.0.0.1:${PORT}`

/** Set only when pointing the suite at an already-deployed origin. Unset in the gate. */
const remoteOrigin = process.env.BASE_URL

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // A flaky browser test must fail, not be retried into green.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['blob']]
    : [['list'], ['html', { open: 'never' }]],

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Owned by KW-031 apart from stylePath, whose file this ticket owns.
      stylePath: './e2e/screenshot.css',
    },
  },

  // No webServer when targeting a remote origin, or Playwright would start a
  // second server nobody talks to and then wait 120 s for it.
  webServer: remoteOrigin
    ? undefined
    : {
        command: `npm run start -- --port ${PORT} --hostname 127.0.0.1`,
        url: LOCAL_ORIGIN,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_TEST_HOOKS: '1',
          NEXT_TELEMETRY_DISABLED: '1',
        },
      },

  use: {
    baseURL: remoteOrigin ?? LOCAL_ORIGIN,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
    timezoneId: 'UTC',
    locale: 'en-US',
    colorScheme: 'dark',
    // Only populated for a run against a protected Vercel deployment. The cookie
    // variant is required because Playwright makes in-browser follow-up
    // navigations constantly and the header alone does not survive them.
    extraHTTPHeaders: bypass
      ? {
          'x-vercel-protection-bypass': bypass,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : {},
  },

  projects: [
    {
      name: 'smoke',
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      name: 'desktop-1x',
      testIgnore: [/smoke\.spec\.ts/, /canvas\.spec\.ts/],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      // Catches canvas backing-store bugs: canvas.width must be cssW * dpr. KW-031.
      name: 'desktop-2x',
      testMatch: /canvas\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
    },
    {
      name: 'mobile-1x',
      testIgnore: [/smoke\.spec\.ts/, /canvas\.spec\.ts/],
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
    },
    {
      // KW-029 runs axe here so the scan happens against a stopped animation.
      name: 'reduced-motion',
      testMatch: /a11y\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      },
    },
  ],
})
```

Do **not** copy the ci-testing track's `threshold: 0.15` / `maxDiffPixelRatio: 0.002` values into this file. Those are snapshot-comparison tuning with no effect until a baseline exists, and KW-031 owns the tradeoff.

### File 2 — `e2e/screenshot.css` (new)

```css
/* Injected via expect.toHaveScreenshot.stylePath. Inert until KW-031 takes the
   first baseline; shipped now because playwright.config.ts references it and a
   dangling stylePath is a silent no-op, not an error.

   Playwright's `animations: 'disabled'` default already cancels infinite CSS
   animations to their initial state, so the rules below are belt-and-braces for
   the six unguarded infinite animations verified in the vendored design system
   (layers/type.css .rainbow/.hl/.uhl/.cursor, layers/base.css .glow,
   layers/data.css .metric.rainbowfill .meter .fill). The rules that actually
   earn their place are the content masks at the bottom. */

*, *::before, *::after {
  animation: none !important;
  transition: none !important;
}

/* The terminal caret must render solid, not mid-blink. */
.cursor { opacity: 1 !important; }

/* Time-dependent CONTENT, which no animation setting can freeze.
   .seg.clock is the tmux status-bar clock (comp line 180); KW-018 ships it.
   KW-026's freshness pill is added by KW-031 once its markup is settled --
   do not invent a selector for it here. */
.tmux .seg.clock { visibility: hidden !important; }
```

### File 3 — `e2e/smoke.spec.ts` (new)

Every assertion below holds against KW-001's blank-but-styled App Router page. Nothing here depends on KW-003, KW-005 or any region ticket, because none of them are dependencies of this ticket and the gate must be green the day it merges.

```ts
import { test, expect, type Request } from '@playwright/test'

const EPOCH = new Date('2026-06-01T00:00:00.000Z')
const PAUSE_AT = new Date('2026-06-01T01:00:00.000Z')
// Same expression playwright.config.ts uses. Do not read testInfo.project.use --
// the merged baseURL is not reliably visible there.
const ORIGIN = new URL(process.env.BASE_URL ?? 'http://127.0.0.1:3000').origin

test.describe('smoke', () => {
  test('the home route serves a document with a declared language', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBe(200)
    const lang = await page.evaluate(() => document.documentElement.lang)
    expect(lang).not.toBe('')
  })

  test('no subresource fails to load', async ({ page }) => {
    const broken: string[] = []
    page.on('response', r => {
      if (r.status() >= 400) broken.push(`${r.status()} ${r.url()}`)
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    // Includes the browser's automatic /favicon.ico probe. public/favicon.ico is
    // present at the base commit and KW-001 does not delete it, so a 404 here is
    // a real defect, not a fixture artifact -- do not filter it out.
    expect(broken).toEqual([])
  })

  test('the page makes no cross-origin request', async ({ page }) => {
    const external: string[] = []
    page.on('request', (r: Request) => {
      if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:')) external.push(r.url())
    })
    await page.goto('/', { waitUntil: 'networkidle' })
    // Hermeticity: no CDN font, no analytics, no GitHub API from the browser.
    expect(external).toEqual([])
  })

  test('fonts settle', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    expect(await page.evaluate(() => document.fonts.status)).toBe('loaded')
  })

  // The rAF kill switch, proved before any viz code depends on it. page.clock
  // fakes Date, setTimeout, setInterval, requestAnimationFrame,
  // requestIdleCallback and performance, and needs no app-side hook. runFor
  // fires ALL time-related callbacks; fastForward fires each due timer at most
  // once and therefore drops rAF frames -- never use fastForward for an rAF loop.
  test('page.clock drives requestAnimationFrame deterministically', async ({ page }) => {
    const countFrames = async () => {
      await page.clock.install({ time: EPOCH })
      await page.goto('/')
      // Pause at a time LATER than the install time -- that is the documented
      // direction. pauseAt with a time already in the past is unspecified.
      await page.clock.pauseAt(PAUSE_AT)
      const t0 = await page.evaluate(() => Date.now())
      await page.evaluate(() => {
        ;(window as unknown as { __kwFrames: number }).__kwFrames = 0
        const tick = () => {
          ;(window as unknown as { __kwFrames: number }).__kwFrames++
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.clock.runFor(1000)
      const t1 = await page.evaluate(() => Date.now())
      const frames = await page.evaluate(
        () => (window as unknown as { __kwFrames: number }).__kwFrames,
      )
      return { advanced: t1 - t0, frames }
    }

    const first = await countFrames()
    expect(first.advanced).toBe(1000)
    expect(first.frames).toBeGreaterThan(0)

    // Same virtual second, same frame count. If this ever diverges, no visual or
    // a11y result in this suite means anything.
    const second = await countFrames()
    expect(second).toEqual(first)
  })
})
```

### File 4 — `.github/workflows/e2e.yml` (new)

```yaml
name: e2e

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:

# No `merge_group:`. Merge queue is unavailable on a User-owned repository
# (GT-11 / C-21 / DEC-012), so the trigger can never fire and would only
# mislead a future agent into thinking a queue exists.

concurrency:
  group: e2e-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

# THE single literal. `container.image` cannot read the `env` context
# (github/docs contexts.md: jobs.<job_id>.container.image ->
#  github, needs, strategy, matrix, vars, inputs), so it is republished as a
# job output below, which `needs` CAN reach.
env:
  PW_IMAGE: mcr.microsoft.com/playwright:v1.62.1-noble

jobs:
  pin:
    name: pin
    runs-on: ubuntu-latest
    timeout-minutes: 5
    outputs:
      image: ${{ steps.pin.outputs.image }}
      version: ${{ steps.pin.outputs.version }}
    steps:
      - uses: actions/checkout@v7.0.1

      - name: Assert the gate never depends on a preview deployment
        shell: bash
        run: |
          node - <<'EOF'
          const fs = require('fs')
          const lines = fs.readFileSync('.github/workflows/e2e.yml', 'utf8').split('\n')
          const start = lines.findIndex(l => /^on:\s*$/.test(l))
          if (start < 0) { console.error('::error::e2e.yml has no top-level `on:` block'); process.exit(1) }
          let end = lines.length
          for (let i = start + 1; i < lines.length; i++) { if (/^\S/.test(lines[i])) { end = i; break } }
          const triggers = lines.slice(start + 1, end)
            .filter(l => /^ {2}\S/.test(l))
            .map(l => l.trim().replace(/:.*$/, ''))
          const banned = triggers.filter(t => t === 'merge_group' || t === 'repository_dispatch')
          if (banned.length) {
            console.error(`::error::e2e.yml must not subscribe to ${banned.join(', ')} (C-21, C-22)`)
            process.exit(1)
          }
          console.log(`e2e triggers: ${triggers.join(', ')}`)
          EOF

      - name: Three-way version assert, leg 1 of 3 — image tag vs package.json
        id: pin
        shell: bash
        run: |
          set -euo pipefail
          want=$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/,'')")
          tag=${PW_IMAGE##*:}     # v1.62.1-noble
          tag=${tag#v}            # 1.62.1-noble
          tag=${tag%-noble}       # 1.62.1
          echo "package.json=$want  image=$PW_IMAGE  tag=$tag"
          if [ "$want" != "$tag" ]; then
            echo "::error::@playwright/test is $want but the pinned container is $PW_IMAGE"
            exit 1
          fi
          echo "image=$PW_IMAGE"  >> "$GITHUB_OUTPUT"
          echo "version=$want"    >> "$GITHUB_OUTPUT"

  e2e:
    name: e2e (shard ${{ matrix.shard }}/2)
    needs: [pin]
    runs-on: ubuntu-latest
    timeout-minutes: 20
    container:
      image: ${{ needs.pin.outputs.image }}
      # --ipc=host: Chromium crashes on the default 64 MB /dev/shm in containers.
      options: --user root --ipc=host
    env:
      # HOME is already /root in v1.62.1-noble (measured); set explicitly so a
      # future base-image change cannot silently relocate npm's cache.
      HOME: /root
      NEXT_TELEMETRY_DISABLED: '1'
      NEXT_PUBLIC_TEST_HOOKS: '1'
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v7.0.1

      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci --no-audit --no-fund

      - name: Three-way version assert, legs 2 and 3 — CLI and browser builds
        shell: bash
        run: |
          set -euo pipefail
          want='${{ needs.pin.outputs.version }}'
          have=$(npx playwright --version | sed 's/^Version //')
          echo "pinned=$want  cli=$have  browsers=${PLAYWRIGHT_BROWSERS_PATH:-<unset>}"
          if [ "$have" != "$want" ]; then
            echo "::error::playwright CLI is $have but the container is pinned to $want"
            exit 1
          fi
          # Leg 3: the image ships browser builds only -- there is no
          # @playwright/test inside it (measured). So bind the npm package to the
          # image by asserting the build directories this package expects are the
          # ones this image actually contains. A package bump without an image
          # bump changes the expected revision and fails here.
          missing=0
          while read -r dir; do
            if [ ! -d "$dir" ]; then
              echo "::error::container is missing browser build $dir"
              missing=1
            else
              echo "ok $dir"
            fi
          done < <(npx playwright install --dry-run | sed -n 's/^ *Install location: *//p')
          [ "$missing" = 0 ]

      # The container ships the browsers. `npx playwright install` is not needed
      # and running it would defeat the point of pinning the image.
      - run: npm run build

      - run: npx playwright test --shard=${{ matrix.shard }}/2

      - uses: actions/upload-artifact@v7.0.1
        if: ${{ !cancelled() }}
        with:
          name: playwright-blob-${{ matrix.shard }}
          path: |
            blob-report/
            test-results/
          retention-days: 14

  # The single status context. Always runs, so a skipped upstream job can never
  # deadlock a pull request at "Expected -- Waiting for status to be reported".
  e2e-ok:
    name: e2e-ok
    needs: [pin, e2e]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Assert no upstream failure
        shell: bash
        run: |
          echo "pin=${{ needs.pin.result }} e2e=${{ needs.e2e.result }}"
          for r in "${{ needs.pin.result }}" "${{ needs.e2e.result }}"; do
            case "$r" in
              success|skipped) ;;
              *) echo "::error::upstream job resolved to $r"; exit 1 ;;
            esac
          done
```

### Worked data shape — what the assert prints on a green run

```
package.json=1.62.1  image=mcr.microsoft.com/playwright:v1.62.1-noble  tag=1.62.1
e2e triggers: pull_request, push, workflow_dispatch
pinned=1.62.1  cli=1.62.1  browsers=/ms-playwright
ok /ms-playwright/chromium-1234
ok /ms-playwright/chromium_headless_shell-1234
ok /ms-playwright/firefox-1538
ok /ms-playwright/webkit-2336
ok /ms-playwright/ffmpeg-1011
```

Those five revisions are the measured contents of `mcr.microsoft.com/playwright:v1.62.1-noble` and the measured expectations of `@playwright/test@1.62.1` (Chrome for Testing 151.0.7922.34, Firefox 153.0, WebKit 26.5). If any line reads `container is missing browser build …`, the package and the image have drifted — bump both or neither.

### Exact version pins used by this ticket

| Thing | Pin | How verified |
|---|---|---|
| Container | `mcr.microsoft.com/playwright:v1.62.1-noble` | MCR tag list, pulled and inspected |
| `@playwright/test` | `1.62.1` (installed by KW-001) | `npm view @playwright/test version` |
| `actions/checkout` | `v7.0.1` | `gh api repos/actions/checkout/releases/latest` |
| `actions/setup-node` | `v7.0.0` | `gh api repos/actions/setup-node/releases/latest` |
| `actions/upload-artifact` | `v7.0.1` | `gh api repos/actions/upload-artifact/releases/latest` |
| Runner | `ubuntu-latest` (= Ubuntu 24.04 x64, matching `-noble`) | `actions/runner-images` README |

### While a dependency is unmerged

KW-001 is a hard dependency and there is no useful partial mode: without `package.json`, `.nvmrc` and the `test:e2e` script there is nothing to configure. KW-011 is a hard dependency for a narrower reason — `vitest.config.mts` must already exist so its `include` can be read and confirmed not to sweep `e2e/**` into the unit run. If `vitest.config.mts` does include `e2e/**`, that is a KW-011 defect: report it, do not edit the file. A quick check:

```bash
npx vitest list 2>/dev/null | grep -c '^e2e/' || true   # must be 0
```

## Acceptance and verification

### Agent gate

- `npx playwright test --project=smoke` is green locally after `npm run build`, with all five smoke specs passing and zero tests skipped.
- `npx playwright test --list` prints the five project names `smoke`, `desktop-1x`, `desktop-2x`, `mobile-1x`, `reduced-motion`, and lists tests only from `e2e/smoke.spec.ts`.
- The `page.clock` canary runs the same virtual second twice and asserts the two `{advanced, frames}` results are deep-equal, and asserts `advanced === 1000`.
- The cross-origin spec passes with an empty `external` array, proving the built page makes no request to `fonts.googleapis.com`, `fonts.gstatic.com` or any other remote host.
- `grep -RnE 'toHaveScreenshot|__screenshots__|snapshotPathTemplate|update-snapshots|axe|size-limit|merge_group|repository_dispatch' playwright.config.ts e2e .github/workflows/e2e.yml` returns no match outside the KW-031 handoff comment block in `playwright.config.ts` and the trigger-assert script in `e2e.yml`.
- Running the leg-1 assert by hand with a deliberately wrong tag fails: `PW_IMAGE=mcr.microsoft.com/playwright:v1.61.0-noble` makes the `pin` step exit non-zero with `@playwright/test is 1.62.1 but the pinned container is …`.
- Running leg 3 by hand inside the pinned image proves the browser-build binding: `docker run --rm -v "$PWD":/w -w /w mcr.microsoft.com/playwright:v1.62.1-noble sh -c 'npm ci --no-audit --no-fund && npx playwright install --dry-run | sed -n "s/^ *Install location: *//p" | while read -r d; do test -d "$d" || echo MISSING "$d"; done'` prints no `MISSING` line.
- `npm run typecheck` and `npm run lint` exit 0 with no new diagnostics; `playwright.config.ts` and `e2e/**/*.ts` typecheck under the repository `tsconfig.json`.
- `git status --porcelain` shows exactly four added paths and no modification to `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `vitest.config.mts` or `.github/rulesets/main.json`.

### At-merge gate

- The `ci-ok` aggregated status published by KW-001's `.github/workflows/ci.yml` is green on the exact pull-request head.
- The `e2e` workflow runs on the pull request, both shards resolve to `success`, and `e2e-ok` posts green as a new status context on the head commit.
- The `pin` job log shows the three-way assert output verbatim: the package/image/tag line, the `pinned=/cli=/browsers=` line, and five `ok /ms-playwright/…` lines.
- The `pin` job log shows `e2e triggers: pull_request, push, workflow_dispatch` — no `merge_group`, no `repository_dispatch`.
- `gh api repos/its-everdred/kevinweaver-dev/rulesets` still lists exactly one required status check, `ci-ok`. Adding `e2e-ok` in this pull request is a review-blocking change.
- `gh run view --log` for the `e2e` job shows no `playwright install` download step and no browser download, proving the container's own browsers were used.
- `git diff --name-only origin/main...HEAD` lists only `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/screenshot.css`, `.github/workflows/e2e.yml`.
- The workflow completed without any repository secret being present, proving the gate is secret-free.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. The one operator action this ticket needs is not evidence but a precondition: GATE-002 must be closed before the branch can be pushed at all.

## Failure, security, migration, and accessibility cases

**Failure — deadlocking every open pull request is the realistic blast radius.** Three specific ways and their guards. (1) An aggregator without `if: always()` never reports when its upstream is skipped; `e2e-ok` therefore always runs and treats `skipped` as success, exactly as KW-001's `ci-ok` does. (2) `paths-ignore` on this workflow would leave a docs-only pull request waiting forever for a context that never reports — it is not used, and it must never be added, which is why the shards are cheap rather than conditionally skipped. (3) Promoting `e2e-ok` to a required context before it has run green on real pull requests turns a container-pull hiccup into a fleet-wide stop; promotion is deliberately deferred to the Executor through KW-002's ruleset file.

**Failure — silent baseline drift is the failure this ticket exists to prevent.** Both mechanisms the research proposed were measured to be no-ops: the version assert compared `package.json` against the lockfile and never read the image, and the argv guard missed `-u` and `--update-snapshots=all`. The corrected version assert is implemented here in three legs; the corrected argv guard belongs to KW-031 and is a review-blocking omission there.

**Failure — container pull or start.** If the image tag is wrong, `container.image` fails before any step runs and `e2e` resolves to `failure`, which `e2e-ok` propagates. There is no retry and there must not be one: a silently retried container failure is how a pinned image stops being pinned. If Chromium crashes with a `/dev/shm` error, `--ipc=host` is missing from `options`.

**Security.** The security property here is negative and structural. `permissions: contents: read` is the whole token grant — no `packages: write`, no `statuses: write`, no `pull-requests: write`. The workflow reads no secret, writes no secret to the log, and pushes nothing. It runs on `pull_request`, never `pull_request_target`, so a fork pull request executes with a read-only token against its own code and cannot reach repository secrets. `--user root` is required by the image and is scoped to an ephemeral container. `VERCEL_AUTOMATION_BYPASS_SECRET` is referenced only in `playwright.config.ts` behind a presence check and is never set by this workflow; if a future workflow does set it, it is a bypass credential for deployment protection and must be a repository secret, never a literal. The uploaded artifacts are traces and blob reports from a locally built site with no data bundle — nothing in them is sensitive, and `retention-days: 14` bounds them anyway.

**Migration.** None. Nothing exists to migrate. The four files are additive and the workflow adds a *new* status context rather than changing an existing one, so no open pull request is invalidated by this merge. Rollback is `git revert` plus, if `e2e-ok` was ever promoted to required, removing it from the ruleset first — promote-then-revert is the one ordering that strands pull requests, which is the concrete reason promotion is not in this ticket.

**Accessibility.** Not applicable as a product surface — this ticket ships no markup, no styling and no user-facing behaviour. Two accessibility obligations are nonetheless discharged in advance so KW-029 can do its job without editing this ticket's files: the `reduced-motion` project exists with `reducedMotion: 'reduce'` so the axe scan runs against a stopped animation instead of racing the rAF loop, and the `mobile-1x` project exists so the 320-414 px reflow evidence has a place to live. The smoke spec's language-attribute assertion is a deliberate floor for WCAG 3.1.1; KW-029 hardens it into a full axe run.

## Surfaces

- Reads: `package.json`, `package-lock.json`, `.nvmrc`, `.github/workflows/ci.yml`, `vitest.config.mts`, `app/layout.tsx`, `app/page.tsx`, `docs/research/2026-07-31-ci-testing.md`, `docs/research/2026-07-31-vercel-platform.md`, `docs/research/2026-07-31-decomposition-synthesis.md`
- Writes: `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/screenshot.css`, `.github/workflows/e2e.yml`
- Contracts: `ci-status-context:e2e-ok`, `playwright.config.ts#projects`, `playwright.config.ts#webServer`, `e2e/screenshot.css`, `env:NEXT_PUBLIC_TEST_HOOKS`, `env:BASE_URL`, `env:PW_IMAGE`
- Safety: `container-pin:mcr.microsoft.com/playwright`, `ci-gate-hermeticity:no-preview-in-required-path`

## Sibling boundaries and open gates

**Open gate.** GATE-002 (HG-2) blocks pickup. The push credential's scopes are `admin:public_key, gist, read:org, repo` (GT-10) and GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`. Confirm with `gh auth status` before writing a line; the failure mode is a rejected push after the work is complete. GATE-002 also blocks KW-001, KW-028 and KW-031, so the Executor closes it once for all four.

**Wave-3 siblings.** KW-013 through KW-022 run alongside this ticket and none of them touch `playwright.config.ts`, `e2e/**` or `.github/workflows/**`. The write-surface partition in the synthesis §6 assigns `.github/workflows/e2e.yml` to this ticket alone. Do not add a test that imports from `lib/viz/**`, `lib/bundle/**` or `scripts/pipeline/**` — those modules are being written this wave and importing them makes this ticket's merge dependent on theirs.

**KW-001 owns** `package.json`, `package-lock.json`, `.nvmrc` and `.github/workflows/ci.yml`. `@playwright/test@1.62.1` and the `test:e2e` script are its deliverables under DEC-003. If a version needs to change, that is a KW-001 change request, not an edit here.

**KW-002 owns** `.github/rulesets/main.json` and the live `main` ruleset, which today requires exactly one status check, `ci-ok`. This ticket publishes `e2e-ok` and deliberately does not promote it. KW-030 and KW-031 are under the same restriction. Promotion is a governance change coordinated by the Executor.

**KW-011 owns** `vitest.config.mts` and `test/**`. The two suites must not collide: Vitest owns `test/**` and `*.test.ts` colocated with source, Playwright owns `e2e/**` and `*.spec.ts`. Do not add a `*.test.ts` file under `e2e/`, and do not add a `*.spec.ts` file under `test/`.

**KW-024 owns** the viz driver and `window.__viz` behind `?viz-test=1`. This ticket forward-declares `NEXT_PUBLIC_TEST_HOOKS` in the workflow and in `webServer.env` so KW-024 has a build-time flag available without reaching into this ticket's files, but writes no harness and asserts nothing about one.

**KW-029 owns** `e2e/a11y.spec.ts` and consumes the `reduced-motion` project by name. **KW-030 owns** `e2e/lazy-island.spec.ts`, `.size-limit.json` and `scripts/ci/check-first-load.mjs`. **KW-031 owns** `e2e/canvas.spec.ts`, `e2e/__screenshots__/**`, `.github/workflows/snapshots.yml`, and the follow-up edit to `playwright.config.ts` that adds `snapshotPathTemplate`, the `toHaveScreenshot` tuning and the `-u` container guard in the form C-23 specifies. All three consume the `e2e-ok` context and the project names as given; none of them may rename a project, weaken `retries: 0`, or add a `merge_group` trigger.

**Deferred, owned by nobody.** `.github/workflows/preview.yml` — the post-merge Vercel preview canary with `workflow_dispatch` — appears in the research and in the KW-23 pointer text but is not assigned to any ticket in the write-surface partition. It is deliberately not created here, because a file on an unowned surface has no reviewer and no successor. Record it in the deferred-findings ledger for the Executor; if it is ever wanted, it is a new ticket, and it still must never be a required check (C-22).
