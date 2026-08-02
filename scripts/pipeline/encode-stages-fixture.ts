export function calendar() {
  return {
    source: 'github-graphql',
    generatedAt: '2026-07-31T00:00:00Z',
    windowStart: '2026-07-31',
    windowEnd: '2026-07-31',
    dayCount: 1,
    canary: {
      ok: true,
      probeRepository: 'ethereum-optimism/actions',
      sawRepository: true,
      sawOrgContribution: true,
      window: '2026',
      checkedAt: '2026-07-31T00:00:00Z',
      detail: 'ok',
    },
    actors: [],
    combined: [{ date: '2026-07-31', e: 1, a: 0 }],
    combinedTotalNaive: 1,
    combinedTotalDeduplicated: null,
    degraded: [],
  }
}

export function discovery() {
  return {
    windowStart: '2026-07-31',
    windowEnd: '2026-07-31',
    actors: ['its-everdred', 'its-applekid'],
    repos: [
      {
        nameWithOwner: 'owner/current',
        databaseId: 1,
        isPrivate: false,
        isFork: false,
        isArchived: false,
        stargazerCount: 3,
        createdAt: '2020-01-01T00:00:00Z',
        contributions: {
          commit: 1,
          pullRequest: 0,
          issue: 0,
          pullRequestReview: 0,
        },
      },
    ],
    repoCountDefinition: {
      definition: 'ownerPublicNonFork',
      count: 2,
      byActor: { 'its-everdred': 1, 'its-applekid': 1 },
    },
    queryCost: 1,
  }
}

export function extraction() {
  return {
    events: [
      event('owner/current', '2026-07-31'),
      event('owner/prior', '2026-07-30'),
    ],
    repos: [
      repo('owner/current', '2026-07-31', 'ok', 0),
      repo('owner/prior', '2026-07-30', 'stale', 7),
    ],
    commitScope: '--all',
    cloneRoot: '/tmp/clones',
  }
}

function event(repo: string, day: string) {
  return {
    day,
    repo,
    sha: repo[6]!.repeat(40),
    path: 'src/run.ts',
    actor: 0,
    authorDate: `${day}T00:00:00Z`,
  }
}

function repo(
  name: string,
  day: string,
  status: 'ok' | 'stale',
  consecutiveFailures: number
) {
  return {
    n: name,
    first: day,
    last: day,
    private: false,
    status,
    consecutiveFailures,
    lastOk: `${day}T00:00:00Z`,
    heads: {},
    events: [],
    error: status === 'ok' ? null : 'fetch failed',
  }
}
