# KW-001 — Foundation: toolchain re-scaffold and green CI gate

**Kind:** executable

**Provenance:** planned in plan v1

**Complexity:** 4 — Intrinsically indivisible. C-4 proves Next and Tailwind/PostCSS must move as one change; C-14 proves the `yarn.lock` deletion and the `package-lock.json` regeneration must land in the same commit; and the fleet cannot merge anything until a CI gate exists. Every proposed subdivision leaves `main` red.

**Risk:** high — this is the only ticket that can break the production deployment, it is the sole bootstrap of the CI gate, and its `package-lock.json` is copied into every agent workspace by aiur prewarm.

**Phase hint:** 1

**Depends on:** none

**Serializes with:** none

**Requirements:** REQ-001, REQ-002, REQ-003

**Decisions:** DEC-001, DEC-002, DEC-003

**Gates:** GATE-001, GATE-002, GATE-004, GATE-006

**Workstream:** platform

**Researched at:** e664d73a195facd64db58ba10952170ff01b4772

## Outcome

On a clean clone of the merged branch, `npm ci && npm run typegen && npm run typecheck && npm run lint && npm run build` exits 0 on Node 24, `next build` prerenders a blank-but-Tailwind-styled App Router page, and `.github/workflows/ci.yml` publishes a single `ci-ok` status context on every pull request — green even when every expensive job is skipped.

## Context and evidence

The repository has not been pushed since 2021-05-31. It is a `create-next-app --example with-tailwindcss` scaffold: `next: "latest"` (resolved 10.1.3), React 17, Tailwind 2 with the dead `@tailwindcss/jit@0.1.3`, ESLint 7 with a `.eslintrc.js`, Pages Router, and **both** `yarn.lock` and `package-lock.json` committed.

**The current tree cannot build on any Node runtime Vercel offers.** The vercel track's verifier extracted `main` with `git archive`, installed from the committed `yarn.lock`, and ran `next build` under four Node majors: 16.20.2 succeeds; 20.19.5, 22.14.0 and 24.18.0 all fail identically with

```
Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './lib/parser' is not defined by
"exports" in node_modules/next/node_modules/postcss/package.json
    at (…/next/dist/compiled/postcss-scss/scss-syntax.js:1:11590)
```

`next@10.1.3` pins `postcss@8.1.7`, whose `exports` map uses the folder mapping `"./":"./"` (Node DEP0148), which modern Node no longer honours. This happens during config load, before webpack is constructed. **C-4** records the consequences: the widely-cited `NODE_OPTIONS=--openssl-legacy-provider` mitigation is inert (re-run with the flag produces byte-identical output) and must not appear anywhere in this repo; and a cheaper `next@14.2.35 + react@18.3.1` hop clears this error only to die later in the PostCSS pipeline on `styles/globals.scss`, because `@tailwindcss/jit@0.1.3` is incompatible with the bundled PostCSS. **The toolchain must move as one unit.** That is **DEC-001** (one foundation ticket) and **DEC-002** (Next 16.2.12 + React 19.2.8 + Tailwind 4.3.3 + TypeScript 5.9.3 + ESLint 9.39.5 + App Router, no `output: 'export'`).

**C-14** is the second half of the indivisibility argument. Vercel's package-manager detection is measured from source (`packages/build-utils/src/fs/run-user-scripts.ts`, priority `bun+yarn > yarn > pnpm > npm > bun > vlt`): `yarn.lock` wins and `package-lock.json` is ignored entirely. The committed `package-lock.json` is stale — its `packages[""]` lists only `next`, `react`, `react-dom`, and is missing `@heroicons/react`, `react-typing-effect` and `sass`. So deleting `yarn.lock` without regenerating the npm lockfile in the same commit produces a red build, and regenerating without deleting produces a no-op. The same correction refutes the `packageManager` field: `usingCorepack()` returns false unless `ENABLE_EXPERIMENTAL_COREPACK=1`, and when opted in `validateCorepackPackageManager` *throws* on mismatch. **Deleting `yarn.lock` is the only thing that switches the package manager.**

**C-15** fixes two version traps that this ticket's CI must enforce rather than merely document. `typescript@latest` is **7.0.2**, the native rewrite: its tarball ships no `lib/typescript.js` and no `main`, so `require('typescript')` returns `{ version, versionMajorMinor }` and nothing else. npm installs it with **zero** ERESOLVE errors because `typescript-eslint` nests under `eslint-config-next`; the failure surfaces much later as `typescript-eslint does not support TS 7.0` at ESLint config-load. And `eslint@10.8.0` breaks `eslint-plugin-react@7.37.x` (`TypeError: contextOrFilename.getFilename is not a function`), which `eslint-config-next@16.2.12` depends on — so the pin is **9.39.5**, not 10.x. Both facts mean `scripts/ci/assert-pins.mjs` must run **before** `eslint`, not alongside it. C-15 also records that Next 16 ships `next typegen` and it must run **before** `tsc --noEmit` or typed-route checks fail.

**DEC-003** is the parallelism decision. `package.json` and `package-lock.json` are **frozen** after this ticket. Roughly seven downstream tickets would otherwise each edit both files, forcing `serializes_with` edges across the two widest waves and collapsing the fleet to serial execution. This ticket therefore pre-installs the entire measured dependency set and pre-declares every npm script that any later ticket needs. GT-14 also matters here: aiur does not use git worktrees; each agent gets a full clone materialized copy-on-write from a prewarm base that runs `npm ci`. If this lockfile is wrong, **every** subsequent agent workspace is poisoned.

