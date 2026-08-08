import { describe, expect, it } from 'vitest'
// Per module, not through the barrel: see the note in useGalaxyScene.ts.
import { PRIVATE_PATH_POOL } from '@/packages/aiur-galaxy/src/privateRepo'
import { PRIVATE_PATH_WORDS, privatePath } from './privatePath'

/** The handles the synthesized repo actually hands this module. */
const SLOTS = Array.from(
  { length: PRIVATE_PATH_POOL },
  (_, slot) => `unplaced/${String(slot + 1).padStart(3, '0')}`
)
/** Two directory segments, a stem, and an extension. */
const SHAPE = /^[a-z]+\/[a-z]+\/[a-z]+\.[a-z]+$/
/**
 * Where `shortPath` in EventsTail starts replacing characters with an ellipsis.
 * A stand-in that tripped it would read as a truncated path rather than a
 * blurred one, which is the one shape that looks like a bug instead of a
 * redaction.
 */
const LINE_BUDGET = 28

describe('privatePath', () => {
  it('spells every path out of a vocabulary written down in the source', () => {
    // The whole correctness argument. CSS blur is paint over text that is still
    // in the DOM in plain characters, so a real private path here would be a
    // disclosure wearing a redaction's costume. Nothing outside this closed
    // word list can ever be emitted, so there is nothing to disclose.
    for (const slot of SLOTS) {
      const path = privatePath(slot)
      expect(path).toMatch(SHAPE)
      for (const word of path.split(/[/.]/))
        expect(PRIVATE_PATH_WORDS).toContain(word)
    }
  })

  it('carries nothing from the key it was given through to the path', () => {
    // A key only picks indices into the lists. Were that ever loosened into
    // deriving text from the input, this is the test that would go red.
    const path = privatePath('acmecorp-payroll/ledger/q3-salaries.xlsx')
    for (const secret of ['acmecorp', 'payroll', 'ledger', 'salaries', 'xlsx'])
      expect(path).not.toContain(secret)
    expect(path).toMatch(SHAPE)
    for (const word of path.split(/[/.]/))
      expect(PRIVATE_PATH_WORDS).toContain(word)
  })

  it('never leaks the internal handle it was keyed on', () => {
    for (const slot of SLOTS)
      expect(privatePath(slot)).not.toContain('unplaced')
  })

  it('gives the same key the same path on every build', () => {
    // Screenshot-tested renders: no clock, no randomness, no input order. Same
    // reason `privateRepo` hashes its day sizes rather than drawing them.
    expect(SLOTS.map(privatePath)).toEqual(SLOTS.map(privatePath))
    expect(privatePath('unplaced/007')).toBe(privatePath('unplaced/007'))
  })

  it('spreads the pool wide enough that a day is not one repeated line', () => {
    // A day lights up to MAX_PRIVATE_DAY_FILES (48) slots, so a handful of
    // distinct names would read as a stutter rather than as a file list. The
    // 512 slots land on 346 of the 576 the vocabulary can spell, and the pane's
    // 40-row ceiling is never close to exhausting that.
    expect(new Set(SLOTS.map(privatePath)).size).toBeGreaterThan(300)
  })

  it('fits the log line, so no row reads as truncated instead of blurred', () => {
    for (const slot of SLOTS)
      expect(privatePath(slot).length).toBeLessThanOrEqual(LINE_BUDGET)
  })
})
