import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const stages = vi.hoisted(() => ({
  calendar: vi.fn(),
  client: vi.fn(),
  discovery: vi.fn(),
  extraction: vi.fn(),
  private: vi.fn(),
}))

vi.mock('./calendar.ts', async (original) => ({
  ...(await original()),
  createContribClient: stages.client,
  fetchCalendarBundle: stages.calendar,
}))
vi.mock('./private.ts', () => ({ fetchPrivateAggregate: stages.private }))
vi.mock('./discover.ts', () => ({ discoverRepos: stages.discovery }))
vi.mock('./extract.ts', () => ({ extractAll: stages.extraction }))

// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { resolveStages } from './encode-stages.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { main } from './encode.ts'

const prior = {
  schema: 1 as const,
  repos: {
    'owner/prior': {
      databaseId: 2,
      stargazerCount: 4,
      heads: { 'refs/heads/main': 'b'.repeat(40) },
      events: 1,
      lastEventDay: '2026-07-30',
      status: 'stale' as const,
      lastOk: '2026-07-30T00:00:00Z',
      consecutiveFailures: 6,
    },
  },
}

describe('live stage assembly', () => {
  beforeEach(() => {
    process.env.CONTRIB_TOKEN = 'fixture'
    process.env.GITHUB_SHA = 'abcdef012345'
    stages.client.mockReturnValue(async () => ({}))
    stages.calendar.mockResolvedValue(calendar())
    stages.private.mockResolvedValue({ p: [0], degraded: [] })
    stages.discovery.mockResolvedValue(discovery())
    stages.extraction.mockResolvedValue(extraction())
  })

  afterEach(() => {
    delete process.env.CONTRIB_TOKEN
    delete process.env.GITHUB_SHA
    vi.clearAllMocks()
  })

  it('passes the prior-state union and preserves prior-only repository metadata', async () => {
    const input = await resolveStages(prior, undefined)

    expect(stages.extraction).toHaveBeenCalledWith(
      ['owner/current', 'owner/prior'],
      [expect.objectContaining({ n: 'owner/prior', consecutiveFailures: 6 })]
    )
    expect(input.repos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          n: 'owner/prior',
          databaseId: 2,
          status: 'gone',
        }),
      ])
    )
  })

  it('runs the live-stage path when no fixture input is supplied', async () => {
    await expect(main(['--dry-run'])).resolves.toBe(1)
    expect(stages.calendar).toHaveBeenCalledOnce()
    expect(stages.discovery).toHaveBeenCalledOnce()
    expect(stages.extraction).toHaveBeenCalledOnce()
  })
})

function calendar() {
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

function discovery() {
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

function extraction() {
  const event = (repo: string, day: string) => ({
    day,
    repo,
    sha: repo[6]!.repeat(40),
    path: 'src/run.ts',
    actor: 0,
    authorDate: `${day}T00:00:00Z`,
  })
  return {
    events: [
      event('owner/current', '2026-07-31'),
      event('owner/prior', '2026-07-30'),
    ],
    repos: [
      {
        n: 'owner/current',
        first: '2026-07-31',
        last: '2026-07-31',
        private: false,
        status: 'ok',
        consecutiveFailures: 0,
        lastOk: '2026-07-31T00:00:00Z',
        heads: {},
        events: [],
        error: null,
      },
      {
        n: 'owner/prior',
        first: '2026-07-30',
        last: '2026-07-30',
        private: false,
        status: 'stale',
        consecutiveFailures: 7,
        lastOk: '2026-07-30T00:00:00Z',
        heads: {},
        events: [],
        error: 'fetch failed',
      },
    ],
    commitScope: '--all',
    cloneRoot: '/tmp/clones',
  }
}
