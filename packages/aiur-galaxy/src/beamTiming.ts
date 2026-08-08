/**
 * When each of a day's beams is drawn, and how much of it. This used to sit
 * beside the contributor node's own move, on the grounds that a beam is
 * measured from the node and the two were one transition; they are not any
 * more. A node now crosses the whole slot without pausing, while a beam leaves
 * at its own moment, stands lit briefly, and is gone well before the day is,
 * so the two run on different clocks and are stated apart.
 */

/** How long a beam takes to travel from its node to its star, in milliseconds. */
export const BEAM_EXTEND_MS = 120
/** How long it stands at full length once it arrives, in milliseconds. */
export const BEAM_HOLD_MS = 200
/**
 * How far apart the day's earliest and latest beam start, in milliseconds. The
 * beams of one day used to grow, hold, and retract in lockstep, which made the
 * disc a solid fan of lines for most of the second; scattering their starts
 * over half the slot makes them read as strikes arriving one after another.
 * The whole of a beam's life still fits inside the day: the last one to start
 * is drawn back into its node before the next day opens.
 */
export const BEAM_STAGGER_MS = 480
/** Start to finish for one beam: out, lit, and back in again. */
const BEAM_LIFE_MS = BEAM_EXTEND_MS * 2 + BEAM_HOLD_MS
/**
 * Fractional part of the golden ratio. Stepping round the unit interval by it
 * is the lowest-discrepancy sequence there is, so consecutive beams land far
 * apart and any prefix of them covers the stagger window evenly. A random
 * offset would do the same job and cost the renders their determinism.
 */
const BEAM_SPACING = 0.618033988749895

/**
 * @description Where in the stagger window a beam starts, so a day's lines hit
 * their stars at their own moments rather than all at once.
 * @param beam The beam's index among the beams the day draws, which is the only
 * identity it has and the same one on every frame of that day.
 * @returns A fraction in [0, 1) of `BEAM_STAGGER_MS`.
 */
export function beamOffset(beam: number): number {
  const step = beam * BEAM_SPACING
  return step - Math.floor(step)
}

/**
 * @description How much of the way from its contributor node toward its star a
 * beam is drawn. A beam grows out of its node at its own moment in the day,
 * stands lit briefly, and is drawn back in, so the disc reads as a scatter of
 * strikes instead of a fan that stands open for the whole second.
 * @param sinceMs Milliseconds since the day being drawn became the current one.
 * @param beam The beam's index among the day's beams.
 * @param animated Whether a day's change may be drawn at all.
 * @returns A fraction in [0, 1]; always 1 when nothing may animate, so a
 * paused or reduced-motion frame shows the day's work whole.
 */
export function beamReach(
  sinceMs: number,
  beam: number,
  animated: boolean
): number {
  if (!animated) return 1
  const since = sinceMs - beamOffset(beam) * BEAM_STAGGER_MS
  return Math.max(
    0,
    Math.min(1, since / BEAM_EXTEND_MS, (BEAM_LIFE_MS - since) / BEAM_EXTEND_MS)
  )
}
