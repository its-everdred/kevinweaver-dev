import { act, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { publishGalaxyTimeline } from '@/components/viz/galaxyTimeline'
import { Header, type HeaderFreshness } from './Header'
import { NAV_SECTIONS } from './_contract'

/** `useActiveSection` observes the anchor targets; jsdom ships no observer. */
class StubObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return []
  }
}

beforeAll(() => {
  Reflect.set(globalThis, 'IntersectionObserver', StubObserver)
})

const FRESHNESS: HeaderFreshness = {
  label: 'partial',
  tone: 'static',
  description: 'data regenerated 2026-08-08 06:17:00 UTC; events reused',
}

function publish(step: number, date: string): void {
  act(() => {
    publishGalaxyTimeline({
      step,
      date,
      playing: true,
      total: 4000,
      direction: 'forward',
      windowStartISO: '2015-01-01',
    })
  })
}

beforeEach(() => {
  publish(0, '2015-01-01')
})

describe('Header playback date', () => {
  it('reads out the day the shared timeline is on and follows it', () => {
    render(<Header />)
    const banner = screen.getByRole('banner')

    publish(10, '2015-01-11')
    expect(banner).toHaveTextContent('2015-01-11')

    publish(11, '2015-01-12')
    expect(banner).toHaveTextContent('2015-01-12')
    expect(banner).not.toHaveTextContent('2015-01-11')
  })

  it('never announces the day, which advances once a second', () => {
    render(<Header />)
    expect(
      screen
        .getByRole('banner')
        .querySelectorAll(
          '[aria-live],[role="status"],[role="alert"],[role="log"],[role="timer"]'
        )
    ).toHaveLength(0)
  })

  it('names the day for a screen reader without a live region', () => {
    publish(20, '2015-01-21')
    render(<Header />)
    expect(screen.getByText('playback date')).toHaveClass('sr-only')
  })

  it('holds a fixed tabular slot so a new day cannot shift the header', () => {
    publish(30, '2015-01-31')
    render(<Header />)
    const style = screen.getByText('2015-01-31').getAttribute('style') ?? ''
    expect(style).toContain('tabular-nums')
    expect(style).toContain('min-width: 10ch')
  })
})

describe('Header freshness', () => {
  it('keeps the tone dot and the degraded-source description', () => {
    render(<Header freshness={FRESHNESS} />)
    const description = screen.getByText(FRESHNESS.description)
    expect(description).toHaveClass('sr-only')
    expect(
      description.parentElement?.querySelector('[aria-hidden="true"]')
    ).not.toBeNull()
  })
})

describe('Header navigation', () => {
  it('links contributions, log, and contact', () => {
    render(<Header />)
    const nav = screen.getByRole('navigation', { name: 'sections' })
    expect(
      [...nav.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    ).toEqual(['#contributions', '#log', '#contact'])
    expect(NAV_SECTIONS.map((section) => section.label)).toEqual([
      'contributions',
      'log',
      'contact',
    ])
  })
})
