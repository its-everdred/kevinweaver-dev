import { describe, expect, it } from 'vitest'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extractionValue, StageDataError } from './encode-stage-adapters.ts'

describe('extraction stage adapter', () => {
  it('accepts a complete extraction contract', () => {
    expect(extractionValue(result())).toMatchObject({ commitScope: '--all' })
  })

  it.each([
    [
      'missing author date',
      { events: [{ ...event(), authorDate: undefined }] },
    ],
    [
      'invalid head value',
      { repos: [{ ...repository(), heads: { main: 1 } }] },
    ],
    ['invalid status', { repos: [{ ...repository(), status: 'lost' }] }],
    ['private repository', { repos: [{ ...repository(), private: true }] }],
    [
      'invalid failure count',
      { repos: [{ ...repository(), consecutiveFailures: -1 }] },
    ],
  ])('rejects %s as a local boundary error', (_, patch) => {
    expect(() => extractionValue({ ...result(), ...patch })).toThrow(
      StageDataError
    )
  })
})

function result() {
  return {
    events: [event()],
    repos: [repository()],
    commitScope: '--all',
    cloneRoot: '/tmp/clone',
  }
}

function event() {
  return {
    day: '2026-07-31',
    repo: 'owner/repo',
    sha: 'a'.repeat(40),
    path: 'src/run.ts',
    actor: 0,
    authorDate: '2026-07-31T00:00:00Z',
  }
}

function repository() {
  return {
    n: 'owner/repo',
    first: '2026-07-31',
    last: '2026-07-31',
    private: false,
    status: 'ok',
    consecutiveFailures: 0,
    lastOk: '2026-07-31T00:00:00Z',
    heads: { main: 'a'.repeat(40) },
    events: [event()],
    error: null,
  }
}
