# CI + Testing track — kevinweaver.dev

Date: 2026-07-31 · Repo: `its-everdred/kevinweaver-dev` · Author: research subagent
Scope: the automated gate that must exist before autonomous agents author most of the code.

Legend: **(M)** = measured this session, with the command shown. **(I)** = inference, reasoned from measured facts.

---

## 0. Ground state — measured

| Fact | Evidence |
|---|---|
| No `.github` directory at all → **no CI, no workflows, no CODEOWNERS, no issue/PR templates** (M) | `ls -la /home/everdred/github/everdred/kevinweaver-dev/.github` → `"...": No such file or directory (os error 2)` |
| No `vercel.json`, no `netlify.toml`, no `.nvmrc`, no `tsconfig.json`, no `*.yml` anywhere outside `.git`/`node_modules` (M) | `find /home/everdred/github/everdred/kevinweaver-dev -maxdepth 2 ... \( -name "*.yml" -o -name "vercel.json" -o -name ".nvmrc" -o -name "tsconfig.json" \)` → empty |
| **Rulesets: none.** The API returns an empty array, not a 404. (M) | `gh api repos/its-everdred/kevinweaver-dev/rulesets` → `[]` |
| **Branch protection on `main`: none.** HTTP 404 `"Branch not protected"`. (M) | `gh api repos/its-everdred/kevinweaver-dev/branches/main/protection` → `{"message":"Branch not protected", ... "status":"404"}` |
| `allow_auto_merge: false` — auto-merge is **off**, so `gh pr merge --auto` will fail today (M) | `gh api repos/its-everdred/kevinweaver-dev --jq '{allow_auto_merge,...}'` |
| Owner is a **User**, not an Organization (`owner.type: "User"`, `plan: null`) (M) | same command |
| `delete_branch_on_merge: false`, all three merge methods enabled (M) | same command |
| Actions enabled, `allowed_actions: "all"`, `sha_pinning_required: false` (M) | `gh api repos/its-everdred/kevinweaver-dev/actions/permissions` |
| **`default_workflow_permissions: "write"` and `can_approve_pull_request_reviews: true`** — the default `GITHUB_TOKEN` in every future workflow gets repo write and can approve PRs. This is a live security hole once agents write workflows. (M) | `gh api repos/its-everdred/kevinweaver-dev/actions/permissions/workflow` |
| App surface today is 7 files: `pages/index.js`, `pages/_app.js`, `pages/api/hello.js`, `components/{HomeHero,Timeline,WriteCode}.js`, `styles/globals.scss` (M) | `find pages components styles -type f` |
| Both `yarn.lock` (116k) and `package-lock.json` (327k) committed (M) | `ls -la` repo root |

### Correction to prior research
Nothing in this track contradicts `docs/research/2026-07-31-measured-findings.md`; the Netlify-specific parts of that file remain moot as already established. **New**: that doc's assumption of any existing automation is wrong — there is literally zero.

---

## 1. Version matrix — all measured via `npm view <pkg> version` / `gh api repos/<owner>/<repo>/releases/latest` on 2026-07-31

### Actions (current majors — verified to exist)
| Action | Latest tag (M) | Published (M) |
|---|---|---|
| `actions/checkout` | **v7.0.1** | 2026-07-20 |
| `actions/setup-node` | **v7.0.0** | 2026-07-14 |
| `actions/cache` | **v6.1.0** | 2026-06-26 |
| `actions/upload-artifact` | **v7.0.1** | 2026-04-10 |
| `actions/download-artifact` | **v8.0.1** | 2026-03-11 |
| `actions/github-script` | **v9.0.0** | 2026-04-09 |
| `actions/dependency-review-action` | **v5.0.0** | — |
| `treosh/lighthouse-ci-action` | **12.6.2** | 2026-03-12 |

`ubuntu-latest` currently resolves to **Ubuntu 24.04 (noble), x64** (M) — from `actions/runner-images` README: `` | Ubuntu 24.04 | x64 | `ubuntu-latest` or `ubuntu-24.04` | ``. `ubuntu-26.04` exists but is flagged **preview**. Pin `ubuntu-24.04` explicitly so a runner-image rollover never silently re-renders screenshots.

**Do not use `andresz1/size-limit-action`.** (M) Its `action.yml` declares `using: 'node20'` and its last release is v1.8.0 / 2024-04-06. Run `npx size-limit --json` directly instead.

### npm packages (M — `npm view <p> version`)
| Package | Version |
|---|---|
| `next` | 16.2.12 |
| `react` | 19.2.8 |
| `typescript` | 7.0.2 (`latest`), 5.9.3 is the newest 5.x |
| `eslint` | 10.8.0 |
| `eslint-config-next` | 16.2.12 |
| `typescript-eslint` | 8.65.0 |
| `prettier` | 3.9.6 |
| `eslint-config-prettier` | 10.1.8 |
| `vitest` / `@vitest/coverage-v8` / `@vitest/browser` / `@vitest/ui` | 4.1.10 |
| `jest` | 30.4.2 |
| `@playwright/test` / `playwright-core` | 1.62.1 |
| `jsdom` | 30.0.1 |
| `happy-dom` | 20.11.1 |
| `@testing-library/react` | 16.3.2 |
| `@testing-library/dom` | 10.4.1 |
| `@testing-library/jest-dom` | 7.0.0 |
| `@testing-library/user-event` | 14.6.1 |
| `@vitejs/plugin-react` | 6.0.5 |
| `vite-tsconfig-paths` | 6.1.1 |
| `fast-check` | 4.9.0 |
| `@axe-core/playwright` / `axe-core` | 4.12.1 |
| `@lhci/cli` | 0.15.1 |
| `size-limit` / `@size-limit/file` / `@size-limit/preset-app` | 13.0.3 |
| `@next/bundle-analyzer` | 16.2.12 |
| `lint-staged` | 17.3.0 |
| `husky` | 9.1.7 |

### 🚨 Load-bearing version trap: do NOT install `typescript@latest`

**(M)** `npm view typescript-eslint@8.65.0 peerDependencies` →
```
{ eslint: '^8.57.0 || ^9.0.0 || ^10.0.0', typescript: '>=4.8.4 <6.1.0' }
```
`@typescript-eslint/parser@8.65.0` has the identical constraint (M). `typescript@latest` is **7.0.2** (M, `npm view typescript dist-tags`). TypeScript 7 is therefore **outside the supported range of the parser that `eslint-config-next/typescript` pulls in** (M — `eslint-config-next` docs: "Those rules are based on `plugin:@typescript-eslint/recommended`").

**Action:** pin `"typescript": "5.9.3"` in `devDependencies` and add a CI assertion. If an agent runs `npm i -D typescript` unpinned, lint will break or silently degrade. There is no stable `typescript@6` (M — `dist-tags` shows `beta: '6.0.0-beta'`, no 6.x latest).

### Engines (M)
- `next@16.2.12` → `engines: { node: '>=20.9.0' }`; peers `react ^18.2.0 || ^19.0.0`, and notably **`@playwright/test: '^1.51.1'`** is already a listed optional peer of Next 16.
- `vitest@4.1.10` → `engines: { node: '^20.0.0 || ^22.0.0 || >=24.0.0' }`
- `@playwright/test@1.62.1` → `engines: { node: '>=20' }`
- Local dev machine: `node v24.18.0`, `npm 11.16.0` (M).

**Recommendation: Node 22 LTS in CI and on Vercel.** Rationale (I): Vercel's package-manager table (M, https://vercel.com/docs/package-managers) enumerates Node 20 and Node 22 rows and no Node 24 row, so 22 is the safest common denominator; all four tools above support it. Put `22` in `.nvmrc` and mirror it in Vercel Project Settings → Node.js Version.

---

## 2. Pre-CI hygiene (blocking, must land before the first workflow)

1. **Delete one lockfile.** (M) Vercel's docs say only "It does this by looking at the lock file in your project and inferring the correct package manager" and give a one-lockfile-per-manager table; **the docs never state a precedence order for two lockfiles present simultaneously**. Keep `package-lock.json`, `git rm yarn.lock`. Then CI's `npm ci` and Vercel's `npm install` agree by construction. (I: with both present, CI and Vercel can resolve different trees, which is exactly the class of bug that makes screenshot tests flap.)
2. **Add `.nvmrc` = `22`** so `setup-node`'s `node-version-file` and Vercel agree.
3. **Un-pin `"next": "latest"`** in `package.json`. `latest` in a dependency range makes `npm ci` reproducible only because of the lockfile — and any agent running `npm i` re-floats it. Pin an exact-ish range.
4. **Lock down the token now** (before agents can author workflows):
   ```bash
   gh api -X PUT repos/its-everdred/kevinweaver-dev/actions/permissions/workflow \
     -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
   ```
   Then grant `permissions:` per job. Currently both are wide open (M).
