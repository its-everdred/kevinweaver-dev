# kevinweaver.dev Contributing Guide

kevinweaver.dev is Kevin Weaver's personal site: simultaneously a resume and a dashboard of
what he is working on right now. The audience is engineer peers and the OSS community.

It is a **Next.js App Router app deployed on Vercel**, TypeScript everywhere, npm only.
The hosting and the framework do not change. The repository's git history is public and is
itself part of what the site displays, so the history is an artifact we ship, not scratch space.

## Workflow for Pull Requests

Before making any non-trivial change, open an issue describing the change first. In general,
the smaller the diff the easier it is to review quickly.

Branch off `main`. Human branches are `feat/`, `fix/`, `chore/`, or `docs/` plus a short slug.
Autonomous agents use `aiur/<issue-number>[-slug]`; see [AGENTS.md](./AGENTS.md).

If you are writing a new feature, add appropriate test cases in the same PR.

Unless your PR is ready for immediate review and merging, mark it as draft.

Once ready for review, include a thorough PR description. **Bonus:** add comments to the diff
under the "Files Changed" tab to clarify any sections where reviewers might have questions
about the approach taken.

### Commit messages

**3 to 7 words, imperative mood, subject line only.** No body unless the change genuinely
needs one. This repo does *not* use Conventional Commits; the existing history is the
reference (`Fix gradient`, `Add webkit-mask-image`, `Update background`).

**Never mention Claude, Codex, AI, or assistant co-authorship in a commit message or a PR
body.** No `Co-Authored-By` trailers for tooling, no "generated with" footers. The history is
public and rendered by the site.

Do not put internal ticket IDs (for example `KW-014`) in commit messages, code comments, test
names, or documentation. Link the real GitHub issue when the context is useful.

## Local development

Node **24.x** (`engines.node` in `package.json`) and **npm**. Never yarn, never pnpm.

```bash
npm ci          # always ci, never install, unless you are deliberately changing the lockfile
npm run dev     # next dev
```

Every script that exists:

