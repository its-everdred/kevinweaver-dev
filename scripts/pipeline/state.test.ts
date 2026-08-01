import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// prettier-ignore
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { bootstrapState, mergeRepoState, readState, writeState } from './state.ts'

describe('pipeline state', () => {
  it('bootstraps missing state and preserves a stale repository history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-state-'))
    const path = join(directory, 'state.json')
    expect(await readState(path)).toBeNull()
    const prior = {
      heads: { main: 'a' },
      events: 10,
      lastEventDay: '2026-07-31',
      status: 'ok' as const,
      lastOk: '2026-07-31T00:00:00Z',
      consecutiveFailures: 0,
    }
    const merged = mergeRepoState(prior, {
      ...prior,
      heads: {},
      events: 0,
      status: 'stale',
      consecutiveFailures: 0,
    })
    await writeState(path, { ...bootstrapState(), repos: { repo: merged } })
    expect((await readState(path))?.repos.repo).toMatchObject({
      events: 10,
      status: 'stale',
      consecutiveFailures: 1,
    })
  })
})
