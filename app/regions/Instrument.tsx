import { Pane } from '@/components/ds/Pane'
import { REGION_META, type InstrumentProps } from './_contract'

const META = REGION_META.instrument

/** Renders placeholder chrome for the contribution and activity instrument. */
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
      <Pane dots title="contributions">
        <p className="ph">
          <span>contributions placeholder</span>
        </p>
      </Pane>
      <Pane focus footer={null} title="gource repo graph">
        <p className="ph">
          <span>repository graph placeholder</span>
        </p>
      </Pane>
      <Pane title="events tail">
        <p className="ph">
          <span>events placeholder</span>
        </p>
      </Pane>
    </section>
  )
}
