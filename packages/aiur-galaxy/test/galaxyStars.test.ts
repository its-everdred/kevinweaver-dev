import { AdditiveBlending, Color, ShaderMaterial } from 'three'
import type { BufferAttribute, Points } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { layoutUniverse } from '../src/galaxy'
import { buildGalaxyPoints, createStarField } from '../src/galaxyStars'
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from '../src/galaxyShader'
import type { UniverseSnapshot } from '../src/types'
import { universeFrame } from '../src/universePlayback'
import {
  THEME,
  changedVertices,
  colorOf,
  frameAt,
  indexOf,
  layout,
  toHex,
} from './galaxyFixtures'

/**
 * How far a star's color has travelled from the flash toward the permanent lit
 * color: 0 is `currentStar`, 1 is `liveStar`. Read off the raw buffer floats
 * rather than a packed hex, so a single day slot of decay is measurable instead
 * of being rounded away by the 8-bit round trip.
 */
function mix(rgb: readonly number[]): number {
  const from = new Color(THEME.currentStar)
  const to = new Color(THEME.liveStar)
  return ((rgb[0] ?? 0) - from.r) / (to.r - from.r)
}

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

describe('star dynamic range', () => {
  /** Enough stars that a distribution is a distribution and not four samples. */
  const CROWD: UniverseSnapshot = {
    repos: Array.from({ length: 12 }, (_, repo) => ({
      id: repo,
      name: `a/r${repo}`,
      files: Array.from({ length: 250 }, (_, file) => `src/mod-${file}.ts`),
    })),
    contributions: [{ step: 0, repo: 0, file: 'src/mod-0.ts', actor: 0 as const }],
    stepCount: 2,
  }

  function attribute(points: Points, name: string): Float32Array {
    return points.geometry.getAttribute(name).array as Float32Array
  }

  function crowd(): Points {
    return buildGalaxyPoints(layoutUniverse(CROWD), THEME)
  }

  /** Mean of `values` over the indices the ranking puts in a given decile. */
  function decileMean(
    values: Float32Array,
    ranking: Float32Array,
    from: number,
    to: number
  ): number {
    const order = [...ranking.keys()].sort(
      (left, right) => (ranking[left] ?? 0) - (ranking[right] ?? 0)
    )
    const slice = order.slice(
      Math.floor(order.length * from),
      Math.floor(order.length * to)
    )
    return slice.reduce((sum, index) => sum + (values[index] ?? 0), 0) / slice.length
  }

  it('gives every star its own softness and brightness', () => {
    const source = layout()
    const points = buildGalaxyPoints(source, THEME)
    expect(points.geometry.getAttribute('softness').count).toBe(source.starCount)
    expect(points.geometry.getAttribute('brightness').count).toBe(source.starCount)
    points.geometry.dispose()
    ;(points.material as ShaderMaterial).dispose()
  })

  it('derives the whole appearance from the star key, byte for byte', () => {
    const first = crowd()
    const second = crowd()
    for (const name of ['size', 'softness', 'brightness']) {
      expect([...attribute(first, name)]).toEqual([...attribute(second, name)])
    }
    // A single value repeated for every star is reproducible but not a range.
    for (const name of ['size', 'softness', 'brightness']) {
      expect(new Set(attribute(first, name)).size).toBeGreaterThan(8)
    }
  })

  it('makes most stars faint and only a minority bright', () => {
    const points = crowd()
    const brightness = attribute(points, 'brightness')
    const low = Math.min(...brightness)
    const high = Math.max(...brightness)
    const span = high - low
    const dim = [...brightness].filter((value) => value < low + span * 0.5).length
    const brightest = [...brightness].filter((value) => value > low + span * 0.8).length
    // A real star field's magnitude distribution is heavily skewed: most of
    // the sky is faint, and the handful of bright stars are what the eye reads
    // as structure. A uniform draw would put 50% and 20% in these two buckets.
    expect(dim / brightness.length).toBeGreaterThan(0.7)
    expect(brightest / brightness.length).toBeLessThan(0.12)
    expect(brightest).toBeGreaterThan(0)
  })

  it('draws every star as a dot, the brightest tighter and larger', () => {
    const points = crowd()
    const brightness = attribute(points, 'brightness')
    const softness = attribute(points, 'softness')
    const size = attribute(points, 'size')
    const faintSoftness = decileMean(softness, brightness, 0, 0.1)
    const brightSoftness = decileMean(softness, brightness, 0.9, 1)
    const faintSize = decileMean(size, brightness, 0, 0.1)
    const brightSize = decileMean(size, brightness, 0.9, 1)
    expect(brightSoftness).toBeLessThan(faintSoftness)
    expect(brightSize).toBeGreaterThan(faintSize)
    // The ordering has to be visible, not merely present.
    expect(faintSoftness - brightSoftness).toBeGreaterThan(0.1)
    expect(brightSize / faintSize).toBeGreaterThan(1.5)
    // But no star is a smudge. Softness is what the fragment shader turns into
    // blur radius, and the magnitude skew means the faint end is most of the
    // field: letting it drift high is what made the whole disc read as
    // overlapping blurry circles rather than as a star field.
    expect(faintSoftness).toBeLessThan(0.45)
  })

  it('keeps even the faintest star clear of the background', () => {
    const points = crowd()
    const faintest = Math.min(...attribute(points, 'brightness'))
    const star = new Color(THEME.star)
    const dimmed =
      0.2126 * star.r * faintest +
      0.7152 * star.g * faintest +
      0.0722 * star.b * faintest
    const background = luminance(THEME.background)
    // The dynamic range runs downward from the palette, so the dimmest star is
    // the one the 4.5:1 floor has to hold; anything less and the quiet repos
    // go back to looking like empty space.
    expect((dimmed + 0.05) / (background + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  it('feeds the shader a per-star softness rather than one blur for all', () => {
    expect(STAR_VERTEX_SHADER).toContain('attribute float softness;')
    expect(STAR_VERTEX_SHADER).toContain('attribute float brightness;')
    // The old fragment shader hard-coded smoothstep(0.3, 0.7, dist) for every
    // star, which is exactly the uniform mush this replaces.
    expect(STAR_FRAGMENT_SHADER).toContain('vSoftness')
    expect(STAR_FRAGMENT_SHADER).not.toMatch(/smoothstep\(\s*0\.3\s*,\s*0\.7/)
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
    // Zapped at step 0, still lit five steps later and further through its fade
    // than the star zapped at step 2: brightness never reverts, and the flash
    // decays in step order instead of every lit star sharing one color.
    const oldest = mix(colorOf(field.points, indexOf(source, 0, 'a.ts')))
    const newer = mix(colorOf(field.points, indexOf(source, 0, 'b.ts')))
    expect(oldest).toBeGreaterThan(newer)
    expect(newer).toBeGreaterThan(0)
    expect(oldest).toBeLessThan(1)
    expect(mix(colorOf(field.points, indexOf(source, 1, 'd.ts')))).toBeCloseTo(oldest, 10)
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

  it('paints every star of the selected repo, and only that repo', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    const written = field.setSelection(source, frameAt(0), 0)
    // Repo 0 owns a.ts, b.ts, and c.ts; nothing else may change color.
    expect(written).toBe(3)
    for (const file of ['a.ts', 'b.ts', 'c.ts'])
      expect(toHex(colorOf(field.points, indexOf(source, 0, file)))).toBe(THEME.selectedStar)
    expect(toHex(colorOf(field.points, indexOf(source, 1, 'd.ts')))).toBe(THEME.currentStar)
    expect(toHex(colorOf(field.points, indexOf(source, 2, 'q.ts')))).toBe(THEME.star)
    field.dispose()
  })

  it('is a color no other star state uses', () => {
    const others = [THEME.star, THEME.liveStar, THEME.currentStar]
    expect(others).not.toContain(THEME.selectedStar)
  })

  it('restores the step the deselected repo was showing', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(2))
    field.setSelection(source, frameAt(2), 0)
    field.setSelection(source, frameAt(2), null)
    // a.ts was lit on step 0 and stays live; b.ts is this step's contribution;
    // c.ts was never touched. Deselecting must give all three back, not blank
    // the repo out.
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.liveStar)
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.currentStar)
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'c.ts')))).toBe(THEME.star)
    field.dispose()
  })

  it('holds the selection across a step advance and a seek', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    field.setSelection(source, frameAt(0), 0)
    field.setFrame(source, frameAt(1))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'a.ts')))).toBe(THEME.selectedStar)
    field.setFrame(source, frameAt(5))
    expect(toHex(colorOf(field.points, indexOf(source, 0, 'b.ts')))).toBe(THEME.selectedStar)
    field.dispose()
  })

  it('writes nothing when the same repo is selected again', () => {
    const source = layout()
    const field = createStarField(source, THEME)
    field.setFrame(source, frameAt(0))
    field.setSelection(source, frameAt(0), 0)
    const attribute = field.points.geometry.getAttribute('color') as BufferAttribute
    const version = attribute.version
    expect(field.setSelection(source, frameAt(0), 0)).toBe(0)
    expect(attribute.version).toBe(version)
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

describe('contribution flash fade', () => {
  /**
   * The operator's ask, stated here rather than imported: the flash decays over
   * a week of day slots. Written independently of whatever constant the field
   * uses, so shortening the fade fails these tests instead of moving with them.
   */
  const WEEK = 7
  /**
   * One contribution, far enough from either end of the timeline that the whole
   * week can be walked in both directions. The shared six-step fixture cannot
   * reach the end of a week, and `galaxyFixtures` belongs to another change in
   * flight, so this one is local.
   */
  const TOUCH = WEEK + 1
  const FADING: UniverseSnapshot = {
    repos: [
      { id: 0, name: 'a/lit', files: ['a.ts'] },
      { id: 1, name: 'a/quiet', files: ['q.ts'] },
    ],
    contributions: [{ step: TOUCH, repo: 0, file: 'a.ts', actor: 0 as const }],
    stepCount: TOUCH + WEEK + 2,
  }

  function fading(): ReturnType<typeof layoutUniverse> {
    return layoutUniverse(FADING)
  }

  function forward(step: number): ReturnType<typeof universeFrame> {
    return universeFrame(FADING, step, 'forward')
  }

  it('eases the flash back to the lit color over a week of day slots', () => {
    const source = fading()
    const field = createStarField(source, THEME)
    const star = indexOf(source, 0, 'a.ts')
    const shades: number[] = []
    for (let age = 0; age <= WEEK; age++) {
      field.setFrame(source, forward(TOUCH + age))
      shades.push(mix(colorOf(field.points, star)))
    }
    // Full flash on the day of the commit, all the way back to the permanent
    // lit color a week later, and strictly on its way there in between.
    expect(shades[0]).toBeCloseTo(0, 6)
    expect(shades[WEEK]).toBeCloseTo(1, 6)
    for (let age = 1; age <= WEEK; age++)
      expect(shades[age]).toBeGreaterThan(shades[age - 1] ?? 1)
    // A week is the whole of it: the slot after lands on `liveStar` and stays.
    field.setFrame(source, forward(TOUCH + WEEK + 1))
    expect(toHex(colorOf(field.points, star))).toBe(THEME.liveStar)
    field.dispose()
  })

  it('lands the fade on the lit color, never back on the untouched one', () => {
    const source = fading()
    const field = createStarField(source, THEME)
    const star = indexOf(source, 0, 'a.ts')
    const quiet = indexOf(source, 1, 'q.ts')
    for (let step = TOUCH; step < FADING.stepCount; step++) {
      field.setFrame(source, forward(step))
      // Brightness is cumulative: a star the log has named never goes dark
      // again, and a star it has not named never lights.
      expect(toHex(colorOf(field.points, star))).not.toBe(THEME.star)
      expect(toHex(colorOf(field.points, quiet))).toBe(THEME.star)
    }
    expect(toHex(colorOf(field.points, star))).toBe(THEME.liveStar)
    field.dispose()
  })

  it('shows a seek the shade a play-through would have reached', () => {
    const source = fading()
    const played = createStarField(source, THEME)
    const jumped = createStarField(source, THEME)
    const star = indexOf(source, 0, 'a.ts')
    for (let age = 0; age <= 3; age++) played.setFrame(source, forward(TOUCH + age))
    jumped.setFrame(source, forward(TOUCH))
    jumped.setFrame(source, forward(TOUCH + 3))
    expect(colorOf(jumped.points, star)).toEqual(colorOf(played.points, star))
    // Mid-fade, so the two agree on a shade rather than on either end of it.
    expect(mix(colorOf(played.points, star))).toBeGreaterThan(0)
    expect(mix(colorOf(played.points, star))).toBeLessThan(1)
    played.dispose()
    jumped.dispose()
  })

  it('ages the flash in playback order when the disc plays backward', () => {
    const source = fading()
    const field = createStarField(source, THEME)
    const star = indexOf(source, 0, 'a.ts')
    const shades: number[] = []
    // Backward playback meets a contribution at its own step and walks away
    // from it toward the past, so the flash ages down the timeline, not up it.
    for (let age = 0; age <= WEEK; age++) {
      field.setFrame(source, universeFrame(FADING, TOUCH - age, 'backward'))
      shades.push(mix(colorOf(field.points, star)))
    }
    expect(shades[0]).toBeCloseTo(0, 6)
    expect(shades[WEEK]).toBeCloseTo(1, 6)
    for (let age = 1; age <= WEEK; age++)
      expect(shades[age]).toBeGreaterThan(shades[age - 1] ?? 1)
    field.dispose()
  })

  it('writes the week behind the step, never the whole field', () => {
    const source = fading()
    const field = createStarField(source, THEME)
    field.setFrame(source, forward(TOUCH))
    const colors = field.points.geometry.getAttribute('color').array as Float32Array
    const before = Float32Array.from(colors)
    const written = field.setFrame(source, forward(TOUCH + 1))
    // One star sits inside the fade window. Every other vertex in the disc is
    // named by nothing this week and must not be written at all.
    expect(written).toBe(1)
    expect(changedVertices(before, colors)).toEqual([indexOf(source, 0, 'a.ts')])
    expect(source.starCount).toBeGreaterThan(1)
    field.dispose()
  })
})
