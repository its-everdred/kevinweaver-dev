// Named imports rather than `import * as THREE`: this module is the whole of
// the deferred island's three.js surface, and naming it keeps that surface
// reviewable against the first-load budget instead of hiding it behind a
// namespace nobody can audit.
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { starKey } from './galaxy'
import type { RepoArm, UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
import type { UniverseActor } from './types'
import { createGalaxyHaze } from './galaxyHaze'
import { createRepoLabels, type RepoLabel } from './galaxyLabels'
import { createStarField } from './galaxyStars'
import {
  DEFAULT_THEME,
  DISC_STILL,
  discTurn,
  faceCamera,
  toColor,
  turnMatrix,
  turnX,
  turnY,
  worldX,
  worldY,
  worldZ,
  writeColor,
  type DiscTurn,
  type GalaxySceneTheme,
} from './galaxyWorld'

export type { GalaxySceneTheme } from './galaxyWorld'

/** Options for creating the three.js galaxy scene. */
export interface GalaxySceneOptions {
  readonly theme?: GalaxySceneTheme
  /** Universe layout whose stars become the disc's single star field. */
  readonly layout: UniverseLayout
}

/** A contributor node (kw or AK) drawn in the scene. */
export interface SceneContributor {
  readonly actor: UniverseActor
  readonly mesh: Mesh<PlaneGeometry, MeshBasicMaterial>
}

/** What one frame cost, so the host can surface a beam budget overrun. */
export interface GalaxyFrameStats {
  /** Star vertices written this frame; 0 when the step did not change. */
  readonly promoted: number
  /** Beams drawn for the current step. */
  readonly beams: number
  /** Contributions on this step that produced no beam. Never silent. */
  readonly beamOverflow: number
  /** Labels revealed this frame; each one is a draw call. */
  readonly labels: number
}

/** Owns the three.js renderer, scene, camera, star field, beams, and labels. */
export interface GalaxyScene {
  readonly renderer: WebGLRenderer
  readonly scene: Scene
  readonly camera: PerspectiveCamera
  /** The whole disc, as one Points object. */
  readonly stars: Points
  /** Every zap beam for the current step, as one LineSegments object. */
  readonly beams: LineSegments
  /** One label per repo, in layout order, hidden until revealed. */
  readonly labels: readonly RepoLabel[]
  readonly contributors: SceneContributor[]
  /**
   * Promotes the stars this frame names, re-aims the beams, sets the labels.
   * @param reach How much of each beam is drawn, from `beamReach`: the day's
   * beams grow out of their contributor node and retract back into it.
   */
  setFrame(
    layout: UniverseLayout,
    frame: UniverseFrame,
    reach?: number
  ): GalaxyFrameStats
  /** Marks the repo the viewer is highlighting, whose label stays revealed. */
  setHighlight(repoId: number | null): void
  /**
   * The repo arm nearest a pointer, or null when none is near enough. The
   * pointer and the surface are in the same units, CSS pixels at the call site.
   */
  pickRepo(x: number, y: number, width: number, height: number): number | null
  /**
   * Selects the repo nearest a click, painting its stars in the selection
   * color and holding its label revealed; a click with no arm inside the pick
   * radius clears the selection.
   * @returns The arm now selected, or null when the click cleared it.
   */
  selectAt(x: number, y: number, width: number, height: number): RepoArm | null
  /** Moves contributor nodes to eased positions, dragging their beams along. */
  setContributors(nodes: readonly { actor: UniverseActor; x: number; y: number }[]): void
  /**
   * Turns the disc about its own axis, carrying its stars, haze, beams,
   * labels, and contributor nodes with it and leaving the camera alone: the
   * viewer's orbit is theirs, and the two compose.
   * @param spin The angle the disc has turned through, in radians.
   */
  setRotation(spin: number): void
  /** Places the camera at a world position, aimed at the disc center. */
  setCamera(x: number, y: number, z: number): void
  /** Resizes the renderer and the camera aspect, never the camera position. */
  resize(width: number, height: number): void
  /** Renders one frame. */
  render(): void
  /** Releases GPU resources. */
  dispose(): void
}

/** Where a repo's arm anchor lands on the canvas. */
export interface ArmScreenPoint {
  readonly x: number
  readonly y: number
  /** False when the anchor is behind the camera, where the projection lies. */
  readonly visible: boolean
}

/** Where an actor's beams start, in world units. */
export interface BeamOrigin {
  readonly actor: UniverseActor
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Result of aiming the beams at a step. */
export interface BeamStats {
  readonly drawn: number
  /** Contributions the cap refused, or whose star is not in the layout. */
  readonly dropped: number
}

/** Every zap beam for a step, in one reusable LineSegments object. */
export interface BeamField {
  readonly lines: LineSegments
  /**
   * Aims one beam per current contribution; caps and reports the overflow.
   * Beams end where the disc's turn has carried their star, not where the
   * layout left it at rest, and `reach` is how much of that distance is drawn:
   * 1 is a whole beam, 0 one retracted into the node it radiates from.
   */
  setFrame(
    layout: UniverseLayout,
    frame: UniverseFrame,
    origins: readonly BeamOrigin[],
    turn?: DiscTurn,
    reach?: number
  ): BeamStats
  /** Re-anchors the drawn beams as their contributor nodes glide into place. */
  setOrigins(origins: readonly BeamOrigin[]): void
  dispose(): void
}

/** World depth of the contributor nodes, just in front of the disc plane. */
const CONTRIBUTOR_DEPTH = 0.5
/** World size of a contributor node's billboard. */
const CONTRIBUTOR_SIZE = 0.12
/** Distance the camera is built at, face-on to the disc, in world units. */
const CAMERA_DISTANCE = 2.6
/**
 * Beams a single step may draw. The buffer is preallocated to this size, so a
 * day busier than the cap surfaces as `beamOverflow` rather than truncating.
 */
export const MAX_BEAMS = 2048
const BEAM_OPACITY = 0.75
/** How near a pointer must come to an arm anchor to highlight it, in pixels. */
const PICK_RADIUS = 56


function addContributorNode(
  scene: Scene,
  contributors: SceneContributor[],
  actor: UniverseActor,
  color: number
): void {
  // A billboarded plane rather than a sphere: at a dozen screen pixels the two
  // are the same picture, and `SphereGeometry` is weight in the deferred
  // island that the first-load budget cannot pay for.
  const geometry = new PlaneGeometry(CONTRIBUTOR_SIZE, CONTRIBUTOR_SIZE)
  const material = new MeshBasicMaterial({ color })
  const mesh = new Mesh(geometry, material)
  mesh.position.set(0, 0, CONTRIBUTOR_DEPTH)
  scene.add(mesh)
  contributors.push({ actor, mesh })
}

/**
 * @description Builds a three.js galaxy scene from a universe layout.
 * @param canvas The canvas the renderer draws into.
 * @param options Theme colors and the layout to render.
 * @returns An owned scene holding one star field, one beam field, and one
 * label per repo.
 */
export function createGalaxyScene(
  canvas: HTMLCanvasElement,
  options: GalaxySceneOptions
): GalaxyScene {
  const theme = { ...DEFAULT_THEME, ...options.theme }
  const renderer = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setClearColor(theme.background, 1)
  const scene = new Scene()
  const camera = new PerspectiveCamera(60, 1, 0.1, 100)
  placeCamera(camera, 0, 0, CAMERA_DISTANCE)

  const contributors: SceneContributor[] = []
  addContributorNode(scene, contributors, 0, theme.contributor)
  addContributorNode(scene, contributors, 1, theme.agent)

  // One star field, one haze field, and one beam field, whatever the star
  // count: the draw call count tracks the repo count through the labels, not
  // the 16k stars.
  const starField = createStarField(options.layout, theme)
  const haze = createGalaxyHaze(options.layout, theme)
  const beamField = createBeamField(theme)
  const labels = createRepoLabels(options.layout.repos, theme)
  // The two point fields turn as one object. Everything else in the disc is
  // placed a point at a time, because a billboard under a turning parent would
  // be sheared by the field-to-world scale instead of facing the viewer.
  const disc = new Group()
  disc.matrixAutoUpdate = false
  disc.add(starField.points)
  disc.add(haze.points)
  scene.add(disc)
  scene.add(beamField.lines)
  for (const label of labels.meshes) scene.add(label)

  /** Every flat object that has to keep facing the viewer as the disc turns. */
  const orient = (): void => {
    labels.faceCamera(camera)
    faceCamera(
      camera,
      contributors.map((contributor) => contributor.mesh)
    )
  }
  orient()

  const contributorOrigins = (): readonly BeamOrigin[] =>
    contributors.map((contributor) => ({
      actor: contributor.actor,
      x: contributor.mesh.position.x,
      y: contributor.mesh.position.y,
      z: contributor.mesh.position.z,
    }))

  /** How far the disc has turned, as the pair every point is spun by. */
  let turn: DiscTurn = DISC_STILL
  // The angle that pair came from. NaN until the first turn, so the disc is
  // placed once even at zero; after that a repeated angle costs nothing, which
  // is what leaves a reduced-motion frame with no rotation work in it at all.
  let spun = Number.NaN
  /** Carries each label round with the arm it names. */
  const placeLabels = (): void => {
    for (let index = 0; index < options.layout.repos.length; index++) {
      const repo = options.layout.repos[index]
      const label = labels.meshes[index]
      if (!repo || !label) continue
      label.position.set(
        worldX(turnX(turn, repo.x, repo.y)),
        worldY(turnY(turn, repo.x, repo.y)),
        worldZ(repo.z)
      )
    }
  }

  // The repo the viewer is highlighting, held here so a pointer move and a
  // step advance reach the labels through the same path.
  let highlight: number | null = null
  /** The repo the viewer has clicked, which outlives any number of frames. */
  let selected: RepoArm | null = null
  // The last frame rendered, so a click can give a deselected repo back the
  // colors its step earns. Null until the first frame, where there is nothing
  // on screen to restore anyway.
  let frameShown: UniverseFrame | null = null

  return {
    renderer,
    scene,
    camera,
    stars: starField.points,
    beams: beamField.lines,
    labels: labels.meshes,
    contributors,
    setFrame(layout, frame, reach = 1) {
      frameShown = frame
      const promoted = starField.setFrame(layout, frame)
      const beams = beamField.setFrame(layout, frame, contributorOrigins(), turn, reach)
      return {
        promoted,
        beams: beams.drawn,
        beamOverflow: beams.dropped,
        labels: labels.setFrame(frame, highlight, selected?.repoId ?? null),
      }
    },
    setHighlight(repoId) {
      highlight = repoId
    },
    pickRepo(x, y, width, height) {
      return pickRepoArm(options.layout.repos, camera, { x, y }, { width, height }, turn)
    },
    selectAt(x, y, width, height) {
      const repoId = pickRepoArm(
        options.layout.repos,
        camera,
        { x, y },
        { width, height },
        turn
      )
      selected =
        repoId === null
          ? null
          : (options.layout.repos.find((arm) => arm.repoId === repoId) ?? null)
      starField.setSelection(options.layout, frameShown, selected?.repoId ?? null)
      if (frameShown) labels.setFrame(frameShown, highlight, selected?.repoId ?? null)
      return selected
    },
    setContributors(nodes) {
      // Hide every contributor first; only nodes present in the current frame
      // become visible at their centroid. This prevents a stray node lingering
      // at the field center when an actor has no contribution that day.
      for (const contributor of contributors) contributor.mesh.visible = false
      const origins: BeamOrigin[] = []
      for (const node of nodes) {
        const existing = contributors.find((c) => c.actor === node.actor)
        if (!existing) continue
        existing.mesh.visible = true
        // The node sits over the day's work, so the disc's turn carries it the
        // same way it carries the stars that work landed on.
        existing.mesh.position.set(
          worldX(turnX(turn, node.x, node.y)),
          worldY(turnY(turn, node.x, node.y)),
          CONTRIBUTOR_DEPTH
        )
        origins.push({
          actor: node.actor,
          x: existing.mesh.position.x,
          y: existing.mesh.position.y,
          z: existing.mesh.position.z,
        })
      }
      beamField.setOrigins(origins)
    },
    setRotation(spin) {
      if (spin === spun) return
      spun = spin
      turn = discTurn(spin)
      turnMatrix(disc.matrix, turn)
      disc.matrixWorldNeedsUpdate = true
      placeLabels()
    },
    setCamera(x, y, z) {
      placeCamera(camera, x, y, z)
      orient()
    },
    resize(width, height) {
      renderer.setSize(width, height, false)
      resizeCamera(camera, width, height)
    },
    render() {
      renderer.render(scene, camera)
    },
    dispose() {
      starField.dispose()
      haze.dispose()
      beamField.dispose()
      labels.dispose()
      for (const contributor of contributors) {
        contributor.mesh.geometry.dispose()
        const material = contributor.mesh.material
        if (material instanceof Material) material.dispose()
      }
      renderer.dispose()
    },
  }
}

/**
 * @description Places the camera at a world position and aims it at the disc
 * center. This is the only writer of the camera's position: resizing must not
 * refit it, or a user's rotation and zoom would be discarded on every resize.
 * @param camera The scene camera.
 * @param x World x.
 * @param y World y.
 * @param z World z.
 */
export function placeCamera(
  camera: PerspectiveCamera,
  x: number,
  y: number,
  z: number
): void {
  camera.position.set(x, y, z)
  camera.lookAt(0, 0, 0)
}

/**
 * @description Applies a viewport size to the projection aspect alone, leaving
 * the camera where the viewer put it.
 * @param camera The scene camera.
 * @param width Drawing buffer width in pixels.
 * @param height Drawing buffer height in pixels; a collapsed pane reads as 1.
 */
export function resizeCamera(
  camera: PerspectiveCamera,
  width: number,
  height: number
): void {
  camera.aspect = Math.max(1, width) / Math.max(1, height)
  camera.updateProjectionMatrix()
}

/**
 * @description Projects a repo's arm anchor onto the canvas.
 * @param repo The arm segment.
 * @param camera The scene camera.
 * @param metrics Surface size, in the units the result is wanted in.
 * @param turn How far the disc has turned, so hover follows the stars rather
 * than the resting place the layout gave them.
 * @returns The anchor's surface position, flagged when it is behind the camera.
 */
export function repoScreenPosition(
  repo: RepoArm,
  camera: PerspectiveCamera,
  metrics: { readonly width: number; readonly height: number },
  turn: DiscTurn = DISC_STILL
): ArmScreenPoint {
  camera.updateMatrixWorld()
  const projected = new Vector3(
    worldX(turnX(turn, repo.x, repo.y)),
    worldY(turnY(turn, repo.x, repo.y)),
    worldZ(repo.z)
  ).project(camera)
  return {
    x: (projected.x * 0.5 + 0.5) * Math.max(1, metrics.width),
    y: (0.5 - projected.y * 0.5) * Math.max(1, metrics.height),
    visible: projected.z <= 1,
  }
}

/**
 * @description Finds the repo arm nearest a pointer. The dolly floor puts the
 * camera inside the disc's own extent, so an arm can sit behind it and project
 * to a mirrored point; those are skipped rather than picked.
 * @param repos The layout's arm segments.
 * @param camera The scene camera.
 * @param pointer Pointer position, in the same units as `metrics`.
 * @param metrics Surface size.
 * @param turn How far the disc has turned.
 * @returns The nearest arm's repo id, or null when none is within reach.
 */
export function pickRepoArm(
  repos: readonly RepoArm[],
  camera: PerspectiveCamera,
  pointer: { readonly x: number; readonly y: number },
  metrics: { readonly width: number; readonly height: number },
  turn: DiscTurn = DISC_STILL
): number | null {
  let picked: number | null = null
  let nearest = PICK_RADIUS * PICK_RADIUS
  for (const repo of repos) {
    const point = repoScreenPosition(repo, camera, metrics, turn)
    if (!point.visible) continue
    const distance = (point.x - pointer.x) ** 2 + (point.y - pointer.y) ** 2
    if (distance >= nearest) continue
    nearest = distance
    picked = repo.repoId
  }
  return picked
}

/**
 * @description Creates the beam field: one LineSegments object with a
 * preallocated buffer and a per-step draw range, so a step change re-aims
 * beams without allocating geometry.
 * @param theme Color palette; actor 0 draws in `contributor`, actor 1 in `agent`.
 * @param maxBeams Beams a single step may draw before the overflow surfaces.
 * @returns The LineSegments object plus its per-step and per-frame updates.
 */
export function createBeamField(
  theme: GalaxySceneTheme,
  maxBeams: number = MAX_BEAMS
): BeamField {
  const positions = new Float32Array(maxBeams * 6)
  const colors = new Float32Array(maxBeams * 6)
  const geometry = new BufferGeometry()
  const position = new BufferAttribute(positions, 3)
  const color = new BufferAttribute(colors, 3)
  position.setUsage(DynamicDrawUsage)
  color.setUsage(DynamicDrawUsage)
  geometry.setAttribute('position', position)
  geometry.setAttribute('color', color)
  geometry.setDrawRange(0, 0)
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: BEAM_OPACITY,
    depthWrite: false,
  })
  const lines = new LineSegments(geometry, material)
  // The draw range covers a fraction of the preallocated buffer, so the
  // bounding sphere three.js would compute from it is meaningless.
  lines.frustumCulled = false

  const actorColors = [toColor(theme.contributor), toColor(theme.agent)] as const
  const anchors = [new Vector3(), new Vector3()] as const
  /** Actor of each drawn beam, so a gliding node re-anchors only its own. */
  const beamActors: UniverseActor[] = []
  /** Where each drawn beam's star is, so a part-drawn beam can be re-aimed. */
  const targets = new Float32Array(maxBeams * 3)
  /**
   * Each drawn beam's star in *field* coordinates. The turn and the reach both
   * change every frame, but which stars a day names does not, so the field
   * position is resolved once per step and turned per frame. Without this the
   * frame path walked every contribution of the day — thousands on a busy one —
   * through a Map lookup sixty times a second.
   */
  const fields = new Float64Array(maxBeams * 3)
  /** How much of each beam is drawn, held so a re-anchor keeps the fraction. */
  let reachDrawn = 1
  /** The step the beams currently resolve, so a repeat re-aims rather than rebuilds. */
  let resolvedStep = Number.NaN
  /** The layout those beams were resolved against; a rebuild invalidates them. */
  let resolvedLayout: UniverseLayout | null = null
  let resolvedDrawn = 0
  let resolvedDropped = 0

  const anchor = (origins: readonly BeamOrigin[]): void => {
    for (const origin of origins) anchors[origin.actor]?.set(origin.x, origin.y, origin.z)
  }

  const reachFrom = (origin: number, star: number | undefined): number =>
    origin * (1 - reachDrawn) + (star ?? origin) * reachDrawn

  const writeBeam = (beam: number, actor: UniverseActor): void => {
    const point = anchors[actor]
    if (!point) return
    const offset = beam * 6
    const target = beam * 3
    positions[offset] = point.x
    positions[offset + 1] = point.y
    positions[offset + 2] = point.z
    // The far end is weighted between the node and the star rather than
    // offset from the node, so a whole beam ends exactly on its star.
    positions[offset + 3] = reachFrom(point.x, targets[target])
    positions[offset + 4] = reachFrom(point.y, targets[target + 1])
    positions[offset + 5] = reachFrom(point.z, targets[target + 2])
  }

  /** Uploads only the beams in the draw range, not the whole capped buffer. */
  const flush = (attribute: BufferAttribute, drawn: number): void => {
    attribute.clearUpdateRanges()
    attribute.addUpdateRange(0, drawn * 6)
    attribute.needsUpdate = true
  }

  return {
    lines,
    setFrame(layout, frame, origins, turn = DISC_STILL, reach = 1) {
      anchor(origins)
      reachDrawn = reach
      if (frame.step !== resolvedStep || layout !== resolvedLayout) {
        resolvedStep = frame.step
        resolvedLayout = layout
        beamActors.length = 0
        let drawn = 0
        let dropped = 0
        for (const contribution of frame.currentContributions) {
          const index = layout.starIndex.get(
            starKey(contribution.repo, contribution.file)
          )
          const star = index === undefined ? undefined : layout.stars[index]
          if (!star || drawn >= maxBeams) {
            dropped++
            continue
          }
          const field = drawn * 3
          fields[field] = star.x
          fields[field + 1] = star.y
          fields[field + 2] = star.z
          const beamColor = actorColors[contribution.actor] ?? actorColors[0]
          writeColor(colors, drawn * 2, beamColor)
          writeColor(colors, drawn * 2 + 1, beamColor)
          beamActors.push(contribution.actor)
          drawn++
        }
        resolvedDrawn = drawn
        resolvedDropped = dropped
        geometry.setDrawRange(0, drawn * 2)
        flush(color, drawn)
      }
      // Turn and re-aim every frame: the disc keeps rotating and the beam keeps
      // growing or retracting even while the day itself stands still.
      for (let beam = 0; beam < resolvedDrawn; beam++) {
        const actor = beamActors[beam]
        if (actor === undefined) continue
        const field = beam * 3
        const x = fields[field] ?? 0
        const y = fields[field + 1] ?? 0
        const target = beam * 3
        targets[target] = worldX(turnX(turn, x, y))
        targets[target + 1] = worldY(turnY(turn, x, y))
        targets[target + 2] = worldZ(fields[field + 2] ?? 0)
        writeBeam(beam, actor)
      }
      flush(position, resolvedDrawn)
      return { drawn: resolvedDrawn, dropped: resolvedDropped }
    },
    setOrigins(origins) {
      anchor(origins)
      for (let beam = 0; beam < beamActors.length; beam++) {
        const actor = beamActors[beam]
        if (actor === undefined) continue
        writeBeam(beam, actor)
      }
      flush(position, beamActors.length)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
