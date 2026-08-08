import { act, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  ZOOM_STEP,
} from '@/lib/viz/orbit'
import { MAX_WHEEL_NOTCHES, WHEEL_NOTCH_PIXELS } from './galaxyWheel'
import { useGalaxyWheelZoom } from './galaxyWheelZoom'
import { useGalaxyCamera } from './useGalaxyCamera'

/** One mouse detent, in the pixels the browser reports for it. */
const NOTCH = WHEEL_NOTCH_PIXELS
/** The most one event can spend, so a loop knows how many it needs. */
const CAP = MAX_WHEEL_NOTCHES * WHEEL_NOTCH_PIXELS

/**
 * Stands in for the galaxy canvas: the same ref, the same camera, the same
 * focusable canvas, and nothing else. `GalaxyUniverse` needs a WebGL context
 * and a decoded bundle to render, neither of which this behaviour depends on.
 */
function Harness(): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const camera = useGalaxyCamera()
  useGalaxyWheelZoom(canvasRef, camera)
  return (
    <canvas
      aria-label="Repository map"
      data-distance={camera.orbit.distance.toFixed(6)}
      onKeyDown={camera.onKeyDown}
      onPointerDown={camera.onPointerDown}
      ref={canvasRef}
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

function distanceOf(canvas: HTMLCanvasElement): number {
  const raw = canvas.dataset.distance
  if (!raw) throw new Error('the canvas surfaces no camera distance')
  return Number(raw)
}

/**
 * Dispatches a real, cancelable `WheelEvent`, the way a browser does. React's
 * `onWheel` cannot be used here: React registers `wheel` passively at the root,
 * so a synthetic handler could never preventDefault even if it wanted to.
 * @returns The dispatched event, so a test can read `defaultPrevented`.
 */
function wheel(
  canvas: HTMLCanvasElement,
  init: WheelEventInit = { deltaY: NOTCH }
): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaMode: 0,
    ...init,
  })
  act(() => {
    canvas.dispatchEvent(event)
  })
  return event
}

beforeAll(() => {
  // jsdom ships no pointer capture; the gap is the browser's, not this hook's.
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
  Element.prototype.hasPointerCapture = () => false
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the wheel and the page scroll', () => {
  it('leaves the wheel to the page while the galaxy is not being driven', () => {
    // The failure this exists to prevent: a reader scrolling down a long page
    // gets stuck the moment the cursor crosses a full-width canvas. Until the
    // canvas has been focused — by a click, a drag, or a Tab — every wheel over
    // it is the page's, uncancelled and unread.
    render(<Harness />)
    const canvas = galaxyCanvas()
    const before = distanceOf(canvas)
    const event = wheel(canvas, { deltaY: NOTCH })
    expect(event.defaultPrevented).toBe(false)
    expect(distanceOf(canvas)).toBe(before)
  })

  it('zooms once the canvas holds focus, which is the same gate the keys use', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    const before = distanceOf(canvas)

    const closer = wheel(canvas, { deltaY: -NOTCH })
    expect(closer.defaultPrevented).toBe(true)
    expect(distanceOf(canvas)).toBeCloseTo(before / ZOOM_STEP, 5)

    const further = wheel(canvas, { deltaY: NOTCH })
    expect(further.defaultPrevented).toBe(true)
    expect(distanceOf(canvas)).toBeCloseTo(before, 5)
  })

  it('gives the wheel back to the page the moment focus leaves', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    wheel(canvas, { deltaY: -NOTCH })
    const zoomed = distanceOf(canvas)
    canvas.blur()
    const event = wheel(canvas, { deltaY: NOTCH })
    expect(event.defaultPrevented).toBe(false)
    expect(distanceOf(canvas)).toBe(zoomed)
  })

  it('hands the wheel back at the far clamp, so a reader scrolls on past', () => {
    // Scrolling down pushes the camera out. Once it is as far out as the
    // reducer allows, there is nothing left to spend, so the event is not
    // cancelled and the page carries on down.
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    for (let spin = 0; spin < 8; spin++) wheel(canvas, { deltaY: CAP })
    expect(distanceOf(canvas)).toBeCloseTo(MAX_ORBIT_DISTANCE, 5)
    const event = wheel(canvas, { deltaY: NOTCH })
    expect(event.defaultPrevented).toBe(false)
    expect(distanceOf(canvas)).toBeCloseTo(MAX_ORBIT_DISTANCE, 5)
  })

  it('hands the wheel back at the near clamp too, so a reader scrolls back up', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    for (let spin = 0; spin < 8; spin++) wheel(canvas, { deltaY: -CAP })
    expect(distanceOf(canvas)).toBeCloseTo(MIN_ORBIT_DISTANCE, 5)
    const event = wheel(canvas, { deltaY: -NOTCH })
    expect(event.defaultPrevented).toBe(false)
    expect(distanceOf(canvas)).toBeCloseTo(MIN_ORBIT_DISTANCE, 5)
  })

  it('never claims ctrl or meta wheel, which is the browser page zoom', () => {
    // Ctrl+wheel is how a low-vision reader enlarges the page, and it is what a
    // trackpad pinch reports. Taking it here would remove a WCAG 1.4.4
    // affordance at exactly the spot someone might reach for it.
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    const before = distanceOf(canvas)
    for (const modifier of [{ ctrlKey: true }, { metaKey: true }]) {
      const event = wheel(canvas, { deltaY: -NOTCH, ...modifier })
      expect(event.defaultPrevented).toBe(false)
      expect(distanceOf(canvas)).toBe(before)
    }
  })

  it('leaves a sideways trackpad swipe entirely alone', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    const before = distanceOf(canvas)
    const event = wheel(canvas, { deltaX: -120, deltaY: 0 })
    expect(event.defaultPrevented).toBe(false)
    expect(distanceOf(canvas)).toBe(before)
  })

  it('spends a trackpad flick as one step, not one step per event', () => {
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    const before = distanceOf(canvas)
    for (let event = 0; event < 25; event++) wheel(canvas, { deltaY: -4 })
    expect(distanceOf(canvas)).toBeCloseTo(before / ZOOM_STEP, 4)
  })
})

