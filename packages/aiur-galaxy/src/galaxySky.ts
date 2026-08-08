import { BufferAttribute, BufferGeometry, Material, Points } from 'three'
import type { Vector3 } from 'three'
import { hash01 } from './galaxy'
import { createPointMaterial } from './galaxyShader'
import { toColor, writeColor, type GalaxySceneTheme } from './galaxyWorld'

/** The surround: distant galaxies and nebulae, as one Points object. */
export interface GalaxySky {
  readonly points: Points
  /**
   * Re-centres the sky on the eye. This is the whole of what puts it at
   * infinity: a shell that travels with the camera can never parallax, so a
   * pan slides the disc across the frame and leaves the sky where it was,
   * while a rotation sweeps new sky into view. Fixed under translation, moving
   * under rotation, which is what the eye reads as "unreachably far away".
   */
  follow(eye: Vector3): void
  dispose(): void
}

/**
 * Radius of the shell, in world units. Two bounds fix it: it must clear the
 * disc (about 6 across) plus the furthest the camera can be dollied and panned
 * from it, or an arm pokes through the sky; and it must stay inside the
 * camera's 100-unit far plane, because the shell is centred on the eye and so
 * every sky point is exactly this far from it, always.
 */
export const SKY_RADIUS = 60
/**
 * Distant galaxies. Sparse on purpose: at this count roughly a tenth land
 * inside a 60-degree field of view, which is the density of a real dark sky
 * and leaves the disc as the only crowded thing in the frame.
 */
export const SKY_GALAXIES = 720
/** Nebulae, as clouds rather than as points. */
export const SKY_NEBULAE = 32
/**
 * Points per nebula. One feathered point is a perfect circle and reads as a
 * smudge; three overlapping at different sizes read as a cloud. Three is also
 * where the fill-rate cost stops being free: these are the largest points in
 * the scene, and a software rasterizer pays for every pixel of them.
 */
export const SKY_NEBULA_PUFFS = 3
/** Drawn before the haze, which is drawn before the stars. */
const SKY_RENDER_ORDER = -2

/**
 * The golden angle, which is what makes a sunflower spiral cover a sphere
 * evenly. Hashing two angles per point instead leaves clumps and — worse —
 * bald patches at this count, and a bald patch is a direction the viewer can
 * turn to and find no sky at all.
 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/**
 * How far a point is nudged off its lattice place, in units of the shell's own
 * z. Without it the spiral is visible as a spiral; with it the sky reads as
 * scattered while still covering every direction.
 */
const GALAXY_SPREAD = 0.06
/** The same for a nebula's puffs, which have to overlap rather than scatter. */
const NEBULA_SPREAD = 0.14

/**
 * Point sizes in world units, before the shader's distance attenuation. At the
 * shell radius that attenuation is a flat 5x, so a galaxy is 4 to 16 device
 * pixels across and a nebula 110 to 220: small enough that a galaxy is a
 * smudge rather than a disc, large enough that a nebula is a cloud.
 */
const GALAXY_MIN_SIZE = 0.8
const GALAXY_MAX_SIZE = 3.2
const NEBULA_MIN_SIZE = 22
const NEBULA_MAX_SIZE = 44
/**
 * Feathering. Nothing in the sky is a hard-edged point: a crisp dot at this
 * distance reads as a star in the disc, and the stars are the subject.
 */
const GALAXY_MIN_SOFTNESS = 0.4
const NEBULA_SOFTNESS = 1
/**
 * Multipliers on the palette colours, and the numbers that keep the stars the
 * subject. The faintest star is drawn at 0.8 of a colour whose brightest
 * channel is 0.67, so it puts 0.54 on the frame; the brightest thing in the
 * sky puts 0.06, a ninth of it. Three nebula puffs at full overlap also reach
 * 0.06, under half of what the haze accumulates along one arm. The sky is
 * therefore always the dimmest layer — which is what "off in the distance"
 * has to mean numerically.
 */
const GALAXY_MIN_BRIGHTNESS = 0.03
const GALAXY_MAX_BRIGHTNESS = 0.08
const NEBULA_MIN_BRIGHTNESS = 0.012
const NEBULA_MAX_BRIGHTNESS = 0.03
/**
 * How far a nebula's own hue may drift from `skyNebula` toward `skyGalaxy`.
 * One hue across all 32 reads as a single wallpaper repeated around the
 * viewer; drifting between the two colours the sky already owns keeps the
 * palette closed, so the variation cannot wander somewhere the theme never
 * named. Keyed on the cloud rather than the puff, because a nebula's puffs
 * overlap and tinting them apart would speckle one cloud instead of
 * distinguishing two.
 */
export const NEBULA_TINT = 0.55

/** Deterministic value in [low, high) from a stable identifier. */
function span(key: string, axis: string, low: number, high: number): number {
  return low + (high - low) * hash01(`${key}:${axis}`)
}