Ground truth used by this ticket: **GT-10** (the `gh` token scopes are `admin:public_key, gist, read:org, repo` — no `workflow`), **GT-11** (zero rulesets, zero workflows, `owner_type: User`, `plan: null`), **GT-14** (`.aiur/config` gives complexity 4 no elevated turn budget), and the ci-testing ground state (no `.github` directory at all; no `vercel.json`, `.nvmrc` or `tsconfig.json`).

Requirements this ticket satisfies:

- **REQ-001** — the site must build and deploy on a currently supported Next.js and Node runtime. Measured: the tree at `researched_at_commit` cannot build on any Node version Vercel offers.
- **REQ-002** — every pull request must be gated by an automated status check that always reports, before autonomous agents author application code.
- **REQ-003** — the dependency surface must be declared once and frozen, so the remaining thirty-one tickets can run in parallel without lockfile conflicts.

Gates in play:

- **GATE-001** (HG-1) — push `origin/main`. Closed: `origin` was switched to HTTPS and `main` now carries the design system, research and `.aiur/`. `origin/main` is `e664d73a195facd64db58ba10952170ff01b4772`.
- **GATE-002** (HG-2) — the push credential lacks `workflow` scope. GitHub rejects any HTTPS push that creates or modifies `.github/workflows/**`. **This fails at push time, after all the work is done.** Check it before starting.
- **GATE-004** (HG-4) — the Vercel project's Node version, plan tier, auto-promotion setting, and whether a dashboard Root-Directory / build-command / install-command override exists are dashboard-only facts. `engines.node` in `package.json` is the one override reachable from the repo, and this ticket sets it.
- **GATE-006** (HG-6) — reclassified from a human gate to a merge *condition*. No `ci-ok` context can exist for the PR that ships `ci-ok`, so this PR merges on verified-local-green evidence: the full command chain executed and observed, plus code review. Every ticket after this one requires the real `ci-ok` status.

Plan-context navigation, pinned to planning commit `e664d73a195facd64db58ba10952170ff01b4772`:

- Pack index — `docs/build-orders/site-rewrite/README.md`
- Wave diagram, verified topological levels, critical path, write-surface partition proof — `docs/research/2026-07-31-decomposition-synthesis.md` §6
- Decision registry (D-01…D-17) and human gates (HG-1…HG-7) — same document, §3 and §4
- This ticket's implementation pointers — same document, §5, entry "KW-01"
- Supporting tracks — `docs/research/2026-07-31-nextjs-upgrade.md` (§4, §8, §9 plus VC-2/VC-3/VC-5), `docs/research/2026-07-31-ci-testing.md` (§1, §2, §3.1, §3.2 plus C1/C2), `docs/research/2026-07-31-vercel-platform.md` (§7, §8 plus C1/C4)
- Browse them at `https://github.com/its-everdred/kevinweaver-dev/tree/e664d73a195facd64db58ba10952170ff01b4772/docs/research/`

Where a track's `## Verification corrections` section contradicts the body of its own document, **the correction wins**. Every pin below is a corrected value.

## Scope

- Replace the Next 10.1.3 / React 17 / Tailwind 2 / ESLint 7 toolchain with the measured pin set in one atomic change, and rename `package.json` `name` from `with-tailwindcss` to `kevinweaver-dev`.
- Delete `yarn.lock` and regenerate `package-lock.json` (lockfileVersion 3) from the corrected `package.json` in the same commit, leaving exactly one lockfile.
- Pre-install the entire measured downstream dependency set and pre-declare every npm script, freezing `package.json` and `package-lock.json` for the remainder of the build order.
- Scaffold a minimal App Router root — `app/layout.tsx`, `app/page.tsx`, `app/globals.css` containing only `@import "tailwindcss";` — that prerenders a blank-but-styled page.
- Delete the dead Pages Router surface and the v2-era config files it depends on.
- Add `scripts/ci/assert-pins.mjs`, a dependency-free Node script that fails the build on toolchain drift, and run it before `eslint` in CI.
- Add `.github/workflows/ci.yml` with a `changes` job, `if:`-skipped expensive jobs, and one always-running `ci-ok` aggregator that is the sole required status context.
- Add `vercel.json` with `framework`, `installCommand`, and cache-control headers for `/data/v1/*`, plus `engines.node: "24.x"` in `package.json`.

## Non-goals

- No design-system CSS, no gruvbox tokens, no `@theme inline` bridge, no accessibility layer — KW-003 owns the contents of `app/globals.css` and all of `styles/**` from wave 2 onward.
- No fonts and no icon components — KW-004 owns `public/fonts/**`, `app/fonts.ts` and `components/icons/**`.
- No region components, no `app/regions/**`, no `components/ds/**`, and no real page composition — KW-005 owns the shell contract and the seven stubs.
- No content strings, no resume data, no `content/**` — KW-006.
- No repository governance: no labels, no rulesets, no `CODEOWNERS`, no `AGENTS.md`, no auto-merge or workflow-permission API calls — KW-002 owns all of it and deliberately does not touch `.github/workflows/**`.
- No `vitest.config.mts`, no `playwright.config.ts`, no `.size-limit.json`, no `scripts/ci/check-first-load.mjs`, no `e2e/**`, no `test/**` — KW-011, KW-023, KW-030, KW-031.
- No `.github/workflows/e2e.yml`, `data-bundle.yml` or `snapshots.yml` — KW-023, KW-028, KW-031.
- No `NODE_OPTIONS=--openssl-legacy-provider`, no `packageManager` field, no `output: 'export'`, and no incremental Next version hops.