| Script | What it does |
|---|---|
| `npm run dev` | `next dev` |
| `npm run build` | `next build`. The most important gate. |
| `npm run start` | serve the production build |
| `npm run lint` | `eslint .` |
| `npm run format` | `prettier --write .` |
| `npm run format:check` | `prettier --check .` |
| `npm run typegen` | `next typegen` |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run test` | `vitest run` |
| `npm run test:unit` | `vitest run` |
| `npm run test:watch` | `vitest` |
| `npm run test:e2e` | `playwright test` |
| `npm run data:build` | build the contribution data payload |
| `npm run size` | `size-limit` bundle budgets |

If a command is not in that table, it does not exist. Do not cite one that isn't.

Note that `typecheck` already runs `typegen` first; Next's generated route types must exist
before `tsc` sees them, so never run `tsc --noEmit` on its own in a fresh checkout.

## Project structure

```text
app/          App Router: layout, page, route handlers, region components
components/   Shared presentational components (design-system chrome, icons, viz mounts)
lib/          Pure logic. DOM-free, framework-free, unit-tested.
scripts/      Node scripts: the data pipeline, CI helpers
styles/       The vendored design system and the Tailwind token bridge
e2e/          Playwright specs
test/         Vitest specs for lib/
docs/design/  The authoritative design system and page comp
docs/research/ Measured research evidence
public/       Static assets and the generated data payload
```

Directories appear as the rewrite lands. Do not invent a parallel layout; extend the one above.

Conventions that hold across it:

- **`lib/` never imports from `app/` or `components/`.** Dependency runs one direction only.
- **Pure logic never touches the DOM.** No `document`, `window`, `requestAnimationFrame`,
  `Date.now`, or `Math.random` inside `lib/`. Time and randomness are injected.
- Colocate a module's test with the module's domain, not with the framework.

## Engineering Principles

These principles apply to every PR in this repository. They exist to keep the site small,
fast, idiomatic, and safe to change under a fleet of concurrent agents. New contributors
(human and agent) should read this section before their first PR; reviewers should treat it as
a checklist.

The compact agent-actionable mirror of this section lives in [AGENTS.md](./AGENTS.md). When
the two diverge, this document wins; `AGENTS.md` should be brought back into sync.

### Testing

- Every new feature ships with tests. A feature is "done" only when tests are green locally
  and in CI.
- **Unit tests** prove logic in isolation (`npm run test`). **End-to-end tests** prove the page
  actually renders, stays accessible, and does not regress visually (`npm run test:e2e`). Most
  non-trivial changes need both.
- **Pure logic must be DOM-free and unit-tested.** The data codec, the date bucketing, the
  colour ramp, and the animation state machine are all deliberately written without a DOM so
  they are testable in plain Node. If a module needs a browser to test, it is doing two things.
- **Mock at boundaries**: the GitHub API, the filesystem, the network, the clock, the RNG.
  **Never mock pure utilities** (encoders, decoders, hash functions, bucketing math). Those
  functions are load-bearing for correctness; a mocked encoder can let a broken caller pass
  tests.
- **Determinism is a test requirement, not a nicety.** Seed every RNG, inject every clock. A
  render that is not bit-reproducible cannot be screenshot-tested, and a screenshot test that
  flaps is worse than no screenshot test.
- Tests should be fast and reliable. Flaky tests get fixed or deleted, not retried.
- When you fix a bug, add a regression test that fails without the fix and passes with it. The
  test is what prevents the next contributor from re-introducing the bug.

### Reuse before invention

- **Grep before writing** new utilities, components, fixtures, or helpers. Most domains in this
  repo already have one.
- Extend existing helpers rather than writing a second one with a slightly different name.
- Follow neighbour-file naming. Verbs are `getX` / `buildX` / `resolveX` / `parseX` /
  `encodeX`. Don't introduce new verb prefixes without a reason that survives review.
- The same principle applies to types and to CSS: before adding a new type or a new custom
  property, check whether a sibling already exists or whether tightening an existing one is the
  right move. **Never invent a hex value**; the design tokens are authoritative.
- **Extraction trigger: the second concrete usage, not a speculative first.** Prefer the cost
  of one duplication over the cost of a premature abstraction nobody else follows.

### Prefer patterns set by direct dependencies (especially Next.js and React)

The site is a thin layer over Next's App Router. Where Next has an idiom, use it.

- **Server Components by default.** `'use client'` goes on the smallest leaf that genuinely
  needs interactivity, never on a layout or a page just to make one child work.
- **Use the framework's primitives**: `next/font`, `next/image`, route handlers, the metadata
  API, `generateStaticParams`. Do not hand-roll what the framework ships.
- **Caching and headers are configuration, not code.** Cache-control for generated payloads
  lives in `next.config.ts`, where it can be read in one place.
- **Errors**: named concrete classes. Callers discriminate via `instanceof`, not via
  `error.code` strings or by matching on `.message`.
- **Type safety**: `as const` for token maps and enum-like constants, discriminated unions,
  narrowed props. Let inference do the work.
- When a problem has a Next-native or React-native pattern, **use it**. Don't introduce a
  parallel site-wide base (a custom router, a custom data layer, a global store) without
  evidence of a concrete repeated need.

### Type safety and precision

- **Prefer the narrowest accurate type.** If a value is actually a `Level` from the colour
  ramp, don't type it as `number`. If a value is actually a `RepoId`, don't type it as
  `string`. The compiler can only help to the extent we let it.
- **No unsafe casts.** `as SomeType` hides a runtime contract the compiler can't verify. If you
  find yourself writing `as Foo`, ask whether the upstream return type should be tightened
  instead. Usually it should. Narrow at the source, not the sink.
- **Do not weaken `tsconfig.json`.** `strict`, `noUncheckedIndexedAccess`, and
  `noImplicitOverride` are on deliberately. Fix the code, not the compiler options.
- **Tighten existing types as you touch them.** When editing a file whose types are loose, fix
  it in the same PR. The lint baseline ratchets down; so should the type-laxity baseline.
- **`readonly` on collection parameters** that aren't mutated. Functions that accept arrays
  should declare `readonly T[]` unless they genuinely need to mutate.
- **Discriminated unions beat optional-field combos.** When two sets of fields are mutually
  exclusive, encode that with a `kind` discriminator rather than both-optional-one-required
  patterns. Compiler narrowing and exhaustive `switch` come for free.
- **No `any`.** Forbidden by repo convention. If you need an escape hatch, use `unknown` and
  narrow explicitly. Escape hatches cluster and rot.
- **Type-only imports.** Use `import type` for type-only symbols so the bundler can tree-shake
  them cleanly.
- **Prefer `interface` over `type` for object shapes**; use `type` for unions, intersections,
  and mapped types.
- **Prefer `T | undefined` over `T | null`.** The site has no database nullability to model and
  shouldn't pretend to.

### Structure

- **Single responsibility**: one concern per function, one domain per module. If a function
  needs the word "and" to describe it, split it.
- **Function length**: target 20 lines of logic or fewer. Above that, the function is usually
  doing two things.
- **File length**: target 200 lines or fewer. Above that, look for a natural split.
- **Nesting**: max 2 levels of control flow inside a function. Prefer early returns and guard
  clauses.
- **Component boundaries**: a region component owns its own file and does not reach into a
  sibling region's internals. Shared chrome goes in `components/`, shared logic in `lib/`.
- **Keep the exported surface small.** Only export what another module actually imports.
  Internal helpers stay internal; once exported, they become a maintenance liability.

### Readability

- Clear names beat clever tricks. No one-letter locals outside loop indices.
- Comments explain **why**, not **what**. The code already says what it does.
- Do not rewrite existing comments just to shorten them unless explicitly asked. Leave
  unrelated docs and comments alone.
- New or changed inline `//` comments should be concise and usually one line. If the
  explanation needs structure, tags, or API contract details, use JSDoc instead of a stack of
  inline comments.
