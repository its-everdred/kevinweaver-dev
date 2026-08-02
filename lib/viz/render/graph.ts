import { isLive, liveIdsAscending, repoPhase } from '@/lib/viz/sim/cursor'
import {
  MAX_BEAMS,
  PHASE_ABSENT,
  PHASE_GHOST,
  PHASE_LIVE,
  type SimState,
} from '@/lib/viz/sim/types'

import { buildClusterTile, renderCluster, type ClusterTile } from './cluster'
import {
  CAPS,
  type Ctx2D,
  type RenderMeta,
  type RenderTheme,
  type RenderView,
  type TokenName,
} from './budget'

/** Field projection shared by repositories, files, beams, and actors. */
export interface GraphProjection {
  readonly padXPx: number
  readonly padYPx: number
  readonly fieldWPx: number
  readonly fieldHPx: number
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly repoRadiusScale: number
  readonly repoBudget: number
}

/** Raster sprites and the device-pixel scale they were built for. */
export interface SpriteAtlas {
  readonly dpr: number
  readonly human: readonly SpriteFrame[]
  readonly agent: readonly SpriteFrame[]
}

interface SpriteFrame {
  readonly canvas: OffscreenCanvas | HTMLCanvasElement
  readonly zoom: number
}

/** Mutable cache objects retained by the graph canvas owner. */
export interface GraphLayer {
  sprites: SpriteAtlas | null
  cluster: ClusterTile | null
  clusterKey: string
  liveScratch: Int32Array
}

export const SPRITE_W = 27
export const SPRITE_H = 31

export const EVERDRED_PXA = [
  '               K           ',
  '     K   K   KKhK          ',
  '    KhKKKhKKKhhKKKKK       ',
  '  KKKhKhhhhhhHHhhhhhKKK    ',
  ' KhhKhhHhHHHHhHHHhHHhhhK   ',
  '  KKhHHhHHHhhHHhhHHHhKK    ',
  '   KhhHhHhHHHHHHHHHhHhhK   ',
  '  KhHHhHhHhhHHhHHhHHhHhK   ',
  ' KhhHHHhHhHHhHHhHHhHHhHhK  ',
  ' KhHhHHHHHHHHhHHhHHhHHHHhK ',
  ' KhhHhHHHHHhhhHhHHHHHhHhKhK',
  'KhHHhHhHKfffffhHhHhHHHhhKK ',
  'KhHhHhHKfgggggfhffhHhHHhK  ',
  'KhHHhHHKgiiiiigfhgfhHhHHhK ',
  ' KhHhHKfiiiiiiigfifhfhHhK  ',
  ' KhHHHKgiiiiiiiiiigfifHhK  ',
  ' KhHHKfiiiiiiiiiiiiiigHhK  ',
  ' KhHHKgiiiiiiiiiiiiiiihhK  ',
  '  KhHKiiKKKKKiiiKKKKiihKhK ',
  ' KhhhKiKKKKKKiiiKKKKKihKK  ',
  ' KhghiiiiKKiiiiiiKKiiihK   ',
  ' KhghiiiiKKiiiiiiKKiiihK   ',
  '  KhggiiiffiiiiiiffiighK   ',
  '   KhfgiiiiiiggggiiiihK    ',
  '    KhfgiiiifiiiifiighK    ',
  '     KhfgiigfiiiifighK     ',
  '      KhfgfggffffighK      ',
  '       KhfgffggggghK       ',
  '        KhhgggggghK        ',
  '         KKhhhhhhK         ',
  '           KKKKKK          ',
] as const

