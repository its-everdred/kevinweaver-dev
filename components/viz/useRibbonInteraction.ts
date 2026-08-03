'use client'
import { useEffect, useRef, useState } from 'react'
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react'
import { formatDayISO } from '@/lib/viz/driver'
import type { InstrumentViz } from './instrumentRuntime'
import type { CanvasSurfaceHandle, SurfaceGeometry } from './useCanvasSurface'

interface InteractionOptions {
  readonly viz: InstrumentViz | null
  readonly geometry: RefObject<SurfaceGeometry | null>
  readonly toLocal: CanvasSurfaceHandle['toLocal']
}
interface InteractionContext extends InteractionOptions {
  readonly container: RefObject<HTMLDivElement | null>
  readonly tooltip: RefObject<HTMLDivElement | null>
  readonly displayedDay: RefObject<number | null>
  readonly fineQuery: RefObject<MediaQueryList | null>
}
interface RibbonInteraction {
  readonly container: RefObject<HTMLDivElement | null>
  readonly tooltip: RefObject<HTMLDivElement | null>
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void
  readonly onPointerCancel: (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => void
  readonly onPointerDown: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerLeave: () => void
  readonly onPointerMove: (event: ReactPointerEvent<HTMLCanvasElement>) => void
  readonly onPointerUp: (event: ReactPointerEvent<HTMLCanvasElement>) => void
}
type SetPinned = Dispatch<SetStateAction<number | null>>

/**
 * @description Provides pointer, pin, tooltip, capture, and Escape ribbon behavior.
 * @param options Current driver and canvas coordinate bindings.
 * @returns Stable-shape event handlers and the tooltip reference.
 */
export function useRibbonInteraction(
  options: InteractionOptions
): RibbonInteraction {
  const container = useRef<HTMLDivElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const displayedDay = useRef<number | null>(null)
  const fineQuery = useRef<MediaQueryList | null>(null)
  const [pinned, setPinned] = useState<number | null>(null)
  const context = { ...options, container, tooltip, displayedDay, fineQuery }
  useOutsideDismiss(context, pinned, setPinned)
  return {
    container,
    tooltip,
    onKeyDown: (event) => onKeyDown(context, setPinned, event),
    onPointerCancel: (event) => onPointerCancel(context, setPinned, event),
    onPointerDown: (event) =>
      event.currentTarget.setPointerCapture(event.pointerId),
    onPointerLeave: () => onPointerLeave(context, pinned),
    onPointerMove: (event) => onPointerMove(context, pinned, event),
    onPointerUp: (event) => onPointerUp(context, pinned, setPinned, event),
  }
}

function dayAtPointer(
  context: InteractionContext,
  event: ReactPointerEvent<HTMLCanvasElement>
): number {
  const point = context.toLocal(event)
  if (!point || !context.viz) return -1
  context.viz.driver.setPointer('ribbon', point)
  const state = context.viz.driver.inspect()
  const cell = state.highlightCell
  return cell ? state.winStart + cell.week * 7 + cell.weekday : -1
}

function showTooltip(
  context: InteractionContext,
  event: ReactPointerEvent<HTMLCanvasElement>,
  day: number
): void {
  const element = context.tooltip.current
  const measured = context.geometry.current
  const point = context.toLocal(event)
  if (!element || !measured || !point || !context.viz || day < 0) return
  if (context.displayedDay.current !== day || element.hidden) {
    const total = context.viz.render.grid.total[day] ?? 0
    const agent = context.viz.render.grid.agent[day] ?? 0
    element.textContent = `${formatDayISO(context.viz.head.grid.start, day)} · ${total} contributions · ${agent} agent`
    element.hidden = false
    context.displayedDay.current = day
  }
  element.style.left = `${Math.min(measured.cssWidth - 200, Math.max(0, point.x + 14))}px`
  element.style.top = `${Math.max(0, point.y - 66)}px`
}

function hideTooltip(context: InteractionContext): void {
  if (context.tooltip.current) context.tooltip.current.hidden = true
  context.displayedDay.current = null
}
function finePointer(context: InteractionContext): boolean {
  if (typeof window.matchMedia !== 'function') return false
  context.fineQuery.current ??= window.matchMedia('(pointer: fine)')
  return context.fineQuery.current.matches
}
function onPointerMove(
  context: InteractionContext,
  pinned: number | null,
  event: ReactPointerEvent<HTMLCanvasElement>
): void {
  if (!finePointer(context) || pinned !== null) return
  const day = dayAtPointer(context, event)
  if (day < 0) hideTooltip(context)
  else showTooltip(context, event, day)
}
function onPointerLeave(
  context: InteractionContext,
  pinned: number | null
): void {
  if (!finePointer(context) || pinned !== null || !context.viz) return
  context.viz.driver.setPointer('ribbon', null)
  hideTooltip(context)
}
function onPointerUp(
  context: InteractionContext,
  pinned: number | null,
  setPinned: SetPinned,
  event: ReactPointerEvent<HTMLCanvasElement>
): void {
  releaseCapture(event)
  if (finePointer(context)) return
  const day = dayAtPointer(context, event)
  if (day < 0 || day === pinned) return clear(context, setPinned)
  setPinned(day)
  showTooltip(context, event, day)
}
function onPointerCancel(
  context: InteractionContext,
  setPinned: SetPinned,
  event: ReactPointerEvent<HTMLCanvasElement>
): void {
  releaseCapture(event)
  clear(context, setPinned)
}
function onKeyDown(
  context: InteractionContext,
  setPinned: SetPinned,
  event: ReactKeyboardEvent<HTMLDivElement>
): void {
  if (event.key === 'Escape') clear(context, setPinned)
}
function releaseCapture(event: ReactPointerEvent<HTMLCanvasElement>): void {
  if (event.currentTarget.hasPointerCapture(event.pointerId))
    event.currentTarget.releasePointerCapture(event.pointerId)
}
function useOutsideDismiss(
  context: InteractionContext,
  pinned: number | null,
  setPinned: SetPinned
): void {
  useEffect(() => {
    if (pinned === null) return
    const dismiss = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && context.container.current?.contains(target))
        return
      clear(context, setPinned)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [context, pinned, setPinned])
}
function clear(context: InteractionContext, setPinned: SetPinned): void {
  setPinned(null)
  context.viz?.driver.setPointer('ribbon', null)
  hideTooltip(context)
}
