import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { encodeBundle, writeBundle } from './encode.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { validInput } from './encode-fixture.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { bundleHash } from './encode-hash.ts'
// prettier-ignore
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { recoverPipelineState, stagePipelineState } from './encode-state-journal.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { readState } from './state.ts'

describe('pipeline state journal', () => {
  it('commits an interrupted first publication when its hash matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kw014-journal-'))
    const target = join(root, 'bundle')
    const statePath = join(root, 'state.json')
    const bundle = encodeBundle(validInput())
    const pending = {
      schema: 1 as const,
      repos: {},
      bundleHash: bundleHash(bundle),
    }
    await stagePipelineState(statePath, pending)
    await writeBundle(bundle, target)

    const recovered = await recoverPipelineState(statePath, target, null)

    expect(recovered).toEqual(pending)
    await expect(readState(statePath)).resolves.toEqual(pending)
  })

  it('discards a journal that does not describe the visible generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kw014-journal-'))
    const target = join(root, 'bundle')
    const statePath = join(root, 'state.json')
    await stagePipelineState(statePath, {
      schema: 1,
      repos: {},
      bundleHash: 'sha256-mismatch',
    })
    await writeBundle(encodeBundle(validInput()), target)

    await expect(
      recoverPipelineState(statePath, target, null)
    ).resolves.toBeNull()
    await expect(readState(`${statePath}.pending`)).resolves.toBeNull()
  })
})