- Delete dead code, unused imports, and commented-out blocks as you encounter them. Git history
  is the archive.
- Prefer `const` over `let`; never `var`.
- Use destructuring, optional chaining (`?.`), nullish coalescing (`??`), and template literals
  where they make the code clearer, not to score points.
- Async/await over promise chains. Mixing the two in the same function is a code smell.
- Prefer array methods (`map`, `filter`, `flatMap`, `reduce`) over manual loops when the result
  is clearer.
- **No em-dashes in code comments, JSDoc, or repo documentation.** Rephrase or use commas,
  colons, semicolons, periods, or parentheses. Em-dashes are a tell of LLM-generated prose and
  clutter diffs with non-ASCII punctuation.

### Documentation

- **JSDoc every exported function, component, and type** whose contract is not obvious from the
  signature. Useful tags:
  - `@description`: a one-to-two-line summary that explains *what* and *why*, not *how*.
  - `@param <name>`: per parameter, describing semantics (units, invariants, preconditions).
  - `@returns`: what the caller gets back, including edge cases like `undefined` or empty
    arrays.
  - `@throws`: enumerate every error class or condition the caller might need to handle.
- **Do not flatten function or component JSDoc into single-line comments** just to satisfy
  inline-comment concision.
- **Don't duplicate the code in prose.** `@description` should add information the signature
  doesn't already carry (units, assumptions, call-site expectations), not restate what types
  already say.
- **Cross-reference siblings** with `{@link}` when a function has a related peer.
- **Keep docs current when you edit.** Stale docs are worse than missing ones. When you change
  behaviour, update the JSDoc in the same commit.

### Error handling

- **Throw named concrete error classes** for any failure a caller might need to discriminate.
  Discrimination via `instanceof` is part of the contract; discrimination via string matching
  on `.message` is not.
- **Validate external data at the boundary.** Anything that came off the network (GitHub API
  responses, the generated data payload) is parsed and validated at the point of entry, with
  `zod`, before any other code sees it. Internal code trusts internal code.
- **Don't swallow errors.** A `try { ... } catch {}` with no rethrow, log, or recovery is a
  bug. If the error is genuinely recoverable, document why in a comment.