export const APPLEKID_PXA = [
  '                           ',
  '                           ',
  '                           ',
  '                           ',
  '       KKKKKKKKKKKKK       ',
  '       KCCCCCCCCCCCK       ',
  '       KCCCCCCCCCCCK       ',
  '       KCSSSSSSSSSCK       ',
  '       KCSSSSSSSSSCK       ',
  '       KCSSSSSSSSSCK       ',
  '       KCSSeSSSeSSCK       ',
  '       KCSSSSSSSSSCK       ',
  '       KCSSSSESSSSCK       ',
  '       KCSSSSSSSSSCK       ',
  '       KCSSSSSSSSSCK       ',
  '       KCCCCCCCCCCCK       ',
  '       KCCCCCCCCCCCK       ',
  '       KKKKKKKKKKKKKl      ',
  '    KKKKKKKKKKKKKKKaaKK    ',
  '    KcccccccccccccccccK    ',
  '    KccccKKcccccKKccccK    ',
  '    KccccKKcccccKKccccK    ',
  '    KccccKKcccccKKccccK    ',
  '    KccccKKcccccKKccccK    ',
  '    KccccKKcccccKKccccK    ',
  '    KKKKKKKKKKKKKKKKKKK    ',
  '         KK     KK         ',
  '         KK     KK         ',
  '         KK     KK         ',
  '         KK     KK         ',
  '                           ',
] as const

export const SPRITE_PALETTE: Readonly<Record<string, TokenName>> = {
  K: 'fg0',
  h: 'bg2',
  H: 'bg3',
  f: 'fg2',
  g: 'fg3',
  i: 'fg4',
  s: 'aquaD',
  C: 'purpleD',
  c: 'purple',
  S: 'bgH',
  e: 'green',
  E: 'greenD',
  a: 'red',
  l: 'green',
}

/** Allocates the graph's declared mutable surface once per canvas lifecycle. */
export function createGraphLayer(entityCount: number): GraphLayer {
  return {
    sprites: null,
    cluster: null,
    clusterKey: '',
    liveScratch: new Int32Array(Math.max(0, entityCount)),
  }
}

/** Derives responsive graph margins without changing the simulation's unit positions. */
export function graphProjection(view: RenderView): GraphProjection {
  const { dpr, pxHeight, pxWidth, cssWidth } = view.viewport
  const padXPx = clamp(16 * dpr, 0.04 * pxWidth, 40 * dpr)
  const padYPx = clamp(16 * dpr, 0.04 * pxHeight, 40 * dpr)
  const fieldWPx = Math.max(1, pxWidth - padXPx * 2)
  const fieldHPx = Math.max(1, pxHeight - padYPx * 2)
  const rx = fieldWPx * 0.42
  const ry = fieldHPx * 0.38
  return {
    padXPx,
    padYPx,
    fieldWPx,
    fieldHPx,
    cx: padXPx + fieldWPx * 0.5,
    cy: padYPx + fieldHPx * 0.46,
    rx,
    ry,
    repoRadiusScale: Math.max(1, Math.min(rx, ry) / 24),
    repoBudget: cssWidth < 1080 ? 12 : CAPS.maxRepoCircles,
  }
}

/** Maps a normalized simulation coordinate into integer-independent device space. */
export function project(
  proj: GraphProjection,
  nx: number,
  ny: number
): { x: number; y: number } {
  return { x: projectX(proj, nx), y: projectY(proj, ny) }
}

/** Paints the reverse-Gource graph from state alone, mutating only cache fields on its layer. */
export function renderGraph(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  layer: GraphLayer
): void {
  const proj = graphProjection(view)
  ctx.clearRect(0, 0, view.viewport.pxWidth, view.viewport.pxHeight)
  ctx.fillStyle = view.theme.paneSurface
  ctx.fillRect(0, 0, view.viewport.pxWidth, view.viewport.pxHeight)
  if (state.repoCount === 0) return
  drawBeams(state, ctx, view, proj)
  drawRepositories(state, ctx, view, proj)
  drawFiles(state, ctx, view, layer, proj)
  drawRepoLabels(state, ctx, view, proj)
  drawPrivateCluster(state, ctx, view, layer, proj)
  drawActors(state, ctx, view, layer, proj)
  drawConvergence(state, ctx, view, proj)
}