## Existing owner and reuse target

There is no upstream ticket. Everything this ticket edits or deletes exists **today** at `researched_at_commit` `e664d73a195facd64db58ba10952170ff01b4772`. Verified present with `git ls-tree -r --name-only origin/main`:

| Path | Current state | Action |
|---|---|---|
| `package.json` | `name: "with-tailwindcss"`, `next: "latest"`, react 17, Tailwind 2, ESLint 7, `"lint": "eslint . --ext .js"` | rewrite |
| `package-lock.json` | lockfileVersion 2, last touched 2021-04-03, missing three declared deps | regenerate |
| `yarn.lock` | last touched 2021-05-30, pins `next@latest → 10.1.3` | delete |
| `pages/index.js`, `pages/_app.js`, `pages/api/hello.js` | Pages Router; `/api/hello` serves `x-vercel-error: FUNCTION_RUNTIME_DEPRECATED` in production | delete |
| `components/HomeHero.js` (167 lines), `components/Timeline.js`, `components/WriteCode.js` | `WriteCode` is commented out in JSX but still imported at `pages/index.js:3`, so it is still bundled | delete |
| `styles/globals.scss` (22 lines) | SCSS, `@tailwind base/components/utilities`, nested `@keyframes` | delete |
| `tailwind.config.js` | stock v2 `purge` / `darkMode: false` / `variants` | delete |
| `postcss.config.js` (8 lines) | `{ '@tailwindcss/jit': {}, autoprefixer: {} }` | delete, replaced by `postcss.config.mjs` |
| `.eslintrc.js` | eslint-7-era eslintrc with `plugin:react/recommended` | delete, replaced by `eslint.config.mjs` |
| `public/vercel.svg` | template leftover | delete |
| `.gitignore` | 2021 create-next-app default | extend |

Absent today and created by this ticket: `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.nvmrc`, `vercel.json`, `app/**`, `scripts/ci/assert-pins.mjs`, and the entire `.github/` directory.

