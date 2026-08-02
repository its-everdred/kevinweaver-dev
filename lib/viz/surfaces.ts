import type { VizCanvasId, VizViewport } from './driver'

/** Identifies a consumer-managed canvas surface. */
export type VizSurfaceId = 'overview' | 'ribbon' | 'gource'

/** Resolved canvas dimensions and typography supplied by the owning surface. */
export interface VizSurfaceGeometry extends VizViewport {
  readonly deviceWidth: number
  readonly deviceHeight: number
  readonly font: {
    readonly micro: number
    readonly small: number
    readonly mono: number
  }
}

/** Couples a consumer-owned context to one driver render surface. */
export interface VizSurfaceAttachment {
  readonly id: VizSurfaceId
  readonly ctx: CanvasRenderingContext2D
  readonly geometry: VizSurfaceGeometry
}

/** The local CSS-pixel pointer coordinate supplied by an instrument surface. */
export interface VizPointer {
  readonly x: number
  readonly y: number
}

/** The driver hooks used by instrument surfaces. */
export interface VizSurfaceDriver {
  readonly state: { readonly dayCount: number }
  setCanvas(id: VizCanvasId, ctx: CanvasRenderingContext2D | null): void
  setViewport(id: VizCanvasId, viewport: VizViewport): void
  setSurfaceGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void
  detachCanvas(id: VizCanvasId): void
  invalidateCanvas(id: VizCanvasId): void
  setSurfacePointer(id: VizSurfaceId, point: VizPointer | null): void
  seekDay(day: number): Promise<unknown>
}

/** The consumer-facing bridge for canvas lifecycle and scrub input. */
export interface VizSurfaceAdapter {
  attach(attachment: VizSurfaceAttachment): void
  detach(id: VizSurfaceId): void
  resize(id: VizSurfaceId, geometry: VizSurfaceGeometry): void
  invalidate(id: VizSurfaceId): void
  setPointer(id: VizSurfaceId, point: VizPointer | null): void
  scrubTo(fraction: number): void
  destroy(): void
}

/** Creates a lifecycle adapter without taking ownership of animation scheduling. */
export function createVizSurfaceAdapter(
  driver: VizSurfaceDriver
): VizSurfaceAdapter {
  return new SurfaceAdapter(driver)
}

class SurfaceAdapter implements VizSurfaceAdapter {
  readonly #attached = new Set<VizSurfaceId>()

  constructor(private readonly driver: VizSurfaceDriver) {}

  attach(attachment: VizSurfaceAttachment): void {
    const id = canvasIdForSurface(attachment.id)
    this.driver.setCanvas(id, attachment.ctx)
    this.driver.setSurfaceGeometry(id, attachment.geometry)
    this.#attached.add(attachment.id)
    this.invalidate(attachment.id)
  }
  detach(id: VizSurfaceId): void {
    this.driver.setSurfacePointer(id, null)
    this.driver.detachCanvas(canvasIdForSurface(id))
    this.#attached.delete(id)
  }
  resize(id: VizSurfaceId, geometry: VizSurfaceGeometry): void {
    this.driver.setSurfaceGeometry(canvasIdForSurface(id), geometry)
    this.invalidate(id)
  }
  invalidate(id: VizSurfaceId): void {
    this.driver.invalidateCanvas(canvasIdForSurface(id))
  }
  setPointer(id: VizSurfaceId, point: VizPointer | null): void {
    this.driver.setSurfacePointer(id, point)
  }
  scrubTo(fraction: number): void {
    const day = Math.round(
      clampFraction(fraction) * Math.max(0, this.driver.state.dayCount - 1)
    )
    void this.driver.seekDay(day)
  }
  destroy(): void {
    for (const id of [...this.#attached]) this.detach(id)
  }
}

function canvasIdForSurface(id: VizSurfaceId): VizCanvasId {
  return id === 'gource' ? 'graph' : id
}

function clampFraction(value: number): number {
  if (Number.isNaN(value) || value === -Infinity) return 0
  if (value === Infinity) return 1
  return Math.min(1, Math.max(0, value))
}
