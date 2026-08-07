import type { UniverseEvent, UniverseRepoInput } from './buildUniverse'

/**
 * The `private` repo is synthesized, not observed.
 *
 * Private contributions reach the payload as `grid.p`: one aggregate count per
 * calendar month, and nothing finer. There are no private events, no private
 * repo names, and no private file paths anywhere in the bundle, and none can be
 * derived from what is there, because GitHub does not publish them. So the
 * stars this module makes are volume, not file history. A star here means "one
 * private contribution happened this month"; it does not name a file, a repo,
 * or a commit, and nothing downstream should be read as though it does.
 *
 * What is real: the monthly totals, and therefore the repo's size and the days
 * that carry weight. What is invented: which day inside a month a contribution
 * landed on, and the identity of every star.
 */

/**
 * Reserved id for the synthesized repo. Payload repo ids are indices into
 * `repos.json` and are never negative, so this cannot collide with a real repo
 * however many the payload grows to.
 */
export const PRIVATE_REPO_ID = -1
/** Name the synthesized repo carries wherever a repo name is shown. */
export const PRIVATE_REPO_NAME = 'private'

/** Contributions are the human's: the payload carries no actor split for them. */
const PRIVATE_ACTOR = 0
const MS_PER_DAY = 86_400_000

/** The monthly private totals, and the timeline they are laid onto. */
export interface PrivateVolume {
  /** Private contribution counts, one per month, oldest month first. */
  readonly monthly: readonly number[]
  /** ISO month (`YYYY-MM`) that `monthly[0]` counts. */
  readonly startMonth: string
  /** ISO day (`YYYY-MM-DD`) of timeline step 0, the oldest day. */
  readonly windowStart: string
  /** Timeline length in steps; one step is one day. */
  readonly stepCount: number
}

/** The synthesized repo and the events that place its stars on the timeline. */
export interface PrivateRepo {
  readonly repo: UniverseRepoInput
  readonly events: readonly UniverseEvent[]
}

/**
 * @description Synthesizes one ordinary-looking repo from the monthly private
 * totals, so private work has a place in the disc instead of being silently
 * absent from a galaxy that claims to show a contribution history. Everything
 * downstream (layout, stars, labels, beams, hit-testing, the repo pane) then
 * treats it as any other repo, with no special case.
 * @param volume The monthly counts and the timeline to spread them over.
 * @returns The repo and its events, or undefined when there is no volume.
 */
export function privateRepo(volume: PrivateVolume): PrivateRepo | undefined {
  const events: UniverseEvent[] = []
  for (let index = 0; index < volume.monthly.length; index++) {
    const count = volume.monthly[index] ?? 0
    if (count > 0) appendMonth(events, volume, index, count)
  }
  if (events.length === 0) return undefined
  return { repo: { id: PRIVATE_REPO_ID, name: PRIVATE_REPO_NAME }, events }
}

/**
 * @description Sorts the synthesized repo ahead of every real one, which is
 * what puts it at ordinal 0 and so at the disc's core. Radius encodes recency
 * everywhere else, so this is a deliberate exception, stated here rather than
 * left to emerge from whichever month private work last landed in.
 * @param repoId The repo being ordered.
 * @returns 0 for the private repo, 1 for every real one.
 */
export function corePin(repoId: number): number {
  return repoId === PRIVATE_REPO_ID ? 0 : 1
}

/**
 * @description Spreads one month's count across that month's days and appends
 * one event per contribution. The running floor hands each day its share with
 * no accumulated rounding drift, so a month's whole count is placed and a month
 * quieter than it is long still spans the month rather than stacking on day one.
 * Contributions whose day falls outside the timeline are dropped, not clamped:
 * piling them onto the first or last step would invent a spike.
 */
function appendMonth(
  events: UniverseEvent[],
  volume: PrivateVolume,
  index: number,
  count: number
): void {
  const [year, month] = monthAt(volume.startMonth, index)
  const days = daysInMonth(year, month)
  const firstStep = stepOfDay(volume.windowStart, year, month)
  let placed = 0
  for (let day = 0; day < days; day++) {
    const through = Math.floor(((day + 1) * count) / days)
    const step = firstStep + day
    if (step >= 0 && step < volume.stepCount)
      for (let ordinal = placed; ordinal < through; ordinal++)
        events.push({
          repo: PRIVATE_REPO_ID,
          path: syntheticPath(year, month, ordinal),
          step,
          actor: PRIVATE_ACTOR,
        })
    placed = through
  }
}

/**
 * @description Names one synthesized star. Deliberately not file-shaped: it
 * carries the month it came from and its ordinal within that month, because
 * that is the whole of what the payload knows, and a name like `src/index.ts`
 * would claim knowledge of private files that does not exist.
 */
function syntheticPath(year: number, month: number, ordinal: number): string {
  return `${year}-${pad(month, 2)}/${pad(ordinal + 1, 3)}`
}

/** The calendar year and 1-based month `index` months after `startMonth`. */
function monthAt(startMonth: string, index: number): readonly [number, number] {
  const year = Number(startMonth.slice(0, 4))
  const total = Number(startMonth.slice(5, 7)) - 1 + index
  return [year + Math.floor(total / 12), (total % 12) + 1]
}

/** Days in a 1-based calendar month; day 0 of the next month is this one's last. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Timeline step of a month's first day, counted from the window's first day. */
function stepOfDay(windowStart: string, year: number, month: number): number {
  const start = Date.UTC(
    Number(windowStart.slice(0, 4)),
    Number(windowStart.slice(5, 7)) - 1,
    Number(windowStart.slice(8, 10))
  )
  return Math.round((Date.UTC(year, month - 1, 1) - start) / MS_PER_DAY)
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}