Keep: `public/favicon.ico`, `public/images/**` (`kevin.png` is load-bearing for KW-022's sprite extraction), `.aiur/**`, `docs/**`, `README.md`.

## Contract and invariants

This ticket is a producer for every other ticket in the build order. Four seams are frozen here.

**Seam 1 — the npm script contract.** Every downstream ticket invokes these and none of them may add, rename or remove one. `package.json` is frozen after merge (DEC-003).

```jsonc
{
  "scripts": {
    "dev":       "next dev",
    "build":     "next build",
    "start":     "next start",
    "lint":      "eslint . --max-warnings=0",
    "format":    "prettier --check .",
    "typegen":   "next typegen",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run --passWithNoTests",
    "test:e2e":  "playwright test",
    "data:build":"tsx scripts/pipeline/build.ts",
    "size":      "size-limit"
  }
}
```

`--passWithNoTests` is load-bearing: `test:unit` must be green at merge time, when no test file and no `vitest.config.mts` exist yet. Measured: `vitest run --passWithNoTests` exits 0 with no test files, and `vitest run --passWithNoTests -t codec` exits 0 when a filter matches nothing. KW-011 later adds `vitest.config.mts` with the `node` / `dom` / `browser` projects; project selection lives in that config file, **never** in `ci.yml`, because `ci.yml` is frozen to this ticket.

**Seam 2 — the CI job-name contract.** `.github/workflows/ci.yml` is written once, here, and never edited by a sibling. Job names are a contract because KW-011 is specified as "wired into `ci.yml`'s existing `unit` job slot". The jobs are `changes`, `install`, `lint`, `typecheck`, `unit`, `build`, `data-contract`, `ci-ok`. `ci-ok` is the **only** context branch protection names.

Downstream gates that need to appear inside `ci.yml` are pre-wired as **file-existence-guarded slots**. A sibling activates a gate by adding its own file; it never edits `ci.yml`:

```bash
if [ -f .size-limit.json ]; then npm run size; else echo "no .size-limit.json yet — skipping"; fi
```

**Seam 3 — the toolchain pin contract.** `scripts/ci/assert-pins.mjs` is the executable form of DEC-002 and DEC-003. Its `EXACT_PINS` table is the single source of truth for the ten load-bearing versions; a later ticket that needs a new dependency must open a follow-up against this ticket's owner rather than editing `package.json` in its own PR.

**Seam 4 — the data cache-control contract.** `vercel.json` forward-declares headers for the paths KW-012 specifies and KW-014 emits under `public/data/v1/`. Unmatched `source` patterns are inert, so declaring them before the files exist is safe:

```jsonc
// KW-012's file layout, quoted verbatim by vercel.json's header rules:
//   public/data/v1/manifest.json     -> short cache; carries generatedAt/windowStart/windowEnd/dayCount
//   public/data/v1/repos.json        -> daily
//   public/data/v1/grid.json         -> daily
//   public/data/v1/events/ee-NN.json -> content-stable within a v1 generation
//   public/data/v1/paths/pd-NN.json  -> content-stable within a v1 generation
```

**Invariants that must hold after this ticket and forever after.**

1. Exactly one lockfile exists, and it is `package-lock.json` at lockfileVersion 3.
2. No dependency specifier is a floating tag (`latest`, `next`, `*`, `canary`, `beta`) or a caret/tilde range. Every version is exact.
3. `package.json` has no `packageManager` key.
4. `package.json` declares `"engines": { "node": "24.x" }` and `.nvmrc` contains exactly `24`.
5. `npm run typegen` runs before `npm run typecheck` in every automated path.
6. `node scripts/ci/assert-pins.mjs` runs before `eslint` in every automated path.
7. `ci.yml` has no `paths-ignore` and no `merge_group:` trigger.
8. `git status --porcelain` is empty after a full local chain run.

## Refreshable implementation notes

Re-verify against `researched_at_commit` `e664d73a195facd64db58ba10952170ff01b4772` at pickup. Every file below was built and run end-to-end on Node 24.18.0 / npm 11.16.0 on 2026-07-31; the whole chain exits 0.

### Order of operations

Do this in one commit. Any intermediate state is red, which is the entire justification for complexity 4.

```bash
git rm -r pages
git rm components/HomeHero.js components/Timeline.js components/WriteCode.js
git rm styles/globals.scss tailwind.config.js postcss.config.js .eslintrc.js public/vercel.svg
git rm yarn.lock package-lock.json
# write package.json, then:
npm install --no-audit --no-fund      # regenerates package-lock.json at lockfileVersion 3
```

### `package.json`

```json
{
  "name": "kevinweaver-dev",
  "version": "0.0.0",
  "private": true,
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --check .",
    "typegen": "next typegen",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run --passWithNoTests",
    "test:e2e": "playwright test",
    "data:build": "tsx scripts/pipeline/build.ts",
    "size": "size-limit"
  },
  "dependencies": {
    "next": "16.2.12",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "d3-hierarchy": "3.1.2",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.12.1",
    "@octokit/graphql": "9.0.3",
    "@playwright/test": "1.62.1",
    "@size-limit/file": "13.0.3",
    "@tailwindcss/postcss": "4.3.3",
    "@testing-library/react": "16.3.2",
    "@types/d3-hierarchy": "3.1.7",
    "@types/node": "26.1.2",
    "@types/react": "19.2.18",
    "@types/react-dom": "19.2.4",
    "@vitejs/plugin-react": "6.0.5",
    "@vitest/browser": "4.1.10",
    "@vitest/coverage-v8": "4.1.10",
    "eslint": "9.39.5",
    "eslint-config-next": "16.2.12",
    "happy-dom": "20.11.1",
    "postcss": "8.5.25",
    "prettier": "3.9.6",
    "prettier-plugin-tailwindcss": "0.8.1",
    "size-limit": "13.0.3",
    "tailwindcss": "4.3.3",
    "tsx": "4.23.1",
    "typescript": "5.9.3",
    "vitest": "4.1.10"
  }
}
```

Every version above was re-confirmed with `npm view <pkg> version` on 2026-07-31. Three are deliberately **not** `latest`: `typescript` (latest is 7.0.2), `eslint` (latest is 10.8.0), `@types/node` matches the Node 24 line via its own release train. `autoprefixer` and `postcss-import` are **not** installed — Tailwind v4 has both built in. `sass`, `@heroicons/react` and `react-typing-effect` are dropped entirely.

Measured: this exact manifest installs with **zero ERESOLVE errors** and produces `lockfileVersion: 3`.

### `.nvmrc`

```
24
```

Vercel offers only 24.x (default), 22.x and 20.x, and Node 20 is deprecated 2026-10-01. `engines.node` overrides the Vercel project setting, which is why it is the mitigation for GATE-004.

### `tsconfig.json`

**Measured trap:** `next typegen` and `next build` **rewrite `tsconfig.json` in place**. On a hand-written config they set `"jsx": "react-jsx"` (mandatory), re-add `"incremental": true`, and append `".next/dev/types/**/*.ts"` to `include`. Commit the post-typegen form or every CI run leaves a dirty tree.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

Write it with Next's own formatting (arrays expanded, two-space indent) — run `npm run typegen` once and commit whatever it produces. Do **not** try to remove `"incremental": true`; typegen puts it straight back, measured.

### `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

Empty on purpose. No `output: 'export'` (DEC-002): export loses `headers` for the JSON cache-control this build order needs, and loses default-loader optimization of the two remote GitHub avatars. Note the apex→www 308 is a Vercel domain-layer redirect, not a Next `redirects()` entry, so export would not have regressed it — do not use that as the argument.

### `postcss.config.mjs`

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

Exactly one plugin. `autoprefixer` and `postcss-import` are removed, not migrated.

### `eslint.config.mjs`

**Measured trap:** exporting the array literal directly trips `import/no-anonymous-default-export`, which `--max-warnings=0` turns into a failure (`Assign array to a variable before exporting as module default`). Assign to a named const first. This is the prettier-formatted, lint-clean form:

```js
import next from "eslint-config-next";

const config = [{ ignores: [".next/**", "node_modules/**", "out/**", "coverage/**"] }, ...next];

export default config;
```

`next lint` is removed in Next 16 and `next build` no longer lints, so this flat config plus the `lint` script is the only lint path.

### `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

### `.prettierignore`

**Measured trap:** after `next typegen` rewrites `tsconfig.json`, `prettier --check .` fails on it (Next writes expanded arrays that prettier would collapse). Ignore it rather than fighting the ordering.

```
.next/
node_modules/
coverage/
next-env.d.ts
package-lock.json
# rewritten in place by `next typegen` / `next build` in a format prettier rejects
tsconfig.json
```

### `.gitignore` — append

**Measured:** with `"incremental": true` forced by typegen, `tsc --noEmit` writes `tsconfig.tsbuildinfo` at the repository root; `next typegen` writes `next-env.d.ts`; and `.aiur/prewarm` creates `./.aiur-npm-cache` in every agent workspace. All three must be ignored or `git status --porcelain` is never empty.

```gitignore
# typescript
*.tsbuildinfo
next-env.d.ts

# aiur prewarm npm cache (created by .aiur/prewarm)
/.aiur-npm-cache

# test artifacts
/test-results
/playwright-report
/blob-report
```

The write-surface partition assigns `.gitignore` to no ticket, so taking it here creates no conflict.

### `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "kevinweaver.dev" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Keep it content-free. KW-005 replaces the body with the seven region slots; KW-027 appends the real `metadata` export. The `lang="en"` attribute is here because the live site currently has none.

### `app/page.tsx`

```tsx
export default function Page() {
  return <main className="bg-black text-white">kevinweaver.dev</main>;
}
```

The two Tailwind utilities exist only to prove the v4 pipeline emits CSS. Measured: `next build` emits a chunk containing `.bg-black{background-color:var(--color-black)}`.

### `app/globals.css`

```css
@import "tailwindcss";
```

One line, nothing else. KW-003 owns everything that goes into this file afterwards — the design-system imports, the `@theme inline` bridge, and the accessibility layer. Do not add `@theme`, tokens, or `@source` here.

### `vercel.json`

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "installCommand": "npm ci",
  "headers": [
    {
      "source": "/data/v1/manifest.json",
      "headers": [
        {
          "key": "cache-control",
          "value": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400"
        }
      ]
    },
    {
      "source": "/data/v1/repos.json",
      "headers": [
        {
          "key": "cache-control",
          "value": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
        }
      ]
    },
    {
      "source": "/data/v1/grid.json",
      "headers": [
        {
          "key": "cache-control",
          "value": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
        }
      ]
    },
    {
      "source": "/data/v1/events/:file*",
      "headers": [
        {
          "key": "cache-control",
          "value": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
        }
      ]
    },
    {
      "source": "/data/v1/paths/:file*",
      "headers": [
        {
          "key": "cache-control",
          "value": "public, max-age=0, s-maxage=86400, stale-while-revalidate=604800"
        }
      ]
    }
  ]
}
```

No `crons` (DEC-017 puts regeneration on GitHub Actions). No `redirects` — the apex→www 308 is handled at Vercel's domain layer. No `functions.maxDuration` — this project ships no functions after `pages/api/hello.js` is deleted. `installCommand: "npm ci"` is the explicit belt to the `yarn.lock` deletion's braces; note that a dashboard install-command override would silently defeat it, which is GATE-004.

### `scripts/ci/assert-pins.mjs`

Dependency-free, Node built-ins only, so it can run before anything else. Verified: exits 0 on the correct tree, exits 1 with a readable list on a drifted one.

```js
#!/usr/bin/env node
/**
 * Toolchain pin guard. Runs BEFORE eslint in CI.
 *
 * Why this exists (measured 2026-07-31):
 *  - `npm i -D typescript` resolves to 7.0.2, the native rewrite. Its tarball has no
 *    lib/typescript.js and no `main`, so `require('typescript')` returns
 *    { version, versionMajorMinor } only. npm installs it with ZERO ERESOLVE errors
 *    (typescript-eslint nests under eslint-config-next), and the failure surfaces
 *    much later as `typescript-eslint does not support TS 7.0` at eslint config-load.
 *  - eslint@10 breaks eslint-plugin-react@7.37.x (`contextOrFilename.getFilename is not
 *    a function`), which eslint-config-next depends on.
 *  - A stray yarn.lock silently switches Vercel's package manager (precedence
 *    bun+yarn > yarn > pnpm > npm, packages/build-utils/src/fs/run-user-scripts.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** name -> exact version that must appear in package.json AND in node_modules */
