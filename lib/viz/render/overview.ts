import type { SimState } from '@/lib/viz/sim/types'

import {
  CAPS,
  calendarMarkers,
  type CalendarMarker,
  type Ctx2D,
  type GridSeries,
  type RenderTheme,
  type RenderView,
} from './budget'
import { RIBBON_WINDOW_DAYS } from './ribbon'

/** Geometry for the intentionally non-square, gapless overview minimap. */
export interface OverviewGeometry {
  readonly weeks: number
  readonly cwPx: number
  readonly chPx: number
  readonly labelStripPx: number
  readonly dayCount: number
}

/** Mutable bitmap cache for the overview canvas. */
export interface OverviewLayer {
  readonly grid: GridSeries
  bitmap: OffscreenCanvas | HTMLCanvasElement | null
  bitmapKey: string
  calendar: readonly CalendarMarker[] | null
}

/** Creates an overview cache shell without allocating a canvas. */
export function createOverviewLayer(grid: GridSeries): OverviewLayer {
  return { grid, bitmap: null, bitmapKey: '', calendar: null }
}

/** Derives minimap geometry from the backing store and supplied data length. */
export function overviewGeometry(
  view: RenderView,
  grid: GridSeries
): OverviewGeometry {
  const weeks = Math.max(1, Math.ceil(grid.dayCount / 7))
  const labelStripPx = Math.round(10 * view.viewport.dpr)
  return {
    weeks,
    cwPx: view.viewport.pxWidth / weeks,
    chPx: Math.max(1, (view.viewport.pxHeight - labelStripPx) / 7),
    labelStripPx,
    dayCount: grid.dayCount,
  }
}

/** Maps a CSS-pixel x coordinate to a clamped contribution day index. */
export function overviewDayAtX(
  geom: OverviewGeometry,
  view: RenderView,
  cssX: number
): number {
  if (geom.dayCount === 0) return -1
  const dayCount = Math.max(1, geom.dayCount)
  const xPx = cssX * view.viewport.dpr
  return clamp(Math.floor(xPx / geom.cwPx) * 7, 0, dayCount - 1)
}

/** Renders cached minimap cells, the window brush, and the reverse-playback cursor. */
export function renderOverview(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  layer: OverviewLayer,
  winStartDay: number
): void {
  const geom = overviewGeometry(view, layer.grid)
  ctx.clearRect(0, 0, view.viewport.pxWidth, view.viewport.pxHeight)
  drawOverviewCells(ctx, view, layer, geom)
  drawYearMarkers(ctx, view.theme, layer, geom)
  drawBirthRule(ctx, view, layer.grid, geom)
  drawWindowBrush(ctx, view, geom, layer.grid.dayCount, winStartDay)
  drawPlayhead(ctx, view, geom, layer.grid.dayCount, state.cursorDayInt)
}

function drawOverviewCells(
  ctx: Ctx2D,
  view: RenderView,
  layer: OverviewLayer,
  geom: OverviewGeometry
): void {
  const key = `${view.viewport.pxWidth}x${view.viewport.pxHeight}x${view.theme.lv.join(',')}`
  if (layer.bitmapKey !== key) buildOverviewBitmap(layer, view.theme, geom, key)
  if (layer.bitmap) {
    ctx.drawImage(layer.bitmap, 0, 0)
    return
  }
  drawGrid(ctx, layer.grid, geom, view.theme)
}

function buildOverviewBitmap(
  layer: OverviewLayer,
  theme: RenderTheme,
  geom: OverviewGeometry,
  key: string
): void {
  layer.bitmapKey = key
  layer.bitmap = null
  const width = Math.ceil(geom.weeks * geom.cwPx)
  const height = Math.ceil(geom.labelStripPx + geom.chPx * 7)
  if (
    width < 1 ||
    height < 1 ||
    width > CAPS.maxBitmapEdgePx ||
    height > CAPS.maxBitmapEdgePx
  )
    return
  const bitmap = createBitmap(width, height)
  if (!bitmap) return
  const cacheContext = bitmap.getContext('2d')
  if (!cacheContext) return
  drawGrid(cacheContext, layer.grid, geom, theme)
  layer.bitmap = bitmap
}