5. `next lint` **is removed in Next 16** (M, quoted from https://nextjs.org/docs/app/api-reference/config/eslint): *"Starting with Next.js 16, `next lint` is removed."* and the changelog row: *"`v16.0.0` — `next lint` and the `eslint` next.config.js option were removed in favor of the ESLint CLI."* The `lint` script must become `eslint .` with a flat `eslint.config.mjs`. The existing `.eslintrc.js` + `"lint": "eslint . --ext .js"` (M, `package.json`) is eslint-7-era and will not work with eslint 10.

---

## 3. Workflow set

Four files. `ci.yml` is the everyday gate; `e2e.yml` is the hermetic browser gate (visual + a11y); `preview.yml` is post-merge smoke against the real Vercel deploy; `snapshots.yml` is the escape hatch agents use to regenerate screenshots inside the canonical container.

### 3.1 The `paths-ignore` trap — read this before adding path filters

If a workflow is a **required status check** and you skip it with `paths-ignore`, GitHub never reports the context and the PR sits at *"Expected — Waiting for status to be reported"* forever. Every agent PR that only touches `docs/**` would deadlock.

Fix: **never** put `paths-ignore` on a required workflow. Instead, always run the workflow, compute a `changes` matrix in a cheap first job, `if:`-skip the expensive jobs, and make a single always-running aggregation job (`ci-ok`) the only required context. A skipped needed-job resolves to `skipped`, which is why `ci-ok` must use `!contains(needs.*.result, 'failure')` and not `success()`.

### 3.2 `.github/workflows/ci.yml`

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  merge_group:

# Cancel superseded PR runs; never cancel a main run (it gates the deploy record).
concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

env:
  NEXT_TELEMETRY_DISABLED: "1"
  FORCE_COLOR: "1"

jobs:
  changes:
    runs-on: ubuntu-24.04
    outputs:
      code: ${{ steps.f.outputs.code }}
      data: ${{ steps.f.outputs.data }}
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - id: f
        shell: bash
        run: |
          set -euo pipefail
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            base="origin/${{ github.base_ref }}"
            git fetch --no-tags --depth=1 origin "${{ github.base_ref }}"
            files=$(git diff --name-only "$base"...HEAD)
          else
            files=$(git diff --name-only HEAD~1 HEAD || echo "ALL")
          fi
          echo "$files"
          code=false; data=false
          if [ "$files" = "ALL" ] || echo "$files" | grep -qvE '^(docs/|README\.md|LICENSE|\.github/ISSUE_TEMPLATE/)'; then code=true; fi
          if echo "$files" | grep -qE '^(data/|scripts/data/|public/data/)'; then data=true; fi
          echo "code=$code" >> "$GITHUB_OUTPUT"
          echo "data=$data" >> "$GITHUB_OUTPUT"

  install:
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      # Guard the typescript-eslint peer window measured 2026-07-31.
      - name: assert toolchain pins
        run: node scripts/ci/assert-pins.mjs

  lint:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      - run: npx eslint . --max-warnings=0 -f @microsoft/eslint-formatter-sarif -o eslint.sarif || npx eslint . --max-warnings=0
      - run: npx prettier --check .

  typecheck:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      - run: npx tsc --noEmit

  unit:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      - run: npx vitest run --project=node --project=dom --coverage --reporter=default --reporter=junit --outputFile=junit-unit.xml
      - uses: actions/upload-artifact@v7
        if: always()
        with: { name: junit-unit, path: junit-unit.xml, retention-days: 7 }

  build:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      # Next's own build cache. setup-node only caches ~/.npm.
      - uses: actions/cache@v6
        with:
          path: .next/cache
          key: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.[jt]s','**/*.[jt]sx','**/*.css','**/*.scss') }}
          restore-keys: |
            next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      - run: npm run build
      - name: bundle budgets
        run: npx size-limit --json | tee size-limit.json
      - name: first-load JS budget
        run: node scripts/ci/check-first-load.mjs
      - uses: actions/upload-artifact@v7
        with:
          name: next-build
          path: |
            .next
            !.next/cache
          retention-days: 3

  data-contract:
    needs: changes
    if: needs.changes.outputs.data == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      # Round-trip + schema check for the columnar contribution payload.
      - run: npx vitest run --project=node -t "codec"

  # THE single required status check. Always runs, even when everything is skipped.
  ci-ok:
    if: always()
    needs: [changes, lint, typecheck, unit, build, data-contract]
    runs-on: ubuntu-24.04
    steps:
      - name: gate
        run: |
          echo '${{ toJSON(needs) }}'
          if echo '${{ toJSON(needs) }}' | grep -q '"result": *"failure"'; then exit 1; fi
          if echo '${{ toJSON(needs) }}' | grep -q '"result": *"cancelled"'; then exit 1; fi
          echo "ci ok"
```

**On matrix:** *do not* matrix Node versions here. This app ships to exactly one Vercel Node runtime; a `[20, 22, 24]` matrix triples minutes and can only ever tell you about a runtime you don't deploy on. Spend the parallelism on Playwright shards instead (§5). The one matrix worth having is the Playwright *project* matrix (viewport × devicePixelRatio), which lives inside `playwright.config.ts`, not in YAML.

**On caching:** `actions/setup-node@v7` `cache: npm` caches `~/.npm` only (M — its `action.yml` input doc: *"Used to specify a package manager for caching in the default directory"*). It does **not** cache `node_modules` and does **not** cache `.next/cache`. The explicit `actions/cache@v6` step for `.next/cache` is what actually makes rebuilds fast.

### 3.3 `.github/workflows/e2e.yml` — hermetic browser gate

This is the workflow that owns visual regression, a11y, and canvas determinism. It runs **inside the Playwright container** so pixels are byte-reproducible.

```yaml
name: e2e

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  merge_group:

concurrency:
  group: e2e-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read

jobs:
  e2e:
    runs-on: ubuntu-24.04
    # Pinned to the exact @playwright/test version in package.json.
    # Verified to exist: mcr.microsoft.com/v2/playwright/tags/list contains "v1.62.1-noble".
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
      options: --user root --ipc=host
    env:
      HOME: /root            # the image's default HOME is not always set under Actions
      KW_IN_CONTAINER: "1"   # playwright.config.ts refuses to write snapshots without this
      NEXT_TELEMETRY_DISABLED: "1"
      NEXT_PUBLIC_TEST_HOOKS: "1"
    strategy:
      fail-fast: false
      matrix:
        shard: [1, 2]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      # Sanity: the npm version and the image version must match or screenshots drift.
      - name: assert playwright version matches container
        run: |
          want=$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/,'')")
          have=$(npx playwright --version | sed 's/Version //')
          echo "want=$want have=$have"
          [ "$want" = "$have" ]
      - run: npm run build
      - run: npx playwright test --shard=${{ matrix.shard }}/2
      - uses: actions/upload-artifact@v7
        if: ${{ !cancelled() }}
        with:
          name: playwright-report-${{ matrix.shard }}
          path: |
            playwright-report/
            test-results/
          retention-days: 14

  e2e-ok:
    if: always()
    needs: [e2e]
    runs-on: ubuntu-24.04
    steps:
      - run: |
          echo '${{ toJSON(needs) }}'
          if echo '${{ toJSON(needs) }}' | grep -qE '"result": *"(failure|cancelled)"'; then exit 1; fi
```

Notes:
- `--ipc=host` avoids Chromium crashing on the default 64 MB `/dev/shm` in containers.
- Running `npx playwright install` is **not needed** — the container ships the browsers. Skipping it saves ~40 s/run and, more importantly, guarantees the browser build matches the image.
- Do not add `actions/cache` for `~/.cache/ms-playwright` here; it is dead weight in the container path.

### 3.4 `.github/workflows/preview.yml` — smoke test the real Vercel preview

See §8 for the mechanism. Key structural point: `repository_dispatch` **only triggers a run if the workflow file exists on the default branch** (M, quoted from Vercel's docs: *"This event will only trigger a workflow run if the workflow file exists on the default branch (e.g. `main`)"*). Therefore preview-based e2e **cannot be the PR gate** — a PR that adds a new spec would not see it run. `e2e.yml` (§3.3) is the gate; `preview.yml` is a post-merge canary plus an on-demand check.

```yaml
name: preview-smoke

on:
  repository_dispatch:
    types: ['vercel.deployment.success']
  workflow_dispatch:
    inputs:
      url: { description: 'deployment URL', required: true }

permissions:
  contents: read

jobs:
  smoke:
    runs-on: ubuntu-24.04
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
      options: --user root --ipc=host
    env:
      HOME: /root
      BASE_URL: ${{ github.event.client_payload.url || inputs.url }}
      VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}
    steps:
      - uses: actions/checkout@v7
        with:
          # Check out the commit that was actually deployed, not main's head.
          ref: ${{ github.event.client_payload.git.sha || github.sha }}
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      # Smoke only. Visual snapshots never run against a remote deploy.
      - run: npx playwright test --project=smoke --grep-invert "@visual"
      - uses: actions/upload-artifact@v7
        if: ${{ !cancelled() }}
        with: { name: preview-smoke-report, path: playwright-report/, retention-days: 7 }

  lighthouse:
    needs: smoke
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
        with: { ref: ${{ github.event.client_payload.git.sha || github.sha }} }
      - uses: treosh/lighthouse-ci-action@12.6.2
        with:
          urls: ${{ github.event.client_payload.url || inputs.url }}
          configPath: ./lighthouserc.json
          uploadArtifacts: true
          temporaryPublicStorage: true
```

### 3.5 `.github/workflows/snapshots.yml` — the agent's screenshot regeneration path

Without this, every intentional visual change turns into a human-in-the-loop docker invocation. Agents comment `/update-snapshots` (or push a `update-snapshots` label) and the workflow regenerates inside the canonical container and pushes the PNGs back to the PR branch.

```yaml
name: update-snapshots

on:
  issue_comment:
    types: [created]

permissions:
  contents: write
  pull-requests: write

jobs:
  update:
    if: >-
      github.event.issue.pull_request != null &&
      contains(github.event.comment.body, '/update-snapshots') &&
      (github.event.comment.author_association == 'OWNER' ||
       github.event.comment.user.login == 'its-applekid')
    runs-on: ubuntu-24.04
    container:
      image: mcr.microsoft.com/playwright:v1.62.1-noble
      options: --user root --ipc=host
    env:
      HOME: /root
      KW_IN_CONTAINER: "1"
      NEXT_PUBLIC_TEST_HOOKS: "1"
    steps:
      - uses: actions/github-script@v9
        id: pr
        with:
          script: |
            const { data } = await github.rest.pulls.get({
              ...context.repo, pull_number: context.issue.number });
            core.setOutput('ref', data.head.ref);
            core.setOutput('repo', data.head.repo.full_name);
      - uses: actions/checkout@v7
        with:
          ref: ${{ steps.pr.outputs.ref }}
          repository: ${{ steps.pr.outputs.repo }}
          token: ${{ secrets.SNAPSHOT_PUSH_TOKEN }}   # PAT so the push re-triggers `e2e`
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci --no-audit --fund=false
      - run: npm run build
      - run: npx playwright test --update-snapshots || true
      - run: |
          git config user.name "its-applekid"
          git config user.email "its-applekid@users.noreply.github.com"
          git add -A e2e/__screenshots__
          git diff --cached --quiet || git commit -m "chore(e2e): update screenshots [skip ci]"
          git push
```

`SNAPSHOT_PUSH_TOKEN` must be a PAT/App token, **not** `GITHUB_TOKEN` — see §9 for why.

---

## 4. Testing strategy per layer

### Verdict: **Vitest, not Jest.**

Evidence, in order of weight:

1. **Real-canvas unit tests are only cheap on Vitest.** `@vitest/browser@4.1.10` (M) runs the *same test files* in a real Chromium via the Playwright provider, giving a genuine `CanvasRenderingContext2D`. Jest's only options are `jest-canvas-mock` (a stub that silently no-ops most of the 2D API) or the `canvas` npm package (native node-canvas build in CI, and a *different* rasterizer from Chromium's Skia — so its pixels prove nothing about the browser). For a project whose crux is a canvas renderer, this is decisive.
2. **Next 16 ships first-class Vitest docs** (M — https://nextjs.org/docs/app/guides/testing/vitest, `version: 16.2.12`, `lastUpdated: 2026-02-11`) with an exact `vitest.config.mts`. There is no Babel/SWC transform shim to maintain; `@vitejs/plugin-react@6.0.5` + `vite-tsconfig-paths@6.1.1` is the whole config.
3. **One config, three environments.** Vitest `projects` lets `node` (sim/codec), `jsdom` (React), and `browser` (canvas) coexist in one runner with one watcher and one coverage report (`@vitest/coverage-v8@4.1.10`, M). Jest needs `projects` too but with three separate transform stacks.
4. Jest 30.4.2 is perfectly healthy (M) — this is not a "Jest is dead" argument. It's that Jest buys nothing here and costs a second toolchain that agents will misconfigure.

**Caveat to record verbatim from the Next docs (M):** *"Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them. While you can still run unit tests for synchronous Server and Client Components, we recommend using E2E tests for `async` components."* → Any `async` Server Component (e.g. a resume section that reads the contribution JSON at build time) is **E2E-only**. Design accordingly: keep async data fetching in a thin server shell and put all logic in pure functions that are unit-testable.

### Layer table

| Layer | Tool + version (M) | Environment | Responsible for | Not responsible for |
|---|---|---|---|---|
| **Pure sim / data** — reverse-playback state machine, log2 binning, columnar encode/decode | `vitest@4.1.10` + `fast-check@4.9.0` | `node` | Determinism of `step(state, dt) → state`; log2 band boundaries (esp. the 156-days-at-exactly-1 case that broke quantile binning); codec round-trip `decode(encode(x)) === x`; byte-size assertions on the encoded payload; the *reverse* time cursor never runs past `t=0` or past the newest event | anything touching DOM or `ctx` |
| **React components** | `vitest@4.1.10` + `@testing-library/react@16.3.2` + `@testing-library/dom@10.4.1` + `jsdom@30.0.1` + `@testing-library/jest-dom@7.0.0` | `jsdom` | Resume/man-page/git-log sections render the authoritative content; the contribution grid emits 8–10 distinct `data-band` values; `<canvas>` island mounts with the right `aria-label` and a `<noscript>`/static fallback; keyboard focus order | pixels, layout, fonts |
| **Canvas renderer** | `vitest@4.1.10` + `@vitest/browser@4.1.10` (playwright provider) for logic; `@playwright/test@1.62.1` for pixels | `browser` (Chromium) | Draw-command *sequence* via a recording Proxy over `ctx` (fast, readable diffs, no PNGs); circle-packing layout math against a real `ctx.measureText`; DPR backing-store sizing (`canvas.width === cssW * dpr`) | ground-truth appearance — that's Playwright's job |
| **End-to-end page behavior** | `@playwright/test@1.62.1` | Chromium in `mcr.microsoft.com/playwright:v1.62.1-noble` | First paint shows *newest* contributions (the reversed-playback hard requirement); history lazy-loads as playback walks back; private-repo cluster renders blurred and labeled "Private repos"; both `its-everdred` and `its-applekid` avatars appear as distinct actors; grid squares combine both accounts; a11y; visual regression | unit-level branch coverage |

`happy-dom@20.11.1` (M) is ~2× faster than jsdom but has weaker CSSOM and `document.fonts`; since a11y assertions and font readiness matter here, **use jsdom**.

### `vitest.config.mts`

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./test/setup.dom.ts'],
          include: ['components/**/*.test.tsx', 'app/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'canvas',
          include: ['lib/render/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // The renderer's coverage is meaningless (it's all ctx calls); gate the sim hard.
      thresholds: {
        'lib/sim/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'lib/codec/**': { statements: 100, branches: 95, functions: 100, lines: 100 },
      },
    },
  },
})
```

### The `ctx` recording Proxy (canvas logic without pixels)

```ts
// test/canvas-recorder.ts
export type Call = [string, ...unknown[]]

export function recordContext(ctx: CanvasRenderingContext2D) {
  const calls: Call[] = []
  const round = (v: unknown) =>
    typeof v === 'number' ? Math.round(v * 1000) / 1000 : v   // kill float noise
  const proxy = new Proxy(ctx, {
    get(t, k: string) {
      const v = (t as any)[k]
      if (typeof v === 'function') {
        return (...args: unknown[]) => {
          calls.push([k, ...args.map(round)])
          return v.apply(t, args)
        }
      }
      return v
    },
    set(t, k: string, v) {
      calls.push([`set:${k}`, round(v)])
      ;(t as any)[k] = v
      return true
    },
  })
  return { ctx: proxy as CanvasRenderingContext2D, calls }
}
```

```ts
// lib/render/scene.browser.test.ts
import { expect, test } from 'vitest'
import { recordContext } from '../../test/canvas-recorder'
import { drawScene } from './scene'
import { makeState } from '../sim/state'

test('reverse playback draws newest repos first', () => {
  const el = document.createElement('canvas')
  el.width = 1280; el.height = 800
  const { ctx, calls } = recordContext(el.getContext('2d')!)
  drawScene(ctx, makeState({ seed: 0xC0FFEE, cursor: 0, fixture: 'five-year' }))
  expect(calls).toMatchSnapshot()
})
```

A one-line change to a fill colour produces a one-line snapshot diff instead of a PNG a reviewer has to squint at. This is the layer that should catch 90 % of renderer regressions; pixel tests catch the remaining 10 % (compositing, text metrics, blur).

---

## 5. Deterministic canvas testing in Playwright — the crux

Five independent sources of nondeterminism. Each needs its own kill switch.

| Source | Kill switch | Verified |
|---|---|---|
| `requestAnimationFrame` scheduling / wall clock | `page.clock.install()` **before** navigation, then explicit `runFor`/`fastForward` — *or* bypass rAF entirely via a harness hook | (M) Playwright Clock docs: it fakes *"Date, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, requestIdleCallback, cancelIdleCallback, performance"* |
| `Math.random()` | seeded RNG threaded through sim state + an ESLint ban | (I) |
| Font rasterization | self-host JetBrains Mono via `next/font/local`; block all external hosts; `await document.fonts.ready` | (I) |
| devicePixelRatio | pin `deviceScaleFactor` per Playwright project; assert backing-store size | (M) `use.deviceScaleFactor` |
| CSS animations / caret | `animations: 'disabled'` and `caret: 'hide'` — **already the defaults** | (M) https://playwright.dev/docs/api/class-pageassertions: `animations` default `"disabled"`, `caret` default `"hide"`, `scale` default `"css"`, `threshold` default `0.2`, `maskColor` default `#FF00FF` |

### 5.1 The architectural requirement that makes all of this possible

**The sim must be a pure fixed-timestep reducer, and rAF must live in exactly one file.**

```ts
// lib/sim/step.ts   — pure, no time, no randomness beyond state.rng
export const DT_MS = 1000 / 60
export function step(s: SimState): SimState { /* advances the cursor BACKWARDS in time */ }

// lib/render/driver.ts — the ONLY file allowed to call requestAnimationFrame
let acc = 0
function frame(now: number) {
  acc += now - last; last = now
  while (acc >= DT_MS) { state = step(state); acc -= DT_MS }
  drawScene(ctx, state)
  raf = requestAnimationFrame(frame)
}
```

Enforce it in `eslint.config.mjs`:

```js
{
  files: ['lib/sim/**/*.ts', 'lib/render/**/*.ts'],
  ignores: ['lib/render/driver.ts'],
  rules: {
    'no-restricted-properties': ['error',
      { object: 'Math', property: 'random', message: 'Use createRng(seed) from lib/sim/rng.ts.' },
      { object: 'Date',  property: 'now',    message: 'Time comes from SimState, not the wall clock.' },
      { object: 'performance', property: 'now', message: 'Time comes from SimState, not the wall clock.' },
    ],
    'no-restricted-globals': ['error',
      { name: 'requestAnimationFrame', message: 'rAF is only allowed in lib/render/driver.ts.' },
      { name: 'setTimeout', message: 'Timers are only allowed in lib/render/driver.ts.' },
    ],
  },
}
```

This turns "the animation is deterministic" from a hope into a lint error. It is the single highest-leverage thing in this document.

### 5.2 Seeded RNG

```ts
// lib/sim/rng.ts
export type Rng = () => number
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```
`mulberry32`: 32-bit integer ops only, so it is bit-identical across V8 versions and architectures (I — it uses `Math.imul` and `>>>` exclusively, no floating-point accumulation). Seed comes from `?seed=` in the harness route and from a build constant in production.

### 5.3 The test-only harness route

```tsx
// app/__harness/gource/page.tsx
import { notFound } from 'next/navigation'
import HarnessClient from './client'

export default async function Page({ searchParams }: { searchParams: Promise<Record<string,string>> }) {
  if (process.env.NEXT_PUBLIC_TEST_HOOKS !== '1') notFound()
  return <HarnessClient {...await searchParams} />
}
```

```tsx
'use client'
// app/__harness/gource/client.tsx
export default function HarnessClient({ seed = '0', fixture = 'five-year' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current!
    const dpr = window.devicePixelRatio
    canvas.width = 1280 * dpr; canvas.height = 800 * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    let state = makeState({ seed: Number(seed), fixture: FIXTURES[fixture] })
    drawScene(ctx, state)                       // frame 0 — no rAF is ever started
    ;(window as any).__kwHarness = {
      ready: true,
      renderFrames(n: number) {
        for (let i = 0; i < n; i++) state = step(state)
        drawScene(ctx, state)
      },
      simTimeMs: () => state.cursorMs,
      state: () => structuredClone(state),
    }
  }, [seed, fixture])
  return <canvas id="gource" ref={ref} style={{ width: 1280, height: 800 }} />
}
```

Gated by `NEXT_PUBLIC_TEST_HOOKS`, which is set only in CI (§3.3) — the production Vercel build has it unset, so `notFound()` fires and the client bundle for `/__harness/*` is a separate route chunk that no production page imports.

### 5.4 `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test'

// Snapshots are only ever authored inside mcr.microsoft.com/playwright:v1.62.1-noble.
if (process.argv.includes('--update-snapshots') && process.env.KW_IN_CONTAINER !== '1') {
  throw new Error(
    'Refusing to write screenshots outside the pinned container.\n' +
    'Run:  npm run test:e2e:update   (docker)  or comment /update-snapshots on the PR.'
  )
}

export default defineConfig({
  testDir: './e2e',
  // No OS/arch in the path: there is exactly one legal producer of these bytes.
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,                 // a flaky visual test must fail, not be retried into green
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['blob']]
    : [['list'], ['html', { open: 'never' }]],

  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Playwright defaults (measured): threshold 0.2, animations 'disabled',
      // caret 'hide', scale 'css'. We tighten threshold because gruvbox-dark
      // + 1px beams means a real regression can be a small, low-contrast delta.
      threshold: 0.15,
      maxDiffPixelRatio: 0.002,   // ~2048 px of 1280x800 — absorbs AA jitter only
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      stylePath: './e2e/screenshot.css',
    },
  },

  webServer: {
    command: 'npm run start -- --port 3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_TEST_HOOKS: '1' },
  },

  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'off',
    timezoneId: 'UTC',
    locale: 'en-US',
    colorScheme: 'dark',
    // Vercel deployment protection (only set for preview.yml).
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
          'x-vercel-set-bypass-cookie': 'true',
        }
      : {},
  },

  projects: [
    {
      name: 'desktop-1x',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
    },
    {
      // Catches canvas backing-store bugs: canvas.width must be cssW * dpr.
      name: 'desktop-2x',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
      testMatch: /canvas\.spec\.ts/,
    },
    {
      name: 'mobile-1x',
      use: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
      testIgnore: /canvas\.spec\.ts/,
    },
    {
      name: 'reduced-motion',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' },
      testMatch: /a11y\.spec\.ts/,
    },
    {
      name: 'smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /smoke\.spec\.ts/,
    },
  ],
})
```

`e2e/screenshot.css` (injected via `stylePath`, a real documented option — M):
```css
/* Neutralize anything that is legitimately time- or environment-dependent. */
*, *::before, *::after {
  animation-play-state: paused !important;
  transition: none !important;
}
[data-testid="clock"], [data-testid="relative-time"] { visibility: hidden !important; }
/* Freeze the terminal cursor blink from the swe-rts-terminal design system. */
.cursor, .caret { animation: none !important; opacity: 1 !important; }
```

### 5.5 The canvas spec

```ts
// e2e/canvas.spec.ts
import { test, expect } from '@playwright/test'

const SEED = 0xC0FFEE
const EPOCH = new Date('2026-06-01T00:00:00.000Z')
const FRAMES = [0, 60, 300, 1200] as const   // 0s, 1s, 5s, 20s of reverse playback

test.describe('gource canvas — reverse playback', () => {
  test.beforeEach(async ({ page }) => {
    // Fakes Date/setTimeout/setInterval/rAF/rIC/performance. MUST precede goto().
    await page.clock.install({ time: EPOCH })
    // Nothing may reach the network: no CDN fonts, no GitHub API, no analytics.
    await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort())
  })

  for (const frame of FRAMES) {
    test(`frame ${frame} @visual`, async ({ page }) => {
      await page.goto(`/__harness/gource?seed=${SEED}&fixture=five-year`)
      await page.waitForFunction(() => (window as any).__kwHarness?.ready === true)
      await page.evaluate(() => document.fonts.ready)          // fonts are laid out
      await page.evaluate(n => (window as any).__kwHarness.renderFrames(n), frame)
      await expect(page.locator('#gource')).toHaveScreenshot(`gource-f${frame}.png`)
    })
  }

  test('backing store honours devicePixelRatio', async ({ page }) => {
    await page.goto(`/__harness/gource?seed=${SEED}&fixture=five-year`)
    await page.waitForFunction(() => (window as any).__kwHarness?.ready === true)
    const { w, cssW, dpr } = await page.evaluate(() => {
      const c = document.querySelector('canvas')! as HTMLCanvasElement
      return { w: c.width, cssW: c.getBoundingClientRect().width, dpr: window.devicePixelRatio }
    })
    expect(w).toBe(Math.round(cssW * dpr))
  })

  test('two runs of the same seed are bit-identical', async ({ page }) => {
    const shot = async () => {
      await page.goto(`/__harness/gource?seed=${SEED}&fixture=five-year`)
      await page.waitForFunction(() => (window as any).__kwHarness?.ready === true)
      await page.evaluate(() => (window as any).__kwHarness.renderFrames(300))
      return page.locator('#gource').screenshot()
    }
    expect(Buffer.compare(await shot(), await shot())).toBe(0)
  })
})
```

The third test is the **determinism canary**. Run it on every PR. If it ever fails, no other visual test's result means anything, and you know the regression is in determinism rather than in appearance. Cheap, and it makes the whole VR suite trustworthy.

### 5.6 When to use `page.clock` instead of the harness hook

The harness hook (`renderFrames`) is for *renderer* snapshots — it never starts rAF, so there is nothing to fake. Use `page.clock` for *integration* tests of the real page (`/`), where the driver's rAF loop is running:

```ts
await page.clock.install({ time: EPOCH })
await page.goto('/')
await page.clock.pauseAt(EPOCH)          // no timers fire until we say so
await page.clock.runFor(5_000)           // fires all rAF/timeout callbacks for 5s
await expect(page.locator('#gource')).toHaveScreenshot('home-5s.png')
```
`runFor` fires *all* time-related callbacks; `fastForward` jumps and fires each timer at most once (M, Clock docs). For an rAF loop you want `runFor` — `fastForward` would drop frames and the sim would land in a different state.

### 5.7 Threshold rationale

- Playwright's default `threshold: 0.2` is a per-pixel YIQ colour-space distance (M — docs list it under the pixelmatch-backed comparator). 0.2 on a `#1d2021` background is a large absolute delta; a beam changing from `#8ec07c` (aqua) to `#b8bb26` (green) could pass. Tighten to **0.15**.
- Because everything runs in one fixed container, the only legitimate diff source is subpixel AA on text and circle edges. **`maxDiffPixelRatio: 0.002`** (~2 048 px of a 1 280×800 frame) covers that without hiding a moved node.
- Prefer `maxDiffPixelRatio` over `maxDiffPixels` so the tolerance scales with the 2× DPR project automatically.
- Set `retries: 0`. Retrying a visual test is how a flaky snapshot suite becomes a suite nobody trusts.

---

## 6. Visual regression: built-in `toHaveScreenshot` vs a hosted service

**Recommendation: Playwright's built-in `toHaveScreenshot`, plus the container discipline in §3.3 and §3.5. Do not buy a hosted service.**

| | Playwright built-in | Hosted (Chromatic / Percy / Argos / Lost Pixel) |
|---|---|---|
| Cost | $0 | $0 on free tiers, then per-snapshot billing |
| Rendering environment | whatever *you* pin — here, one exact container digest | vendor's, opaque, changes under you |
| Canvas support | full — it's a real Chromium screenshot | same, but you can't control DPR/clock/RNG from their side |
| Review UX | HTML report artifact; three-up actual/expected/diff | better: hosted UI, approve-in-PR, baseline branching |
| Baseline storage | git (PNGs in repo) | vendor |
| Agent-friendliness | **high** — the baseline is a file an agent can regenerate and commit | low — approval is a click in a vendor UI a bot can't do without an API key + integration |

The deciding factor is the third bullet of the brief: *autonomous agents author most of the code*. An agent can run `/update-snapshots`, get the PNGs committed, and let `e2e` re-run. With a hosted service, a human must click "approve" in a web UI. Built-in wins for this project specifically.

Cost of the built-in path: PNGs in git. Mitigate with (a) `#gource`-element screenshots rather than `fullPage` (a 1 280×800 gruvbox canvas PNG is small and compresses well), (b) a hard cap of ~12 baseline images, (c) `git config diff.png.textconv` off — do not add Git LFS for a portfolio site.

### The platform problem, and the exact fix

Playwright encodes the platform into the default snapshot filename: *"The snapshot name `example-test-1-chromium-darwin.png` consists of a few parts … `chromium-darwin` — the browser name and the platform"* (M). That default is a *coping mechanism* for multi-platform teams; it does not solve reproducibility, it just partitions the problem. Here, there is one deployment target and one CI OS, so the right answer is: **exactly one machine may ever produce a baseline byte, and that machine is a pinned container image.**

Concretely:
1. `snapshotPathTemplate` drops the platform segment (§5.4) — the path now asserts "these bytes are container bytes."
2. `playwright.config.ts` throws if `--update-snapshots` runs without `KW_IN_CONTAINER=1` (§5.4). This is the guard that stops an agent (or Kevin, on Arch Linux — glibc and fontconfig differ from noble even though both are Linux) from committing locally-rendered PNGs.
3. Local regeneration goes through docker:
   ```json
   {
     "scripts": {
       "test:e2e": "playwright test",
       "test:e2e:docker": "docker run --rm --ipc=host -v \"$PWD\":/w -w /w -e KW_IN_CONTAINER=1 -e NEXT_PUBLIC_TEST_HOOKS=1 mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test",
       "test:e2e:update": "docker run --rm --ipc=host -v \"$PWD\":/w -w /w -e KW_IN_CONTAINER=1 -e NEXT_PUBLIC_TEST_HOOKS=1 mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test --update-snapshots"
     }
   }
   ```
4. The image tag is verified to exist (M):
   `curl -s https://mcr.microsoft.com/v2/playwright/tags/list | tr ',' '\n' | grep 'v1.62.1'` →
   `v1.62.1`, `v1.62.1-amd64`, `v1.62.1-arm64`, `v1.62.1-jammy`, **`v1.62.1-noble`**, `v1.62.1-noble-amd64`, `v1.62.1-noble-arm64`, `v1.62.1-resolute`, … (12 tags).
   Use `-noble` (matches `ubuntu-latest` = 24.04) and pin `-amd64` — or better, a digest — if you want to be bulletproof against Kevin running on an arm64 machine.
5. The `e2e` job asserts `npx playwright --version` equals the `@playwright/test` version in `package.json` (§3.3). A Renovate/agent bump of the npm package without bumping the container tag would otherwise re-render every baseline with a different Chromium.

**Add a `renovate.json` / dependabot grouping rule so `@playwright/test` and the container tag bump in the same PR** — otherwise this becomes the most common CI failure in the repo (I).

---

## 7. Accessibility testing

`@axe-core/playwright@4.12.1` (axe-core 4.12.1) (M).

```ts
// e2e/a11y.spec.ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

test('home page has no WCAG A/AA violations @a11y', async ({ page }, testInfo) => {
  await page.clock.install()
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)

  const results = await new AxeBuilder({ page })
    .withTags(WCAG)
    // The canvas is decorative + has a text equivalent alongside it (see below).
    // Excluding the *subtree* is correct; the <canvas> element itself is still scanned.
    .exclude('#gource-surface *')
    .analyze()

  await testInfo.attach('axe', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  })
  expect(results.violations).toEqual([])
})

test('canvas island exposes a text equivalent @a11y', async ({ page }) => {
  await page.goto('/')
  const canvas = page.locator('canvas#gource')
  await expect(canvas).toHaveAttribute('role', 'img')
  await expect(canvas).toHaveAttribute('aria-label', /contribution/i)
  // The accessible fallback must be real content, not a placeholder.
  await expect(page.getByTestId('gource-fallback')).toContainText(/repositor/i)
})

test('reduced motion stops the animation @a11y', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.goto('/')
  await page.clock.runFor(3000)
  // With prefers-reduced-motion the driver must not advance the sim.
  const t0 = await page.evaluate(() => (window as any).__kwDebug?.cursorMs)
  await page.clock.runFor(3000)
  expect(await page.evaluate(() => (window as any).__kwDebug?.cursorMs)).toBe(t0)
})
```

### What to assert
- `results.violations` is **empty** for `wcag2a/2aa/21a/21aa` on `/` — hard fail.
- `html-has-lang`, `page-has-heading-one`, `region` (all content in landmarks), `landmark-one-main` — these are cheap wins the design system will pass once the man-page section is marked up as `<main>` with real headings (M — rule ids from https://dequeuniversity.com/rules/axe/4.10).
- `color-contrast` against the gruvbox palette — this is the one that will actually bite. `fg4 #a89984` on `bg0 #282828` ≈ 6.0:1 (passes AA), but `gray #928374` on `bg0 #282828` ≈ 4.4:1 — **borderline for AA normal text (4.5:1)**. (I — computed from the authoritative token values; verify with the actual rendered sizes.) Decide up front whether `--gray` may be used for body-size text or only for ≥18.66 px / bold. Encode the decision as an axe assertion, not a code comment.
- `aria-hidden-focus` — the blurred "Private repos" cluster must not contain focusable elements if it is `aria-hidden`.

### What will legitimately fail on a canvas-heavy page, and the honest resolution
1. **`<canvas>` has no accessible name.** axe does not ship a canvas-specific rule (M — the Deque 4.10 rule index has no `canvas-*` rule), but `role="img"` without `aria-label` trips `aria-*`/`image-alt`-family checks. **Resolution: give it `role="img"` + `aria-label`, and render a real, non-visual text summary next to it** ("42 repositories, 3 214 contributions, most recent 2026-07-29"). That summary is also the SSR/no-JS fallback and the SEO content — one artifact, three jobs.
2. **Canvas contents are invisible to axe entirely.** No amount of configuration fixes this; the pixel content of a canvas has no accessibility tree. Do not pretend otherwise with a fake DOM shadow of every node — that's a lot of code that only a linter reads. The text summary is the honest answer.
3. **`color-contrast` cannot evaluate canvas-drawn text.** axe reads computed CSS; text painted with `ctx.fillText` is invisible to it. **You must assert canvas text contrast manually** — a Vitest test over the palette pairs used by the renderer (`beam on bg`, `label on repo circle`) computing WCAG contrast ratios from the token hexes. That's a pure function, so it's a `node`-project unit test.
4. **`prefers-reduced-motion`.** Not an axe rule — axe cannot detect a runaway animation. It needs the explicit test above. WCAG 2.2 SC 2.2.2 (Pause, Stop, Hide) applies to the auto-playing animation: **there must be a visible pause control**, and reduced-motion must halt it. Assert both.
5. `region` will fail if the canvas island sits outside any landmark. Wrap it in `<section aria-labelledby=…>`.

Run a11y in the `reduced-motion` Playwright project (§5.4) so the scan happens against a stopped animation — otherwise axe's own DOM traversal races the rAF loop.

---

## 8. Performance budgets in CI

Two enforcement mechanisms with very different reliability. **Use size-limit as the hard gate and Lighthouse as the soft signal**, because LHCI on shared GitHub runners is noisy enough that hard perf thresholds produce false failures that agents will learn to ignore or, worse, "fix" by disabling.

### 8.1 Bundle size — `size-limit@13.0.3` + `@size-limit/file@13.0.3` (M)

```json
{
  "size-limit": [
    {
      "name": "app shell (everything except the canvas island)",
      "path": [".next/static/chunks/**/*.js", "!.next/static/chunks/**/gource*.js"],
      "limit": "120 kB",
      "brotli": true,
      "running": false
    },
    {
      "name": "gource canvas island (lazy chunk)",
      "path": ".next/static/chunks/**/gource*.js",
      "limit": "90 kB",
      "brotli": true,
      "running": false
    },
    {
      "name": "recent-window contribution payload (first byte)",
      "path": "public/data/recent.bin",
      "limit": "48 kB",
      "brotli": true,
      "running": false
    },
    {
      "name": "css",
      "path": ".next/static/css/**/*.css",
      "limit": "24 kB",
      "brotli": true,
      "running": false
    }
  ]
}
```

Field names verified against the size-limit README (M): `path`, `limit`, `name`, `gzip`, `brotli`, `running`, `import`; config lives in `package.json` `"size-limit"`, `.size-limit.json`, or `.size-limit.{js,cjs,ts}`.

Threshold rationale for a portfolio site with one heavy canvas island (I, but grounded):
- **120 kB brotli app shell.** React 19 + Next 16 runtime is roughly 90 kB brotli before app code; 120 kB leaves ~30 kB for the resume/man-page/git-log UI, which is text and CSS. If this budget is tight, the fix is that the resume must be server-rendered with near-zero client JS — which is the right architecture anyway.
- **90 kB brotli canvas island.** No charting library is permitted; the renderer is hand-written Canvas 2D over the sim. 90 kB is generous for that and forbids someone reaching for d3/pixi/three.
- **48 kB brotli for `recent.bin`.** This is the budget that operationalizes the **reversed-playback hard requirement**: newest data must be first-byte. If the recent window doesn't fit in one round trip, the "newest first" promise is a lie. History payloads are lazy and get a *separate*, looser per-file budget.
- **The `running: false` flag matters** — size-limit will otherwise try to execute the bundle to measure time-to-run, which will fail on Next's chunk format.

Complement with a `scripts/ci/check-first-load.mjs` that reads Next's build manifest and sums the per-route first-load set, because globbing `.next/static/chunks/**` over-counts (it includes chunks no route loads). (I — the exact manifest filename should be confirmed against Next 16 output once the upgrade lands; `.next/app-build-manifest.json` for App Router, `.next/build-manifest.json` for Pages Router.)

### 8.2 Lighthouse CI — `@lhci/cli@0.15.1`, `treosh/lighthouse-ci-action@12.6.2` (M)

`lighthouserc.json` (schema keys verified against the LHCI configuration doc — M):

```json
{
  "ci": {
    "collect": {
      "numberOfRuns": 3,
      "settings": { "preset": "desktop", "skipAudits": ["uses-http2", "canonical"] }
    },
    "assert": {
      "preset": "lighthouse:no-pwa",
      "assertions": {
        "categories:accessibility":  ["error", { "minScore": 1.0,  "aggregationMethod": "pessimistic" }],
        "categories:seo":            ["error", { "minScore": 1.0,  "aggregationMethod": "pessimistic" }],
        "categories:best-practices": ["error", { "minScore": 0.95, "aggregationMethod": "median" }],
        "categories:performance":    ["warn",  { "minScore": 0.90, "aggregationMethod": "median" }],

        "first-contentful-paint":     ["error", { "maxNumericValue": 1800, "aggregationMethod": "median" }],
        "largest-contentful-paint":   ["error", { "maxNumericValue": 2500, "aggregationMethod": "median" }],
        "cumulative-layout-shift":    ["error", { "maxNumericValue": 0.05, "aggregationMethod": "pessimistic" }],
        "total-blocking-time":        ["warn",  { "maxNumericValue": 400,  "aggregationMethod": "median" }],
        "speed-index":                ["warn",  { "maxNumericValue": 3000, "aggregationMethod": "median" }],
        "unused-javascript":          "off",
        "uses-long-cache-ttl":        "off"
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Rationale for the split:
- **a11y and SEO are `error` at 1.0.** They are deterministic, machine-checkable, and this site's whole job is to be a resume that a peer and a crawler can read. There is no excuse for < 100.
- **CLS is `error` at 0.05 with `pessimistic` aggregation.** A canvas island that sizes itself after mount is the classic CLS regression; catch the worst run, not the median.
- **Performance category and TBT are `warn`.** Lighthouse on a shared `ubuntu-24.04` runner has run-to-run variance easily exceeding 5 performance points (I). Hard-failing on it trains agents to disable the check. `size-limit` provides the deterministic hard gate; LHCI provides the trend.
- **TBT 400 ms is deliberately loose** for the canvas island — but only survivable if the island is lazy. Enforce the laziness structurally: the canvas must mount behind `next/dynamic({ ssr: false })` + an `IntersectionObserver`, and the first sim step must be deferred to `requestIdleCallback`. Add a Playwright assertion that no `gource*.js` request is made before the canvas scrolls into view; that turns an architectural rule into a test.
- `aggregationMethod` values available: `median`, `optimistic`, `pessimistic`, `median-run` (M).
- Run LHCI **only against the Vercel preview URL** (§3.4), never against `next start` on a runner — the runner has no CDN, no brotli negotiation, and no edge caching, so the numbers would be meaningless as a proxy for production.

---

## 9. Vercel previews as the agent review surface

### How Vercel and Actions interact (M — https://vercel.com/docs/git/vercel-for-github)
- Vercel's GitHub App holds `Deployments: read/write`, `Checks: read/write`, `Commit Statuses: read/write`, `Pull Requests: read/write`.
- *"Vercel for GitHub will deploy every push by default. This includes pushes and pull requests made to branches."* So previews already exist for every agent PR with no workflow at all.
- *"Vercel notifies GitHub of deployments using the `deployment_status` webhook event"*, and posts a PR comment with the URL.
- Vercel emits a per-commit GitHub **Commit Status**, which means **the Vercel deploy can itself be a required status check** on `main` — free preview-build verification with zero YAML.

### Getting the preview URL in a workflow — two supported paths

**Preferred (current): `repository_dispatch`.** (M)
```yaml
on:
  repository_dispatch:
    types: ['vercel.deployment.success']
```
Payload access: `${{ github.event.client_payload.url }}` for the deployment URL and `${{ github.event.client_payload.git.sha }}` for the deployed commit (M — both fields appear in Vercel's own KB example at https://vercel.com/kb/guide/how-can-i-run-end-to-end-tests-after-my-vercel-preview-deployment). Event types available (M, from `vercel/repository-dispatch` `src/types.ts`): `vercel.deployment.{success,error,canceled,ignored,skipped,pending,failed,promoted}`.

**Legacy: `deployment_status`.**
```yaml
on: deployment_status
jobs:
  e2e:
    if: github.event.deployment_status.state == 'success'
    env:
      BASE_URL: ${{ github.event.deployment_status.environment_url }}
```
Vercel explicitly documents migrating off this (M — the diff in their docs replaces `deployment_status` with `repository_dispatch` and `github.event.deployment_status.environment_url` with `github.event.client_payload.url`).

**Do not** use `patrickedqvist/wait-for-vercel-preview` (v1.3.3, 2026-01-21) — it polls the deployments API and burns runner minutes for something the dispatch event gives you for free.

### Can Playwright run against the preview? Yes — with two caveats.

1. **Deployment Protection.** If Vercel Authentication is on for previews, every Playwright request gets an auth wall. Fix (M, from https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation): generate a Protection Bypass for Automation secret; Vercel exposes it as `VERCEL_AUTOMATION_BYPASS_SECRET`. Send it as the header **`x-vercel-protection-bypass`**, plus **`x-vercel-set-bypass-cookie: true`** so follow-up in-browser navigations (which Playwright does constantly) also pass. Vercel's own documented Playwright config is exactly the `extraHTTPHeaders` block in §5.4. Store the value as a repo secret; it is *not* automatically available to Actions.
2. **Never run visual snapshots against a preview.** The preview is served through Vercel's CDN with real network timing, and the harness route is `notFound()` in production (`NEXT_PUBLIC_TEST_HOOKS` unset). Preview runs get `--project=smoke --grep-invert "@visual"`. Visual truth lives in the container (§3.3).

### The structural limitation to plan around
`repository_dispatch` *"will only trigger a workflow run if the workflow file exists on the default branch"* (M). A PR that adds or changes a preview-e2e spec **will not see that change run against its own preview**. Two consequences:
- Preview e2e is a **post-merge canary**, not a PR gate. Do not put `preview-smoke` in the required status checks.
- Add `workflow_dispatch` with a `url` input (as in §3.4) so a change can be exercised manually before merge.

Also: the Vercel deploy itself should be a required check so agent PRs cannot merge a build that Vercel can't build. Its context name is whatever Vercel names the commit status (typically the Vercel project name) — **read it off the first PR and then add it to the ruleset**; do not guess it.

---

## 10. Branch protection / ruleset for `main`

**Goal: an agent PR merges itself once green, with no human review required, while `main` stays unbreakable.**

### 10.1 Constraint discovered: merge queue is unavailable here (M)

GitHub's docs state merge queue is available *"in any public repository owned by an organization, or in private repositories owned by organizations using GitHub Enterprise Cloud."* This repo is public but **owned by a User** (`owner.type: "User"`, M). Therefore **merge queue is off the table** unless the repo is transferred to an org. That directly shapes the config: use `gh pr merge --auto` (auto-merge) and **do not** set `strict_required_status_checks_policy: true`, because "branch must be up to date" without a merge queue means every merge invalidates every other open PR and agents will thrash on rebases.

### 10.2 Prerequisite repo settings

```bash
gh api -X PATCH repos/its-everdred/kevinweaver-dev \
  -F allow_auto_merge=true \
  -F delete_branch_on_merge=true \
  -F allow_squash_merge=true \
  -F allow_merge_commit=false \
  -F allow_rebase_merge=false \
  -f squash_merge_commit_title=PR_TITLE \
  -f squash_merge_commit_message=PR_BODY

gh api -X PUT repos/its-everdred/kevinweaver-dev/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false
```
(`allow_auto_merge` is currently `false` — M — so `gh pr merge --auto` would error today.)

### 10.3 The ruleset

`.github/rulesets/main.json` (shape verified against https://docs.github.com/en/rest/repos/rules — M):

```json
{
  "name": "main",
  "target": "branch",
  "enforcement": "active",
  "conditions": {
    "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] }
  },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["squash"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "ci-ok" },
          { "context": "e2e-ok" }
        ]
      }
    }
  ]
}
```

```bash
gh api -X POST repos/its-everdred/kevinweaver-dev/rulesets \
  --input .github/rulesets/main.json
