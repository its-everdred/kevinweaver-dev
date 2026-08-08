import { AdditiveBlending, PerspectiveCamera, Points, ShaderMaterial, Vector3 } from 'three'
import type { BufferAttribute } from 'three'
import { describe, expect, it, vi } from 'vitest'

import {
  NEBULA_TINT,
  SKY_GALAXIES,
  SKY_NEBULAE,
  SKY_NEBULA_PUFFS,
  SKY_RADIUS,
  createGalaxySky,
  type GalaxySky,
} from '../src/galaxySky'
import { createGalaxyHaze } from '../src/galaxyHaze'
import { placeCamera } from '../src/galaxyScene'
import { buildGalaxyPoints } from '../src/galaxyStars'
import { THEME, layout } from './galaxyFixtures'

function floats(points: Points, name: string): Float32Array {
  return (points.geometry.getAttribute(name) as BufferAttribute).array as Float32Array
}

function extent(points: Points, name: string): { low: number; high: number } {
  const values = floats(points, name)
  return { low: Math.min(...values), high: Math.max(...values) }
}

/** The unit direction of one sky point, in world axes. */
function direction(sky: GalaxySky, index: number): Vector3 {
  const position = sky.points.geometry.getAttribute('position') as BufferAttribute
  return new Vector3(
    position.getX(index),
    position.getY(index),
    position.getZ(index)
  ).normalize()
}

/** Where one sky point lands in clip space, sky offset and all. */
function onScreen(sky: GalaxySky, index: number, camera: PerspectiveCamera): Vector3 {
  camera.updateMatrixWorld()
  const position = sky.points.geometry.getAttribute('position') as BufferAttribute
  return new Vector3(position.getX(index), position.getY(index), position.getZ(index))
    .add(sky.points.position)
    .project(camera)
}

