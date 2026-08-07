import { Color } from 'three'
import type { Matrix4, Mesh, PerspectiveCamera } from 'three'

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
/**
 * How much wider than tall the field is drawn. The disc is a circle in field
 * units and an ellipse in world units, which is what makes it read as a disc
 * seen at an angle rather than face-on. Its own axis is therefore the field's,
 * not the world's: turning it in world units would sweep the ellipse round and
 * the galaxy would appear to breathe instead of to spin.
 */
const DISC_ASPECT = WORLD_WIDTH / WORLD_HEIGHT

/**
 * How long the disc takes to come round once, in milliseconds. Four minutes is
 * a rim that crosses a couple of pixels a second: fast enough that the galaxy
 * is alive at a glance, slow enough that nothing about it is in motion while
 * you are reading a repo name off it. Playback's own pass over the year window
 * is about six minutes, so the two never beat against each other either.
 */
export const DISC_TURN_MS = 240_000
/**
 * Which way it turns, as a multiplier on the angle. A spiral's arms trail its
 * rotation — the tip of an arm lags its root — and `layoutUniverse` winds its
 * arms anticlockwise, `angle = arm + t * ARM_WINDING` with a positive winding
 * over a radius that grows outward. Trailing that winding means turning
 * against it, hence the negative: turning the other way puts the arm tips in
 * front and the disc reads as unwinding.
 */
const TURN_SENSE = -1

/** Cosine and sine of the disc's current turn, resolved once per frame. */
export interface DiscTurn {
  readonly cos: number
  readonly sin: number
}

/** The disc as the layout left it, for every caller that has not turned it. */
export const DISC_STILL: DiscTurn = { cos: 1, sin: 0 }

/**
 * @description The angle the disc has turned through, in radians. A pure
 * function of elapsed wall time: playback can be paused, scrubbed, or run
 * backwards without the disc stopping or jumping, because none of that is an
 * input here.
 * @param elapsedMs Milliseconds since the scene was built.
 * @param reducedMotion Whether `prefers-reduced-motion: reduce` is set. Under
 * it the disc never turns at all, at any elapsed time.
 * @returns The turn in radians, negative because the arms trail it.
 */
export function discSpin(elapsedMs: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(elapsedMs)) return 0
  return (TURN_SENSE * 2 * Math.PI * elapsedMs) / DISC_TURN_MS
}

/** @description Resolves a turn angle into the pair every point is spun by. */
export function discTurn(spin: number): DiscTurn {
  return { cos: Math.cos(spin), sin: Math.sin(spin) }
}

/** @description Turns a field x about the disc's axis, in field units. */
export function turnX(turn: DiscTurn, x: number, y: number): number {
  return 0.5 + (x - 0.5) * turn.cos - (y - 0.5) * turn.sin
}

/** @description Turns a field y about the disc's axis, in field units. */
export function turnY(turn: DiscTurn, x: number, y: number): number {
  return 0.5 + (x - 0.5) * turn.sin + (y - 0.5) * turn.cos
}

/**
 * @description Writes the world-space form of a field-space turn, so a whole
 * point field can be turned by one matrix instead of a rewritten buffer. It is
 * the field turn conjugated by the field-to-world scale, which is what keeps
 * the disc's outline still while everything inside it moves.
 * @param matrix The matrix to write, usually an object's own.
 * @param turn The turn to write into it.
 * @returns The same matrix, written.
 */
export function turnMatrix(matrix: Matrix4, turn: DiscTurn): Matrix4 {
  // prettier-ignore
  return matrix.set(
    turn.cos, -turn.sin * DISC_ASPECT, 0, 0,
    turn.sin / DISC_ASPECT, turn.cos, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  )
}

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
