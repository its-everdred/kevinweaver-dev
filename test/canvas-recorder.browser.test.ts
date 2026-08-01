import { expect, test } from 'vitest'
import { drawCallsUnderFilter, recordContext } from './canvas-recorder'

function make2d(): CanvasRenderingContext2D {
  const el = document.createElement('canvas')
  el.width = 8
  el.height = 8
  const ctx = el.getContext('2d')
  if (ctx === null) throw new Error('no 2d context')
  return ctx
}

test('the canvas project gets a real 2D context', () => {
  const ctx = make2d()
  ctx.fillStyle = '#98971a'
  ctx.fillRect(0, 0, 8, 8)
  // Impossible under jsdom: this is what proves the project runs in Chromium.
  const px = ctx.getImageData(0, 0, 1, 1).data
  expect([px[0], px[1], px[2], px[3]]).toEqual([0x98, 0x97, 0x1a, 255])
})

test('recordContext captures the draw-command sequence rounded to 3 dp', () => {
  const { ctx, calls } = recordContext(make2d())
  ctx.fillStyle = '#b8bb26'
  ctx.fillRect(0.12345678, 1, 2, 3)
  expect(calls).toEqual([
    ['set:fillStyle', '#b8bb26'],
    ['fillRect', 0.123, 1, 2, 3],
  ])
})

test('drawCallsUnderFilter counts draws issued while ctx.filter is set', () => {
  const { ctx, calls } = recordContext(make2d())
  ctx.filter = 'blur(4px)'
  ctx.fillRect(0, 0, 1, 1)
  ctx.filter = 'none'
  ctx.fillRect(0, 0, 1, 1)
  expect(drawCallsUnderFilter(calls)).toBe(1)
})
