'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SpinnerIcon } from '@/components/icons'
import { Pane } from '@/components/ds/Pane'
import { BOOT_LINES, BOOT_PANE_TITLE, fill } from '@/content/boot'
import type { BootKind, BootToken } from '@/content/boot'

import { REGION_META } from './_contract'
import type { BootOverlayProps } from './_contract'

const LINE_MS = 100
const TAIL_LINES = 2
const KILL_MS = 2200
const FACTS_TIMEOUT_MS = 400

const SESSION_KEY = 'kw.boot.v1'
const MANIFEST_URL = '/data/v1/manifest.json'
const GRID_URL = '/data/v1/grid.json'
const KIND_COLOR: Record<BootKind, string> = {
  cmd: 'var(--fg1, #ebdbb2)',
  ok: 'var(--green, #b8bb26)',
  warn: 'var(--yellow, #fabd2d)',
  dim: 'var(--fg4, #a89984)',
  agent: 'var(--purple, #d3869b)',
}
const REPO_COUNT_LABEL: Record<string, string> = {
  ownerPublic: 'public',
  ownerPublicNonFork: 'public non-fork',
  withMemberAffiliations: 'public + member',
  repositoriesContributedTo: 'contributed-to',
}
const NUM = new Intl.NumberFormat('en-US')
const DAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const MODIFIERS = ['Shift', 'Control', 'Alt', 'Meta']

interface ManifestWire {
  generatedAt: string
  windowStart: string
  dayCount: number
  repoCount: number
  repoCountDefinition: keyof typeof REPO_COUNT_LABEL
  actors: readonly { login: string; kind: 'human' | 'agent' }[]
}

interface GridWire {
  start: string
  n: number
  e: readonly number[]
  a: readonly number[]
  p: readonly number[]
  pStart: string
}

type BootFacts = Readonly<Record<BootToken, string>>

function isManifestWire(value: unknown): value is ManifestWire {
  if (!isRecord(value)) return false
  const candidate = value
  return (
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.windowStart === 'string' &&
    typeof candidate.dayCount === 'number' &&
    typeof candidate.repoCount === 'number' &&
    typeof candidate.repoCountDefinition === 'string' &&
    Object.prototype.hasOwnProperty.call(
      REPO_COUNT_LABEL,
      candidate.repoCountDefinition
    ) &&
    Array.isArray(candidate.actors) &&
    candidate.actors.every(isActor)
  )
}

function isActor(value: unknown): value is ManifestWire['actors'][number] {
  if (!isRecord(value)) return false
  const candidate = value
  return (
    typeof candidate.login === 'string' &&
    (candidate.kind === 'human' || candidate.kind === 'agent')
  )
}