function drawGrid(
  ctx: Ctx2D,
  grid: GridSeries,
  geom: OverviewGeometry,
  theme: RenderTheme
): void {
  for (let week = 0; week < geom.weeks; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = week * 7 + weekday
      if (day >= grid.dayCount) continue
      drawOverviewCell(
        ctx,
        grid,
        day,
        week * geom.cwPx,
        geom.labelStripPx + weekday * geom.chPx,
        geom,
        theme
      )
    }
  }
}

function drawOverviewCell(
  ctx: Ctx2D,
  grid: GridSeries,
  day: number,
  x: number,
  y: number,
  geom: OverviewGeometry,
  theme: RenderTheme
): void {
  const level = Math.min(9, valueAt(grid.level, day))
  const width = Math.max(1, geom.cwPx - 0.4)
  const height = Math.max(1, geom.chPx - 0.4)
  ctx.fillStyle = theme.lv[level] ?? theme.token.bg1
  ctx.fillRect(x, y, width, height)
}

function drawYearMarkers(
  ctx: Ctx2D,
  theme: RenderTheme,
  layer: OverviewLayer,
  geom: OverviewGeometry
): void {
  const markers = layer.calendar ?? calendarMarkers(layer.grid)
  layer.calendar = markers
  for (const marker of markers) {
    if (marker.day !== 0 && marker.month !== 1) continue
    const x = (marker.day / 7) * geom.cwPx
    ctx.fillStyle = theme.token.bg2
    ctx.fillRect(x, geom.labelStripPx - 2, 1, geom.chPx * 7 + 2)
    ctx.font = `700 ${theme.fontPx.micro}px ${theme.fontFamily}`
    ctx.textAlign = 'left'
    ctx.fillStyle = theme.token.gray
    ctx.fillText(String(marker.year), x + 4, geom.labelStripPx - 3)
  }
}

function drawBirthRule(
  ctx: Ctx2D,
  view: RenderView,
  grid: GridSeries,
  geom: OverviewGeometry
): void {
  if (grid.agentBirthDay < 0 || grid.agentBirthDay >= grid.dayCount) return
  const x = (grid.agentBirthDay / 7) * geom.cwPx
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.fillStyle = view.theme.token.purple
  ctx.fillRect(
    x - 1,
    geom.labelStripPx - 2,
    2,
    view.viewport.pxHeight - geom.labelStripPx + 2
  )
  ctx.restore()
}

function drawWindowBrush(
  ctx: Ctx2D,
  view: RenderView,
  geom: OverviewGeometry,
  dayCount: number,
  winStartDay: number
): void {
  if (dayCount === 0) return
  const start = clamp(winStartDay, 0, Math.max(0, dayCount - 1))
  const end = clamp(start + RIBBON_WINDOW_DAYS, 0, dayCount)
  const x0 = (start / 7) * geom.cwPx
  const x1 = (end / 7) * geom.cwPx
  const height = view.viewport.pxHeight - geom.labelStripPx
  ctx.save()
  ctx.globalAlpha = 0.6
  ctx.fillStyle = view.theme.token.bgH
  ctx.fillRect(0, geom.labelStripPx, x0, height)
  ctx.fillRect(x1, geom.labelStripPx, view.viewport.pxWidth - x1, height)
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = 0.75
  ctx.strokeStyle = view.theme.token.fg0
  ctx.lineWidth = 1.5
  ctx.strokeRect(x0, geom.labelStripPx, x1 - x0, height)
  ctx.restore()
}

function drawPlayhead(
  ctx: Ctx2D,
  view: RenderView,
  geom: OverviewGeometry,
  dayCount: number,
  cursorDay: number
): void {
  if (dayCount === 0 || cursorDay < 0 || cursorDay >= dayCount) return
  const x = (cursorDay / 7) * geom.cwPx
  ctx.save()
  ctx.globalAlpha = 0.9
  ctx.fillStyle = view.theme.token.fg0
  ctx.fillRect(
    x,
    geom.labelStripPx - 4,
    1,
    view.viewport.pxHeight - geom.labelStripPx + 4
  )
  ctx.restore()
}

function createBitmap(width: number, height: number): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  return new OffscreenCanvas(width, height)
}

function valueAt(values: Uint16Array | Uint8Array, index: number): number {
  return values[index] ?? 0
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value))
}
