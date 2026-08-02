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
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { SamlCanaryError } from './calendar.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { calendar, discovery, extraction } from './encode-stages-fixture.ts'

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

  it.each([
    [
      'unavailable stage',
      () => stages.discovery.mockRejectedValueOnce(new Error('offline')),
      3,
    ],
    [
      'local binding violation',
      () => stages.calendar.mockResolvedValueOnce({}),
      1,
    ],
    [
      'concrete SAML refusal',
      () =>
        stages.calendar.mockRejectedValueOnce(
          new SamlCanaryError(calendar().canary)
        ),
      2,
    ],
  ])('maps %s to exit %i', async (_, arrange, code) => {
    arrange()
    await expect(main(['--dry-run'])).resolves.toBe(code)
  })
})