```

Design notes:
- **`required_approving_review_count: 0`** is what makes agent PRs self-merging. The `pull_request` rule is still present (not omitted) because it is what forces *everything* to go through a PR — direct pushes to `main` become impossible, including by agents. That is the actual safety property; the review count is orthogonal.
- **Exactly two required contexts, `ci-ok` and `e2e-ok`.** Both are always-run aggregation jobs (§3.2, §3.3), so path-filtered skips can never deadlock a PR. Adding `lint`/`unit`/`build` individually as contexts would reintroduce the skip-deadlock.
- **Add the Vercel commit-status context as a third** once you read its exact name off a real PR.
- **`bypass_actors` with `RepositoryRole` id 5 (admin)** lets Kevin force-push a hotfix. (I) The numeric id for the admin repository role should be confirmed with a trial POST; if it is rejected, drop `bypass_actors` entirely — as repo owner you can still edit the ruleset in 10 seconds.
- **No `required_linear_history`** — squash-only merges already produce a linear history, and adding the rule just creates another way for an agent to get stuck.
- `dismiss_stale_reviews_on_push: true` is harmless at count 0 and becomes correct the day you raise the count.

### 10.4 Auto-merge enablement workflow

```yaml
name: automerge
on:
  pull_request:
    types: [opened, ready_for_review, labeled, synchronize]