/**
 * @description Writes one point onto the shell: its place on the sunflower
 * sphere, nudged by a hash of its own key. `index` and `count` name the
 * lattice, so a nebula's puffs share one place and scatter around it while
 * each galaxy gets its own.
 */
function place(
  out: Float32Array,
  offset: number,
  index: number,
  count: number,
  key: string,
  spread: number
): void {
  // Clamped so the shell radius below is exact rather than merely close: a
  // point off the shell is a point at a different distance, and the whole
  // conceit is that everything up there is equally far away.
  const z = Math.max(
    -1,
    Math.min(1, 1 - (2 * index + 1) / count + span(key, 'z', -spread, spread))
  )
  const around = index * GOLDEN_ANGLE + span(key, 'a', -spread, spread)
  const ring = SKY_RADIUS * Math.sqrt(1 - z * z)
  out[offset] = ring * Math.cos(around)
  out[offset + 1] = ring * Math.sin(around)
  out[offset + 2] = SKY_RADIUS * z
}

/**
 * @description Builds the surround: a shell of far-field points around the
 * viewer, distant galaxies as small feathered smudges and nebulae as clusters
 * of very large, very faint ones.
 *
 * A shell of points rather than a textured sky. An equirectangular backdrop
 * covers every pixel of the frame every frame, and this scene is already
 * fill-rate bound in a software rasterizer — the haze had to be cut to a
 * quarter of its reference density for that reason. Measured under
 * SwiftShader, a `scene.background` sky costs +6.95 ms a frame against this
 * one's +1.19 ms, and it renders each galaxy at the frame's own resolution
 * rather than at whatever a texture small enough to afford could carry.
 *
 * Every term is a hash of a stable key or a function of the point's index, so
 * two builds agree byte for byte: no `Math.random`, no clock, one draw call.
 * @param theme Colour palette; the sky uses `skyGalaxy` and `skyNebula`.
 * @returns The Points object, its re-centring, and its disposal.
 */
export function createGalaxySky(theme: GalaxySceneTheme): GalaxySky {
  const puffs = SKY_NEBULAE * SKY_NEBULA_PUFFS
  const count = SKY_GALAXIES + puffs
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const sizes = new Float32Array(count)
  const softness = new Float32Array(count)
  const brightness = new Float32Array(count)
  const galaxyColor = toColor(theme.skyGalaxy)
  const nebulaColor = toColor(theme.skyNebula)
  // One scratch colour for every cloud's tint: `writeColor` copies out of it
  // immediately, so nothing outlives the iteration that wrote it.
  const tint = toColor(theme.skyNebula)

  for (let index = 0; index < SKY_GALAXIES; index++) {
    const key = `sky:${index}`
    place(positions, index * 3, index, SKY_GALAXIES, key, GALAXY_SPREAD)
    writeColor(colors, index, galaxyColor)
    sizes[index] = span(key, 'size', GALAXY_MIN_SIZE, GALAXY_MAX_SIZE)
    softness[index] = span(key, 'soft', GALAXY_MIN_SOFTNESS, 1)
    brightness[index] = span(key, 'mag', GALAXY_MIN_BRIGHTNESS, GALAXY_MAX_BRIGHTNESS)
  }
  for (let puff = 0; puff < puffs; puff++) {
    const index = SKY_GALAXIES + puff
    const key = `neb:${puff}`
    // Every puff of one nebula shares the cloud's lattice place and scatters
    // off it by its own hash, which is what makes the cloud lopsided.
    const cloud = Math.floor(puff / SKY_NEBULA_PUFFS)
    place(positions, index * 3, cloud, SKY_NEBULAE, key, NEBULA_SPREAD)
    writeColor(
      colors,
      index,
      tint.copy(nebulaColor).lerp(galaxyColor, span(`neb:${cloud}`, 'hue', 0, NEBULA_TINT))
    )
    sizes[index] = span(key, 'size', NEBULA_MIN_SIZE, NEBULA_MAX_SIZE)
    softness[index] = NEBULA_SOFTNESS
    brightness[index] = span(key, 'mag', NEBULA_MIN_BRIGHTNESS, NEBULA_MAX_BRIGHTNESS)
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  geometry.setAttribute('size', new BufferAttribute(sizes, 1))
  geometry.setAttribute('softness', new BufferAttribute(softness, 1))
  geometry.setAttribute('brightness', new BufferAttribute(brightness, 1))
  const points = new Points(geometry, createPointMaterial())
  points.renderOrder = SKY_RENDER_ORDER
  // The shell is always wrapped round the eye, so a frustum test can only ever
  // pass; skipping it also spares the bounding sphere over every sky point.
  points.frustumCulled = false

  return {
    points,
    follow(eye) {
      points.position.copy(eye)
    },
    dispose() {
      geometry.dispose()
      const material = points.material
      if (material instanceof Material) material.dispose()
    },
  }
}
