import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
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
import { encodeBundle, main, writeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { successfulStages } from './encode-stages-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'

describe('successful live stage runs', () => {
  beforeEach(() => {
    process.env.CONTRIB_TOKEN = 'fixture'
    process.env.GITHUB_SHA = 'abcdef012345'
    useSuccessfulStages()
  })

  afterEach(() => {
    delete process.env.CONTRIB_TOKEN
    delete process.env.GITHUB_SHA
    vi.clearAllMocks()
  })

  it('runs deterministic successful no-input assembly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-stages-'))
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    await runNoInput(first, join(directory, 'a.json'))
    await runNoInput(second, join(directory, 'b.json'))
    await expect(tree(first)).resolves.toEqual(await tree(second))
  })

  it('promotes a private fallback but refuses a calendar fallback', async () => {
    const fixture = await priorGeneration()
    stages.private.mockRejectedValueOnce(new Error('offline'))
    await expect(
      main(['--out', fixture.target, '--state', fixture.state])
    ).resolves.toBe(0)
    expect(
      await readFile(join(fixture.target, 'manifest.json'), 'utf8')
    ).toContain('private')
    useSuccessfulStages()
    stages.calendar.mockRejectedValueOnce(new Error('offline'))
    const before = await tree(fixture.target)
    await expect(
      main(['--out', fixture.target, '--state', fixture.state])
    ).resolves.toBe(2)
    await expect(tree(fixture.target)).resolves.toEqual(before)
  })

  it.each([
    [
      'calendar',
      () => stages.calendar.mockRejectedValueOnce(new Error('offline')),
    ],
    [
      'private',
      () => stages.private.mockRejectedValueOnce(new Error('offline')),
    ],
  ])('fails a first-run %s fallback without promotion', async (_, arrange) => {
    arrange()
    const directory = await mkdtemp(join(tmpdir(), 'kw014-first-run-'))
    const target = join(directory, 'bundle')
    await expect(
      main(['--out', target, '--state', join(directory, 'state.json')])
    ).resolves.toBe(3)
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['calendar', () => stages.calendar.mockResolvedValueOnce({})],
    ['private', () => stages.private.mockResolvedValueOnce({})],
  ])(
    'rejects malformed %s data despite an available fallback',
    async (_, arrange) => {
      const fixture = await priorGeneration()
      const before = await tree(fixture.target)
      arrange()
      await expect(
        main(['--out', fixture.target, '--state', fixture.state])
      ).resolves.toBe(1)
      await expect(tree(fixture.target)).resolves.toEqual(before)
    }
  )
})

function useSuccessfulStages(): void {
  const values = successfulStages()
  stages.client.mockReturnValue(async () => ({}))
  stages.calendar.mockResolvedValue(values.calendar)
  stages.private.mockResolvedValue({ p: [0], degraded: [] })
  stages.discovery.mockResolvedValue(values.discovery)
  stages.extraction.mockResolvedValue(values.extraction)
}

async function runNoInput(target: string, state: string): Promise<void> {
  await expect(
    main([
      '--out',
      target,
      '--state',
      state,
      '--generated-at',
      '2026-07-31T00:00:00Z',
    ])
  ).resolves.toBe(0)
}

async function priorGeneration(): Promise<{ target: string; state: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'kw014-prior-'))
  const target = join(directory, 'bundle')
  const state = join(directory, 'state.json')
  await writeBundle(encodeBundle(validInput()), target)
  await writeFile(
    state,
    JSON.stringify({
      schema: 1,
      repos: {},
      events: 40_000,
      combinedTotal: 40_000,
    })
  )
  return { target, state }
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
