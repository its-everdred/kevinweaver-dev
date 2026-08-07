import { BufferAttribute, BufferGeometry, Material, Points } from 'three'
import { hash01, starKey } from './galaxy'
import type { UniverseLayout } from './galaxy'
import { createPointMaterial } from './galaxyShader'
import {
  toColor,
  worldX,
  worldY,
  worldZ,
  writeColor,
  type GalaxySceneTheme,
} from './galaxyWorld'

/** The interstellar haze: one Points object for the whole disc. */
export interface GalaxyHaze {
  readonly points: Points
  dispose(): void
}

/**
 * Clouds per star, from `pickles976/GalaxyThreeJS`'s `HAZE_RATIO`. Their haze
 * is a second population drawn from the same generators the stars come from,
 * which is what makes it hug the arms instead of washing the frame; ours takes
 * the shorter route to the same distribution and hangs a cloud on every second
 * star, so the haze is the star field's own shape by construction.
 *
 * One cloud per eight stars, not the reference's one per two. A cloud is drawn
 * an order of magnitude larger than a star, so the field is fill-rate bound,
 * not vertex bound: at the reference ratio a software rasterizer spends about a
 * tenth of a second on a single frame, which stalls the page under a test's
 * fake clock and would cost a real viewer on weak hardware just as much. The
 * nebulosity survives the cut because it comes from overlap, and these clouds
 * are wide enough to still overlap at this density.
 */
export const HAZE_RATIO = 0.125
/** Stars between one cloud and the next: the ratio, as a stride. */
const HAZE_STRIDE = Math.round(1 / HAZE_RATIO)
/**
 * Cloud size in world units, before distance attenuation. The reference sizes
 * haze at 20-50 against stars at 0.25-5.0 in a galaxy about 500 units across;
 * ours is the same relationship in a disc about 5 units across, which puts the
 * smallest cloud at several times the largest star.
 */
const HAZE_MIN_SIZE = 0.36
const HAZE_MAX_SIZE = 0.9
/**
 * How far a cloud drifts off its star, in field units, so the haze reads as
 * its own layer rather than as a halo bolted to every second star. Kept small
 * enough that a cloud never leaves the arm it was drawn from.
 */
const HAZE_DRIFT = 0.02
/**
 * Multiplier on the palette color, and the whole of what keeps this
 * nebulosity rather than fog. The reference gets its glow from a bloom pass
 * over a 0.2-opacity sprite; a bloom pass is a shader stack this bundle cannot
 * pay for, so the softness in the point shader stands in and the brightness
 * comes down to match. Clouds overlap several deep along an arm and the
 * blending is additive, so what one cloud adds has to stay far below what one
 * star does: at 0.035 an arm's accumulated haze lands around a tenth of the
 * frame's range, which reads as a glow behind the stars rather than in
 * front of them.
 */
const HAZE_BRIGHTNESS = 0.035
/** Fraction either side of that brightness a single cloud may vary by. */
const HAZE_BRIGHTNESS_SPREAD = 0.4
/** Fully feathered: alpha falls from the cloud's core to its rim. */
const HAZE_SOFTNESS = 1
/** Drawn before the star field, so the stars sit in front of their own haze. */
const HAZE_RENDER_ORDER = -1

/** Deterministic offset in (-span/2, span/2), from a stable identifier. */
function drift(key: string, axis: string, span: number): number {
  return (hash01(`${key}:${axis}`) - 0.5) * span
}

/**
 * @description Builds the disc's haze: large, very faint, fully feathered
 * points sharing the star field's distribution, which is what places them
 * along the arms rather than over the frame. Every term is a hash of a stable
 * identifier, so the haze is reproducible byte for byte — no `Math.random`, no
 * clock, no dependence on input order — and it costs exactly one draw call
 * whatever the star count.
 * @param layout The layout whose stars the clouds are hung on.
 * @param theme Color palette; the haze is the star color, far dimmer.
 * @returns The Points object and its disposal.
 */
export function createGalaxyHaze(
  layout: UniverseLayout,
  theme: GalaxySceneTheme
): GalaxyHaze {
  const count = Math.ceil(layout.stars.length / HAZE_STRIDE)
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const softness = new Float32Array(count).fill(HAZE_SOFTNESS)
  const brightness = new Float32Array(count)
  const cloudColor = toColor(theme.star)

  for (let cloud = 0; cloud < count; cloud++) {
    const star = layout.stars[cloud * HAZE_STRIDE]
    if (!star) continue
    const key = starKey(star.repoId, star.file)
    const offset = cloud * 3
    positions[offset] = worldX(star.x + drift(key, 'hazeX', HAZE_DRIFT))
    positions[offset + 1] = worldY(star.y + drift(key, 'hazeY', HAZE_DRIFT))
    positions[offset + 2] = worldZ(star.z + drift(key, 'hazeZ', HAZE_DRIFT))
    writeColor(colors, cloud, cloudColor)
    sizes[cloud] =
      HAZE_MIN_SIZE + (HAZE_MAX_SIZE - HAZE_MIN_SIZE) * hash01(`${key}:hazeSize`)
    brightness[cloud] =
      HAZE_BRIGHTNESS * (1 + drift(key, 'hazeGlow', 2 * HAZE_BRIGHTNESS_SPREAD))
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('size', new BufferAttribute(sizes, 1))
  geometry.setAttribute('softness', new BufferAttribute(softness, 1))
  geometry.setAttribute('brightness', new BufferAttribute(brightness, 1))
  // Nothing here changes after the build: the haze is the one part of the disc
  // that playback never repaints, which is what keeps a second point field off
  // the per-step cost.
  const points = new Points(geometry, createPointMaterial())
  points.renderOrder = HAZE_RENDER_ORDER

  return {
    points,
    dispose() {
      geometry.dispose()
      const material = points.material
      if (material instanceof Material) material.dispose()
    },
  }
}
