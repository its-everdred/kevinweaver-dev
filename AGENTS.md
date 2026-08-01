# AGENTS.md

Instructions for AI coding agents working on **kevinweaver.dev**. This file is the actionable
rules. The full prose, rationale, and examples live in [CONTRIBUTING.md](./CONTRIBUTING.md).
When in doubt, read CONTRIBUTING.md; it is canonical.

Read this file completely before your first tool call. Several of the rules below are things
you cannot discover from the code, and two of them will serialise the entire fleet if you get
them wrong.

## Non-negotiables

These are not preferences. Violating one is a revert, not a review comment.

### npm only

- **npm. Never yarn, never pnpm.** No `yarn add`, no `pnpm install`, no `corepack` invocation,
  no `packageManager` field in `package.json`.
- **Exactly one lockfile: `package-lock.json`.** The repo historically shipped both
  `yarn.lock` and `package-lock.json`. That ambiguity broke package-manager detection: the
  host and CI could resolve different dependency trees from the same commit. It has been fixed.
  **Never reintroduce `yarn.lock`**, and never delete or regenerate `package-lock.json` as a
  side effect of some other change.
- Use `npm ci`, not `npm install`. `npm install` rewrites the lockfile.

### No framework or host changes

- This is a **Next.js App Router app deployed on Vercel**, and it stays that way. The apex
  domain already resolves to Vercel.
- Do not introduce Astro, Vite, Remix, Netlify, Cloudflare Pages, or any other framework or
  host. Do not add a second bundler. Do not switch to the Pages Router. Do not add
  `output: 'export'`.
- Infrastructure is out of scope for every ticket. If a ticket appears to require an
  infrastructure change, that is a mis-scoped ticket: escalate.

### The frozen manifest

**`package.json` and `package-lock.json` are FROZEN.** The foundation ticket pre-installed the
full measured dependency set and pre-declared every npm script precisely so that no later
ticket has to touch either file.

- Do not add, remove, or bump a dependency.
- Do not add or rename an npm script.
- Do not edit `engines`, or any other field.

The reason is throughput, not fussiness: tickets run concurrently, and every agent that edits
the lockfile forces every other agent to serialise behind a lockfile conflict. One casual
`npm i` costs the whole fleet a wave.

**If your ticket genuinely needs a dependency that is not installed, stop and escalate.** Say
what you need, why the installed set does not cover it, and what the fallback is. Do not add it
and do not vendor a copy of it into `lib/`.

### The gate contract

This exact sequence must be green before you open a PR:

```bash
npm ci && npm run typecheck && npm run lint && npm run test && npm run build
```

- **`npm run build` is the most important one.** A failed Next build breaks the deployed site.
  Never open a PR whose build fails, and never open one you have not built.
- `npm run typecheck` already runs `next typegen` first. Do not run `tsc --noEmit` alone; the
  generated route types will not exist.
- Zero new lint warnings, zero new TypeScript errors. The baseline only goes down.
- In an aiur workspace, npm comes from mise: prefix with `mise exec --`. `node_modules` is
  pre-populated by the warm base, so prefer plain `npm run <script>` and reach for `npm ci`
  only when you have actually changed the lockfile, which you should not be doing.
- Do not gate PR-opening on unrelated suite flakes. CI runs the authoritative full suite on
  every PR; the aggregate `ci-ok` check is the required status.

### Branch and base

- **Your branch is `aiur/<issue-number>` or `aiur/<issue-number>-<short-slug>`.** Read it with
  `git branch --show-current`. **Never reconstruct the ref** from the issue number; the slug is
  generated and you will guess it wrong.
- **The base branch is `main`, read from `$AIUR_BASE_BRANCH`.** That environment value is the
  authoritative configured base. **Never infer it from `origin/HEAD`**, never hard-code it,
  never take it from a stale PR. Open the PR with `--base "$AIUR_BASE_BRANCH"`.
- Before CI handoff, verify an existing PR's `baseRefName`. Leave a correct base unchanged, or
  retarget only its `base` and re-fetch to verify the repair.
