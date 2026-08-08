'use client'
import type { BundleLoader } from '@/lib/bundle/loader'

/**
 * Draws a booted loader through the rest of its event chunks.
 *
 * Everything the galaxy draws except the synthesized `private` repo comes from
 * these chunks: `repos.json` names the repositories but one with no resident
 * file event owns no files, and one with no files is dropped by `buildUniverse`
 * and lit by no star. So a pump that stops early does not degrade the disc, it
 * empties it — leaving `private`, which is built client-side from the
 * first-byte `grid.json`, alone on screen. That is the shape of the bug this
 * module was extracted to fix, reported from a phone as "doesn't render most of
 * the galaxy, only private".
 *
 * The pump is 94 chunks, 188 requests, one after another, because a chunk's
 * dictionary slice only decodes on top of the slice before it. On a cellular
 * link that is 188 chances to drop a connection. `lib/bundle/fetchText.ts`
 * absorbs a dropped request; this absorbs a dropped chunk, by waiting and
 * asking the loader to resume from where it stopped.
 */

/**
 * Waits before each resume after the loader stalls, in order. Geometric and
 * ending at six seconds: long enough to cover a lift, a tunnel, or a tab that
 * was backgrounded while the radio slept, short enough that a viewer watching
 * the disc fill in is not left wondering. Four entries, so a pump that is
 * simply never going to finish gives up after about fourteen seconds instead of
 * retrying for the life of the page.
 */
export const PUMP_RESUME_MS: readonly number[] = [400, 1_200, 3_600, 9_000]

/**
 * Where the pump reports what it managed to load, as `resident/total` chunks.
 * On the document element rather than on any one surface: the runtime is a
 * module singleton shared by every instrument, it outlives all of them, and the
 * galaxy canvas that would otherwise host it is behind a lazy island that may
 * not be mounted when the pump ends. Inert to assistive technology, and the
 * only externally visible statement this pump makes — before it, a pump that
 * died partway reported nothing at all, which is why the bug shipped.
 */
export const CHUNKS_ATTRIBUTE = 'kwChunks'

/** What the pump needs from the runtime that owns the loader. */
export interface ChunkPumpHost {
  /** False once this loader is no longer the runtime's live one. */
  readonly isCurrent: () => boolean
  /** Rebuilds and publishes the ready state from the events resident now. */
  readonly publish: () => void
}

/**
 * @description Loads every remaining event chunk, publishing whenever the
 * resident history grows and resuming across a stall. Boot has already
 * published, so first paint never waits on this; a chunk the deployment does
 * not have still ends the history quietly, exactly as before.
 * @param loader The booted loader, retained by the caller.
 * @param host The runtime's identity check and publisher.
 */
export async function pumpChunks(
  loader: BundleLoader,
  host: ChunkPumpHost
): Promise<void> {
  const total = loader.status().chunksTotal
  if (total <= 0) return
  let resident = loader.status().chunksLoaded
  for (let resume = 0; ; resume += 1) {
    try {
      await loader.ensureChunk(total - 1)
    } catch {
      // A disposed loader rejects mid-flight; the identity check below decides.
    }
    if (!host.isCurrent()) return
    const status = loader.status()
    if (status.chunksLoaded > resident) {
      resident = status.chunksLoaded
      host.publish()
    }
    surfaceResident(resident, total)
    const wait = PUMP_RESUME_MS[resume]
    if (!status.stalled || wait === undefined) break
    await delay(wait)
    if (!host.isCurrent()) return
    loader.retry()
  }
  reportShortfall(resident, total, loader)
}

/**
 * @description Publishes the pump's progress on the document element, so a
 * truncated history is visible to a test, to the operator's dev tools, and to
 * anyone reading a bug report, instead of being swallowed.
 * @param resident Chunks whose events are in the scene.
 * @param total Chunks the manifest declares.
 */
export function surfaceResident(resident: number, total: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset[CHUNKS_ATTRIBUTE] = `${resident}/${total}`
}

/**
 * Says so, once, when the pump gave up short. Development only: the attribute
 * carries the same fact in production at no cost, and `NODE_ENV` is folded at
 * build time so none of this reaches the client bundle.
 */
function reportShortfall(
  resident: number,
  total: number,
  loader: BundleLoader
): void {
  if (process.env.NODE_ENV === 'production' || resident >= total) return
  const { endReason, stalled } = loader.status()
  console.warn(
    `[kw] event chunk pump stopped at ${resident}/${total} ` +
      `(${stalled ? 'unreachable' : (endReason ?? 'unknown')}). The galaxy is ` +
      'showing partial history; repositories with no resident event have no stars.'
  )
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => window.setTimeout(resolve, ms))
