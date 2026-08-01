'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

/** Maps one-to-one onto a design-system tmux segment class. */
export type TmuxSegVariant =
  'session' | 'wins' | 'plain' | 'host' | 'clock' | 'spacer'
/** Selects the CSS-drawn powerline arrow for a segment. */
export type TmuxSegArrow = 'right' | 'left' | 'none'
/** Selects the responsive breakpoint at which a segment is hidden. */
export type TmuxBreakpoint = 'sm' | 'md'

export interface TmuxSeg {
  readonly key: string
  readonly variant?: TmuxSegVariant
  readonly arrow?: TmuxSegArrow
  readonly text?: ReactNode
  readonly bg?: string
  readonly fg?: string
  readonly bold?: boolean
  readonly tabular?: boolean
  readonly hideBelow?: TmuxBreakpoint
  readonly slot?: boolean
  readonly role?: 'progressbar'
  readonly ariaLabel?: string
  readonly ariaHidden?: boolean
  readonly padding?: string
}

export interface TmuxBarViewProps {
  readonly segs: readonly TmuxSeg[]
  readonly accent?: string
  readonly id?: string
  readonly className?: string
  readonly 'aria-labelledby'?: string
}

type TmuxStyle = CSSProperties & { '--accent'?: string }

const VARIANT_CLASS: Record<TmuxSegVariant, string> = {
  session: 'seg session',
  wins: 'seg wins',
  plain: 'seg',
  host: 'seg host',
  clock: 'seg clock',
  spacer: 'spacer',
}

function segmentClassName(seg: TmuxSeg): string {
  const classes = [VARIANT_CLASS[seg.variant ?? 'plain']]
  if (seg.variant !== 'spacer' && seg.arrow && seg.arrow !== 'none') {
    classes.push(seg.arrow === 'left' ? 'plr' : 'pl')
  }
  if (seg.hideBelow) classes.push(`kw-hide-${seg.hideBelow}`)
  return classes.join(' ')
}

function segmentStyle(seg: TmuxSeg): CSSProperties | undefined {
  const style: CSSProperties = {
    ...(seg.bg ? { background: seg.bg } : {}),
    ...(seg.fg ? { color: seg.fg } : {}),
    ...(seg.bold ? { fontWeight: 'var(--fw-black)' } : {}),
    ...(seg.tabular ? { fontVariantNumeric: 'tabular-nums' } : {}),
    ...(seg.padding ? { padding: seg.padding } : {}),
  }
  return Object.keys(style).length > 0 ? style : undefined
}

function renderSegment(seg: TmuxSeg): ReactNode {
  if (seg.variant === 'spacer')
    return <span className={segmentClassName(seg)} key={seg.key} />
  return (
    <span
      aria-hidden={seg.ariaHidden}
      aria-label={seg.ariaLabel}
      aria-valuemax={seg.role ? 100 : undefined}
      aria-valuemin={seg.role ? 0 : undefined}
      className={segmentClassName(seg)}
      data-tmux-slot={seg.slot ? seg.key : undefined}
      key={seg.key}
      role={seg.role}
      style={segmentStyle(seg)}
    >
      {seg.text}
    </span>
  )
}

/** Renders free-form tmux segments using the vendored design-system classes. */
export function TmuxBar({
  segs,
  accent,
  id,
  className,
  'aria-labelledby': ariaLabelledby,
}: TmuxBarViewProps): ReactNode {
  const style: TmuxStyle | undefined = accent
    ? { '--accent': accent }
    : undefined
  return (
    <div
      aria-labelledby={ariaLabelledby}
      className={['tmux', className].filter(Boolean).join(' ')}
      id={id}
      style={style}
    >
      {segs.map(renderSegment)}
    </div>
  )
}

/**
 * Tracks the last visible section above the supplied sticky-header offset.
 * Missing section targets are ignored so regions can land independently.
 */
export function useActiveSection(
  ids: readonly string[],
  offsetPx = 120
): string | null {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const nodes = ids
      .map((sectionId) => document.getElementById(sectionId))
      .filter((node): node is HTMLElement => node !== null)
    if (nodes.length === 0) return
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          seen.set(entry.target.id, entry.isIntersecting)
        const hit = ids.filter((sectionId) => seen.get(sectionId))
        setActive(hit.length > 0 ? (hit[hit.length - 1] ?? null) : null)
      },
      { rootMargin: `-${offsetPx}px 0px 0px 0px`, threshold: 0 }
    )
    for (const node of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [ids, offsetPx])

  return active
}
