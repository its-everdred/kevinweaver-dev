import type { ReactNode } from 'react'
import { CommitIcon } from '@/components/icons'
import { Pane } from '@/components/ds/Pane'
import { IDENTITY, type IdentityLink, type LinkId } from '@/content/identity'
import { ANCHOR_TARGET, REGION_META, type ContactProps } from './_contract'

const META = REGION_META.contact

const MARKER: Record<LinkId, string | null> = {
  'github-human': 'gh',
  'github-agent': '◆',
  email: null,
  linkedin: 'in',
  twitter: '@',
}

function relFor(link: IdentityLink): string {
  const rel = [...link.rel]
  if (!rel.includes('me')) rel.push('me')
  if (link.external && !rel.includes('noopener')) rel.push('noopener')
  return rel.join(' ')
}

function renderNote(note: string | null): ReactNode {
  if (note === null) return null
  const [before, after] = note.split('◉')
  if (after === undefined) return note
  return (
    <>
      {before}
      <CommitIcon size={11} />
      {after}
    </>
  )
}

/**
 * Renders the contact links and shell transcript for the site.
 *
 * @param props - Region identity, class, and style overrides.
 * @returns The contact region pane.
 */
export function Contact({
  id = META.anchorId ?? undefined,
  className,
  style,
}: ContactProps) {
  return (
    <Pane
      as="section"
      id={id}
      className={[ANCHOR_TARGET.className, className].filter(Boolean).join(' ')}
      style={style}
      tabIndex={ANCHOR_TARGET.tabIndex}
      title={META.accessibleName}
      titleId={META.titleId}
      titleAs="h2"
      labelledBy={META.titleId}
    >
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'grid',
          gap: 'var(--sp-2)',
        }}
      >
        {IDENTITY.links.map((link) => (
          <li
            key={link.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--sp-3)',
              flexWrap: 'wrap',
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              className="text-[var(--text-faint)]"
              style={{ flex: '0 0 auto' }}
            >
              {MARKER[link.id] ?? null}
            </span>
            <a
              href={link.href}
              rel={relFor(link)}
              style={{ overflowWrap: 'anywhere', minWidth: 0 }}
            >
              {link.label}
            </a>
            {link.note ? (
              <span className="text-[var(--text-faint)]">
                {renderNote(link.note)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {IDENTITY.status.length > 0 ? (
        <>
          <h3
            className="text-[var(--text-faint)]"
            style={{
              textTransform: 'uppercase',
              letterSpacing: 'var(--ls-caps)',
              marginTop: 'var(--sp-4)',
            }}
          >
            status
          </h3>
          {IDENTITY.status.map((line) => (
            <p key={line} style={{ margin: 0 }}>
              {line}
            </p>
          ))}
        </>
      ) : null}

      <pre
        style={{
          margin: 'var(--sp-3) 0 0',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
        }}
      >
        {IDENTITY.curlLines.map((line) => {
          const command = line.startsWith('$') ? line.slice(1).trim() : line
          return (
            <span key={line} style={{ display: 'block' }}>
              <span className="prompt" aria-hidden="true">
                ${' '}
              </span>
              {command}
            </span>
          )
        })}
      </pre>
    </Pane>
  )
}
