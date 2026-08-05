import type { GalaxyLayout, StarPosition, UniverseLayout } from './galaxy'
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

/** A contributor node to draw, with its label and per-actor color. */
export interface ContributorNode {
  readonly actor: UniverseActor
  readonly x: number
  readonly y: number
  readonly active: boolean
}

/** Public draw state for one galaxy-cluster frame. */
export interface UniverseRenderState {
  readonly layout: UniverseLayout
  readonly frame: UniverseFrame
  readonly pointer: UniversePointer | null
  /** Contributor node positions, resolved by the host from the frame. */
  readonly contributors: readonly ContributorNode[]
}

function starKey(repoId: number, file: string): string {
  return `${repoId}:${file}`
}

function starRadiusPx(metrics: UniverseMetrics): number {
  return Math.max(1, Math.min(3, metrics.width / 900))
}

/**
 * @description Resolves contributor node positions from a frame and layout.
 * @param layout The universe layout.
 * @param frame The current universe frame.
 * @param metrics Surface dimensions.
 * @returns One contributor node per actor that has current contributions,
 * positioned at the centroid of its current stars; absent actors are omitted.
 */
export function resolveContributors(
  layout: UniverseLayout,
  frame: UniverseFrame,
  metrics: UniverseMetrics
): readonly ContributorNode[] {
  const nodes: ContributorNode[] = []
  for (const actor of [0, 1] as const) {
    const points: { x: number; y: number }[] = []
    for (const contribution of frame.currentContributions) {
      if (contribution.actor !== actor) continue
      const point = starPositionFor(layout, metrics, contribution.repo, contribution.file)
      if (point) points.push(point)
    }
    if (points.length === 0) continue
    const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length
    nodes.push({ actor, x: cx / metrics.width, y: cy / metrics.height, active: true })
  }
  return nodes
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
  drawGalaxyStars(ctx, metrics, state, theme, px)
  drawCurrentStars(ctx, metrics, state, theme, px)
  drawContributorBeams(ctx, metrics, state, theme)
  drawContributors(ctx, metrics, state, theme)
  drawRepoLabels(ctx, metrics, state, theme)
  if (hit) drawHitLabel(ctx, metrics, hit, theme)
  drawProgress(ctx, metrics, state, theme)
}

function starPixel(
  metrics: UniverseMetrics,
  galaxy: GalaxyLayout,
  star: StarPosition
): { x: number; y: number } {
  const cx = galaxy.x * metrics.width
  const cy = galaxy.y * metrics.height
  const radiusPx = galaxy.radius * Math.min(metrics.width, metrics.height)
  return {
    x: cx + (star.x - 0.5) * radiusPx * 2,
    y: cy + (star.y - 0.5) * radiusPx * 2,
  }
}

function isLive(state: UniverseRenderState, galaxy: GalaxyLayout, star: StarPosition): boolean {
  return state.frame.liveFiles.has(starKey(galaxy.repoId, star.file))
}

function isCurrent(state: UniverseRenderState, galaxy: GalaxyLayout, star: StarPosition): boolean {
  const key = starKey(galaxy.repoId, star.file)
  return state.frame.currentFiles.includes(key)
}

function drawGalaxyStars(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme,
  px: number
): void {
  for (const galaxy of state.layout.galaxies) {
    const cx = galaxy.x * metrics.width
    const cy = galaxy.y * metrics.height
    const radiusPx = galaxy.radius * Math.min(metrics.width, metrics.height)

    // Halo behind the galaxy.
    ctx.fillStyle = theme.galaxyHalo
    ctx.beginPath()
    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2)
    ctx.fill()

    // Core so even a one-star repo reads as a galaxy.
    ctx.fillStyle = theme.galaxyCore
    ctx.beginPath()
    ctx.arc(cx, cy, Math.max(2, px * 1.8), 0, Math.PI * 2)
    ctx.fill()

    // Batch every non-current star in one path per galaxy.
    ctx.fillStyle = theme.star
    ctx.beginPath()
    for (const star of galaxy.stars) {
      if (isCurrent(state, galaxy, star)) continue
      const point = starPixel(metrics, galaxy, star)
      const live = isLive(state, galaxy, star)
      ctx.moveTo(point.x + px, point.y)
      ctx.arc(point.x, point.y, live ? px * 1.6 : px * 1.2, 0, Math.PI * 2)
    }
    ctx.fill()
  }
}

function drawCurrentStars(
  ctx: CanvasRenderingContext2D,
  metrics: UniverseMetrics,
  state: UniverseRenderState,
  theme: UniverseTheme,
  px: number
): void {
  ctx.fillStyle = theme.currentStar
  for (const galaxy of state.layout.galaxies) {
    for (const star of galaxy.stars) {
      if (!isCurrent(state, galaxy, star)) continue
      const point = starPixel(metrics, galaxy, star)
      ctx.beginPath()
      ctx.arc(point.x, point.y, px * 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
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
  for (const galaxy of state.layout.galaxies) {
    const radiusPx = galaxy.radius * Math.min(metrics.width, metrics.height)
    ctx.fillStyle = theme.repoLabel
    ctx.fillText(shortName(galaxy.name), galaxy.x * metrics.width, galaxy.y * metrics.height - radiusPx - 8)
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
  for (const galaxy of layout.galaxies) {
    if (galaxy.repoId !== repoId) continue
    for (const star of galaxy.stars) {
      if (star.file !== file) continue
      return starPixel(metrics, galaxy, star)
    }
  }
  return null
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
  const hitRadiusPx = 8
  for (const galaxy of state.layout.galaxies) {
    const cx = galaxy.x * metrics.width
    const cy = galaxy.y * metrics.height
    const radiusPx = galaxy.radius * Math.min(metrics.width, metrics.height)
    const gdx = pointer.x - cx
    const gdy = pointer.y - cy
    if (gdx * gdx + gdy * gdy > (radiusPx + hitRadiusPx) * (radiusPx + hitRadiusPx)) continue
    for (const star of galaxy.stars) {
      const point = starPixel(metrics, galaxy, star)
      const dx = pointer.x - point.x
      const dy = pointer.y - point.y
      if (dx * dx + dy * dy < hitRadiusPx * hitRadiusPx) {
        return { repo: galaxy.name, file: star.file, x: point.x, y: point.y }
      }
    }
  }
  return null
}
