import { Pane } from '@/components/ds/Pane'
import {
  MAN_ABRIDGED_HINT,
  MAN_FOOTER,
  MAN_HEADER,
  MAN_PAGE,
  MAN_WRAP_COLUMNS,
  type ManBlock,
  type ManSection,
} from '@/content/manpage'
import { IDENTITY, type FingerField } from '@/content/identity'
import { fill } from '@/content/boot'
import { REGION_META, type ManPageProps } from './_contract'

const META = REGION_META.manPage
const WHOAMI_TITLE_ID = 'region-man-page-whoami-title'
const PAGER_TITLE_ID = 'region-man-page-pager-title'

/**
 * Roff footer revision date, evaluated once when the module loads.
 */
const REVISION_DATE = new Date().toISOString().slice(0, 10)
const FOOTER_CENTER = fill(MAN_FOOTER.center, { date: REVISION_DATE })

const KW_MAN_CSS = `
.kw-man{display:flex;flex-direction:column;gap:var(--pane-gap);min-width:0;}
.kw-man-whoami{flex:0 0 auto;}
.kw-man-pane{flex:1 1 auto;min-width:0;min-height:0;}
.kw-man-body{min-width:0;}
.kw-man-doc{padding:var(--pane-pad);min-width:${MAN_WRAP_COLUMNS}ch;font-family:var(--mono);
  font-size:var(--fs-mono);line-height:var(--lh-code);color:var(--text-muted);}
.kw-man-sh{font-size:var(--fs-mono);line-height:var(--lh-code);color:var(--text-muted);}
.kw-man-cmd,.kw-man-out,.kw-man-b,.kw-man-dt,.kw-man-dd,.kw-man-pre,.kw-man-chrome{white-space:pre;}
.kw-man-h{margin:1.4em 0 .35em;font-size:var(--fs-micro);font-weight:var(--fw-black);
  letter-spacing:var(--ls-caps);color:var(--text-faint);}
.kw-man-sec:first-of-type .kw-man-h{margin-top:0;}
.kw-man-b{margin:0 0 .8em;}
.kw-man-dl{margin:0;}
.kw-man-dt{margin:0;padding-left:7ch;color:var(--text-body);font-weight:var(--fw-semibold);}
.kw-man-dd{margin:0 0 .8em;}
.kw-man-pre{margin:0;font:inherit;}
.kw-man-cmd{margin:.9em 0 0;color:var(--text-faint);}
.kw-man-sh>.kw-man-cmd:first-child{margin-top:0;}
.kw-man-out{margin:0;}
.kw-man-finger{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 2ch;margin:0;}
.kw-man-ff{display:flex;gap:1ch;min-width:0;}
.kw-man-ff dt{color:var(--text-faint);}
.kw-man-ff dd{margin:0;min-width:0;}
.kw-man-chrome{display:flex;gap:2ch;margin:0 0 1.2em;color:var(--text-faint);}
.kw-man-chrome>:nth-child(2){flex:1 1 auto;text-align:center;}
.kw-man-doc>.kw-man-chrome:last-of-type{margin:1.6em 0 0;}
.kw-man-hint{display:none;margin:1.2em 0 0;padding-left:7ch;color:var(--text-faint);}
@media (max-width:1080px){
  .kw-man-full{display:none;}
  .kw-man-hint{display:block;}
}
`

/** Renders the identity and manual-page region. */
export function ManPage({ id, className, style }: ManPageProps) {
  return (
    <section
      aria-labelledby={META.titleId}
      className={['kw-man', className].filter(Boolean).join(' ')}
      id={id}
      style={style}
    >
      <style href="kw-man" precedence="region">
        {KW_MAN_CSS}
      </style>
      <h2 className="sr-only" id={META.titleId}>
        {META.accessibleName}
      </h2>
      <WhoamiPane />
      <ManPagerPane />
    </section>
  )
}

function chunkPairs(
  fields: readonly FingerField[]
): ReadonlyArray<readonly FingerField[]> {
  return Array.from({ length: Math.ceil(fields.length / 2) }, (_, index) =>
    fields.slice(index * 2, index * 2 + 2)
  )
}