/** Builds the design-token sprite cache at a mount-owned lifecycle boundary. */
export function createSpriteAtlas(
  theme: RenderTheme,
  dpr: number
): SpriteAtlas | null {
  const createCanvas = (
    width: number,
    height: number
  ): OffscreenCanvas | HTMLCanvasElement | null => {
    if (typeof OffscreenCanvas !== 'undefined')
      return new OffscreenCanvas(width, height)
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  const human = createFrames(EVERDRED_PXA, theme, createCanvas)
  const agent = createFrames(APPLEKID_PXA, theme, createCanvas)
  if (!human || !agent) return null
  return { dpr: Math.max(1, Math.round(dpr)), human, agent }
}

function drawBeams(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  proj: GraphProjection
): void {
  for (let offset = 0; offset < MAX_BEAMS; offset += 1) {
    const index = positiveModulo(state.beamHead - 1 - offset, MAX_BEAMS)
    const life = valueAt(state.beamLife, index)
    const entity = valueAt(state.beamEnt, index)
    if (life <= 0 || !isLive(state, entity)) continue
    const repoId = valueAt(state.repoOf, entity)
    if (repoId < 0 || repoId >= state.repoCount) continue
    const actor = valueAt(state.beamActor, index)
    const repoX = repoCenterX(state, proj, repoId)
    const repoY = repoCenterY(state, proj, repoId)
    const radius = repoRadiusAt(state, proj, repoId)
    const fileX = repoX + valueAt(state.px, entity) * radius
    const fileY = repoY + valueAt(state.py, entity) * radius
    const actorX = projectX(proj, valueAt(state.actorX, actor))
    const actorY = projectY(proj, valueAt(state.actorY, actor))
    ctx.save()
    ctx.globalAlpha = clamp(life, 0, 1) * 0.9
    ctx.strokeStyle = beamColor(view.theme, valueAt(state.beamKind, index))
    ctx.lineWidth = actor === 1 ? 2.2 : 1.4
    if (actor === 1) ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(actorX, actorY)
    ctx.lineTo(fileX, fileY)
    ctx.stroke()
    ctx.restore()
  }
}

function drawRepositories(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  proj: GraphProjection
): void {
  for (let repoId = 0; repoId < state.repoCount; repoId += 1) {
    if (!isSelectedRepo(state, repoId, proj.repoBudget)) continue
    const phase = repoPhase(state, repoId, state.cursorDayInt)
    if (phase === PHASE_ABSENT) continue
    if (phase === PHASE_GHOST) {
      drawGhostRepository(state, ctx, view, proj, repoId)
      continue
    }
    drawLiveRepository(state, ctx, view, proj, repoId)
  }
}

function drawGhostRepository(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  proj: GraphProjection,
  repoId: number
): void {
  const centerX = repoCenterX(state, proj, repoId)
  const centerY = repoCenterY(state, proj, repoId)
  const radius = repoRadiusAt(state, proj, repoId)
  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = view.theme.token.bg4
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawLiveRepository(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  proj: GraphProjection,
  repoId: number
): void {
  const centerX = repoCenterX(state, proj, repoId)
  const centerY = repoCenterY(state, proj, repoId)
  const radius = repoRadiusAt(state, proj, repoId)
  const meta = view.meta.repos[repoId]
  const actor = meta?.actor ?? 0
  ctx.save()
  ctx.globalAlpha = clamp(valueAt(state.repoAlpha, repoId), 0.34, 1)
  if (meta?.isPrivate) {
    drawPrivateRepository(ctx, view.theme, centerX, centerY, radius)
  } else {
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      radius
    )
    gradient.addColorStop(0, repositoryLevelColor(view.theme, state, repoId))
    gradient.addColorStop(1, view.theme.paneSurface)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = actorStroke(view.theme, actor)
    ctx.lineWidth = 1.5
    ctx.stroke()
    drawPrestigeHalo(
      ctx,
      view.theme,
      radius,
      centerX,
      centerY,
      meta?.stars ?? 0
    )
  }
  ctx.restore()
}

function drawPrivateRepository(
  ctx: Ctx2D,
  theme: RenderTheme,
  centerX: number,
  centerY: number,
  radius: number
): void {
  ctx.fillStyle = theme.token.bg1
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.clip()
  ctx.strokeStyle = theme.token.bg3
  ctx.lineWidth = 1
  for (let x = -radius * 2; x < radius * 2; x += 6) {
    ctx.beginPath()
    ctx.moveTo(centerX + x, centerY - radius)
    ctx.lineTo(centerX + x + radius * 2, centerY + radius)
    ctx.stroke()
  }
  ctx.restore()
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = theme.token.bg3
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.stroke()
}

function drawPrestigeHalo(
  ctx: Ctx2D,
  theme: RenderTheme,
  radius: number,
  centerX: number,
  centerY: number,
  stars: number
): void {
  const prestige = clamp((Math.log10(Math.max(0, stars) + 1) - 2) / 2.2, 0, 1)
  if (prestige <= 0.05) return
  ctx.save()
  ctx.globalAlpha = 0.18 + prestige * 0.6
  ctx.strokeStyle = theme.token.fg0
  ctx.lineWidth = 1 + prestige * 3
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function drawFiles(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  layer: GraphLayer,
  proj: GraphProjection
): void {
  const count = liveIdsAscending(state, layer.liveScratch)
  const maxFiles = Math.min(count, view.quality.maxFiles, CAPS.maxFileCircles)
  const maxLabels = Math.max(0, CAPS.maxFillText - CAPS.maxRepoCircles * 2 - 3)
  sortLiveFilesByHeat(layer.liveScratch, count, maxFiles, state)
  drawFileSpokes(state, ctx, view, layer.liveScratch, maxFiles, proj)
  let shadows = 0
  let labels = 0
  for (let index = 0; index < maxFiles; index += 1) {
    const entity = valueAt(layer.liveScratch, index)
    if (!isLive(state, entity)) continue
    const repoId = valueAt(state.repoOf, entity)
    if (
      repoId < 0 ||
      repoId >= state.repoCount ||
      !isSelectedRepo(state, repoId, proj.repoBudget)
    )
      continue
    if (repoPhase(state, repoId, state.cursorDayInt) !== PHASE_LIVE) continue
    const heat = clamp(valueAt(state.heat, entity), 0, 1)
    const centerX = repoCenterX(state, proj, repoId)
    const centerY = repoCenterY(state, proj, repoId)
    const radius = repoRadiusAt(state, proj, repoId)
    const fileX = centerX + valueAt(state.px, entity) * radius
    const fileY = centerY + valueAt(state.py, entity) * radius
    const level = Math.min(9, Math.max(0, Math.round(3 + heat * 6)))
    ctx.save()
    if (
      view.quality.shadows &&
      heat > 0.3 &&
      shadows < CAPS.maxShadowPrimitives
    ) {
      ctx.shadowColor = view.theme.lv[level] ?? view.theme.token.green
      ctx.shadowBlur = Math.min(10, Math.max(1, heat * 10))
      shadows += 1
    }
    ctx.fillStyle = view.theme.lv[level] ?? view.theme.token.green
    ctx.beginPath()
    ctx.arc(
      fileX,
      fileY,
      Math.max(1, valueAt(state.pr, entity) * radius),
      0,
      Math.PI * 2
    )
    ctx.fill()
    ctx.restore()
    if (!view.quality.fileLabels || heat <= 0.55 || labels >= maxLabels)
      continue
    ctx.font = `600 ${view.theme.fontPx.micro}px ${view.theme.fontFamily}`
    ctx.textAlign = 'left'
    ctx.fillStyle = view.theme.token.fg2
    ctx.fillText(view.meta.fileLabel(entity), fileX + 8, fileY + 3)
    labels += 1
  }
}

function drawFileSpokes(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  ids: Int32Array,
  count: number,
  proj: GraphProjection
): void {
  if (!view.quality.spokes) return
  let spokes = 0
  ctx.strokeStyle = view.theme.token.bg2
  ctx.lineWidth = 1
  ctx.beginPath()
  for (let index = 0; index < count && spokes < CAPS.maxSpokes; index += 1) {
    const entity = valueAt(ids, index)
    const repoId = valueAt(state.repoOf, entity)
    if (
      !isLive(state, entity) ||
      repoId < 0 ||
      repoId >= state.repoCount ||
      !isSelectedRepo(state, repoId, proj.repoBudget) ||
      repoPhase(state, repoId, state.cursorDayInt) !== PHASE_LIVE ||
      valueAt(state.heat, entity) <= 0.15
    )
      continue
    const centerX = repoCenterX(state, proj, repoId)
    const centerY = repoCenterY(state, proj, repoId)
    const radius = repoRadiusAt(state, proj, repoId)
    ctx.moveTo(centerX, centerY)
    ctx.lineTo(
      centerX + valueAt(state.px, entity) * radius,
      centerY + valueAt(state.py, entity) * radius
    )
    spokes += 1
  }
  if (spokes > 0) ctx.stroke()
}

function drawRepoLabels(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  proj: GraphProjection
): void {
  for (let repoId = 0; repoId < state.repoCount; repoId += 1) {
    if (!isSelectedRepo(state, repoId, proj.repoBudget)) continue
    const phase = repoPhase(state, repoId, state.cursorDayInt)
    if (phase === PHASE_ABSENT) continue
    const meta = view.meta.repos[repoId]
    const centerX = repoCenterX(state, proj, repoId)
    const centerY = repoCenterY(state, proj, repoId)
    const radius = repoRadiusAt(state, proj, repoId)
    const angle = valueAt(state.repoAngle, repoId)
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const x = centerX + cosine * (radius + 12)
    const y = centerY + sine * (radius + 12) + labelOffset(sine)
    ctx.font = `600 ${view.theme.fontPx.micro}px ${view.theme.fontFamily}`
    ctx.textAlign =
      Math.abs(cosine) < 0.35 ? 'center' : cosine > 0 ? 'left' : 'right'
    ctx.fillStyle =
      phase === PHASE_GHOST ? view.theme.token.fg4 : view.theme.token.fg2
    ctx.fillText(meta?.short ?? `repo-${repoId}`, x, y)
    if (phase === PHASE_GHOST || !meta || meta.stars <= 40) continue
    ctx.font = `700 ${view.theme.fontPx.micro}px ${view.theme.fontFamily}`
    ctx.fillStyle = view.theme.token.fg4
    ctx.fillText(starLabel(meta.stars), x, y + view.theme.fontPx.micro + 2)
  }
}

function drawPrivateCluster(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  layer: GraphLayer,
  proj: GraphProjection
): void {
  if (!hasPrivateRepository(view.meta)) return
  const sizePx = Math.max(1, Math.round(Math.min(proj.rx, proj.ry)))
  const key = clusterKey(view, state, sizePx)
  if (!layer.cluster || layer.clusterKey !== key) {
    try {
      layer.cluster = buildClusterTile(
        view.theme,
        view.quality,
        sizePx,
        state.dayCount + state.repoCount
      )
      layer.clusterKey = key
    } catch {
      return
    }
  }
  const tile = layer.cluster
  if (!tile) return
  renderCluster(
    ctx,
    tile,
    Math.round(proj.cx - tile.sizePx / 2),
    Math.round(proj.cy - tile.sizePx / 2),
    view,
    'private repos'
  )
}

function drawActors(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  layer: GraphLayer,
  proj: GraphProjection
): void {
  const dpr = Math.max(1, Math.round(view.viewport.dpr))
  const sprites = layer.sprites?.dpr === dpr ? layer.sprites : null
  drawActor(
    ctx,
    view,
    sprites,
    projectX(proj, valueAt(state.actorX, 0)),
    projectY(proj, valueAt(state.actorY, 0)),
    'human'
  )
  const birth = view.meta.agentBirthDay
  if (birth !== undefined && state.cursorDayInt < birth) return
  drawActor(
    ctx,
    view,
    sprites,
    projectX(proj, valueAt(state.actorX, 1)),
    projectY(proj, valueAt(state.actorY, 1)),
    'agent'
  )
}

function drawConvergence(
  state: SimState,
  ctx: Ctx2D,
  view: RenderView,
  proj: GraphProjection
): void {
  const birth = view.meta.agentBirthDay
  if (birth !== undefined && state.cursorDayInt < birth) return
  const y = proj.padYPx + proj.fieldHPx - view.theme.fontPx.micro * 1.5
  ctx.save()
  ctx.globalAlpha = 0.72
  ctx.strokeStyle = view.theme.token.purple
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(proj.padXPx, y)
  ctx.lineTo(proj.padXPx + proj.fieldWPx, y)
  ctx.stroke()
  ctx.restore()
  drawBirthCopy(ctx, view.theme, view.meta, proj.padXPx, y)
}

function drawBirthCopy(
  ctx: Ctx2D,
  theme: RenderTheme,
  meta: RenderMeta,
  x: number,
  y: number
): void {
  ctx.font = `800 ${theme.fontPx.micro}px ${theme.fontFamily}`
  ctx.textAlign = 'left'
  ctx.fillStyle = theme.token.purple
  if (meta.agentBirthLabel) ctx.fillText(meta.agentBirthLabel, x, y - 5)
  if (!meta.agentBirthSubLabel) return
  ctx.font = `600 ${theme.fontPx.micro}px ${theme.fontFamily}`
  ctx.fillStyle = theme.token.fg4
  ctx.fillText(meta.agentBirthSubLabel, x, y + theme.fontPx.micro + 3)
}

function drawActor(
  ctx: Ctx2D,
  view: RenderView,
  sprites: SpriteAtlas | null,
  x: number,
  y: number,
  actor: 'human' | 'agent'
): void {
  const frames = actor === 'human' ? sprites?.human : sprites?.agent
  const frame =
    frames?.[
      Math.min(
        frames.length - 1,
        Math.max(0, Math.round(view.viewport.dpr) - 1)
      )
    ]
  if (frame) {
    ctx.save()
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      frame.canvas,
      Math.round(x - (SPRITE_W * frame.zoom) / 2),
      Math.round(y - (SPRITE_H * frame.zoom) / 2)
    )
    ctx.restore()
    return
  }
  drawFallbackActor(ctx, view.theme, x, y, actor)
}

function drawFallbackActor(
  ctx: Ctx2D,
  theme: RenderTheme,
  x: number,
  y: number,
  actor: 'human' | 'agent'
): void {
  ctx.fillStyle = actor === 'human' ? theme.token.aqua : theme.token.purple
  if (actor === 'human') {
    ctx.beginPath()
    ctx.arc(x, y, 11, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillRect(Math.round(x - 9), Math.round(y - 9), 18, 18)
  }
  ctx.font = `800 ${theme.fontPx.micro}px ${theme.fontFamily}`
  ctx.textAlign = 'center'
  ctx.fillStyle = theme.token.bgH
  ctx.fillText(actor === 'human' ? 'kw' : 'ak', x, y + 3)
}

function createFrames(
  pixels: readonly string[],
  theme: RenderTheme,
  createCanvas: (
    width: number,
    height: number
  ) => OffscreenCanvas | HTMLCanvasElement | null
): readonly SpriteFrame[] | null {
  const frames: SpriteFrame[] = []
  for (const zoom of [1, 2, 3]) {
    const canvas = createCanvas(SPRITE_W * zoom, SPRITE_H * zoom)
    if (!canvas) return null
    const context = spriteContext(canvas)
    if (!context) return null
    context.imageSmoothingEnabled = false
    for (let y = 0; y < pixels.length; y += 1) {
      const row = pixels[y]
      if (!row) continue
      for (let x = 0; x < row.length; x += 1) {
        const token = SPRITE_PALETTE[row[x] ?? '']
        if (!token) continue
        context.fillStyle = theme.token[token]
        context.fillRect(x * zoom, y * zoom, zoom, zoom)
      }
    }
    frames.push({ canvas, zoom })
  }
  return frames
}

function spriteContext(
  canvas: OffscreenCanvas | HTMLCanvasElement
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null {
  if (isOffscreenSpriteCanvas(canvas)) {
    return canvas.getContext('2d')
  }
  return canvas.getContext('2d')
}

function isOffscreenSpriteCanvas(
  canvas: OffscreenCanvas | HTMLCanvasElement
): canvas is OffscreenCanvas {
  return (
    typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas
  )
}

function projectX(proj: GraphProjection, nx: number): number {
  return proj.padXPx + finite(nx) * proj.fieldWPx
}

function projectY(proj: GraphProjection, ny: number): number {
  return proj.padYPx + finite(ny) * proj.fieldHPx
}

function repoCenterX(
  state: SimState,
  proj: GraphProjection,
  repoId: number
): number {
  return projectX(proj, valueAt(state.repoX, repoId))
}

function repoCenterY(
  state: SimState,
  proj: GraphProjection,
  repoId: number
): number {
  return projectY(proj, valueAt(state.repoY, repoId))
}

function repoRadiusAt(
  state: SimState,
  proj: GraphProjection,
  repoId: number
): number {
  return Math.max(1, valueAt(state.repoR, repoId) * proj.repoRadiusScale)
}

function sortLiveFilesByHeat(
  ids: Int32Array,
  count: number,
  limit: number,
  state: SimState
): void {
  const selected = Math.min(count, limit)
  if (selected < 2) return
  buildWorstHeap(ids, selected, state)
  for (let index = selected; index < count; index += 1) {
    const candidate = valueAt(ids, index)
    if (compareHeat(state, candidate, valueAt(ids, 0)) >= 0) continue
    ids[0] = candidate
    siftWorstDown(ids, 0, selected, state)
  }
  for (let end = selected - 1; end > 0; end -= 1) {
    swap(ids, 0, end)
    siftWorstDown(ids, 0, end, state)
  }
}

function buildWorstHeap(
  ids: Int32Array,
  length: number,
  state: SimState
): void {
  for (let parent = Math.floor(length / 2) - 1; parent >= 0; parent -= 1) {
    siftWorstDown(ids, parent, length, state)
  }
}

function siftWorstDown(
  ids: Int32Array,
  parent: number,
  length: number,
  state: SimState
): void {
  let cursor = parent
  while (true) {
    const left = cursor * 2 + 1
    if (left >= length) return
    const right = left + 1
    let worst = left
    if (
      right < length &&
      compareHeat(state, valueAt(ids, right), valueAt(ids, left)) > 0
    )
      worst = right
    if (compareHeat(state, valueAt(ids, worst), valueAt(ids, cursor)) <= 0)
      return
    swap(ids, cursor, worst)
    cursor = worst
  }
}

function swap(ids: Int32Array, left: number, right: number): void {
  const value = valueAt(ids, left)
  ids[left] = valueAt(ids, right)
  ids[right] = value
}

function compareHeat(state: SimState, left: number, right: number): number {
  const difference = valueAt(state.heat, right) - valueAt(state.heat, left)
  return difference === 0 ? left - right : difference
}

function isSelectedRepo(
  state: SimState,
  repoId: number,
  budget: number
): boolean {
  if (state.repoCount <= budget) return true
  let newer = 0
  const death = valueAt(state.death, repoId)
  for (let candidate = 0; candidate < state.repoCount; candidate += 1) {
    const candidateDeath = valueAt(state.death, candidate)
    if (
      candidateDeath > death ||
      (candidateDeath === death && candidate < repoId)
    )
      newer += 1
  }
  return newer < budget
}

function repositoryLevelColor(
  theme: RenderTheme,
  state: SimState,
  repoId: number
): string {
  const level = Math.min(
    7,
    Math.max(2, Math.round(valueAt(state.repoR, repoId)))
  )
  return theme.lv[level] ?? theme.token.green
}

function actorStroke(theme: RenderTheme, actor: 0 | 1 | 2): string {
  if (actor === 1) return theme.token.purpleD
  if (actor === 2) return theme.token.yellowD
  return theme.token.aquaD
}

function beamColor(theme: RenderTheme, kind: number): string {
  switch (positiveModulo(kind, 4)) {
    case 1:
      return theme.token.purple
    case 2:
      return theme.token.yellow
    case 3:
      return theme.token.blue
    default:
      return theme.token.aqua
  }
}

function hasPrivateRepository(meta: RenderMeta): boolean {
  return meta.repos.some((repo) => repo.isPrivate)
}

function clusterKey(view: RenderView, state: SimState, sizePx: number): string {
  return [
    sizePx,
    view.quality.clusterMode,
    view.theme.token.bg2,
    view.theme.token.bg3,
    state.dayCount,
    state.repoCount,
  ].join(':')
}

function labelOffset(sine: number): number {
  if (sine > 0.3) return 12
  return sine < -0.3 ? -4 : 4
}

function starLabel(stars: number): string {
  if (stars >= 1000) return `★ ${(stars / 1000).toFixed(1)}k`
  return `★ ${Math.floor(stars)}`
}

function valueAt(values: ArrayLike<number>, index: number): number {
  const value = values[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value))
}
