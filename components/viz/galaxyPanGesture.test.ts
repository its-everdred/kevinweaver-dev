import { describe, expect, it, vi } from 'vitest'
import { capture, release } from './galaxyPanCapture'
import {
  CLICK_SLOP,
  clearGesture,
  createGesture,
  isClickGesture,
  liftGesture,
  moveGesture,
  pressGesture,
  type Gesture,
} from './galaxyPanGesture'

/**
 * Two fingers a hundred pixels apart on a horizontal line, which is where every
 * two-finger case below starts so the span and the midpoint are both obvious.
 */
function twoDown(): Gesture {
  const gesture = createGesture()
  pressGesture(gesture, 1, 100, 200)
  pressGesture(gesture, 2, 200, 200)
  return gesture
}

/** Stands in for the canvas: only the three pointer-capture methods are used. */
function stubTarget(
  overrides: Partial<Record<'set' | 'has' | 'release', () => unknown>> = {}
): {
  element: HTMLCanvasElement
  setPointerCapture: ReturnType<typeof vi.fn>
  releasePointerCapture: ReturnType<typeof vi.fn>
} {
  const setPointerCapture = vi.fn(overrides.set ?? (() => undefined))
  const releasePointerCapture = vi.fn(overrides.release ?? (() => undefined))
  const element = {
    setPointerCapture,
    releasePointerCapture,
    hasPointerCapture: overrides.has ?? ((): boolean => true),
  } as unknown as HTMLCanvasElement
  return { element, setPointerCapture, releasePointerCapture }
}

describe('one pointer', () => {
  it('reports the travel a rotation is made of', () => {
    const gesture = createGesture()
    pressGesture(gesture, 1, 100, 200)
    expect(moveGesture(gesture, 1, 140, 230)).toEqual({
      kind: 'rotate',
      dx: 40,
      dy: 30,
    })
  })

  it('reports nothing for a pointer it never saw go down', () => {
    // A move for an unknown pointer used to be read against a missing anchor.
    const gesture = createGesture()
    expect(moveGesture(gesture, 9, 10, 10)).toBeNull()
  })

  it('is a click until it travels past the slop, and never again after', () => {
    const gesture = createGesture()
    pressGesture(gesture, 1, 100, 200)
    expect(isClickGesture(gesture, 100 + CLICK_SLOP, 200)).toBe(true)
    moveGesture(gesture, 1, 100 + CLICK_SLOP * 4, 200)
    // Back where it started, but the camera has already moved: this is the end
    // of a rotation, not a pick.
    moveGesture(gesture, 1, 100, 200)
    expect(isClickGesture(gesture, 100, 200)).toBe(false)
  })
})

describe('two pointers', () => {
  it('reports the pinch and the pan from the same move, never one or the other', () => {
    // The whole design decision, in one assertion. A real two-finger gesture
    // spreads a little while the hand drifts, so the span and the midpoint are
    // read as independent components of one gesture and both are spent every
    // sample. Choosing between them on a threshold makes the camera stop doing
    // the thing the hand is currently doing, which reads as broken.
    const gesture = twoDown()
    const move = moveGesture(gesture, 2, 220, 200)
    expect(move?.kind).toBe('pinch')
    // The span went 100 -> 120, so the camera pulls in by 100/120.
    expect(move).toMatchObject({ factor: 100 / 120 })
    // And the midpoint went 150 -> 160, which is 10 pixels of pan.
    expect(move).toMatchObject({ dx: 10, dy: 0 })
  })

  it('pans with no zoom at all when the span survives the move', () => {
    // One finger swung a quarter turn about the other keeps them exactly as far
    // apart as they were, so this gesture is pure translation. A mode lock would
    // have to guess; reading the two components separately does not have to.
    const gesture = twoDown()
    const move = moveGesture(gesture, 2, 100, 300)
    expect(move).toEqual({ kind: 'pinch', factor: 1, dx: -50, dy: 50 })
  })

  it('tracks the midpoint, so two fingers moving together pan by their travel', () => {
    const gesture = twoDown()
    const first = moveGesture(gesture, 1, 130, 200)
    const second = moveGesture(gesture, 2, 230, 200)
    // Each finger moved 30; the midpoint moved 15 twice, which is 30 in all.
    expect((first?.dx ?? 0) + (second?.dx ?? 0)).toBeCloseTo(30, 12)
    // And the span ended where it began, so the two factors undo each other.
    expect(
      (first?.kind === 'pinch' ? first.factor : 0) *
        (second?.kind === 'pinch' ? second.factor : 0)
    ).toBeCloseTo(1, 12)
  })

  it('seeds the span and the midpoint when the second finger lands', () => {
    // Without this the first two-finger sample reads the midpoint against
    // wherever the last gesture left it and the galaxy leaps across the screen.
    const gesture = createGesture()
    pressGesture(gesture, 1, 100, 200)
    moveGesture(gesture, 1, 400, 500)
    pressGesture(gesture, 2, 500, 500)
    const move = moveGesture(gesture, 2, 510, 500)
    expect(move).toEqual({ kind: 'pinch', factor: 100 / 110, dx: 5, dy: 0 })
  })

  it('is never a click, because a second finger is not a pick', () => {
    const gesture = twoDown()
    expect(isClickGesture(gesture, 100, 200)).toBe(false)
  })

  it('reports no zoom for a degenerate span rather than collapsing the camera', () => {
    const gesture = twoDown()
    const move = moveGesture(gesture, 2, 100, 200)
    expect(move).toMatchObject({ kind: 'pinch', factor: 0 })
  })

  it('goes back to rotating when one finger lifts', () => {
    const gesture = twoDown()
    moveGesture(gesture, 2, 220, 200)
    liftGesture(gesture, 2)
    expect(moveGesture(gesture, 1, 120, 200)).toEqual({
      kind: 'rotate',
      dx: 20,
      dy: 0,
    })
  })

  it('forgets every contact when the gesture is cleared', () => {
    const gesture = twoDown()
    clearGesture(gesture)
    expect(moveGesture(gesture, 1, 900, 900)).toBeNull()
    expect(isClickGesture(gesture, 100, 200)).toBe(false)
  })
})

describe('pointer capture', () => {
  it('survives a browser that refuses the capture', () => {
    // Verbatim from a CI run that 522 green unit tests did not catch: a
    // `setPointerCapture` for a pointer the browser had already retired throws
    // NotFoundError, and an unhandled rejection out of an event handler is an
    // exit 1. Capture is an optimisation, so losing it must cost nothing.
    const { element } = stubTarget({
      set: () => {
        throw new DOMException('NotFoundError', 'NotFoundError')
      },
    })
    expect(() => capture(element, 1)).not.toThrow()
  })

  it('survives a browser that refuses the release', () => {
    const { element } = stubTarget({
      release: () => {
        throw new DOMException('NotFoundError', 'NotFoundError')
      },
    })
    expect(() => release(element, 1)).not.toThrow()
  })

  it('releases only a capture this element actually holds', () => {
    const held = stubTarget()
    release(held.element, 1)
    expect(held.releasePointerCapture).toHaveBeenCalledWith(1)

    const free = stubTarget({ has: () => false })
    release(free.element, 1)
    expect(free.releasePointerCapture).not.toHaveBeenCalled()
  })

  it('takes the capture when the browser allows it', () => {
    const { element, setPointerCapture } = stubTarget()
    capture(element, 7)
    expect(setPointerCapture).toHaveBeenCalledWith(7)
  })
})
