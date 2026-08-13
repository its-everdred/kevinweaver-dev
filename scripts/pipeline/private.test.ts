import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { fetchPrivateAggregate } from './private.ts'
import type { GraphqlRequest } from './calendar.ts'

function fakeRequest(): GraphqlRequest {
  return async <T>(query: string) => {
    if (query.includes('SamlCanary')) {
      return {
        repository: {
          nameWithOwner: 'ethereum-optimism/actions',
          isPrivate: false,
        },
        user: {
          contributionsCollection: {
            commitContributionsByRepository: [
              {
                repository: { owner: { login: 'ethereum-optimism' } },
                contributions: { totalCount: 1 },
              },
            ],
          },
        },
        rateLimit: { remaining: 5000 },
      } as T
    }
    return {
      user: {
        contributionsCollection: {
          restrictedContributionsCount: 1,
          hasAnyRestrictedContributions: true,
        },
      },
      rateLimit: { remaining: 5000 },
    } as T
  }
}

describe('fetchPrivateAggregate window', () => {
  it('defaults the month count through the injected day', async () => {
    const aggregate = await fetchPrivateAggregate(fakeRequest(), {
      now: new Date('2026-08-13T00:00:00Z'),
    })
    expect(aggregate.monthCount).toBe(200)
    expect(aggregate.p).toHaveLength(200)
  })

  it('honours an explicit month count', async () => {
    const aggregate = await fetchPrivateAggregate(fakeRequest(), {
      monthCount: 5,
      now: new Date('2026-08-13T00:00:00Z'),
    })
    expect(aggregate.monthCount).toBe(5)
    expect(aggregate.p).toHaveLength(5)
  })
})
