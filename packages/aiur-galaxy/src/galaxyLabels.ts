import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
} from 'three'
import type { PerspectiveCamera } from 'three'
import type { RepoArm } from './galaxy'
import { RECENT_REPO_HOLD, RECENT_REPO_STEPS } from './universePlayback'
import type { UniverseFrame } from './universePlayback'
import {
  faceCamera,
  toColor,
  worldX,
  worldY,
  worldZ,
  type GalaxySceneTheme,
} from './galaxyWorld'

/**
 * One repo label: a textured plane turned to face the camera every frame. A
 * `Sprite` billboards itself, but `Sprite` plus `SpriteMaterial` cost about a
 * kilobyte brotli in the deferred island, and the galaxy has no kilobyte to
 * spare; a shared plane and a quaternion copy buy the same picture.
 */
export type RepoLabel = Mesh<PlaneGeometry, MeshBasicMaterial>

/** The repo labels, one plane per arm segment, hidden until revealed. */
export interface RepoLabels {
  readonly meshes: readonly RepoLabel[]
  /**
   * Reveals the labels this frame justifies and hides every other one.
   * @returns How many labels are visible, which is their draw-call count.
   */
  setFrame(
    frame: UniverseFrame,
    highlight: number | null,
    selected?: number | null
  ): number
  /** Turns every label to face the camera. */
  faceCamera(camera: PerspectiveCamera): void
  dispose(): void
}

/**
 * On-screen label height in world units. Every label renders at this height
 * whatever its name is; only the width follows the text, so sixty labels read
 * as one family rather than as sixty different type sizes.
 */
const LABEL_HEIGHT = 0.175
/** Texture height the name is painted into; the width is measured per name. */
const TEXTURE_HEIGHT = 64
const LABEL_FONT = '600 40px monospace'
/** Blank pixels kept either side of the text so glyphs never touch the edge. */
const TEXTURE_PADDING = 16
/** Blur radius of the label's backdrop plate, in texture pixels. */
const BACKDROP_BLUR = 10
/** The plate itself: dark and translucent, so stars read faintly through it. */
const BACKDROP_FILL = 'rgba(15, 17, 18, 0.72)'
/**
 * Widest texture a label may ask for. Every WebGL 2 context guarantees at
 * least 2048, and a texture the driver refuses is a label that never renders
 * at all, so a pathologically long name is condensed into this rather than
 * allowed to size the canvas past what the GPU will take.
 */
const MAX_TEXTURE_WIDTH = 2048
/** Width used when the 2D context is unavailable and nothing can be measured. */
const FALLBACK_TEXTURE_WIDTH = 512

/** A label's texture and the aspect its billboard has to match to stay square. */
interface LabelTexture {
  readonly texture: CanvasTexture
  readonly aspect: number
}