- Before integrating the base into an existing feature branch, record the pre-integration head
  and push a rescue ref. Resolve conflicts hunk by hunk. Never resolve a conflicted file
  wholesale with `--ours`, `--theirs`, `git checkout <base> -- <file>`, or by resetting the
  feature branch to the base. Before pushing, compare
  `git diff --stat origin/$AIUR_BASE_BRANCH...HEAD` against the prior PR scope and prove the
  intended diff survives. If it shrinks unexpectedly, stop, restore from the rescue ref, and
  alert the Executor instead of pushing.

### Commit messages

**3 to 7 words, imperative mood, subject line only.**

**Never mention Claude, Codex, AI, or assistant co-authorship in a commit message or a PR
body.** No `Co-Authored-By` trailers for tooling. No "generated with" footers. No "as an AI"
anything.

This repository's git history is public and is itself displayed by the site. A commit message
is shipped content. Write it like content.

Do not put ticket IDs (`KW-014`) in commit messages, comments, test names, or docs. Link the
real GitHub issue if the context is useful.

### Write-surface discipline

Tickets run in parallel and **each owns a disjoint set of files**. Your ticket document names
your write surface.

- **Do not edit a file another ticket owns**, even to fix something obviously broken in it.
  Even a one-line fix. Even if it would take ten seconds.
- If a file you need is owned by another ticket, either stub against its declared contract and
  note the dependency, or escalate. Both are cheaper than a merge conflict in a shared file.
- If you discover a real defect outside your surface, record it and report it. Do not fix it.
- The corollary: stay inside your surface even when a refactor is tempting. A drive-by
  improvement in a file you do not own is a merge conflict with someone else's wave.

### Self-review

Once your change is complete and pushed, run **`/ce-code-review`** on your own diff and resolve
what it finds. Fix real defects; for anything you consciously reject, record the reason in the
Agent Workpad. The Executor reviews *after* you have, so arriving unreviewed wastes a review
cycle. Do not move to `agent:ci-wait` until this has run.

## Repo at a glance

- **Single package, npm, no monorepo, no workspaces.** No nx, no changesets, nothing published
  to a registry.
- **Node 24.x** (`engines.node`).
- **Stack**: Next 16.2.12 (App Router), React 19.2.8, TypeScript 6.0.3, ESLint 9.39.5,
  Tailwind 4.3.3, Prettier 3.9.6, Vitest 4.1.10, Playwright 1.62.1.
  ESLint is 9.x, not 10.x, and that is deliberate: `eslint-config-next@16.2.12` declares
  `eslint: ">=9.0.0"` but depends on `eslint-plugin-react@^7.37.0`, which peers at `^9.7`
  and calls the `context.getFilename()` API ESLint 10 removed. ESLint 10 installs cleanly
  and then throws at lint time. See the comment in `eslint.config.mjs`.
- **CI**: GitHub Actions. **Host**: Vercel, which builds every PR as a preview deployment.
- **What it is**: Kevin Weaver's personal site, simultaneously a resume and a live dashboard of
  what he is working on. Audience is engineer peers and the OSS community.

Layout (directories appear as the rewrite lands; do not invent a parallel one):

```text
app/           App Router: layout, page, route handlers, region components
components/    Shared presentational components
lib/           Pure logic. DOM-free, framework-free, unit-tested.
scripts/       Node scripts: the data pipeline, CI helpers
styles/        Vendored design system and Tailwind token bridge
e2e/           Playwright specs
test/          Vitest specs
docs/design/   Authoritative design system and page comp
docs/research/ Measured research evidence, marked (M) or (I)
public/        Static assets and the generated data payload
```

Scripts that exist, in full. If a command is not here, it does not exist:

`dev` `build` `start` `lint` `format` `format:check` `typegen` `typecheck` `test` `test:unit`
`test:watch` `test:e2e` `data:build` `size`

## Hard rules

The bullets below are the rules. Each links to the section in CONTRIBUTING.md with the *why*.

### [Testing](./CONTRIBUTING.md#testing)

