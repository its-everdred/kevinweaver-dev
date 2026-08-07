import { AdditiveBlending, Points, ShaderMaterial } from 'three'
import type { BufferAttribute } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { layoutUniverse } from '../src/galaxy'
import { HAZE_RATIO, createGalaxyHaze } from '../src/galaxyHaze'
import { buildGalaxyPoints } from '../src/galaxyStars'
import { worldX, worldY } from '../src/galaxyWorld'
import type { UniverseSnapshot } from '../src/types'
import { THEME, layout } from './galaxyFixtures'

/** Enough stars that a distribution is a distribution and not four samples. */
const CROWD: UniverseSnapshot = {
  repos: Array.from({ length: 12 }, (_, repo) => ({
    id: repo,
    name: `a/r${repo}`,
    files: Array.from({ length: 40 }, (_, file) => `src/f${file}.ts`),
  })),
  contributions: [],
  stepCount: 4,
}

function floats(points: Points, name: string): Float32Array {
  return (points.geometry.getAttribute(name) as BufferAttribute).array as Float32Array
}

function extent(points: Points, name: string): { low: number; high: number } {
  const values = floats(points, name)
  return { low: Math.min(...values), high: Math.max(...values) }
}

describe('createGalaxyHaze', () => {
  it('draws every cloud in one object, at the reference ratio to the stars', () => {
    const source = layoutUniverse(CROWD)
    const haze = createGalaxyHaze(source, THEME)
    // One Points object for the whole haze: the galaxy pays one draw call for
    // its nebulosity, not one per cloud.
    expect(haze.points).toBeInstanceOf(Points)
    expect(haze.points.geometry.getAttribute('position').count).toBe(
      Math.ceil(source.starCount * HAZE_RATIO)
    )
    const material = haze.points.material as ShaderMaterial
    expect(material.blending).toBe(AdditiveBlending)
    expect(material.depthWrite).toBe(false)
    haze.dispose()
  })

  it('hangs every cloud on a star, so the haze hugs the arms', () => {
    const source = layoutUniverse(CROWD)
    const haze = createGalaxyHaze(source, THEME)
    const positions = floats(haze.points, 'position')
    for (let cloud = 0; cloud * 3 < positions.length; cloud++) {
      // The haze is drawn from the star distribution itself rather than from a
      // second generator: a cloud sits on the star it was drawn from, close
      // enough to belong to the same arm.
      const star = source.stars[cloud * 2]
      if (!star) throw new Error(`cloud ${cloud} has no star`)
      const dx = (positions[cloud * 3] ?? 0) - worldX(star.x)
      const dy = (positions[cloud * 3 + 1] ?? 0) - worldY(star.y)
      expect(Math.hypot(dx, dy)).toBeLessThan(0.25)
    }
    haze.dispose()
  })

  it('draws clouds far larger and far fainter than the stars', () => {
    const source = layoutUniverse(CROWD)
    const stars = buildGalaxyPoints(source, THEME)
    const haze = createGalaxyHaze(source, THEME)
    const starSize = extent(stars, 'size')
    const hazeSize = extent(haze.points, 'size')
    // The reference sizes haze at 20-50 against stars at 0.25-5.0. Ours is the
    // same relationship in the units this field is drawn in: the smallest
    // cloud still dwarfs the largest star.
    expect(hazeSize.low).toBeGreaterThan(starSize.high * 3)
    // Nebulosity, not fog: the brightest cloud is a small fraction of the
    // faintest star, so the stars stay the subject of the picture.
    expect(extent(haze.points, 'brightness').high).toBeLessThan(
      extent(stars, 'brightness').low / 8
    )
    // Feathered to its rim, the way the reference's sprite texture is: this is
    // what makes a cloud read as a cloud rather than as a large dot.
    expect(extent(haze.points, 'softness').low).toBeGreaterThan(0.9)
    stars.geometry.dispose()
    ;(stars.material as ShaderMaterial).dispose()
    haze.dispose()
  })

  it('sits behind the stars', () => {
    const haze = createGalaxyHaze(layout(), THEME)
    const stars = buildGalaxyPoints(layout(), THEME)
    expect(haze.points.renderOrder).toBeLessThan(stars.renderOrder)
    stars.geometry.dispose()
    ;(stars.material as ShaderMaterial).dispose()
    haze.dispose()
  })

  it('derives every cloud from a hash, so two builds agree byte for byte', () => {
    // The reference generator is `Math.random` per cloud. Nothing that reaches
    // a vertex here may be: a render has to be reproducible, so every term is
    // a hash of the star's own key. (three.js spends `Math.random` on object
    // UUIDs, which is why this asserts the buffers rather than the global.)
    const first = createGalaxyHaze(layoutUniverse(CROWD), THEME)
    const second = createGalaxyHaze(layoutUniverse(CROWD), THEME)
    for (const name of ['position', 'size', 'brightness', 'softness', 'color'])
      expect(floats(first.points, name)).toEqual(floats(second.points, name))
    first.dispose()
    second.dispose()
  })

  it('releases its geometry and material on dispose', () => {
    const haze = createGalaxyHaze(layout(), THEME)
    const geometry = vi.spyOn(haze.points.geometry, 'dispose')
    const material = vi.spyOn(haze.points.material as ShaderMaterial, 'dispose')
    haze.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})
