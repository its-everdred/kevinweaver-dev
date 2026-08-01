import { CommitLog } from '@/components/ds/CommitLog'
import { Pane } from '@/components/ds/Pane'
import {
  CAREER_LOG,
  CAREER_LOG_HEAD,
  CAREER_LOG_PANE_TITLE,
} from '@/content/career-log'
import { REGION_META, type CareerLogProps } from './_contract'

const META = REGION_META.careerLog

/**
 * Renders the ordered, expandable career history pane.
 *
 * @param props - Region layout overrides supplied by the page shell.
 * @returns The labelled career-log landmark.
 */
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
      right={
        <span className="kw-hide-sm" style={{ color: 'var(--text-faint)' }}>
          {CAREER_LOG_HEAD}
        </span>
      }
      style={{ scrollMarginTop: '44px', ...style }}
      title={CAREER_LOG_PANE_TITLE}
      titleAs="h2"
      titleId={META.titleId}
    >
      <CommitLog commits={CAREER_LOG} labelledBy={META.titleId} />
    </Pane>
  )
}
