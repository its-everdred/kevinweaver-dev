import type { ReactNode } from 'react'
import type { CareerCommit, LogHue } from '@/content/career-log'

const HUE_VAR: Record<LogHue, string> = {
  red: 'var(--red)',
  orange: 'var(--orange)',
  yellow: 'var(--yellow)',
  green: 'var(--green)',
  aqua: 'var(--aqua)',
  blue: 'var(--blue)',
  purple: 'var(--purple)',
  fg4: 'var(--fg4)',
}

const COMMIT_LOG_CSS = `
.kw-clog{list-style:none;margin:0;padding:0;font-family:var(--mono);font-size:var(--fs-mono);line-height:1.45;color:var(--text-body);}
.kw-clog .role{margin:0;white-space:nowrap;}
.kw-clog .org{color:var(--text-strong);font-weight:var(--fw-bold,700);}
.kw-clog .years{color:var(--text-faint);}
.kw-clog .entry{display:flex;flex-direction:column;gap:2px;padding:var(--sp-2,10px) 0;border-bottom:1px solid var(--bg2);}
.kw-clog .entry:last-child{border-bottom:0;}
@media (max-width:720px){
  .kw-clog .role{white-space:normal;}
}
`

export interface CommitLogProps {
  /** Newest first. The renderer preserves the supplied order. */
  readonly commits: readonly CareerCommit[]
  /** Id of the heading that names the ordered career history. */
  readonly labelledBy?: string
  /** Appended to the primitive's root class name. */
  readonly className?: string
}

/**
 * Renders the ordered career history as a git-log style list: each role is one
 * entry with the organization/title line followed by its date range line.
 *
 * @param props - Ordered career rows and optional labelling overrides.
 * @returns Static role entries; no disclosure controls.
 */
export function CommitLog({
  commits,
  labelledBy,
  className,
}: CommitLogProps): ReactNode {
  const rootClassName = ['kw-clog', className].filter(Boolean).join(' ')
  return (
    <ul aria-labelledby={labelledBy} className={rootClassName}>
      <style href="kw-commit-log" precedence="medium">
        {COMMIT_LOG_CSS}
      </style>
      {commits.map((commit) => (
        <li className="entry" key={commit.hash}>
          <p className="role">
            <span className="org" style={{ color: HUE_VAR[commit.hue] }}>
              {commit.title.split('/')[0]}
            </span>
            {title(commit)}
          </p>
          <p className="years">{commit.years}</p>
        </li>
      ))}
    </ul>
  )
}

function title(commit: CareerCommit): string {
  const after = commit.title.indexOf('/')
  return after < 0 ? '' : ` / ${commit.title.slice(after + 1).trim()}`
}
