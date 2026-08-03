import { execFile as run } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'

const execFile = promisify(run)

describe('pipeline CLI entry points', () => {
  it('forwards bridge help to the pipeline CLI', async () => {
    const result = await execFile('npm', ['run', 'data:build', '--', '--help'])
    expect(result.stdout).toContain('Usage: data:build')
  })

  it('forwards a failing pipeline exit status', async () => {
    await expect(
      execFile('npm', ['run', 'data:build', '--', '--unknown'])
    ).rejects.toMatchObject({ code: 1 })
  })

  it('writes byte-identical direct CLI trees for pinned input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-cli-'))
    const input = join(directory, 'input.json')
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    await writeFile(
      input,
      JSON.stringify({ ...validInput(), generatedAt: '2000-01-01T00:00:00Z' })
    )
    await runCli(input, first, '2026-07-31T00:00:00Z')
    await runCli(input, second, '2026-07-31T00:00:00Z')
    await expect(tree(first)).resolves.toEqual(await tree(second))
    await expect(readManifest(first)).resolves.toMatchObject({
      generatedAt: '2026-07-31T00:00:00Z',
    })
  })

  it('varies only manifest time for unpinned runs', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-cli-time-'))
    const input = join(directory, 'input.json')
    const first = join(directory, 'first')
    const second = join(directory, 'second')
    await writeFile(input, JSON.stringify(validInput()))
    await runCli(input, first, undefined)
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    await runCli(input, second, undefined)
    await expect(onlyManifestTimeDiffers(first, second)).resolves.toBe(true)
  })
})

async function runCli(
  input: string,
  output: string,
  generatedAt?: string
): Promise<void> {
  const args = [
    'scripts/pipeline/encode.ts',
    '--input',
    input,
    '--out',
    output,
    '--state',
    `${output}.state.json`,
  ]
  if (generatedAt) args.push('--generated-at', generatedAt)
  await execFile(process.execPath, args)
}

async function readManifest(
  directory: string
): Promise<{ generatedAt: string }> {
  return JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
}

async function onlyManifestTimeDiffers(
  left: string,
  right: string
): Promise<boolean> {
  const leftTree = await tree(left)
  const rightTree = await tree(right)
  if (
    Object.keys(leftTree).some(
      (path) => path !== 'manifest.json' && leftTree[path] !== rightTree[path]
    )
  )
    return false
  const first = await readManifest(left)
  const second = await readManifest(right)
  return (
    first.generatedAt !== second.generatedAt &&
    JSON.stringify({ ...first, generatedAt: '' }) ===
      JSON.stringify({ ...second, generatedAt: '' })
  )
}

async function tree(
  directory: string,
  prefix = ''
): Promise<Record<string, string>> {
  const names = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    names.map(async (entry) => {
      const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      return entry.isDirectory()
        ? tree(join(directory, entry.name), path)
        : { [path]: await readFile(join(directory, entry.name), 'utf8') }
    })
  )
  return Object.assign({}, ...nested)
}
