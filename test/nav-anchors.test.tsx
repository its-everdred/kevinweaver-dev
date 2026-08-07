import { render } from '@testing-library/react'
import { beforeAll, expect, test } from 'vitest'
import { CareerLog } from '@/app/regions/CareerLog'
import { Contact } from '@/app/regions/Contact'
import { Header } from '@/app/regions/Header'
import { ManPage } from '@/app/regions/ManPage'
import { TmuxBar } from '@/app/regions/TmuxBar'
import { ANCHOR_TARGET, NAV_SECTIONS } from '@/app/regions/_contract'

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

function renderChrome() {
  return render(
    <>
      <Header />
      <ManPage />
      <CareerLog />
      <Contact />
      <TmuxBar />
    </>
  )
}

test('every nav and status-bar link targets a pane that exists', () => {
  const { container } = renderChrome()
  const fragments = [...container.querySelectorAll('a[href^="#"]')].map(
    (link) => link.getAttribute('href') ?? ''
  )

  // The header nav and the tmux status bar each link the full section set.
  expect(fragments).toHaveLength(NAV_SECTIONS.length * 2)
  expect(new Set(fragments)).toEqual(
    new Set(NAV_SECTIONS.map((section) => `#${section.id}`))
  )
  for (const fragment of fragments) {
    expect(
      container.querySelector(`[id="${fragment.slice(1)}"]`),
      `${fragment} resolves to no element`
    ).not.toBeNull()
  }
})

test('each pane target carries the sticky-header offset and takes focus', () => {
  const { container } = renderChrome()
  for (const section of NAV_SECTIONS) {
    const target = container.querySelector(`[id="${section.id}"]`)
    expect(target, `#${section.id} is missing`).not.toBeNull()
    expect(target).toHaveClass(ANCHOR_TARGET.className)
    expect(target?.getAttribute('tabindex')).toBe(
      String(ANCHOR_TARGET.tabIndex)
    )
    // Landing there must announce something: every target is a named landmark.
    expect(target?.getAttribute('aria-labelledby')).toBeTruthy()
  }
})