permissions:
  contents: write
  pull-requests: write
jobs:
  enable:
    if: >-
      !github.event.pull_request.draft &&
      (github.event.pull_request.user.login == 'its-applekid' ||
       contains(github.event.pull_request.labels.*.name, 'automerge'))
    runs-on: ubuntu-24.04
    steps:
      - env:
          GH_TOKEN: ${{ secrets.AUTOMERGE_TOKEN }}
          PR: ${{ github.event.pull_request.number }}
        run: gh pr merge --squash --auto -R "$GITHUB_REPOSITORY" "$PR"
```
This job deliberately **does not check out the PR's code**, so it never executes agent-authored code with a write token. It uses `pull_request` (not `pull_request_target`), which is safe here because `its-applekid` pushes branches in-repo rather than from a fork.

### 10.5 Why `AUTOMERGE_TOKEN` must be a PAT, not `GITHUB_TOKEN`

(M — https://docs.github.com/en/actions/concepts/security/github_token): *"events triggered by the `GITHUB_TOKEN` will not create a new workflow run"*, with the documented exceptions that *"workflow_dispatch and repository_dispatch events always create workflow runs."*

Consequence: if auto-merge is enabled by `GITHUB_TOKEN`, the resulting merge commit's `push: main` **does not start any workflow**. If anything on this project depends on a post-merge `push: main` run — regenerating the contribution dataset on a schedule *plus* on merge, publishing, or a main-branch visual baseline refresh — it will silently never fire. Use a fine-grained PAT (or a GitHub App installation token) stored as `AUTOMERGE_TOKEN` with `contents: write` + `pull_requests: write` on this repo only. The same applies to `SNAPSHOT_PUSH_TOKEN` in §3.5: a `GITHUB_TOKEN` push to a PR branch will not re-trigger `e2e`, so the PR would sit with a stale failing check forever.

### 10.6 The tradeoff, stated plainly

**Setting `required_approving_review_count: 0` means the test suite is the only thing standing between an agent's code and production.** There is no second pair of eyes. Concretely:

- Any class of defect the suite does not cover ships. A visual regression in a region with no baseline screenshot; a copy error in the resume text; a subtly wrong contribution count; a licence violation in a vendored snippet — none of these are caught.
- An agent can *weaken the gate in the same PR that needs weakening*. Nothing stops a PR that both breaks a test and deletes it, or lowers `maxDiffPixelRatio` to 1.0, or adds `test.skip`. **This is the real risk, and it is not solved by branch protection.** Mitigations, in order of value:
  1. A `CODEOWNERS` entry for `.github/**`, `playwright.config.ts`, `vitest.config.mts`, `lighthouserc.json`, `.size-limit.json`, `e2e/__screenshots__/**` **plus** `require_code_owner_review: true` — but that reintroduces human review *only for gate changes*, which is exactly the right granularity. This is the recommended posture: **review count 0 for code, code-owner review required for the gate itself.** GitHub applies code-owner review only when a matching path changes, so ordinary agent PRs still self-merge.
  2. A lint rule / CI grep banning `test.skip`, `test.only`, `it.skip`, `describe.skip`, `.fixme(` in `e2e/**` and `**/*.test.*`, failing the build.
  3. A CI step that fails if the total number of test files decreased relative to `main`.
- Because `strict_required_status_checks_policy` is `false`, a PR can merge against a stale base. GitHub still runs `pull_request` checks against the *merge* commit, so genuine conflicts are caught; semantic conflicts (two PRs that each pass alone but break together) are not. For a single-app portfolio repo with low PR concurrency, this is an acceptable risk (I). If PR concurrency rises, the correct fix is transferring the repo to an organization and enabling merge queue — not flipping `strict` on.

**Recommended final posture:** review count 0 + code-owner review scoped to gate files + the two aggregate status checks + squash-only + delete-branch-on-merge. That gets agent velocity everywhere except the one place where a human's judgment is irreplaceable: changes to the safety net itself.

---

## 11. Rollout order (each step is independently mergeable)

1. Hygiene: delete `yarn.lock`, add `.nvmrc`, pin `next`/`typescript@5.9.3`, lock down `default_workflow_permissions`.
2. `eslint.config.mjs` flat config + `prettier` + `tsconfig.json` + `scripts/ci/assert-pins.mjs`. (No workflow yet — just make `npx eslint . && npx tsc --noEmit` pass locally.)
3. `ci.yml` with `changes/lint/typecheck/build/ci-ok`. No `unit` job yet (no tests exist).
4. Vitest scaffolding + the `node` project + the first sim/codec tests. Wire `unit` into `ci.yml`.
5. Playwright scaffolding + `smoke.spec.ts` + `e2e.yml` container job + `e2e-ok`. No screenshots yet.
6. Ruleset + auto-merge + `AUTOMERGE_TOKEN` + `CODEOWNERS` for gate files.
7. The determinism architecture (`step`/`driver` split, seeded RNG, eslint bans) + the harness route.
8. Visual regression baselines + `snapshots.yml` + `test:e2e:update` docker script.
9. a11y specs + canvas text-contrast unit test.
10. `size-limit` budgets in `build`; then `preview.yml` with smoke + LHCI.

Steps 1–6 are the safety net. **Do not let agents author feature code before step 6 lands.**

---

## 12. Open questions

1. Is the live Vercel project actually connected to this GitHub repo, or was `kevinweaver.dev` deployed from a disconnected source? Last push was 2021-05-31 and there is no `.vercel` in the repo. If not connected, all of §8/§3.4 needs a `vercel link` step first. Requires Vercel dashboard access.
2. Is Deployment Protection (Vercel Authentication) currently enabled on previews for this project? Determines whether `VERCEL_AUTOMATION_BYPASS_SECRET` is required. Not measurable from the CLI without a Vercel token.
3. What is the exact GitHub commit-status **context name** Vercel publishes for this project? Needed verbatim for the ruleset. Read it off the first PR.
4. Does `its-applekid` have write access to this repo (needed for in-repo branches and the `pull_request`-not-`pull_request_target` automerge design)? `gh api repos/.../collaborators` requires push scope; the current token has `repo` so this is checkable, but the answer wasn't measured here.
5. Is the `RepositoryRole` bypass actor id `5` = admin correct for a user-owned repo, and are `bypass_actors` even accepted on non-org rulesets? Needs a trial POST.
6. App Router or Pages Router for the rebuild? Determines `.next/app-build-manifest.json` vs `.next/build-manifest.json` in `check-first-load.mjs`, and whether the async-Server-Component Vitest caveat applies at all.
7. Which contrast tier does the gruvbox `gray #928374` token get used at? Determines whether `color-contrast` can stay a hard `error`.

