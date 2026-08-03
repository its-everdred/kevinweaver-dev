'use client'
import { useCallback, useEffect, useRef } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import type {
  VizDriver,
  VizSurfaceGeometry,
  VizSurfaceId,
} from '@/lib/viz/driver'

const MAX_DPR = 2
const mounted = new Set<VizSurfaceId>()

interface LifecycleOptions {
  readonly id: VizSurfaceId
  readonly driver: VizDriver | null
  readonly enabled: boolean
}
interface LifecycleHandle {
  readonly ref: RefObject<HTMLCanvasElement | null>
  readonly geometry: RefObject<VizSurfaceGeometry | null>
}
interface LifecycleContext {
  id: VizSurfaceId
  readonly canvasRef: RefObject<HTMLCanvasElement | null>
  readonly geometryRef: MutableRefObject<VizSurfaceGeometry | null>
  context: CanvasRenderingContext2D | null
  driver: VizDriver | null
  attached: VizDriver | null
  enabled: boolean
  size: { width: number; height: number }
}
type ContextRef = MutableRefObject<LifecycleContext>

/**
 * @description Owns one canvas observer and its driver attachment lifecycle.
 * @param options Surface identity, driver, and attachment state.
 * @returns Stable canvas and geometry references.
 */
export function useCanvasLifecycle(options: LifecycleOptions): LifecycleHandle {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const geometryRef = useRef<VizSurfaceGeometry>(null)
  const contextRef = useRef<LifecycleContext>({
    id: options.id,
    canvasRef,
    geometryRef,
    context: null,
    driver: null,
    attached: null,
    enabled: options.enabled,
    size: { width: 0, height: 0 },
  })
  const attach = useCallback(() => attachSurface(contextRef), [])
  useGeometryObserver(options.id, contextRef, attach)
  useDriverAttachment(options, contextRef, attach)
  return { ref: canvasRef, geometry: geometryRef }
}
function attachSurface(contextRef: ContextRef): void {
  const context = contextRef.current
  const measured = context.geometryRef.current
  if (!context.driver || !context.context || !measured || !context.enabled)
    return
  if (context.attached === context.driver) return
  context.driver.attach({
    id: context.id,
    ctx: context.context,
    geometry: measured,
  })
  context.attached = context.driver
  mounted.add(context.id)
  context.driver.start()
}
function useGeometryObserver(
  id: VizSurfaceId,
  contextRef: ContextRef,
  attach: () => void
): void {
  useEffect(() => {
    const context = contextRef.current
    const canvas = context.canvasRef.current
    if (!canvas) return
    const canvasContext = canvas.getContext('2d')
    if (!canvasContext) return
    context.id = id
    context.context = canvasContext
    return observeGeometry(canvas, contextRef, attach)
  }, [attach, contextRef, id])
}
function observeGeometry(
  canvas: HTMLCanvasElement,
  contextRef: ContextRef,
  attach: () => void
): () => void {
  const publish = createPublisher(contextRef, attach)
  const observer = new ResizeObserver(([entry]) => publishEntry(entry, publish))
  let query: MediaQueryList | null = null
  const onResolution = (): void => {
    query?.removeEventListener('change', onResolution)
    publish(contextRef.current.size.width, contextRef.current.size.height)
    query = armResolution(onResolution)
  }
  observer.observe(canvas)
  query = armResolution(onResolution)
  return () => {
    observer.disconnect()
    query?.removeEventListener('change', onResolution)
    contextRef.current.context = null
  }
}
function createPublisher(
  contextRef: ContextRef,
  attach: () => void
): (width: number, height: number) => void {
  return (width, height) => {
    const context = contextRef.current
    const canvas = context.canvasRef.current
    if (width <= 0 || height <= 0 || !context.context || !canvas) return
    context.size = { width, height }
    const next = createGeometry(canvas, width, height)
    if (canvas.width !== next.deviceWidth) canvas.width = next.deviceWidth
    if (canvas.height !== next.deviceHeight) canvas.height = next.deviceHeight
    context.context.setTransform(next.dpr, 0, 0, next.dpr, 0, 0)
    context.geometryRef.current = next
    context.attached?.resize(context.id, next)
    attach()
  }
}
function publishEntry(
  entry: ResizeObserverEntry | undefined,
  publish: (width: number, height: number) => void
): void {
  if (!entry) return
  const box = entry.contentBoxSize[0]
  publish(
    box?.inlineSize ?? entry.contentRect.width,
    box?.blockSize ?? entry.contentRect.height
  )
}
function useDriverAttachment(
  options: LifecycleOptions,
  contextRef: ContextRef,
  attach: () => void
): void {
  useEffect(() => {
    const context = contextRef.current
    context.id = options.id
    context.driver = options.driver
    context.enabled = options.enabled
    attach()
    return () => detachSurface(options.id, contextRef)
  }, [attach, contextRef, options.driver, options.enabled, options.id])
}
function detachSurface(id: VizSurfaceId, contextRef: ContextRef): void {
  const context = contextRef.current
  if (!context.attached) return
  context.attached.detach(id)
  const driver = context.attached
  context.attached = null
  mounted.delete(id)
  if (mounted.size === 0) driver.stop()
}
function createGeometry(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number
): VizSurfaceGeometry {
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
  const style = getComputedStyle(canvas)
  return {
    cssWidth,
    cssHeight,
    deviceWidth: Math.round(cssWidth * dpr),
    deviceHeight: Math.round(cssHeight * dpr),
    dpr,
    font: {
      micro: parseFloat(style.fontSize) || 0,
      small: parseFloat(style.lineHeight) || 0,
      mono: parseFloat(style.textIndent) || 0,
    },
  }
}
function armResolution(listener: () => void): MediaQueryList | null {
  if (typeof window.matchMedia !== 'function') return null
  const query = window.matchMedia(
    `(resolution: ${window.devicePixelRatio || 1}dppx)`
  )
  query.addEventListener('change', listener)
  return query
}
