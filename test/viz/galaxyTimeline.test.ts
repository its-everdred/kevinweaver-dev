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

function publish(step: number, date: string, total: number, playing = true): void {
  publishGalaxyTimeline({
    step,
    date,
    playing,
    total,
    direction: 'forward',
    windowStartISO: '2020-01-01',
  })
}

describe('galaxyTimeline', () => {
  it('publishes a new step and notifies subscribers', () => {
    const start = baselineStep()
    publish(start, 'baseline', 10)
    const listener = vi.fn()
    const unsubscribe = subscribeGalaxyTimeline(listener)
    publish(start + 1, '2020-01-02', 10)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getGalaxyTimeline()).toMatchObject({
      step: start + 1,
      date: '2020-01-02',
      playing: true,
      total: 10,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    unsubscribe()
  })

  it('does not re-notify when the step and playing state are unchanged', () => {
    const start = baselineStep()
    publish(start, 'a', 5)
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    publish(start, 'a', 5)
    publish(start, 'a', 5)
    expect(listener).toHaveBeenCalledTimes(0)
  })

  it('notifies when the total changes even if the step is identical', () => {
    const start = baselineStep()
    publish(start, 'a', 5)
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    publishGalaxyTimeline({
      step: start,
      date: 'a',
      playing: true,
      total: 100,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getGalaxyTimeline().total).toBe(100)
  })

  it('notifies when only the playing state changes', () => {
    const start = baselineStep()
    publish(start, 'a', 5)
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    publish(start, 'a', 5, false)
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('seeks to a clamped day and derives the date from the window start', () => {
    const start = baselineStep()
    publish(start, 'a', start + 10)
    const listener = vi.fn()
    subscribeGalaxyTimeline(listener)
    seekGalaxyTimeline(7, start + 10)
    expect(getGalaxyTimeline().step).toBe(7)
    expect(getGalaxyTimeline().date).toMatch(/^2020-01-0/)
    expect(getGalaxyTimeline().playing).toBe(true)
    seekGalaxyTimeline(start + 99, start + 10)
    expect(getGalaxyTimeline().step).toBe(start + 9)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('sets playback direction', () => {
    const start = baselineStep()
    publish(start, 'x', 4)
    setGalaxyDirection('backward')
    expect(getGalaxyTimeline().direction).toBe('backward')
    setGalaxyDirection('backward')
    expect(getGalaxyTimeline().direction).toBe('backward')
    setGalaxyDirection('forward')
    expect(getGalaxyTimeline().direction).toBe('forward')
  })

  it('toggles playing state via setGalaxyPlaying', () => {
    const start = baselineStep()
    publish(start, 'x', 4)
    setGalaxyPlaying(false)
    expect(getGalaxyTimeline().playing).toBe(false)
    setGalaxyPlaying(false)
    expect(getGalaxyTimeline().playing).toBe(false)
    setGalaxyPlaying(true)
    expect(getGalaxyTimeline().playing).toBe(true)
  })
})
