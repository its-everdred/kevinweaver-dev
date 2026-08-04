import { AG_SEMANTIC_MAX } from '@/lib/viz/tokens/ramp'
import type { SimState } from '@/lib/viz/sim/types'

import {
  CAPS,
  calendarMarkers,
  type Ctx2D,
  type CalendarMarker,
  type GridSeries,
  type RenderTheme,
  type RenderView,
} from './budget'

/** Fixed detail-window shape, independent of contribution payload size. */
export const RIBBON_WEEKS = 53
export const RIBBON_WINDOW_DAYS = 371

const MONTH_LABELS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
] as const

/** Integer device-pixel lattice geometry for the detail ribbon. */
export interface RibbonGeometry {
  readonly cellPx: number
  readonly gapPx: number
  readonly stepPx: number
  readonly originXPx: number
  readonly originYPx: number
  readonly gutterPx: number
  readonly monthStripPx: number
}

/** Mutable, caller-owned cache for one detail-ribbon canvas. */
export interface RibbonLayer {
  readonly grid: GridSeries
  bitmap: OffscreenCanvas | HTMLCanvasElement | null
  bitmapKey: string
  winStartDay: number
  followPlayhead: boolean
  calendar: readonly CalendarMarker[] | null
}

/** Creates the cache shell without allocating canvas memory. */
export function createRibbonLayer(grid: GridSeries): RibbonLayer {
  return {
    grid,
    bitmap: null,
    bitmapKey: '',
    winStartDay: 0,
    followPlayhead: true,
    calendar: null,
  }
}

/** Calculates the square, isotropic backing-store lattice for the current viewport. */
export function ribbonGeometry(view: RenderView): RibbonGeometry {
  const { dpr, pxHeight, pxWidth } = view.viewport
  const gutterPx = Math.round(28 * dpr)
  const monthStripPx = Math.round(20 * dpr)
  const footerPx = Math.round(14 * dpr)
  const gapPx = Math.max(1, Math.round(2.5 * dpr))
  const byWidth = Math.floor((pxWidth - gutterPx) / RIBBON_WEEKS) - gapPx
  const byHeight = Math.floor((pxHeight - monthStripPx - footerPx) / 7) - gapPx
  const cellPx = Math.max(1, Math.min(byWidth, byHeight))
  const stepPx = cellPx + gapPx
  const blockWPx = RIBBON_WEEKS * stepPx
  const originXPx =
    gutterPx + Math.max(0, Math.floor((pxWidth - gutterPx - blockWPx) / 2))
  return {
    cellPx,
    gapPx,
    stepPx,
    originXPx,
    originYPx: monthStripPx,
    gutterPx,
    monthStripPx,
  }
}

/** Applies the three-day drift hysteresis while the detail view follows the playhead. */
export function nextWinStart(
  prevWinStart: number,
  cursorDayInt: number,
  dayCount: number,
  followPlayhead: boolean
): number {
  if (!followPlayhead) return prevWinStart
  const maxStart = Math.max(0, dayCount - RIBBON_WINDOW_DAYS)
  const target = clamp(
    cursorDayInt - Math.floor(RIBBON_WINDOW_DAYS / 2),
    0,
    maxStart
  )
  return Math.abs(target - prevWinStart) > 3 ? target : prevWinStart
}

/** Pins the detail window to a user-selected day until the owner restores following. */
export function setRibbonWindow(layer: RibbonLayer, dayIndex: number): void {
  const maxStart = Math.max(0, layer.grid.dayCount - RIBBON_WINDOW_DAYS)
  layer.winStartDay = clamp(Math.floor(dayIndex), 0, maxStart)
  layer.followPlayhead = false
}

