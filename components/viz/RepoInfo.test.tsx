import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundleHead } from '@/lib/bundle/loader'
import type { RepoRecord } from '@/lib/bundle/schema'
import {
  createInstrumentViz,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import {
  clearGalaxySelection,
  getGalaxySelection,
  publishGalaxySelection,
} from './galaxySelection'
import { publishGalaxyTimeline, seekGalaxyTimeline } from './galaxyTimeline'
import { RepoInfo } from './RepoInfo'

const runtime = vi.hoisted(() => ({
  current: { status: 'loading' } as InstrumentRuntimeState,
}))

vi.mock('./instrumentRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instrumentRuntime')>()
  return { ...actual, useInstrumentRuntime: () => runtime.current }
})

// prettier-ignore
function repo(id: number, short: string, actor: 0 | 1, from: string, ext: string[] = ['ts', 'md']): RepoRecord {
  return { id, ghId: (id + 1) * 100, name: `fixture/${short}`, short, actor, vol: 4, stars: 2, from, to: '2026-02-05', private: false, ext, status: 'ok' }
}

// prettier-ignore
const HEAD: BundleHead = {
  manifest: { v: 1, generatedAt: '2026-02-05T12:00:00Z', commit: 'fixture-commit', days: ['2026-02-05', '2026-02-01'], refs: 'all', windowStart: '2026-02-01', windowEnd: '2026-02-05', dayCount: 5, repoCount: 2, repoCountDefinition: 'ownerPublicNonFork', actors: [{ id: 0, login: 'human-fixture', kind: 'human' }, { id: 1, login: 'agent-fixture', kind: 'agent' }], degraded: [], chunkSize: 10, chunks: 1, events: 3 },
  repos: [repo(0, 'alpha', 0, '2026-02-01'), repo(1, 'beta', 1, '2026-02-02'), repo(2, 'gamma', 0, '2026-02-03', ['bak', 'css', 'example', 'html', 'jpg', 'js', 'json', 'lock'])],
  grid: { start: '2026-02-01', dayCount: 5, human: [1, 0, 2, 0, 1], agent: [0, 3, 0, 1, 0], privateMonthly: [], privateStart: '2026-02', bands: [0, 1, 2, 4, 8, 16, 32, 64, 128, 256] },
  events: [{ day: 0, repo: 1, path: 'docs/latest.md', actor: 1 }, { day: 2, repo: 0, path: 'src/needle.ts', actor: 0 }, { day: 4, repo: 0, path: 'src/other.ts', actor: 0 }],
}

/** Reads a definition list value by its term, the way the pane pairs them. */
function value(label: string): string {
  const term = screen.getByText(label)
  const detail = term.nextElementSibling
  if (!detail) throw new Error(`no value rendered for "${label}"`)
  return detail.textContent ?? ''
}

function ready(): void {
  runtime.current = { status: 'ready', viz: createInstrumentViz(HEAD) }
}

/** Parks the shared clock on a step. Step 4 is the newest day in the window. */
function park(step: number): void {
  act(() => {
    publishGalaxyTimeline({
      step,
      date: '',
      playing: false,
      total: HEAD.manifest.dayCount,
      direction: 'backward',
      windowStartISO: HEAD.manifest.windowStart,
    })
    seekGalaxyTimeline(step, HEAD.manifest.dayCount)
  })
}

