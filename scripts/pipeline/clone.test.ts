import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { syncAll, syncRepo } from './clone'
import { extractAll } from './extract'
import type { GitExec } from './clone'

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

  it('fails closed when a stale clone has no preserved cache', async () => {
    await expect(
      extractAll(['example/failing'], [], {
        cloneRoot: root(),
        retries: 1,
        backoffMs: 0,
        exec: failedExec(),
      })
    ).rejects.toThrow('Upstream pipeline input is unavailable')
  })
})
