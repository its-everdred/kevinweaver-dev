import { AdditiveBlending, Color, ShaderMaterial } from 'three'
import type { BufferAttribute } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { buildGalaxyPoints, createStarField } from '../src/galaxyStars'
import {
  THEME,
  changedVertices,
  colorOf,
  frameAt,
  indexOf,
  layout,
  toHex,
} from './galaxyFixtures'

/** Rec.709 relative luminance of an already-linearized three.js color. */
function luminance(hex: number): number {
  const color = new Color(hex)
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b
}

/** WCAG contrast ratio between two colors, both in the working color space. */
function contrast(hex: number, against: number): number {
  const high = Math.max(luminance(hex), luminance(against))
  const low = Math.min(luminance(hex), luminance(against))
  return (high + 0.05) / (low + 0.05)
}

describe('buildGalaxyPoints', () => {
  it('builds one vertex for every star in the whole disc', () => {
    const source = layout()
    const points = buildGalaxyPoints(source, THEME)
    expect(points.geometry.getAttribute('position').count).toBe(source.starCount)
    expect(points.geometry.getAttribute('color').count).toBe(source.starCount)
    expect(points.geometry.getAttribute('size').count).toBe(source.starCount)
    const material = points.material as ShaderMaterial
    expect(material.transparent).toBe(true)
    expect(material.blending).toBe(AdditiveBlending)
    points.geometry.dispose()
    material.dispose()
  })

  it('renders an untouched star measurably against the background', () => {
    const source = layout()
    const points = buildGalaxyPoints(source, THEME)
    const quiet = indexOf(source, 2, 'q.ts')
    expect(toHex(colorOf(points, quiet))).toBe(THEME.star)
    // Peak star pixel over the background: an untouched star must clear the
    // same 4.5:1 contrast the accessibility suite demands of body text.
    expect(contrast(THEME.star, THEME.background)).toBeGreaterThanOrEqual(4.5)
    points.geometry.dispose()
    ;(points.material as ShaderMaterial).dispose()
  })
})

describe('createStarField', () => {
  it('promotes only the current step and keeps earlier stars bright', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.currentStar)
    field.setFrame(source, frameAt(1))
    field.setFrame(source, frameAt(2))
    field.setFrame(source, frameAt(3))
    field.setFrame(source, frameAt(4))
    field.setFrame(source, frameAt(5))
    // Zapped at step 0, still bright five steps later: brightness never reverts.
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 1, 'd.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 2, 'q.ts')))).toBe(THEME.star)
    field.dispose()
  })

  it('writes only the vertices the step it leaves and the step it enters name', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(1))
    field.setFrame(source, frameAt(2))
    const colors = field.points.geometry.getAttribute('color').array as Float32Array
    const before = Float32Array.from(colors)
    const written = field.setFrame(source, frameAt(3))
    const changed = changedVertices(before, colors)
    // Step 3 names nothing; only step 2's star demotes from current to live.
    expect(changed).toEqual([indexOf(source, 0, 'b.ts')])
    expect(written).toBe(1)
    field.dispose()
  })

  it('performs no attribute writes when the step repeats', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(2))
    const attribute = field.points.geometry.getAttribute('color') as BufferAttribute
    const colors = attribute.array as Float32Array
    colors.fill(-1)
    const version = attribute.version
    expect(field.setFrame(source, frameAt(2))).toBe(0)
    expect(colors.every((value) => value === -1)).toBe(true)
    expect(attribute.version).toBe(version)
    field.dispose()
  })

  it('demotes without reverting when playback steps backward', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(1))
    field.setFrame(source, frameAt(2))
    const colors = field.points.geometry.getAttribute('color').array as Float32Array
    const before = Float32Array.from(colors)
    const written = field.setFrame(source, frameAt(1))
    expect(changedVertices(before, colors)).toEqual([indexOf(source, 0, 'b.ts')])
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    expect(written).toBe(1)
    field.dispose()
  })

  it('resyncs cumulative brightness across a seek', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    // Jump past step 2 without rendering it: its star must still be bright.
    field.setFrame(source, frameAt(5))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 2, 'q.ts')))).toBe(THEME.star)
    field.dispose()
  })

  it('rebuilds the field on a seek instead of stranding a star bright', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(3))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.liveStar)
    // Seeking back past step 2 — which the rolling window does every time it
    // rolls over — must return b.ts to untouched, or the second pass replays
    // over an already fully lit disc.
    field.setFrame(source, frameAt(1))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.star)
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.liveStar)
    field.dispose()
  })

  it('uploads the rebuilt field even when the step it seeks to names nothing', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(2))
    const attribute = field.points.geometry.getAttribute('color') as BufferAttribute
    const version = attribute.version
    field.setFrame(source, frameAt(5))
    field.setFrame(source, frameAt(1))
    expect(attribute.version).toBeGreaterThan(version)
    field.dispose()
  })

  it('releases its geometry and material on dispose', () => {
    const field = createStarField(layout(), THEME)
    const geometry = vi.spyOn(field.points.geometry, 'dispose')
    const material = vi.spyOn(field.points.material as ShaderMaterial, 'dispose')
    field.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})