---

## Verification corrections

Adversarial re-verification pass, 2026-07-31, independent subagent. Every item below was re-measured from primary sources; nothing here is taken from the body of this doc. **(M)** = measured, command/URL shown.

### Summary of the audit

The version matrix in §1 was spot-checked exhaustively and is **100 % accurate** — all 9 action tags + publish dates, all 26 npm versions, all `engines`/`peerDependencies` blocks, `next@16.2.12`'s optional `@playwright/test: ^1.51.1` peer, `ubuntu-latest` → Ubuntu 24.04 x64, the 12 `v1.62.1*` MCR tags, the `next lint` removal quote, and the Vitest-doc frontmatter (`version: 16.2.12`, `lastUpdated: 2026-02-11`) all reproduce exactly. **No (M) claim in §0 or §1 was found to be a disguised inference.** The corrections below are all in the *reasoning* and the *implementation code*, not in the measurements.

---

### C1. §10.1 merge queue — **CONFIRMED**, with the primary-source quote this doc was missing

The doc paraphrased GitHub's availability sentence without citing it. Verbatim primary source (M):

```
curl -sL https://raw.githubusercontent.com/github/docs/main/data/reusables/gated-features/merge-queue.md
→ "Pull request merge queues are available in any public repository owned by an organization, or in
   private repositories owned by organizations using {% data variables.product.prodname_ghe_cloud %}."
```

