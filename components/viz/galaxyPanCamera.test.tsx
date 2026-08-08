import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeAll, describe, expect, it } from 'vitest'
import { ZOOM_STEP } from '@/lib/viz/orbit'
import { MAX_PAN_DISTANCE } from '@/lib/viz/pan'
import { useGalaxyCamera } from './useGalaxyCamera'

/** jsdom runs no layout, so every canvas under test reports this box. */
const CANVAS_W = 600
const CANVAS_H = 400

/**
 * The camera as the canvas surfaces it. `data-orbit` already carries the three
 * orbit terms for the e2e suite; the pivot is surfaced the same way, because a
 * WebGL camera is otherwise invisible to anything outside the GL context.
 */
interface Camera {
  readonly azimuth: number
  readonly polar: number
  readonly distance: number
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * Stands in for the galaxy canvas: the same hook, the same handlers, and a box
 * to measure drags against. `GalaxyUniverse` needs a WebGL context and a decoded
 * bundle, neither of which the camera depends on.
 */
function Harness(): ReactNode {
  const camera = useGalaxyCamera()
  const { azimuth, polar, distance, target } = camera.orbit
  return (
    <canvas
      aria-label="Repository map"
      data-camera={[azimuth, polar, distance, target.x, target.y, target.z]
        .map((term) => term.toFixed(6))
        .join(' ')}
      onKeyDown={camera.onKeyDown}
      onPointerCancel={camera.onPointerCancel}
      onPointerDown={camera.onPointerDown}
      onPointerLeave={camera.onPointerLeave}
      onPointerMove={camera.onPointerMove}
      onPointerUp={camera.onPointerUp}
      role="img"
      tabIndex={0}
    />
  )
}

function galaxyCanvas(): HTMLCanvasElement {
  const canvas = screen.getByRole('img', { name: /repository map/i })
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('not a canvas')
  return canvas
}

function cameraOf(canvas: HTMLCanvasElement): Camera {
  const raw = canvas.dataset.camera
  if (!raw) throw new Error('the canvas surfaces no camera')
  const [azimuth, polar, distance, x, y, z] = raw.split(' ').map(Number)
  if (
    azimuth === undefined ||
    polar === undefined ||
    distance === undefined ||
    x === undefined ||
    y === undefined ||
    z === undefined
  )
    throw new Error(`unreadable camera: ${raw}`)
  return { azimuth, polar, distance, x, y, z }
}

/** How far the pivot has travelled from the disc center, in world units. */
function pan(camera: Camera): number {
  return Math.hypot(camera.x, camera.y, camera.z)
}

function down(
  canvas: HTMLCanvasElement,
  id: number,
  x: number,
  y: number
): void {
  fireEvent.pointerDown(canvas, { pointerId: id, clientX: x, clientY: y })
}

function move(
  canvas: HTMLCanvasElement,
  id: number,
  x: number,
  y: number
): void {
  fireEvent.pointerMove(canvas, { pointerId: id, clientX: x, clientY: y })
}

function up(canvas: HTMLCanvasElement, id: number, x: number, y: number): void {
  fireEvent.pointerUp(canvas, { pointerId: id, clientX: x, clientY: y })
}

/**
 * Two fingers travelling together: both move by the same offset, so the span
 * they started with is the span they end with and the gesture is pure pan. The
 * two moves arrive as separate events, because that is how a browser reports
 * them — one `pointermove` per contact.
 */
function twoFingerDrag(
  canvas: HTMLCanvasElement,
  dx: number,
  dy: number
): void {
  down(canvas, 1, 200, 200)
  down(canvas, 2, 300, 200)
  move(canvas, 1, 200 + dx, 200 + dy)
  move(canvas, 2, 300 + dx, 200 + dy)
  up(canvas, 1, 200 + dx, 200 + dy)
  up(canvas, 2, 300 + dx, 200 + dy)
}

function press(canvas: HTMLCanvasElement, key: string, shiftKey = false): void {
  act(() => {
    fireEvent.keyDown(canvas, { key, shiftKey })
  })
}

beforeAll(() => {
  // jsdom ships no pointer capture and runs no layout; both gaps are the
  // browser's, not this hook's.
  Element.prototype.setPointerCapture = (): undefined => undefined
  Element.prototype.releasePointerCapture = (): undefined => undefined
  Element.prototype.hasPointerCapture = (): boolean => false
  HTMLCanvasElement.prototype.getBoundingClientRect = (): DOMRect =>
    new DOMRect(0, 0, CANVAS_W, CANVAS_H)
})

describe('two-finger pan', () => {
  it('translates the view so an off-centre repo can be brought to the middle', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    expect(pan(before)).toBe(0)
    twoFingerDrag(canvas, 60, 0)
    const after = cameraOf(canvas)
    expect(pan(after)).toBeGreaterThan(0)
    // Drag right and the disc travels right, which means the pivot goes left.
    expect(after.x).toBeLessThan(0)
  })

  it('leaves the rotation alone, so a drifting hand never spins the disc', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    twoFingerDrag(canvas, 40, -30)
    const after = cameraOf(canvas)
    expect(after.azimuth).toBe(before.azimuth)
    expect(after.polar).toBe(before.polar)
  })

