import type { DagLayout } from './layout'
import type { PlaybackFrame } from './types'

/** Theme colors injected by the host so the renderer stays host-agnostic. */
export interface DagTheme {
  readonly background: string
  readonly directory: string
  readonly file: string
  readonly liveFile: string
  readonly contributor: string
  readonly beam: string
  readonly label: string
}

export const DEFAULT_THEME: DagTheme = {
  background: '#1d2021',
  directory: '#5c6370',
  file: '#3b4252',
  liveFile: '#98c379',
  contributor: '#61afef',
  beam: '#56b6c2',
  label: '#abb2bf',
}

/** Rendered surface metrics for one frame. */
export interface RenderMetrics {
  readonly width: number
  readonly height: number
  readonly dpr: number
}

/** Public draw state for a single frame. */
export interface DagRenderState {
  readonly layout: DagLayout
  readonly frame: PlaybackFrame
  /** Map of file path to its file node id. */
  readonly pathToNode: ReadonlyMap<string, string>
}

function project(
  metrics: RenderMetrics,
  x: number,
  y: number
): { readonly x: number; readonly y: number } {
  return { x: x * metrics.width, y: y * metrics.height }
}

/**
 * @description Paints one aiur-dag frame onto a 2D canvas context.
 * @param ctx The canvas 2D context.
 * @param metrics Surface dimensions.
 * @param state Layout plus playback frame.
 * @param theme Color palette.
 */
export function renderDag(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  state: DagRenderState,
  theme: DagTheme = DEFAULT_THEME
): void {
  ctx.clearRect(0, 0, metrics.width, metrics.height)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, metrics.width, metrics.height)

  drawBeams(ctx, metrics, state, theme)
  drawFiles(ctx, metrics, state, theme)
  drawContributor(ctx, metrics, state, theme)
  drawProgress(ctx, metrics, state, theme)
}

function drawBeams(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  state: DagRenderState,
  theme: DagTheme
): void {
  const contributor = project(metrics, state.layout.center.x, state.layout.center.y)
  ctx.strokeStyle = theme.beam
  ctx.lineWidth = 1.5
  ctx.globalAlpha = 0.7
  for (const path of state.frame.currentFiles) {
    const nodeId = state.pathToNode.get(path)
    if (!nodeId) continue
    const position = state.layout.positions.get(nodeId)
    if (!position) continue
    const target = project(metrics, position.x, position.y)
    ctx.beginPath()
    ctx.moveTo(contributor.x, contributor.y)
    ctx.lineTo(target.x, target.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
}

function drawFiles(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  state: DagRenderState,
  theme: DagTheme
): void {
  for (const [nodeId, position] of state.layout.positions) {
    const point = project(metrics, position.x, position.y)
    const live = state.frame.liveFiles.has(nodeId)
    ctx.fillStyle = live ? theme.liveFile : theme.file
    ctx.beginPath()
    ctx.arc(point.x, point.y, live ? 3.5 : 2.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawContributor(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  state: DagRenderState,
  theme: DagTheme
): void {
  const center = project(metrics, state.layout.center.x, state.layout.center.y)
  ctx.fillStyle = theme.contributor
  ctx.beginPath()
  ctx.arc(center.x, center.y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = theme.label
  ctx.font = '600 10px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('kw', center.x, center.y + 3)
}

function drawProgress(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  state: DagRenderState,
  theme: DagTheme
): void {
  const width = metrics.width * 0.4
  const x = (metrics.width - width) / 2
  const y = metrics.height - 14
  ctx.fillStyle = theme.directory
  ctx.fillRect(x, y, width, 3)
  ctx.fillStyle = theme.contributor
  ctx.fillRect(x, y, width * state.frame.progress, 3)
}