describe('createGalaxySky', () => {
  it('draws the whole sky in one object, additively and without depth', () => {
    const sky = createGalaxySky(THEME)
    expect(sky.points).toBeInstanceOf(Points)
    expect(sky.points.geometry.getAttribute('position').count).toBe(
      SKY_GALAXIES + SKY_NEBULAE * SKY_NEBULA_PUFFS
    )
    const material = sky.points.material as ShaderMaterial
    expect(material.blending).toBe(AdditiveBlending)
    expect(material.depthWrite).toBe(false)
    sky.dispose()
  })

  it('surrounds the viewer, leaving no direction of the sky empty', () => {
    const sky = createGalaxySky(THEME)
    const directions = Array.from({ length: SKY_GALAXIES }, (_, index) =>
      direction(sky, index)
    )
    // Probe the sphere on its own lattice, offset off the sky's, and ask what
    // the nearest sky point to each probe is. "Full surround" is exactly this:
    // whichever way the viewer turns, sky is already there. A hemisphere of
    // points, or a band round the equator, fails this on the probes it misses.
    const golden = Math.PI * (3 - Math.sqrt(5))
    const PROBES = 64
    for (let probe = 0; probe < PROBES; probe++) {
      const z = 1 - (2 * probe + 1.37) / PROBES
      const ring = Math.sqrt(Math.max(0, 1 - z * z))
      const around = probe * golden + 0.7
      const look = new Vector3(ring * Math.cos(around), ring * Math.sin(around), z)
      const nearest = Math.max(...directions.map((point) => point.dot(look)))
      // Within 12 degrees, which is a fifth of the 60-degree field of view: no
      // framing the viewer can reach is empty of sky.
      expect(Math.acos(Math.min(1, nearest))).toBeLessThan(0.21)
    }
    sky.dispose()
  })

  it('holds every point on one shell, so nothing in the sky is nearer', () => {
    const sky = createGalaxySky(THEME)
    const position = sky.points.geometry.getAttribute('position') as BufferAttribute
    for (let index = 0; index < position.count; index++) {
      const radius = Math.hypot(
        position.getX(index),
        position.getY(index),
        position.getZ(index)
      )
      expect(radius).toBeCloseTo(SKY_RADIUS, 3)
    }
    sky.dispose()
  })

  it('stays put through a pan and moves only when the camera turns', () => {
    const sky = createGalaxySky(THEME)
    const camera = new PerspectiveCamera(60, 1.6, 0.1, 100)
    const PROBE = 0

    placeCamera(camera, 0, 0, 2.6)
    sky.follow(camera.position)
    const rest = onScreen(sky, PROBE, camera)
    const discRest = new Vector3(0, 0, 0).project(camera)

    // A pan carries the eye and the point it looks at by the same vector, so
    // the camera's orientation is untouched and only its position moves. A
    // backdrop at infinity cannot move on screen under that; anything nearer
    // parallaxes, and the parallax is the tell that it is not far away.
    placeCamera(camera, 1.4, 0.9, 2.6, { x: 1.4, y: 0.9, z: 0 })
    sky.follow(camera.position)
    const panned = onScreen(sky, PROBE, camera)
    expect(panned.x).toBeCloseTo(rest.x, 12)
    expect(panned.y).toBeCloseTo(rest.y, 12)

    // The same pan moves the disc's own centre a long way across the frame:
    // the sky holding still is a property of the sky, not of the pan.
    const discPanned = new Vector3(0, 0, 0).project(camera)
    expect(Math.abs(discPanned.x - discRest.x)).toBeGreaterThan(0.3)

    // A rotation is the one thing that must move it, or the surround is a
    // sticker on the lens rather than a sky.
    placeCamera(camera, 2.6, 0, 0)
    sky.follow(camera.position)
    const turned = onScreen(sky, PROBE, camera)
    expect(Math.hypot(turned.x - rest.x, turned.y - rest.y)).toBeGreaterThan(0.5)

    sky.dispose()
  })

  it('leaves the disc the brightest thing in the frame', () => {
    const source = layout()
    const stars = buildGalaxyPoints(source, THEME)
    const haze = createGalaxyHaze(source, THEME)
    const sky = createGalaxySky(THEME)
    // The same relationship the haze already keeps to the stars. A backdrop
    // brighter than this washes out the additive haze the disc's glow is made
    // of, and the stars stop reading as the subject.
    expect(extent(sky.points, 'brightness').high).toBeLessThan(
      extent(stars, 'brightness').low / 8
    )
    // Every sky point is at least partly feathered: a hard-edged dot at this
    // distance reads as a star in the disc, not as a galaxy behind it.
    expect(extent(sky.points, 'softness').low).toBeGreaterThan(0.3)
    // Nebulae dwarf the galaxies, which is the whole of what tells the two
    // populations apart at a glance.
    expect(extent(sky.points, 'size').high).toBeGreaterThan(
      extent(sky.points, 'size').low * 10
    )
    stars.geometry.dispose()
    ;(stars.material as ShaderMaterial).dispose()
    haze.dispose()
    sky.dispose()
  })

  it('sits behind the haze, which sits behind the stars', () => {
    const sky = createGalaxySky(THEME)
    const haze = createGalaxyHaze(layout(), THEME)
    expect(sky.points.renderOrder).toBeLessThan(haze.points.renderOrder)
    haze.dispose()
    sky.dispose()
  })

  it('derives every point from a hash, so two builds agree byte for byte', () => {
    const first = createGalaxySky(THEME)
    const second = createGalaxySky(THEME)
    for (const name of ['position', 'size', 'brightness', 'softness', 'color'])
      expect(floats(first.points, name)).toEqual(floats(second.points, name))
    first.dispose()
    second.dispose()
  })

  it('takes its colours from the theme rather than from the module', () => {
    const sky = createGalaxySky({ ...THEME, skyGalaxy: 0xff0000, skyNebula: 0x00ff00 })
    const colors = floats(sky.points, 'color')
    // Distant galaxies first, nebulae after: the two populations are separate
    // slices of one buffer, and each takes its own colour from the palette.
    expect([colors[0], colors[1], colors[2]]).toEqual([1, 0, 0])
    // A nebula is tinted per cloud, so it is no longer exactly `skyNebula`.
    // What still has to hold is that the palette is closed: with the two theme
    // colours pure red and pure green, every nebula is somewhere on the
    // segment between them, so it carries no blue and its red and green sum to
    // one. A hardcoded hue in the module could not satisfy that.
    for (let cloud = 0; cloud < SKY_NEBULAE; cloud++) {
      const index = (SKY_GALAXIES + cloud * SKY_NEBULA_PUFFS) * 3
      const [red, green, blue] = [colors[index], colors[index + 1], colors[index + 2]]
      expect(blue).toBe(0)
      expect((red ?? 0) + (green ?? 0)).toBeCloseTo(1, 6)
      expect(red).toBeLessThanOrEqual(NEBULA_TINT)
    }
    sky.dispose()
  })

  it('tints each nebula differently while keeping one cloud one colour', () => {
    const sky = createGalaxySky(THEME)
    const colors = floats(sky.points, 'color')
    const cloudColor = (cloud: number): string => {
      const index = (SKY_GALAXIES + cloud * SKY_NEBULA_PUFFS) * 3
      return `${colors[index]},${colors[index + 1]},${colors[index + 2]}`
    }
    // A cloud is one nebula. Tinting its puffs separately would speckle it,
    // so the tint is keyed on the cloud and every puff of it agrees.
    for (let cloud = 0; cloud < SKY_NEBULAE; cloud++) {
      for (let puff = 1; puff < SKY_NEBULA_PUFFS; puff++) {
        const index = (SKY_GALAXIES + cloud * SKY_NEBULA_PUFFS + puff) * 3
        expect(`${colors[index]},${colors[index + 1]},${colors[index + 2]}`).toBe(
          cloudColor(cloud)
        )
      }
    }
    // A single hue across 32 nebulae reads as one wallpaper repeated. Most of
    // them should differ from each other.
    const distinct = new Set(
      Array.from({ length: SKY_NEBULAE }, (_, cloud) => cloudColor(cloud))
    )
    expect(distinct.size).toBeGreaterThan(SKY_NEBULAE / 2)
    sky.dispose()
  })

  it('releases its geometry and material on dispose', () => {
    const sky = createGalaxySky(THEME)
    const geometry = vi.spyOn(sky.points.geometry, 'dispose')
    const material = vi.spyOn(sky.points.material as ShaderMaterial, 'dispose')
    sky.dispose()
    expect(geometry).toHaveBeenCalledTimes(1)
    expect(material).toHaveBeenCalledTimes(1)
  })
})
