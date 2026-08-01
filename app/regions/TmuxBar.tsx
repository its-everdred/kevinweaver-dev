'use client'

/*
 * Reflow budget, measured at the responsive token floor:
 *
 * | Viewport | Visible segments                         | Width | Headroom |
 * | 320 px  | session, wins, spacer, percent, clock    | 246px | 74 px    |
 * | 720 px  | + branch, position                        | ~393px| 327 px   |
 * | 1080 px | + host                                    | ~530px| 550 px   |
 *
 * Branch and position shed at sm. Host sheds at md. The windows remain the
 * mobile navigation, so the active section stays identifiable below 720 px.
 */

import { MenuIcon } from '@/components/icons'
import {
  TmuxBar as TmuxBarView,
  useActiveSection,
  type TmuxSeg,
} from '@/components/ds/TmuxBar'
import {
  NAV_SECTIONS,
  REGION_META,
  type NavSection,
  type TmuxBarProps,
} from './_contract'

const META = REGION_META.tmuxBar
const SECTIONS: readonly NavSection[] = NAV_SECTIONS

function windows(active: string | null) {
  return SECTIONS.map((section) => (
    <a
      aria-current={active === section.id ? 'location' : undefined}
      className={active === section.id ? 'win active' : 'win'}
      href={`#${section.id}`}
      key={section.id}
      style={{ minHeight: '24px', padding: '0 var(--sp-2)' }}
    >
      <span aria-hidden="true">{section.index}</span>
      <span
        aria-hidden="true"
        className="kw-hide-sm"
      >{`:${section.label}`}</span>
      {active === section.id ? <span aria-hidden="true">*</span> : null}
      <span className="sr-only">{`${section.index}: ${section.label}`}</span>
    </a>
  ))
}

function segments(active: string | null): readonly TmuxSeg[] {
  if (SECTIONS.length === 0) return []
  return [
    {
      arrow: 'right',
      key: 'session',
      padding: '0 var(--sp-1) 0 var(--sp-2)',
      text: 'NORMAL',
      variant: 'session',
    },
    {
      arrow: 'right',
      fg: 'var(--fg1)',
      key: 'wins',
      padding: '0 0 0 calc(var(--pl-w) + 14px)',
      text: windows(active),
      variant: 'wins',
    },
    {
      arrow: 'right',
      bg: 'var(--bg3)',
      fg: 'var(--fg1)',
      hideBelow: 'sm',
      key: 'branch',
      padding: '0 var(--sp-1) 0 calc(var(--pl-w) + 4px)',
      text: ' main',
      variant: 'plain',
    },
    {
      fg: 'var(--fg1)',
      hideBelow: 'md',
      key: 'host',
      padding: '0 var(--sp-2) 0 calc(var(--pl-w) + 8px)',
      text: 'kevinweaver.dev',
      variant: 'host',
    },
    { key: 'spacer', variant: 'spacer' },
    {
      ariaLabel: 'playback position',
      arrow: 'left',
      bg: 'var(--bg2)',
      fg: 'var(--fg1)',
      hideBelow: 'sm',
      key: 'position',
      padding: '0 var(--sp-1) 0 calc(var(--pl-w) + 4px)',
      role: 'progressbar',
      slot: true,
      tabular: true,
      text: (
        <>
          <MenuIcon size={12} />
          <span data-tmux-value>--/--</span>
        </>
      ),
      variant: 'plain',
    },
    {
      ariaHidden: true,
      arrow: 'left',
      bg: 'var(--bg3)',
      fg: 'var(--fg1)',
      key: 'percent',
      padding: '0 var(--sp-1) 0 calc(var(--pl-w) + 4px)',
      slot: true,
      tabular: true,
      text: <span data-tmux-value>--%</span>,
      variant: 'plain',
    },
    {
      ariaHidden: true,
      arrow: 'left',
      key: 'clock',
      padding: '0 var(--sp-2) 0 calc(var(--pl-w) + 8px)',
      slot: true,
      tabular: true,
      text: <span data-tmux-value>--:--</span>,
      variant: 'clock',
    },
  ]
}

/** Renders the sticky status-bar landmark and its driver-facing readout seams. */
export function TmuxBar({ id, className, style }: TmuxBarProps) {
  const active = useActiveSection(SECTIONS.map((section) => section.id))
  return (
    <footer
      aria-labelledby={META.titleId}
      className={className}
      id={id}
      style={{ bottom: 0, position: 'sticky', zIndex: 70, ...style }}
    >
      <h2 className="sr-only" id={META.titleId}>
        {META.accessibleName}
      </h2>
      <TmuxBarView segs={segments(active)} />
    </footer>
  )
}
