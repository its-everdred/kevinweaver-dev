import { DISC_FIELD_RADIUS, starKey } from './galaxy'
import { resolveContributors, starFor, type ContributorNode } from './contributors'
import type { StarPosition, UniverseLayout } from './galaxy'
import type { UniverseFrame } from './universePlayback'
import type { UniverseActor } from './types'

/** Theme colors injected by the host so the renderer stays host-agnostic. */
export interface UniverseTheme {
  readonly background: string
  readonly star: string
  readonly liveStar: string
  readonly currentStar: string
  readonly galaxyHalo: string
  readonly galaxyCore: string
  readonly label: string
  readonly repoLabel: string
  readonly contributor: string
  readonly agent: string
}

export const DEFAULT_UNIVERSE_THEME: UniverseTheme = {
  background: '#1d2021',
  star: '#5c6370',
  liveStar: '#81a1c1',
  currentStar: '#98c379',
  galaxyHalo: 'rgba(59,66,82,0.22)',
  galaxyCore: '#4b5263',
  label: '#abb2bf',
  repoLabel: '#d8dee9',
  contributor: '#61afef',
  agent: '#c678dd',
}

/** Surface metrics for a galaxy-rendered frame, in device pixels. */
export interface UniverseMetrics {
  readonly width: number
  readonly height: number
}

/** Pointer position in device pixels, or null when not hovering. */
export interface UniversePointer {
  readonly x: number
  readonly y: number
}

/** Result of a hover hit-test. */
export interface StarHit {
  readonly repo: string
  readonly file: string
  readonly x: number
  readonly y: number
}

/** Public draw state for one galaxy-cluster frame. */
export interface UniverseRenderState {
  readonly layout: UniverseLayout
  readonly frame: UniverseFrame
  readonly pointer: UniversePointer | null
  /** Contributor node positions, resolved by the host from the frame. */
  readonly contributors: readonly ContributorNode[]
}

/** Fraction of each axis the disc halo covers, just outside the star field. */
const HALO_SCALE = DISC_FIELD_RADIUS + 0.02
const LABEL_OFFSET_PX = 8
const HIT_RADIUS_PX = 8

function starRadiusPx(metrics: UniverseMetrics): number {
  return Math.max(1, Math.min(3, metrics.width / 900))
}

/**
 * @description Paints one galaxy-cluster frame onto a 2D canvas context.
 * @param ctx The canvas 2D context.
 * @param metrics Surface dimensions in device pixels.
 * @param state Layout plus universe frame and pointer.
 * @param theme Color palette.
 */
export function renderUniverse(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme = DEFAULT_UNIVERSE_THEME
): void {
  ctx.clearRect(0, 0, metrics.width, metrics.height)
  ctx.fillStyle = theme.background
  ctx.fillRect(0, 0, metrics.width, metrics.height)

  const px = starRadiusPx(metrics)
  const hit = hoverHit(metrics, state)
  drawDiscCore(ctx, metrics, theme, px)
  drawStars(ctx, metrics, state, theme, px)
  drawCurrentStars(ctx, metrics, state, theme, px)
  drawContributorBeams(ctx, metrics, state, theme)
  drawContributors(ctx, metrics, state, theme)
  drawRepoLabels(ctx, metrics, state, theme)
  if (hit) drawHitLabel(ctx, metrics, hit, theme)
  drawProgress(ctx, metrics, state, theme)
}

function starPixel(metrics: UniverseMetrics, star: StarPosition): { x: number; y: number } {
  return { x: star.x * metrics.width, y: star.y * metrics.height }
}

function isLive(state: UniverseRenderState, star: StarPosition): boolean {
  return state.frame.liveFiles.has(starKey(star.repoId, star.file))
}

function isCurrent(state: UniverseRenderState, star: StarPosition): boolean {
  return state.frame.currentFiles.includes(starKey(star.repoId, star.file))
}

