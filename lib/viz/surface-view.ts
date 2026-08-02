import { AG, LV, PANE_SURFACE } from './tokens/ramp'
import type {
  FrameBudget,
  Quality,
  RenderMeta,
  RenderTheme,
  RenderView,
  Viewport,
} from './render/budget'
import type { VizCanvasId, VizViewport } from './driver'
import type { VizSurfaceGeometry } from './surfaces'

const FALLBACK_VIEWPORT: VizViewport = { cssWidth: 1, cssHeight: 1, dpr: 1 }
const FALLBACK_FONT = { micro: 10, small: 12, mono: 14 }
const FALLBACK_FONT_FAMILY = 'monospace'

/** Stores consumer geometry and creates the matching renderer view. */
export interface VizSurfaceViews {
  setViewport(id: VizCanvasId, viewport: VizViewport): void
  setGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void
  delete(id: VizCanvasId): void
  build(
    id: VizCanvasId,
    quality: Quality,
    meta: RenderMeta,
    budget: FrameBudget,
    focusedDay: number
  ): RenderView
}

/** Creates the surface-owned geometry store used by driver painters. */
export function createVizSurfaceViews(): VizSurfaceViews {
  const viewports = new Map<VizCanvasId, VizViewport>()
  const geometries = new Map<VizCanvasId, VizSurfaceGeometry>()

  function setViewport(id: VizCanvasId, viewport: VizViewport): void {
    viewports.set(id, viewport)
    geometries.delete(id)
  }
  function setGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void {
    viewports.set(id, geometry)
    geometries.set(id, geometry)
  }
  function remove(id: VizCanvasId): void {
    viewports.delete(id)
    geometries.delete(id)
  }
  function build(
    id: VizCanvasId,
    quality: Quality,
    meta: RenderMeta,
    budget: FrameBudget,
    focusedDay: number
  ): RenderView {
    const geometry = geometries.get(id)
    const viewport = geometry ?? viewports.get(id) ?? FALLBACK_VIEWPORT
    return {
      viewport: renderViewport(viewport, geometry),
      theme: surfaceTheme(geometry),
      quality,
      meta,
      budget,
      focusedDay,
    }
  }
  return { setViewport, setGeometry, delete: remove, build }
}

function renderViewport(
  viewport: VizViewport,
  geometry: VizSurfaceGeometry | undefined
): Viewport {
  return {
    ...viewport,
    pxWidth:
      geometry?.deviceWidth ??
      Math.max(1, Math.round(viewport.cssWidth * viewport.dpr)),
    pxHeight:
      geometry?.deviceHeight ??
      Math.max(1, Math.round(viewport.cssHeight * viewport.dpr)),
  }
}

function surfaceTheme(geometry: VizSurfaceGeometry | undefined): RenderTheme {
  return {
    lv: LV,
    ag: AG,
    paneSurface: PANE_SURFACE,
    token: {
      bgH: PANE_SURFACE,
      bg0: LV[0],
      bg1: LV[1],
      bg2: LV[2],
      bg3: LV[3],
      bg4: LV[4],
      fg0: LV[9],
      fg1: LV[8],
      fg2: LV[7],
      fg3: LV[6],
      fg4: LV[5],
      gray: LV[4],
      green: LV[8],
      greenD: LV[6],
      aqua: AG[8],
      aquaD: AG[6],
      purple: AG[7],
      purpleD: AG[5],
      yellow: LV[9],
      yellowD: LV[7],
      red: AG[8],
      blue: AG[7],
    },
    fontPx: geometry?.font ?? FALLBACK_FONT,
    fontFamily: FALLBACK_FONT_FAMILY,
  }
}
