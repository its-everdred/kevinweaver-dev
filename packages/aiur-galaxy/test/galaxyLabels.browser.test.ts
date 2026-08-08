import { describe, expect, it } from 'vitest'

import { createRepoLabels } from '../src/galaxyLabels'
import { THEME, layout } from './galaxyFixtures'

/**
 * The label plate is painted with `ctx.filter = blur(...)`, which jsdom does
 * not implement — a node test sees an unblurred rectangle and would pass on
 * exactly the edge this file exists to measure. So this runs in Chromium and
 * reads the painted texels back.
 */
function plate(): ImageData {
  const labels = createRepoLabels(layout().repos, THEME)
  const first = labels.meshes[0]
  if (!first) throw new Error('no label was built')
  const source = first.material.map?.image as HTMLCanvasElement | undefined
  if (!source) throw new Error('label has no texture')
  const ctx = source.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  return ctx.getImageData(0, 0, source.width, source.height)
}

/** Highest alpha found anywhere on the one-texel border of the texture. */
function borderAlpha(image: ImageData): number {
  const { width, height, data } = image
  let peak = 0
  const at = (x: number, y: number): number => data[(y * width + x) * 4 + 3] ?? 0
  for (let x = 0; x < width; x++) peak = Math.max(peak, at(x, 0), at(x, height - 1))
  for (let y = 0; y < height; y++) peak = Math.max(peak, at(0, y), at(width - 1, y))
  return peak
}

describe('label backdrop', () => {
  it('fades to nothing before it reaches the texture edge', () => {
    // A blurred rectangle inset by less than its own blur radius has its
    // gaussian tail cut off flat against the texture bounds, and the plate
    // ends on a hard step instead of a fade — which is what reads as a jagged
    // edge on screen. The alpha on the border is that step, measured: it was
    // 31 of 255, and four standard deviations of margin bring it to 4.
    //
    // The bound is 6 rather than 0 because a gaussian never truly reaches
    // zero, and it does not need to: the fill is very nearly black, so 6/255
    // of it composited over an almost-black backdrop is a step no display
    // resolves. 31 was a visible rectangle; this is not.
    expect(borderAlpha(plate())).toBeLessThanOrEqual(6)
  })

  it('falls off gradually rather than in one step', () => {
    // Softness is not just "zero at the edge": a plate could reach zero in a
    // single texel and still look cut out. Walking in from the border, the
    // alpha has to climb over many texels before it saturates.
    const image = plate()
    const middle = Math.floor(image.height / 2)
    const alphaAt = (x: number): number =>
      image.data[(middle * image.width + x) * 4 + 3] ?? 0
    const solid = alphaAt(Math.floor(image.width / 2))
    let ramp = 0
    for (let x = 0; x < image.width / 2; x++) {
      const alpha = alphaAt(x)
      if (alpha > 1 && alpha < solid - 1) ramp++
    }
    expect(ramp).toBeGreaterThanOrEqual(12)
  })

  it('is dark enough to hold text off a dense star field', () => {
    const image = plate()
    const middle = Math.floor(image.height / 2)
    const centre = (middle * image.width + Math.floor(image.width / 2)) * 4
    // Opaque enough that stars behind it do not compete with the glyphs, and
    // dark enough that the label's own colour is the brightest thing on it.
    expect(image.data[centre + 3] ?? 0).toBeGreaterThanOrEqual(210)
    expect(image.data[centre] ?? 255).toBeLessThanOrEqual(12)
  })
})
