import * as THREE from 'three'
import { starKey } from './galaxy'
import type { RepoArm, StarPosition, UniverseLayout } from './galaxy'
import { RECENT_REPO_STEPS } from './universePlayback'
import type { UniverseFrame } from './universePlayback'
import type { UniverseActor } from './types'
import { STAR_FRAGMENT_SHADER, STAR_VERTEX_SHADER } from './galaxyShader'

/** Host-agnostic theme mapped to three.js colors. */
export interface GalaxySceneTheme {
  readonly background: number
  readonly star: number
  readonly liveStar: number
  readonly currentStar: number
  readonly contributor: number
  readonly agent: number
  readonly label: number
}

/** Options for creating the three.js galaxy scene. */
export interface GalaxySceneOptions {
  readonly theme?: GalaxySceneTheme
  /** Universe layout whose stars become the disc's single star field. */
  readonly layout: UniverseLayout
}

/** A contributor node (kw or AK) drawn in the scene. */
export interface SceneContributor {
  readonly actor: UniverseActor
  readonly mesh: THREE.Mesh
}

/** What one frame cost, so the host can surface a beam budget overrun. */
export interface GalaxyFrameStats {
  /** Star vertices written this frame; 0 when the step did not change. */
  readonly promoted: number
  /** Beams drawn for the current step. */
  readonly beams: number
  /** Contributions on this step that produced no beam. Never silent. */
  readonly beamOverflow: number
  /** Label sprites revealed this frame; each one is a draw call. */
  readonly labels: number
}

/** Owns the three.js renderer, scene, camera, star field, beams, and labels. */
export interface GalaxyScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** The whole disc, as one Points object. */
  readonly stars: THREE.Points
  /** Every zap beam for the current step, as one LineSegments object. */
  readonly beams: THREE.LineSegments
  /** One label sprite per repo, in layout order, hidden until revealed. */
  readonly labels: readonly THREE.Sprite[]
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

/** The disc's single star field, with brightness that only ever increases. */
export interface StarField {
  readonly points: THREE.Points
  /**
   * Promotes the vertices this frame names and demotes the step it leaves.
   * Returns how many vertices were written, which is 0 for a repeated step.
   */
  setFrame(layout: UniverseLayout, frame: UniverseFrame): number
  dispose(): void
}

/** The repo labels, one sprite per arm segment, hidden until revealed. */
export interface RepoLabels {
  readonly sprites: readonly THREE.Sprite[]
  /**
   * Reveals the labels this frame justifies and hides every other one.
   * @returns How many sprites are visible, which is their draw-call count.
   */
  setFrame(frame: UniverseFrame, highlight: number | null): number
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
  readonly lines: THREE.LineSegments
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

/** Field-to-world scale of the disc, per axis. */
const WORLD_WIDTH = 6
const WORLD_HEIGHT = 4
/** World depth of the contributor nodes, just in front of the disc plane. */
const CONTRIBUTOR_DEPTH = 0.5
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

const DEFAULT_THEME: GalaxySceneTheme = {
  background: 0x1d2021,
  // Untouched stars clear a 4.5:1 contrast ratio against the background. The
  // former 0x5c6370 measured 2.7:1 and read as empty space, which is why 58 of
  // 60 repos looked missing rather than merely quiet.
  star: 0x8b98ab,
  liveStar: 0xb7d3ef,
  currentStar: 0xd8f2b0,
  contributor: 0x61afef,
  agent: 0xc678dd,
  label: 0xd8dee9,
}

function toColor(value: number): THREE.Color {
  return new THREE.Color(value)
}

function worldX(field: number): number {
  return (field - 0.5) * WORLD_WIDTH
}

function worldY(field: number): number {
  return (field - 0.5) * WORLD_HEIGHT
}

function worldZ(field: number): number {
  return (field - 0.5) * WORLD_HEIGHT
}

function shortName(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

function writeColor(array: Float32Array, index: number, color: THREE.Color): void {
  const offset = index * 3
  array[offset] = color.r
  array[offset + 1] = color.g
  array[offset + 2] = color.b
}

function createLabelSprite(name: string, color: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '600 40px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const rgb = new THREE.Color(color)
    ctx.fillStyle = `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`
    ctx.fillText(shortName(name), 256, 32)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  })
  const sprite = new THREE.Sprite(material)
  sprite.scale.set(1.4, 0.175, 1)
  return sprite
}

function addContributorNode(
  scene: THREE.Scene,
  contributors: SceneContributor[],
  actor: UniverseActor,
  color: number
): void {
  const geometry = new THREE.SphereGeometry(0.06, 12, 12)
  const material = new THREE.MeshBasicMaterial({ color })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(0, 0, CONTRIBUTOR_DEPTH)
  scene.add(mesh)
  contributors.push({ actor, mesh })
}

