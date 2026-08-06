import * as THREE from 'three'
import type { UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
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
  /** Universe layout whose galaxies become Points objects. */
  readonly layout: UniverseLayout
}

/** A contributor node (kw or AK) drawn in the scene. */
export interface SceneContributor {
  readonly actor: 0 | 1
  readonly mesh: THREE.Mesh
}

/** Owns the three.js renderer, scene, camera, and per-galaxy points. */
export interface GalaxyScene {
  readonly renderer: THREE.WebGLRenderer
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  /** Per-galaxy points objects, indexed by galaxy position in the layout. */
  readonly galaxies: THREE.Points[]
  readonly contributors: SceneContributor[]
  /** Updates the star colors for the current frame. */
  setFrame(layout: UniverseLayout, frame: UniverseFrame): void
  /** Moves contributor nodes to eased positions. */
  setContributors(nodes: readonly { actor: 0 | 1; x: number; y: number }[]): void
  /** Resizes the renderer and camera aspect. */
  resize(width: number, height: number): void
  /** Renders one frame. */
  render(): void
  /** Releases GPU resources. */
  dispose(): void
}

const DEFAULT_THEME: GalaxySceneTheme = {
  background: 0x1d2021,
  star: 0x5c6370,
  liveStar: 0x81a1c1,
  currentStar: 0x98c379,
  contributor: 0x61afef,
  agent: 0xc678dd,
  label: 0xd8dee9,
}

function toColor(value: number): THREE.Color {
  return new THREE.Color(value)
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
    const short = name.split('/').pop() ?? name
    ctx.fillText(short, 256, 32)
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
  actor: 0 | 1,
  color: number
): void {
  const geometry = new THREE.SphereGeometry(0.06, 12, 12)
  const material = new THREE.MeshBasicMaterial({ color })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(0, 0, 0.5)
  scene.add(mesh)
  contributors.push({ actor, mesh })
}

/**
 * @description Builds a three.js galaxy scene from a universe layout.
 * @param canvas The canvas the renderer draws into.
 * @param options Theme colors.
 * @returns An owned scene with one Points object per galaxy.
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
  camera.position.z = 2.6

  const galaxies: THREE.Points[] = []
  const contributors: SceneContributor[] = []
  const labels: THREE.Sprite[] = []
  addContributorNode(scene, contributors, 0, theme.contributor)
  addContributorNode(scene, contributors, 1, theme.agent)

  for (let index = 0; index < options.layout.galaxies.length; index++) {
    const galaxy = options.layout.galaxies[index]
    if (!galaxy) continue
    const points = buildGalaxyPoints(options.layout, index, theme)
    scene.add(points)
    galaxies.push(points)
    const label = createLabelSprite(galaxy.name, theme.label)
    label.position.set((galaxy.x - 0.5) * 6, (galaxy.y - 0.5) * 4, 0)
    scene.add(label)
    labels.push(label)
  }

  const setFrame = (layout: UniverseLayout, frame: UniverseFrame): void => {
    const current = new Set(frame.currentFiles)
    for (let index = 0; index < layout.galaxies.length; index++) {
      const galaxy = layout.galaxies[index]
      if (!galaxy) continue
      const points = galaxies[index]
      if (!points) continue
      updateStarColors(points, galaxy, frame, current, theme)
    }
  }

  return {
    renderer,
    scene,
    camera,
    galaxies,
    contributors,
    setFrame,
    setContributors(nodes) {
      // Hide every contributor first; only nodes present in the current frame
      // become visible at their centroid. This prevents a stray node lingering
      // at the field center when an actor has no contribution that day.
      for (const contributor of contributors) contributor.mesh.visible = false
      for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index]
        if (!node) continue
        const existing = contributors.find((c) => c.actor === node.actor)
        if (!existing) continue
        existing.mesh.visible = true
        existing.mesh.position.x = (node.x - 0.5) * 6
        existing.mesh.position.y = (node.y - 0.5) * 4
        existing.mesh.position.z = 0.5
      }
    },
    resize(width, height) {
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(1, height)
      camera.updateProjectionMatrix()
    },
    render() {
      renderer.render(scene, camera)
    },
    dispose() {
      for (const points of galaxies) points.geometry.dispose()
      for (const contributor of contributors) {
        contributor.mesh.geometry.dispose()
        const material = contributor.mesh.material
        if (material instanceof THREE.Material) material.dispose()
      }
      for (const label of labels) {
        const material = label.material
        if (material.map) material.map.dispose()
        material.dispose()
      }
      renderer.dispose()
    },
  }
}

/**
 * @description Builds a galaxy Points object from a layout galaxy.
 * @param layout The full layout (to position the galaxy in field space).
 * @param index Galaxy index into the layout.
 * @param theme Color palette.
 * @returns A three.js Points object.
 */
export function buildGalaxyPoints(
  layout: UniverseLayout,
  index: number,
  theme: GalaxySceneTheme
): THREE.Points {
  const galaxy = layout.galaxies[index]
  if (!galaxy) throw new RangeError(`galaxy index ${index} is out of range`)

  const positions: number[] = []
  const colors: number[] = []
  const sizes: number[] = []
  const starColor = toColor(theme.star)

  for (const star of galaxy.stars) {
    positions.push((star.x - 0.5) * 2, (star.y - 0.5) * 2, 0)
    colors.push(starColor.r, starColor.g, starColor.b)
    sizes.push(0.09 + ((index + star.file.length) % 8) * 0.008)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1))
  geometry.setAttribute('scale', new THREE.Float32BufferAttribute(Array(galaxy.stars.length).fill(1), 1))

  const material = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX_SHADER,
    fragmentShader: STAR_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  })

  const points = new THREE.Points(geometry, material)
  points.position.x = (galaxy.x - 0.5) * 6
  points.position.y = (galaxy.y - 0.5) * 4
  return points
}

function updateStarColors(
  points: THREE.Points,
  galaxy: UniverseLayout['galaxies'][number],
  frame: UniverseFrame,
  current: ReadonlySet<string>,
  theme: GalaxySceneTheme
): void {
  const geometry = points.geometry
  const colorAttr = geometry.getAttribute('color')
  if (!colorAttr) return
  const live = toColor(theme.liveStar)
  const currentColor = toColor(theme.currentStar)
  const base = toColor(theme.star)
  const array = colorAttr.array as Float32Array
  for (let index = 0; index < galaxy.stars.length; index++) {
    const star = galaxy.stars[index]
    if (!star) continue
    const key = `${galaxy.repoId}:${star.file}`
    const isCurrent = current.has(key)
    const isLive = frame.liveFiles.has(key)
    const color = isCurrent ? currentColor : isLive ? live : base
    const offset = index * 3
    array[offset] = color.r
    array[offset + 1] = color.g
    array[offset + 2] = color.b
  }
  colorAttr.needsUpdate = true
}
