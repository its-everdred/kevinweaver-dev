import { Pane } from '@/components/ds/Pane'
import { REGION_META, type ManPageProps } from './_contract'

const META = REGION_META.manPage

/** Renders placeholder chrome for the manual-page region. */
export function ManPage({ id, className, style }: ManPageProps) {
  return (
    <Pane
      as="section"
      className={className}
      id={id}
      labelledBy={META.titleId}
      style={style}
      title={META.accessibleName}
      titleAs="h2"
      titleId={META.titleId}
    >
      <p className="ph">
        <span>man page placeholder</span>
      </p>
    </Pane>
  )
}
