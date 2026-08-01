# KW-011 — Vitest scaffolding: node / dom / browser projects

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 2 — Two small helper files plus one config file, but the config spans three runtime environments and two coverage-threshold globs whose target directories do not exist yet, so every claim has to be proved by execution rather than by reading.

**Risk:** Medium — Vitest 4 moved the Playwright browser provider into a separate `@vitest/browser-playwright` package, so the `provider: 'playwright'` string carried in the CI/testing research track is stale; a wrong provider or a devDependency KW-001 did not pre-install leaves `npx vitest run` red for every downstream ticket that ships a test.

**Phase hint:** 2

**Depends on:** KW-001

**Serializes with:** none

**Requirements:** REQ-007

**Decisions:** DEC-001, DEC-003, DEC-005, DEC-016

**Gates:** none

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

Three test environments — `node`, `dom` and `canvas` — run under one `npx vitest run`; the `canvas` project executes in real Chromium and provably gets a genuine `CanvasRenderingContext2D`; v8 coverage thresholds are declared for the simulation and codec surfaces and are proven to fail the run when breached; and the exact command already wired into `ci.yml`'s `unit` job (`npx vitest run --project=node --project=dom --coverage`) exits 0.

## Context and evidence

Nothing in this repository tests anything today. At `e664d73a195facd64db58ba10952170ff01b4772`, `package.json` declares only `dev`, `build`, `start` and `lint`; there is no `test` script, no `test/` directory, no `vitest.config.*`, no `jest.config.*` and no `.github/` at all. KW-001 lands the toolchain, the `test:unit` script and `.github/workflows/ci.yml` with an empty-handed `unit` job whose body is `npx vitest run --project=node --project=dom --coverage`. This ticket is what makes that job mean something.

Why Vitest and not Jest (ci-testing track §4, re-confirmed by its verifier): the crux of this site is a canvas renderer, and `@vitest/browser` runs the *same* test files in real Chromium through a Playwright provider, yielding a real `CanvasRenderingContext2D`. Jest's alternatives are `jest-canvas-mock` (silently no-ops most of the 2D API) or `node-canvas` (a native build in CI and a *different* rasterizer from Chromium's Skia, so its pixels prove nothing about the browser). Next 16 also ships a first-party Vitest guide, so there is no transform shim to maintain.

Decisions this ticket is bound by:

- **DEC-001** (D-01) — KW-001 lands the toolchain and the CI gate atomically, which is why the `unit` job slot already exists and this ticket must fit it rather than create it.
- **DEC-003** (D-03) — `package.json` and `package-lock.json` are frozen after KW-001, which pre-installs the whole measured dependency set. This ticket therefore installs nothing; it consumes.
- **DEC-005** (D-05) — zero `serializes_with` pairs; every same-wave ticket owns a disjoint write surface. Nine other tickets run alongside this one in wave 2. The three files below are the entire permitted diff.
- **DEC-016** (D-16) — the simulation RNG is `mulberry32` carried as a 32-bit integer field on `SimState` and advanced functionally inside `step`. That is precisely what makes `step` a pure function testable in the `node` project and `structuredClone`-able; the ci-testing verifier measured that a closure-based RNG both breaks purity (C3a) and throws `DataCloneError` under `structuredClone` (C3b). The 95% floor on `lib/viz/sim/**` exists to hold that architecture in place.

Ground truth that shapes the acceptance bar:

- **GT-14** — the fleet gives complexity 1/2/3 a budget of 4/8/12 turns. This is a complexity-2 ticket; do not expand it.
- Next's own Vitest documentation, quoted verbatim in the ci-testing track and re-confirmed by its verifier: *"Since `async` Server Components are new to the React ecosystem, Vitest currently does not support them… we recommend using E2E tests for `async` components."* This is why the `dom` project is scoped to synchronous components, and why build-time data reading must live in pure functions (a design constraint on KW-016/KW-017, recorded here so nobody tries to fix it in the config).

