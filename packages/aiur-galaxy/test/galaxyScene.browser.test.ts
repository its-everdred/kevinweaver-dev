import { ShaderMaterial } from 'three'
import type { BufferAttribute } from 'three'
import { describe, expect, it, vi } from 'vitest'

import { createGalaxyScene } from '../src/galaxyScene'
import type { GalaxyScene, SceneContributor } from '../src/galaxyScene'
import { frameAt, layout, vertexOf } from './galaxyFixtures'

/**
 * The scene graph is the whole of what makes the sky a backdrop rather than
 * scenery: which parent it hangs off decides whether the disc's turn carries
 * it, and whether its position tracks the eye decides whether a pan parallaxes
 * it. Neither is visible from `createGalaxySky` alone, and neither can be
 * exercised without a real `WebGLRenderer`, so this file runs in Chromium.
 */
function scene(): GalaxyScene {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 200
  return createGalaxyScene(canvas, { layout: layout() })
}

describe('the galaxy scene backdrop', () => {
  it('carries the sky with the eye, so a pan never parallaxes it', () => {
    const galaxy = scene()
    // A pan moves the eye and the pivot together. The sky has to move with
    // them exactly, or the viewer slides past a backdrop that is supposed to
    // be unreachably far away.
    galaxy.setCamera(1.4, 0.9, 2.6, { x: 1.4, y: 0.9, z: 0 })
    expect(galaxy.sky.position.toArray()).toEqual([1.4, 0.9, 2.6])
    galaxy.setCamera(-3, 0.25, 1, { x: -3, y: 0.25, z: 0 })
    expect(galaxy.sky.position.toArray()).toEqual([-3, 0.25, 1])
    galaxy.dispose()
  })

  it('leaves the sky out of the disc turn', () => {
    const galaxy = scene()
    galaxy.setRotation(0)
    galaxy.scene.updateMatrixWorld(true)
    const skyAtRest = galaxy.sky.matrixWorld.clone()
    const starsAtRest = galaxy.stars.matrixWorld.clone()

    galaxy.setRotation(Math.PI / 2)
    galaxy.scene.updateMatrixWorld(true)

    // The sky is not part of the galaxy: a disc that has turned a quarter of
    // the way round leaves its backdrop exactly where it was.
    expect(galaxy.sky.matrixWorld.equals(skyAtRest)).toBe(true)
    // ...and the turn is real, or the assertion above is vacuous.
    expect(galaxy.stars.matrixWorld.equals(starsAtRest)).toBe(false)
    galaxy.dispose()
  })

  it('hangs the sky off the scene, never off the turning disc', () => {
    const galaxy = scene()
    // Direct child of the scene root. A sky parented to the disc would inherit
    // the field-to-world shear `turnMatrix` writes and breathe as it spun.
    expect(galaxy.sky.parent).toBe(galaxy.scene)
    // The stars are not, which is what makes the line above say something.
    expect(galaxy.stars.parent).not.toBe(galaxy.scene)
    galaxy.dispose()
  })

  it('releases the sky with everything else the scene owns', () => {
    const galaxy = scene()
    const geometry = vi.spyOn(galaxy.sky.geometry, 'dispose')
    const material = vi.spyOn(galaxy.sky.material as ShaderMaterial, 'dispose')
    galaxy.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})

describe('a contributor node fading out', () => {
  /** The node an actor is drawn as, or a thrown error when it has none. */
  function nodeOf(galaxy: GalaxyScene, actor: 0 | 1): SceneContributor {
    const found = galaxy.contributors.find((one) => one.actor === actor)
    if (!found) throw new Error(`the scene draws no node for actor ${actor}`)
    return found
  }

  it('blends the node, or an opacity below one changes nothing on screen', () => {
    const galaxy = scene()
    for (const node of galaxy.contributors)
      expect(node.mesh.material.transparent).toBe(true)
    galaxy.dispose()
  })

  it('carries each node its own opacity', () => {
    const galaxy = scene()
    galaxy.setContributors([
      { actor: 0, x: 0.2, y: 0.4, alpha: 1 },
      { actor: 1, x: 0.7, y: 0.7, alpha: 0.25 },
    ])
    expect(nodeOf(galaxy, 0).mesh.material.opacity).toBe(1)
    expect(nodeOf(galaxy, 1).mesh.material.opacity).toBe(0.25)
    expect(nodeOf(galaxy, 1).mesh.visible).toBe(true)
    galaxy.dispose()
  })

  it('stops drawing a node that has faded out entirely', () => {
    // A fully transparent billboard still costs a draw call and still fills
    // its pixels. Playback spends half the default window on days the agent
    // did not exist for, so this is most of a pass, not an edge case.
    const galaxy = scene()
    galaxy.setContributors([
      { actor: 0, x: 0.2, y: 0.4, alpha: 1 },
      { actor: 1, x: 0.7, y: 0.7, alpha: 0 },
    ])
    expect(nodeOf(galaxy, 0).mesh.visible).toBe(true)
    expect(nodeOf(galaxy, 1).mesh.visible).toBe(false)
    galaxy.dispose()
  })

  it('never lets an idle node drag the working actor beams', () => {
    // An idle node is placed every frame now, so it re-anchors the beam field
    // every frame too. Its own actor drew no beam today, and the beams that
    // were drawn belong to somebody else.
    const source = layout()
    const galaxy = scene()
    galaxy.setContributors([{ actor: 0, x: 0.2, y: 0.4, alpha: 1 }])
    galaxy.setFrame(source, frameAt(2))
    const ends = galaxy.beams.geometry.getAttribute('position') as BufferAttribute
    const before = vertexOf(ends, 0)
    // Step 2 is the human's day alone; the agent is idle and adrift.
    galaxy.setContributors([
      { actor: 0, x: 0.2, y: 0.4, alpha: 1 },
      { actor: 1, x: 0.9, y: 0.9, alpha: 1 },
    ])
    expect(vertexOf(ends, 0)).toEqual(before)
    galaxy.dispose()
  })
})
