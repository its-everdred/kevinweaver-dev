import type { VizCanvasId } from './driver'

/** Tracks consumer surfaces awaiting a driver-owned paint. */
export interface VizSurfaceInvalidations {
  mark(id: VizCanvasId): void
  remove(id: VizCanvasId): void
  drain(): ReadonlySet<VizCanvasId>
  clear(): void
}

/** Creates dirty-surface state without owning an animation frame. */
export function createVizSurfaceInvalidations(): VizSurfaceInvalidations {
  const dirty = new Set<VizCanvasId>()
  return {
    mark: (id) => dirty.add(id),
    remove: (id) => dirty.delete(id),
    drain: () => {
      const targets = new Set(dirty)
      dirty.clear()
      return targets
    },
    clear: () => dirty.clear(),
  }
}
