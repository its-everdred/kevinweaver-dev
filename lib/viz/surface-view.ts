import { AG, LV, PANE_SURFACE } from './tokens/ramp'
import type {
  FrameBudget,
  Quality,
  RenderMeta,
  RenderTheme,
  RenderView,
  TokenName,
  Viewport,
} from './render/budget'
import type { VizCanvasId, VizViewport } from './driver'
import type { VizSurfaceGeometry } from './surfaces'

const FALLBACK_VIEWPORT: VizViewport = { cssWidth: 1, cssHeight: 1, dpr: 1 }
const FALLBACK_FONT = { micro: 10, small: 12, mono: 14 }
const FALLBACK_FONT_FAMILY = 'monospace'
const SURFACE_TOKEN: Readonly<Record<TokenName, string>> = {
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
}

/**
 * @description Stores consumer geometry and creates the matching renderer view.
 */
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

/**
 * @description Creates the surface-owned geometry store used by driver painters.
 * @returns A geometry store that resolves renderer views for attached surfaces.
 */
export function createVizSurfaceViews(): VizSurfaceViews {
  return new SurfaceViews()
}

class SurfaceViews implements VizSurfaceViews {
  readonly #viewports = new Map<VizCanvasId, VizViewport>()
  readonly #geometries = new Map<VizCanvasId, VizSurfaceGeometry>()

  setViewport(id: VizCanvasId, viewport: VizViewport): void {
    const geometry = this.#geometries.get(id)
    if (!geometry) return void this.#viewports.set(id, viewport)
    this.setGeometry(id, resizeGeometry(geometry, viewport))
  }
  setGeometry(id: VizCanvasId, geometry: VizSurfaceGeometry): void {
    this.#viewports.set(id, geometry)
    this.#geometries.set(id, geometry)
  }
  delete(id: VizCanvasId): void {
    this.#viewports.delete(id)
    this.#geometries.delete(id)
  }
  build(
    id: VizCanvasId,
    quality: Quality,
    meta: RenderMeta,
    budget: FrameBudget,
    focusedDay: number
  ): RenderView {
    const geometry = this.#geometries.get(id)
    const viewport = geometry ?? this.#viewports.get(id) ?? FALLBACK_VIEWPORT
    return {
      viewport: renderViewport(viewport, geometry),
      theme: surfaceTheme(geometry, viewport),
      quality,
      meta,
      budget,
      focusedDay,
    }
  }
}

function resizeGeometry(
  geometry: VizSurfaceGeometry,
  viewport: VizViewport
): VizSurfaceGeometry {
  return {
    ...geometry,
    ...viewport,
    deviceWidth: Math.max(1, Math.round(viewport.cssWidth * viewport.dpr)),
    deviceHeight: Math.max(1, Math.round(viewport.cssHeight * viewport.dpr)),
  }
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

function surfaceTheme(
  geometry: VizSurfaceGeometry | undefined,
  viewport: VizViewport
): RenderTheme {
  return {
    lv: LV,
    ag: AG,
    paneSurface: PANE_SURFACE,
    token: SURFACE_TOKEN,
    fontPx: scaleFont(geometry?.font ?? FALLBACK_FONT, viewport.dpr),
    fontFamily: FALLBACK_FONT_FAMILY,
  }
}

function scaleFont(
  font: VizSurfaceGeometry['font'] | typeof FALLBACK_FONT,
  dpr: number
): typeof FALLBACK_FONT {
  return {
    micro: font.micro * dpr,
    small: font.small * dpr,
    mono: font.mono * dpr,
  }
}
