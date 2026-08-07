// Named imports rather than `import * as THREE`: this module is the whole of
// the deferred island's three.js surface, and naming it keeps that surface
// reviewable against the first-load budget instead of hiding it behind a
// namespace nobody can audit.
import {
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
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
import { createRepoLabels, type RepoLabel } from './galaxyLabels'
import { createStarField } from './galaxyStars'
import {
  DEFAULT_THEME,
  faceCamera,
  toColor,
  worldX,
  worldY,
  worldZ,
  writeColor,
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
  /** Promotes the stars this frame names, re-aims the beams, sets the labels. */
  setFrame(layout: UniverseLayout, frame: UniverseFrame): GalaxyFrameStats
  /** Marks the repo the viewer is highlighting, whose label stays revealed. */
  setHighlight(repoId: number | null): void
  /**
   * The repo arm nearest a pointer, or null when none is near enough. The
   * pointer and the surface are in the same units, CSS pixels at the call site.
   */
  pickRepo(x: number, y: number, width: number, height: number): number | null
  /** Moves contributor nodes to eased positions, dragging their beams along. */
  setContributors(nodes: readonly { actor: UniverseActor; x: number; y: number }[]): void
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
  /** Aims one beam per current contribution; caps and reports the overflow. */
  setFrame(
    layout: UniverseLayout,
    frame: UniverseFrame,
    origins: readonly BeamOrigin[]
  ): BeamStats
  /** Re-anchors the drawn beams as their contributor nodes ease into place. */
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

  // One star field and one beam field, whatever the star count: the draw call
  // count tracks the repo count through the labels, not the 16k stars.
  const starField = createStarField(options.layout, theme)
  const beamField = createBeamField(theme)
  const labels = createRepoLabels(options.layout.repos, theme)
  scene.add(starField.points)
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

  // The repo the viewer is highlighting, held here so a pointer move and a
  // step advance reach the labels through the same path.
  let highlight: number | null = null

  return {
    renderer,
    scene,
    camera,
    stars: starField.points,
    beams: beamField.lines,
    labels: labels.meshes,
    contributors,
    setFrame(layout, frame) {
      const promoted = starField.setFrame(layout, frame)
      const beams = beamField.setFrame(layout, frame, contributorOrigins())
      return {
        promoted,
        beams: beams.drawn,
        beamOverflow: beams.dropped,
        labels: labels.setFrame(frame, highlight),
      }
    },
    setHighlight(repoId) {
      highlight = repoId
    },
    pickRepo(x, y, width, height) {
      return pickRepoArm(options.layout.repos, camera, { x, y }, { width, height })
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
        existing.mesh.position.set(worldX(node.x), worldY(node.y), CONTRIBUTOR_DEPTH)
        origins.push({
          actor: node.actor,
          x: existing.mesh.position.x,
          y: existing.mesh.position.y,
          z: existing.mesh.position.z,
        })
      }
      beamField.setOrigins(origins)
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
 * @returns The anchor's surface position, flagged when it is behind the camera.
 */
export function repoScreenPosition(
  repo: RepoArm,
  camera: PerspectiveCamera,
  metrics: { readonly width: number; readonly height: number }
): ArmScreenPoint {
  camera.updateMatrixWorld()
  const projected = new Vector3(
    worldX(repo.x),
    worldY(repo.y),
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
 * @returns The nearest arm's repo id, or null when none is within reach.
 */
export function pickRepoArm(
  repos: readonly RepoArm[],
  camera: PerspectiveCamera,
  pointer: { readonly x: number; readonly y: number },
  metrics: { readonly width: number; readonly height: number }
): number | null {
  let picked: number | null = null
  let nearest = PICK_RADIUS * PICK_RADIUS
  for (const repo of repos) {
    const point = repoScreenPosition(repo, camera, metrics)
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
  /** Actor of each drawn beam, so an eased node re-anchors only its own. */
  const beamActors: UniverseActor[] = []

  const anchor = (origins: readonly BeamOrigin[]): void => {
    for (const origin of origins) anchors[origin.actor]?.set(origin.x, origin.y, origin.z)
  }

  const writeOrigin = (beam: number, actor: UniverseActor): void => {
    const point = anchors[actor]
    if (!point) return
    const offset = beam * 6
    positions[offset] = point.x
    positions[offset + 1] = point.y
    positions[offset + 2] = point.z
  }

  /** Uploads only the beams in the draw range, not the whole capped buffer. */
  const flush = (attribute: BufferAttribute, drawn: number): void => {
    attribute.clearUpdateRanges()
    attribute.addUpdateRange(0, drawn * 6)
    attribute.needsUpdate = true
  }

  return {
    lines,
    setFrame(layout, frame, origins) {
      anchor(origins)
      beamActors.length = 0
      let drawn = 0
      let dropped = 0
      for (const contribution of frame.currentContributions) {
        const index = layout.starIndex.get(starKey(contribution.repo, contribution.file))
        const star = index === undefined ? undefined : layout.stars[index]
        if (!star || drawn >= maxBeams) {
          dropped++
          continue
        }
        const offset = drawn * 6
        writeOrigin(drawn, contribution.actor)
        positions[offset + 3] = worldX(star.x)
        positions[offset + 4] = worldY(star.y)
        positions[offset + 5] = worldZ(star.z)
        const beamColor = actorColors[contribution.actor] ?? actorColors[0]
        writeColor(colors, drawn * 2, beamColor)
        writeColor(colors, drawn * 2 + 1, beamColor)
        beamActors.push(contribution.actor)
        drawn++
      }
      geometry.setDrawRange(0, drawn * 2)
      flush(position, drawn)
      flush(color, drawn)
      return { drawn, dropped }
    },
    setOrigins(origins) {
      anchor(origins)
      for (let beam = 0; beam < beamActors.length; beam++) {
        const actor = beamActors[beam]
        if (actor === undefined) continue
        writeOrigin(beam, actor)
      }
      flush(position, beamActors.length)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
