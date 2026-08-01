import { expect, test } from 'vitest'
import { drawCallsUnderFilter, type Call } from './canvas-recorder'

test('drawCallsUnderFilter reads a hand-built call log without a canvas', () => {
  const calls: Call[] = [
    ['fillRect', 0, 0, 1, 1],
    ['set:filter', 'blur(4px)'],
    ['fillRect', 0, 0, 1, 1],
    ['stroke'],
    ['save'],
    ['set:filter', 'none'],
    ['fillRect', 0, 0, 1, 1],
  ]
  expect(drawCallsUnderFilter(calls)).toBe(2)
})
