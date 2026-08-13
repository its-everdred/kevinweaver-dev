import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { assembleInput } from './encode-stage-input.ts'
// @ts-expect-error Node 24 loads this explicit TypeScript extension directly.
import { calendar, discovery, extraction } from './encode-stages-fixture.ts'

describe('assembleInput private monthly padding', () => {
  beforeEach(() => {
    process.env.GITHUB_SHA = 'abcdef012345'
  })

  afterEach(() => {
    delete process.env.GITHUB_SHA
  })

  it('pads a short private series to the calendar window', () => {
    const input = assembleInput(
      { ...calendar(), windowStart: '2026-07-01', windowEnd: '2026-08-13' },
      { p: [5], degraded: ['private'] },
      discovery(),
      extraction(),
      null
    )
    expect(input.grid.p).toEqual([5, 0])
  })

  it('keeps an already-correct private series unchanged', () => {
    const input = assembleInput(
      calendar(),
      { p: [5], degraded: [] },
      discovery(),
      extraction(),
      null
    )
    expect(input.grid.p).toEqual([5])
  })
})
