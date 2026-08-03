import { mkdtemp, readdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
import { SamlCanaryError } from './calendar.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { resolveStages } from './encode-stages.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { calendar } from './encode-stages-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { discovery } from './encode-stages-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extraction } from './encode-stages-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle, main, writeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'

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

describe('live stage boundary taxonomy', () => {
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

  it('passes the prior-state union and retains prior-only metadata', async () => {
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

  it.each([
    [
      'calendar unavailable',
      () => stages.calendar.mockRejectedValueOnce(new Error('offline')),
      3,
    ],
    [
      'private unavailable',
      () => stages.private.mockRejectedValueOnce(new Error('offline')),
      3,
    ],
    [
      'discovery unavailable',
      () => stages.discovery.mockRejectedValueOnce(new Error('offline')),
      3,
    ],
    [
      'extraction unavailable',
      () => stages.extraction.mockRejectedValueOnce(new Error('offline')),
      3,
    ],
    ['calendar malformed', () => stages.calendar.mockResolvedValueOnce({}), 1],
    ['private malformed', () => stages.private.mockResolvedValueOnce({}), 1],
    [
      'discovery malformed',
      () => stages.discovery.mockResolvedValueOnce({}),
      1,
    ],
    [
      'extraction malformed',
      () => stages.extraction.mockResolvedValueOnce({}),
      1,
    ],
    [
      'calendar SAML refusal',
      () =>
        stages.calendar.mockRejectedValueOnce(
          new SamlCanaryError(calendar().canary)
        ),
      2,
    ],
    [
      'private SAML refusal',
      () =>
        stages.private.mockRejectedValueOnce(
          new SamlCanaryError(calendar().canary)
        ),
      2,
    ],
  ])('maps %s to exit %i', async (_, arrange, code) => {
    const target = await refusalTarget()
    const before = await tree(target)
    arrange()
    await expect(
      main(['--out', target, '--state', `${target}.state`])
    ).resolves.toBe(code)
    await expect(tree(target)).resolves.toEqual(before)
  })

  it('preserves the underlying cause when an extraction stage fails', async () => {
    const underlying = new Error('git log failed on a corpus repo')
    stages.extraction.mockRejectedValueOnce(underlying)

    await expect(resolveStages(null, undefined)).rejects.toMatchObject({
      name: 'UpstreamUnavailableError',
      message:
        'Upstream pipeline input is unavailable: extraction stage failed',
      cause: underlying,
    })
  })
})

async function refusalTarget(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'kw014-stage-refusal-'))
  const target = join(directory, 'bundle')
  await writeBundle(encodeBundle(validInput()), target)
  return target
}

async function tree(
  directory: string,
  prefix = ''
): Promise<Record<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const parts = await Promise.all(
    entries.map(async (entry) => {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      return entry.isDirectory()
        ? tree(join(directory, entry.name), path)
        : { [path]: await readFile(join(directory, entry.name), 'utf8') }
    })
  )
  return Object.assign({}, ...parts)
}
