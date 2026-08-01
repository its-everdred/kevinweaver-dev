import { NAV_SECTIONS, REGION_META, type HeaderProps } from './_contract'

const META = REGION_META.header

/** Renders the site banner and static header navigation skeleton. */
export function Header({ id, className, style }: HeaderProps) {
  const headerClassName = ['kw-header', className].filter(Boolean).join(' ')

  return (
    <header
      aria-labelledby={META.titleId}
      className={headerClassName}
      id={id}
      style={style}
    >
      <h2 className="sr-only" id={META.titleId}>
        {META.accessibleName}
      </h2>
      <span>kevinweaver.dev</span>
      <nav aria-label="Primary navigation">
        {NAV_SECTIONS.map(({ index, id: sectionId, label }) => (
          <a href={`#${sectionId}`} key={sectionId}>
            <i aria-hidden="true">{index}</i>
            {label}
          </a>
        ))}
      </nav>
    </header>
  )
}
