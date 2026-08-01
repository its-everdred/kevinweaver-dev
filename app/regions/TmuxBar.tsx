import { REGION_META, type TmuxBarProps } from './_contract'

const META = REGION_META.tmuxBar

/** Renders placeholder chrome for the persistent status bar. */
export function TmuxBar({ id, className, style }: TmuxBarProps) {
  const footerClassName = ['tmux', className].filter(Boolean).join(' ')

  return (
    <footer
      aria-labelledby={META.titleId}
      className={footerClassName}
      id={id}
      style={style}
    >
      <h2 className="sr-only" id={META.titleId}>
        {META.accessibleName}
      </h2>
      <p className="ph">
        <span>status bar placeholder</span>
      </p>
    </footer>
  )
}
