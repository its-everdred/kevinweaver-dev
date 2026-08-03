import {
  ribbonGeometry,
  ribbonHitTest,
  type RibbonLayer,
} from './render/ribbon'
import type { RenderView } from './render/budget'
import type { SimInput } from './sim/types'
import type { VizPointer } from './surfaces'

/**
 * @description The calendar cell selected by a ribbon pointer.
 */
export type VizRibbonHighlight = { week: number; weekday: number } | null

/**
 * @description Stores pointer state while the driver owns surface invalidation.
 */
export interface VizRibbonPointerState {
  set(point: VizPointer | null, view: RenderView): VizRibbonHighlight
  refresh(view: RenderView): VizRibbonHighlight | undefined
  value(): VizRibbonHighlight | undefined
}

/**
 * @description Creates mutable ribbon pointer state around a driver-owned hit test.
 * @param resolve - Converts the current pointer and render view to a highlight.
 * @returns Pointer state that can be refreshed after a ribbon repaint.
 */
export function createVizRibbonPointerState(
  resolve: (point: VizPointer, view: RenderView) => VizRibbonHighlight
): VizRibbonPointerState {
  return new RibbonPointerState(resolve)
}

class RibbonPointerState implements VizRibbonPointerState {
  #point: VizPointer | null = null
  #highlight: VizRibbonHighlight | undefined

  constructor(
    private readonly resolve: (
      point: VizPointer,
      view: RenderView
    ) => VizRibbonHighlight
  ) {}

  set(point: VizPointer | null, view: RenderView): VizRibbonHighlight {
    this.#point = point
    this.#highlight = point ? this.resolve(point, view) : null
    return this.#highlight
  }
  refresh(view: RenderView): VizRibbonHighlight | undefined {
    if (this.#point) this.#highlight = this.resolve(this.#point, view)
    return this.#highlight
  }
  value(): VizRibbonHighlight | undefined {
    return this.#highlight
  }
}

/**
 * @description Pins the renderer layer to the driver's calendar-aligned window.
 * @param layer - Mutable ribbon renderer state owned by the driver.
 * @param winStart - Calendar-aligned first day visible in the ribbon.
 * @returns Nothing.
 */
export function syncVizRibbonWindow(
  layer: RibbonLayer,
  winStart: number
): void {
  layer.winStartDay = winStart
  layer.followPlayhead = false
}

/**
 * @description Resolves a ribbon-local pointer to its driver highlight cell.
 * @param input - Simulation calendar used to map a hit to a day.
 * @param layer - Ribbon renderer state containing the current window.
 * @param view - Current ribbon geometry and rendering metadata.
 * @param point - Pointer coordinates in local CSS pixels.
 * @param highlightCell - Converts a day and window into a calendar cell.
 * @returns The selected cell, or null when the pointer misses the ribbon.
 */
export function highlightVizRibbonPointer(
  input: SimInput,
  layer: RibbonLayer,
  view: RenderView,
  point: VizPointer,
  highlightCell: (
    day: number,
    winStart: number
  ) => { week: number; weekday: number } | null
): { week: number; weekday: number } | null {
  const day = ribbonHitTest(ribbonGeometry(view), view, layer, point.x, point.y)
  return day < 0 ? null : highlightCell(day, layer.winStartDay)
}