/**
 * @description Builds a three.js galaxy scene from a universe layout.
 * @param canvas The canvas the renderer draws into.
 * @param options Theme colors and the layout to render.
 * @returns An owned scene holding one star field, one beam field, and one
 * label sprite per repo.
 */
export function createGalaxyScene(
  canvas: HTMLCanvasElement,
  options: GalaxySceneOptions
): GalaxyScene {
  const theme = { ...DEFAULT_THEME, ...options.theme }
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  })
  renderer.setClearColor(theme.background, 1)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
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
  for (const sprite of labels.sprites) scene.add(sprite)

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
    labels: labels.sprites,
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
        if (material instanceof THREE.Material) material.dispose()
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
  camera: THREE.PerspectiveCamera,
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
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number
): void {
  camera.aspect = Math.max(1, width) / Math.max(1, height)
  camera.updateProjectionMatrix()
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
): THREE.Points {
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

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const color = new THREE.BufferAttribute(colors, 3)
  // Brightness is the only attribute playback mutates, and it mutates a
  // handful of vertices per step.
  color.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('color', color)
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  })

  return new THREE.Points(geometry, material)
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
  const attribute = points.geometry.getAttribute('color') as THREE.BufferAttribute
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
    color: THREE.Color
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
      if (material instanceof THREE.Material) material.dispose()
    },
  }
}

/**
 * @description Creates one label sprite per repo, positioned at that repo's arm
 * segment and hidden until something reveals it: the viewer highlighting that
 * repo, or the repo receiving a contribution, after which the label fades out
 * over the following few days of playback. Sixty always-on labels were sixty
 * draw calls and 7.5 MiB of texture for a name nobody was reading; a revealed
 * label is one the viewer has a reason to read.
 * @param repos The layout's arm segments, in recency order.
 * @param theme Color palette.
 * @returns The sprites, their per-frame reveal, and their disposal.
 */
export function createRepoLabels(
  repos: readonly RepoArm[],
  theme: GalaxySceneTheme
): RepoLabels {
  const sprites: THREE.Sprite[] = []
  for (const repo of repos) {
    const sprite = createLabelSprite(repo.name, theme.label)
    sprite.position.set(worldX(repo.x), worldY(repo.y), worldZ(repo.z))
    sprite.visible = false
    sprite.material.opacity = 0
    sprites.push(sprite)
  }
  return {
    sprites,
    setFrame(frame, highlight) {
      let visible = 0
      for (let index = 0; index < repos.length; index++) {
        const repo = repos[index]
        const sprite = sprites[index]
        if (!repo || !sprite) continue
        const opacity =
          repo.repoId === highlight
            ? 1
            : contributionOpacity(frame.recentRepos.get(repo.repoId))
        sprite.visible = opacity > 0
        sprite.material.opacity = opacity
        if (sprite.visible) visible++
      }
      return visible
    },
    dispose() {
      for (const sprite of sprites) {
        // The sprite geometry is shared across every three.js sprite; only the
        // material and its canvas texture belong to this label.
        const material = sprite.material
        if (material.map) material.map.dispose()
        material.dispose()
      }
    },
  }
}

/**
 * @description Opacity of a label revealed by a contribution. Derived from the
 * frame's own recency rather than accumulated across frames, so scrubbing to a
 * day shows exactly what playing to it would, with no animation state to drift.
 * @param age Steps of playback since the contribution, or undefined when the
 * repo has aged out of the frame's recent set.
 * @returns An opacity in [0, 1]; 0 means the label costs no draw call.
 */
function contributionOpacity(age: number | undefined): number {
  if (age === undefined || age >= RECENT_REPO_STEPS) return 0
  return 1 - age / RECENT_REPO_STEPS
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
  camera: THREE.PerspectiveCamera,
  metrics: { readonly width: number; readonly height: number }
): ArmScreenPoint {
  camera.updateMatrixWorld()
  const projected = new THREE.Vector3(
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
  camera: THREE.PerspectiveCamera,
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
  const geometry = new THREE.BufferGeometry()
  const position = new THREE.BufferAttribute(positions, 3)
  const color = new THREE.BufferAttribute(colors, 3)
  position.setUsage(THREE.DynamicDrawUsage)
  color.setUsage(THREE.DynamicDrawUsage)
  geometry.setAttribute('position', position)
  geometry.setAttribute('color', color)
  geometry.setDrawRange(0, 0)
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: BEAM_OPACITY,
    depthWrite: false,
  })
  const lines = new THREE.LineSegments(geometry, material)
  // The draw range covers a fraction of the preallocated buffer, so the
  // bounding sphere three.js would compute from it is meaningless.
  lines.frustumCulled = false

  const actorColors = [toColor(theme.contributor), toColor(theme.agent)] as const
  const anchors = [new THREE.Vector3(), new THREE.Vector3()] as const
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
  const flush = (attribute: THREE.BufferAttribute, drawn: number): void => {
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
