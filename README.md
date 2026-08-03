# kevinweaver.dev

Personal site: a terminal-styled dashboard built around a reverse-time visualization of
public GitHub activity, alongside a man page, a career git log, and a contact pane.

Production: <https://www.kevinweaver.dev> (the apex 308-redirects to `www`).

## Stack

Next.js App Router on React, Tailwind CSS v4 via `@tailwindcss/postcss`, TypeScript, and a
canvas visualization with no runtime chart dependency. Every version is pinned exactly in
`package.json`, the single source of truth — no floating tag and no range.

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

| Path                 | Contents                                                        |
| -------------------- | --------------------------------------------------------------- |
| `app/`               | App Router shell, one file per page region under `app/regions/` |
| `components/ds/`     | design-system chrome primitives (pane, bar, meter, scanline)    |
| `components/viz/`    | canvas surfaces for the instrument pane                         |
| `components/icons/`  | inline SVG control icons                                        |
| `content/`           | every rendered string, as typed data                            |
| `lib/viz/`           | the deterministic simulation and renderer                       |
| `lib/bundle/`        | payload wire format, encoder, client loader                     |
| `scripts/pipeline/`  | the data pipeline that produces the payload                     |
| `public/data/v1/`    | the generated payload, committed by the scheduled workflow      |
| `e2e/`, `test/`      | Playwright and Vitest suites                                    |
| `docs/design/`       | the design comp and the vendored design system                  |
| `docs/build-orders/` | the planning pack this rebuild was executed from                |

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
