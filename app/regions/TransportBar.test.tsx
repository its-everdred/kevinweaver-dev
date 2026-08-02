import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import TransportBar, { freshness } from './TransportBar'

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

  it('carries no arcade residue and no fabricated live claim', () => {
    expect(html.toLowerCase()).not.toContain('bomberman')
    expect(html).not.toMatch(/>live<\/em>/)
  })
})