const EXACT_PINS = {
  next: "16.2.12",
  react: "19.2.8",
  "react-dom": "19.2.8",
  typescript: "5.9.3",
  eslint: "9.39.5",
  "eslint-config-next": "16.2.12",
  tailwindcss: "4.3.3",
  "@tailwindcss/postcss": "4.3.3",
  vitest: "4.1.10",
  "@playwright/test": "1.62.1",
};

const FORBIDDEN_LOCKFILES = ["yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock"];
const FLOATING = new Set(["latest", "next", "*", "", "canary", "beta"]);

const errors = [];
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const pkg = read(path.join(repoRoot, "package.json"));

// 1. exactly one lockfile, and it is npm's
for (const stray of FORBIDDEN_LOCKFILES) {
  if (existsSync(path.join(repoRoot, stray))) {
    errors.push(
      `${stray} must not exist: it outranks package-lock.json in Vercel's package-manager detection`,
    );
  }
}
if (!existsSync(path.join(repoRoot, "package-lock.json"))) {
  errors.push("package-lock.json is missing");
}

// 2. package.json declares exact pins, never ranges, never floating tags
const declared = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
for (const [name, range] of Object.entries(declared)) {
  if (FLOATING.has(range)) errors.push(`${name}: "${range}" is a floating specifier`);
  if (/^[\^~]/.test(range))
    errors.push(`${name}: "${range}" is a range; this repo pins exact versions`);
}
for (const [name, want] of Object.entries(EXACT_PINS)) {
  const got = declared[name];
  if (got === undefined) errors.push(`${name} is not declared in package.json`);
  else if (got !== want)
    errors.push(`${name} must be pinned to "${want}" in package.json, found "${got}"`);
}

