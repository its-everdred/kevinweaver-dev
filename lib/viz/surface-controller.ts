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

/**
 * @description Owns consumer surface lifecycle state without scheduling animation frames.
 */
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
  paintContext(id: VizCanvasId): Ctx2D | undefined
  detach(id: VizCanvasId): void
  markDirty(id: VizCanvasId): void
  hasDirty(): boolean
  drainDirty(): ReadonlySet<VizCanvasId>
  clearDirty(): void
  flush(): void
  destroy(): void
}

/**
 * @description Creates surface lifecycle storage for the driver-owned painter.
 * @param budget - Shared draw-call budget instrumented across attached contexts.
 * @returns Surface context, geometry, dirtiness, and flush state for one driver.
 */
export function createVizSurfaceController(
  budget: FrameBudget
): VizSurfaceController {
  return new SurfaceController(budget)
}

class SurfaceController implements VizSurfaceController {
  readonly #contexts = new Map<VizCanvasId, Ctx2D>()
  readonly #views = createVizSurfaceViews()
  readonly #dirty = new Set<VizCanvasId>()

  constructor(private readonly budget: FrameBudget) {}

  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void {
    if (ctx) this.#contexts.set(id, instrumentContext(ctx, this.budget))
    else this.#contexts.delete(id)
  }
  setViewport(id: VizCanvasId, viewport: VizViewport): void {
    this.#views.setViewport(id, viewport)
  }
  setGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void {
    this.#views.setGeometry(id, geometry)
  }
  buildView(
    id: VizCanvasId,
    quality: Quality,
    meta: RenderMeta,
    focusedDay: number
  ): RenderView {
    return this.#views.build(id, quality, meta, this.budget, focusedDay)
  }
  paintContext(id: VizCanvasId): Ctx2D | undefined {
    const ctx = this.#contexts.get(id)
    if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0)
    return ctx
  }
  detach(id: VizCanvasId): void {
    this.#contexts.delete(id)
    this.#views.delete(id)
    this.#dirty.delete(id)
  }
  markDirty(id: VizCanvasId): void {
    this.#dirty.add(id)
  }
  hasDirty(): boolean {
    return this.#dirty.size > 0
  }
  drainDirty(): ReadonlySet<VizCanvasId> {
    const targets = new Set(this.#dirty)
    this.#dirty.clear()
    return targets
  }
  clearDirty(): void {
    this.#dirty.clear()
  }
  flush(): void {
    for (const [id, ctx] of this.#contexts) this.flushContext(id, ctx)
  }
  destroy(): void {
    this.#contexts.clear()
    this.#dirty.clear()
    for (const id of ['graph', 'ribbon', 'overview'] as const)
      this.#views.delete(id)
  }
  private flushContext(id: VizCanvasId, ctx: Ctx2D): void {
    try {
      ctx.getImageData(0, 0, 1, 1)
    } catch {
      this.#contexts.delete(id)
    }
  }
}
