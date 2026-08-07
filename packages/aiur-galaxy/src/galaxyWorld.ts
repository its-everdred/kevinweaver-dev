import { Color } from 'three'
import type { Mesh, PerspectiveCamera } from 'three'

/** Host-agnostic theme mapped to three.js colors. */
export interface GalaxySceneTheme {
  readonly background: number
  readonly star: number
  readonly liveStar: number
  readonly currentStar: number
  /** Stars belonging to the repo the viewer has clicked. */
  readonly selectedStar: number
  readonly contributor: number
  readonly agent: number
  readonly label: number
}

export const DEFAULT_THEME: GalaxySceneTheme = {
  background: 0x1d2021,
  // Untouched stars clear a 4.5:1 contrast ratio against the background. The
  // former 0x5c6370 measured 2.7:1 and read as empty space, which is why 58 of
  // 60 repos looked missing rather than merely quiet.
  star: 0x8b98ab,
  liveStar: 0xb7d3ef,
  currentStar: 0xd8f2b0,
  // Warm amber: the other three star colors run blue-to-green, so a selected
  // repo is the only warm thing in the disc and reads as picked out at a
  // glance rather than as one more shade of "recently touched".
  selectedStar: 0xffa64d,
  contributor: 0x61afef,
  agent: 0xc678dd,
  // Terminal green, the same shade as the contribution graph's densest band. A
  // repo name is the only text inside the disc, so colouring it away from the
  // blue-white star ramp keeps it reading as a label rather than a hot star.
  label: 0x39d353,
}

/** Field-to-world scale of the disc, per axis. */
const WORLD_WIDTH = 6
const WORLD_HEIGHT = 4

/** @description Maps a field x in [0, 1] onto the disc's world width. */
export function worldX(field: number): number {
  return (field - 0.5) * WORLD_WIDTH
}

/** @description Maps a field y in [0, 1] onto the disc's world height. */
export function worldY(field: number): number {
  return (field - 0.5) * WORLD_HEIGHT
}

/** @description Maps a field z in [0, 1] onto the disc's world depth. */
export function worldZ(field: number): number {
  return (field - 0.5) * WORLD_HEIGHT
}

/** @description Wraps a packed hex color as a three.js color. */
export function toColor(value: number): Color {
  return new Color(value)
}

/**
 * @description Writes one color into a packed per-vertex color buffer.
 * @param array The buffer, three floats per vertex.
 * @param index Vertex index, not float offset.
 * @param color The color to write.
 */
export function writeColor(array: Float32Array, index: number, color: Color): void {
  const offset = index * 3
  array[offset] = color.r
  array[offset + 1] = color.g
  array[offset + 2] = color.b
}

/**
 * @description Turns flat billboards to face the camera, which is the one
 * thing a `Sprite` does that a plane does not. Copying the camera's rotation
 * is that whole behavior, and it costs a quaternion copy per billboard against
 * the ~1 kB brotli that `Sprite` and `SpriteMaterial` add to the deferred
 * island — the budget the galaxy has to live inside.
 * @param camera The scene camera.
 * @param billboards Every plane that must keep facing the viewer.
 */
export function faceCamera(
  camera: PerspectiveCamera,
  billboards: Iterable<Mesh>
): void {
  for (const billboard of billboards) billboard.quaternion.copy(camera.quaternion)
}