/** Resolves a CSS-pixel pointer position to one visible contribution day. */
export function ribbonHitTest(
  geom: RibbonGeometry,
  view: RenderView,
  layer: RibbonLayer,
  cssX: number,
  cssY: number
): number {
  const xPx = cssX * view.viewport.dpr
  const yPx = cssY * view.viewport.dpr
  const week = Math.floor((xPx - geom.originXPx) / geom.stepPx)
  const weekday = Math.floor((yPx - geom.originYPx) / geom.stepPx)
  if (week < 0 || week >= RIBBON_WEEKS || weekday < 0 || weekday > 6) return -1
  const cellX = xPx - geom.originXPx - week * geom.stepPx
  const cellY = yPx - geom.originYPx - weekday * geom.stepPx
  if (cellX >= geom.cellPx || cellY >= geom.cellPx) return -1
  const day = layer.winStartDay + week * 7 + weekday
  return day >= 0 && day < layer.grid.dayCount ? day : -1
}

/** Renders the cached contribution lattice and deterministic current-frame chrome. */
export function renderRibbon(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  layer: RibbonLayer
): void {
  const geom = ribbonGeometry(view)
  layer.winStartDay = nextWinStart(
    layer.winStartDay,
    state.cursorDayInt,
    layer.grid.dayCount,
    layer.followPlayhead
  )
  ctx.clearRect(0, 0, view.viewport.pxWidth, view.viewport.pxHeight)
  if (layer.grid.dayCount === 0) return
  drawRibbonCells(ctx, view, layer, geom)
  drawRibbonChrome(ctx, state, view, layer, geom)
}

function drawRibbonCells(
  ctx: Ctx2D,
  view: RenderView,
  layer: RibbonLayer,
  geom: RibbonGeometry
): void {
  const key = [
    view.viewport.pxWidth,
    view.viewport.pxHeight,
    geom.stepPx,
    view.theme.lv.join(','),
    view.theme.ag.join(','),
    view.theme.token.bgH,
    view.theme.token.bg2,
  ].join('x')
  if (layer.bitmapKey !== key) buildRibbonBitmap(layer, geom, view.theme, key)
  if (layer.bitmap) {
    drawCachedWindow(ctx, layer.bitmap, layer.winStartDay, geom)
    return
  }
  drawVisibleCells(ctx, layer.grid, layer.winStartDay, geom, view.theme)
}

function buildRibbonBitmap(
  layer: RibbonLayer,
  geom: RibbonGeometry,
  theme: RenderTheme,
  key: string
): void {
  layer.bitmapKey = key
  layer.bitmap = null
  const weeks = Math.ceil(layer.grid.dayCount / 7)
  const width = (weeks + 1) * geom.stepPx
  const height = 7 * geom.stepPx
  if (
    width < 1 ||
    width > CAPS.maxBitmapEdgePx ||
    height > CAPS.maxBitmapEdgePx
  )
    return
  const bitmap = createBitmap(width, height)
  if (!bitmap) return
  const cacheContext = bitmap.getContext('2d')
  if (!cacheContext) return
  drawGridCells(cacheContext, layer.grid, 0, weeks, geom, theme, 0, 0)
  layer.bitmap = bitmap
}

function drawCachedWindow(
  ctx: Ctx2D,
  bitmap: OffscreenCanvas | HTMLCanvasElement,
  winStartDay: number,
  geom: RibbonGeometry
): void {
  const week = Math.floor(winStartDay / 7)
  const weekday = positiveModulo(winStartDay, 7)
  const sourceWidth = RIBBON_WEEKS * geom.stepPx
  const sourceX = week * geom.stepPx
  const upperHeight = (7 - weekday) * geom.stepPx
  ctx.drawImage(
    bitmap,
    sourceX,
    weekday * geom.stepPx,
    sourceWidth,
    upperHeight,
    geom.originXPx,
    geom.originYPx,
    sourceWidth,
    upperHeight
  )
  if (weekday === 0) return
  const lowerHeight = weekday * geom.stepPx
  ctx.drawImage(
    bitmap,
    sourceX + geom.stepPx,
    0,
    sourceWidth,
    lowerHeight,
    geom.originXPx,
    geom.originYPx + upperHeight,
    sourceWidth,
    lowerHeight
  )
}

function drawVisibleCells(
  ctx: Ctx2D,
  grid: GridSeries,
  winStartDay: number,
  geom: RibbonGeometry,
  theme: RenderTheme
): void {
  drawGridCells(
    ctx,
    grid,
    winStartDay,
    RIBBON_WEEKS,
    geom,
    theme,
    geom.originXPx,
    geom.originYPx
  )
}

