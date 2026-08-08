'use client'

import type { UniverseActor } from '@/packages/aiur-galaxy/src/types'

/** The avatar each actor's node wears, in the order the scene draws them. */
const AVATARS: readonly {
  readonly actor: UniverseActor
  readonly src: string
}[] = [
  { actor: 0, src: '/images/its-everdred.png' },
  { actor: 1, src: '/images/its-applekid.jpg' },
]

/**
 * @description Fetches the contributor avatars and hands each decoded image to
 * the scene as it arrives.
 *
 * This is where the browser-only half of a contributor node lives. Loading an
 * image needs `Image`, and `packages/` owns no DOM beyond its guarded label
 * canvas, so the fetch belongs to the host and the scene is handed a decoded
 * image it can upload. The nodes render in their flat actor colours from the
 * first frame and keep them if no image ever lands, which is what makes a 404,
 * a corrupt file, or an offline visitor cost the galaxy its decoration alone.
 * @param paint Receives one decoded image per actor, at most once each.
 * @returns A teardown that abandons whatever is still in flight, so an image
 * that arrives after the scene is gone reaches nothing.
 */
export function loadContributorAvatars(
  paint: (actor: UniverseActor, image: HTMLImageElement) => void
): () => void {
  const loading = AVATARS.map(({ actor, src }) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => paint(actor, image)
    // Nothing to recover: a node without an avatar is the node we already ship.
    image.onerror = () => undefined
    image.src = src
    return image
  })
  return () => {
    for (const image of loading) {
      image.onload = null
      image.onerror = null
    }
  }
}
