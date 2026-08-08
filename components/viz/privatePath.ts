'use client'

// Imported per module rather than through the package barrel: see the note in
// useGalaxyScene.ts.
import { hash01 } from '@/packages/aiur-galaxy/src/galaxyCluster'

/**
 * These paths are INVENTED, and have to stay invented.
 *
 * The three lists below are the whole vocabulary a stand-in path can be spelled
 * from. Nothing about the key reaches the output: a key picks indices into these
 * lists and nothing more, so the result is a plausible-looking path assembled
 * out of words written down here.
 *
 * That is the entire safety argument, because the blur over these rows is paint.
 * `filter: blur()` leaves the characters in the DOM verbatim; anyone can open
 * devtools, untick the rule, and read them. A real private path rendered here
 * would be a disclosure wearing a redaction's costume. Since these are fiction,
 * it does not matter what a viewer does with the CSS.
 *
 * So do not "improve" this by wiring in real repository, file, or branch names.
 * There are none to wire in: 847 of the payload's 1193 green days carry no file
 * event at all, which is the reason they are synthesized in the first place.
 *
 * Deliberately generic, and deliberately not resembling this owner's public
 * repos either, so no reader can mistake one of these for a claim.
 */
const DIRS = [
  'packages/sdk',
  'packages/core',
  'services/api',
  'services/worker',
  'apps/web',
  'lib/client',
  'src/server',
  'internal/jobs',
] as const
const NAMES = [
  'client',
  'config',
  'handler',
  'index',
  'loader',
  'model',
  'parser',
  'router',
  'schema',
  'session',
  'store',
  'worker',
] as const
const EXTS = ['ts', 'tsx', 'go', 'py', 'rs', 'sql'] as const

/**
 * Every word the vocabulary holds. Exported so the test can assert the closed
 * set directly rather than trusting a regex to notice real text leaking in.
 * 8 x 12 x 6 spells 576 paths against the 512-slot pool in privateRepo.ts, and
 * the hash lands on 346 of them; the longest is 27 characters, one inside the
 * 28 at which the log would start truncating a row to an ellipsis.
 *
 * Shrinking this list is not a way to buy bundle bytes: it was tried at
 * 8 x 8 x 4 and gave back 18 of them, because these strings share prefixes and
 * brotli had already collapsed them. It cost a real property to save nothing.
 */
export const PRIVATE_PATH_WORDS: readonly string[] = [
  ...new Set([...DIRS.flatMap((dir) => dir.split('/')), ...NAMES, ...EXTS]),
]

/**
 * @description Invents one ordinary-looking file path for a contribution the
 * file history cannot place, so the events log reads as work happening behind a
 * redaction instead of as a column of apologies. The path names nothing: read
 * the note above before changing where its words come from.
 * @param key The contribution's stable handle, one of the synthesized repo's
 * `unplaced/NNN` pool slots.
 * @returns A path such as `packages/sdk/client.ts`.
 *
 * Hashed rather than random for the reason the synthesis itself is hashed: the
 * renders are screenshot tested, so a path has to come back identical on every
 * build. Keyed on the pool slot rather than the row's position in the day, so
 * one star keeps one name wherever and whenever it is drawn.
 */
export function privatePath(key: string): string {
  return `${pick(DIRS, key, 'dir')}/${pick(NAMES, key, 'name')}.${pick(EXTS, key, 'ext')}`
}

/**
 * @description Picks one entry of a list from a hashed key. Distinct axis salts,
 * the way galaxyCluster scatters a star, so the three choices are independent
 * and the pool does not collapse onto a diagonal of the 576 combinations.
 */
function pick<T>(list: readonly T[], key: string, axis: string): T {
  // hash01 is a fraction in [0, 1) quantized to thousandths, so the floor can
  // never reach list.length; the fallback is for noUncheckedIndexedAccess only.
  const entry = list[Math.floor(hash01(`${key}:${axis}`) * list.length)]
  return entry ?? (list[0] as T)
}
