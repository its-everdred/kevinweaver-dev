import type { UniverseEvent, UniverseRepoInput } from './buildUniverse'
import type { UniverseActor } from './types'

/**
 * The `private` repo is synthesized, not observed.
 *
 * The contribution calendar counts a day green for pull requests, issues,
 * reviews, and work in repositories that were never cloned, so most green days
 * name nothing the file history can place: of the payload's 1193 green days,
 * 847 carry no file event at all. Those days drew no beam and resolved no
 * contributor node, which is the `kw` marker disappearing mid-playback while
 * the contribution graph underneath it still showed colour.
 *
 * This module gives those days somewhere to point. What is real: which days
 * were green, how much each one counted, and which actor it counted for. What
 * is invented: every star. A star here means "one of that day's contributions
 * landed somewhere"; it does not name a file, a repo, or a commit, and nothing
 * downstream should be read as though it does. The paths say `unplaced/` and
 * are drawn from a fixed pool rather than minted per contribution, so the repo
 * stays the size of a large real one instead of dwarfing the whole disc.
 *
 * Private work is part of this rather than separate from it, which is why the
 * monthly `grid.privateMonthly` totals are no longer synthesized on their own.
 * They are a subset of the daily calendar, not an addition to it: in the
 * payload no month's private total exceeds that month's calendar total, and
 * the earliest months match it exactly. Standing them up separately counted
 * the same contributions twice and, worse, spread them evenly across days the
 * calendar left grey, so 537 days drew beams the contribution graph denied.
 */

/**
 * Reserved id for the synthesized repo. Payload repo ids are indices into
 * `repos.json` and are never negative, so this cannot collide with a real repo
 * however many the payload grows to.
 */
export const PRIVATE_REPO_ID = -1
/** Name the synthesized repo carries wherever a repo name is shown. */
export const PRIVATE_REPO_NAME = 'private'

/**
 * Distinct paths the synthesized repo may ever name, and so its star ceiling.
 * The pool is bounded rather than grown per contribution because a fresh path
 * each time would be some 22,000 stars, three times the largest real repo in
 * the payload; 512 places it seventh, a large galaxy among large galaxies.
 */
export const PRIVATE_PATH_POOL = 512
/**
 * Most stars one synthesized day may light. Days the history can place touch
 * 18 files at the median and 79 at the upper quartile, so this sits between
 * the two: high enough that a busy day reads as busy, low enough that the
 * payload's busiest green day cannot ask for more beams than a step may draw.
 */
export const MAX_PRIVATE_DAY_FILES = 48

/**
 * Files a day touches per calendar contribution, measured over the 346 days
 * the payload can both count and place. A day's multiplier is interpolated
 * across these quartiles, so half of the synthesized days sit below the median
 * and the band as a whole matches the days the history can vouch for.
 */
const RATIO_LOW = 2
const RATIO_MEDIAN = 5
const RATIO_HIGH = 15
/** Both actors, in the order `grid.human` and `grid.agent` are read. */
const ACTORS: readonly UniverseActor[] = [0, 1]
/** Distinct salts keep a day's size and its slice of the pool independent. */
const SIZE_SALT = 0x5f356495
const SLOT_SALT = 0x27d4eb2d
const UINT32 = 4_294_967_296

/** The daily calendar, and which of its days the file history already places. */
export interface PrivateVolume {
  /**
   * Human contributions per timeline step, oldest step first. The calendar is
   * indexed from the oldest day, so an entry's index IS its step, where a
   * bundle event instead counts its day back from the newest.
   */
  readonly human: readonly number[]
  /** Agent contributions per timeline step, indexed the same way. */
  readonly agent: readonly number[]
  /** Steps that already carry real file events, and so need nothing invented. */
  readonly covered: ReadonlySet<number>
  /** Timeline length in steps; one step is one day. */
  readonly stepCount: number
}

/** The synthesized repo and the events that place its stars on the timeline. */
export interface PrivateRepo {
  readonly repo: UniverseRepoInput
  readonly events: readonly UniverseEvent[]
}

