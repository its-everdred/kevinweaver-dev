import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { extractAll } from './extract'

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
  git(fixtureRoot, [
    'clone',
    '--filter=blob:none',
    '--bare',
    work,
    join(cloneRoot, 'fixture__repo.git'),
  ])
})

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

describe('extractAll', () => {
  it('attributes only the known actors with their author-local calendar days', async () => {
    const result = await extractAll(['fixture/repo'], [], { cloneRoot })

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
    const first = await extractAll(['fixture/repo'], [], { cloneRoot })
    const second = await extractAll(['fixture/repo'], [], { cloneRoot })

    expect(JSON.stringify(first.events)).toBe(JSON.stringify(second.events))
  })
})
