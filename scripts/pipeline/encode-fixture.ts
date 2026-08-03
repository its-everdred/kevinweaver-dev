import type { EncodeInput } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { BAND_LOWER_BOUNDS } from '../../lib/viz/tokens/level.ts'

export const MINI_INPUT: EncodeInput = {
  events: [
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'a'.repeat(40),
      path: 'packages/engine/src/run.ts',
      actor: 0,
    },
    {
      day: '2026-07-31',
      repo: 'aiur-team/aiur',
      sha: 'b'.repeat(40),
      path: 'packages/engine/src/bootstrap.ts',
      actor: 1,
    },
    {
      day: '2026-07-30',
      repo: 'ethereum-optimism/actions',
      sha: 'c'.repeat(40),
      path: 'apps/web/app/page.tsx',
      actor: 0,
    },
  ],
  repos: [
    {
      n: 'aiur-team/aiur',
      databaseId: 1,
      stargazerCount: 10,
      first: '2026-07-31',
      last: '2026-07-31',
      private: false,
      status: 'ok',
    },
    {
      n: 'ethereum-optimism/actions',
      databaseId: 2,
      stargazerCount: 20,
      first: '2026-07-30',
      last: '2026-07-30',
      private: false,
      status: 'ok',
    },
  ],
  grid: {
    start: '2026-07-28',
    e: [1, 2, 0, 0, 0],
    a: [0, 1, 0, 0, 0],
    p: [0],
    bands: BAND_LOWER_BOUNDS,
  },
  combinedTotal: 4,
  generatedAt: '2026-07-31T00:00:00Z',
  commit: 'abcdef0',
  repoCount: 2,
  repoCountDefinition: 'ownerPublicNonFork',
  refs: 'all',
  chunkSize: 1500,
  dictSliceGuardGzipBytes: 12_288,
  samlCanary: {
    ok: true,
    org: 'ethereum-optimism',
    checkedAt: '2026-07-31T00:00:00Z',
  },
  degraded: [],
}

/** Builds a validator-sized fixture with measured discovery metadata. */
export function validInput(): EncodeInput {
  const repos = Array.from({ length: 40 }, (_, index) => repository(index))
  return {
    ...MINI_INPUT,
    events: repos.flatMap((repo, index) => eventsFor(repo.n, index)),
    repos,
    grid: {
      ...MINI_INPUT.grid,
      start: '2026-07-31',
      e: [40_000],
      a: [0],
      p: [0],
    },
    combinedTotal: 40_000,
    repoCount: 40,
  }
}

function repository(index: number): EncodeInput['repos'][number] {
  return {
    n: `owner/repo-${String(index).padStart(2, '0')}`,
    databaseId: index + 1,
    stargazerCount: index,
    first: '2026-07-31',
    last: '2026-07-31',
    private: false,
    status: 'ok',
  }
}

function eventsFor(
  repo: string,
  index: number
): EncodeInput['events'][number][] {
  return Array.from({ length: 1000 }, (_, event) => ({
    day: '2026-07-31',
    repo,
    sha: `${index.toString(16)}${event.toString(16)}`.padStart(40, '0'),
    path: `src/${index}.ts`,
    actor: 0,
  }))
}