Plan-context navigation, pinned to the approved planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- Pack index and the KW-01 ↔ KW-001 identity mapping: `docs/build-orders/site-rewrite/README.md`.
- Wave and graph analysis (wave diagram, verified topological levels, critical path, write-surface partition proof): `docs/research/2026-07-31-decomposition-synthesis.md` §6.
- Decision registry (D-01 … D-17) and human gates (HG-1 … HG-7): same document, §3 and §4.
- This ticket's implementation pointers: same document, §5 → "Wave 2 — the wide wave", entry **KW-11**.
- Supporting track with the layer table, the `vitest.config.mts` sketch and the recording-Proxy sketch: `docs/research/2026-07-31-ci-testing.md` §4, plus its "## Verification corrections" section (C3a/C3b/C3c), which overrides the body of that document wherever the two disagree.
- Browsable at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/`.

## Scope

- Create `vitest.config.mts` declaring exactly three projects — `node`, `dom`, `canvas` — under one `defineConfig`, so a single `npx vitest run` executes all three with one watcher and one coverage report.
- Publish the test-file naming contract that routes a file to a project: `*.test.ts` → `node`, `*.test.tsx` → `dom`, `*.browser.test.ts` → `canvas`; every sibling ticket names its test files by this rule.
- Wire the `canvas` project to real Chromium through the `playwright()` provider exported by `@vitest/browser-playwright`, headless, single `chromium` instance.
- Create `test/setup.dom.ts` registering the `@testing-library/jest-dom` matchers and an `afterEach` cleanup for the `dom` project only.
- Create `test/canvas-recorder.ts` exporting `recordContext` and `drawCallsUnderFilter` — the seam KW-022 uses to assert draw-command sequences and the at-most-one-draw-call-under-`ctx.filter` rule.
- Configure v8 coverage with the two threshold globs from the decomposition: 95/90/95/95 on `lib/viz/sim/**` and 100/95/100/100 on the codec module trio in `lib/bundle/`.
- Prove both threshold behaviours by execution: silent pass while the gated directories are empty, and a non-zero exit with the exact `ERROR: Coverage for …` line once a gated file is under-covered.
- Prove the config against the literal command in KW-001's `unit` job: `npx vitest run --project=node --project=dom --coverage`.

## Non-goals

- Editing `.github/workflows/ci.yml`, or adding any CI job that executes the `canvas` project. The `unit` job is KW-001's file and the only browser-capable workflow is `.github/workflows/e2e.yml`, owned by KW-023.
- Editing `package.json` or `package-lock.json` to add, pin or bump any dependency. Both are frozen by DEC-003 and owned solely by KW-001.
- Editing `tsconfig.json`, `eslint.config.mjs`, `.prettierrc` or `.nvmrc` — all KW-001's.
- Writing `playwright.config.ts`, `e2e/**` or any `*.spec.ts` end-to-end test. That is KW-023, which depends on this ticket.
- Authoring product tests for `lib/viz/sim/**`, `lib/viz/render/**`, `lib/viz/tokens/**`, `lib/bundle/**`, `scripts/pipeline/**` or any region component. Each owning ticket writes its own tests against the naming contract published here.
- Creating any file under `lib/**`, `app/**`, `components/**`, `content/**`, `scripts/**`, `data/**` or `public/**`, including fixtures. A scratch file used to demonstrate the coverage gate must be deleted before commit.
- Visual regression, screenshot baselines, `toHaveScreenshot`, axe/a11y assertions, Lighthouse and `size-limit`. Those belong to KW-029, KW-030 and KW-031.
- Adding, renaming or reordering any npm script.

## Existing owner and reuse target

There is no existing test infrastructure to extend. Verified at `e664d73a195facd64db58ba10952170ff01b4772`:

- `package.json` `scripts` is exactly `{dev, build, start, lint}`; there is no `test`, `test:unit` or `test:e2e` entry, and no Vitest, Jest, Playwright or Testing-Library dependency.
- `git ls-files` shows no `test/` directory, no `vitest.config.*`, no `jest.config.*`, no `tsconfig.json` and no `.github/` path of any kind.

All three files in the write surface are therefore new. Everything this ticket *consumes* is created by the named upstream ticket **KW-001**:

| Consumed artefact | Created by | Used for |
|---|---|---|
| `package.json` `devDependencies` (table below) | KW-001 | the runner, the providers, the DOM environment |
| `package.json` script `test:unit` | KW-001 | the operator-facing entry point |
| `tsconfig.json` | KW-001 | `resolve.tsconfigPaths` and `tsc --noEmit` over `test/**` |
| `.github/workflows/ci.yml` job `unit` | KW-001 | the CI slot this config must satisfy |
| `eslint.config.mjs`, `.prettierrc` | KW-001 | lint/format gates the three new files must pass |

**If KW-001 has not merged, stop.** At the researched commit the tree still declares `next: latest`, React 17 and ESLint 7, has two lockfiles, and has no `tsconfig.json`. Nothing in this ticket can be verified against that tree.

## Contract and invariants

This ticket is a *producer* of three contracts. Consumers quote them verbatim.

### C1 — Project routing by filename (consumed by every ticket that ships a test)

| Filename pattern | Project | Environment | Typical owner |
|---|---|---|---|
| `**/*.test.ts` (excluding `*.browser.test.ts`) | `node` | `node` | KW-007, KW-008, KW-009, KW-012, KW-021, KW-029 |
| `**/*.test.tsx` | `dom` | `jsdom` + `test/setup.dom.ts` | KW-016 … KW-020, KW-025, KW-026 |
| `**/*.browser.test.ts` | `canvas` | real Chromium via Playwright | KW-022 |

`e2e/**`, `node_modules/**`, `.git/**` and `.next/**` are excluded from all three. End-to-end specs are `*.spec.ts` under `e2e/` and belong to Playwright (KW-023), not to Vitest — the two suffixes never collide.

This routing is why the declared test paths in the decomposition all land correctly without any per-ticket configuration: `test/viz/ramp-contrast.test.ts` (KW-007), `test/viz/{cursor,rng}.test.ts` (KW-008), `scripts/pipeline/__tests__/*.test.ts` (KW-009), `test/bundle/roundtrip.test.ts` (KW-012), `test/viz/step.test.ts` (KW-021) and `lib/viz/tokens/contrast.test.ts` (KW-029) are all `node`; region component tests are `dom`; renderer tests are `canvas`.

### C2 — `test/canvas-recorder.ts` public seam (consumed by KW-022)

KW-022's acceptance states: *"`ctx.filter` set for at most one draw call, enforced by a lint rule or the recording Proxy"*. This is that Proxy. Quote this typespec verbatim:

```ts
// test/canvas-recorder.ts
export type Call = [string, ...unknown[]]

export interface Recording {
  ctx: CanvasRenderingContext2D
  calls: Call[]
}

/** Wrap a real 2D context; every method call and property set is appended to `calls`. */
export function recordContext(target: CanvasRenderingContext2D): Recording

