import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BundleHead } from '@/lib/bundle/loader'
import type { RepoRecord } from '@/lib/bundle/schema'
import {
  createInstrumentViz,
  type InstrumentRuntimeState,
} from './instrumentRuntime'
import { clearGalaxySelection, publishGalaxySelection } from './galaxySelection'
import { RepoInfo } from './RepoInfo'

const runtime = vi.hoisted(() => ({
  current: { status: 'loading' } as InstrumentRuntimeState,
}))

vi.mock('./instrumentRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./instrumentRuntime')>()
  return { ...actual, useInstrumentRuntime: () => runtime.current }
})

// prettier-ignore
function repo(id: number, short: string, actor: 0 | 1, from: string): RepoRecord {
  return { id, ghId: (id + 1) * 100, name: `fixture/${short}`, short, actor, vol: 4, stars: 2, from, to: '2026-02-05', private: false, ext: ['ts', 'md'], status: 'ok' }
}

// prettier-ignore
const HEAD: BundleHead = {
  manifest: { v: 1, generatedAt: '2026-02-05T12:00:00Z', commit: 'fixture-commit', days: ['2026-02-05', '2026-02-01'], refs: 'all', windowStart: '2026-02-01', windowEnd: '2026-02-05', dayCount: 5, repoCount: 2, repoCountDefinition: 'ownerPublicNonFork', actors: [{ id: 0, login: 'human-fixture', kind: 'human' }, { id: 1, login: 'agent-fixture', kind: 'agent' }], degraded: [], chunkSize: 10, chunks: 1, events: 3 },
  repos: [repo(0, 'alpha', 0, '2026-02-01'), repo(1, 'beta', 1, '2026-02-02')],
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

describe('RepoInfo', () => {
  beforeEach(() => {
    runtime.current = { status: 'loading' }
    clearGalaxySelection()
  })

  it('renders an empty state before the first click', () => {
    ready()
    render(<RepoInfo />)

    expect(screen.getByText(/click a repo/i)).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('no repository selected')).toBeInTheDocument()
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

  it('returns to the empty state when the selection is cleared', () => {
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
    expect(screen.getByText(/click a repo/i)).toBeInTheDocument()
  })
})