function isGridWire(value: unknown): value is GridWire {
  if (!isRecord(value)) return false
  const candidate = value
  if (!isNumberArray(candidate.e) || !isNumberArray(candidate.a)) return false
  if (!isNumberArray(candidate.p)) return false
  return (
    typeof candidate.start === 'string' &&
    typeof candidate.n === 'number' &&
    candidate.e.length === candidate.n &&
    candidate.a.length === candidate.n &&
    typeof candidate.pStart === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

function dayLabel(iso: string): string {
  return DAY.format(new Date(`${iso}T00:00:00Z`)).toLowerCase()
}

function addDays(start: string, offset: number): string {
  const date = new Date(`${start}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function derive(manifest: ManifestWire, grid: GridWire): BootFacts | null {
  const repoCountDefinition = REPO_COUNT_LABEL[manifest.repoCountDefinition]
  const firstAgentDay = grid.a.findIndex((count) => count > 0)
  if (repoCountDefinition === undefined || firstAgentDay < 0) return null

  let contributions = 0
  let activeDays = 0
  let busiestCount = 0
  let busiestIndex = 0
  let massPointDays = 0
  let zeroDays = 0
  grid.e.forEach((humanCount, index) => {
    const dailyTotal = humanCount + (grid.a[index] ?? 0)
    contributions += dailyTotal
    activeDays += dailyTotal > 0 ? 1 : 0
    zeroDays += dailyTotal === 0 ? 1 : 0
    massPointDays += dailyTotal === 1 ? 1 : 0
    if (dailyTotal > busiestCount) {
      busiestCount = dailyTotal
      busiestIndex = index
    }
  })
  contributions += grid.p.reduce((total, volume) => total + volume, 0)
  return {
    contributions: NUM.format(contributions),
    days: NUM.format(manifest.dayCount),
    repos: NUM.format(manifest.repoCount),
    zeroDays: NUM.format(zeroDays),
    activeDays: NUM.format(activeDays),
    busiestCount: NUM.format(busiestCount),
    busiestDate: dayLabel(addDays(grid.start, busiestIndex)),
    massPointDays: NUM.format(massPointDays),
    actors: NUM.format(manifest.actors.length),
    privateVolumes: grid.p.some((volume) => volume > 0) ? '1' : '0',
    agentSince: dayLabel(addDays(grid.start, firstAgentDay)),
    windowStart: manifest.windowStart,
    repoCountDefinition,
    date: dayLabel(manifest.generatedAt.slice(0, 10)),
  }
}

async function readFacts(signal: AbortSignal): Promise<BootFacts | null> {
  const [manifestResponse, gridResponse] = await Promise.all([
    fetch(MANIFEST_URL, { signal }).then((response) =>
      response.ok ? response.json() : null
    ),
    fetch(GRID_URL, { signal }).then((response) =>
      response.ok ? response.json() : null
    ),
  ])
  if (!isManifestWire(manifestResponse) || !isGridWire(gridResponse))
    return null
  if (gridResponse.n !== manifestResponse.dayCount) return null
  return derive(manifestResponse, gridResponse)
}

export function BootOverlay({ id, className, style }: BootOverlayProps) {
  const [lines, setLines] = useState<readonly string[] | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [done, setDone] = useState(false)
  const skipRef = useRef<HTMLButtonElement>(null)
  const restoreRef = useRef<Element | null>(null)
  const dismiss = useCallback(() => setDone(true), [])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) !== null) return
      window.sessionStorage.setItem(SESSION_KEY, '1')
    } catch {
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), FACTS_TIMEOUT_MS)
    readFacts(controller.signal)
      .then((facts) => {
        if (controller.signal.aborted || facts === null) return
        try {
          setLines(BOOT_LINES.map((line) => fill(line.template, facts)))
        } catch {
          return
        }
      })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timer))
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [])

  useEffect(() => {
    if (lines === null) return
    let raf = 0
    let start = 0
    const step = (timestamp: number) => {
      if (start === 0) start = timestamp
      const want = Math.floor((timestamp - start) / LINE_MS)
      if (want > lines.length + TAIL_LINES) {
        dismiss()
        return
      }
      setRevealed((previous) =>
        want > previous ? Math.min(want, lines.length) : previous
      )
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    const kill = window.setTimeout(dismiss, KILL_MS)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(kill)
    }
  }, [lines, dismiss])

  useEffect(() => {
    if (lines === null || done) return
    const onKey = (event: KeyboardEvent) => {
      if (!MODIFIERS.includes(event.key)) dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lines, done, dismiss])

  // Any key dismisses, so a focus trap would strand keyboard users here.
  useEffect(() => {
    if (lines === null || done) return
    restoreRef.current = document.activeElement
    skipRef.current?.focus()
    return () => {
      const element = restoreRef.current
      if (element instanceof HTMLElement && document.contains(element))
        element.focus()
    }
  }, [lines, done])

  if (lines === null || done) return null
  const meta = REGION_META.bootOverlay
  return (
    <div
      id={id}
      className={className}
      role="dialog"
      aria-modal="true"
      aria-labelledby={meta.titleId}
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'var(--bg0, #282828)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        cursor: 'pointer',
        ...style,
      }}
    >
      <Pane
        focus
        dots
        title={BOOT_PANE_TITLE}
        titleId={meta.titleId}
        titleAs="h2"
        right={
          <button
            ref={skipRef}
            type="button"
            onClick={dismiss}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            skip
          </button>
        }
        style={{ width: 'min(680px, 100%)' }}
        bodyStyle={{
          minHeight: '210px',
          fontSize: '12px',
          lineHeight: '1.9',
          display: 'flex',
          flexDirection: 'column',
          gap: '1px',
        }}
      >
        {BOOT_LINES.map((line, index) => (
          <div
            key={line.template}
            style={{
              whiteSpace: 'pre',
              color: KIND_COLOR[line.kind],
              visibility: index < revealed ? 'visible' : 'hidden',
              animation:
                index < revealed ? 'kw-logIn .3s ease both' : undefined,
              display: 'flex',
              gap: '1ch',
            }}
          >
            {line.marker === 'spinner' ? <SpinnerIcon /> : null}
            {line.marker === 'agent' ? '◆' : null}
            <span>{lines[index]}</span>
            {line.badge ? (
              <span style={{ marginLeft: 'auto', color: KIND_COLOR.ok }}>
                ok
              </span>
            ) : null}
          </div>
        ))}
      </Pane>
    </div>
  )
}
