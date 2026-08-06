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
.kw-clog table{width:100%;border-collapse:collapse;font-size:var(--fs-micro);}
.kw-clog th,.kw-clog td{text-align:left;vertical-align:top;padding:var(--sp-1,6px) var(--sp-2,10px);border-bottom:1px solid var(--bg2);}
.kw-clog thead th{color:var(--text-faint);font-weight:var(--fw-black);letter-spacing:var(--ls-caps);text-transform:uppercase;white-space:nowrap;}
.kw-clog td.kw-clog-org{font-weight:var(--fw-bold,700);white-space:nowrap;}
.kw-clog td.kw-clog-role{color:var(--text-body);}
.kw-clog td.kw-clog-years{color:var(--text-faint);white-space:nowrap;}
.kw-clog td.kw-clog-stack{color:var(--text-muted);}
.kw-clog tbody tr:last-child td{border-bottom:0;}
@media (max-width:720px){
  .kw-clog thead{display:none;}
  .kw-clog td{display:block;border:0;padding:2px 0;}
  .kw-clog tr{border-bottom:1px solid var(--bg2);padding:var(--sp-2,10px) 0;display:block;}
  .kw-clog tr:last-child{border-bottom:0;}
  .kw-clog td.kw-clog-org{font-size:var(--fs-mono);}
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
 * Renders the ordered career history as a git-log style table with
 * organization, description, dates, and languages columns.
 *
 * @param props - Ordered career rows and optional labelling overrides.
 * @returns Static role rows; no disclosure controls.
 */
export function CommitLog({
  commits,
  labelledBy,
  className,
}: CommitLogProps): ReactNode {
  const rootClassName = ['kw-clog', className].filter(Boolean).join(' ')
  return (
    <div className={rootClassName}>
      <style href="kw-commit-log" precedence="medium">
        {COMMIT_LOG_CSS}
      </style>
      <table aria-labelledby={labelledBy}>
        <thead>
          <tr>
            <th scope="col">organization</th>
            <th scope="col">description</th>
            <th scope="col">dates</th>
            <th scope="col">languages</th>
          </tr>
        </thead>
        <tbody>
          {commits.map((commit) => (
            <tr key={commit.hash}>
              <td className="kw-clog-org" style={{ color: HUE_VAR[commit.hue] }}>
                {organization(commit)}
              </td>
              <td className="kw-clog-role">
                {role(commit)}
                {commit.detail ? <div>{commit.detail}</div> : null}
              </td>
              <td className="kw-clog-years">{commit.years}</td>
              <td className="kw-clog-stack">{commit.stack.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function organization(commit: CareerCommit): string {
  const before = commit.title.split('/')[0]
  return (before ?? commit.title).trim()
}

function role(commit: CareerCommit): string {
  const after = commit.title.indexOf('/')
  return after < 0 ? commit.title : commit.title.slice(after + 1).trim()
}
