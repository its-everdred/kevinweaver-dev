import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  getGalaxyTimeline,
  publishGalaxyTimeline,
  seekGalaxyTimeline,
  setGalaxyPlaying,
} from '@/components/viz/galaxyTimeline'
import TransportBar from './TransportBar'

describe('TransportBar markup', () => {
  const html = renderToStaticMarkup(<TransportBar />)

  it('keeps the exact inert control inventory named and tabbable', () => {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const buttons = [...document.querySelectorAll('button')]
    const range = document.querySelector<HTMLInputElement>(
      'input[type="range"]'
    )

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pause playback',
      'Jump to the start of the contribution history',
      'Jump to the most recent day',
    ])
    expect(buttons).toHaveLength(3)
    expect(buttons.every((button) => button.ariaDisabled === 'true')).toBe(true)
    expect(buttons.every((button) => !button.disabled)).toBe(true)
    expect(buttons.every((button) => button.tabIndex === 0)).toBe(true)
    expect(range?.getAttribute('aria-disabled')).toBe('true')
    expect(range?.getAttribute('aria-label')).toBe(
      'Seek through the contribution history'
    )
    expect(range?.getAttribute('aria-valuetext')).toBe('no data loaded')
    expect(range?.hasAttribute('disabled')).toBe(false)
    expect(range?.tabIndex).toBe(0)
  })

  it('emits no span or div click target', () => {
    expect(html).not.toMatch(/<span[^>]*onclick/i)
    expect(html).not.toMatch(/role="button"/i)
  })

  it('emits a real button for play/pause and a range input for seek', () => {
    expect(html).toMatch(
      /<button type="button"[^>]*aria-label="(Pause|Resume) playback"/
    )
    expect(html).toMatch(/<input type="range"[^>]*aria-valuetext="/)
  })

  it('never emits a bare control glyph', () => {
    for (const glyph of ['⏸', '▶', '⏮', '⏭', '❚❚']) {
      expect(html).not.toContain(glyph)
    }
  })

  it('does not display a stale playback speed', () => {
    expect(html).not.toMatch(/days.?\/?sec/)
  })
})

describe('TransportBar behavior', () => {
  it('toggles the shared galaxy timeline playing state', () => {
    publishGalaxyTimeline({
      step: 0,
      date: 'x',
      playing: true,
      total: 10,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    render(<TransportBar />)
    const play = screen.getByRole('button', { name: 'Pause playback' })
    fireEvent.click(play)
    expect(getGalaxyTimeline().playing).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Resume playback' }))
    expect(getGalaxyTimeline().playing).toBe(true)
  })

  it('seeks the store when the slider changes', () => {
    publishGalaxyTimeline({
      step: 0,
      date: 'x',
      playing: true,
      total: 100,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    render(<TransportBar />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '42' } })
    expect(getGalaxyTimeline().step).toBe(42)
  })

  it('jumps to the start and most recent day', () => {
    publishGalaxyTimeline({
      step: 50,
      date: 'x',
      playing: true,
      total: 100,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    render(<TransportBar />)
    fireEvent.click(
      screen.getByRole('button', { name: 'Jump to the start of the contribution history' })
    )
    expect(getGalaxyTimeline().step).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Jump to the most recent day' }))
    expect(getGalaxyTimeline().step).toBe(99)
  })

  it('ignores repeated Space presses and native button key handling', () => {
    publishGalaxyTimeline({
      step: 0,
      date: 'x',
      playing: true,
      total: 10,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    const { container } = render(<TransportBar />)
    const bar = container.firstElementChild
    expect(bar).not.toBeNull()
    if (!bar) return
    fireEvent.keyDown(bar, { key: ' ', repeat: true })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Pause playback' }), {
      key: ' ',
    })
    expect(getGalaxyTimeline().playing).toBe(true)

    fireEvent.keyDown(bar, { key: ' ' })
    expect(getGalaxyTimeline().playing).toBe(false)
  })

  it('shows the store date label when data is loaded', () => {
    publishGalaxyTimeline({
      step: 5,
      date: '2020-01-06',
      playing: true,
      total: 10,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    render(<TransportBar />)
    expect(screen.getByText('2020-01-06')).toBeTruthy()
  })

  it('exposes a working seekGalaxyTimeline import surface', () => {
    publishGalaxyTimeline({
      step: 0,
      date: 'x',
      playing: true,
      total: 10,
      direction: 'forward',
      windowStartISO: '2020-01-01',
    })
    seekGalaxyTimeline(3, 10)
    setGalaxyPlaying(false)
    expect(getGalaxyTimeline().step).toBe(3)
    expect(getGalaxyTimeline().playing).toBe(false)
  })
})
