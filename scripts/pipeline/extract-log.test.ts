import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extractRepo } from './extract-log.ts'

describe('git log parsing', () => {
  it('rejects malformed callback data with the requested repository name', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'kw014-log-'))
    const bin = mkdtempSync(join(tmpdir(), 'kw014-bin-'))
    const fakeGit = join(bin, 'git')
    const originalPath = process.env.PATH
    writeFileSync(fakeGit, '#!/bin/sh\nprintf "\\001malformed\\n"\n')
    chmodSync(fakeGit, 0o755)
    process.env.PATH = `${bin}${delimiter}${originalPath ?? ''}`

    try {
      await expect(extractRepo('owner/repo', directory)).rejects.toThrow(
        'Could not extract owner/repo: malformed log header'
      )
    } finally {
      process.env.PATH = originalPath
      rmSync(directory, { recursive: true, force: true })
      rmSync(bin, { recursive: true, force: true })
    }
  })

  it('rejects nonempty output before the first log header', async () => {
    await expect(extract('preamble\n')).rejects.toThrow(
      'Could not extract owner/repo: malformed log preamble'
    )
  })
})

async function extract(output: string): Promise<unknown> {
  const directory = mkdtempSync(join(tmpdir(), 'kw014-log-'))
  const bin = mkdtempSync(join(tmpdir(), 'kw014-bin-'))
  const fakeGit = join(bin, 'git')
  const originalPath = process.env.PATH
  writeFileSync(fakeGit, `#!/bin/sh\nprintf '${output}'\n`)
  chmodSync(fakeGit, 0o755)
  process.env.PATH = `${bin}${delimiter}${originalPath ?? ''}`
  try {
    return await extractRepo('owner/repo', directory)
  } finally {
    process.env.PATH = originalPath
    rmSync(directory, { recursive: true, force: true })
    rmSync(bin, { recursive: true, force: true })
  }
}
