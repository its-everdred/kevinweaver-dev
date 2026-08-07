import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { extractRepo, isVendored } from './extract-log.ts'

describe('vendored paths', () => {
  it('drops dependency trees and build output', () => {
    for (const path of [
      'node_modules/react/index.js',
      'packages/app/node_modules/lodash/get.js',
      'bower_components/jquery/jquery.js',
      'vendor/bundle/gem.rb',
      'ios/Pods/Alamofire/Source/Request.swift',
      'dist/main.js',
      'client/build/static/js/2.chunk.js',
      '.venv/lib/site-packages/flask/app.py',
      'public/jquery.min.js',
      'assets/theme.min.css',
    ])
      expect(isVendored(path), path).toBe(true)
  })

  it('keeps authored source, including paths that merely resemble the excluded ones', () => {
    for (const path of [
      'src/index.ts',
      'README.md',
      // A file *named* for a vendored directory is still the author's work;
      // only a path segment counts, which is why every pattern is anchored.
      'docs/node_modules.md',
      'src/vendor.ts',
      'scripts/build.sh',
      'app/dist.py',
      'src/distribute/index.ts',
      'src/builder/main.go',
      // `.min.js` is a suffix, so a source file that contains it is kept.
      'src/minify.js',
      'lib/admin.js',
    ])
      expect(isVendored(path), path).toBe(false)
  })
})

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