function shortName(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

/** Paints a repo's short name into a texture, transparent everywhere else. */
function labelTexture(name: string, color: number): LabelTexture {
  const text = shortName(name)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const width = textureWidth(ctx, text)
  canvas.width = width
  canvas.height = TEXTURE_HEIGHT
  if (ctx) {
    // Resizing a canvas resets every property of its 2D context, so the font is
    // set again here rather than carried over from the measuring pass.
    paintBackdrop(ctx, width)
    ctx.font = LABEL_FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const rgb = toColor(color)
    ctx.fillStyle = `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`
    // The `maxWidth` argument condenses the glyphs rather than cutting them
    // off, which is what keeps a clamped name readable instead of truncated.
    ctx.fillText(text, width / 2, TEXTURE_HEIGHT / 2, width - TEXTURE_PADDING * 2)
  }
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  return { texture, aspect: width / TEXTURE_HEIGHT }
}

/**
 * @description Paints the dark, soft-edged plate a label sits on, so its text
 * reads against a dense star field instead of competing with it.
 *
 * The blur is baked into the label's own texture rather than sampling the scene
 * behind it. A true backdrop blur needs a post-process pass over the rendered
 * frame, and the galaxy island has almost no bundle budget left; a blurred
 * plate is visually equivalent here because what sits behind a label is always
 * the same dark background plus stars.
 *
 * `ctx.filter` is unsupported in some engines and silently ignored where it is,
 * which costs the softness but never the plate.
 * @param ctx The label canvas context.
 * @param width Texture width in pixels.
 */
function paintBackdrop(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.save()
  ctx.filter = `blur(${BACKDROP_BLUR}px)`
  ctx.fillStyle = BACKDROP_FILL
  // Inset by the blur radius so the softened edge fades inside the texture
  // rather than being clipped flat against its bounds.
  const inset = BACKDROP_BLUR
  ctx.fillRect(
    inset,
    inset,
    Math.max(0, width - inset * 2),
    Math.max(0, TEXTURE_HEIGHT - inset * 2)
  )
  ctx.restore()
}

/** Texture width this name needs, measured in the font it will be painted in. */
function textureWidth(ctx: CanvasRenderingContext2D | null, text: string): number {
  if (!ctx) return FALLBACK_TEXTURE_WIDTH
  ctx.font = LABEL_FONT
  const measured = Math.ceil(ctx.measureText(text).width) + TEXTURE_PADDING * 2
  return Math.min(MAX_TEXTURE_WIDTH, Math.max(TEXTURE_HEIGHT, measured))
}

/**
 * @description Creates one label per repo, positioned at that repo's arm
 * segment and hidden until something reveals it: the viewer hovering that repo,
 * the viewer having selected it, or the repo receiving a contribution, after
 * which the label fades out over the following few days of playback. Sixty
 * always-on labels were sixty draw calls and 7.5 MiB of texture for a name
 * nobody was reading; a revealed label is one the viewer has a reason to read.
 * @param repos The layout's arm segments, in recency order.
 * @param theme Color palette.
 * @returns The label planes, their per-frame reveal, and their disposal.
 */
export function createRepoLabels(
  repos: readonly RepoArm[],
  theme: GalaxySceneTheme
): RepoLabels {
  // One unit geometry for every label, scaled per label rather than built per
  // label: the plane is identical, only the texture, the position, and the
  // scale differ, so sixty labels are sixty materials and one buffer. Scaling
  // is also what lets a label take its texture's aspect without a name-shaped
  // geometry per repo.
  const plane = new PlaneGeometry(1, 1)
  const meshes: RepoLabel[] = []
  for (const repo of repos) {
    const label = labelTexture(repo.name, theme.label)
    const material = new MeshBasicMaterial({
      map: label.texture,
      transparent: true,
      depthWrite: false,
      // A label is annotation, not scenery, and it has to stay readable
      // wherever it lands in a disc 16,000 stars deep. Without this the stars
      // in front of it occlude it, and the labels nearest the core — the ones
      // naming the most recent work — are exactly the ones that vanish.
      depthTest: false,
    })
    const mesh = new Mesh(plane, material)
    // Drawn after the star and beam fields, which keep the default order of 0.
    mesh.renderOrder = 1
    mesh.position.set(worldX(repo.x), worldY(repo.y), worldZ(repo.z))
    mesh.scale.set(LABEL_HEIGHT * label.aspect, LABEL_HEIGHT, 1)
    mesh.visible = false
    mesh.material.opacity = 0
    meshes.push(mesh)
  }
  return {
    meshes,
    setFrame(frame, highlight, selected = null) {
      let visible = 0
      for (let index = 0; index < repos.length; index++) {
        const repo = repos[index]
        const mesh = meshes[index]
        if (!repo || !mesh) continue
        const revealed = repo.repoId === highlight || repo.repoId === selected
        const opacity = revealed
          ? 1
          : contributionOpacity(frame.recentRepos.get(repo.repoId))
        mesh.visible = opacity > 0
        mesh.material.opacity = opacity
        if (mesh.visible) visible++
      }
      return visible
    },
    faceCamera(camera) {
      faceCamera(camera, meshes)
    },
    dispose() {
      // The plane is shared across every label; only the material and its
      // canvas texture belong to one of them.
      for (const mesh of meshes) {
        const material = mesh.material
        if (material.map) material.map.dispose()
        material.dispose()
      }
      plane.dispose()
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
  const hold = RECENT_REPO_STEPS * RECENT_REPO_HOLD
  if (age <= hold) return 1
  return 1 - (age - hold) / (RECENT_REPO_STEPS - hold)
}
