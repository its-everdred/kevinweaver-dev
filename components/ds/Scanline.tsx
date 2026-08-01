import type { ReactNode } from 'react'

/** Renders the fixed scanline treatment without accepting pointer events. */
export function Scanline(): ReactNode {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 80,
        background: 'var(--scanline)',
        opacity: 'var(--scanline-opacity, .35)',
        mixBlendMode: 'multiply',
      }}
    />
  )
}
