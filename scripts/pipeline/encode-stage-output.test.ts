import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readStagedBundle, writeBundle } from './encode-stage-output.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validateBundle } from './validate.ts'

describe('staged output', () => {
  it('re-reads corrupt staged bytes before promotion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kw014-stage-'))
    const stage = join(root, 'stage')
    const target = join(root, 'target')
    const bundle = encodeBundle(validInput())
    await writeBundle(bundle, stage)
    await corrupt(join(stage, 'events/ee-00.json'))

    const staged = await readStagedBundle(bundle, stage)

    expect(validateBundle(staged, null).ok).toBe(false)
    await expect(readFile(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

async function corrupt(path: string): Promise<void> {
  const text = await readFile(path, 'utf8')
  await writeFile(path, text.replace('"d"', '"x"'))
}