- **Don't catch and re-`throw new Error(err.message)`**: it discards the original stack and any
  structured fields. Re-throw the original or wrap it in a class that retains `cause`.
- **A data failure must not blank the page.** The resume content is static and must render even
  when the live payload is missing, stale, or malformed. Degrade to the static surface; never
  to a white screen.

### Performance and async

- **Batch.** When fetching multiple things, use `Promise.all`; never sequential awaits in a
  loop.
- **Don't fetch what you don't need.** The payload budget is real and measured; every byte
  shipped to the browser is a byte the visitor pays for.
- **Respect the bundle budgets.** `npm run size` is the gate. A new dependency that moves the
  first-load number needs a justification in the PR description.
- **Cleanup async resources.** Listeners, `requestAnimationFrame` loops, subscriptions, and
  `AbortController`s need explicit teardown paths. Canvas work in particular leaks fast without
  this.
- **Magic numbers and strings** become named constants.

### Accessibility

- Accessibility is a correctness property, not a polish pass. It ships with the feature.
- Every interactive element is reachable and operable by keyboard and has a visible
  `:focus-visible` state.
- Canvas is not accessible on its own. Anything drawn to canvas needs a text alternative in the
  DOM that carries the same information.
- Honour `prefers-reduced-motion: reduce`. Every infinite animation stops under it.
- No horizontal scroll at 320 px. Reflow is a WCAG requirement, not a nice-to-have.

### Security

- **Never log or persist secrets.** API tokens do not belong in logs, error messages, commits,
  or telemetry. They come from the environment or from GitHub Actions secrets, and nowhere else.
- **Least-privilege CI tokens.** Workflows declare `permissions:` per job. Never rely on the
  repository-wide default.
- **Validate external input at the boundary.** A `string` from an API response is not a validated
  identifier until something has checked it.
- **No `eval`, no `new Function`, no dynamic code generation** anywhere in production paths.
- Third-party scripts are a decision, not a default. Adding one is a reviewed change.

### Dependency hygiene