- Every new feature ships with tests. The PR doesn't merge until CI is green.
- Unit tests (`npm run test`) for logic; end-to-end tests (`npm run test:e2e`) for rendered
  behaviour, accessibility, and visual regression. Most non-trivial changes need both.
- **Pure logic must be DOM-free and unit-tested**: the data codec, the date bucketing, the
  animation state machine. No `document`, `window`, `requestAnimationFrame`, `setTimeout`,
  `Date.now`, or `Math.random` inside `lib/`. Time and randomness are injected parameters.
- Mock at boundaries (the GitHub API, the filesystem, the network, the clock, the RNG).
  **Never mock pure utilities**: encoders, decoders, hashes, bucketing math.
- Determinism is a test requirement. Seed every RNG, inject every clock. A render that is not
  bit-reproducible cannot be screenshot-tested.
- Bug fixes require a regression test that fails without the fix.

### [Reuse before invention](./CONTRIBUTING.md#reuse-before-invention)

- Grep before writing any new utility, component, fixture, or helper.
- Follow neighbour-file naming: `getX` / `buildX` / `resolveX` / `parseX` / `encodeX`.
- **Never invent a hex value.** The design tokens in `docs/design/_ds/*/tokens/*.css` are
  authoritative.
- **Extraction trigger: the second concrete usage, not a speculative first.**

### [Prefer Next and React patterns](./CONTRIBUTING.md#prefer-patterns-set-by-direct-dependencies-especially-nextjs-and-react)

- Server Components by default. `'use client'` on the smallest leaf that needs it, never on a
  layout or page to make one child work.
- Use `next/font`, `next/image`, route handlers, the metadata API. Do not hand-roll what the
  framework ships.
- Caching and headers are configuration in `next.config.ts`, not code scattered across routes.
- Errors: named concrete classes, discriminated via `instanceof`, never by matching `.message`.
- No parallel site-wide base (custom router, custom data layer, global store) without evidence
  of a concrete repeated need.

### [Type safety](./CONTRIBUTING.md#type-safety-and-precision)

- No `any`. Use `unknown` and narrow.
- No unsafe casts (`as Foo`); tighten the upstream type instead. Narrow at the source, not the
  sink.
- **Do not weaken `tsconfig.json`.** `strict`, `noUncheckedIndexedAccess`, and
  `noImplicitOverride` are on deliberately.
- Prefer the narrowest accurate type. Tighten loose types in the same PR you touch them.
- `readonly T[]` for non-mutated collection params. Discriminated unions over
  both-optional-one-required. `import type` for type-only imports. `T | undefined` over
  `T | null`.

### [Structure](./CONTRIBUTING.md#structure)

- Functions at most 20 lines of logic; files at most 200 lines; nesting at most 2 levels. Early
  returns, guard clauses.
- **`lib/` never imports from `app/` or `components/`.** Dependency runs one direction.
- A region component does not reach into a sibling region's internals.
- Keep the exported surface small.

### [Readability](./CONTRIBUTING.md#readability)

- Clear names beat clever tricks. Comments explain **why**, not **what**.
- New or changed inline `//` comments should be concise and usually one line.
- No ticket IDs like `KW-014` in comments, test names, or docs.
- Delete dead code, unused imports, and commented-out blocks as you encounter them.
- `const` over `let`; never `var`. Async/await over promise chains.
- **No em-dashes in code comments, JSDoc, or repo docs.** Use commas, colons, semicolons,
  periods, or parentheses instead.

### [Documentation](./CONTRIBUTING.md#documentation)

- JSDoc every exported function, component, and type whose contract is not obvious from the
  signature: `@description` / `@param` / `@returns` / `@throws`.
- Do not flatten function or component JSDoc into single-line comments.
- Don't restate types in prose. Add semantics, units, preconditions.
- Update docs in the same commit as behaviour changes. Stale docs are worse than missing ones.
- In `docs/research/`, mark measured claims **(M)** and inferred claims **(I)**. An unmarked
  number is a future bug. If you measure something that contradicts a research doc, correct the
  doc and say what you ran.

