import { describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { loadStage, UpstreamUnavailableError } from './encode-stage-runtime.ts'

describe('dynamic stage loading', () => {
  it('classifies a missing module as unavailable upstream input', async () => {
    await expect(
      loadStage('./missing-pipeline-stage.ts', 'run')
    ).rejects.toBeInstanceOf(UpstreamUnavailableError)
  })

  it('classifies a missing binding as unavailable upstream input', async () => {
    await expect(
      loadStage('./calendar.ts', 'missingBinding')
    ).rejects.toBeInstanceOf(UpstreamUnavailableError)
  })
})
