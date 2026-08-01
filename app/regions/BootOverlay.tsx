import type { ReactNode } from 'react'
import type { BootOverlayProps } from './_contract'

/** Returns no placeholder so the app remains visible until the overlay ships. */
export function BootOverlay({}: BootOverlayProps): ReactNode {
  return null
}
