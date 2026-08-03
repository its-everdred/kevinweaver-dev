import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { compareRawEvents, extractAll } from './extract'
import type { GitExec } from './clone'
import type { RawEvent } from './extract'

let fixtureRoot = ''
let cloneRoot = ''

function git(
  cwd: string,
  args: readonly string[],
  env: Record<string, string | undefined> = {}
): void {
  execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: 'pipe',
  })
}

function commit(work: string, file: string, email: string, date: string): void {
  writeFileSync(join(work, file), `${file}\n`)
  git(work, ['add', file])
  git(work, ['commit', '-m', `add ${file}`], {
    GIT_AUTHOR_NAME: 'Fixture Author',
    GIT_AUTHOR_EMAIL: email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'Fixture Committer',
    GIT_COMMITTER_EMAIL: email,
    GIT_COMMITTER_DATE: date,
  })
}

beforeAll(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), 'kw13-extract-'))
  cloneRoot = join(fixtureRoot, 'clones')
  const work = join(fixtureRoot, 'work')
  git(fixtureRoot, ['init', '-q', '-b', 'main', work])
  commit(
    work,
    'human.ts',
    'kevinweaver2@gmail.com',
    '2026-01-02T20:00:00-08:00'
  )
  commit(
    work,
    'agent.ts',
    'its.applekid@gmail.com',
    '2026-01-03T04:00:00+00:00'
  )
  commit(work, 'unknown.ts', 'kevin@example.com', '2026-01-04T04:00:00+00:00')
  commit(work, 'empty-email.ts', '', '2026-01-05T04:00:00+00:00')
  git(fixtureRoot, [
    'clone',
    '--filter=blob:none',
    '--bare',
    work,
    join(cloneRoot, 'fixture__repo.git'),
  ])
  git(fixtureRoot, [
    '-C',
    join(cloneRoot, 'fixture__repo.git'),
    'remote',
    'set-url',
    'origin',
    'https://github.com/fixture/repo.git',
  ])
})

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('extractAll', () => {
  it('attributes only the known actors with their author-local calendar days', async () => {
    const result = await extractAll(['fixture/repo'], [], {
      cloneRoot,
      exec: cachedFetch(),
    })

    expect(result.events).toHaveLength(2)
    expect(result.events).toMatchObject([
      { day: '2026-01-03', path: 'agent.ts', actor: 1 },
      {
        day: '2026-01-02',
        path: 'human.ts',
        actor: 0,
        authorDate: '2026-01-02T20:00:00-08:00',
      },
    ])
    expect(result.events.some((event) => event.path === 'unknown.ts')).toBe(
      false
    )
  })

  it('returns byte-identical event order from the same cache', async () => {
    const first = await extractAll(['fixture/repo'], [], {
      cloneRoot,
      exec: cachedFetch(),
    })
    const second = await extractAll(['fixture/repo'], [], {
      cloneRoot,
      exec: cachedFetch(),
    })

    expect(JSON.stringify(first.events)).toBe(JSON.stringify(second.events))
  })

  it('tolerates commits with an empty author email instead of aborting', async () => {
    // Several corpus repos contain commits authored with an empty email
    // (`git commit --author="Name <>"`), which makes `%ae` render as an empty
    // field in the log header. Such a commit is unclassifiable and must be
    // skipped, not treated as a malformed header that aborts extraction.
    const result = await extractAll(['fixture/repo'], [], {
      cloneRoot,
      exec: cachedFetch(),
    })

    expect(result.repos[0]).toMatchObject({ status: 'ok' })
    expect(result.events).toHaveLength(2)
    expect(result.events.some((event) => event.path === 'empty-email.ts')).toBe(
      false
    )
  })

  it('reuses the preserved bare clone after a fetch failure', async () => {
    const result = await extractAll(['fixture/repo'], [], {
      cloneRoot,
      retries: 1,
      exec: staleFetch(),
    })

    expect(result.repos[0]).toMatchObject({ status: 'stale' })
    expect(result.events).toHaveLength(2)
  })

  it('uses the documented total order for same-day file touches', () => {
    const events: RawEvent[] = [
      { day: '2026-01-02', repo: 'z/repo', sha: 'a', path: 'a', actor: 0 },
      { day: '2026-01-02', repo: 'a/repo', sha: 'b', path: 'z', actor: 0 },
      { day: '2026-01-02', repo: 'a/repo', sha: 'b', path: 'a', actor: 0 },
      { day: '2026-01-03', repo: 'a/repo', sha: 'c', path: 'a', actor: 0 },
    ]

    expect(events.sort(compareRawEvents).map((event) => event.path)).toEqual([
      'a',
      'a',
      'z',
      'a',
    ])
  })
})

function staleFetch(): GitExec {
  return async (args) => {
    if (args.includes('config'))
      return {
        code: 0,
        stdout: 'https://github.com/fixture/repo.git\n',
        stderr: '',
      }
    if (args.includes('for-each-ref'))
      return {
        code: 0,
        stdout: `refs/heads/main ${'a'.repeat(40)}\n`,
        stderr: '',
      }
    return { code: 128, stdout: '', stderr: 'fetch unavailable' }
  }
}

function cachedFetch(): GitExec {
  return async (args) => {
    if (args.includes('config'))
      return {
        code: 0,
        stdout: 'https://github.com/fixture/repo.git\n',
        stderr: '',
      }
    if (args.includes('for-each-ref'))
      return {
        code: 0,
        stdout: `refs/heads/main ${'a'.repeat(40)}\n`,
        stderr: '',
      }
    return { code: 0, stdout: '', stderr: '' }
  }
}