const dismiss = (): HTMLElement =>
  screen.getByRole('button', { name: /day's repos/i })

describe('RepoInfo', () => {
  beforeEach(() => {
    runtime.current = { status: 'loading' }
    clearGalaxySelection()
    park(4)
  })

  it('lists the repos contributed to on the current step with nothing pinned', () => {
    ready()
    render(<RepoInfo />)

    expect(
      screen.getByRole('button', { name: /fixture\/beta/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fixture\/alpha/ })).toBeNull()
  })

  it('follows the day when the step advances', () => {
    ready()
    render(<RepoInfo />)
    expect(
      screen.getByRole('button', { name: /fixture\/beta/ })
    ).toBeInTheDocument()

    park(2)

    expect(
      screen.getByRole('button', { name: /fixture\/alpha/ })
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /fixture\/beta/ })).toBeNull()
  })

  it('renders an empty state for a day with no contributions', () => {
    ready()
    park(3)
    render(<RepoInfo />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getByText(/no repos this day/i)).toBeInTheDocument()
  })

  it('pins the pane to a repo clicked in the day list', () => {
    ready()
    render(<RepoInfo />)

    fireEvent.click(screen.getByRole('button', { name: /fixture\/beta/ }))

    expect(getGalaxySelection().repoId).toBe(1)
    expect(screen.getByRole('link', { name: 'fixture/beta' })).toHaveAttribute(
      'href',
      'https://github.com/fixture/beta'
    )
    expect(value('files')).toBe('1')
    expect(value('last active')).toBe('2026-02-05')
  })

  it('reveals a dismiss control that returns the pane to the day list', () => {
    ready()
    publishGalaxySelection({
      repoId: 0,
      name: 'fixture/alpha',
      fileCount: 12,
      lastStep: 3,
    })
    render(<RepoInfo />)

    act(() => fireEvent.click(dismiss()))

    expect(getGalaxySelection().repoId).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
    expect(
      screen.getByRole('button', { name: /fixture\/beta/ })
    ).toBeInTheDocument()
  })

  it('gives the dismiss control a keyboard-operable 24px-square target', () => {
    ready()
    publishGalaxySelection({
      repoId: 0,
      name: 'fixture/alpha',
      fileCount: 12,
      lastStep: 3,
    })
    render(<RepoInfo />)

    const control = dismiss()
    expect(control.tagName).toBe('BUTTON')
    expect(control).toHaveAttribute('type', 'button')
    control.focus()
    expect(document.activeElement).toBe(control)

    // jsdom applies no stylesheet, so the WCAG 2.2 SC 2.5.8 floor axe enforces
    // under `wcag22aa` is asserted where it is actually declared.
    const css = readFileSync(
      join(process.cwd(), 'components/viz/RepoInfo.module.css'),
      'utf8'
    )
    const rule = /\.dismiss\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/min-width:\s*(?:2[4-9]|[3-9]\d)px/)
    expect(rule).toMatch(/min-height:\s*(?:2[4-9]|[3-9]\d)px/)
  })

  it('shows the clicked repo, its file count, and when it was last active', () => {
    ready()
    publishGalaxySelection({
      repoId: 0,
      name: 'fixture/alpha',
      fileCount: 12,
      lastStep: 3,
    })
    render(<RepoInfo />)

    expect(screen.getByRole('link', { name: 'fixture/alpha' })).toHaveAttribute(
      'href',
      'https://github.com/fixture/alpha'
    )
    expect(value('files')).toBe('12')
    expect(value('last active')).toBe('2026-02-04')
  })

  it('enriches the pane from the payload the runtime already holds', () => {
    ready()
    publishGalaxySelection({
      repoId: 1,
      name: 'fixture/beta',
      fileCount: 3,
      lastStep: 4,
    })
    render(<RepoInfo />)

    expect(value('first commit')).toBe('2026-02-02')
    expect(value('commits')).toBe('4')
    expect(value('stars')).toBe('2')
    expect(value('ext')).toBe('ts md')
  })

  it('never lists the bak extension, and lists every extension that is left', () => {
    ready()
    publishGalaxySelection({
      repoId: 2,
      name: 'fixture/gamma',
      fileCount: 5,
      lastStep: 4,
    })
    render(<RepoInfo />)

    expect(value('ext')).toBe('css example html jpg js json lock')
    expect(value('ext')).not.toContain('bak')
  })

  it('wraps the extension list across lines rather than clipping it to one', () => {
    ready()
    publishGalaxySelection({
      repoId: 2,
      name: 'fixture/gamma',
      fileCount: 5,
      lastStep: 4,
    })
    render(<RepoInfo />)

    expect(screen.getByText('ext').nextElementSibling?.className).toMatch(
      /wrap/
    )
    const css = readFileSync(
      join(process.cwd(), 'components/viz/RepoInfo.module.css'),
      'utf8'
    )
    const rule = /\.rows dd\.wrap\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/white-space:\s*normal/)
    expect(rule).toMatch(/overflow:\s*visible/)
  })

  it('reports a repo with no contribution in the window as never active', () => {
    ready()
    publishGalaxySelection({
      repoId: 404,
      name: 'fixture/ghost',
      fileCount: 0,
      lastStep: -1,
    })
    render(<RepoInfo />)

    expect(value('last active')).toBe('never')
    expect(screen.queryByText('stars')).toBeNull()
  })

  it('still renders the selection when the payload never arrives', () => {
    runtime.current = { status: 'unavailable' }
    publishGalaxySelection({
      repoId: 0,
      name: 'fixture/alpha',
      fileCount: 9,
      lastStep: 3,
    })
    render(<RepoInfo />)

    expect(
      screen.getByRole('link', { name: 'fixture/alpha' })
    ).toBeInTheDocument()
    expect(value('files')).toBe('9')
  })

  it('announces the selection through a polite live region', () => {
    ready()
    publishGalaxySelection({
      repoId: 0,
      name: 'fixture/alpha',
      fileCount: 12,
      lastStep: 3,
    })
    const { container } = render(<RepoInfo />)

    const live = container.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toContain('fixture/alpha selected')
    expect(live?.textContent).toContain('files 12')
  })

  it('returns to the day list when the selection is cleared', () => {
    ready()
    publishGalaxySelection({
      repoId: 0,
      name: 'fixture/alpha',
      fileCount: 12,
      lastStep: 3,
    })
    render(<RepoInfo />)
    expect(
      screen.getByRole('link', { name: 'fixture/alpha' })
    ).toBeInTheDocument()

    act(() => clearGalaxySelection())

    expect(screen.queryByRole('link')).toBeNull()
    expect(
      screen.getByRole('button', { name: /fixture\/beta/ })
    ).toBeInTheDocument()
  })
})