function drawDiscCore(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  theme: UniverseTheme,
  px: number
): void {
  const cx = metrics.width / 2
  const cy = metrics.height / 2
  // One halo for the whole disc: the universe is a single galaxy, not sixty.
  ctx.fillStyle = theme.galaxyHalo
  ctx.beginPath()
  ctx.ellipse(cx, cy, metrics.width * HALO_SCALE, metrics.height * HALO_SCALE, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = theme.galaxyCore
  ctx.beginPath()
  ctx.arc(cx, cy, Math.max(2, px * 2.4), 0, Math.PI * 2)
  ctx.fill()
}

function drawStars(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme,
  px: number
): void {
  // Batch every non-current star into one path for the whole disc.
  ctx.fillStyle = theme.star
  ctx.beginPath()
  for (const star of state.layout.stars) {
    if (isCurrent(state, star)) continue
    const point = starPixel(metrics, star)
    const radius = isLive(state, star) ? px * 1.6 : px * 1.2
    ctx.moveTo(point.x + radius, point.y)
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  }
  ctx.fill()
}

function drawCurrentStars(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme,
  px: number
): void {
  ctx.fillStyle = theme.currentStar
  for (const star of state.layout.stars) {
    if (!isCurrent(state, star)) continue
    const point = starPixel(metrics, star)
    ctx.beginPath()
    ctx.arc(point.x, point.y, px * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawRepoLabels(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme
): void {
  ctx.font = '600 11px monospace'
  ctx.textAlign = 'center'
  ctx.fillStyle = theme.repoLabel
  for (const repo of state.layout.repos) {
    const x = repo.x * metrics.width
    const y = repo.y * metrics.height - LABEL_OFFSET_PX
    ctx.fillText(shortName(repo.name), x, y)
  }
}

function shortName(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

function drawContributorBeams(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme
): void {
  // Map each current contribution's actor to a contributor position.
  for (const contributor of state.contributors) {
    const activeStars: { x: number; y: number }[] = []
    for (const contribution of state.frame.currentContributions) {
      if (contribution.actor !== contributor.actor) continue
      const point = starPositionFor(state.layout, metrics, contribution.repo, contribution.file)
      if (point) activeStars.push(point)
    }
    if (activeStars.length === 0) continue
    ctx.strokeStyle =
      contributor.actor === 0 ? theme.contributor : theme.agent
    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.75
    const originX = contributor.x * metrics.width
    const originY = contributor.y * metrics.height
    for (const star of activeStars) {
      ctx.beginPath()
      ctx.moveTo(originX, originY)
      ctx.lineTo(star.x, star.y)
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

function starPositionFor(
  layout: UniverseLayout,
  metrics: UniverseMetrics,
  repoId: number,
  file: string
): { x: number; y: number } | null {
  const index = layout.starIndex.get(starKey(repoId, file))
  const star = index === undefined ? undefined : layout.stars[index]
  return star ? starPixel(metrics, star) : null
}

function drawContributors(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme
): void {
  for (const contributor of state.contributors) {
    const color =
      contributor.actor === 0 ? theme.contributor : theme.agent
    const x = contributor.x * metrics.width
    const y = contributor.y * metrics.height
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, contributor.active ? 7 : 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = theme.background
    ctx.font = '800 8px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(contributor.actor === 0 ? 'kw' : 'ak', x, y + 3)
  }
}

function drawProgress(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme
): void {
  const width = metrics.width * 0.4
  const x = (metrics.width - width) / 2
  const y = metrics.height - 12
  ctx.fillStyle = theme.star
  ctx.fillRect(x, y, width, 3)
  ctx.fillStyle = theme.contributor
  ctx.fillRect(x, y, width * state.frame.progress, 3)
}

function drawHitLabel(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  hit: StarHit,
  theme: UniverseTheme
): void {
  const label = `${shortRepo(hit.repo)}/${hit.file}`
  const padX = 6
  const padY = 3
  ctx.font = '600 11px monospace'
  ctx.textAlign = 'left'
  const textWidth = ctx.measureText(label).width
  const boxX = Math.min(hit.x + 12, metrics.width - textWidth - padX * 2)
  const boxY = hit.y - 30
  ctx.fillStyle = 'rgba(29,32,33,0.9)'
  ctx.fillRect(boxX, boxY, textWidth + padX * 2, 18 + padY)
  ctx.strokeStyle = theme.label
  ctx.lineWidth = 1
  ctx.strokeRect(boxX, boxY, textWidth + padX * 2, 18 + padY)
  ctx.fillStyle = theme.label
  ctx.fillText(label, boxX + padX, boxY + 15)
}

function shortRepo(name: string): string {
  const slash = name.lastIndexOf('/')
  return slash < 0 ? name : name.slice(slash + 1)
}

function hoverHit(
  metrics: UniverseMetrics,
  state: UniverseRenderState
): StarHit | null {
  const pointer = state.pointer
  if (!pointer) return null
  for (const star of state.layout.stars) {
    const point = starPixel(metrics, star)
    const dx = pointer.x - point.x
    const dy = pointer.y - point.y
    if (dx * dx + dy * dy >= HIT_RADIUS_PX * HIT_RADIUS_PX) continue
    return { repo: repoName(state.layout, star.repoId), file: star.file, x: point.x, y: point.y }
  }
  return null
}

function repoName(layout: UniverseLayout, repoId: number): string {
  return layout.repos.find((repo) => repo.repoId === repoId)?.name ?? String(repoId)
}
