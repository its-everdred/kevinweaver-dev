import {
  ribbonGeometry,
  ribbonHitTest,
  type RibbonLayer,
} from './render/ribbon'
import type { RenderView } from './render/budget'
import type { SimInput } from './sim/types'
import type { VizPointer } from './surfaces'

/** The calendar cell selected by a ribbon pointer. */
export type VizRibbonHighlight = { week: number; weekday: number } | null

/** Stores pointer state while the driver owns surface invalidation. */
export interface VizRibbonPointerState {
  set(point: VizPointer | null, view: RenderView): VizRibbonHighlight
  refresh(view: RenderView): VizRibbonHighlight | undefined
  value(): VizRibbonHighlight | undefined
}

/** Creates mutable ribbon pointer state around a driver-owned hit test. */
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

/** Pins the renderer layer to the driver's calendar-aligned window. */
export function syncVizRibbonWindow(
  layer: RibbonLayer,
  winStart: number
): void {
  layer.winStartDay = winStart
  layer.followPlayhead = false
}

/** Resolves a ribbon-local pointer to its driver highlight cell. */
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