  it('leaves the distance where it found it when the span never changed', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    twoFingerDrag(canvas, 50, 40)
    expect(cameraOf(canvas).distance).toBeCloseTo(before.distance, 9)
  })

  it('zooms and pans from one gesture, without choosing between them', () => {
    // A single finger sliding outward spreads the span *and* shifts the
    // midpoint. Both are spent: the camera pulls in and the view translates at
    // the same time, which is what the hand is actually doing.
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    down(canvas, 1, 200, 200)
    down(canvas, 2, 300, 200)
    move(canvas, 2, 400, 200)
    const after = cameraOf(canvas)
    expect(after.distance).toBeLessThan(before.distance)
    expect(pan(after)).toBeGreaterThan(0)
  })

  it('covers more world per finger-width the further out the camera is', () => {
    // Zoomed out, one finger-width has to cover more of the galaxy than it does
    // zoomed in, or the point under the finger slides out from under it.
    render(<Harness />)
    const canvas = galaxyCanvas()
    twoFingerDrag(canvas, 30, 0)
    const near = pan(cameraOf(canvas))
    press(canvas, 'Home')
    press(canvas, '-')
    press(canvas, '-')
    press(canvas, '-')
    twoFingerDrag(canvas, 30, 0)
    const far = pan(cameraOf(canvas))
    expect(far).toBeGreaterThan(near * 1.5)
  })

  it('does not leap when the second finger lands far from the first', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    down(canvas, 1, 100, 100)
    move(canvas, 1, 120, 110)
    const before = cameraOf(canvas)
    // The midpoint jumps from one finger to halfway between two the instant the
    // second lands. Read as pan, that jump would fling the galaxy off screen.
    down(canvas, 2, 560, 380)
    expect(pan(cameraOf(canvas))).toBe(pan(before))
    move(canvas, 2, 570, 380)
    expect(pan(cameraOf(canvas))).toBeLessThan(0.2)
  })

  it('stops the pivot at the clamp however hard the viewer pushes', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    for (let shove = 0; shove < 30; shove++) twoFingerDrag(canvas, 200, 150)
    expect(pan(cameraOf(canvas))).toBeLessThanOrEqual(MAX_PAN_DISTANCE + 1e-9)
    // And it really did reach the clamp, rather than stalling somewhere short.
    expect(pan(cameraOf(canvas))).toBeCloseTo(MAX_PAN_DISTANCE, 6)
  })

  it('does not strand the pivot when a finger leaves the canvas mid-pan', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    down(canvas, 1, 200, 200)
    down(canvas, 2, 300, 200)
    move(canvas, 1, 240, 200)
    const stopped = cameraOf(canvas)
    fireEvent.pointerLeave(canvas, { pointerId: 1, clientX: 240, clientY: 200 })
    move(canvas, 1, 900, 700)
    move(canvas, 2, 900, 700)
    expect(cameraOf(canvas)).toEqual(stopped)
  })
})

