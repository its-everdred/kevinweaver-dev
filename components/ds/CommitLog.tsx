import type { CSSProperties, ReactNode } from 'react'
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

const TRUNK_LANES = new Set<CareerCommit['lane']>(['main', 'role'])

class InvalidCareerLogError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCareerLogError'
  }
}

const COMMIT_LOG_CSS = `
.kw-clog { --cl-graph-w: 1.125rem; --cl-marker-w: 0.9em; display: flex; flex-direction: column; }
.kw-clog-rows { list-style: none; margin: 0; padding-left: var(--cl-marker-w); }
.kw-clog-rows > li { list-style: none; }
.kw-clog summary { cursor: pointer; list-style: none; position: relative; }
.kw-clog summary::-webkit-details-marker { display: none; }
.kw-clog summary::before {
  border-bottom: .28em solid transparent;
  border-left: .35em solid currentColor;
  border-top: .28em solid transparent;
  content: '';
  height: 0;
  left: calc(-1 * var(--cl-marker-w));
  opacity: .6;
  position: absolute;
  top: .45em;
  width: 0;
}
.kw-clog details[open] > summary::before { transform: rotate(90deg); }
.kw-clog .commit .graph {
  display: grid;
  flex: 0 0 calc(var(--cl-graph-w) * var(--cl-lane-count, 1));
  grid-auto-columns: var(--cl-graph-w);
  grid-auto-flow: column;
  text-align: center;
}
.kw-clog .rail {
  border-left: 0;
  display: grid;
  grid-auto-columns: var(--cl-graph-w);
  grid-auto-flow: column;
  height: clamp(14px, 1.25rem, 20px);
  margin-left: 0;
}
.kw-clog .rail > i[data-kw-rule] {
  border-left: var(--bw-pane, 2px) solid var(--border-pane);
  margin-left: calc(var(--cl-graph-w) / 2 - var(--bw-pane, 2px) / 2);
}
.kw-clog .ctitle { color: var(--text-strong); font-weight: var(--fw-bold, 700); }
.kw-clog .cstack {
  color: var(--text-faint);
  display: flex;
  flex-wrap: wrap;
  font-size: var(--fs-micro);
  gap: var(--sp-1, 6px);
  list-style: none;
  margin: 0;
  padding: 0;
}
.kw-clog .cbody {
  color: var(--text-muted);
  font: inherit;
  margin: 0;
  overflow-wrap: anywhere;
  padding: var(--sp-1, 6px) 0 var(--sp-1, 6px) calc(var(--cl-graph-w) * var(--cl-lane-count, 1) + var(--sp-2, 14px));
  white-space: pre-wrap;
}
@media (min-width: 721px) {
  .kw-clog-fold > summary { display: none; }
  .kw-clog-fold::details-content { block-size: auto; content-visibility: visible; }
  /* The desktop flex row inherits fixed bases from the DS (.hash 132px,
     .cyear 96px, .ref auto, gap 24px). Without min-width:0 the message track
     cannot shrink below its content, so between 721px and ~1090px it overflowed
     a pane whose overflow-x is hidden — measured at 768px, scrollWidth 670 vs
     clientWidth 443, silently clipping the current role by 222px. */
  .kw-clog .commit .cmsg { min-width: 0; }
  .kw-clog .commit .ref { min-width: 0; overflow-wrap: anywhere; }
}
@media (max-width: 720px) {
  .kw-clog .commit {
    align-items: baseline;
    display: grid;
    gap: 2px var(--sp-1, 6px);
    grid-template-areas: 'graph hash year' 'ref ref ref' 'msg msg msg';
    grid-template-columns: auto auto 1fr;
  }
  .kw-clog .commit .graph { grid-area: graph; }
  .kw-clog .commit .hash { flex: none; grid-area: hash; }
  .kw-clog .commit .cyear { flex: none; grid-area: year; margin-left: auto; }
  .kw-clog .commit .ref,
  .kw-clog .commit .cmsg { padding-left: calc(var(--cl-graph-w) * var(--cl-lane-count, 1) + var(--sp-1, 6px)); }
  .kw-clog .commit .ref { grid-area: ref; }
  .kw-clog .commit .cmsg { grid-area: msg; }
  .kw-clog .rail { height: 12px; }
}
`

