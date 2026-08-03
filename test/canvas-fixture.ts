class MissingCanvasContextError extends Error {
  constructor() {
    super('canvas did not provide a 2d context')
    this.name = 'MissingCanvasContextError'
  }
}

/**
 * @description Creates a native browser canvas context for Chromium-backed tests.
 * @param width Backing-store width in device pixels.
 * @param height Backing-store height in device pixels.
 * @returns A native two-dimensional canvas context.
 * @throws {MissingCanvasContextError} When the browser cannot create the context.
 */
export function make2d(width = 8, height = 8): CanvasRenderingContext2D {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) throw new MissingCanvasContextError()
  return context
}
