import { PerspectiveCamera, Quaternion } from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRepoLabels } from '../src/galaxyLabels'
import type { RepoLabels } from '../src/galaxyLabels'
import { layoutUniverse } from '../src/galaxy'
import type { UniverseLayout } from '../src/galaxy'
import { placeCamera } from '../src/galaxyScene'
import {
  RECENT_REPO_HOLD,
  RECENT_REPO_STEPS,
  universeFrame,
} from '../src/universePlayback'
import type { PlaybackDirection, UniverseSnapshot } from '../src/types'
import {
  THEME,
  frameAt,
  labelCanvases,
  layout,
  painted,
  stubCanvasDocument,
  type FakeCanvas,
} from './galaxyFixtures'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createRepoLabels', () => {
  /**
   * One repo with one contribution, and a full recency window of room on both
   * sides, so the label can age out in either direction without the step
   * clamping against the end of the timeline.
   */
  const TOUCH_STEP = RECENT_REPO_STEPS + 5
  const TRAIL: UniverseSnapshot = {
    repos: [{ id: 7, name: 'a/trail', files: ['t.ts'] }],
    contributions: [{ step: TOUCH_STEP, repo: 7, file: 't.ts', actor: 0 }],
    stepCount: TOUCH_STEP + RECENT_REPO_STEPS + 5,
  }

  function opacityOf(source: UniverseLayout, labels: RepoLabels, repoId: number): number {
    const index = source.repos.findIndex((repo) => repo.repoId === repoId)
    const mesh = labels.meshes[index]
    if (!mesh) throw new Error(`no label for repo ${repoId}`)
    return mesh.visible ? mesh.material.opacity : 0
  }

  function trail(steps: readonly number[], direction: PlaybackDirection): number[] {
    stubCanvasDocument()
    const source = layoutUniverse(TRAIL)
    const labels = createRepoLabels(source.repos, THEME)
    const opacities = steps.map((step) => {
      labels.setFrame(universeFrame(TRAIL, step, direction), null)
      return opacityOf(source, labels, 7)
    })
    labels.dispose()
    return opacities
  }

  /**
   * A one-glyph name, a name too long for the old fixed 512px texture, and one
   * long enough to burst any texture a GPU will accept.
   */
  const LONG_NAME = 'a-very-long-repository-name-that-used-to-clip'
  const HUGE_NAME = 'n'.repeat(400)
  const NAMES: UniverseSnapshot = {
    repos: [
      { id: 0, name: 'a/x', files: ['x.ts'] },
      { id: 1, name: `a/${LONG_NAME}`, files: ['y.ts'] },
      { id: 2, name: `a/${HUGE_NAME}`, files: ['z.ts'] },
    ],
    contributions: [{ step: 0, repo: 0, file: 'x.ts', actor: 0 }],
    stepCount: 2,
  }

  /** The canvas a repo painted its label into, found through the layout order. */
  function canvasFor(source: UniverseLayout, repoId: number): FakeCanvas {
    const index = source.repos.findIndex((repo) => repo.repoId === repoId)
    const canvas = labelCanvases[index]
    if (!canvas) throw new Error(`no label canvas for repo ${repoId}`)
    return canvas
  }

  it('sizes every label texture to its own name and paints all of it', () => {
    stubCanvasDocument()
    const source = layoutUniverse(NAMES)
    const labels = createRepoLabels(source.repos, THEME)
    // A fixed texture width made this impossible: a long name either overran
    // the canvas and clipped, or had to be shrunk to fit one.
    expect(canvasFor(source, 1).width).toBeGreaterThan(canvasFor(source, 0).width)
    expect(painted).toContain('x')
    expect(painted).toContain(LONG_NAME)
    labels.dispose()
  })

  it('gives each billboard its own texture aspect, so no name is squeezed', () => {
    stubCanvasDocument()
    const source = layoutUniverse(NAMES)
    const labels = createRepoLabels(source.repos, THEME)
    for (let index = 0; index < source.repos.length; index++) {
      const mesh = labels.meshes[index]
      const canvas = labelCanvases[index]
      if (!mesh || !canvas) throw new Error(`no label at ${index}`)
      expect(mesh.scale.x / mesh.scale.y).toBeCloseTo(canvas.width / canvas.height, 6)
    }
    labels.dispose()
  })

  it('renders every label at one height, so only the width follows the name', () => {
    stubCanvasDocument()
    const source = layoutUniverse(NAMES)
    const labels = createRepoLabels(source.repos, THEME)
    expect(new Set(labels.meshes.map((mesh) => mesh.scale.y)).size).toBe(1)
    expect(new Set(labels.meshes.map((mesh) => mesh.scale.x)).size).toBe(
      source.repos.length
    )
    labels.dispose()
  })

  it('holds a pathological name inside the texture size WebGL guarantees', () => {
    stubCanvasDocument()
    const source = layoutUniverse(NAMES)
    const labels = createRepoLabels(source.repos, THEME)
    // 2048 is the smallest `MAX_TEXTURE_SIZE` a WebGL 2 context may report. A
    // 400-glyph name asks for several times that, and a texture the driver
    // refuses is a label that never renders at all.
    for (const canvas of labelCanvases) {
      expect(canvas.width).toBeGreaterThan(0)
      expect(canvas.width).toBeLessThanOrEqual(2048)
    }
    // Condensed to fit rather than cut off: the whole name still reaches the
    // canvas, which is the difference between illegible and absent.
    expect(painted).toContain(HUGE_NAME)
    labels.dispose()
  })

  it('gives every repo one label and shows none of them by default', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    expect(labels.meshes).toHaveLength(source.repos.length)
    expect(labels.meshes.some((mesh) => mesh.visible)).toBe(false)
    expect(painted).toEqual(['r1', 'r2', 'quiet'])
    labels.dispose()
  })

  it('shares one plane geometry across every label', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    const geometries = new Set(labels.meshes.map((mesh) => mesh.geometry))
    expect(geometries.size).toBe(1)
    labels.dispose()
  })

  it('turns every label to face the camera, the way a sprite would', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    const camera = new PerspectiveCamera(60, 1.5, 0.1, 100)
    placeCamera(camera, 2, 1, 1.5)
    labels.faceCamera(camera)
    for (const mesh of labels.meshes)
      expect(mesh.quaternion.equals(camera.quaternion)).toBe(true)
    // A camera that has not moved yet leaves the labels flat on the disc.
    const flat = new PerspectiveCamera(60, 1.5, 0.1, 100)
    placeCamera(flat, 0, 0, 2.6)
    labels.faceCamera(flat)
    for (const mesh of labels.meshes)
      expect(mesh.quaternion.angleTo(new Quaternion())).toBeLessThan(1e-6)
    labels.dispose()
  })

  it('reveals only the labels a step earns, and reports the draw calls', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    // Step 0 touches repo 0 and repo 1; the quiet repo stays unlabelled.
    expect(labels.setFrame(frameAt(0), null)).toBe(2)
    expect(opacityOf(source, labels, 0)).toBe(1)
    expect(opacityOf(source, labels, 1)).toBe(1)
    expect(opacityOf(source, labels, 2)).toBe(0)
    labels.dispose()
  })

  it('holds a contribution-revealed label lit, then fades it out', () => {
    const hold = Math.floor(RECENT_REPO_STEPS * RECENT_REPO_HOLD)
    const steps = [
      TOUCH_STEP,
      TOUCH_STEP + hold,
      TOUCH_STEP + RECENT_REPO_STEPS - 1,
      TOUCH_STEP + RECENT_REPO_STEPS,
    ]
    const [lit, stillLit, fading, gone] = trail(steps, 'forward')
    // A contribution keeps its repo named for most of the window rather than
    // dimming from the moment it lands.
    expect(lit).toBe(1)
    expect(stillLit).toBe(1)
    expect(fading).toBeGreaterThan(0)
    expect(fading).toBeLessThan(1)
    expect(gone).toBe(0)
  })

  it('fades in playback order, so a backward pass trails the other way', () => {
    const hold = Math.floor(RECENT_REPO_STEPS * RECENT_REPO_HOLD)
    const [lit, stillLit, gone] = trail(
      [TOUCH_STEP, TOUCH_STEP - hold, TOUCH_STEP - RECENT_REPO_STEPS],
      'backward'
    )
    expect(lit).toBe(1)
    expect(stillLit).toBe(1)
    expect(gone).toBe(0)
  })

  it('resolves the same opacity from a seek as from a walk', () => {
    // The fade is derived from the step, never accumulated across frames, so
    // scrubbing to a day matches having played to it.
    const late = TOUCH_STEP + RECENT_REPO_STEPS - 1
    expect(trail([TOUCH_STEP, TOUCH_STEP + 1, late], 'forward').at(-1)).toBe(
      trail([late], 'forward').at(-1)
    )
    expect(trail([0, TOUCH_STEP + 2, late], 'forward').at(-1)).toBe(
      trail([late], 'forward').at(-1)
    )
  })

  it('reveals a highlighted repo whatever the step, and hides it again', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    // The quiet repo has no contribution anywhere in the timeline.
    expect(labels.setFrame(frameAt(5), 2)).toBeGreaterThan(0)
    expect(opacityOf(source, labels, 2)).toBe(1)
    labels.setFrame(frameAt(5), null)
    expect(opacityOf(source, labels, 2)).toBe(0)
    labels.dispose()
  })

  it('keeps the selected repo named while it stays selected', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    // No hover, no contribution on this step: only the selection reveals it.
    expect(labels.setFrame(frameAt(5), null, 2)).toBeGreaterThan(0)
    expect(opacityOf(source, labels, 2)).toBe(1)
    labels.setFrame(frameAt(5), null, null)
    expect(opacityOf(source, labels, 2)).toBe(0)
    labels.dispose()
  })

  it('releases every label texture and the shared plane on dispose', () => {
    stubCanvasDocument()
    const source = layout()
    const labels = createRepoLabels(source.repos, THEME)
    const textures = labels.meshes.map((mesh) => {
      const map = mesh.material.map
      if (!map) throw new Error('label has no texture')
      return vi.spyOn(map, 'dispose')
    })
    const materials = labels.meshes.map((mesh) => vi.spyOn(mesh.material, 'dispose'))
    const first = labels.meshes[0]
    if (!first) throw new Error('no labels to dispose')
    const plane = vi.spyOn(first.geometry, 'dispose')
    labels.dispose()
    for (const spy of [...textures, ...materials]) expect(spy).toHaveBeenCalledTimes(1)
    expect(plane).toHaveBeenCalledTimes(1)
  })
})
