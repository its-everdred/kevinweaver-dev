import { describe, expect, it } from 'vitest'

import { buildUniverse } from '../src/buildUniverse'
import {
  MAX_PRIVATE_DAY_FILES,
  PRIVATE_PATH_POOL,
  PRIVATE_REPO_ID,
  PRIVATE_REPO_NAME,
  privateRepo,
  type PrivateVolume,
} from '../src/privateRepo'

/**
 * A ten-day calendar held oldest day first, so an entry's index IS its
 * timeline step. Steps 1, 2, 3, 5, and 7 are green; steps 2 and 3 already
 * carry real file events. Step 1 is the human's alone, step 5 the agent's
 * alone, and step 7 both, because the calendar splits by actor and so must the
 * beams. The green days sit off center so a step counted from the wrong end of
 * the window lands somewhere the assertions notice.
 */
const VOLUME: PrivateVolume = {
  human: [0, 4, 9, 0, 0, 0, 0, 6, 0, 0],
  agent: [0, 0, 0, 3, 0, 5, 0, 2, 0, 0],
  covered: new Set([2, 3]),
  stepCount: 10,
}
/** Green steps the event history cannot place, and so the ones synthesized. */
const UNPLACED = [1, 5, 7]
/** Green steps the event history already places, and so leaves untouched. */
const PLACED = [2, 3]
/**
 * Files a day touches per calendar contribution, measured over the 346 days
 * the payload can both count and place: lower quartile 2, median 5, upper 15.
 */
const RATIO = { low: 2, high: 15 }

function eventsOf(volume: PrivateVolume): readonly {
  readonly step: number
  readonly path: string
  readonly actor: number
  readonly repo: number
}[] {
  return privateRepo(volume)?.events ?? []
}

function stepsOf(volume: PrivateVolume): number[] {
  return eventsOf(volume).map((event) => event.step)
}

function flat(count: number, length: number): number[] {
  return Array.from({ length }, () => count)
}

