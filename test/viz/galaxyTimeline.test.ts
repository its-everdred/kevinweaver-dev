import { describe, expect, it, vi } from 'vitest'

import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
  setGalaxyDirection,
  setGalaxyPlaying,
  subscribeGalaxyTimeline,
} from '../../components/viz/galaxyTimeline'

/** The store is a module singleton; each test starts from a distinct baseline. */
let testCounter = 0
function baselineStep(): number {
  testCounter += 1
  return 100 + testCounter
}

describe('galaxyTimeline', () => {
  it('publishes a new step and notifies subscribers', () => {
    const start = baselineStep()
    publishGalaxyTimeline({ step: start, date: 'baseline', playing: true, total: 10, direction: 'forward' })
    const listener = vi.fn()
    const unsubscribe = subscribeGalaxyTimeline(listener)
    publishGalaxyTimeline({ step: start + 1, date: '2021-01-06', playing: true, total: 10, direction: 'forward' })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getGalaxyTimeline()).toEqual({
      step: start + 1,
      date: '2021-01-06',
      playing: true,
      total: 10,
      direction: 'forward',
    })
    unsubscribe()
  })

  it('does not re-notify when the step and playing state are unchanged', () => {
    const start = baselineStep()
    publishGalaxyTimeline({ step: start, date: 'a', playing: true, total: 5, direction: 'forward' })
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    publishGalaxyTimeline({ step: start, date: 'a', playing: true, total: 5, direction: 'forward' })
    publishGalaxyTimeline({ step: start, date: 'a', playing: true, total: 5, direction: 'forward' })
    expect(listener).toHaveBeenCalledTimes(0)
  })

  it('notifies when only the playing state changes', () => {
    const start = baselineStep()
    publishGalaxyTimeline({ step: start, date: 'a', playing: true, total: 5, direction: 'forward' })
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    publishGalaxyTimeline({ step: start, date: 'a', playing: false, total: 5, direction: 'forward' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('seeks to a clamped day and notifies', () => {
    const start = baselineStep()
    publishGalaxyTimeline({ step: start, date: 'a', playing: true, total: start + 10, direction: 'forward' })
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    seekGalaxyTimeline(start + 7, '2021-01-08', start + 10)
    expect(getGalaxyTimeline().step).toBe(start + 7)
    expect(getGalaxyTimeline().playing).toBe(true)
    seekGalaxyTimeline(start + 99, 'z', start + 10)
    expect(getGalaxyTimeline().step).toBe(start + 9)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('sets playback direction', () => {
    const start = baselineStep()
    publishGalaxyTimeline({ step: start, date: 'x', playing: true, total: 4, direction: 'forward' })
    setGalaxyDirection('backward')
    expect(getGalaxyTimeline().direction).toBe('backward')
    setGalaxyDirection('backward')
    expect(getGalaxyTimeline().direction).toBe('backward')
    setGalaxyDirection('forward')
    expect(getGalaxyTimeline().direction).toBe('forward')
  })

  it('toggles playing state via setGalaxyPlaying', () => {
    const start = baselineStep()
    publishGalaxyTimeline({ step: start, date: 'x', playing: true, total: 4, direction: 'forward' })
    setGalaxyPlaying(false)
    expect(getGalaxyTimeline().playing).toBe(false)
    setGalaxyPlaying(false)
    expect(getGalaxyTimeline().playing).toBe(false)
    setGalaxyPlaying(true)
    expect(getGalaxyTimeline().playing).toBe(true)
  })
})
