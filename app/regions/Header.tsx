'use client'

import { useActiveSection } from '@/components/ds/TmuxBar'
import Link from 'next/link'
import { NAV_SECTIONS, REGION_META, type HeaderProps } from './_contract'

export type HeaderFreshnessTone = 'fresh' | 'stale' | 'static'

export interface HeaderFreshness {
  readonly label: string
  readonly tone: HeaderFreshnessTone
  readonly description: string
}

export interface HeaderOwnProps extends HeaderProps {
  readonly freshness?: HeaderFreshness
}

const META = REGION_META.header
const TONE_COLOR: Record<HeaderFreshnessTone, string> = {
  fresh: 'var(--green)',
  stale: 'var(--yellow)',
  static: 'var(--fg4)',
}

function FreshnessPill({ freshness }: { readonly freshness: HeaderFreshness }) {
  return (
    <span
      style={{
        alignItems: 'center',
        color: 'var(--fg3)',
        display: 'flex',
        fontSize: 'var(--fs-micro)',
        fontWeight: 'var(--fw-bold)',
        gap: 'var(--sp-1)',
        letterSpacing: '.1em',
        padding: '0 var(--sp-2)',
        textTransform: 'uppercase',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          background: TONE_COLOR[freshness.tone],
          borderRadius: '50%',
          display: 'block',
          height: '7px',
          width: '7px',
        }}
      />
      <span>{freshness.label}</span>
      <span className="sr-only">{freshness.description}</span>
    </span>
  )
}

/** Renders the sticky site banner and data-driven section navigation. */
export function Header({ id, className, style, freshness }: HeaderOwnProps) {
  const active = useActiveSection(NAV_SECTIONS.map((section) => section.id))
  return (
    <header
      aria-labelledby={META.titleId}
      className={className}
      id={id}
      style={{
        alignItems: 'stretch',
        background: 'var(--bg-h)',
        borderBottom: '1px solid var(--bg1)',
        display: 'flex',
        fontSize: 'var(--fs-micro)',
        letterSpacing: '.02em',
        minHeight: 'var(--bar-h)',
        padding: '0 var(--sp-2)',
        position: 'sticky',
        top: 0,
        whiteSpace: 'nowrap',
        zIndex: 70,
        ...style,
      }}
    >
      <h2 className="sr-only" id={META.titleId}>
        {META.accessibleName}
      </h2>
      <Link
        href="/"
        style={{
          alignItems: 'center',
          color: 'var(--fg1)',
          display: 'flex',
          fontWeight: 'var(--fw-black)',
          padding: '0 var(--sp-2)',
        }}
      >
        kevinweaver.dev
      </Link>
      {NAV_SECTIONS.length > 0 ? (
        <nav
          aria-label="sections"
          className="kw-hide-sm"
          style={{ alignItems: 'stretch', display: 'flex', gap: '2px' }}
        >
          {NAV_SECTIONS.map((section) => (
            <a
              aria-current={active === section.id ? 'location' : undefined}
              href={`#${section.id}`}
              key={section.id}
              style={{
                alignItems: 'center',
                borderBottomWidth: active === section.id ? '2px' : undefined,
                display: 'flex',
                gap: 'var(--sp-1)',
                padding: '0 var(--sp-1)',
              }}
            >
              <span aria-hidden="true" style={{ opacity: 0.55 }}>
                {section.index}
              </span>
              <span aria-hidden="true">{section.label}</span>
              <span className="sr-only">{`${section.index}: ${section.label}`}</span>
            </a>
          ))}
        </nav>
      ) : null}
      <span style={{ flex: 1 }} />
      {freshness ? <FreshnessPill freshness={freshness} /> : null}
    </header>
  )
}