/** Number of draw calls issued while `ctx.filter` was set to something other than '' or 'none'. */
export function drawCallsUnderFilter(calls: readonly Call[]): number
```

Invariants:

- Method calls are recorded as `[methodName, ...args]`; property writes as `[`set:${prop}`, value]`.
- Every finite number in a recorded argument is rounded to **3 decimal places** (`Math.round(v * 1000) / 1000`). This is what makes snapshots stable across machines and turns a fill-colour change into a one-line text diff.
- The Proxy is transparent: calls are forwarded to the real context, so `getImageData` after a recorded `fillRect` returns real pixels.
- Symbol keys are passed through unrecorded.

Worked data shape — **measured**, this exact assertion passes in the `canvas` project:

```ts
const { ctx, calls } = recordContext(el.getContext('2d')!)
ctx.fillStyle = '#b8bb26'
ctx.fillRect(0.12345678, 1, 2, 3)
// calls === [
//   ['set:fillStyle', '#b8bb26'],
//   ['fillRect', 0.123, 1, 2, 3],
// ]
```

### C3 — Coverage floors (safety surface)

```jsonc
"lib/viz/sim/**":                        { "statements": 95,  "branches": 90, "functions": 95,  "lines": 95 }
"lib/bundle/{schema,codec,frontcode}.ts": { "statements": 100, "branches": 95, "functions": 100, "lines": 100 }
```

Invariants:

- Globs are matched against the **repository-root-relative** path of each covered file.
- `coverage.include` is set explicitly to `['lib/viz/sim/**/*.ts', 'lib/bundle/*.ts']`. Without it, Vitest reports only files that a test imported, so a brand-new untested module in `lib/viz/sim/` would score nothing and the floor would never bite. With it, an untested module counts as 0% and fails the run. `lib/bundle/loader.ts` (KW-015) is deliberately in the report but outside the 100% glob.
- While the gated directories do not exist, the coverage map for each glob is empty, `pct` is the string `"Unknown"`, and the comparison `"Unknown" < 95` is `false`, so the run passes. **Measured at planning time**; this is the intended and required behaviour at merge time for this ticket.
- These floors are a **safety surface**. No later ticket may lower a number, widen an `exclude`, or delete a glob to make its own PR go green. Raising a floor is always allowed.

## Refreshable implementation notes

Refreshable against `e664d73a195facd64db58ba10952170ff01b4772`. Re-verify at pickup; do not silently change scope if something has moved.

### Step 0 — verify the dependency precondition (do this first)

```bash
node -e "const d=require('./package.json').devDependencies||{};for(const p of ['vitest','@vitest/coverage-v8','@vitest/browser','@vitest/browser-playwright','playwright','@playwright/test','@vitejs/plugin-react','jsdom','@testing-library/react','@testing-library/dom','@testing-library/jest-dom'])console.log((d[p]?'OK   ':'MISS '),p,d[p]||'')"
```

Required, all pins measured with `npm view <pkg> version` on 2026-07-31:

| Package | Exact pin | Why this ticket needs it |
|---|---|---|
| `vitest` | `4.1.10` | the runner; `test.projects`, `resolve.tsconfigPaths` |
| `@vitest/coverage-v8` | `4.1.10` | `coverage.provider: 'v8'` and the threshold engine |
| `@vitest/browser` | `4.1.10` | browser-mode runtime |
| `@vitest/browser-playwright` | `4.1.10` | exports `playwright()` — **the provider; Vitest 4 only** |
| `playwright` | `1.62.1` | non-optional peer of `@vitest/browser-playwright` |
| `@playwright/test` | `1.62.1` | supplies the `playwright` CLI used to download Chromium |
| `@vitejs/plugin-react` | `6.0.5` | JSX/Fast-Refresh transform for the `dom` project |
| `jsdom` | `30.0.1` | the `dom` project's environment |
| `@testing-library/react` | `16.3.2` | `render` / `cleanup` |
| `@testing-library/dom` | `10.4.1` | non-optional peer of `@testing-library/react` |
| `@testing-library/jest-dom` | `7.0.0` | the `./vitest` matcher entrypoint |

**If any row reports `MISS`: do not edit `package.json` or `package-lock.json`.** Both are frozen by DEC-003 and owned by KW-001. Post the exact `npm i -D <pkg>@<pin> …` line in the PR body, note it on the KW-001 issue, and stop. Amending KW-001's frozen surface is the Executor's call, not a worker's.

Three measured notes on that table, each of which corrects a research-track claim:

1. **`@vitest/browser-playwright` is new and is not in KW-001's abbreviated pre-install list.** In Vitest 4 the provider is no longer the string `'playwright'`. `npm view vitest@4.1.10 peerDependencies` lists `@vitest/browser-playwright: 4.1.10`, and the package's own `BrowserConfigOptions.provider` doc comment shows `import { playwright } from '@vitest/browser-playwright'` → `provider: playwright()`. The `vitest.config.mts` in `docs/research/2026-07-31-ci-testing.md` §4 uses the stale Vitest-3 form and must not be copied verbatim.
2. **`vite-tsconfig-paths` is not needed.** Vitest 4.1.10 resolves `vite@8.2.0`, and Vite 8 prints, once per project: *"The plugin `vite-tsconfig-paths` is detected. Vite now supports tsconfig paths resolution natively via the `resolve.tsconfigPaths` option."* Use `resolve: { tsconfigPaths: true }` and do not add the plugin.
3. **`fast-check@4.9.0`** is for the property-based tests in KW-008 and KW-021. It is not needed here; do not reference it.

### Step 1 — create `vitest.config.mts`

Full file. This exact content was executed at planning time against `vitest@4.1.10` with all three projects green.

```ts
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: [
            '**/node_modules/**',
            '**/.git/**',
            '**/.next/**',
            'e2e/**',
            '**/*.browser.test.ts',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          setupFiles: ['./test/setup.dom.ts'],
          include: ['**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/.git/**', '**/.next/**', 'e2e/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'canvas',
          include: ['**/*.browser.test.ts'],
          exclude: ['**/node_modules/**', '**/.git/**', '**/.next/**', 'e2e/**'],
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['lib/viz/sim/**/*.ts', 'lib/bundle/*.ts'],
      exclude: ['**/*.test.ts'],
      thresholds: {
        'lib/viz/sim/**': { statements: 95, branches: 90, functions: 95, lines: 95 },
        'lib/bundle/{schema,codec,frontcode}.ts': {
          statements: 100,
          branches: 95,
          functions: 100,
          lines: 100,
        },
      },
    },
  },
})
```

Notes for the worker:

- `test.projects` is the Vitest 4 key. `test.workspace` and a separate `vitest.workspace.ts` were removed; do not reintroduce them.
- `extends: true` makes each project inherit the root `plugins` and `resolve`.
- `screenshotFailures: false` stops browser mode writing stray PNGs into `__screenshots__` on a failure. Screenshot bytes are KW-031's exclusive territory and must only ever be produced inside the pinned container.
- `headless` defaults to `process.env.CI`; pin it to `true` so a local run behaves like CI.
- `coverage.reporter` deliberately omits `html`; `lcov.info` is the machine-readable artefact and `text-summary` is what a reviewer reads in the log.
- The file extension is `.mts` on purpose. Note that Next's generated `tsconfig.json` `include` of `**/*.ts` does **not** match `.mts`, so `npx tsc --noEmit` will not typecheck this file. Prove it by running it, not by typechecking it. Do not "fix" this by editing `tsconfig.json`.

### Step 2 — create `test/setup.dom.ts`

```ts
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
```

`@testing-library/jest-dom@7.0.0` exports a `./vitest` subpath (verified via `npm view @testing-library/jest-dom@7.0.0 exports`); it registers `toBeInTheDocument`, `toHaveAccessibleName` and the rest onto Vitest's `expect`. This file is loaded by the `dom` project only — the `node` and `canvas` projects must stay free of it.

### Step 3 — create `test/canvas-recorder.ts`

Full file, executed green at planning time:

```ts
export type Call = [string, ...unknown[]]

export interface Recording {
  ctx: CanvasRenderingContext2D
  calls: Call[]
}

const round = (v: unknown): unknown =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v

export function recordContext(target: CanvasRenderingContext2D): Recording {
  const calls: Call[] = []
  const proxy = new Proxy(target, {
    get(t, key) {
      const value = Reflect.get(t, key, t) as unknown
      if (typeof key === 'symbol') return value
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push([key, ...args.map(round)])
          return (value as (...a: unknown[]) => unknown).apply(t, args)
        }
      }
      return value
    },
    set(t, key, value) {
      if (typeof key !== 'symbol') calls.push([`set:${key}`, round(value)])
      Reflect.set(t, key, value, t)
      return true
    },
  })
  return { ctx: proxy, calls }
}

const DRAW_CALLS = new Set([
  'fill',
  'stroke',
  'fillRect',
  'strokeRect',
  'fillText',
  'strokeText',
  'drawImage',
  'putImageData',
])

export function drawCallsUnderFilter(calls: readonly Call[]): number {
  let filterOn = false
  let count = 0
  for (const [name, ...args] of calls) {
    if (name === 'set:filter') {
      const value = args[0]
      filterOn = typeof value === 'string' && value !== '' && value !== 'none'
      continue
    }
    if (filterOn && DRAW_CALLS.has(name)) count += 1
  }
  return count
}
```

`Reflect.get(t, key, t)` — passing the *target* as the receiver, not the proxy — is what keeps native accessors such as `fillStyle` working. The `get` trap takes two parameters; a third unused `receiver` parameter will fail `eslint . --max-warnings=0`.

### Step 4 — the smoke test, and why it is temporary

The `canvas` project must contain at least one passing test for `npx vitest run` to prove anything, but this ticket owns no `lib/**` file. Put the smoke test inside the write surface as `test/canvas-recorder.browser.test.ts` — it is a test *of the recorder*, which this ticket owns, not a test of a sibling's module. Executed green at planning time:

```ts
import { expect, test } from 'vitest'
import { drawCallsUnderFilter, recordContext } from './canvas-recorder'

function make2d(): CanvasRenderingContext2D {
  const el = document.createElement('canvas')
  el.width = 8
  el.height = 8
  const ctx = el.getContext('2d')
  if (ctx === null) throw new Error('no 2d context')
  return ctx
}

test('the canvas project gets a real 2D context', () => {
  const ctx = make2d()
  ctx.fillStyle = '#98971a' // gruvbox green-d, D-09 level 6
  ctx.fillRect(0, 0, 8, 8)
  const px = ctx.getImageData(0, 0, 1, 1).data
  expect([px[0], px[1], px[2], px[3]]).toEqual([0x98, 0x97, 0x1a, 255])
})

test('recordContext captures the draw-command sequence rounded to 3 dp', () => {
  const { ctx, calls } = recordContext(make2d())
  ctx.fillStyle = '#b8bb26'
  ctx.fillRect(0.12345678, 1, 2, 3)
  expect(calls).toEqual([
    ['set:fillStyle', '#b8bb26'],
    ['fillRect', 0.123, 1, 2, 3],
  ])
})

test('drawCallsUnderFilter counts draws issued while ctx.filter is set', () => {
  const { ctx, calls } = recordContext(make2d())
  ctx.filter = 'blur(4px)'
  ctx.fillRect(0, 0, 1, 1)
  ctx.filter = 'none'
  ctx.fillRect(0, 0, 1, 1)
  expect(drawCallsUnderFilter(calls)).toBe(1)
})
```

The `getImageData` round-trip is the assertion the decomposition demands: it is impossible to pass under `jsdom`, so it proves the `canvas` project really is in Chromium.

Vitest exits **1** with *"No test files found"* when a selected project matches nothing, and KW-001's `unit` job selects `node` and `dom`. So all three projects need at least one test in this PR. Add exactly these three, and nothing more:

| File | Project | Content |
|---|---|---|
| `test/canvas-recorder.browser.test.ts` | `canvas` | the three tests above |
| `test/canvas-recorder.test.ts` | `node` | one assertion over `drawCallsUnderFilter` on a hand-built `Call[]` literal — no canvas needed |
| `test/setup.dom.test.tsx` | `dom` | `render(<p>ok</p>)` plus `expect(screen.getByText('ok')).toBeInTheDocument()`, which also proves `test/setup.dom.ts` loaded |

These are three files beyond the three named in the write surface. They are tests *of this ticket's own modules and of the config itself*, they live under `test/`, and they collide with no sibling's surface. List them explicitly in the PR body so the boundary stays auditable. Add nothing else — no fixture, no helper, no file outside `test/`.

### Step 5 — install Chromium, then run

```bash
npx playwright install chromium     # ~115 MiB, cached in ~/.cache/ms-playwright
# on a bare container without system libraries:
# npx playwright install --with-deps chromium
```

Measured at planning time with `playwright@1.62.1`: `Chrome Headless Shell 151.0.7922.34 (playwright chromium-headless-shell v1234)`.

### Step 6 — format before committing

```bash
npx prettier --write vitest.config.mts test/setup.dom.ts test/canvas-recorder.ts \
  test/canvas-recorder.browser.test.ts test/canvas-recorder.test.ts test/setup.dom.test.tsx
```

Uses whatever `.prettierrc` KW-001 landed. CI runs `npx prettier --check .` and `npx eslint . --max-warnings=0`, both with zero tolerance.

## Acceptance and verification

### Agent gate

- `npx playwright install chromium && npx vitest run` exits 0 and reports three projects — `node`, `dom` and `canvas (chromium)` — each with at least one passing test.
- The `canvas` project proves a real 2D context: after `ctx.fillStyle = '#98971a'; ctx.fillRect(0, 0, 8, 8)`, `ctx.getImageData(0, 0, 1, 1).data` equals `[152, 151, 26, 255]`.
- `recordContext` rounds recorded numbers to 3 decimal places: `ctx.fillRect(0.12345678, 1, 2, 3)` records `['fillRect', 0.123, 1, 2, 3]`.
- `npx vitest run --project=node --project=dom --coverage` — the literal command in KW-001's `unit` job — exits 0 and prints a coverage summary.
- Coverage enforcement is demonstrated then reverted: create a scratch `lib/viz/sim/__probe.ts` with an uncalled exported function, run `npx vitest run --coverage`, observe exit code 1 and a line matching `ERROR: Coverage for statements (…%) does not meet "lib/viz/sim/**" threshold (95%)`, quote it in the PR body, delete the scratch file, and confirm `npx vitest run --coverage` returns to exit 0.
- `npx tsc --noEmit` exits 0, `npx eslint . --max-warnings=0` exits 0, `npx prettier --check .` exits 0.
- `git status --porcelain` shows only `vitest.config.mts`, `test/setup.dom.ts`, `test/canvas-recorder.ts` and the tests under `test/` added by this ticket — no `lib/`, `app/`, `components/`, `scripts/`, `content/`, `public/`, `e2e/` or `.github/` path, and no change to `package.json` or `package-lock.json`.

### At-merge gate

- `ci-ok` is green on the exact PR head, with KW-001's `unit` job green against the merged `vitest.config.mts`.
- `git diff --name-only origin/main...HEAD` contains no entry under `package.json`, `package-lock.json`, `tsconfig.json`, `.github/`, `lib/`, `app/`, `components/`, `scripts/`, `content/`, `public/` or `e2e/`.
- `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` is green on the PR head.
- The PR body quotes the observed `ERROR: Coverage for … does not meet "lib/viz/sim/**" threshold (95%)` line from the reverted probe, as evidence the floor is live rather than decorative.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence.

## Failure, security, migration, and accessibility cases

**Failure modes and their handling.**

- *A gated directory does not exist yet.* Expected and correct at merge time. The coverage map for the glob is empty, `pct` resolves to the string `"Unknown"`, the numeric comparison is false, and the run passes. Verified by execution. Do not add placeholder files to `lib/viz/sim/` or `lib/bundle/` to "make coverage real" — those are KW-008/KW-021/KW-012 surfaces.
- *A selected project matches no test files.* Vitest exits 1 with *"No test files found"*. This is why each of the three projects must ship at least one test in this PR.
- *Chromium is absent.* The `canvas` project fails to launch. Run `npx playwright install chromium` (or `--with-deps` on a bare container) before `npx vitest run`. Do not disable the project to get green.
- *A required devDependency is missing.* Stop; do not amend the frozen `package.json`. See Step 0.
- *`async` Server Components.* Vitest cannot render them. If a component under test is an `async` Server Component, the test belongs in Playwright (KW-023), not in the `dom` project. Do not add a shim.

**Security.** No secrets, no network access and no credentials are involved; the browser runs headless against `about:blank`-scoped test pages. `screenshotFailures: false` stops browser mode from emitting image artefacts that could be mistaken for, or drift against, KW-031's container-produced visual baselines. The three files here are also listed in KW-002's CODEOWNERS gate set (`vitest.config.mts` is named explicitly), so any later PR weakening the config requires code-owner review — that is by design, not an obstacle.

**Migration.** None. There is no prior test framework, no snapshot corpus and no CI history to preserve; `git ls-files` at the researched commit shows nothing to migrate.

**Accessibility.** No user-facing surface is added or changed by this ticket. The accessibility gate itself is KW-029, which will add `e2e/a11y.spec.ts` and a visually-hidden `<table>` alternative; the `dom` project created here is the runner those component-level `toHaveAccessibleName` assertions will execute in, which is the only accessibility-relevant obligation this ticket carries — the `@testing-library/jest-dom` matcher registration in `test/setup.dom.ts` must not be omitted.

## Surfaces

- Reads: package.json, package-lock.json, tsconfig.json, .github/workflows/ci.yml, docs/research/2026-07-31-ci-testing.md, docs/research/2026-07-31-decomposition-synthesis.md
- Writes: vitest.config.mts, test/setup.dom.ts, test/canvas-recorder.ts
- Contracts: vitest:project-names, vitest:test-file-naming, vitest:coverage-thresholds, test/canvas-recorder.ts#recordContext
- Safety: vitest:coverage-floor

## Sibling boundaries and open gates

**Upstream.** KW-001 is the only hard dependency. It owns `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`, `.nvmrc`, `next.config.ts`, `vercel.json`, `scripts/ci/assert-pins.mjs` and `.github/workflows/ci.yml`. This ticket touches none of them.

**Wave-2 siblings (all independent of this ticket; none of their files may appear in this diff).** KW-003 owns `styles/**` and `app/globals.css`. KW-004 owns `public/fonts/**`, `app/fonts.ts`, `components/icons/**`. KW-005 owns `app/layout.tsx`, `app/page.tsx`, `app/regions/**`. KW-006 owns `content/**`. KW-007 owns `lib/viz/tokens/**` and `test/viz/ramp-contrast.test.ts`. KW-008 owns `lib/viz/sim/{types,cursor,rng,state}.ts` and `test/viz/{cursor,rng}.test.ts`. KW-009 owns `scripts/pipeline/{discover,identity}.ts` and `scripts/pipeline/__tests__/**`. KW-010 owns `scripts/pipeline/{calendar,private}.ts`. KW-012 owns `lib/bundle/{schema,codec,frontcode}.ts` and `test/bundle/roundtrip.test.ts`. Their test *files* are theirs; only the *routing rule* is this ticket's.

**Downstream consumers.**

- **KW-023** (Playwright scaffolding) depends on this ticket. It owns `playwright.config.ts`, `e2e/**` and `.github/workflows/e2e.yml`. Running the `canvas` Vitest project inside CI needs a browser-capable runner, which only `e2e.yml` provides; that wiring is KW-023's to add if it chooses. Until then the `canvas` project is proven at the agent gate and by local runs, and CI covers `node` + `dom`. If KW-023 declines it, log it as a deferred finding rather than reopening this ticket.
- **KW-022** (viz render modules) consumes `recordContext` and `drawCallsUnderFilter` from `test/canvas-recorder.ts` to satisfy its own acceptance criterion about `ctx.filter`. The typespec in "Contract and invariants" §C2 is the frozen shape; if KW-022 needs a different one, it opens a change against this ticket rather than editing the file in its own PR.
- **KW-021** (sim reducer) and **KW-012** (bundle codec) are the tickets the two coverage floors will actually bite. They must not lower a threshold to land.
- **KW-029** / **KW-030** / **KW-031** add the a11y, performance and visual-regression gates on top of this runner; none of them may relax `vitest:coverage-floor`.

**Gates.** No human gate blocks this ticket. Two adjacent gates are worth knowing about because they can strand a downstream PR: **GATE-002** (the push credential lacks `workflow` scope) blocks KW-001, KW-023, KW-028 and KW-031 at push time, after the work is done — it does not block this ticket, which writes nothing under `.github/`. **GATE-004** (Vercel Node version and dashboard overrides) is unrelated to the test runner. Neither is a precondition for pickup here.