export interface CommitLogProps {
  /** Newest first. The renderer preserves the supplied order. */
  readonly commits: readonly CareerCommit[]
  /** Id of the heading that names the ordered career history. */
  readonly labelledBy?: string
  /** Summary text for the pre-web3 disclosure. */
  readonly foldSummary?: string
  /** Appended to the primitive's root class name. */
  readonly className?: string
}

/** Graph column for a lane. Zero is the trunk and one is the branch lane. */
export type LaneColumn = 0 | 1

export interface GraphRow {
  readonly commit: CareerCommit
  readonly column: LaneColumn
  readonly glyph: '●' | '◆' | '•'
  readonly railColumns: readonly LaneColumn[]
  readonly hasRail: boolean
}

export interface GraphModel {
  readonly rows: readonly GraphRow[]
  readonly columnCount: 1 | 2
  readonly foldFrom: number
}

/** Returns the graph column assigned to a content lane. */
function columnForLane(lane: CareerCommit['lane']): LaneColumn {
  return TRUNK_LANES.has(lane) ? 0 : 1
}

/** Validates that compacted rows occupy one suffix of the supplied log. */
function getFoldFrom(commits: readonly CareerCommit[]): number {
  const foldFrom = commits.findIndex((commit) => commit.preWeb3)
  if (foldFrom === -1) return commits.length

  if (commits.slice(foldFrom).some((commit) => !commit.preWeb3)) {
    throw new InvalidCareerLogError(
      'CommitLog: preWeb3 rows must form a contiguous suffix'
    )
  }

  return foldFrom
}

/** Records the first and final row index owned by every career lane. */
function buildLaneSpans(
  commits: readonly CareerCommit[]
): ReadonlyMap<CareerCommit['lane'], readonly [number, number]> {
  const spans = new Map<CareerCommit['lane'], readonly [number, number]>()
  commits.forEach((commit, index) => {
    const existing = spans.get(commit.lane)
    spans.set(commit.lane, existing ? [existing[0], index] : [index, index])
  })
  return spans
}

/** Lists the active graph columns between one row and the one below it. */
function getRailColumns(
  index: number,
  spans: ReadonlyMap<CareerCommit['lane'], readonly [number, number]>
): readonly LaneColumn[] {
  const columns = new Set<LaneColumn>()
  for (const [lane, [first, last]] of spans) {
    if (first <= index && last >= index + 1) columns.add(columnForLane(lane))
  }
  return [...columns].sort()
}

/**
 * Builds the lane and rail geometry without reading the DOM or rendering React.
 *
 * @param commits - Career rows ordered newest first.
 * @returns A render-ready graph model with fold and rail data.
 * @throws When the supplied chronology lacks a root or has a noncontiguous fold.
 */
export function buildGraph(commits: readonly CareerCommit[]): GraphModel {
  const root = commits.at(-1)
  if (!root)
    throw new InvalidCareerLogError('CommitLog: commits must not be empty')
  if (!root.root)
    throw new InvalidCareerLogError(
      'CommitLog: the last commit must carry root: true'
    )

  const foldFrom = getFoldFrom(commits)
  const spans = buildLaneSpans(commits)
  const rows = commits.map((commit, index) => {
    const column = columnForLane(commit.lane)
    const hasRail = index < commits.length - 1
    const glyph: GraphRow['glyph'] = commit.root
      ? '•'
      : column === 1
        ? '◆'
        : '●'

    return {
      commit,
      column,
      glyph,
      hasRail,
      railColumns: hasRail ? getRailColumns(index, spans) : [],
    }
  })
  const columnCount: 1 | 2 = rows.some((row) => row.column === 1) ? 2 : 1

  return { rows, columnCount, foldFrom }
}

