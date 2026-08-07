import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Material,
  Points,
  ShaderMaterial,
} from 'three'
import type { Color } from 'three'
import type { StarPosition, UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from './galaxyShader'
import {
  toColor,
  worldX,
  worldY,
  worldZ,
  writeColor,
  type GalaxySceneTheme,
} from './galaxyWorld'

/** The disc's single star field, with brightness that only ever increases. */
export interface StarField {
  readonly points: Points
  /**
   * Promotes the vertices this frame names and demotes the step it leaves.
   * Returns how many vertices were written, which is 0 for a repeated step.
   */
  setFrame(layout: UniverseLayout, frame: UniverseFrame): number
  dispose(): void
}

/**
 * @description Builds the Points object for the whole disc. One geometry holds
 * every star, in layout order, so a vertex index is a layout index.
 * @param layout The layout; star positions are already in field space.
 * @param theme Color palette.
 * @returns A three.js Points object with every star at its untouched color.
 */
export function buildGalaxyPoints(
  layout: UniverseLayout,
  theme: GalaxySceneTheme
): Points {
  const count = layout.stars.length
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const scales = new Float32Array(count).fill(1)
  const starColor = toColor(theme.star)

  for (let index = 0; index < count; index++) {
    const star = layout.stars[index]
    if (!star) continue
    const offset = index * 3
    positions[offset] = worldX(star.x)
    positions[offset + 1] = worldY(star.y)
    positions[offset + 2] = worldZ(star.z)
    writeColor(colors, index, starColor)
    sizes[index] = starSize(star)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const color = new BufferAttribute(colors, 3)
  // Brightness is the only attribute playback mutates, and it mutates a
  // handful of vertices per step.
  color.setUsage(DynamicDrawUsage)
  geometry.setAttribute('color', color)
  geometry.setAttribute('size', new BufferAttribute(sizes, 1))
  geometry.setAttribute('scale', new BufferAttribute(scales, 1))

  const material = new ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    vertexColors: true,
  })

  return new Points(geometry, material)
}

/** Deterministic per-star size, from stable identifiers rather than a clock. */
function starSize(star: StarPosition): number {
  return 0.09 + ((star.repoId + star.file.length) % 8) * 0.008
}

/**
 * @description Creates the disc's star field, where brightness is cumulative
 * history rather than current state: a star only ever moves from untouched to
 * live, and only on the step that names it. Per-step cost is proportional to
 * that step's contribution count, never to the total star count.
 * @param layout The layout to build the field from.
 * @param theme Color palette.
 * @returns The Points object plus its step-driven color updates.
 */
export function createStarField(
  layout: UniverseLayout,
  theme: GalaxySceneTheme
): StarField {
  const points = buildGalaxyPoints(layout, theme)
  const attribute = points.geometry.getAttribute('color') as BufferAttribute
  const colors = attribute.array as Float32Array
  const untouched = toColor(theme.star)
  const live = toColor(theme.liveStar)
  const current = toColor(theme.currentStar)
  // Outside the clamped step range in both directions, so the first frame
  // resyncs against the frame's live set instead of advancing into it.
  let lastStep = -2
  let lastCurrent: readonly string[] = []

  const paint = (
    source: UniverseLayout,
    keys: Iterable<string>,
    color: Color
  ): number => {
    let written = 0
    for (const key of keys) {
      const index = source.starIndex.get(key)
      if (index === undefined) continue
      writeColor(colors, index, color)
      written++
    }
    return written
  }

  /** Returns every vertex to untouched, so a seek starts from a dark disc. */
  const reset = (): void => {
    for (let index = 0; index < layout.starCount; index++)
      writeColor(colors, index, untouched)
  }

  return {
    points,
    setFrame(source, frame) {
      if (frame.step === lastStep) return 0
      // A single step, in either direction, only has to demote the step it
      // leaves. A seek lands anywhere, including the roll-over from the
      // window's oldest day back to its newest, so it rebuilds the field from
      // this step's live set: leaving the previous pass's stars lit would make
      // every pass after the first replay over an already bright disc.
      const seeked = Math.abs(frame.step - lastStep) !== 1
      if (seeked) reset()
      const written = seeked
        ? paint(source, frame.liveFiles, live)
        : paint(source, lastCurrent, live)
      const promoted = written + paint(source, frame.currentFiles, current)
      lastStep = frame.step
      lastCurrent = frame.currentFiles
      if (seeked || promoted > 0) attribute.needsUpdate = true
      return promoted
    },
    dispose() {
      points.geometry.dispose()
      const material = points.material
      if (material instanceof Material) material.dispose()
    },
  }
}
