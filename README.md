# kevinweaver.dev

Dashboard of what Kevin Weaver is
working on right now.

Next.js (App Router) on Vercel. gruvbox dark medium, terminal/tmux visual language,
JetBrains Mono throughout.

## Quick start

```bash
npm ci
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm start` | serve the production build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, write |
| `npm run format:check` | Prettier, check only |
| `npm run typegen` | generate Next route types |
| `npm run typecheck` | `next typegen` then `tsc --noEmit` |
| `npm test` / `npm run test:unit` | Vitest |
| `npm run test:watch` | Vitest, watch |
| `npm run test:e2e` | Playwright |
| `npm run data:build` | regenerate the GitHub activity payload |
| `npm run size` | bundle size budget |

If a command is not in that table, it does not exist.

The gate that must be green before any PR opens:

```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
```

## Layout

```text
app/            App Router — layout, page, route handlers, region components
lib/            pure, DOM-free logic (encoding, binning, sim state) — unit tested
docs/design/    the gruvbox design system + the Claude Design comp (reference)
docs/research/  measured research; (M) = measured, (I) = inferred
docs/build-orders/  the ticket graph driving the rewrite
.aiur/          autonomous fleet config
```

## Notes

- **npm only.** Exactly one lockfile. The repo once shipped both `yarn.lock` and
  `package-lock.json`, which made package-manager detection ambiguous — never reintroduce it.
- **ESLint is pinned to 9.x, not 10.x.** `eslint-config-next@16.2.12` claims
  `eslint: ">=9.0.0"` but depends on `eslint-plugin-react@^7.37.0`, which peers at `^9.7`
  and calls the `context.getFilename()` API ESLint 10 removed. ESLint 10 installs cleanly
  and then throws at lint time.
- **TypeScript is capped at 6.0.x.** `typescript-eslint@8` peers `<6.1.0`; TS 7 has no
  typescript-eslint support at any published version.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for engineering conventions and
[AGENTS.md](./AGENTS.md) for the autonomous-agent contract.
