'use client'
import { useCallback } from 'react'
import type { CSSProperties, PointerEvent as Pointer, RefObject } from 'react'
// prettier-ignore
import type { VizDriver, VizSurfaceId, VizSurfaceGeometry } from '@/lib/viz/driver'
import { useCanvasLifecycle } from './useCanvasLifecycle'
export type { VizSurfaceId }
/** CSS and backing-store dimensions supplied to a visualization surface. */
export type SurfaceGeometry = VizSurfaceGeometry
/** Accessible naming forwarded to the owned canvas element. */
export interface CanvasSurfaceA11y {
  readonly label: string
  readonly describedById: string | null
}
/** Identifies and configures one independently observed canvas surface. */
export interface UseCanvasSurfaceOptions {
  readonly id: VizSurfaceId
  readonly driver: VizDriver | null
  readonly label: string
  readonly describedById?: string | null
  readonly enabled?: boolean
}
/** Stable canvas bindings and interaction helpers for a visualization leaf. */
export interface CanvasSurfaceHandle {
  readonly ref: RefObject<HTMLCanvasElement | null>
  readonly geometry: RefObject<SurfaceGeometry | null>
  readonly canvasProps: {
    role: 'img'
    'aria-label': string
    'aria-describedby'?: string
    style: CSSProperties
  }
  // prettier-ignore
  readonly toLocal: (event: Pointer<HTMLCanvasElement>) => { x: number; y: number } | null
  readonly invalidate: () => void
}
/**
 * @description Builds accessible bindings around one independently observed canvas.
 * @param options Surface identity, driver, naming, and attachment state.
 * @returns Stable canvas bindings, geometry, and interaction helpers.
 */
export function useCanvasSurface(
  options: UseCanvasSurfaceOptions
): CanvasSurfaceHandle {
  const enabled = options.enabled ?? true
  const { ref, geometry } = useCanvasLifecycle({
    id: options.id,
    driver: options.driver,
    enabled,
  })
  const toLocal = useCallback(
    (event: Pointer<HTMLCanvasElement>) => {
      if (!geometry.current) return null
      return { x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY }
    },
    [geometry]
  )
  const invalidate = (): void => options.driver?.invalidate(options.id)
  return {
    ref,
    geometry,
    canvasProps: {
      role: 'img',
      'aria-label': options.label,
      ...(options.describedById
        ? { 'aria-describedby': options.describedById }
        : {}),
      style: {
        display: 'block',
        width: '100%',
        height: '100%',
        fontSize: 'var(--fs-micro)',
        lineHeight: 'var(--fs-small)',
        textIndent: 'var(--fs-mono)',
        ...(options.id === 'gource' ? {} : { touchAction: 'none' }),
      },
    },
    toLocal,
    invalidate,
  }
}