Independently corroborated against the live repo (M):
```
gh api graphql -f query='{repository(owner:"its-everdred",name:"kevinweaver-dev"){isInOrganization owner{__typename} autoMergeAllowed mergeQueue(branch:"main"){id}}}'
→ {"isInOrganization":false,"owner":{"__typename":"User"},"autoMergeAllowed":false,"mergeQueue":null}
```

Merge queue is unavailable. §10.1's conclusion and its downstream consequence (`strict_required_status_checks_policy: false`, `gh pr merge --auto` instead of queue entry) stand.

> **But the doc contradicts itself.** §3.2 `ci.yml` and §3.3 `e2e.yml` both declare an `on: merge_group:` trigger. Given §10.1, that trigger can never fire on this repo. It is harmless but dead config, and it will mislead an agent into thinking a queue exists. **Delete `merge_group:` from both workflows**, or add a comment marking it as pre-provisioning for a future org transfer.

---

### C2. §1 TypeScript pin — **CONFIRMED, and materially understated**

The peer-range facts reproduce exactly (M, `npm view typescript-eslint@8.65.0 peerDependencies` → `{ eslint: '^8.57.0 || ^9.0.0 || ^10.0.0', typescript: '>=4.8.4 <6.1.0' }`; `npm view typescript dist-tags` → `latest: '7.0.2'`, `beta: '6.0.0-beta'`, no 6.x latest). The dependency path is now measured directly rather than inferred from prose (M):