/**
 * @description Synthesizes one ordinary-looking repo from the green days the
 * file history cannot place, so every day the contribution graph colours in
 * also fires beams instead of leaving the galaxy silent and the contributor
 * node unresolved. Everything downstream (layout, stars, labels, beams,
 * hit-testing, the repo pane) then treats it as any other repo, with no
 * special case.
 * @param volume The daily calendar and the steps already covered by events.
 * @returns The repo and its events, or undefined when nothing is unplaced.
 */
export function privateRepo(volume: PrivateVolume): PrivateRepo | undefined {
  const events: UniverseEvent[] = []
  for (let step = 0; step < volume.stepCount; step++) {
    if (volume.covered.has(step)) continue
    for (const actor of ACTORS)
      appendDay(events, step, actor, series(volume, actor)[step] ?? 0)
  }
  if (events.length === 0) return undefined
  return { repo: { id: PRIVATE_REPO_ID, name: PRIVATE_REPO_NAME }, events }
}

/**
 * @description Sorts the synthesized repo ahead of every real one, which is
 * what puts it at ordinal 0 and so at the disc's core. Radius encodes recency
 * everywhere else, so this is a deliberate exception, stated here rather than
 * left to emerge from whichever day unplaced work last landed on.
 * @param repoId The repo being ordered.
 * @returns 0 for the private repo, 1 for every real one.
 */
export function corePin(repoId: number): number {
  return repoId === PRIVATE_REPO_ID ? 0 : 1
}

/** The calendar series an actor is counted in. */
function series(volume: PrivateVolume, actor: UniverseActor): readonly number[] {
  return actor === 0 ? volume.human : volume.agent
}

/**
 * @description Appends one day's stand-in contributions for one actor. The
 * stars are consecutive slots of the shared pool from a hashed starting point,
 * so a day lights a scattered handful of the repo rather than the same corner
 * every time, and no day can mint a star the pool does not already hold.
 */
function appendDay(
  events: UniverseEvent[],
  step: number,
  actor: UniverseActor,
  counted: number
): void {
  if (counted <= 0) return
  const files = dayFiles(counted, step, actor)
  const offset = mix(step, SLOT_SALT + actor) % PRIVATE_PATH_POOL
  for (let index = 0; index < files; index++)
    events.push({
      repo: PRIVATE_REPO_ID,
      path: slotPath((offset + index) % PRIVATE_PATH_POOL),
      step,
      actor,
    })
}

/**
 * @description How many stars one day lights: its calendar count times a
 * multiplier drawn from the measured quartile band. The operator asked for a
 * random amount in a reasonable range, but the renders are screenshot tested,
 * so the draw is a hash of the day rather than actual randomness.
 */
function dayFiles(counted: number, step: number, actor: UniverseActor): number {
  const fraction = mix(step, SIZE_SALT + actor) / UINT32
  const ratio =
    fraction < 0.5
      ? RATIO_LOW + (RATIO_MEDIAN - RATIO_LOW) * fraction * 2
      : RATIO_MEDIAN + (RATIO_HIGH - RATIO_MEDIAN) * (fraction - 0.5) * 2
  return Math.min(MAX_PRIVATE_DAY_FILES, Math.max(1, Math.round(counted * ratio)))
}

/**
 * @description Names one synthesized star. Deliberately not file-shaped: it
 * carries only its slot in the pool, because a name like `src/index.ts` would
 * claim knowledge of what these days touched that no part of the payload has.
 */
function slotPath(slot: number): string {
  return `unplaced/${String(slot + 1).padStart(3, '0')}`
}

/**
 * @description Deterministic 32-bit mix of one step, so the same payload
 * places the same stars on every build. Consecutive steps have to scatter, not
 * drift, or a run of days would climb through the band together.
 */
function mix(step: number, salt: number): number {
  let hash = Math.imul(step ^ salt, 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return (hash ^ (hash >>> 16)) >>> 0
}
