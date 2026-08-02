import { createVizSurfaceAdapter } from './surfaces'
import type { VizCanvasId, VizViewport } from './driver'
import type { VizSurfaceController } from './surface-controller'
import type {
  VizPointer,
  VizSurfaceAdapter,
  VizSurfaceAttachment,
  VizSurfaceGeometry,
  VizSurfaceId,
} from './surfaces'

/**
 * @description Driver-owned hooks that preserve scheduling and pointer authority.
 */
export interface VizSurfaceApiHooks {
  readonly state: { readonly dayCount: number }
  onDirty(): void
  onPointer(id: VizSurfaceId, point: VizPointer | null): void
  onEmptyDirty(): void
  seekDay(day: number): Promise<unknown>
}

/**
 * @description Public and internal surface methods exposed by the driver.
 */
export interface VizDriverSurfaceApi {
  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void
  setViewport(id: VizCanvasId, viewport: VizViewport): void
  setSurfaceGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void
  detachCanvas(id: VizCanvasId): void
  invalidateCanvas(id: VizCanvasId): void
  setSurfacePointer(id: VizSurfaceId, point: VizPointer | null): void
  attach(attachment: VizSurfaceAttachment): void
  detach(id: VizSurfaceId): void
  resize(id: VizSurfaceId, geometry: VizSurfaceGeometry): void
  invalidate(id: VizSurfaceId): void
  setPointer(id: VizSurfaceId, point: VizPointer | null): void
  scrubTo(fraction: number): void
  destroy(): void
}

/**
 * @description Creates the driver's surface delegation without animation-frame ownership.
 * @param controller - Surface storage used by the driver-owned painter.
 * @param hooks - Driver callbacks for scheduling, pointer intake, and seeking.
 * @returns The internal and public surface API exposed by the driver.
 */
export function createVizDriverSurfaceApi(
  controller: VizSurfaceController,
  hooks: VizSurfaceApiHooks
): VizDriverSurfaceApi {
  return new DriverSurfaceApi(controller, hooks)
}

class DriverSurfaceApi implements VizDriverSurfaceApi {
  readonly #adapter: VizSurfaceAdapter

  constructor(
    private readonly controller: VizSurfaceController,
    private readonly hooks: VizSurfaceApiHooks
  ) {
    this.#adapter = createVizSurfaceAdapter(this)
  }

  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void {
    this.controller.setCanvas(id, ctx)
  }
  setViewport(id: VizCanvasId, viewport: VizViewport): void {
    this.controller.setViewport(id, viewport)
  }
  setSurfaceGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void {
    this.controller.setGeometry(id, geometry)
  }
  detachCanvas(id: VizCanvasId): void {
    this.controller.detach(id)
    if (!this.controller.hasDirty()) this.hooks.onEmptyDirty()
  }
  invalidateCanvas(id: VizCanvasId): void {
    this.controller.markDirty(id)
    this.hooks.onDirty()
  }
  setSurfacePointer(id: VizSurfaceId, point: VizPointer | null): void {
    this.hooks.onPointer(id, point)
  }
  attach(attachment: VizSurfaceAttachment): void {
    this.#adapter.attach(attachment)
  }
  detach(id: VizSurfaceId): void {
    this.#adapter.detach(id)
  }
  resize(id: VizSurfaceId, geometry: VizSurfaceGeometry): void {
    this.#adapter.resize(id, geometry)
  }
  invalidate(id: VizSurfaceId): void {
    this.#adapter.invalidate(id)
  }
  setPointer(id: VizSurfaceId, point: VizPointer | null): void {
    this.#adapter.setPointer(id, point)
  }
  scrubTo(fraction: number): void {
    this.#adapter.scrubTo(fraction)
  }
  destroy(): void {
    this.#adapter.destroy()
  }
  get state(): { readonly dayCount: number } {
    return this.hooks.state
  }
  seekDay(day: number): Promise<unknown> {
    return this.hooks.seekDay(day)
  }
}