// 3. the installed tree agrees with the pins
for (const [name, want] of Object.entries(EXACT_PINS)) {
  const manifest = path.join(repoRoot, "node_modules", name, "package.json");
  if (!existsSync(manifest)) {
    errors.push(`${name} is not installed at node_modules/${name}`);
    continue;
  }
  const got = read(manifest).version;
  if (got !== want) errors.push(`${name}@${got} is installed but ${want} is pinned`);
}

// 4. the typescript-eslint peer window: >=4.8.4 <6.1.0
const tsManifest = path.join(repoRoot, "node_modules", "typescript", "package.json");
if (existsSync(tsManifest)) {
  const major = Number(read(tsManifest).version.split(".")[0]);
  if (!(major >= 5 && major < 6)) {
    errors.push(
      `typescript major ${major} is outside typescript-eslint's peer window >=4.8.4 <6.1.0`,
    );
  }
}

// 5. Node runtime declaration reaches Vercel from the repo (the only override we control)
if (pkg.engines?.node !== "24.x") {
  errors.push(
    `package.json engines.node must be "24.x", found ${JSON.stringify(pkg.engines?.node)}`,
  );
}
const nvmrc = path.join(repoRoot, ".nvmrc");
if (!existsSync(nvmrc)) errors.push(".nvmrc is missing");
else if (readFileSync(nvmrc, "utf8").trim() !== "24") errors.push(".nvmrc must contain exactly 24");

// 6. packageManager is a no-op at best and a hard build failure at worst on Vercel
if (pkg.packageManager !== undefined) {
  errors.push('package.json must not declare "packageManager"');
}

if (errors.length > 0) {
  console.error("assert-pins: toolchain drift detected\n");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`assert-pins: ok (${Object.keys(EXACT_PINS).length} pins verified)`);
```

Worked failure output, produced by deliberately removing two pins:

```
assert-pins: toolchain drift detected

  - vitest is not declared in package.json
  - @playwright/test is not declared in package.json
  - vitest is not installed at node_modules/vitest
  - @playwright/test is not installed at node_modules/@playwright/test
  - package.json engines.node must be "24.x", found undefined
  - .nvmrc is missing
```

### `.github/workflows/ci.yml`

Actions are pinned to the tags measured on 2026-07-31: `actions/checkout@v7.0.1`, `actions/setup-node@v7.0.0`, `actions/cache@v6.1.0`. `ubuntu-24.04` is pinned explicitly rather than `ubuntu-latest` so a runner-image rollover never silently changes behaviour. Note `setup-node@v7` also has a `package-manager-cache` input defaulting to `true`.

```yaml
name: ci

# No `merge_group:` trigger: a merge queue is structurally unavailable on a
# User-owned repository (owner.type "User", plan null), so it can never fire.
#
# NEVER add `paths-ignore` here. `ci-ok` is a required status check; a workflow
# skipped by a path filter never reports its context and the PR deadlocks at
# "Expected — Waiting for status to be reported". Path filtering happens inside
# the `changes` job instead, and `ci-ok` always runs.
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

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
      - uses: actions/checkout@v7.0.1
        with:
          fetch-depth: 0
      - id: f
        shell: bash
        run: |
          set -euo pipefail
          if [ "${{ github.event_name }}" = "pull_request" ]; then
            git fetch --no-tags --depth=1 origin "${{ github.base_ref }}"
            files=$(git diff --name-only "origin/${{ github.base_ref }}...HEAD")
          else
            files=$(git diff --name-only HEAD~1 HEAD || echo "ALL")
          fi
          echo "$files"
          code=false; data=false
          if [ "$files" = "ALL" ] || echo "$files" | grep -qvE '^(docs/|README\.md|LICENSE|AGENTS\.md|\.github/ISSUE_TEMPLATE/)'; then code=true; fi
          if echo "$files" | grep -qE '^(public/data/|scripts/pipeline/|lib/bundle/)'; then data=true; fi
          echo "code=$code" >> "$GITHUB_OUTPUT"
          echo "data=$data" >> "$GITHUB_OUTPUT"

  install:
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      # Must precede every eslint invocation: a typescript@7 tree installs clean and
      # only fails at eslint config-load with an opaque stack trace.
      - name: assert toolchain pins
        run: node scripts/ci/assert-pins.mjs

  lint:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      - run: node scripts/ci/assert-pins.mjs
      - run: npm run lint
      - run: npm run format

  typecheck:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      # `next typegen` before `tsc --noEmit`, or typed-route checks fail.
      - run: npm run typegen
      - run: npm run typecheck

  unit:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      # Green with zero tests today; KW-011 gives this slot real projects and coverage
      # by adding vitest.config.mts, without editing this file.
      - run: npm run test:unit

  build:
    needs: [changes, install]
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      # setup-node caches ~/.npm only; Next's own build cache needs an explicit step.
      - uses: actions/cache@v6.1.0
        with:
          path: .next/cache
          key: next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-${{ hashFiles('**/*.[jt]s', '**/*.[jt]sx', '**/*.css') }}
          restore-keys: |
            next-${{ runner.os }}-${{ hashFiles('package-lock.json') }}-
      - run: npm run typegen
      - run: npm run build
      # Downstream gate slots. KW-030 activates these by ADDING its files.
      # This workflow is owned by KW-001 and must not be edited by a sibling ticket.
      - name: bundle budgets
        run: |
          if [ -f .size-limit.json ]; then npm run size; else echo "no .size-limit.json yet - skipping"; fi
      - name: first-load budget
        run: |
          if [ -f scripts/ci/check-first-load.mjs ]; then node scripts/ci/check-first-load.mjs; else echo "no first-load checker yet - skipping"; fi

  data-contract:
    needs: changes
    if: needs.changes.outputs.data == 'true'
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7.0.1
      - uses: actions/setup-node@v7.0.0
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci --no-audit --fund=false
      - run: npm run test:unit -- -t codec

  # THE single required status check. Always runs, even when everything is skipped.
  # `success()` would be wrong here: a skipped needed-job resolves to `skipped`.
  ci-ok:
    if: always()
    needs: [changes, install, lint, typecheck, unit, build, data-contract]
    runs-on: ubuntu-24.04
    steps:
      - name: gate
        run: |
          echo '${{ toJSON(needs) }}'
          if echo '${{ toJSON(needs) }}' | grep -q '"result": *"failure"'; then exit 1; fi
          if echo '${{ toJSON(needs) }}' | grep -q '"result": *"cancelled"'; then exit 1; fi
          echo "ci ok"