describe('privateRepo', () => {
  it('lights every green day the event history cannot place', () => {
    // The bug: 847 of the payload's 1193 green days carry no file event at
    // all, so the contribution graph showed colour while the galaxy drew no
    // beam and resolved no contributor node, and the `kw` marker vanished.
    const lit = [...new Set(stepsOf(VOLUME))].sort((a, b) => a - b)
    expect(lit).toEqual(UNPLACED)
  })

  it('leaves a day the event history already places alone', () => {
    // Those days already draw their own beams; a second, invented set of them
    // would double the day and say the galaxy knows more than it does.
    for (const step of PLACED) expect(stepsOf(VOLUME)).not.toContain(step)
  })

  it('leaves a grey day dark', () => {
    for (const step of stepsOf(VOLUME))
      expect((VOLUME.human[step] ?? 0) + (VOLUME.agent[step] ?? 0)).toBeGreaterThan(0)
  })

  it('reads the calendar from the oldest day, the way a step counts', () => {
    // `grid.human[i]` is indexed from the oldest day, so `i` IS the step,
    // while a bundle event counts its day back from the newest. Reading the
    // calendar from the wrong end would put every beam on a mirrored day.
    const mirrored: PrivateVolume = {
      ...VOLUME,
      human: [...VOLUME.human].reverse(),
      agent: [...VOLUME.agent].reverse(),
    }
    expect([...new Set(stepsOf(mirrored))].sort((a, b) => a - b)).not.toEqual(UNPLACED)
  })

  it('credits each beam to the actor the calendar credited', () => {
    const actorsAt = (step: number): Set<number> =>
      new Set(
        eventsOf(VOLUME)
          .filter((event) => event.step === step)
          .map((event) => event.actor)
      )
    expect(actorsAt(1)).toEqual(new Set([0]))
    expect(actorsAt(5)).toEqual(new Set([1]))
    expect(actorsAt(7)).toEqual(new Set([0, 1]))
  })

  it('sizes a day from what the payload own placed days average', () => {
    const steps = stepsOf(VOLUME)
    for (const step of UNPLACED) {
      const counted = (VOLUME.human[step] ?? 0) + (VOLUME.agent[step] ?? 0)
      const drawn = steps.filter((entry) => entry === step).length
      expect(drawn).toBeGreaterThanOrEqual(counted * RATIO.low)
      expect(drawn).toBeLessThanOrEqual(counted * RATIO.high)
    }
  })

  it('varies the day size instead of scaling one fixed multiple', () => {
    // "A random amount within a reasonable range", but hashed rather than
    // random: the renders are screenshot tested and must not move per build.
    const perDay = new Map<number, number>()
    for (const event of eventsOf({
      human: flat(3, 40),
      agent: flat(0, 40),
      covered: new Set(),
      stepCount: 40,
    }))
      perDay.set(event.step, (perDay.get(event.step) ?? 0) + 1)
    expect(perDay.size).toBe(40)
    expect(new Set(perDay.values()).size).toBeGreaterThan(5)
  })

  it('caps a day busy enough to swamp the frame', () => {
    // The payload's busiest green day counts 284 contributions; at the top of
    // the band that is 4,260 beams, twice what one step is allowed to draw.
    const busy = privateRepo({
      human: [0, 5000, 0, 0, 0, 0, 0, 0, 0, 0],
      agent: flat(0, 10),
      covered: new Set(),
      stepCount: 10,
    })
    expect(busy?.events).toHaveLength(MAX_PRIVATE_DAY_FILES)
  })

  it('holds the star count to a bounded pool however long the window', () => {
    // One fresh path per synthesized contribution would give this repo tens of
    // thousands of stars and let it dwarf every real galaxy in the disc.
    const paths = new Set(
      eventsOf({
        human: flat(6, 4000),
        agent: flat(2, 4000),
        covered: new Set(),
        stepCount: 4000,
      }).map((event) => event.path)
    )
    expect(paths.size).toBe(PRIVATE_PATH_POOL)
    expect(PRIVATE_PATH_POOL).toBeLessThan(1000)
  })

  it('names no star anything file shaped', () => {
    // These stars stand for volume. A name like `src/index.ts` would claim
    // knowledge of what was touched that the payload does not carry.
    for (const event of eventsOf(VOLUME))
      expect(event.path).toMatch(/^unplaced\/\d{3}$/)
  })

  it('synthesizes one repo whose id no payload repo can ever hold', () => {
    const synthetic = privateRepo(VOLUME)
    expect(synthetic?.repo.name).toBe(PRIVATE_REPO_NAME)
    expect(synthetic?.repo.name).toBe('private')
    expect(synthetic?.repo.id).toBe(PRIVATE_REPO_ID)
    // Payload repo ids are indices into repos.json and never negative, so a
    // negative id cannot collide however many repos the payload grows to.
    expect(PRIVATE_REPO_ID).toBeLessThan(0)
    for (const event of synthetic?.events ?? [])
      expect(event.repo).toBe(PRIVATE_REPO_ID)
  })

  it('produces the identical repo twice from the identical payload', () => {
    // Screenshot-tested renders: no clock, no randomness, no input order.
    expect(JSON.stringify(privateRepo(VOLUME))).toBe(JSON.stringify(privateRepo(VOLUME)))
  })

  it('synthesizes nothing when there is no unplaced green to stand in for', () => {
    expect(privateRepo({ ...VOLUME, covered: new Set([1, 2, 3, 5, 7]) })).toBeUndefined()
    expect(privateRepo({ ...VOLUME, human: [], agent: [] })).toBeUndefined()
  })

  it('joins the universe as an ordinary repo whose every beam finds a star', () => {
    const synthetic = privateRepo(VOLUME)
    if (!synthetic) throw new Error('the fixture carries unplaced green days')
    const universe = buildUniverse(
      [{ id: 0, name: 'a/public' }, synthetic.repo],
      [{ repo: 0, path: 'a.ts', step: 2, actor: 0 }, ...synthetic.events],
      VOLUME.stepCount
    )
    const stars = new Set(
      universe.repos.find((repo) => repo.name === PRIVATE_REPO_NAME)?.files
    )
    expect(stars.size).toBeGreaterThan(0)
    expect(stars.size).toBeLessThanOrEqual(PRIVATE_PATH_POOL)
    // A beam whose star does not exist is dropped without a sound, which is
    // the silence this module exists to avoid.
    for (const entry of universe.contributions)
      if (entry.repo === PRIVATE_REPO_ID) expect(stars).toContain(entry.file)
  })
})
