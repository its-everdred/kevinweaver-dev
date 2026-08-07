import { describe, expect, it } from 'vitest'

import { buildUniverse } from '../src/buildUniverse'
import {
  PRIVATE_REPO_ID,
  PRIVATE_REPO_NAME,
  privateRepo,
  type PrivateVolume,
} from '../src/privateRepo'

/**
 * Three months laid onto a timeline that opens with them: January 2024 has 31
 * days and 31 contributions, February none, March five. February is there
 * because a quiet month is the common case: 24 of the payload's 67 months
 * carry no volume at all.
 */
const VOLUME: PrivateVolume = {
  monthly: [31, 0, 5],
  startMonth: '2024-01',
  windowStart: '2024-01-01',
  stepCount: 120,
}
/** Steps January 2024 occupies, given a window that starts on its first day. */
const JANUARY = { first: 0, last: 30 }
/** Step March 2024 opens on: 31 days of January plus 29 of a leap February. */
const MARCH_FIRST = 60

function steps(volume: PrivateVolume): number[] {
  return (privateRepo(volume)?.events ?? []).map((event) => event.step)
}

describe('privateRepo', () => {
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

  it('distributes a month whole across that month own days', () => {
    const january = steps(VOLUME).filter((step) => step <= JANUARY.last)
    // Thirty-one contributions across thirty-one days is one per day, and the
    // point is that none of the month's volume is lost to rounding.
    expect(january).toHaveLength(31)
    expect(new Set(january).size).toBe(31)
    expect(Math.min(...january)).toBe(JANUARY.first)
    expect(Math.max(...january)).toBe(JANUARY.last)
  })

  it('spreads a month with less volume than days across the whole month', () => {
    const march = steps(VOLUME).filter((step) => step >= MARCH_FIRST)
    expect(march).toHaveLength(5)
    // Five contributions in a 31-day month land apart rather than stacking on
    // the first day, so a quiet month reads as a quiet month.
    expect(new Set(march).size).toBe(5)
    expect(Math.max(...march) - Math.min(...march)).toBeGreaterThan(10)
  })

  it('gives an empty month no contributions at all', () => {
    const february = steps(VOLUME).filter(
      (step) => step > JANUARY.last && step < MARCH_FIRST
    )
    expect(february).toEqual([])
  })

  it('scales its star count with the total private volume', () => {
    const synthetic = privateRepo(VOLUME)
    const paths = new Set((synthetic?.events ?? []).map((event) => event.path))
    // One star per unit of volume: the payload states volume and nothing else,
    // so volume is the only thing the star count can honestly encode.
    expect(synthetic?.events).toHaveLength(36)
    expect(paths.size).toBe(36)
    expect(privateRepo({ ...VOLUME, monthly: [62, 0, 10] })?.events).toHaveLength(72)
  })

  it('produces the identical repo twice from the identical payload', () => {
    // Screenshot-tested renders: no clock, no randomness, no input order.
    expect(JSON.stringify(privateRepo(VOLUME))).toBe(JSON.stringify(privateRepo(VOLUME)))
  })

  it('synthesizes nothing when the payload carries no private volume', () => {
    expect(privateRepo({ ...VOLUME, monthly: [] })).toBeUndefined()
    expect(privateRepo({ ...VOLUME, monthly: [0, 0, 0] })).toBeUndefined()
  })

  it('drops volume that falls outside the timeline rather than off its end', () => {
    const short = steps({ ...VOLUME, stepCount: 10 })
    expect(short).toHaveLength(10)
    for (const step of short) {
      expect(step).toBeGreaterThanOrEqual(0)
      expect(step).toBeLessThan(10)
    }
  })

  it('joins the universe as an ordinary repo, with stars and contributions', () => {
    const synthetic = privateRepo(VOLUME)
    if (!synthetic) throw new Error('the fixture carries private volume')
    const universe = buildUniverse(
      [{ id: 0, name: 'a/public' }, synthetic.repo],
      [{ repo: 0, path: 'a.ts', step: 4, actor: 0 }, ...synthetic.events],
      VOLUME.stepCount
    )
    const found = universe.repos.find((repo) => repo.name === PRIVATE_REPO_NAME)
    expect(found?.files).toHaveLength(36)
    expect(
      universe.contributions.filter((entry) => entry.repo === PRIVATE_REPO_ID)
    ).toHaveLength(36)
  })
})
