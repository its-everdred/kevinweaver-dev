import { renderGraph, type GraphLayer } from './render/graph'
import { renderOverview, type OverviewLayer } from './render/overview'
import { renderRibbon, type RibbonLayer } from './render/ribbon'
import type {
  FrameBudget,
  Quality,
  RenderMeta,
  RenderView,
} from './render/budget'
import type { SimState } from './sim/types'
import type { VizCanvasId } from './driver'
import type { VizSurfaceController } from './surface-controller'

/** Inputs required to paint the selected consumer surfaces. */
export interface VizSurfacePaintOptions {
  readonly state: SimState
  readonly layers: VizSurfaceRenderLayers
  readonly quality: Quality
  readonly meta: RenderMeta
  readonly focusedDay: number
  readonly winStart: number
  readonly targets?: ReadonlySet<VizCanvasId>
  readonly onRibbonPaint: (view: RenderView) => void
}

/** Renderer layers shared by the driver-owned surface painter. */
export interface VizSurfaceRenderLayers {
  readonly budget: FrameBudget
  readonly graph: GraphLayer
  readonly ribbon: RibbonLayer
  readonly overview: OverviewLayer
}

/** Paints all surfaces or only the supplied invalidation targets. */
export function paintVizSurfaces(
  controller: VizSurfaceController,
  options: VizSurfacePaintOptions
): number {
  options.layers.budget.begin()
  paintOverviewSurface(controller, options)
  paintRibbonSurface(controller, options)
  paintGraphSurface(controller, options)
  return options.layers.budget.end().drawCalls
}

function paintOverviewSurface(
  controller: VizSurfaceController,
  options: VizSurfacePaintOptions
): void {
  if (!shouldPaint('overview', options.targets)) return
  const ctx = controller.context('overview')
  if (!ctx) return
  renderOverview(
    options.state,
    ctx,
    viewFor(controller, 'overview', options),
    options.layers.overview,
    options.winStart
  )
}

function paintRibbonSurface(
  controller: VizSurfaceController,
  options: VizSurfacePaintOptions
): void {
  if (!shouldPaint('ribbon', options.targets)) return
  const view = viewFor(controller, 'ribbon', options)
  const ctx = controller.context('ribbon')
  if (ctx) renderRibbon(options.state, ctx, view, options.layers.ribbon)
  options.onRibbonPaint(view)
}

function paintGraphSurface(
  controller: VizSurfaceController,
  options: VizSurfacePaintOptions
): void {
  if (!shouldPaint('graph', options.targets)) return
  const ctx = controller.context('graph')
  if (!ctx) return
  renderGraph(
    options.state,
    ctx,
    viewFor(controller, 'graph', options),
    options.layers.graph
  )
}

function viewFor(
  controller: VizSurfaceController,
  id: VizCanvasId,
  options: VizSurfacePaintOptions
): RenderView {
  return controller.buildView(
    id,
    options.quality,
    options.meta,
    options.focusedDay
  )
}

function shouldPaint(
  id: VizCanvasId,
  targets: ReadonlySet<VizCanvasId> | undefined
): boolean {
  return targets === undefined || targets.has(id)
}
