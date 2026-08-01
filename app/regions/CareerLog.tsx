import { Pane } from '@/components/ds/Pane'
import { REGION_META, type CareerLogProps } from './_contract'

const META = REGION_META.careerLog

/** Renders placeholder chrome for the career-log region. */
export function CareerLog({
  id = META.anchorId ?? undefined,
  className,
  style,
}: CareerLogProps) {
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
        <span>career log placeholder</span>
      </p>
    </Pane>
  )
}
