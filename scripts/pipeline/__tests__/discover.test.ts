import { describe, expect, it } from 'vitest'
import recordedFixture from './fixtures/discovery-response.json'
import type { GraphQlClient } from '../discover'
import { DISCOVERY_QUERY, REPO_COUNT_QUERY, discoverRepos } from '../discover'

const repository = (nameWithOwner: string, isPrivate = false) => ({
  nameWithOwner,
  isPrivate,
  isFork: false,
  isArchived: false,
  stargazerCount: 2,
  createdAt: '2026-05-18T00:26:04Z',
})

const discoveryResponse = {
  user: {
    contributionsCollection: {
      commitContributionsByRepository: [
        {
          repository: repository('its-everdred/gary'),
          contributions: { totalCount: 300 },
        },
        {
          repository: repository('private/hidden', true),
          contributions: { totalCount: 2 },
        },
      ],
      pullRequestContributionsByRepository: [
        {
          repository: repository('aiur-team/aiur'),
          contributions: { totalCount: 118 },
        },
      ],
      issueContributionsByRepository: [
        {
          repository: repository('aiur-team/aiur'),
          contributions: { totalCount: 14 },
        },
      ],
      pullRequestReviewContributionsByRepository: [
        {
          repository: repository('aiur-team/aiur'),
          contributions: { totalCount: 10 },
        },
      ],
    },
  },
  rateLimit: { cost: 1, remaining: 999 },
}

const repoCountResponse = {
  user: { repositories: { totalCount: 2 } },
  rateLimit: { cost: 1, remaining: 999 },
}

function stubClient(
  calls: Array<{ query: string; variables: Record<string, unknown> }>
): GraphQlClient {
  return async <T>(query: string, variables: Record<string, unknown>) => {
    calls.push({ query, variables })
    return (
      query === REPO_COUNT_QUERY ? repoCountResponse : discoveryResponse
    ) as T
  }
}

describe('repository discovery', () => {
  it('consumes the recorded two-window, two-actor fixture', async () => {
    const client: GraphQlClient = async <T>(
      query: string,
      variables: Record<string, unknown>
    ) => {
      if (query === REPO_COUNT_QUERY) {
        const response = recordedFixture.repoCountResponses.find(
          ({ login }) => login === variables.login
        )?.response
        return response as T
      }
      const response = recordedFixture.requests.find(
        (request) =>
          request.login === variables.login && request.from === variables.from
      )?.response
      return response as T
    }
    const result = await discoverRepos(client, {
      logins: ['its-everdred', 'its-applekid'],
      fromYear: 2021,
      toYear: 2022,
    })

    expect(result.repos.map(({ nameWithOwner }) => nameWithOwner)).toEqual([
      'fixture/applekid',
      'fixture/everdred',
    ])
    expect(result.repoCountDefinition.count).toBe(5)
    expect(result.queryCost).toBe(6)
  })

  it('unions categories, filters private repos, sorts, and is deterministic', async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> =
      []
    const options = {
      logins: ['its-everdred', 'its-applekid'] as const,
      fromYear: 2021,
      toYear: 2026,
    }
    const first = await discoverRepos(stubClient(calls), options)
    const second = await discoverRepos(stubClient([]), options)

    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.repos.map(({ nameWithOwner }) => nameWithOwner)).toEqual([
      'aiur-team/aiur',
      'its-everdred/gary',
    ])
    expect(first.repos[0]?.contributions).toEqual({
      commit: 0,
      pullRequest: 1416,
      issue: 168,
      pullRequestReview: 120,
    })
    expect(first.repos.some(({ isPrivate }) => isPrivate)).toBe(false)
    expect(first.repoCountDefinition).toEqual({
      definition: 'ownerPublicNonFork',
      count: 4,
      byActor: { 'its-everdred': 2, 'its-applekid': 2 },
    })
    expect(first.queryCost).toBe(14)
    expect(calls).toHaveLength(14)
  })

  it('throws when a connection reaches its requested maximum', async () => {
    const calls: Array<{ query: string; variables: Record<string, unknown> }> =
      []
    const full = {
      ...discoveryResponse,
      user: {
        contributionsCollection: {
          ...discoveryResponse.user.contributionsCollection,
          commitContributionsByRepository: Array.from(
            { length: 2 },
            (_, index) => ({
              repository: repository(`owner/repo-${index}`),
              contributions: { totalCount: 1 },
            })
          ),
        },
      },
    }
    const client: GraphQlClient = async <T>(
      query: string,
      variables: Record<string, unknown>
    ) => {
      calls.push({ query, variables })
      return (query === REPO_COUNT_QUERY ? repoCountResponse : full) as T
    }
    await expect(
      discoverRepos(client, {
        logins: ['its-everdred'],
        fromYear: 2026,
        toYear: 2026,
        maxRepositories: 2,
      })
    ).rejects.toThrow('truncated')
  })

  it('stops before partial output when rate-limit headroom is low', async () => {
    const client: GraphQlClient = async <T>() =>
      ({
        user: {
          contributionsCollection: {
            commitContributionsByRepository: [],
            pullRequestContributionsByRepository: [],
            issueContributionsByRepository: [],
            pullRequestReviewContributionsByRepository: [],
          },
        },
        rateLimit: { cost: 1, remaining: 49 },
      }) as T
    await expect(
      discoverRepos(client, {
        logins: ['its-everdred'],
        fromYear: 2026,
        toYear: 2026,
      })
    ).rejects.toThrow('49')
  })

  it('rejects a response with a missing connection', async () => {
    const client: GraphQlClient = async <T>() =>
      ({
        user: { contributionsCollection: {} },
        rateLimit: { cost: 1, remaining: 999 },
      }) as T
    await expect(
      discoverRepos(client, {
        logins: ['its-everdred'],
        fromYear: 2026,
        toYear: 2026,
      })
    ).rejects.toThrow('malformed or incomplete')
  })

  it('exports the injected query documents without importing a transport', () => {
    expect(DISCOVERY_QUERY).toContain('contributionsCollection')
    expect(REPO_COUNT_QUERY).toContain('ownerAffiliations: [OWNER]')
  })
})