- **`package.json` and `package-lock.json` are frozen.** See
  [AGENTS.md](./AGENTS.md#the-frozen-manifest). Needing a new dependency is an escalation, not
  a commit.
- **Exactly one lockfile.** `package-lock.json`, and nothing else. Never reintroduce
  `yarn.lock`.
- **Don't add a dependency for what the platform already does.** Most formatting, fetching, and
  DOM problems have a standard-library or Next-native answer.
- **Run a bundle-size check** in your head before proposing a new dependency: what does it pull
  in transitively? If you don't know, find out before opening the PR.

### Data and route contracts

The generated contribution payload and the public routes are contracts even though nothing is
published to npm.

- **The payload schema is versioned and validated in both directions.** The producer
  (`npm run data:build`) and the consumer share one schema module and one round-trip test.
  Changing the shape without changing both sides is a break.
- **No contribution figure is a literal anywhere in copy.** Every number reads from the
  payload, which carries its own window and generation timestamp. Hard-coded stats go stale
  silently and are how the site starts lying.
- **Public routes are a contract too.** Once a URL is live it is linked from somewhere;
  removing or renaming it is a breaking change that needs a redirect.

### Enforcement

Run the full gate before every push:

```bash
npm ci && npm run typecheck && npm run lint && npm run test && npm run build
```

- **Zero new lint warnings.** Not just zero errors. Silencing via `// eslint-disable` requires
  reviewer-approved justification. Treat the lint baseline as a ratchet: warnings only go down.
- **Zero new TypeScript errors.** Same ratchet logic; if you find existing errors in code you
  touch, fix them in the same PR.
- **`npm run build` is the single most important gate.** A failed Next build breaks the
  deployed site. Never open a PR whose build fails.
- Intentional violations under time pressure leave a `// TODO(@handle):` comment with a linked
  follow-up issue in the same PR.
- CI runs the same commands. GitHub Actions is the authority: the aggregate `ci-ok` check is
  the required status, and a green local run that fails CI usually means a missing commit or an
  uncommitted generated artifact. Check the diff against your branch.
- Vercel builds every PR as a preview deployment. A green CI run with a red Vercel build is
  still a red PR.

### Code review

- Self-review before requesting review. Read your own diff top to bottom in the "Files Changed"
  tab; that is where you will find the debug log you forgot to delete.
- Review for the checklist above: tests, types, boundaries, error handling, accessibility,
  budget. Style opinions that are not in this document are suggestions, not blockers.
- Comment on the code, not the author. Say what is wrong and what would be right.
- Reviewers block on correctness, contract breaks, missing tests, and accessibility
  regressions. Everything else is a nit and should be labelled as one.
- Resolve or explicitly reject every finding. A silently ignored review comment is a defect
  that will be found again by the next reader.

### Rebasing

We use `git rebase` to keep commit history tidy. Rebasing is an easy way to make sure that each
PR includes a series of clean commits with descriptive commit messages. Squash fixup commits
before requesting review; nobody needs to read `fix lint` three times in a public history.

## Working in this repo specifically

Three things are unusual here and worth knowing before your first PR.

### The design system lives in `docs/design/`

The visual language is a gruvbox-dark-medium terminal and tmux design system
("swe-rts-terminal"), JetBrains Mono only. The authoritative artifacts are checked in:

- `docs/design/kevinweaver.dev.dc.html` is the full page comp and the visual source of truth.
  It is a design-tool export using an `<x-dc>` custom element with `{{ ref }}` bindings. Treat
  it as static HTML and CSS to port to React, **not** as a runtime to adopt.
  `docs/design/support.js` is the design tool's own runtime; you do not need it and must not
  vendor it.
- `docs/design/_ds/swe-rts-terminal-*/tokens/*.css` holds colours, typography, spacing, and
  effects. **These are the real token values. Do not invent hexes.**
- `docs/design/_ds/swe-rts-terminal-*/layers/*.css` holds the `base`, `pane`, `tmux`, `type`,
  and `data` component layers.

One caveat that has already bitten: the type scale in `tokens/typography.css` was authored
against a 1920x1080 slide canvas (`--fs-hero: 200px`). It has to be re-derived as a responsive
fluid scale for a website. Never ship those literal pixel sizes.

### Research evidence lives in `docs/research/`, marked (M) or (I)

`docs/research/*.md` holds the measured research the rewrite is planned against. The marking
convention is load-bearing:

- **(M) means measured** in that session, with the command or query shown. You can build on it.
- **(I) means inferred**, reasoned from measured facts but not itself observed. Verify before
  relying on it.
- Unmarked claims are inference. Treat them as (I).

If you measure something that contradicts a research doc, correct the doc in the same PR and
say what you ran. If you add a finding, mark it. An unmarked number in `docs/research/` is a
future bug.

### Pure logic is DOM-free and unit-tested

The data encoding, the date bucketing, and the animation state machine are written without any
DOM dependency on purpose. That is what makes them testable in plain Node, deterministic under
a seeded RNG, and reusable from the build script and the browser alike.

Concretely: those modules must not reference `document`, `window`, `requestAnimationFrame`,
`setTimeout`, `Date.now`, or `Math.random`. Time and randomness are parameters. Rendering is
somebody else's job. If you find yourself reaching for a browser global inside pure logic, the
boundary is in the wrong place; move the call to the caller.

## Definition of done

A change is done when all of the following are true:

1. The full gate is green locally:
   `npm ci && npm run typecheck && npm run lint && npm run test && npm run build`.
2. New logic has unit tests; new behaviour visible in the page has an end-to-end test.
3. A bug fix has a regression test that fails without the fix.
4. Types are as narrow as the values they describe. No new `any`, no new unsafe casts, no
   weakened `tsconfig.json`.
5. Exported surfaces are documented, and any doc the change invalidates is updated in the same
   commit.
6. Keyboard operability, focus visibility, reduced-motion, and 320 px reflow are unbroken.
7. Bundle budgets still pass (`npm run size`).
8. The diff is self-reviewed, the commit messages are 3 to 7 imperative words, and neither the
   commits nor the PR body mention AI authorship.
9. CI is green on the exact PR head and the Vercel preview builds.