describe('what pan must not take away', () => {
  it('still rotates on a one-finger drag, and never pans on one', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    down(canvas, 1, 100, 100)
    move(canvas, 1, 180, 140)
    const after = cameraOf(canvas)
    expect(after.azimuth).not.toBe(before.azimuth)
    expect(after.polar).not.toBe(before.polar)
    expect(after.distance).toBe(before.distance)
    expect(pan(after)).toBe(0)
  })

  it('still dollies on a two-finger pinch', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    down(canvas, 1, 200, 200)
    down(canvas, 2, 240, 200)
    move(canvas, 2, 320, 200)
    expect(cameraOf(canvas).distance).toBeLessThan(before.distance)
  })

  it('still rotates and zooms from the keyboard, which is the accessible path', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    press(canvas, 'ArrowLeft')
    expect(cameraOf(canvas).azimuth).toBeLessThan(before.azimuth)
    press(canvas, 'ArrowUp')
    expect(cameraOf(canvas).polar).toBeLessThan(before.polar)
    press(canvas, '+')
    expect(cameraOf(canvas).distance).toBeCloseTo(
      before.distance / ZOOM_STEP,
      6
    )
    press(canvas, '-')
    expect(cameraOf(canvas).distance).toBeCloseTo(before.distance, 6)
    // None of it moved the pivot: the arrows are still rotation, unshifted.
    expect(pan(cameraOf(canvas))).toBe(0)
  })
})

describe('the keyboard path to pan', () => {
  it('pans on a shifted arrow, which is what makes the gesture operable at all', () => {
    // WCAG 2.1.1: a function reachable by pointer has to be reachable by
    // keyboard. Two-finger pan with no key behind it would be a new control that
    // only exists for people who can use two fingers on a touchscreen.
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = cameraOf(canvas)
    press(canvas, 'ArrowRight', true)
    const east = cameraOf(canvas)
    expect(pan(east)).toBeGreaterThan(0)
    // Rotation and distance are untouched: shifted arrows are a different verb.
    expect(east.azimuth).toBe(before.azimuth)
    expect(east.polar).toBe(before.polar)
    expect(east.distance).toBe(before.distance)

    press(canvas, 'ArrowLeft', true)
    expect(pan(cameraOf(canvas))).toBeCloseTo(0, 9)
  })

  it('pans up and down the screen on the vertical arrows', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    press(canvas, 'ArrowUp', true)
    const up = cameraOf(canvas)
    expect(pan(up)).toBeGreaterThan(0)
    press(canvas, 'ArrowDown', true)
    expect(pan(cameraOf(canvas))).toBeCloseTo(0, 9)
  })

  it('re-centres on Home, so a viewer who panned away has one key back', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    press(canvas, 'ArrowRight', true)
    press(canvas, 'ArrowUp', true)
    press(canvas, 'ArrowLeft')
    const wandered = cameraOf(canvas)
    expect(pan(wandered)).toBeGreaterThan(0)
    press(canvas, 'Home')
    const home = cameraOf(canvas)
    expect(pan(home)).toBe(0)
    // Only the pivot: the rotation and zoom the viewer chose are still theirs.
    expect(home.azimuth).toBe(wandered.azimuth)
    expect(home.distance).toBe(wandered.distance)
  })

  it('claims only the keys it uses, leaving the rest to the page', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    const claimed = fireEvent.keyDown(canvas, {
      key: 'ArrowRight',
      shiftKey: true,
    })
    // fireEvent returns false when a handler called preventDefault.
    expect(claimed).toBe(false)
    expect(fireEvent.keyDown(canvas, { key: 'Home' })).toBe(false)
    expect(fireEvent.keyDown(canvas, { key: 'Tab' })).toBe(true)
    expect(fireEvent.keyDown(canvas, { key: 'a' })).toBe(true)
  })
})