function drawGridCells(
  ctx: Ctx2D,
  grid: GridSeries,
  startDay: number,
  weeks: number,
  geom: RibbonGeometry,
  theme: RenderTheme,
  originXPx: number,
  originYPx: number
): void {
  for (let week = 0; week < weeks; week += 1) {
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = startDay + week * 7 + weekday
      if (day < 0 || day >= grid.dayCount) continue
      const x = originXPx + week * geom.stepPx
      const y = originYPx + weekday * geom.stepPx
      drawCell(ctx, grid, day, x, y, geom, theme)
    }
  }
}

function drawCell(
  ctx: Ctx2D,
  grid: GridSeries,
  day: number,
  xPx: number,
  yPx: number,
  geom: RibbonGeometry,
  theme: RenderTheme
): void {
  const total = valueAt(grid.total, day)
  const agent = valueAt(grid.agent, day)
  const level = Math.min(9, valueAt(grid.level, day))
  ctx.fillStyle = theme.lv[level] ?? theme.token.bg1
  ctx.fillRect(xPx, yPx, geom.cellPx, geom.cellPx)
  if (level === 0) {
    ctx.strokeStyle = theme.token.bg2
    ctx.lineWidth = 1
    ctx.strokeRect(xPx, yPx, geom.cellPx, geom.cellPx)
  }
  if (agent === 0 || total === 0) return
  const share = Math.min(1, agent / total)
  const height = Math.max(1, Math.round(geom.cellPx * share))
  ctx.fillStyle =
    theme.ag[Math.min(level, AG_SEMANTIC_MAX)] ?? theme.token.purple
  ctx.fillRect(xPx, yPx + geom.cellPx - height, geom.cellPx, height)
  if (agent >= total) return
  ctx.save()
  ctx.globalAlpha = 0.5
  ctx.fillStyle = theme.token.bgH
  ctx.fillRect(xPx, yPx + geom.cellPx - height, geom.cellPx, 1)
  ctx.restore()
}

function drawRibbonChrome(
  ctx: Ctx2D,
  state: SimState,
  view: RenderView,
  layer: RibbonLayer,
  geom: RibbonGeometry
): void {
  drawWeekdayLabels(ctx, view.theme, geom)
  drawMonthLabels(ctx, view.theme, layer, geom, view.viewport.dpr)
  drawPlayhead(ctx, state, view, layer, geom)
  drawTodayRing(ctx, state, view, layer, geom)
  drawBirthRule(ctx, view, layer, geom)
  drawFocusRing(ctx, view, layer, geom)
}

function drawWeekdayLabels(
  ctx: Ctx2D,
  theme: RenderTheme,
  geom: RibbonGeometry
): void {
  const labels = ['sun', '', 'tue', '', 'thu', '', 'sat']
  ctx.font = `600 ${theme.fontPx.micro}px ${theme.fontFamily}`
  ctx.textAlign = 'left'
  for (let day = 0; day < labels.length; day += 1) {
    const label = labels[day]
    if (!label) continue
    ctx.fillStyle = theme.token.fg4
    ctx.fillText(
      label,
      0,
      geom.originYPx + day * geom.stepPx + geom.cellPx * 0.78
    )
  }
}

function drawMonthLabels(
  ctx: Ctx2D,
  theme: RenderTheme,
  layer: RibbonLayer,
  geom: RibbonGeometry,
  dpr: number
): void {
  const markers = layer.calendar ?? calendarMarkers(layer.grid)
  layer.calendar = markers
  ctx.font = `600 ${theme.fontPx.micro}px ${theme.fontFamily}`
  ctx.textAlign = 'left'
  ctx.fillStyle = theme.token.fg4
  let lastLabelX = Number.NEGATIVE_INFINITY
  for (const marker of markers) {
    const offset = marker.day - layer.winStartDay
    if (offset < 0 || offset >= RIBBON_WINDOW_DAYS) continue
    const x = geom.originXPx + Math.floor(offset / 7) * geom.stepPx
    if (x - lastLabelX < 26 * dpr) continue
    ctx.fillText(monthLabel(marker.month), x, geom.monthStripPx - 1)
    lastLabelX = x
  }
}

