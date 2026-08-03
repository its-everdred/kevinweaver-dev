import { Pane } from '@/components/ds/Pane'
import { GourceIsland } from '@/components/viz/GourceIsland'
import { GraphDate, Overview } from '@/components/viz/Overview'
import { Ribbon } from '@/components/viz/Ribbon'
import { REGION_META, type InstrumentProps } from './_contract'

/**
 * @description Placeholder transport footer consumed by the gource pane.
 * @returns The empty transport slot that KW-026 fills with its real bar.
 */
function TransportSlot() {
  return <div aria-hidden="true" />
}

const META = REGION_META.instrument

/**
 * @description Renders server-owned pane chrome around isolated client visualization leaves.
 * @param props Region identity and layout overrides.
 * @returns The complete instrument region.
 */
export function Instrument({ id, className, style }: InstrumentProps) {
  const instrumentClassName = ['kw-instr', className].filter(Boolean).join(' ')

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