### [Error handling](./CONTRIBUTING.md#error-handling)

- Throw named concrete error classes; callers discriminate via `instanceof`.
- Validate external data at the boundary with `zod`: API responses, the generated payload.
  Internal code trusts internal code.
- Never `try { } catch {}` without rethrow, log, or recovery. Never
  `throw new Error(err.message)`; preserve `cause`.
- **A data failure must not blank the page.** Static resume content renders even when the live
  payload is missing, stale, or malformed.

### [Performance and async](./CONTRIBUTING.md#performance-and-async)

- Batch with `Promise.all`. Never sequential awaits in a loop.
- Respect the bundle budgets: `npm run size` is the gate.
- Clean up listeners, `requestAnimationFrame` loops, subscriptions, and `AbortController`s.
  Canvas work leaks fast without this.
- Magic numbers and strings become named constants.

### [Accessibility](./CONTRIBUTING.md#accessibility)

- Accessibility ships with the feature; it is not a polish pass.
- Keyboard operable, with a visible `:focus-visible` state.
- Canvas needs a DOM text alternative carrying the same information.
- Honour `prefers-reduced-motion: reduce`. No horizontal scroll at 320 px.

### [Security](./CONTRIBUTING.md#security)

- Never log, persist, or commit secrets. Tokens come from the environment or Actions secrets.
- Workflows declare `permissions:` per job. Never rely on the repository-wide default.
- No `eval`, no `new Function`, no dynamic code generation in production paths.
- A third-party script is a reviewed decision, not a default.

### [Dependencies](./CONTRIBUTING.md#dependency-hygiene)

- `package.json` and `package-lock.json` are frozen. Escalate; do not install.
- Exactly one lockfile. Never `yarn.lock`.
- Do not vendor a library into `lib/` to route around the freeze.

### [Data and route contracts](./CONTRIBUTING.md#data-and-route-contracts)

- The payload schema is shared by producer and consumer and covered by a round-trip test.
  Changing the shape means changing both sides in one PR.
- **No contribution figure is a literal anywhere in copy.** Every number reads from the payload.
- A live URL is a contract. Removing or renaming one needs a redirect.

### [Enforcement](./CONTRIBUTING.md#enforcement)

- `// eslint-disable` requires a reviewer-approved justification.
- Intentional shortcuts under deadline pressure leave `// TODO(@handle):` with a linked issue.
- Green CI plus a red Vercel preview is still a red PR.

## Workflow

1. Read the ticket and its declared write surface before touching anything.
2. Confirm your branch with `git branch --show-current`. Do not reconstruct it.
3. Keep changes small. Add tests for the logic you introduce.
4. Run the gate:
   `npm ci && npm run typecheck && npm run lint && npm run test && npm run build`.
5. Commit in 3 to 7 imperative words. No AI attribution anywhere.
6. Push to `origin` and open a draft PR with `--base "$AIUR_BASE_BRANCH"`.
7. Run `/ce-code-review` on your own diff and resolve the findings.
8. Move to `agent:ci-wait` and end the turn. Do not loop on `gh pr checks`; the daemon delivers
   CI context. On pass, mark ready and move to `agent:human-review`. On failure, use the
   delivered checks and begin rework.

For test-only tickets that explicitly say not to change code, do not create commits or PRs.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow, review norms, and the definition
of done.

## When you don't know

- Read neighbour files before writing a new one.
- Use the framework's idiom before inventing one.
- Duplicate once before you abstract. The second usage triggers extraction.
- Check whether a claim you are relying on is marked **(M)** or **(I)** in `docs/research/`.
  Inference is not evidence; measure before you build on it.
- If the answer would require a new dependency, an infrastructure change, a product decision,
  or an edit outside your write surface: **escalate**. Those four are the Executor's calls, not
  yours.
- Otherwise read [CONTRIBUTING.md](./CONTRIBUTING.md) for the rationale, then choose the option
  that keeps the site small, fast, and easy to change.
