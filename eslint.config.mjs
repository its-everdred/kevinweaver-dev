// Flat config. ESLint is pinned to 9.x, NOT 10.x, and this is deliberate:
//
//   eslint-config-next@16.2.12 declares `peerDependencies.eslint: ">=9.0.0"`, but it
//   depends on eslint-plugin-react@^7.37.0, whose own peer range tops out at ^9.7 and
//   which calls the `context.getFilename()` API that ESLint 10 removed. Installing
//   ESLint 10 resolves cleanly and then throws at lint time:
//     TypeError: Error while loading rule 'react/display-name':
//     contextOrFilename.getFilename is not a function
//   eslint-plugin-react 7.37.5 is the latest published version and has no ESLint 10
//   support. Revisit when it ships a release declaring ^10.
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'build/**',
      'node_modules/**',
      'next-env.d.ts',
      // Vendored Claude Design export — reference material, not our source.
      'docs/**',
      'test-results/**',
      'playwright-report/**',
      // ESLint 9 flat config does not consult .gitignore, so generated coverage
      // output would be linted and fail the gate after any local --coverage run.
      'coverage/**',
      // Agent worktrees are created inside the repo. Without this, linting the
      // root also lints every checked-out worktree (measured: 123 errors from a
      // single one) — green in CI, red locally, for no real defect.
      '.claude/**',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  // Clock and randomness are banned in BOTH sim and render. Rendering must be a
  // pure function of (state, ctx) or KW-031's screenshot baselines are impossible.
  // The KW-022 review verified by hand that all 6 Math.random and 5 performance.now
  // leaks from the design-comp prototype were removed — this makes that a gate
  // rather than a one-off audit.
  {
    files: ['lib/viz/{sim,render}/**/*.{ts,mts,js,mjs}'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'lib/viz is deterministic: use randomHash/nextRng from lib/viz/sim/rng.ts, seeded from state.' },
        { object: 'Date', property: 'now', message: 'lib/viz is deterministic: time is SimState.tick, not the wall clock.' },
        { object: 'performance', property: 'now', message: 'lib/viz is deterministic: time is SimState.tick, not the wall clock.' },
      ],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date']", message: 'lib/viz must not construct Date; day-index to ISO conversion is arithmetic (see budget.ts calendarMarkers).' },
      ],
    },
  },
  // DOM and timers stay banned in sim only. render legitimately creates offscreen
  // canvases and must keep that capability.
  {
    files: ['lib/viz/sim/**/*.{ts,mts,js,mjs}'],
    rules: {
      'no-restricted-globals': ['error', {
        checkGlobalObject: true,
        globals: [
          { name: 'requestAnimationFrame', message: 'rAF belongs to lib/viz/driver.ts.' },
          { name: 'cancelAnimationFrame', message: 'rAF belongs to lib/viz/driver.ts.' },
          { name: 'setTimeout', message: 'Timers belong to lib/viz/driver.ts.' },
          { name: 'setInterval', message: 'Timers belong to lib/viz/driver.ts.' },
          { name: 'window', message: 'lib/viz/sim must import cleanly in plain Node: no DOM.' },
          { name: 'document', message: 'lib/viz/sim must import cleanly in plain Node: no DOM.' },
        ],
      }],
      'no-restricted-syntax': ['error',
        { selector: "NewExpression[callee.name='Date']", message: 'lib/viz/sim must not construct Date; day-index to ISO conversion belongs to lib/viz/driver.ts.' },
      ],
    },
  },
]

export default eslintConfig