```
npm view eslint-config-next@16.2.12 dependencies
→ { 'typescript-eslint': '^8.46.0', ... }
npm view eslint-config-next@16.2.12 peerDependencies
→ { eslint: '>=9.0.0', typescript: '>=3.3.1' }     ← config-next's own peer is wide open; the
                                                     constraint lives one level down. Pin is essential.
```

**Correction to the stated failure mode.** §1 says "lint will break or silently degrade." Measured, it is neither an ERESOLVE nor a degrade — it is *silent install followed by a hard crash*:

```
# scratch dir, /tmp — dry run, nothing installed into this repo
npm install --dry-run eslint@10.8.0 eslint-config-next@16.2.12 typescript@latest
→ add typescript 7.0.2
  add typescript-eslint 8.65.0
  add @typescript-eslint/typescript-estree 8.65.0
  ...
  added 306 packages in 3s          ← NO ERESOLVE. npm 11.16.0 accepts the violated peer range.
```

And the reason it then hard-crashes is more fundamental than a version range (M — tarball inspected):

```
curl -sL https://registry.npmjs.org/typescript/-/typescript-7.0.2.tgz | tar -tz
package/lib/  →  getExePath.js  tsc.js  version.cjs  (+ .d.ts)      ← that is the ENTIRE lib/
package/vendor/, package/dist/, package/bin/

cat package/lib/version.cjs
  const { version } = require("../package.json");
  exports.version = version;
  exports.versionMajorMinor = "7.0";

npm view typescript@7.0.2 exports  →  { '.': './lib/version.cjs', './unstable/ast': ..., ... }
npm view typescript@7.0.2 bin      →  { tsc: 'bin/tsc' }            ← tsserver bin is GONE (5.9.3 has it)
npm view typescript@7.0.2 dist.unpackedSize → 2,497,498  (5.9.3 → 23,625,066)
```

`typescript@7` is the native rewrite. There is **no `lib/typescript.js` and no `main` field**; `require('typescript')` returns `{ version, versionMajorMinor }` and nothing else. `@typescript-eslint/typescript-estree@8.65.0` (which declares `typescript` as a peer and calls the full compiler API) will throw a `TypeError` on the first `ts.*` call. There is no "silent degrade" path.

**Net effect on the plan: the recommendation gets *stronger*.** `scripts/ci/assert-pins.mjs` must assert `typescript` is `>=4.8.4 <6.1.0` **before** `npx eslint` runs, because npm will happily install the broken tree and the failure surfaces as an opaque stack trace, not as a version warning. Also note the secondary casualty the doc missed: `tsserver` is absent from TS 7, so any editor/agent tooling that spawns it breaks too.

---

### C3. §5.1–5.3 determinism architecture — thesis **CONFIRMED**, three implementation defects that void it

The architectural claim (pure fixed-timestep reducer + rAF in one file + seeded RNG) is sound and is not contradicted by anything measured. The Playwright evidence backing it reproduces verbatim (M, https://playwright.dev/docs/api/class-clock): the Clock fakes *"Date, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, requestIdleCallback, cancelIdleCallback, performance"*, and `fastForward` *"Only fires due timers at most once"* while `runFor` *"Advance the clock, firing all the time-related callbacks."* §5.6's advice to use `runFor` for an rAF loop is correct.

**But the code as written in §5.2/§5.3 does not implement the architecture it describes.**

**C3a — `createRng` is stateful, so `step` is not pure.** §5.1 declares `step(s: SimState): SimState` "pure, no time, no randomness beyond `state.rng`." §5.2's `createRng` returns a closure over a mutable `let a`. If that closure lives on `SimState`, then `step` mutates hidden state outside its return value: two calls to `step(s0)` with the *same* `s0` produce different results, replay from a snapshot diverges, and property-based `fast-check` tests over `step` (proposed in §4's layer table) are unsound. **Fix: carry the RNG as a 32-bit integer field on `SimState` and make the advance functional** — `nextRandom(s): [SimState, number]`, or `rngState: number` advanced inside `step`. Keep `mulberry32`'s arithmetic; drop the closure.

**C3b — `structuredClone(state)` in §5.3 throws if `state.rng` is a function.** Measured:
```
node -e "structuredClone({cursorMs:0, rng:()=>1})"
→ THREW: DataCloneError | () => 1 could not be cloned.
```
The harness's `state: () => structuredClone(state)` hook — the thing a Playwright test would use to assert sim state — fails at runtime on the very first call. C3a's fix resolves this too.

