import {
  instrumentContext,
  type Ctx2D,
  type FrameBudget,
  type Quality,
  type RenderMeta,
  type RenderView,
} from './render/budget'
import type { VizCanvasId, VizViewport } from './driver'
import { createVizSurfaceViews } from './surface-view'
import type { VizSurfaceGeometry } from './surfaces'

/** Owns consumer surface lifecycle state without scheduling animation frames. */
export interface VizSurfaceController {
  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void
  setViewport(id: VizCanvasId, viewport: VizViewport): void
  setGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void
  buildView(
    id: VizCanvasId,
    quality: Quality,
    meta: RenderMeta,
    focusedDay: number
  ): RenderView
  context(id: VizCanvasId): Ctx2D | undefined
  detach(id: VizCanvasId): void
  markDirty(id: VizCanvasId): void
  hasDirty(): boolean
  drainDirty(): ReadonlySet<VizCanvasId>
  clearDirty(): void
  flush(): void
  destroy(): void
}

/** Creates surface lifecycle storage for the driver-owned painter. */
export function createVizSurfaceController(
  budget: FrameBudget
): VizSurfaceController {
  const contexts = new Map<VizCanvasId, Ctx2D>()
  const views = createVizSurfaceViews()
  const dirty = new Set<VizCanvasId>()

  function setCanvas(
    id: VizCanvasId,
    ctx: CanvasRenderingContext2D | null
  ): void {
    if (ctx) contexts.set(id, instrumentContext(ctx, budget))
    else contexts.delete(id)
  }
  function setViewport(id: VizCanvasId, viewport: VizViewport): void {
    views.setViewport(id, viewport)
  }
  function setGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void {
    views.setGeometry(id, geometry)
  }
  function buildView(
    id: VizCanvasId,
    quality: Quality,
    meta: RenderMeta,
    focusedDay: number
  ): RenderView {
    return views.build(id, quality, meta, budget, focusedDay)
  }
  function context(id: VizCanvasId): Ctx2D | undefined {
    return contexts.get(id)
  }
  function detach(id: VizCanvasId): void {
    contexts.delete(id)
    views.delete(id)
    dirty.delete(id)
  }
  function markDirty(id: VizCanvasId): void {
    dirty.add(id)
  }
  function hasDirty(): boolean {
    return dirty.size > 0
  }
  function drainDirty(): ReadonlySet<VizCanvasId> {
    const targets = new Set(dirty)
    dirty.clear()
    return targets
  }
  function clearDirty(): void {
    dirty.clear()
  }
  function flush(): void {
    for (const [id, ctx] of contexts) flushContext(contexts, id, ctx)
  }
  function destroy(): void {
    contexts.clear()
    dirty.clear()
    for (const id of ['graph', 'ribbon', 'overview'] as const) views.delete(id)
  }
  return {
    setCanvas,
    setViewport,
    setGeometry,
    buildView,
    context,
    detach,
    markDirty,
    hasDirty,
    drainDirty,
    clearDirty,
    flush,
    destroy,
  }
}

function flushContext(
  contexts: Map<VizCanvasId, Ctx2D>,
  id: VizCanvasId,
  ctx: Ctx2D
): void {
  try {
    ctx.getImageData(0, 0, 1, 1)
  } catch {
    contexts.delete(id)
  }
}