/** Renders a static, native-disclosure view of a career commit. */
function CommitRow({
  row,
  columnCount,
}: {
  readonly row: GraphRow
  readonly columnCount: 1 | 2
}) {
  const { commit } = row

  return (
    <li>
      <details
        data-kw-commit={commit.hash}
        data-kw-root={commit.root || undefined}
      >
        <summary>
          <div className="commit">
            <span aria-hidden="true" className="graph">
              {[0, 1].slice(0, columnCount).map((lane) => (
                <i
                  data-kw-lane={lane}
                  key={lane}
                  style={{
                    color:
                      row.column === lane ? HUE_VAR[commit.hue] : undefined,
                  }}
                >
                  {row.column === lane ? row.glyph : null}
                </i>
              ))}
            </span>
            <span className="hash" style={{ color: HUE_VAR[commit.hue] }}>
              {commit.hash}
            </span>
            {commit.ref ? <span className="ref">{commit.ref}</span> : null}
            {commit.root ? <span className="sr-only">root commit</span> : null}
            <span className="cyear">{commit.years}</span>
            <span className="cmsg">
              <span className="ctitle">{commit.title}</span> — {commit.detail}
            </span>
          </div>
          {commit.stack.length > 0 ? (
            <ul aria-label="stack" className="cstack">
              {commit.stack.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </summary>
        <pre className="cbody">{commit.body.join('\n')}</pre>
      </details>
      {row.hasRail ? (
        <div aria-hidden="true" className="rail" data-kw-rail>
          {row.railColumns.map((column) => (
            <i data-kw-rule={column} key={column} />
          ))}
        </div>
      ) : null}
    </li>
  )
}

/**
 * Renders the native, zero-client-JavaScript career git log.
 *
 * @param props - Ordered career rows and optional labelling overrides.
 * @returns Static commit rows with native disclosure controls.
 */
export function CommitLog({
  commits,
  labelledBy,
  foldSummary,
  className,
}: CommitLogProps): ReactNode {
  const graph = buildGraph(commits)
  const visibleRows = graph.rows.slice(0, graph.foldFrom)
  const foldedRows = graph.rows.slice(graph.foldFrom)
  const style: CSSProperties & { readonly '--cl-lane-count': 1 | 2 } = {
    '--cl-lane-count': graph.columnCount,
  }
  const rootClassName = ['kw-clog', className].filter(Boolean).join(' ')
  const summary = foldSummary ?? `\u2026 ${foldedRows.length} more commits`

  return (
    <div className={rootClassName} style={style}>
      <style href="kw-commit-log" precedence="medium">
        {COMMIT_LOG_CSS}
      </style>
      <ol aria-labelledby={labelledBy} className="kw-clog-rows">
        {visibleRows.map((row) => (
          <CommitRow
            columnCount={graph.columnCount}
            key={row.commit.hash}
            row={row}
          />
        ))}
      </ol>
      {/* The fold is `open` by default so the four earliest roles are never
          hidden. Desktop hides the summary and ::details-content keeps it
          expanded; on mobile the summary is visible so it can be collapsed.
          Relying on ::details-content alone left Stitch Fix, EMS Heroes, Omni
          Developers and Rowan invisible with no toggle on Chrome <131,
          Safari <18.4 and Firefox <139. */}
      {foldedRows.length > 0 ? (
        <details className="kw-clog-fold" data-kw-fold open>
          <summary>{summary}</summary>
          <ol
            aria-label="earlier commits"
            className="kw-clog-rows"
            start={graph.foldFrom + 1}
          >
            {foldedRows.map((row) => (
              <CommitRow
                columnCount={graph.columnCount}
                key={row.commit.hash}
                row={row}
              />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}