describe('the wheel listener itself', () => {
  it('registers non-passively, which is the only way preventDefault lands', () => {
    const listen = vi.spyOn(HTMLCanvasElement.prototype, 'addEventListener')
    render(<Harness />)
    const registered = listen.mock.calls.find(([type]) => type === 'wheel')
    expect(registered, 'no native wheel listener on the canvas').toBeTruthy()
    expect(registered?.[2]).toEqual({ passive: false })
  })

  it('removes itself on unmount and cannot move a camera that is gone', () => {
    const forget = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener')
    const view = render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    const distance = distanceOf(canvas)
    view.unmount()
    expect(forget.mock.calls.some(([type]) => type === 'wheel')).toBe(true)
    const event = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: -NOTCH,
    })
    expect(() => canvas.dispatchEvent(event)).not.toThrow()
    expect(event.defaultPrevented).toBe(false)
    expect(distanceOf(canvas)).toBe(distance)
  })
})

describe('reaching the wheel gate', () => {
  it('focuses the canvas on pointer-down, so a dragged galaxy answers both', () => {
    // Safari does not reliably focus a `tabindex` element on click, and the
    // wheel and the arrow keys both hang off focus. Asking for it explicitly
    // means one drag arms every non-pointer control the canvas has.
    render(<Harness />)
    const canvas = galaxyCanvas()
    expect(canvas).not.toHaveFocus()
    act(() => {
      canvas.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          pointerId: 1,
        })
      )
    })
    expect(canvas).toHaveFocus()
    const before = distanceOf(canvas)
    expect(wheel(canvas, { deltaY: -NOTCH }).defaultPrevented).toBe(true)
    expect(distanceOf(canvas)).toBeLessThan(before)
  })

  it('keeps the keyboard zoom it shares the gate with', () => {
    // The wheel is additive. Removing or regressing the keys would be a merge
    // gate failure, not a trade.
    render(<Harness />)
    const canvas = galaxyCanvas()
    canvas.focus()
    const before = distanceOf(canvas)
    act(() => {
      canvas.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: '+' })
      )
    })
    expect(distanceOf(canvas)).toBeCloseTo(before / ZOOM_STEP, 5)
  })
})
