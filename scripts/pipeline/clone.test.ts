import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { syncAll, syncRepo } from './clone'
import { extractAll } from './extract'
import type { GitExec } from './clone'
import type { RepoExtract } from './extract'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kw13-clone-'))
  roots.push(directory)
  return directory
}

function failedExec(): GitExec {
  return async () => ({
    code: 128,
    stdout: '',
    stderr: 'fatal: unable to access remote: Connection timed out',
  })
}

describe('clone cache failure handling', () => {
  it('retries a failed repository the configured total number of times', async () => {
    const outcome = await syncRepo('example/failing', {
      cloneRoot: root(),
      retries: 3,
      backoffMs: 0,
      exec: failedExec(),
    })

    expect(outcome).toMatchObject({
      repo: 'example/failing',
      ok: false,
      attempts: 3,
      heads: {},
    })
    expect(outcome.error).toContain('Connection timed out')
  })

  it('processes repositories sequentially and snapshots sorted heads', async () => {
    const calls: string[] = []
    const exec: GitExec = async (args) => {
      calls.push(args.join(' '))
      if (args.includes('for-each-ref')) {
        return {
          code: 0,
          stdout:
            'refs/heads/zebra bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\nrefs/heads/main aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n',
          stderr: '',
        }
      }
      return { code: 0, stdout: '', stderr: '' }
    }

    const outcomes = await syncAll(['example/one', 'example/two'], {
      cloneRoot: root(),
      exec,
    })

    expect(calls[0]).toContain('https://github.com/example/one.git')
    expect(calls[2]).toContain('https://github.com/example/two.git')
    expect(Object.keys(outcomes[0]?.heads ?? {})).toEqual([
      'refs/heads/main',
      'refs/heads/zebra',
    ])
  })

  it('preserves prior events when a clone becomes stale', async () => {
    const previous: RepoExtract = {
      n: 'example/failing',
      first: '2026-01-02',
      last: '2026-01-02',
      private: false,
      status: 'ok',
      consecutiveFailures: 2,
      lastOk: '2026-01-02T00:00:00Z',
      heads: { 'refs/heads/main': 'a'.repeat(40) },
      events: [
        {
          day: '2026-01-02',
          repo: 'example/failing',
          sha: 'a'.repeat(40),
          path: 'keep.ts',
          actor: 0,
          authorDate: '2026-01-02T20:00:00-08:00',
        },
      ],
      error: null,
    }

    const result = await extractAll(['example/failing'], [previous], {
      cloneRoot: root(),
      retries: 3,
      backoffMs: 0,
      exec: failedExec(),
    })

    expect(result.repos).toHaveLength(1)
    expect(result.repos[0]).toMatchObject({
      status: 'stale',
      consecutiveFailures: 3,
    })
    expect(result.repos[0]?.events).toEqual(previous.events)
    expect(result.repos[0]?.error).toContain('Connection timed out')
  })
})
