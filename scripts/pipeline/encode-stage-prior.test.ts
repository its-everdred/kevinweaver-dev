import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { bundleHash } from './encode-hash.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { calendarFromGrid, extractionNames, extractionPriors, privateFromGrid, readPriorGrid } from './encode-stage-prior.ts'

describe('prior stage inputs', () => {
  it('uses prior public grid data only after a successful state exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'kw014-prior-'))
    const input = validInput()
    input.grid.p = [37]
    const bundle = encodeBundle(input)
    await writeBundle(directory, bundle)

    const prior = await readPriorGrid(directory, {
      schema: 1,
      repos: {},
      bundleHash: bundleHash(bundle),
    })
    expect(prior).toMatchObject({ start: '2026-07-31', e: [40_000] })
    expect(calendarFromGrid(prior!).degraded).toEqual(['calendar'])
    expect(privateFromGrid(prior!)).toEqual({ p: [37], degraded: ['private'] })
    await expect(readPriorGrid(directory, null)).resolves.toBeUndefined()
  })

  it('retains every prior public repository for cache extraction', () => {
    const state = {
      schema: 1 as const,
      repos: {
        'owner/old': {
          heads: { 'refs/heads/main': 'a'.repeat(40) },
          events: 2,
          status: 'stale' as const,
          lastOk: null,
          consecutiveFailures: 6,
        },
      },
    }

    expect(extractionNames(['owner/current'], state)).toEqual([
      'owner/current',
      'owner/old',
    ])
    expect(extractionPriors(state)[0]).toMatchObject({
      n: 'owner/old',
      consecutiveFailures: 6,
    })
  })
})

async function writeBundle(
  directory: string,
  bundle: ReturnType<typeof encodeBundle>
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await Promise.all(
    bundle.files.map(async (file) => {
      const path = join(directory, file.path)
      await mkdir(join(path, '..'), { recursive: true })
      await writeFile(path, file.bytes)
    })
  )
}
