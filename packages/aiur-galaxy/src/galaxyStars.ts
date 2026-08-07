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
import { hash01, starKey } from './galaxy'
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
  /**
   * Paints the selected repo's stars in the selection color and gives the
   * repo it replaces back to whatever the step says it should be. Passing null
   * clears the selection.
   * @returns How many vertices were written; 0 for a repeated selection.
   */
  setSelection(
    layout: UniverseLayout,
    frame: UniverseFrame | null,
    repoId: number | null
  ): number
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
  const softness = new Float32Array(count)
  const brightness = new Float32Array(count)
  const starColor = toColor(theme.star)

  for (let index = 0; index < count; index++) {
    const star = layout.stars[index]
    if (!star) continue
    const offset = index * 3
    positions[offset] = worldX(star.x)
    positions[offset + 1] = worldY(star.y)
    positions[offset + 2] = worldZ(star.z)
    writeColor(colors, index, starColor)
    const look = starAppearance(star)
    sizes[index] = look.size
    softness[index] = look.softness
    brightness[index] = look.brightness
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  const color = new BufferAttribute(colors, 3)
  // Color is the only attribute playback mutates, and it mutates a handful of
  // vertices per step; size, softness, and brightness never change.
  color.setUsage(DynamicDrawUsage)
  geometry.setAttribute('color', color)
  geometry.setAttribute('size', new BufferAttribute(sizes, 1))
  geometry.setAttribute('softness', new BufferAttribute(softness, 1))
  geometry.setAttribute('brightness', new BufferAttribute(brightness, 1))

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

/** How one star is drawn: none of it changes after the field is built. */
interface StarAppearance {
  /** Base point size in world units, before distance attenuation. */
  readonly size: number
  /** 0 is a hard-edged point, 1 a smudge that starts fading at its core. */
  readonly softness: number
  /** Multiplier on the palette color, so a faint star is a dimmer one. */
  readonly brightness: number
}

/**
 * Exponent applied to a uniform hash to skew it toward zero. A real star field
 * is mostly faint stars with a handful of bright ones; a uniform draw gives
 * every magnitude the same odds and the field reads as uniform mush, which is
 * exactly what this replaces. At 2.5, three quarters of the stars land in the
 * dim half of the range and under a tenth in the top fifth.
 */
const MAGNITUDE_SKEW = 2.5
/**
 * Dimmest a star may be drawn, as a fraction of the palette color. The floor
 * is not cosmetic: `theme.star` clears 4.5:1 against the background with only
 * a little to spare, and 0.8 is where the faintest star still clears it.
 */
const MIN_BRIGHTNESS = 0.8
/** Brightest a star may be drawn; over 1 the few bright ones read as hot. */
const MAX_BRIGHTNESS = 1.15
/** Point size at magnitude 0 and at magnitude 1, relative to the base size. */
const MIN_SIZE_SCALE = 0.55
const MAX_SIZE_SCALE = 1.6
/**
 * Softness at magnitude 0 (the faintest) and at magnitude 1 (the brightest).
 * Both ends sit low deliberately: a star should read as a dot carrying a little
 * bloom, not as a disc. The magnitude skew makes most stars faint, so
 * `MAX_SOFTNESS` is what the bulk of the field is drawn at — raising it turns
 * the galaxy into overlapping smudges instead of a star field.
 */
const MAX_SOFTNESS = 0.34
const MIN_SOFTNESS = 0.04

/**
 * @description Derives how a star is drawn from its key alone. Every term is a
 * hash of a stable identifier, so a render is reproducible byte for byte: no
 * `Math.random`, no clock, no dependence on input order. Magnitude drives size,
 * softness, and brightness together — bright stars are larger and tighter,
 * faint ones smaller and more diffuse — and two independent hashes break the
 * correlation just enough that the field does not look computed.
 * @param star The star to draw.
 * @returns Its size, softness, and brightness.
 */
function starAppearance(star: StarPosition): StarAppearance {
  const key = starKey(star.repoId, star.file)
  const magnitude = hash01(`${key}:magnitude`) ** MAGNITUDE_SKEW
  const base = 0.038 + ((star.repoId + star.file.length) % 8) * 0.004
  const sizeJitter = 0.9 + hash01(`${key}:size`) * 0.2
  const blurJitter = (hash01(`${key}:blur`) - 0.5) * 0.16
  const softness =
    MAX_SOFTNESS - (MAX_SOFTNESS - MIN_SOFTNESS) * magnitude + blurJitter
  return {
    size: base * (MIN_SIZE_SCALE + (MAX_SIZE_SCALE - MIN_SIZE_SCALE) * magnitude) * sizeJitter,
    softness: Math.min(1, Math.max(0, softness)),
    brightness: MIN_BRIGHTNESS + (MAX_BRIGHTNESS - MIN_BRIGHTNESS) * magnitude,
  }
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
  const chosen = toColor(theme.selectedStar)
  // Outside the clamped step range in both directions, so the first frame
  // resyncs against the frame's live set instead of advancing into it.
  let lastStep = -2
  let lastCurrent: readonly string[] = []
  /** The repo whose stars are currently painted in the selection color. */
  let selection: number | null = null

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

  /**
   * Paints one repo's whole star range, either in the selection color or in
   * whatever the step says each of its stars should be. The range is
   * contiguous — the layout groups a repo's stars — so this never searches.
   */
  const paintRepo = (
    source: UniverseLayout,
    frame: UniverseFrame | null,
    repoId: number
  ): number => {
    const repo = source.repos.find((arm) => arm.repoId === repoId)
    if (!repo) return 0
    for (let offset = 0; offset < repo.starCount; offset++) {
      const index = repo.starOffset + offset
      if (!frame) {
        writeColor(colors, index, chosen)
        continue
      }
      const star = source.stars[index]
      if (!star) continue
      const key = starKey(star.repoId, star.file)
      if (frame.currentFiles.includes(key)) writeColor(colors, index, current)
      else if (frame.liveFiles.has(key)) writeColor(colors, index, live)
      else writeColor(colors, index, untouched)
    }
    return repo.starCount
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
      // The viewer's selection outranks playback: a step that repainted the
      // selected repo has to hand it straight back, or the highlight blinks
      // out the moment the day advances.
      const held = selection === null ? 0 : paintRepo(source, null, selection)
      if (seeked || promoted > 0 || held > 0) attribute.needsUpdate = true
      return promoted
    },
    setSelection(source, frame, repoId) {
      if (repoId === selection) return 0
      let written = 0
      // A null frame is a click before the first render: nothing is on screen,
      // so a deselect has nothing to give back.
      if (selection !== null && frame) written += paintRepo(source, frame, selection)
      selection = repoId
      if (repoId !== null) written += paintRepo(source, null, repoId)
      if (written > 0) attribute.needsUpdate = true
      return written
    },
    dispose() {
      points.geometry.dispose()
      const material = points.material
      if (material instanceof Material) material.dispose()
    },
  }
}
