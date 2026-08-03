import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ContributionTable } from '@/components/viz/ContributionTable'
import { Pane } from '@/components/ds/Pane'
import { GourceIsland } from '@/components/viz/GourceIsland'
import { GraphDate, Overview } from '@/components/viz/Overview'
import { Ribbon } from '@/components/viz/Ribbon'
import { decodeGrid, decodeManifest } from '@/lib/bundle/codec'
import type { GridSeries, Manifest } from '@/lib/bundle/schema'
import { REGION_META, type InstrumentProps } from './_contract'

/**
 * @description Placeholder transport footer consumed by the gource pane.
 * @returns The empty transport slot that KW-026 fills with its real bar.
 */
function TransportSlot() {
  return <div aria-hidden="true" />
}

const META = REGION_META.instrument
const TABLE_ID = 'kw-contribution-table'

/**
 * @description Reads and decodes the committed payload at build/prerender time.
 * @returns The decoded head (grid + manifest), or null when the payload is not
 * present — fail closed, so a missing bundle renders no table rather than a
 * partial one.
 */
function readCommittedHead(): { grid: GridSeries; manifest: Manifest } | null {
  try {
    const base = join(process.cwd(), 'public/data/v1')
    const manifest = decodeManifest(
      readFileSync(join(base, 'manifest.json'), 'utf8')
    )
    const grid = decodeGrid(readFileSync(join(base, 'grid.json'), 'utf8'))
    return { grid, manifest }
  } catch {
    return null
  }
}

/**
 * @description Renders server-owned pane chrome around isolated client visualization leaves.
 * @param props Region identity and layout overrides.
 * @returns The complete instrument region, including the server-rendered
 * DEC-011 contribution table (the canvas text equivalent + no-JS fallback).
 */
export function Instrument({ id, className, style }: InstrumentProps) {
  const instrumentClassName = ['kw-instr', className].filter(Boolean).join(' ')
  const head = readCommittedHead()

  return (
    <section
      aria-labelledby={META.titleId}
      className={instrumentClassName}
      id={id}
      style={style}
    >
      <h2 className="sr-only" id={META.titleId}>
        {META.accessibleName}
      </h2>
      <Pane
        dots
        title="contributions"
        bodyStyle={{
          display: 'flex',
          flexDirection: 'column',
          gap: 9,
          padding: '14px 16px',
        }}
        style={{ flex: '0 0 auto' }}
      >
        <Overview />
        <Ribbon />
      </Pane>
      {head ? (
        <ContributionTable
          id={TABLE_ID}
          grid={head.grid}
          meta={head.manifest}
        />
      ) : null}
      <div className="kw-lower">
        <Pane
          as="section"
          bleed
          focus
          footer={<TransportSlot />}
          right={<GraphDate />}
          title="gource — repo graph"
          titleAs="h3"
          bodyClassName="kw-graph"
          style={{ flex: 1, minWidth: 0 }}
        >
          <GourceIsland />
        </Pane>
        <Pane className="kw-tail" title="events — tail -f">
          <div
            aria-label="recent contribution events"
            aria-live="polite"
            aria-relevant="additions"
            id="kw-event-log"
            role="log"
          />
        </Pane>
      </div>
    </section>
  )
}
