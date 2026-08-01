import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { IDENTITY } from '@/content/identity'
import { EMPLOYERS } from '@/content/resume'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const AGENT = IDENTITY.actors.find((actor) => actor.kind === 'agent') ?? null
export const alt = AGENT
  ? `A gruvbox terminal card showing Kevin Weaver's GitHub contribution ribbon, with a purple sub-band from ${AGENT.since} where a second committer account starts writing to the same repositories.`
  : "A gruvbox terminal card showing Kevin Weaver's GitHub contribution ribbon."

// DEC-009. Source of truth is lib/viz/tokens/ramp.ts, mirrored because that
// ticket is not a dependency of this route.
const RAMP = [
  '#3c3836',
  '#404a2b',
  '#4d5b21',
  '#5e6a1f',
  '#70791d',
  '#83881b',
  '#98971a',
  '#b8bb26',
  '#d9d34a',
  '#faeb77',
] as const

const COLORS = {
  bgHard: '#1d2021',
  bg1: '#3c3836',
  bg2: '#504945',
  fg0: '#fbf1c7',
  fg3: '#bdae93',
  fg4: '#a89984',
  aqua: '#8ec07c',
  purple: '#d3869b',
} as const

type Card = {
  readonly cells: readonly number[]
  readonly agent: readonly boolean[]
  readonly totals: string | null
  readonly window: string | null
}

type GridWire = {
  readonly human: readonly number[]
  readonly agent: readonly number[]
  readonly bands: readonly number[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function numberArray(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number')
}

function readGrid(value: unknown): GridWire {
  if (!isRecord(value)) throw new Error('grid is not an object')
  const human = value.e
  const agent = value.a
  const bands = value.bands
  if (!numberArray(human) || !numberArray(agent) || !numberArray(bands)) {
    throw new Error('grid has invalid series')
  }
  if (
    human.length < 371 ||
    human.length !== agent.length ||
    bands.length !== 10
  ) {
    throw new Error('grid has inconsistent dimensions')
  }
  return { human, agent, bands }
}

function readManifest(value: unknown): { start: string; end: string } {
  if (!isRecord(value) || typeof value.windowStart !== 'string') {
    throw new Error('manifest has no window start')
  }
  if (typeof value.windowEnd !== 'string')
    throw new Error('manifest has no window end')
  return { start: value.windowStart, end: value.windowEnd }
}

function level(value: number, bands: readonly number[]): number {
  if (value <= 0) return -1
  let result = 0
  for (const [index, threshold] of bands.entries()) {
    if (value >= threshold) result = index
  }
  return Math.min(result, RAMP.length - 1)
}

async function loadCard(): Promise<Card> {
  if (process.env.KW_OG_FALLBACK === '1') throw new Error('forced fallback')
  const dir = join(process.cwd(), 'public', 'data', 'v1')
  const [manifestText, gridText] = await Promise.all([
    readFile(join(dir, 'manifest.json'), 'utf8'),
    readFile(join(dir, 'grid.json'), 'utf8'),
  ])
  const manifestValue: unknown = JSON.parse(manifestText)
  const gridValue: unknown = JSON.parse(gridText)
  const manifest = readManifest(manifestValue)
  const grid = readGrid(gridValue)
  const start = Math.max(0, grid.human.length - 371)
  const cells = grid.human
    .slice(start)
    .map((value, index) =>
      level(value + (grid.agent[start + index] ?? 0), grid.bands)
    )
  const agent = grid.agent.slice(start).map((value) => value > 0)
  const humanTotal = grid.human.reduce((sum, value) => sum + value, 0)
  const agentTotal = grid.agent.reduce((sum, value) => sum + value, 0)
  return {
    cells,
    agent,
    totals: `human ${humanTotal.toLocaleString('en-US')} · agent ${agentTotal.toLocaleString('en-US')}`,
    window: `${manifest.start} → ${manifest.end}`,
  }
}

function EmptyCard(): Card {
  return {
    cells: Array(371).fill(-1),
    agent: Array(371).fill(false),
    totals: null,
    window: null,
  }
}

function CellGrid({ card }: { card: Card }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, width: 1003 }}>
      {card.cells.map((cell, index) => (
        <div
          key={index}
          style={{
            backgroundColor: cell < 0 ? COLORS.bg1 : RAMP[cell],
            display: 'flex',
            height: 15,
            position: 'relative',
            width: 15,
          }}
        >
          {card.agent[index] ? (
            <div
              style={{
                backgroundColor: COLORS.purple,
                bottom: 0,
                display: 'flex',
                height: 3,
                position: 'absolute',
                width: 15,
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  )
}

function OgCard({ card }: { card: Card }) {
  const stack = EMPLOYERS[0]?.stack.join(' · ') ?? ''
  return (
    <div
      style={{
        backgroundColor: COLORS.bgHard,
        color: COLORS.fg0,
        display: 'flex',
        flexDirection: 'column',
        height: 630,
        padding: 25,
        width: 1200,
      }}
    >
      <div
        style={{
          border: `1px solid ${COLORS.bg2}`,
          display: 'flex',
          flexDirection: 'column',
          height: 578,
          padding: 38,
          width: 1150,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          kevin weaver
        </div>
        <div
          style={{
            color: COLORS.fg3,
            display: 'flex',
            fontSize: 26,
            marginTop: 13,
          }}
        >
          {IDENTITY.title}
        </div>
        <div
          style={{
            color: COLORS.fg4,
            display: 'flex',
            fontSize: 20,
            marginTop: 12,
          }}
        >
          {stack}
        </div>
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            height: 155,
            justifyContent: 'center',
            marginTop: 20,
          }}
        >
          <CellGrid card={card} />
        </div>
        <div
          style={{
            alignItems: 'center',
            backgroundColor: COLORS.bg1,
            display: 'flex',
            fontSize: 18,
            height: 44,
            margin: 'auto -38px -38px',
            padding: '0 24px',
            width: 1148,
          }}
        >
          <div style={{ color: COLORS.aqua, display: 'flex' }}>kw</div>
          <div style={{ color: COLORS.fg3, display: 'flex', marginLeft: 25 }}>
            git:main
          </div>
          <div style={{ color: COLORS.fg3, display: 'flex', marginLeft: 25 }}>
            kevinweaver.dev
          </div>
          <div
            style={{ color: COLORS.fg4, display: 'flex', marginLeft: 'auto' }}
          >
            {card.totals ?? ''}
          </div>
          <div style={{ color: COLORS.fg4, display: 'flex', marginLeft: 25 }}>
            {card.window ?? ''}
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function Image(): Promise<Response> {
  try {
    if (process.env.KW_OG_FALLBACK === '1') {
      const png = await readFile(join(process.cwd(), 'public', 'og.png'))
      return new Response(new Uint8Array(png), {
        headers: { 'content-type': 'image/png' },
      })
    }
    let card: Card
    try {
      card = await loadCard()
    } catch {
      card = EmptyCard()
    }
    return new ImageResponse(<OgCard card={card} />, size)
  } catch {
    const png = await readFile(join(process.cwd(), 'public', 'og.png'))
    return new Response(new Uint8Array(png), {
      headers: { 'content-type': 'image/png' },
    })
  }
}
