import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getVizTransport } from '@/lib/viz/driver'
import type { VizTransportSnapshot } from '@/lib/viz/driver'
import TransportBar, { freshness } from './TransportBar'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('freshness', () => {
  const gen = '2026-07-31T06:17:00Z'
  const at = (iso: string) => Date.parse(iso)

  it('renders nothing when the payload carries no generatedAt', () => {
    expect(freshness(null, at('2026-07-31T12:00:00Z'))).toBeNull()
    expect(freshness('not-a-date', at('2026-07-31T12:00:00Z'))).toBeNull()
  })

  it('states an absolute date before the clock is available', () => {
    expect(freshness(gen, null)).toEqual({
      label: 'generated 2026-07-31',
      tone: 'ok',
      title: 'data generated 2026-07-31T06:17:00Z',
    })
  })

  it('never claims the future under clock skew', () => {
    expect(freshness(gen, at('2026-07-31T00:00:00Z'))?.label).toBe(
      'fresh · <1h ago'
    )
  })

  it('walks ok -> warn -> dim', () => {
    expect(freshness(gen, at('2026-07-31T09:17:00Z'))).toMatchObject({
      label: 'fresh · 3h ago',
      tone: 'ok',
    })
    expect(freshness(gen, at('2026-08-02T06:17:00Z'))).toMatchObject({
      label: '2d ago',
      tone: 'warn',
    })
    expect(freshness(gen, at('2026-08-20T06:17:00Z'))).toMatchObject({
      label: 'stale · 20d ago',
      tone: 'dim',
    })
  })
})

describe('TransportBar markup', () => {
  const html = renderToStaticMarkup(<TransportBar />)

  it('keeps the exact inert control inventory named and tabbable', () => {
    const document = new DOMParser().parseFromString(html, 'text/html')
    const buttons = [...document.querySelectorAll('button')]
    const range = document.querySelector<HTMLInputElement>(
      'input[type="range"]'
    )

    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Resume playback',
      'Jump to the start of the contribution history',
      'Jump to the most recent day',
      'Playback speed: 4 days per second. Activate to change.',
    ])
    expect(buttons).toHaveLength(4)
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
    for (const glyph of ['⏸', '▶', '⏮', '⏭']) {
      expect(html).not.toContain(glyph)
    }
  })

  it('carries no fabricated live claim', () => {
    expect(html).not.toMatch(/>live<\/em>/)
  })
})

describe('TransportBar behavior', () => {
  it('ignores repeated Space presses and native button key handling', () => {
    const transport = getVizTransport()
    const toggle = vi.spyOn(transport, 'toggle')
    const { container } = render(<TransportBar />)
    const bar = container.firstElementChild

    expect(bar).not.toBeNull()
    if (!bar) return
    fireEvent.keyDown(bar, { key: ' ', repeat: true })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resume playback' }), {
      key: ' ',
    })
    expect(toggle).not.toHaveBeenCalled()

    fireEvent.keyDown(bar, { key: ' ' })
    expect(toggle).toHaveBeenCalledOnce()
  })

  it('reads the freshness clock as soon as the component mounts', async () => {
    const snapshot: VizTransportSnapshot = {
      ready: true,
      playing: false,
      reducedMotion: false,
      dayIndex: 0,
      dayCount: 12,
      dateLabel: '1 jan 2026',
      windowStartLabel: '2026',
      speedIndex: 0,
      birthDayIndex: -1,
      generatedAt: '2026-07-31T06:17:00Z',
    }
    const transport = getVizTransport()
    vi.spyOn(transport, 'getSnapshot').mockReturnValue(snapshot)
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-31T09:17:00Z'))

    render(<TransportBar />)

    await waitFor(() =>
      expect(screen.getByText('fresh · 3h ago')).toBeVisible()
    )
  })

  it('cancels the freshness timer when the component unmounts', () => {
    vi.useFakeTimers()
    const now = vi.spyOn(Date, 'now')
    const { unmount } = render(<TransportBar />)

    expect(now).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    now.mockClear()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    vi.runOnlyPendingTimers()

    expect(now).not.toHaveBeenCalled()
  })
})
