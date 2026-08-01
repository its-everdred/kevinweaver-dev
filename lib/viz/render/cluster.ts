import { randomHash } from '@/lib/viz/sim/rng'

import {
  CAPS,
  type Ctx2D,
  type Quality,
  type RenderTheme,
  type RenderView,
} from './budget'

/** Cached private-repository texture, built outside the frame path. */
export interface ClusterTile {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  readonly sizePx: number
  readonly mode: 'blur' | 'hatch'
}

/** Reports whether this canvas implementation preserves a requested filter value. */
export function supportsCanvasFilter(ctx: Ctx2D): boolean {
  const previous = ctx.filter
  try {
    ctx.filter = 'blur(2px)'
    return ctx.filter === 'blur(2px)'
  } finally {
    ctx.filter = previous || 'none'
  }
}

/** Builds a deterministic private-volume tile with one filtered draw at most. */
export function buildClusterTile(
  theme: RenderTheme,
  quality: Quality,
  sizePx: number,
  seed: number
): ClusterTile {
  const edge = clampEdge(sizePx)
  const source = createOffscreenCanvas(edge)
  const output = createOffscreenCanvas(edge)
  const sourceContext = getCanvasContext(source)
  const outputContext = getCanvasContext(output)
  const blur =
    quality.clusterMode === 'blur' && supportsCanvasFilter(outputContext)

  if (blur) {
    drawBlobSource(sourceContext, theme, edge, seed)
    let filteredDrawCalls = 0
    outputContext.save()
    try {
      outputContext.filter = 'blur(9px)'
      outputContext.drawImage(source, 0, 0)
      filteredDrawCalls += 1
    } finally {
      outputContext.filter = 'none'
      outputContext.restore()
    }
    assertClusterFilterBudget(filteredDrawCalls)
    return { canvas: output, sizePx: edge, mode: 'blur' }
  }

  drawHatch(outputContext, theme, edge, seed)
  return { canvas: output, sizePx: edge, mode: 'hatch' }
}

/** Blits the cluster at an integer, axis-aligned destination and labels its treatment. */
export function renderCluster(
  ctx: Ctx2D,
  tile: ClusterTile,
  xPx: number,
  yPx: number,
  view: RenderView,
  labelledBy: string
): void {
  if (!Number.isInteger(xPx) || !Number.isInteger(yPx)) {
    throw new RangeError(
      'private cluster requires integer device-pixel coordinates'
    )
  }
  ctx.drawImage(tile.canvas, xPx, yPx)
  drawClusterRing(ctx, tile, xPx, yPx, view.theme)
  if (labelledBy.length === 0) return
  ctx.font = `700 ${view.theme.fontPx.micro}px ${view.theme.fontFamily}`
  ctx.textAlign = 'center'
  ctx.fillStyle = view.theme.token.bg4
  ctx.fillText(
    labelledBy,
    xPx + tile.sizePx / 2,
    yPx + tile.sizePx + view.theme.fontPx.micro
  )
}

function clampEdge(sizePx: number): number {
  if (!Number.isFinite(sizePx)) return 1
  return Math.max(1, Math.min(CAPS.maxBitmapEdgePx, Math.floor(sizePx)))
}

function createOffscreenCanvas(sizePx: number): OffscreenCanvas {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new CanvasCacheUnavailableError()
  }
  return new OffscreenCanvas(sizePx, sizePx)
}

function getCanvasContext(
  canvas: OffscreenCanvas
): OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new CanvasCacheUnavailableError()
  return context
}

function drawBlobSource(
  ctx: Ctx2D,
  theme: RenderTheme,
  edge: number,
  seed: number
): void {
  ctx.clearRect(0, 0, edge, edge)
  ctx.beginPath()
  for (let index = 0; index < 60; index += 1) {
    const x = randomHash(seed, index) * edge
    const y = randomHash(seed + 1, index) * edge
    const radius = (randomHash(seed + 2, index) * 0.12 + 0.035) * edge
    ctx.arc(x, y, radius, 0, Math.PI * 2)
  }
  ctx.fillStyle = theme.token.bg2
  ctx.fill()
}

function drawHatch(
  ctx: Ctx2D,
  theme: RenderTheme,
  edge: number,
  seed: number
): void {
  ctx.clearRect(0, 0, edge, edge)
  ctx.beginPath()
  ctx.arc(edge / 2, edge / 2, edge / 2, 0, Math.PI * 2)
  ctx.fillStyle = theme.token.bg2
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = theme.token.bg3
  ctx.lineWidth = 1
  const spacing = Math.max(
    4,
    Math.floor(edge * (0.04 + randomHash(seed, edge) * 0.02))
  )
  for (let x = -edge; x < edge * 2; x += spacing) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + edge, edge)
    ctx.stroke()
  }
  ctx.restore()
}

function drawClusterRing(
  ctx: Ctx2D,
  tile: ClusterTile,
  xPx: number,
  yPx: number,
  theme: RenderTheme
): void {
  const radius = tile.sizePx / 2
  ctx.save()
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = theme.token.bg3
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(xPx + radius, yPx + radius, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function assertClusterFilterBudget(filteredDrawCalls: number): void {
  if (filteredDrawCalls <= CAPS.maxFilteredDrawCallsPerBuild) return
  throw new ClusterFilterBudgetError()
}

class CanvasCacheUnavailableError extends Error {
  constructor() {
    super('offscreen canvas is unavailable for a private repository cluster')
    this.name = 'CanvasCacheUnavailableError'
  }
}

class ClusterFilterBudgetError extends Error {
  constructor() {
    super('private cluster exceeded its filtered draw-call budget')
    this.name = 'ClusterFilterBudgetError'
  }
}
