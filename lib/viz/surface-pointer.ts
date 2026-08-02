import { ribbonGeometry, ribbonHitTest, type RibbonLayer } from './render/ribbon'
import type { RenderView } from './render/budget'
import type { SimInput } from './sim/types'
import type { VizPointer } from './surfaces'

/** Pins the renderer layer to the driver's calendar-aligned window. */
export function syncVizRibbonWindow(layer: RibbonLayer, winStart: number): void {
  layer.winStartDay = winStart
  layer.followPlayhead = false
}

/** Resolves a ribbon-local pointer to its driver highlight cell. */
export function highlightVizRibbonPointer(
  input: SimInput,
  layer: RibbonLayer,
  view: RenderView,
  point: VizPointer,
  highlightCell: (day: number, winStart: number) => { week: number; weekday: number } | null
): { week: number; weekday: number } | null {
  const day = ribbonHitTest(ribbonGeometry(view), view, layer, point.x, point.y)
  return day < 0 ? null : highlightCell(day, layer.winStartDay)
}
