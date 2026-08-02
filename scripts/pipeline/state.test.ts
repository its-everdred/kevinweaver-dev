import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { PipelineStateError, bootstrapState, mergeRepoState, readState, writeState } from './state.ts'

describe('pipeline state', () => {
  it('treats the committed bootstrap as no prior run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-state-'))
    const path = join(directory, 'state.json')
    await writeFile(path, '{"schema":1,"repos":{}}\n')

    await expect(readState(path)).resolves.toBeNull()
  })

  it('bootstraps missing state and retains stale repository history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-state-'))
    const path = join(directory, 'state.json')
    const prior = {
      heads: { main: 'a' },
      events: 10,
      lastEventDay: '2026-07-31',
      status: 'ok' as const,
      lastOk: '2026-07-31T00:00:00Z',
      consecutiveFailures: 0,
    }
    const stale = mergeRepoState(prior, {
      ...prior,
      heads: {},
      events: 0,
      status: 'stale',
      consecutiveFailures: 0,
    })

    expect(await readState(path)).toBeNull()
    await writeState(path, bootstrapState())
    expect(await readState(path)).toBeNull()
    await writeState(path, {
      ...bootstrapState(),
      repos: { 'owner/repo': stale },
    })
    expect((await readState(path))?.repos['owner/repo']).toMatchObject({
      events: 10,
      status: 'stale',
      consecutiveFailures: 1,
    })
  })

  it('rejects an unknown schema instead of silently resetting state', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-state-'))
    const path = join(directory, 'state.json')
    await writeState(path, { ...bootstrapState(), schema: 1 })
    await writeFile(path, '{"schema":2,"repos":{}}')

    await expect(readState(path)).rejects.toBeInstanceOf(PipelineStateError)
  })

  it('round-trips unknown future state fields without treating them as data', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-state-'))
    const path = join(directory, 'state.json')
    const state = {
      ...bootstrapState(),
      future: { publicOnly: true },
      repos: {
        'owner/repo': {
          heads: {},
          events: 1,
          status: 'ok' as const,
          lastOk: null,
          consecutiveFailures: 0,
          future: 'retained',
        },
      },
    }

    await writeState(path, state)
    await expect(readState(path)).resolves.toMatchObject({
      future: { publicOnly: true },
      repos: { 'owner/repo': { future: 'retained' } },
    })
  })
})
