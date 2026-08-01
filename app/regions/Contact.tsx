import { Pane } from '@/components/ds/Pane'
import { REGION_META, type ContactProps } from './_contract'

const META = REGION_META.contact

/** Renders placeholder chrome for the contact region. */
export function Contact({
  id = META.anchorId ?? undefined,
  className,
  style,
}: ContactProps) {
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
        <span>contact placeholder</span>
      </p>
    </Pane>
  )
}
