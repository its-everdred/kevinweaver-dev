import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { fetchCalendarBundle } from './calendar.ts'
import type { GraphqlRequest } from './calendar.ts'

function fakeRequest(): GraphqlRequest {
  return async <T>(query: string, variables?: Record<string, unknown>) => {
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
    const year = String(variables?.from).slice(0, 4)
    return {
      user: {
        contributionsCollection: {
          restrictedContributionsCount: 1,
          contributionCalendar: {
            totalContributions: 1,
            weeks: [
              {
                contributionDays: [
                  { date: `${year}-01-01`, contributionCount: 1 },
                ],
              },
            ],
          },
        },
      },
      rateLimit: { remaining: 5000 },
    } as T
  }
}

describe('fetchCalendarBundle window', () => {
  it('defaults the window end to the injected day', async () => {
    const bundle = await fetchCalendarBundle(fakeRequest(), {
      now: new Date('2026-08-13T00:00:00Z'),
    })
    expect(bundle.windowStart).toBe('2010-01-01')
    expect(bundle.windowEnd).toBe('2026-08-13')
    expect(bundle.dayCount).toBe(6069)
  })

  it('honours an explicit window end over the injected day', async () => {
    const bundle = await fetchCalendarBundle(fakeRequest(), {
      windowEnd: '2026-07-31',
      now: new Date('2026-08-13T00:00:00Z'),
    })
    expect(bundle.windowEnd).toBe('2026-07-31')
    expect(bundle.dayCount).toBe(6056)
  })
})
