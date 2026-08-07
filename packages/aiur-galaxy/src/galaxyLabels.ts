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

/** Label plane size in world units, wide enough for a short repo name. */
const LABEL_WIDTH = 1.4
const LABEL_HEIGHT = 0.175
/** Texture size the name is painted into; 8:1 matches the plane's aspect. */
const TEXTURE_WIDTH = 512
const TEXTURE_HEIGHT = 64

function shortName(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

/** Paints a repo's short name into a texture, transparent everywhere else. */
function labelTexture(name: string, color: number): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '600 40px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const rgb = toColor(color)
    ctx.fillStyle = `rgb(${Math.round(rgb.r * 255)},${Math.round(rgb.g * 255)},${Math.round(rgb.b * 255)})`
    ctx.fillText(shortName(name), TEXTURE_WIDTH / 2, TEXTURE_HEIGHT / 2)
  }
  const texture = new CanvasTexture(canvas)
  texture.minFilter = LinearFilter
  return texture
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
  // One geometry for every label: the plane is identical, only the texture and
  // the position differ, so sixty labels are sixty materials and one buffer.
  const plane = new PlaneGeometry(LABEL_WIDTH, LABEL_HEIGHT)
  const meshes: RepoLabel[] = []
  for (const repo of repos) {
    const material = new MeshBasicMaterial({
      map: labelTexture(repo.name, theme.label),
      transparent: true,
      depthWrite: false,
    })
    const mesh = new Mesh(plane, material)
    mesh.position.set(worldX(repo.x), worldY(repo.y), worldZ(repo.z))
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