function drawPlayhead(
  ctx: Ctx2D,
  state: SimState,
  view: RenderView,
  layer: RibbonLayer,
  geom: RibbonGeometry
): void {
  const offset = state.cursorDayInt - layer.winStartDay
  if (offset < 0 || offset >= RIBBON_WINDOW_DAYS) return
  const week = Math.floor(offset / 7)
  const weekday = offset % 7
  const x = geom.originXPx + week * geom.stepPx
  const y = geom.originYPx + weekday * geom.stepPx
  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.fillStyle = view.theme.token.fg0
  ctx.fillRect(
    x - 1,
    geom.originYPx - geom.gapPx,
    geom.cellPx + 2,
    7 * geom.stepPx + 2
  )
  ctx.restore()
  ctx.save()
  ctx.globalAlpha = 0.42
  ctx.strokeStyle = view.theme.token.fg0
  ctx.lineWidth = 1
  ctx.strokeRect(x, y, geom.cellPx, geom.cellPx)
  ctx.restore()
}

function drawTodayRing(
  ctx: Ctx2D,
  state: SimState,
  view: RenderView,
  layer: RibbonLayer,
  geom: RibbonGeometry
): void {
  const day = layer.grid.dayCount - 1
  const offset = day - layer.winStartDay
  if (offset < 0 || offset >= RIBBON_WINDOW_DAYS) return
  const wave = 0.3 + 0.5 * Math.abs(Math.sin(state.tick / 45))
  const x = geom.originXPx + Math.floor(offset / 7) * geom.stepPx
  const y = geom.originYPx + (offset % 7) * geom.stepPx
  ctx.save()
  ctx.globalAlpha = wave
  ctx.strokeStyle = view.theme.token.green
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    x - geom.gapPx,
    y - geom.gapPx,
    geom.cellPx + geom.gapPx * 2,
    geom.cellPx + geom.gapPx * 2
  )
  ctx.restore()
}

function drawBirthRule(
  ctx: Ctx2D,
  view: RenderView,
  layer: RibbonLayer,
  geom: RibbonGeometry
): void {
  const birth = layer.grid.agentBirthDay
  const offset = birth - layer.winStartDay
  if (birth < 0 || offset < 0 || offset >= RIBBON_WINDOW_DAYS) return
  const x = geom.originXPx + Math.floor(offset / 7) * geom.stepPx - geom.gapPx
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.fillStyle = view.theme.token.purple
  ctx.fillRect(x, geom.originYPx - geom.gapPx, 2, 7 * geom.stepPx + geom.gapPx)
  ctx.restore()
  if (!view.meta.agentBirthLabel) return
  ctx.font = `800 ${view.theme.fontPx.micro}px ${view.theme.fontFamily}`
  ctx.textAlign = 'left'
  ctx.fillStyle = view.theme.token.purple
  ctx.fillText(
    view.meta.agentBirthLabel,
    x + geom.gapPx * 2,
    view.viewport.pxHeight - 2
  )
}

function drawFocusRing(
  ctx: Ctx2D,
  view: RenderView,
  layer: RibbonLayer,
  geom: RibbonGeometry
): void {
  const offset = view.focusedDay - layer.winStartDay
  if (view.focusedDay < 0 || offset < 0 || offset >= RIBBON_WINDOW_DAYS) return
  const x = geom.originXPx + Math.floor(offset / 7) * geom.stepPx
  const y = geom.originYPx + (offset % 7) * geom.stepPx
  ctx.strokeStyle = view.theme.token.fg0
  ctx.lineWidth = 2
  ctx.strokeRect(
    x - geom.gapPx,
    y - geom.gapPx,
    geom.cellPx + geom.gapPx * 2,
    geom.cellPx + geom.gapPx * 2
  )
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

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function monthLabel(month: number): string {
  return MONTH_LABELS[month - 1] ?? ''
}