function WhoamiPane() {
  const fingerRows = chunkPairs(IDENTITY.finger)
  return (
    <Pane
      as="article"
      className="kw-man-whoami"
      labelledBy={WHOAMI_TITLE_ID}
      title="whoami"
      titleAs="h3"
      titleId={WHOAMI_TITLE_ID}
    >
      <div className="kw-man-sh">
        <p className="kw-man-cmd">
          <span className="prompt">$</span> whoami
        </p>
        <p className="kw-man-out">{IDENTITY.whoami}</p>
        <p className="kw-man-cmd">
          <span className="prompt">$</span> id
        </p>
        <p className="kw-man-out">{IDENTITY.idLines.join('\n')}</p>
        <p className="kw-man-cmd">
          <span className="prompt">$</span> finger -l {IDENTITY.whoami}
        </p>
        <dl className="kw-man-finger">
          {fingerRows.map((row) =>
            row.map((field) => (
              <div className="kw-man-ff" key={field.label}>
                <dt>{field.label}:</dt>
                <dd>{field.value}</dd>
              </div>
            ))
          )}
        </dl>
        <p className="kw-man-cmd">Project:</p>
        <p className="kw-man-out">{IDENTITY.project.join('\n')}</p>
        <p className="kw-man-cmd">Plan:</p>
        <p className="kw-man-out">{IDENTITY.plan.join('\n')}</p>
      </div>
    </Pane>
  )
}

function ManPagerPane() {
  return (
    <Pane
      as="article"
      bodyClassName="kw-man-body"
      bodyStyle={{ overflow: 'auto', padding: 0 }}
      className="kw-man-pane"
      labelledBy={PAGER_TITLE_ID}
      right={<span className="dim">{MAN_HEADER.right}</span>}
      title="man kevinweaver(1)"
      titleAs="h3"
      titleId={PAGER_TITLE_ID}
    >
      <article
        aria-labelledby={PAGER_TITLE_ID}
        className="kw-man-doc"
        tabIndex={0}
      >
        <p className="kw-man-chrome">
          <span>{MAN_HEADER.left}</span>
          <span>{MAN_HEADER.center}</span>
          <span>{MAN_HEADER.right}</span>
        </p>
        {MAN_PAGE.map((section) => (
          <ManSectionView key={section.id} section={section} />
        ))}
        <p className="kw-man-chrome">
          <span>{MAN_FOOTER.left}</span>
          <span>{FOOTER_CENTER}</span>
          <span>{MAN_FOOTER.right}</span>
        </p>
        <p className="kw-man-hint">{MAN_ABRIDGED_HINT}</p>
      </article>
    </Pane>
  )
}

function sectionSlug(id: ManSection['id']): string {
  return `man-${id.toLowerCase().replace(/ /g, '-')}`
}

function ManSectionView({ section }: { section: ManSection }) {
  const headingId = `${sectionSlug(section.id)}-h`
  return (
    <section
      aria-labelledby={headingId}
      className={section.abridged ? 'kw-man-sec' : 'kw-man-sec kw-man-full'}
    >
      <h3 className="kw-man-h" id={headingId}>
        {section.id}
      </h3>
      {section.blocks.map((block, index) => (
        <ManBlockView key={index} block={block} />
      ))}
    </section>
  )
}

function ManBlockView({ block }: { block: ManBlock }) {
  const body = block.lines.join('\n')
  const indent = { paddingLeft: `${block.indent}ch` }
  if (block.term === null) {
    return block.literal ? (
      <pre className="kw-man-pre" style={indent}>
        {body}
      </pre>
    ) : (
      <p className="kw-man-b" style={indent}>
        {body}
      </p>
    )
  }
  return (
    <dl className="kw-man-dl">
      <dt className="kw-man-dt">{block.term}</dt>
      <dd className="kw-man-dd" style={indent}>
        {block.literal ? <pre className="kw-man-pre">{body}</pre> : body}
      </dd>
    </dl>
  )
}
