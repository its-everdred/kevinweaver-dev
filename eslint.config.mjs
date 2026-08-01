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
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
]

export default eslintConfig