**C3c — the ESLint ban does not catch `window.requestAnimationFrame`.** §5.1 claims the config "turns 'the animation is deterministic' from a hope into a lint error." Measured against the rule docs (https://eslint.org/docs/latest/rules/no-restricted-globals): the rule's `checkGlobalObject` option *"enables detection of restricted globals accessed via global objects"* and **defaults to `false`**. As written, `no-restricted-globals` flags the bare identifier `requestAnimationFrame` only; `window.requestAnimationFrame(fn)`, `globalThis.setTimeout(...)`, and `self.requestAnimationFrame(...)` all sail through — and `window.requestAnimationFrame` is the form most agents will actually emit in a `useEffect`. **Fix: add `{ checkGlobalObject: true }` to the `no-restricted-globals` options.** Also note the config's `files` glob covers only `lib/sim/**` and `lib/render/**`, so `app/__harness/**` and every React component are unguarded; widen it or the escape hatch is trivial.

---

### C4. §3.3/§6 container discipline — image pin **CONFIRMED**, both enforcement mechanisms **REFUTED as written**

The image tag exists and the tag inventory is exact (M):
```
curl -s https://mcr.microsoft.com/v2/playwright/tags/list | tr ',' '\n' | grep '1\.62\.1'
→ v1.62.1, -amd64, -arm64, -jammy, -jammy-amd64, -jammy-arm64,
  v1.62.1-noble, -noble-amd64, -noble-arm64, -resolute, -resolute-amd64, -resolute-arm64   (12)
```
`ubuntu-latest` → Ubuntu 24.04 x64 confirmed verbatim from `actions/runner-images/README.md` (M), so `-noble` is the right base. `snapshotPathTemplate`'s tokens are all real (M, https://playwright.dev/docs/api/class-testconfig#test-config-snapshot-path-template lists `{arg} {ext} {platform} {projectName} {snapshotDir} {testDir} {testFileDir} {testFileBaseName} {testFileName} {testFilePath} {testName}`), and the `chromium-darwin` default-naming quote reproduces verbatim. `toHaveScreenshot` defaults reproduce exactly: `threshold` 0.2, `animations` `"disabled"`, `caret` `"hide"`, `scale` `"css"`, `maxDiffPixelRatio`/`maxDiffPixels` unset.

**C4a — the "assert playwright version matches container" step in §3.3 does not check the container.** The step is:
```bash
want=$(node -p "require('./package.json').devDependencies['@playwright/test'].replace(/^[^0-9]*/,'')")
have=$(npx playwright --version | sed 's/Version //')
[ "$want" = "$have" ]
```
`npx` resolves `./node_modules/.bin/playwright`, i.e. the package `npm ci` just installed. So this compares **package.json against the lockfile** — two things `npm ci` already guarantees agree. It never reads the image. The exact drift it is advertised to prevent (agent bumps `@playwright/test` + lockfile to 1.63.0 but forgets the hardcoded `image: mcr.microsoft.com/playwright:v1.62.1-noble` in the YAML) **passes this assertion**, and every baseline silently re-renders under a different Chromium. **Fix: assert against the image tag itself.** Either hoist the tag to a job-level `env` / workflow input and compare `${{ env.PW_IMAGE_TAG }}` to `npx playwright --version`, or read the image's own bundled version (`node -p "require('/ms-playwright-agent/node_modules/@playwright/test/package.json').version"` — path must be confirmed against the image) and compare all three.

**C4b — the `--update-snapshots` guard in §5.4 has two bypasses.** The guard is `process.argv.includes('--update-snapshots')`. Measured against the Playwright CLI reference (https://playwright.dev/docs/test-cli), the flag is documented as ``-u or --update-snapshots [mode]`` with modes `all | changed | missing | none`. Measured argv matching:
```
"--update-snapshots"          → caught: true
"-u"                          → caught: false     ← the shorthand every dev types
"--update-snapshots=all"      → caught: false
"--update-snapshots=changed"  → caught: false
```
So `npx playwright test -u` on Kevin's Arch box writes baselines with Arch's glibc/fontconfig and commits them — precisely the failure §6 exists to prevent, via the most likely invocation. **Fix:**
```ts
const UPDATING = process.argv.some(a => a === '-u' || a === '--update-snapshots' || a.startsWith('--update-snapshots='))
if (UPDATING && process.env.KW_IN_CONTAINER !== '1') throw new Error(...)
```
Belt-and-braces: also add a CI step that fails if `git diff --name-only origin/main...HEAD` touches `e2e/__screenshots__/**` in a PR whose commits were not authored by the `update-snapshots` workflow.

The *thesis* of §6 — one pinned container is the sole legal producer of baseline bytes — survives. Only its two enforcement mechanisms are holed, and both are one-line fixes.

---

### C5. §3.4/§9 preview e2e — conclusion **CONFIRMED**, stated rationale **REFUTED**

The `repository_dispatch` default-branch constraint is real and reproduces from *both* primary sources (M):
```
GitHub:  content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md
  ## repository_dispatch
  | Webhook event payload | Activity types | GITHUB_SHA | GITHUB_REF |
  | repository_dispatch   | Custom | Last commit on default branch | Default branch |
  + note: reusables/actions/branch-requirement
Vercel:  https://vercel.com/docs/git/vercel-for-github  → "This event will only trigger a workflow run
  if the workflow file exists on the default branch (e.g. `main`)."
```

**But §3.4's justifying sentence — *"a PR that adds a new spec would not see it run"* — is wrong.** Only the **workflow file** is read from the default branch. §3.4's own job body does `actions/checkout` with `ref: ${{ github.event.client_payload.git.sha }}`, so the *repository contents at the deployed commit* — including any new or modified `e2e/*.spec.ts` — are what execute. New specs **do** run against the PR's preview. The limitation applies exclusively to edits of `preview.yml` itself.

**And the absolute claim "preview-based e2e *cannot* be the PR gate" is refuted.** Vercel ships a first-party action whose entire purpose is to make it one (M — https://github.com/vercel/repository-dispatch, `actions/status/action.yaml`):

> *"Action for Vercel repository dispatch deployment events. Automatically sets the status of the workflow on the sha received from a repository_dispatch event"*

`actions/status/src/utils/set-commit-status.ts` reads `context.payload.client_payload?.git?.sha` and calls `octokit.rest.repos.createCommitStatus({ sha, state, context })`. That posts a commit status onto the **PR head commit**, not the default-branch SHA — which is exactly what makes a context eligible as a required status check. Vercel's own `examples/ci-example/.github/workflows/smoke.yaml` does this on `vercel.deployment.ready` with `permissions: { actions: read, statuses: write }`.

**Revised, defensible reason to keep `preview-smoke` out of the required checks** (which preserves §3.4's recommendation on better grounds):
1. **Deadlock on skipped deploys.** If Vercel emits `vercel.deployment.ignored` / `.skipped` / `.error` — e.g. a docs-only PR under an Ignored Build Step, or a build failure — no `success` dispatch fires, `actions/status` never posts, and a required `preview-smoke` context sits at *"Expected — Waiting for status to be reported"* forever. This is the same class of deadlock §3.1 correctly warns about for `paths-ignore`, and it is unfixable from the workflow side because the workflow never starts.
2. **Self-modification.** A PR that changes `preview.yml` runs `main`'s version of it, so the gate cannot verify the change to itself.
3. **Snapshot bytes.** Independently of the above, visual baselines must never come from a CDN-served preview (§6). The hermetic container job remains the visual gate regardless.

Conclusion unchanged: **`e2e-ok` (container) is the required check; `preview-smoke` is a canary.** But do not justify it with the "new specs won't run" argument — that argument is false and an agent that checks it will lose confidence in the rest of the section.

**C5a — the event-type list in §9 is incomplete and its citation path is wrong.** §9 lists `vercel.deployment.{success,error,canceled,ignored,skipped,pending,failed,promoted}` and cites `vercel/repository-dispatch` `src/types.ts`. Measured: that path 404s. The real path is `packages/repository-dispatch/src/types.ts`; `actions/status/src/types.ts` exists but contains only `Status`/`WorkflowStage`/`Job`. The authoritative list (M, Vercel docs, verbatim) has **nine** entries — the doc omitted **`vercel.deployment.ready`**, which is the type Vercel's own example workflow subscribes to. Both `ready` and `success` fire; pick deliberately (`ready` fires earlier and is what Vercel's Promotion-Requirements flow uses).

**C5b — §9's Vercel GitHub App permission list is an incomplete subset.** The docs table (M) grants nine repository permissions, including two the doc omits that materially expand the blast radius: **`Administration` read/write** (*"Allows us to create repositories on the user's behalf"*) and **`Contents` read/write**. Worth stating explicitly in a doc whose §0 flags `default_workflow_permissions: write` as "a live security hole."

---

### C6. Corrections that are *not* corrections — re-confirmed verbatim

Checked because they read like paraphrase; all reproduce word-for-word and are correctly marked (M):
- `next lint` removal, both the prose and the `v16.0.0` changelog row (https://nextjs.org/docs/app/api-reference/config/eslint).
- The async-Server-Component Vitest caveat, and the frontmatter `version: 16.2.12` / `lastUpdated: 2026-02-11`.
- `actions/setup-node@v7.0.0` `cache` input description: *"Used to specify a package manager for caching in the default directory. Supported values: npm, yarn, pnpm."* (note: v7 also adds a `package-manager-cache` input, default `true`, not mentioned in §3.2).
- `andresz1/size-limit-action` → `using: 'node20'`, latest release `v1.8.0` / `2024-04-06T18:20:31Z`. Avoid-it verdict stands.
- `GITHUB_TOKEN` does not trigger workflows (§10.5): *"With the exception of `workflow_dispatch` and `repository_dispatch`, other `GITHUB_TOKEN`-triggered events do not create workflow runs at all."* — §10.5's PAT requirement for both `AUTOMERGE_TOKEN` and `SNAPSHOT_PUSH_TOKEN` is correct.
- Every §0 ground-state fact re-measured identically: no `.github`, `rulesets` → `[]`, protection → 404, `allow_auto_merge:false`, `owner.type:"User"`, `default_workflow_permissions:"write"` + `can_approve_pull_request_reviews:true`, `allowed_actions:"all"`, `sha_pinning_required:false`.

### Priority of the fixes above

Blocking before §11 step 7 (the determinism architecture): **C3a, C3b, C3c**.
Blocking before §11 step 8 (visual baselines): **C4a, C4b**.
Editorial but load-bearing for agent trust: **C5, C5a, C1**.
Strengthens an already-correct call: **C2**.