```

Do **not** matrix Node versions: the app ships to exactly one Vercel runtime, and a `[20, 22, 24]` matrix triples minutes to report on runtimes nobody deploys.

### If GATE-002 is still open when you push

The credential's scopes are `admin:public_key, gist, read:org, repo` — no `workflow`. GitHub rejects the HTTPS push the moment the diff touches `.github/workflows/**`, after all the work is done. If `git push` fails with a workflow-scope error: leave the branch intact, report the blocker, and do not attempt to work around it by moving the workflow file. Resolution is `gh auth refresh -s workflow` by the operator.

## Acceptance and verification

### Agent gate

- `npm ci` completes with zero `ERESOLVE` errors and `node -p "require('./package-lock.json').lockfileVersion"` prints `3`.
- `node scripts/ci/assert-pins.mjs` exits 0; after `npm i -D typescript@7.0.2` it exits 1 naming `typescript`, and the tree is restored afterwards.
- `npm run typegen && npm run typecheck && npm run lint && npm run build` exits 0 on Node 24, and `next build` reports the `/` route as prerendered static content.
- `npm run format` and `npm run test:unit` both exit 0.
- `git status --porcelain` is empty after the full chain: no untracked `next-env.d.ts`, no `tsconfig.tsbuildinfo`, no rewritten `tsconfig.json`.
- `git ls-files` matches none of `yarn.lock`, `pages/`, `components/HomeHero.js`, `components/Timeline.js`, `components/WriteCode.js`, `styles/globals.scss`, `tailwind.config.js`, `.eslintrc.js`, `postcss.config.js`, `public/vercel.svg`.
- `node -p "require('./package.json').name"` prints `kevinweaver-dev`, and `node -p "require('./package.json').packageManager"` prints `undefined`.
- `git grep -n "openssl-legacy-provider" -- ':!docs'` returns nothing (the research documents cite it; no source or config file may).
- `git grep -nE "^[[:space:]]*merge_group:" -- .github` and `git grep -nE "^[[:space:]]*paths-ignore:" -- .github` both return nothing (prose comments naming them are fine; keys are not).
- A built CSS chunk under `.next/static` contains a `.bg-black` rule, proving the Tailwind v4 pipeline runs.

### At-merge gate

- The `ci-ok` context appears on the pull request and is green.
- `ci-ok` is green on a docs-only pull request where `changes.outputs.code` is `false` and every expensive job resolves to `skipped`.
- The Vercel preview deployment for the pull request builds green on Node 24 and serves the placeholder page; the previous production deployment is unaffected if it does not.
- No `.github/workflows/*.yml` other than `ci.yml` is added or modified by this pull request.

### Human/manual evidence

None; KW-032 owns feature-level operator evidence. Two operator actions sit outside this ticket's control and are recorded as gates, not as acceptance: GATE-002 (`workflow` scope on the push credential) and GATE-004 (Vercel dashboard Node version, plan tier, auto-promotion, and any Root-Directory / build-command / install-command override).

## Failure, security, migration, and accessibility cases

**Failure — production deploy.** The next push to `main` triggers a production deploy that would fail on the pre-existing tree. Vercel keeps serving the last good deployment when a build fails, so the live site cannot go down as a result of this ticket; the worst case is a stale site plus a red deployment. Validate on the pull request's preview URL before merging.

**Failure — poisoned agent workspaces.** aiur's prewarm runs `npm ci` once against `main` and materializes every agent workspace copy-on-write from the result. A lockfile that resolves but disagrees with `package.json` will make every subsequent ticket fail in a way that looks unrelated to this one. The `npm ci` + `assert-pins` pair in the `install` job is the guard.

**Failure — silent toolchain drift.** `npm i -D typescript` installs 7.0.2 with no error and breaks lint later with an opaque stack trace. `assert-pins.mjs` running before `eslint` converts that into a one-line message.

**Failure — required-check deadlock.** Adding `paths-ignore` to this workflow, or naming any job other than `ci-ok` as the required context, deadlocks every docs-only pull request at "Expected — Waiting for status to be reported" with no workflow-side fix. This is why `ci-ok` uses `if: always()` and a `grep` over `toJSON(needs)` rather than `success()`.

**Security.** `permissions: contents: read` at workflow level; no job requests more. No secrets are referenced. The repository-level `default_workflow_permissions: write` and `can_approve_pull_request_reviews: true` are a live hole, but closing them is KW-002's job — this ticket only ensures its own workflow does not depend on the loose default. Deleting `pages/api/hello.js` removes the last serverless function, which currently answers with `x-vercel-error: FUNCTION_RUNTIME_DEPRECATED`.

**Migration.** One-way and atomic. There is no data to migrate and no consumer of the deleted Pages Router routes; the live site's only reachable route is `/`. The rollback is `git revert` of the single commit.

**Accessibility.** Only one item lands here: `<html lang="en">` in `app/layout.tsx`, because the live site currently ships no `lang` attribute. Everything else — focus rings, `.sr-only`, the reduced-motion stop, the overflow guard, contrast fixes — belongs to KW-003, and heading structure belongs to KW-005. Do not pre-empt them; a placeholder page with no headings is correct at this stage.

## Surfaces

- Reads: docs/research/2026-07-31-decomposition-synthesis.md, docs/research/2026-07-31-nextjs-upgrade.md, docs/research/2026-07-31-ci-testing.md, docs/research/2026-07-31-vercel-platform.md, .aiur/config, .aiur/prewarm
- Writes: package.json, package-lock.json, yarn.lock, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, .prettierrc, .prettierignore, .nvmrc, .gitignore, vercel.json, app/layout.tsx, app/page.tsx, app/globals.css, scripts/ci/assert-pins.mjs, .github/workflows/ci.yml, pages/**, components/HomeHero.js, components/Timeline.js, components/WriteCode.js, styles/globals.scss, tailwind.config.js, .eslintrc.js, postcss.config.js, public/vercel.svg
- Contracts: package.json#scripts, package.json#dependencies, .github/workflows/ci.yml#ci-ok, .github/workflows/ci.yml#unit, vercel.json#headers, scripts/ci/assert-pins.mjs#EXACT_PINS
- Safety: package.json, package-lock.json, .github/workflows/ci.yml

## Sibling boundaries and open gates

**KW-002** is the other wave-1 ticket and runs concurrently. It owns `.github/CODEOWNERS`, `AGENTS.md`, `.github/pull_request_template.md`, `.github/rulesets/main.json` and a set of `gh api` calls. It deliberately does **not** touch `.github/workflows/**`, so the two write surfaces are disjoint and neither blocks the other. KW-002 is the ticket that names `ci-ok` as the required status check; do not attempt branch protection here.

Wave-2 consumers of this ticket, and what each takes:

- **KW-003** takes ownership of `app/globals.css` and creates `styles/**`. Leave the file at one line.
- **KW-004** creates `public/fonts/**`, `app/fonts.ts`, `components/icons/**`.
- **KW-005** rewrites `app/layout.tsx` and `app/page.tsx` and creates `app/regions/**`. Keep both files placeholder-only.
- **KW-006** creates `content/**`.
- **KW-007**, **KW-008**, **KW-012** create `lib/viz/tokens/**`, `lib/viz/sim/**`, `lib/bundle/**`. KW-008 also adds a scoped override block to `eslint.config.mjs`; that is the one sanctioned later edit to a file this ticket creates, and it is a hard-ordered dependent so there is no conflict.
- **KW-009**, **KW-010** create `scripts/pipeline/**`.
- **KW-011** adds `vitest.config.mts` and fills the `unit` job slot. It must not edit `package.json` or `ci.yml`.

Later consumers: **KW-023** adds `.github/workflows/e2e.yml` and `playwright.config.ts`; **KW-028** adds `.github/workflows/data-bundle.yml`; **KW-030** activates the two guarded budget slots by adding `.size-limit.json` and `scripts/ci/check-first-load.mjs`; **KW-031** adds `.github/workflows/snapshots.yml`. None of them edits `ci.yml`, `package.json` or `package-lock.json`.

Open gates that block or condition pickup:

- **GATE-002** — blocks the *push*, not the work. Confirm `gh auth status` lists `workflow` before starting, or expect to finish the ticket and be unable to push it.
- **GATE-004** — cannot be resolved from the repository. `engines.node: "24.x"` and `installCommand: "npm ci"` are the in-repo mitigations; a dashboard install-command or Root-Directory override would silently defeat the latter and is the operator's to check.
- **GATE-006** — this pull request cannot present a `ci-ok` status, because it is the pull request that creates `ci-ok`. It merges on verified-local-green evidence plus code review. Every ticket after this one requires the real status.
- **GATE-001** is closed; `origin/main` carries the research and design system at `e664d73a195facd64db58ba10952170ff01b4772`.
